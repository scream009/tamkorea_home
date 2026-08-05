/* eslint-env node */
/**
 * 담당자 예약입력 — Phase 2.
 *
 * ⚠️ 쓰기는 **예약입력_DB 한 곳뿐이다.** 진행_DB_OLD 에 직접 만들지 않는다.
 *    예약입력_DB 에 팀 단위 1건을 만들면 Airtable 자동화가 팀명생성기 키를 만들고
 *    Repeating Group 으로 참여 인플 수만큼 진행_DB_OLD 에 쪼개 넣는다.
 *    예약봇 V7(카톡 발송·상태 캐스케이드)도 그 키로 돈다 — 이 경로를 벗어나면 전부 깨진다.
 *
 * GET  ?mode=meta          → 매장 목록(CS_DB) + 인플 목록(INFL_DB) + 선택지
 * GET  ?store=rec…&month=  → 매장 정보(운영·제공내역·촬영대본) + 3개월 체험 목표·실적 가드
 * POST {action:'create'}   → 검증 후 예약입력_DB 생성
 *
 * 정산월 가드(서버 몫): 그 매장×정산월 Campaign 이 없으면 거부한다.
 * 없이 만들면 자동화의 Find records 가 빈손이 되어 귀속 정산월이 비는 유령이 생긴다.
 * (앞 달 미달·목표 초과 경고는 클라이언트가 confirm 으로 처리한다.)
 */

import { staffIdentity } from './_staff-auth.js';

const KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const API = `https://api.airtable.com/v0/${BASE}`;

const T_STORE = 'CS_DB';
const T_INFL = 'INFL_DB';
const T_ENTRY = '예약입력_DB';
const T_CAMPAIGN = 'Campaign_DB';

const MGRS = ['HH', 'LH', 'AN', 'FB'];
const TYPES_NEW = ['체험', '인플', '기자'];
const STATUS_NEW = ['예약요청', '예약확정', '긴급예약'];

/* ── 월 헬퍼 ── */
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
function currentMonth() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return fmtMonth(k.getUTCFullYear(), k.getUTCMonth() + 1);
}

/* ── Airtable ── */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function at(path, init) {
  // 429 는 미실행 응답 → 쓰기여도 재시도 안전. 5xx 는 GET 만 재시도 (create 중복 방지).
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
      await sleep(400 * 2 ** attempt + Math.random() * 200);
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

function one(v) {
  if (Array.isArray(v)) {
    for (const x of v) { const s = String(x ?? '').trim(); if (s) return s; }
    return '';
  }
  return String(v ?? '').trim();
}
function all(v) {
  if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean).join(', ');
  return String(v ?? '').trim();
}
const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);
const isRec = (v) => /^rec[A-Za-z0-9]{14}$/.test(String(v || ''));

/* ── meta: 매장·인플 목록 ─────────────────────────────────── */
async function buildMeta() {
  const [storeRecs, inflRecs] = await Promise.all([
    fetchAll(T_STORE, {
      fields: ['고객사명(필수)', '지점명(필수)', '중문명', '사용여부'],
    }),
    fetchAll(T_INFL, {
      fields: ['XHS_ID(필수)', 'WC_ID', 'PAL(필수)'],
    }),
  ]);

  const stores = storeRecs
    .map((r) => ({
      id: r.id,
      name: `${one(r.fields['고객사명(필수)'])} ${one(r.fields['지점명(필수)'])}`.trim(),
      cn: one(r.fields['중문명']),
      use: r.fields['사용여부'] ? 1 : 0,
    }))
    .filter((s) => s.name)
    // 사용 매장 먼저, 그 안에서 이름순 — 미사용도 내려보낸다 (숨기면 또 "안 나온다"가 된다)
    .sort((a, b) => (b.use - a.use) || a.name.localeCompare(b.name, 'ko'));

  const infls = inflRecs
    .map((r) => ({
      id: r.id,
      xid: one(r.fields['XHS_ID(필수)']),
      wc: one(r.fields['WC_ID']),
      pal: num(r.fields['PAL(필수)']),
    }))
    .filter((i) => i.xid)
    .sort((a, b) => a.xid.localeCompare(b.xid, 'zh'));

  return {
    stores,
    infls,
    options: { mgrs: MGRS, types: TYPES_NEW, statuses: STATUS_NEW },
  };
}

