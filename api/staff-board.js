/* eslint-env node */
/**
 * 담당자 진도 보드 — 고객사×월 목표 대비 방문·업로드 현황 + 업로드 지연 큐.
 *
 * 섭외 담당자가 보는 화면이다. 하는 일은 둘뿐이다.
 *   1) 선택한 달과 앞뒤 달의 계약을 고객사별로 보여준다 (목표·방문·업완·취소)
 *   2) 방문은 끝났는데 링크가 안 올라온 건(제출 대기·지연)을 건 단위로 짚어준다
 *
 * admin-targets.js 의 buildView 를 담당자 범위로 좁힌 것이다:
 *   - 돈(총예산·합산_목표·합산_실적)과 목표수정이력·협력사토큰은 내리지 않는다
 *   - 대신 건 단위 제출 대기/지연 계산이 붙는다
 *
 * 지연 판정 (건 단위):
 *   제출 안 됐고, 취소·노쇼·종결이 아니고, 방문일이 지났으면 "제출 대기(pend)".
 *   기한 = 방문일 + 7일 (Owner 확정 2026-08-04: 지연 = 방문 후 7일 초과 미제출.
 *   제출마감일 필드는 쓰지 않는다 — 기준을 하나로 통일). dl = 기한까지 남은 날(음수 = 지연).
 *   2026-08-24: influencer-schedule.js 의 체험 계열 마감도 7일로 맞췄다. 여기 값을 바꾸면
 *   그쪽 deadlineDaysForType() 도 같이 바꿔야 한다 — 안 그러면 인플루언서가 안내받은 마감과
 *   우리가 지연으로 세는 시점이 어긋난다.
 *
 * 게이트는 _staff-auth.js. 조회 전용(GET) — 쓰기는 Phase 2 부터 별도 파일로 만든다.
 * CORS 헤더는 두지 않는다. 같은 오리진에서만 부른다.
 */

import { staffIdentity } from './_staff-auth.js';
import { escFormula } from './_admin-auth.js';

const KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const API = `https://api.airtable.com/v0/${BASE}`;

const T_CAMPAIGN = 'Campaign_DB';
const T_PROGRESS = '진행_DB_OLD';
const T_STORE = 'CS_DB';
const T_ENTRY = '예약입력_DB';
const CANCEL_KINDS = ['취소_방문자', '취소_고객사', '노쇼'];

const TYPES = ['인플', '체험', '기자'];

const CAMPAIGN_FIELDS = [
  '고객사명', '지점명', '계약월', '계약유형', '비고',
  '인플_목표', '체험_목표', '기자_목표',
  '인플_방문', '체험_방문', '인플_업완', '체험_업완',
  '인플_취소', '체험_취소', '기자_실적',
  '협력사', '진행_DB_OLD',
  '업체명',       // → CS_DB 링크. 업체 정보 카드의 조인 키
  '추가체험단',   // 목표량 넘어도 추가 섭외 가능한가
  '확인요망',     // 관리자↔섭외자 소통 — 어드민이 체크하면 보드에 🔔
  '전달사항',     // 〃 (formula, 읽기 전용)
];

// 업체 정보 카드(ⓘ) — 섭외할 때 봐야 하는 것들. CS_DB 필드명에 (필수) 접미가 붙어 있다.
const STORE_FIELDS = [
  '고객사명(필수)', '지점명(필수)', '중문명',
  '영업시간(필수)', '브레이크타임(필수)', '피크타임', '정기휴무', '방문가능시간',
  '제공내역', '섭외주의사항', '비고',
];

// ⚠️ 필드명 공백 함정: 이 테이블에는 '입력 정산월'·'귀속 정산월'·'XHS_link1 (from WC_ID_)'처럼
//    공백 있는 필드가 있다. 여기 목록은 전부 실측 스키마(_raw_schema.json) 기준.
const PROGRESS_FIELDS = [
  'Shoot_ID', '예약_ID', '제출상태', '진행상태', '유형',
  '정산월', '예약일시', '변경일시',
  'XHS_ID', '대표인플_ID', 'XHS_link1 (from WC_ID_)',
  'XHS_Result', 'DP_Result', 'DY_Result',
  '총인원', '변경인원', 'XHS_건수', 'DP_건수',
  '비고', '인플전달링크', '인플전용링크', '拍摄剧本',
  '체크인일시',
  '팀명생성기',   // 취소·노쇼 때 예약입력_DB(팀)를 찾는 키 — 두 테이블의 유일한 연결
];