/* ── store: 매장 정보 + 3개월 체험 가드 ───────────────────── */
async function buildStoreGuard(storeId, baseMonth) {
  const store = await at(`/${encodeURIComponent(T_STORE)}/${storeId}`);
  const g = store.fields || {};

  const months = [shiftMonth(baseMonth, -1), baseMonth, shiftMonth(baseMonth, 1)];

  // 조인은 **Campaign_DB 의 정방향 업체명 링크**로 한다.
  // 처음엔 CS_DB 역링크(Campaign_DB·Campain_DB)를 썼는데, 실측 결과 역링크가 빈 매장이
  // 있었다(우도 잠수함 성산·서귀포유람선 등 5곳) — 그 매장은 계약이 있어도 전부
  // "계약 없음"으로 보였다. 정방향 업체명은 8월 98건 전부 채워져 있다 (2026-08-05 실측).
  const campaigns = await fetchAll(T_CAMPAIGN, {
    formula: `OR(${months.map((m) => `{계약월}='${m}'`).join(',')})`,
    fields: ['계약월', '업체명', '체험_목표', '체험_방문', '체험_업완', '체험_취소', '추가체험단'],
  });

  const byMonth = {};
  campaigns.forEach((r) => {
    const f = r.fields;
    if (!(f['업체명'] || []).includes(storeId)) return;
    const mon = one(f['계약월']);
    byMonth[mon] = {
      exists: 1,
      tg: num(f['체험_목표']),
      vis: num(f['체험_방문']),
      up: num(f['체험_업완']),
      cx: num(f['체험_취소']),
      add: f['추가체험단'] ? 1 : 0,
    };
  });

  // 정산월 기본값: 계약이 있는 달 중 목표 미달인 가장 이른 달, 없으면 기준달
  let suggest = baseMonth;
  for (const m of months.slice(0, 2)) {           // 전월·기준달까지만 거슬러 본다
    const c = byMonth[m];
    if (c && c.tg > 0 && c.vis < c.tg) { suggest = m; break; }
  }
  if (!byMonth[suggest]?.exists && byMonth[baseMonth]?.exists) suggest = baseMonth;

  return {
    info: {
      name: `${one(g['고객사명(필수)'])} ${one(g['지점명(필수)'])}`.trim(),
      cn: one(g['중문명']),
      open: one(g['영업시간(필수)']),
      brk: one(g['브레이크타임(필수)']),
      peak: one(g['피크타임']),
      rest: all(g['정기휴무']),
      visitOk: one(g['방문가능시간']),
      give: one(g['제공내역']),
      script: one(g['拍摄剧本']),
      warn: one(g['섭외주의사항']),
      note: one(g['비고']),
    },
    months,
    byMonth,
    suggest,
  };
}

/* ── create: 예약입력_DB 생성 ─────────────────────────────── */
async function createEntry(body) {
  const store = String(body.store || '');
  if (!isRec(store)) throw Object.assign(new Error('매장을 선택하세요.'), { status: 400 });

  const mgr = String(body.mgr || '');
  if (!MGRS.includes(mgr)) throw Object.assign(new Error('담당자(예약_ID)를 선택하세요.'), { status: 400 });

  const type = String(body.type || '');
  if (!TYPES_NEW.includes(type)) throw Object.assign(new Error('유형을 선택하세요.'), { status: 400 });

  const status = String(body.status || '');
  if (!STATUS_NEW.includes(status)) throw Object.assign(new Error('진행상태가 올바르지 않습니다.'), { status: 400 });

  const month = String(body.month || '');
  if (!parseMonth(month)) throw Object.assign(new Error('정산월 형식이 올바르지 않습니다.'), { status: 400 });

  // 예약일시 — 클라이언트는 KST 로컬("2026-08-07T15:00")로 보낸다
  const when = String(body.when || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) {
    throw Object.assign(new Error('예약일시를 입력하세요.'), { status: 400 });
  }
  const whenIso = new Date(`${when}:00+09:00`).toISOString();

  const pax = Math.round(Number(body.pax) || 0);
  if (pax < 1 || pax > 99) throw Object.assign(new Error('총인원은 1 이상이어야 합니다.'), { status: 400 });

  const infls = (Array.isArray(body.infls) ? body.infls : []).filter(isRec);
  if (!infls.length) {
    // Repeating Group 자동화가 이 배열을 돌며 진행_DB_OLD 를 만든다 — 비면 쪼개기가 안 된다
    throw Object.assign(new Error('참여 인플루언서를 1명 이상 선택하세요.'), { status: 400 });
  }
  const lead = isRec(body.lead) ? String(body.lead) : infls[0];

  const nx = Math.max(0, Math.round(Number(body.nx) || 0));
  const nd = Math.max(0, Math.round(Number(body.nd) || 0));

  // ── 중복 가드: 같은 매장 · 같은 날(KST) · 같은 인플이 겹치는 예약이 이미 있으면 거부 ──
  // 복사 기능으로 같은 내용을 그대로 재접수 → 고객사에 중복 발송되는 사고 방지 (Owner 2026-08-05).
  // force=true(클라이언트 확인창 통과)면 건너뛴다. 취소·노쇼 건은 중복으로 안 본다.
  if (!body.force) {
    const day = when.slice(0, 10);
    const startIso = new Date(new Date(`${day}T00:00:00+09:00`).getTime() - 1000).toISOString();
    const endIso = new Date(`${day}T23:59:59+09:00`).toISOString();
    const sameDay = await fetchAll(T_ENTRY, {
      formula: `AND(IS_AFTER({예약일시},DATETIME_PARSE('${startIso}')),IS_BEFORE({예약일시},DATETIME_PARSE('${endIso}')))`,
      fields: ['매장코드', 'XHS_ID_', 'Shoot_ID', '진행상태'],
    });
    const inflSet = new Set(infls);
    const hit = sameDay.find((r) => {
      const g2 = r.fields;
      if (!(g2['매장코드'] || []).includes(store)) return false;
      const st2 = one(g2['진행상태']);
      if (st2.includes('취소') || st2.includes('노쇼')) return false;
      return (g2['XHS_ID_'] || []).some((iid) => inflSet.has(iid));
    });
    if (hit) {
      throw Object.assign(
        new Error(`같은 매장·같은 날짜(${day})에 같은 인플이 포함된 예약이 이미 있습니다 `
          + `(${one(hit.fields['Shoot_ID']) || hit.id} · ${one(hit.fields['진행상태'])}). 중복 발송 위험!`),
        { status: 409, dupResv: 1 },
      );
    }
  }

  // ── 정산월 가드: 그 매장×정산월 계약이 있어야 한다 ──
  const guard = await buildStoreGuard(store, month);
  if (!guard.byMonth[month]?.exists) {
    throw Object.assign(
      new Error(`'${guard.info.name}' 의 ${month} 계약이 없습니다. 관리자 화면(/admin)에서 계약을 먼저 만들어 주세요.`),
      { status: 409 },
    );
  }

  const fields = {
    매장코드: [store],
    예약_ID: mgr,
    유형: type,
    진행상태: status,
    정산월: month,
    예약일시: whenIso,
    총인원: pax,
    'XHS_건수': nx,
    'DP_건수': nd,
    대표인플: [lead],
    'XHS_ID_': infls,
  };
  const paxMemo = String(body.paxMemo || '').trim().slice(0, 200);
  if (paxMemo) fields['인원메모'] = paxMemo;
  const clientMemo = String(body.clientMemo || '').trim().slice(0, 1000);
  if (clientMemo) fields['고객전달메모'] = clientMemo;
  // 서귀포잠수함처럼 동행자 영문이름이 필수인 매장이 있다 — 양식 "Abc + Def + Ghi"
  const engNames = String(body.engNames || '').trim().slice(0, 500);
  if (engNames) fields['영문이름'] = engNames;
  const note = String(body.note || '').trim().slice(0, 300);
  if (note) fields['비고'] = note;

  const created = await at(`/${encodeURIComponent(T_ENTRY)}`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });

  return { ok: true, id: created.records[0].id, month, store: guard.info.name };
}