/** 담당자가 화면에서 고칠 수 있는 유일한 필드 — 메모(비고). 그 외 쓰기는 Phase 3. */
const MEMO_FIELD = '비고';

/** 방문 후 며칠까지 업로드를 기다려주는가 — 넘기면 지연 */
const UPLOAD_GRACE_DAYS = 7;

/* ── 월 계산 — admin-targets.js 와 같은 표기("2026. 7월")를 쓴다 ── */
const MONTH_RE = /^(\d{4})\.\s*(\d{1,2})월$/;

function parseMonth(v) {
  const m = MONTH_RE.exec(String(v || '').trim());
  return m ? { y: Number(m[1]), n: Number(m[2]) } : null;
}
function fmtMonth(y, n) {
  let yy = y; let nn = n;
  while (nn < 1) { nn += 12; yy -= 1; }
  while (nn > 12) { nn -= 12; yy += 1; }
  return `${yy}. ${nn}월`;
}
function shiftMonth(v, d) {
  const p = parseMonth(v);
  return p ? fmtMonth(p.y, p.n + d) : '';
}
/** 그 달이 얼마나 지났는지 (0~1). 진도율 색의 기준선이 된다. */
function elapsed(v) {
  const p = parseMonth(v);
  if (!p) return 1;
  const days = new Date(p.y, p.n, 0).getDate();
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const start = Date.UTC(p.y, p.n - 1, 1);
  const e = Math.floor((now.getTime() - start) / 86400000) + 1;
  return Math.round((Math.min(Math.max(e, 0), days) / days) * 1e4) / 1e4;
}

/* ── 날짜 → 일수 (지연 계산용) ─────────────────────────────
   date-only("2026-03-20")는 그대로, datetime(ISO)은 KST 로 밀어 날짜를 맞춘다. */
function dayNum(v, isDateTime) {
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return Math.floor((t + (isDateTime ? 9 * 3600 * 1000 : 0)) / 86400000);
}
function todayNum() {
  return Math.floor((Date.now() + 9 * 3600 * 1000) / 86400000);
}