/* ── 신규 인플 등록 — 예약입력 중 미등록 인플을 그 자리에서 만든다 ──
   Softr ④신규인플 폼과 같은 대상(INFL_DB). XHS_ID 중복은 거부한다 (마스터 중복 방지). */
async function createInfl(body) {
  const xid = String(body.xid || '').trim().slice(0, 100);
  if (!xid) throw Object.assign(new Error('小红书账号(XHS_ID)을 입력하세요.'), { status: 400 });

  const mgr = String(body.mgr || '');
  if (!MGRS.includes(mgr)) throw Object.assign(new Error('섭외_ID를 선택하세요.'), { status: 400 });

  const link = String(body.link || '').trim().slice(0, 500);
  if (!/^https?:\/\//.test(link)) {
    throw Object.assign(new Error('小红书链接은 http(s):// 로 시작해야 합니다.'), { status: 400 });
  }
  const pal = Math.max(0, Math.round(Number(body.pal) || 0));
  if (!pal) throw Object.assign(new Error('小红书粉丝(팔로워 수)를 입력하세요.'), { status: 400 });

  // 중복 방지 — 같은 XHS_ID 가 이미 있으면 그 레코드를 알려준다
  const dup = await fetchAll(T_INFL, {
    formula: `{XHS_ID(필수)}='${xid.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`,
    fields: ['XHS_ID(필수)'],
  });
  if (dup.length) {
    throw Object.assign(
      new Error(`'${xid}' 는 이미 등록된 인플루언서입니다. 검색해서 선택하세요.`),
      { status: 409, dupId: dup[0].id },
    );
  }

  const fields = {
    'XHS_ID(필수)': xid,
    '섭외_ID(필수)': mgr,
    'XHS_link1(필수)': link,
    'PAL(필수)': pal,
  };
  const type = String(body.type || '').trim();
  if (type) fields['유형(필수)'] = type;
  const wc = String(body.wc || '').trim().slice(0, 100);
  if (wc) fields['WC_ID'] = wc;
  const phone = String(body.phone || '').trim().slice(0, 50);
  if (phone) fields['연락처'] = phone;
  const nick = String(body.nick || '').trim().slice(0, 100);
  if (nick) fields['닉네임'] = nick;

  const created = await at(`/${encodeURIComponent(T_INFL)}`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });
  const rec = created.records[0];
  return { ok: true, infl: { id: rec.id, xid, wc, pal } };
}

/* ── 기존 인플 정보 갱신 — 중복 등록 시 "수정하시겠습니까" 흐름 ──
   입력한 값으로 기존 레코드를 덮어쓴다 (빈 값은 건드리지 않는다). */
async function updateInfl(body) {
  const id = String(body.id || '');
  if (!isRec(id)) throw Object.assign(new Error('레코드가 올바르지 않습니다.'), { status: 400 });

  const fields = {};
  const link = String(body.link || '').trim().slice(0, 500);
  if (link) {
    if (!/^https?:\/\//.test(link)) {
      throw Object.assign(new Error('小红书链接은 http(s):// 로 시작해야 합니다.'), { status: 400 });
    }
    fields['XHS_link1(필수)'] = link;
  }
  const pal = Math.round(Number(body.pal) || 0);
  if (pal > 0) fields['PAL(필수)'] = pal;
  const mgr = String(body.mgr || '');
  if (MGRS.includes(mgr)) fields['섭외_ID(필수)'] = mgr;
  const type = String(body.type || '').trim();
  if (type) fields['유형(필수)'] = type;
  const wc = String(body.wc || '').trim().slice(0, 100);
  if (wc) fields['WC_ID'] = wc;
  const phone = String(body.phone || '').trim().slice(0, 50);
  if (phone) fields['연락처'] = phone;
  const nick = String(body.nick || '').trim().slice(0, 100);
  if (nick) fields['닉네임'] = nick;

  if (!Object.keys(fields).length) return { ok: true, changed: 0 };

  await at(`/${encodeURIComponent(T_INFL)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields, typecast: false }),
  });
  const rec = await at(`/${encodeURIComponent(T_INFL)}/${id}`);
  return {
    ok: true,
    changed: Object.keys(fields).length,
    infl: {
      id,
      xid: one(rec.fields['XHS_ID(필수)']),
      wc: one(rec.fields['WC_ID']),
      pal: Number(rec.fields['PAL(필수)']) || 0,
    },
  };
}

/* ── 핸들러 ── */
export default async function handler(req, res) {
  const who = staffIdentity(req, res);
  if (!who) return;

  if (!KEY) {
    res.status(503).json({ error: 'Airtable 토큰이 설정되지 않았습니다.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      if (req.query.mode === 'meta') {
        res.status(200).json(await buildMeta());
        return;
      }
      if (req.query.mode === 'infls') {
        // 인플 조회 화면용 확장 목록 (읽기 전용)
        const recs = await fetchAll(T_INFL, {
          fields: ['XHS_ID(필수)', '유형(필수)', '섭외_ID(필수)', 'XHS_link1(필수)',
            'PAL(필수)', 'WC_ID', '연락처', '지역', '닉네임'],
        });
        const infls = recs
          .map((r) => ({
            id: r.id,
            xid: one(r.fields['XHS_ID(필수)']),
            ty: one(r.fields['유형(필수)']),
            mgr: one(r.fields['섭외_ID(필수)']),
            link: one(r.fields['XHS_link1(필수)']),
            pal: num(r.fields['PAL(필수)']),
            wc: one(r.fields['WC_ID']),
            phone: one(r.fields['연락처']),
            region: one(r.fields['지역']),
            nick: one(r.fields['닉네임']),
          }))
          .filter((i) => i.xid)
          .sort((a, b) => b.pal - a.pal);
        res.status(200).json({ infls });
        return;
      }
      const storeId = String(req.query.store || '');
      if (isRec(storeId)) {
        const base = parseMonth(req.query.month) ? String(req.query.month) : currentMonth();
        res.status(200).json(await buildStoreGuard(storeId, base));
        return;
      }
      res.status(400).json({ error: 'mode=meta 또는 store=rec… 가 필요합니다.' });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (body.action === 'create') {
        res.status(200).json(await createEntry(body));
        return;
      }
      if (body.action === 'createInfl') {
        res.status(200).json(await createInfl(body));
        return;
      }
      if (body.action === 'updateInfl') {
        res.status(200).json(await updateInfl(body));
        return;
      }
      res.status(400).json({ error: '알 수 없는 요청입니다.' });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    // 정산월·유형 등 단일선택에 없는 값이면 Airtable 이 choice 오류를 낸다 — 사람 말로 번역
    const msg = /choice|option/i.test(e.message || '')
      ? `${e.message} — Airtable 단일선택(정산월·유형 등)에 해당 항목이 없습니다. Airtable 에서 옵션을 먼저 추가해 주세요.`
      : (e.message || '처리 중 오류가 발생했습니다.');
    // 중복 인플이면 기존 레코드 ID, 중복 예약이면 dupResv 플래그를 같이 준다
    res.status(e.status || 500).json({
      error: msg,
      ...(e.dupId ? { dupId: e.dupId } : {}),
      ...(e.dupResv ? { dupResv: 1 } : {}),
    });
  }
}