/** UTC ISO → "MM.DD HH:mm" (한국시각) */
function kstDT(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const k = new Date(t.getTime() + 9 * 3600 * 1000);
  const mm = String(k.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(k.getUTCDate()).padStart(2, '0');
  const hh = String(k.getUTCHours()).padStart(2, '0');
  const mi = String(k.getUTCMinutes()).padStart(2, '0');
  return `${mm}.${dd} ${hh}:${mi}`;
}

/* ── Airtable ────────────────────────────────────────────── */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function at(path, init) {
  // 429(rate limit) 방어 — 429는 요청이 실행되지 않은 응답이므로 쓰기여도 재시도가 안전하다.
  // 5xx는 실행 여부가 불명이라 GET 에만 재시도한다 (create/patch 중복 방지).
  const method = String(init?.method || 'GET').toUpperCase();
  for (let attempt = 0; ; attempt += 1) {
    const r = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (r.ok) return r.json().catch(() => ({}));
    const retriable = r.status === 429 || (method === 'GET' && r.status >= 500);
    if (retriable && attempt < 3) {
      await sleep(400 * 2 ** attempt + Math.random() * 200);   // 0.4s→0.8s→1.6s + 지터
      continue;
    }
    const body = await r.json().catch(() => ({}));
    const msg = body?.error?.message || body?.error?.type || `Airtable ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
}

async function fetchAll(table, { formula, fields } = {}) {
  const out = [];
  let offset = '';
  do {
    const p = new URLSearchParams();
    p.set('pageSize', '100');
    if (formula) p.set('filterByFormula', formula);
    (fields || []).forEach((f) => p.append('fields[]', f));
    if (offset) p.set('offset', offset);

    const d = await at(`/${encodeURIComponent(table)}?${p.toString()}`);
    out.push(...(d.records || []));
    offset = d.offset || '';
  } while (offset);
  return out;
}

/* ── 값 꺼내기 ───────────────────────────────────────────── */
function one(v) {
  if (Array.isArray(v)) {
    for (const x of v) { const s = String(x ?? '').trim(); if (s) return s; }
    return '';
  }
  return String(v ?? '').trim();
}
/** 다중선택(정기휴무 등)은 전부 이어붙인다 — one() 은 첫 값만 취해서 못 쓴다 */
function all(v) {
  if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean).join(', ');
  return String(v ?? '').trim();
}
const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);

/* ── 건 단위 제출 대기/지연 판정 ─────────────────────────── */
const FINAL_SKIP = ['취소', '노쇼', '종결'];

function pendInfo(g, today) {
  const submit = String(g['제출상태'] || '');
  if (submit.includes('제출완료') || submit.includes('✅')) return null;
  const st = String(g['진행상태'] || '');
  if (FINAL_SKIP.some((k) => st.includes(k))) return null;

  const visit = dayNum(g['예약일시'], true);
  if (visit === null || visit > today) return null;   // 방문 전이면 대기가 아니다

  return { dl: (visit + UPLOAD_GRACE_DAYS) - today }; // 음수 = 지연 일수
}

/* ── 조회 ────────────────────────────────────────────────── */
async function buildBoard(month) {
  const months = [shiftMonth(month, -1), month, shiftMonth(month, 1)].filter(Boolean);
  const monthSet = new Set(months);
  const today = todayNum();

  const formula = `OR(${months.map((m) => `{계약월}='${escFormula(m)}'`).join(',')})`;
  const campaigns = await fetchAll(T_CAMPAIGN, { formula, fields: CAMPAIGN_FIELDS });

  // 상세는 계약이 물고 있는 예약만 가져온다. 진행_DB_OLD 전량(3,200+)을 끌면 느리다.
  const wanted = new Set();
  campaigns.forEach((c) => (c.fields['진행_DB_OLD'] || []).forEach((id) => wanted.add(id)));

  // 업체 정보(ⓘ 카드) — 계약이 물고 있는 CS_DB 만
  const storeIds = new Set();
  campaigns.forEach((c) => (c.fields['업체명'] || []).forEach((id) => storeIds.add(id)));
  const storeInfo = new Map();
  if (storeIds.size) {
    const ids = [...storeIds];
    for (let k = 0; k < ids.length; k += 80) {
      const chunk = ids.slice(k, k + 80);

      const recs = await fetchAll(T_STORE, {
        formula: `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(',')})`,
        fields: STORE_FIELDS,
      });
      recs.forEach((r) => {
        const g = r.fields;
        storeInfo.set(r.id, {
          sid: r.id,   // CS_DB 레코드 ID — 예약입력(/staff/new?store=…) 진입에 쓴다
          cn: one(g['중문명']),
          open: one(g['영업시간(필수)']),
          brk: one(g['브레이크타임(필수)']),
          peak: one(g['피크타임']),
          rest: all(g['정기휴무']),
          visitOk: one(g['방문가능시간']),
          give: one(g['제공내역']),
          warn: one(g['섭외주의사항']),
          note: one(g['비고']),
        });
      });
    }
  }

  const progress = new Map();
  if (wanted.size) {
    // RECORD_ID() OR 체인은 수식 길이 제한에 걸리므로 끊고,
    // Airtable 은 base 당 초당 5회라 4개씩만 동시에 던진다.
    const ids = [...wanted];
    const chunks = [];
    for (let k = 0; k < ids.length; k += 80) chunks.push(ids.slice(k, k + 80));
    for (let k = 0; k < chunks.length; k += 4) {
      const batch = chunks.slice(k, k + 4).map((c) => fetchAll(T_PROGRESS, {
        formula: `OR(${c.map((id) => `RECORD_ID()='${id}'`).join(',')})`,
        fields: PROGRESS_FIELDS,
      }));

      const got = await Promise.all(batch);
      got.flat().forEach((r) => progress.set(r.id, r.fields));
    }
  }

  const stores = new Map();
  campaigns.forEach((c) => {
    const f = c.fields;
    const mon = one(f['계약월']);
    if (!monthSet.has(mon)) return;
    // 계약유형은 관리자 화면의 관심사다 — 섭외 화면에서는 보지 않는다 (Owner 확정 2026-08-04).
    // 목표·실적 숫자가 하나라도 있으면 살리고, 전부 0인 것만 껍데기로 버린다.
    // (실측: 8월 계약 95개 중 75개가 계약유형 공란, 그중 5개는 체험 실적 보유 —
    //  admin-targets 처럼 유형으로 거르면 살아있는 매장이 사라진다.)
    {
      const nums = ['인플_목표', '체험_목표', '기자_목표', '인플_방문', '체험_방문',
        '인플_업완', '체험_업완', '인플_취소', '체험_취소', '기자_실적'];
      if (!nums.some((k) => num(f[k]) > 0)) return;
    }

    const client = one(f['고객사명']);
    const branch = one(f['지점명']);
    const name = `${client} ${branch}`.trim();
    if (!stores.has(name)) {
      stores.set(name, { n: name, p: one(f['협력사']), m: {}, info: null });
    }
    const row = stores.get(name);
    if (!row.p) row.p = one(f['협력사']);
    if (!row.info) {
      const sid = (f['업체명'] || [])[0];
      row.info = (sid && storeInfo.get(sid)) || null;
    }

    let late = 0;
    let pend = 0;
    const det = (f['진행_DB_OLD'] || [])
      .map((id) => (progress.has(id) ? { id, g: progress.get(id) } : null))
      .filter(Boolean)
      .map(({ id, g }) => {
        const pi = pendInfo(g, today);
        if (pi) { pend += 1; if (pi.dl < 0) late += 1; }
        return {
          id,
          sid: one(g['Shoot_ID']),
          mgr: one(g['예약_ID']),
          sub: one(g['제출상태']),
          st: one(g['진행상태']),
          ty: one(g['유형']),
          mon: one(g['정산월']),
          visit: kstDT(g['예약일시']),
          chg: kstDT(g['변경일시']),
          lead: one(g['대표인플_ID']).slice(0, 24),
          infl: one(g['XHS_ID']).slice(0, 24),
          ilink: one(g['XHS_link1 (from WC_ID_)']),   // 참여 인플의 샤오홍슈 홈
          rx: one(g['XHS_Result']),
          rd: one(g['DP_Result']),
          ry: one(g['DY_Result']),
          pax: g['총인원'] ?? '',
          paxChg: g['변경인원'] ?? '',
          nx: g['XHS_건수'] ?? '',
          nd: g['DP_건수'] ?? '',
          memo: one(g[MEMO_FIELD]),
          team: one(g['팀명생성기']),   // 취소 버튼이 팀(예약입력_DB)을 찾는 데 쓴다
          give: one(g['인플전달링크']) || one(g['인플전용링크']),  // 인플 전달용 제출 링크
          guide: one(g['拍摄剧本']),                               // 촬영 가이드 (CS_DB 룩업)
          dl: pi ? pi.dl : null,   // 기한까지 남은 날 (음수=지연, null=대기 아님)
          checkinTime: kstDT(g['체크인일시']),
        };
      });

    row.m[mon] = {
      ct: one(f['계약유형']),
      memo: one(f['비고']),
      add: f['추가체험단'] ? 1 : 0,   // 목표량 넘어도 추가 섭외 가능
      chk: f['확인요망'] ? 1 : 0,     // 관리자 확인요망
      notice: one(f['전달사항']),     // 관리자 전달사항

      t: {
        인플: [num(f['인플_목표']), num(f['인플_방문']), num(f['인플_업완']), num(f['인플_취소'])],
        체험: [num(f['체험_목표']), num(f['체험_방문']), num(f['체험_업완']), num(f['체험_취소'])],
        기자: [num(f['기자_목표']), num(f['기자_실적']), num(f['기자_실적']), 0],
      },
      d: det,
      pend,
      late,
    };
  });

  // 목표도 실적도 전혀 없는 유형만 줄을 지운다 — 취소·업완만 있는 유형도 실적이다.
  const rows = [...stores.values()];
  rows.forEach((r) => Object.values(r.m).forEach((mm) => {
    TYPES.forEach((k) => {
      const a = mm.t[k];
      if (!a[0] && !a[1] && !a[2] && !a[3]) delete mm.t[k];
    });
  }));

  const el = {};
  months.forEach((m) => { el[m] = elapsed(m); });
  return { months, el, rows };
}

/* ── 핸들러 ──────────────────────────────────────────────── */
export default async function handler(req, res) {
  const who = staffIdentity(req, res);
  if (!who) return;

  if (!KEY) {
    res.status(503).json({ error: 'Airtable 토큰이 설정되지 않았습니다.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
      const month = one(req.query.month)
        || fmtMonth(kstNow.getUTCFullYear(), kstNow.getUTCMonth() + 1);
      if (!parseMonth(month)) {
        res.status(400).json({ error: '월 형식이 올바르지 않습니다. 예) 2026. 7월' });
        return;
      }
      const board = await buildBoard(month);
      res.status(200).json({ ...board, who });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      // 메모(비고)만 고칠 수 있다 — 다른 필드는 받지 않는다.
      if (body.action === 'memo') {
        const id = String(body.id || '');
        if (!/^rec[A-Za-z0-9]{14}$/.test(id)) {
          res.status(400).json({ error: '레코드가 올바르지 않습니다.' });
          return;
        }
        const memo = String(body.memo ?? '').slice(0, 1000);
        await at(`/${encodeURIComponent(T_PROGRESS)}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { [MEMO_FIELD]: memo }, typecast: false }),
        });
        res.status(200).json({ ok: true });
        return;
      }
      /* 취소·노쇼 (Owner 2026-08-21 — Softr 에 있던 버튼 복원).
         ⚠️ 진행_DB_OLD 를 직접 고치지 않는다. F1 정책대로 **예약입력_DB(팀)** 의
         진행상태 + 자동발송체크를 세워 예약봇이 매장에 안내를 보내게 한다.
         봇이 팀명생성기 매칭으로 진행_DB_OLD 까지 캐스케이드한다. */
      if (body.action === 'cancel') {
        const team = String(body.team || '').trim();
        const kind = String(body.kind || '');
        if (!CANCEL_KINDS.includes(kind)) {
          res.status(400).json({ error: '취소 유형은 취소_방문자·취소_고객사·노쇼 중 하나입니다.' });
          return;
        }
        if (!team) {
          res.status(409).json({ error: '이 건은 팀 정보(팀명생성기)가 비어 있어 취소할 수 없습니다. 예약발송 화면에서 처리해 주세요.' });
          return;
        }
        // 팀명생성기 exact 매칭 — 예약봇 캐스케이드와 같은 키
        const found = await at(`/${encodeURIComponent(T_ENTRY)}?filterByFormula=`
          + encodeURIComponent(`{팀명생성기}='${escFormula(team)}'`)
          + '&maxRecords=2&fields%5B%5D=' + encodeURIComponent('진행상태'));
        const recs = found.records || [];
        if (!recs.length) {
          res.status(404).json({ error: '예약입력_DB 에서 이 팀을 찾지 못했습니다. 예약발송 화면에서 처리해 주세요.' });
          return;
        }
        if (recs.length > 1) {
          res.status(409).json({ error: '같은 팀명이 2건 이상입니다. 예약발송 화면에서 확인해 주세요.' });
          return;
        }
        const fields = { 진행상태: kind, 자동발송체크: true };
        const memo = String(body.memo || '').trim().slice(0, 500);
        if (memo) fields['고객전달메모'] = memo;
        await at(`/${encodeURIComponent(T_ENTRY)}/${recs[0].id}`, {
          method: 'PATCH', body: JSON.stringify({ fields, typecast: false }),
        });
        res.status(200).json({ ok: true, entryId: recs[0].id });
        return;
      }

      res.status(400).json({ error: '알 수 없는 요청입니다.' });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || '처리 중 오류가 발생했습니다.' });
  }
}
