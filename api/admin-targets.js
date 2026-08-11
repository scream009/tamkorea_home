/* eslint-env node */
/**
 * 관리자 메인 — 월별 고객사 목표·실적.
 *
 * 이 화면은 대표·관리자급이 먼저 보는 화면이다. 하는 일은 셋뿐이다.
 *   1) 선택한 달과 앞뒤 달의 계약을 유형별(인플·체험·기자)로 보여준다
 *   2) 목표 수량·예산을 고쳐 쓴다 (원본과 이력을 남긴다)
 *   3) 예약 건의 정산월을 옆 달로 옮긴다
 *
 * ⚠️ (2)와 (3)은 성격이 다르다. 목표 수정은 그 계약 한 줄만 바뀌지만,
 *    정산월 이동은 **양쪽 달의 실적이 동시에 움직인다.** 그래서 (3)은
 *    `정산월` 과 `귀속 정산월` 을 **한 번에** 쓰고, 옮겨갈 계약이 없으면 거부한다.
 *    정산월만 바꾸면 Airtable 자동화(입력 정산월 수식 완성이 트리거)가 다시 돈다는
 *    보장이 없어, 정산월은 7월인데 귀속은 6월에 남는 유령이 생긴다.
 *
 * 게이트는 _admin-auth.js — Campaign_DB 전량을 반환하므로 admin-dashboard 와 같은 등급이다.
 * CORS 헤더는 두지 않는다. 같은 오리진에서만 부른다.
 */

import { blockedByAdminGate, escFormula, adminWho, parseAdminKeys } from './_admin-auth.js';

const KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const API = `https://api.airtable.com/v0/${BASE}`;

const T_CAMPAIGN = 'Campaign_DB';
const T_PROGRESS = '진행_DB_OLD';

const TYPES = ['인플', '체험', '기자'];
/** 유형별 단가 — 합산_목표 수식과 같은 값이어야 화면 계산이 어긋나지 않는다. */
const UNIT = { 인플: 330000, 체험: 50000, 기자: 50000 };

// 구 직함 목록 — 개인 키 도입 전 이력과의 호환용. 화면 드롭다운은 키 아이디를 쓴다.
const EDITORS = ['대표', '이사', '실장', '관리자'];

/** 키 아이디 목록 (GG·QN·AN·LH…) — 있으면 이게 수정자 선택지가 된다 */
function editorIds() {
  return [...new Set(parseAdminKeys().map(([id]) => id))].filter((x) => x && x !== 'admin');
}
/** 수정자 검증 — 키 아이디와 구 직함 둘 다 받는다 (옛 세션 저장값 호환) */
function validEditor(by) {
  const v = String(by || '').trim();
  return (EDITORS.includes(v) || editorIds().includes(v)) ? v : '';
}

const CAMPAIGN_FIELDS = [
  '고객사명', '지점명', '계약월', '계약유형', '비고',
  '총예산', '합산_목표', '합산_실적',
  '인플_목표', '체험_목표', '기자_목표',
  '인플_방문', '체험_방문', '인플_업완', '체험_업완',
  '인플_취소', '체험_취소', '기자_실적',
  '종합마케팅', '추가체험단', '협력사', '협력사토큰', '공유표출',
  '진행_DB_OLD', '목표수정이력', '목표수정자', '목표수정일',
];

const PROGRESS_FIELDS = [
  'Shoot_ID', '예약_ID', '제출상태', '진행상태', '유형',
  '정산월', '예약일시', 'XHS_ID', '대표인플_ID',
];

/* ── 월 계산 ─────────────────────────────────────────────── */
// "2026. 7월" 하나로만 다룬다. 정산월·계약월 두 필드가 같은 표기를 쓴다.
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
  // Asia/Seoul 기준. 서버는 UTC 라 9시간 밀어야 날짜가 맞는다.
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const start = Date.UTC(p.y, p.n - 1, 1);
  const e = Math.floor((now.getTime() - start) / 86400000) + 1;
  return Math.round((Math.min(Math.max(e, 0), days) / days) * 1e4) / 1e4;
}

/* ── Airtable ────────────────────────────────────────────── */
async function at(path, init) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = body?.error?.message || body?.error?.type || `Airtable ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return body;
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

/** 10건씩 끊어 PATCH. Airtable 한도가 10이다. */
async function patchAll(table, records, typecast = false) {
  // typecast=true 는 목표수정자(singleSelect)에 키 아이디(GG 등) 옵션을 자동 생성하기
  // 위해서만 쓴다 — 다른 쓰기는 false 유지 (없는 옵션 오타가 조용히 생기는 걸 막는다).
  for (let i = 0; i < records.length; i += 10) {

    await at(`/${encodeURIComponent(table)}`, {
      method: 'PATCH',
      body: JSON.stringify({ records: records.slice(i, i + 10), typecast }),
    });
  }
}

/* ── 값 꺼내기 ───────────────────────────────────────────── */
function one(v) {
  if (Array.isArray(v)) {
    for (const x of v) { const s = String(x ?? '').trim(); if (s) return s; }
    return '';
  }
  return String(v ?? '').trim();
}
const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);
const storeKey = (client, branch) => `${one(client)} ${one(branch)}`;

/** 예약일시(UTC ISO) → "MM.DD" (한국시각) */
function kstMD(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const k = new Date(t.getTime() + 9 * 3600 * 1000);
  const mm = String(k.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(k.getUTCDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

function nowKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
}

/* ── 조회 ────────────────────────────────────────────────── */
async function buildView(month) {
  const months = [shiftMonth(month, -1), month, shiftMonth(month, 1)].filter(Boolean);
  const monthSet = new Set(months);

  const formula = `OR(${months.map((m) => `{계약월}='${escFormula(m)}'`).join(',')})`;
  const campaigns = await fetchAll(T_CAMPAIGN, { formula, fields: CAMPAIGN_FIELDS });

  // 상세는 계약이 물고 있는 예약만 가져온다. 진행_DB_OLD 전량(2,800+)을 끌면 느리다.
  const wanted = new Set();
  campaigns.forEach((c) => (c.fields['진행_DB_OLD'] || []).forEach((id) => wanted.add(id)));

  const progress = new Map();
  if (wanted.size) {
    // RECORD_ID() OR 체인은 수식 길이 제한에 걸리므로 끊어서 던진다.
    const ids = [...wanted];
    const chunks = [];
    for (let k = 0; k < ids.length; k += 80) chunks.push(ids.slice(k, k + 80));
    // 순차로 돌리면 왕복이 16회라 8초를 넘겨 함수 시간제한에 걸린다.
    // Airtable 은 base 당 초당 5회라 4개씩만 동시에 던진다.
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
    // 계약유형이 비어도 목표·실적·예약·예산 중 하나라도 있으면 실체다 (Owner 확정: 숫자 기준).
    // 계약유형 기준은 "목표만 넣은 계약"과 "껍데기에 실적이 붙은 계약"을 리스팅에서 떨어뜨렸다.
    // 정말 아무 숫자도 없는 완전 껍데기만 숨긴다 (유령 계약 방지는 유지).
    const substance = one(f['계약유형']) || num(f['합산_목표']) || num(f['합산_실적'])
      || num(f['총예산']) || num(f['기자_실적']) || (f['진행_DB_OLD'] || []).length
      || TYPES.some((k) => num(f[`${k}_목표`]) || num(f[`${k}_방문`]) || num(f[`${k}_업완`]));
    if (!substance) return;

    const client = one(f['고객사명']);
    const branch = one(f['지점명']);
    const name = `${client} ${branch}`.trim();
    if (!stores.has(name)) {
      stores.set(name, { n: name, p: one(f['협력사']), m: {} });
    }
    const row = stores.get(name);
    if (!row.p) row.p = one(f['협력사']);

    const det = (f['진행_DB_OLD'] || [])
      .map((id) => (progress.has(id) ? { id, g: progress.get(id) } : null))
      .filter(Boolean)
      .map(({ id, g }) => [
        one(g['Shoot_ID']),
        one(g['예약_ID']),
        one(g['제출상태']),
        one(g['진행상태']),
        one(g['유형']),
        one(g['정산월']),
        kstMD(g['예약일시']),
        one(g['XHS_ID']).slice(0, 24),
        one(g['대표인플_ID']).slice(0, 24),
        id,   // [9] 레코드 ID — 정산월 이동에 쓴다. 화면에는 보이지 않는다.
      ]);

    row.m[mon] = {
      rid: c.id,
      bud: num(f['총예산']),
      tg: num(f['합산_목표']),
      ac: num(f['합산_실적']),
      ct: one(f['계약유형']),
      memo: one(f['비고']),
      jong: f['종합마케팅'] ? 1 : 0,
      add: f['추가체험단'] ? 1 : 0,
      ptk: one(f['협력사토큰']),
      inc: f['공유표출'] ? 1 : 0,
      n: det.length,
      hist: one(f['목표수정이력']).split('\n').filter(Boolean).slice(-1)[0] || '',
      t: {
        인플: [num(f['인플_목표']), num(f['인플_방문']), num(f['인플_업완']), num(f['인플_취소'])],
        체험: [num(f['체험_목표']), num(f['체험_방문']), num(f['체험_업완']), num(f['체험_취소'])],
        기자: [num(f['기자_목표']), num(f['기자_실적']), num(f['기자_실적']), 0],
      },
      d: det,
    };
  });

  // 목표도 실적도 0인 유형은 줄을 만들지 않는다 — 빈 줄이 화면을 흐린다.
  const rows = [...stores.values()];
  rows.forEach((r) => Object.values(r.m).forEach((mm) => {
    TYPES.forEach((k) => { if (!mm.t[k][0] && !mm.t[k][1]) delete mm.t[k]; });
  }));

  const el = {};
  months.forEach((m) => { el[m] = elapsed(m); });
  return { months, el, rows, editors: EDITORS, units: UNIT };
}

/* ── 월별 이력 요약 (고객사 펼침 상단 스트립) ─────────────── */
const SUMMARY_FIELDS = [
  '고객사명', '지점명', '계약월', '계약유형', '총예산', '합산_목표', '합산_실적',
  '인플_목표', '체험_목표', '기자_목표',
  '인플_방문', '체험_방문', '인플_업완', '체험_업완',
  '인플_취소', '체험_취소', '기자_실적', '진행_DB_OLD',
];

async function buildSummary(name) {
  const all = await fetchAll(T_CAMPAIGN, { fields: SUMMARY_FIELDS });
  const byMon = new Map();
  all
    .filter((c) => storeKey(c.fields['고객사명'], c.fields['지점명']) === name)
    .forEach((c) => {
      const f = c.fields;
      const mon = one(f['계약월']);
      if (!parseMonth(mon)) return;
      // 같은 달 중복 레코드(M1971류)는 합산해 한 칸으로 보여준다 —
      // 어느 쪽이 진짜인지 판정은 이 화면의 몫이 아니다.
      const s = byMon.get(mon) || {
        mon, ct: '', bud: 0, tg: 0, ac: 0, n: 0,
        t: { 인플: [0, 0, 0, 0], 체험: [0, 0, 0, 0], 기자: [0, 0, 0, 0] },
      };
      s.ct = s.ct || one(f['계약유형']);
      s.bud += num(f['총예산']);
      s.tg += num(f['합산_목표']);
      s.ac += num(f['합산_실적']);
      s.n += (f['진행_DB_OLD'] || []).length;
      const add = (k, arr) => arr.forEach((v, i) => { s.t[k][i] += v; });
      add('인플', [num(f['인플_목표']), num(f['인플_방문']), num(f['인플_업완']), num(f['인플_취소'])]);
      add('체험', [num(f['체험_목표']), num(f['체험_방문']), num(f['체험_업완']), num(f['체험_취소'])]);
      add('기자', [num(f['기자_목표']), num(f['기자_실적']), num(f['기자_실적']), 0]);
      byMon.set(mon, s);
    });

  const months = [...byMon.values()]
    // 숫자도 예약도 없는 완전 껍데기 달은 제외 (리스팅과 같은 기준)
    .filter((s) => s.ct || s.bud || s.tg || s.ac || s.n
      || TYPES.some((k) => s.t[k][0] || s.t[k][1] || s.t[k][2]))
    .sort((a, b) => {
      const pa = parseMonth(a.mon); const pb = parseMonth(b.mon);
      return (pa.y * 12 + pa.n) - (pb.y * 12 + pb.n);   // 이른 달이 왼쪽 (Owner 지정)
    })
    .slice(-36);   // 전체를 준다(화면이 선택월 ±2 창으로 자름) — 폭주만 방지
  return { name, months };
}

/* ── 목표 수정 ───────────────────────────────────────────── */
async function saveTargets(body) {
  const rid = String(body.rid || '');
  if (!/^rec[A-Za-z0-9]{14}$/.test(rid)) throw Object.assign(new Error('계약 레코드가 올바르지 않습니다.'), { status: 400 });
  const by = validEditor(body.by);
  if (!by) throw Object.assign(new Error('수정자를 고르세요.'), { status: 400 });

  const cur = await at(`/${encodeURIComponent(T_CAMPAIGN)}/${rid}`);
  const f = cur.fields || {};
  const patch = {};
  const parts = [];

  TYPES.forEach((k) => {
    const key = `${k}_목표`;
    const v = body.goals?.[k];
    if (v === undefined || v === null || v === '') return;
    const nv = Math.max(0, Math.round(Number(v) || 0));
    if (nv === num(f[key])) return;
    // 원본은 처음 한 번만 박는다. 두 번째 수정에서 덮으면 "원래 얼마였나"를 잃는다.
    if (f[`(원)${key}`] === undefined || f[`(원)${key}`] === null) patch[`(원)${key}`] = num(f[key]);
    patch[key] = nv;
    parts.push(`${k} ${num(f[key])}→${nv}`);
  });

  if (body.budget !== undefined && body.budget !== null && body.budget !== '') {
    const nv = Math.max(0, Math.round(Number(body.budget) || 0));
    if (nv !== num(f['총예산'])) {
      if (f['(원)총예산'] === undefined || f['(원)총예산'] === null) patch['(원)총예산'] = num(f['총예산']);
      patch['총예산'] = nv;
      parts.push(`예산 ${num(f['총예산']).toLocaleString()}→${nv.toLocaleString()}`);
    }
  }

  if (!parts.length) return { ok: true, changed: 0 };

  const memo = String(body.memo || '').trim().slice(0, 200);
  const line = `${nowKST()} ${by} · ${parts.join(', ')}${memo ? ` (${memo})` : ''}`;
  patch['목표수정이력'] = [one(f['목표수정이력']), line].filter(Boolean).join('\n').slice(-4000);
  patch['목표수정자'] = by;
  patch['목표수정일'] = new Date().toISOString();

  // typecast — 목표수정자(singleSelect)에 키 아이디 옵션이 없으면 자동 생성
  await patchAll(T_CAMPAIGN, [{ id: rid, fields: patch }], true);
  return { ok: true, changed: parts.length, line };
}

/* ── 계약 자리 만들기 ────────────────────────────────────── */
/**
 * 앞뒤 달로 예약을 옮기려면 **받아줄 계약이 먼저 있어야 한다.**
 *
 * 새로 만들기 전에 반드시 찾아본다. 석화한우암소생구이 8월처럼
 * **계약유형만 비어 있는 껍데기 레코드가 이미 있는 경우가 있고**,
 * 그걸 못 보고 새로 만들면 같은 달에 계약이 둘이 된다.
 *
 * 매장 연결(업체명)은 이름으로 찾지 않는다. 같은 매장의 다른 달 계약에서
 * 링크를 그대로 복사한다 — 이름 매칭은 공백·표기 차이로 틀린 매장을 물 수 있다.
 */
async function ensureCampaign(body) {
  const name = one(body.name);
  const month = one(body.month);
  if (!name) throw Object.assign(new Error('고객사를 알 수 없습니다.'), { status: 400 });
  if (!parseMonth(month)) throw Object.assign(new Error('월 형식이 올바르지 않습니다.'), { status: 400 });
  const by = validEditor(body.by);
  if (!by) throw Object.assign(new Error('수정자를 고르세요.'), { status: 400 });

  // 같은 매장의 계약 전부 (달 무관) — 껍데기까지 포함해서 본다
  const all = await fetchAll(T_CAMPAIGN, {
    fields: ['고객사명', '지점명', '계약월', '계약유형', '업체명', '목표수정이력'],
  });
  const mine = all.filter((c) => storeKey(c.fields['고객사명'], c.fields['지점명']) === name);
  if (!mine.length) throw Object.assign(new Error(`'${name}' 계약을 찾을 수 없습니다.`), { status: 404 });

  const stamp = nowKST();
  const exist = mine.find((c) => one(c.fields['계약월']) === month);
  if (exist) {
    // 껍데기면 계약유형만 채워 되살린다. 새로 만들면 중복이 된다.
    if (!one(exist.fields['계약유형'])) {
      await patchAll(T_CAMPAIGN, [{
        id: exist.id,
        fields: {
          계약유형: '월계약',
          목표수정이력: [one(exist.fields['목표수정이력']), `${stamp} ${by} · 빈 계약 되살림`]
            .filter(Boolean).join('\n'),
          목표수정자: by,
          목표수정일: new Date().toISOString(),
        },
      }], true);
      return { ok: true, rid: exist.id, mode: 'revived' };
    }
    return { ok: true, rid: exist.id, mode: 'exists' };
  }

  // 업체명 링크를 복사해 온다 — 가장 최근 달 계약을 원본으로 쓴다
  const src = mine.filter((c) => (c.fields['업체명'] || []).length)
    .sort((a, b) => one(b.fields['계약월']).localeCompare(one(a.fields['계약월'])))[0];
  if (!src) throw Object.assign(new Error(`'${name}' 의 업체 연결을 찾을 수 없습니다. Airtable 에서 직접 만들어 주세요.`), { status: 409 });

  const created = await at(`/${encodeURIComponent(T_CAMPAIGN)}`, {
    method: 'POST',
    body: JSON.stringify({
      records: [{
        fields: {
          업체명: src.fields['업체명'],
          계약월: month,
          계약유형: '월계약',
          총예산: 0,
          인플_목표: 0,
          체험_목표: 0,
          기자_목표: 0,
          목표수정이력: `${stamp} ${by} · ${month} 계약 생성 (관리화면)`,
          목표수정자: by,
          목표수정일: new Date().toISOString(),
        },
      }],
      typecast: true,   // 목표수정자 키 아이디 옵션 자동 생성
    }),
  });
  return { ok: true, rid: created.records[0].id, mode: 'created' };
}

/* ── 정산월 이동 ─────────────────────────────────────────── */
async function moveSettlement(body) {
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x) => /^rec[A-Za-z0-9]{14}$/.test(x));
  const to = one(body.to);
  if (!ids.length) throw Object.assign(new Error('옮길 예약이 없습니다.'), { status: 400 });
  if (!parseMonth(to)) throw Object.assign(new Error('옮길 달이 올바르지 않습니다.'), { status: 400 });
  const by = validEditor(body.by);
  if (!by) throw Object.assign(new Error('수정자를 고르세요.'), { status: 400 });

  const f = `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
  const recs = await fetchAll(T_PROGRESS, {
    formula: f,
    fields: PROGRESS_FIELDS.concat(['고객명', '지점명', '(원)정산월', '정산월수정이력']),
  });
  if (recs.length !== ids.length) {
    throw Object.assign(new Error('일부 예약을 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.'), { status: 409 });
  }

  // 옮겨갈 계약을 먼저 전부 확보한다. 하나라도 없으면 **한 건도 쓰지 않는다.**
  // 반쯤 옮기면 어느 달에도 안 잡히는 건이 생긴다.
  const targets = await fetchAll(T_CAMPAIGN, {
    formula: `{계약월}='${escFormula(to)}'`,
    fields: ['고객사명', '지점명', '계약월', '계약유형'],
  });
  const byStore = new Map();
  targets.forEach((c) => {
    if (!one(c.fields['계약유형'])) return;
    byStore.set(storeKey(c.fields['고객사명'], c.fields['지점명']), c.id);
  });

  const jobs = [];
  const missing = [];
  recs.forEach((r) => {
    const g = r.fields;
    const key = storeKey(g['고객명'], g['지점명']);
    const target = byStore.get(key);
    const label = `${one(g['Shoot_ID']) || r.id} (${one(g['고객명'])} ${one(g['지점명'])})`.trim();
    if (!target) { missing.push(label); return; }
    jobs.push({ id: r.id, from: one(g['정산월']), target, orig: g['(원)정산월'], hist: one(g['정산월수정이력']), label });
  });

  if (missing.length) {
    throw Object.assign(
      new Error(`${to} 계약이 없어 옮길 수 없습니다: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` 외 ${missing.length - 5}건` : ''}`),
      { status: 409 },
    );
  }

  const memo = String(body.memo || '').trim().slice(0, 200);
  const stamp = nowKST();
  const patches = jobs
    .filter((j) => j.from !== to)
    .map((j) => {
      const fields = {
        // 둘을 한 번에 쓴다. 정산월만 바꾸면 자동화 재실행이 보장되지 않는다.
        정산월: to,
        '귀속 정산월': [j.target],
        정산월수정이력: [j.hist, `${stamp} ${by} · ${j.from || '(없음)'}→${to}${memo ? ` (${memo})` : ''}`]
          .filter(Boolean).join('\n').slice(-2000),
      };
      if (!j.orig) fields['(원)정산월'] = j.from || undefined;
      if (fields['(원)정산월'] === undefined) delete fields['(원)정산월'];
      return { id: j.id, fields };
    });

  if (!patches.length) return { ok: true, moved: 0 };
  await patchAll(T_PROGRESS, patches);
  return { ok: true, moved: patches.length, to };
}

/* ── 진행상태 변경 ───────────────────────────────────────── */
/**
 * 어드민의 상태 변경은 **DB 정정용**이다 — 카톡 발송·예약입력_DB 캐스케이드를 하지 않는다.
 * 취소·변경을 매장에 통보해야 하는 운영 흐름은 발송큐(봇 경로)가 담당한다(F1 결정).
 * 여기는 실적 정리(노쇼 마킹, 잘못 찍힌 상태 교정)를 위한 것.
 * 이력은 정산월수정이력 필드에 함께 남긴다(전용 필드를 늘리지 않는다 — 내용으로 구분).
 */
const PROGRESS_STATUSES = [
  '예약요청', '예약확정', '긴급예약', '변경요청', '변경확정',
  '촬영완료', '취소_방문자', '취소_고객사', '노쇼',
];

async function changeStatus(body) {
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x) => /^rec[A-Za-z0-9]{14}$/.test(x));
  const to = one(body.to);
  if (!ids.length) throw Object.assign(new Error('바꿀 예약이 없습니다.'), { status: 400 });
  if (!PROGRESS_STATUSES.includes(to)) {
    throw Object.assign(new Error('진행상태 값이 올바르지 않습니다.'), { status: 400 });
  }
  const by = validEditor(body.by);
  if (!by) throw Object.assign(new Error('수정자를 고르세요.'), { status: 400 });

  const f = `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
  const recs = await fetchAll(T_PROGRESS, {
    formula: f, fields: ['진행상태', '정산월수정이력', 'Shoot_ID'],
  });
  if (recs.length !== ids.length) {
    throw Object.assign(new Error('일부 예약을 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.'), { status: 409 });
  }
  const memo = String(body.memo || '').trim().slice(0, 200);
  const stamp = nowKST();
  const patches = recs
    .filter((r) => one(r.fields['진행상태']) !== to)
    .map((r) => ({
      id: r.id,
      fields: {
        진행상태: to,
        정산월수정이력: [one(r.fields['정산월수정이력']),
          `${stamp} ${by} · 상태 ${one(r.fields['진행상태']) || '(없음)'}→${to}${memo ? ` (${memo})` : ''}`]
          .filter(Boolean).join('\n').slice(-2000),
      },
    }));
  if (!patches.length) return { ok: true, changed: 0 };
  // typecast 없이 쓴다 — 상태 옵션은 실존 목록만 허용(오타로 새 옵션이 생기면 봇 판정이 깨진다)
  await patchAll(T_PROGRESS, patches);
  return { ok: true, changed: patches.length, to };
}

/* ── 핸들러 ──────────────────────────────────────────────── */
export default async function handler(req, res) {
  if (blockedByAdminGate(req, res)) return;

  if (!KEY) {
    res.status(503).json({ error: 'Airtable 토큰이 설정되지 않았습니다.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      // 고객사 월별 이력 요약 (펼침 스트립) — ?store=<고객사명 지점명>
      if (req.query.store) {
        res.status(200).json(await buildSummary(one(req.query.store)));
        return;
      }
      const month = one(req.query.month) || fmtMonth(2026, new Date(Date.now() + 9 * 3600 * 1000).getUTCMonth() + 1);
      if (!parseMonth(month)) {
        res.status(400).json({ error: '월 형식이 올바르지 않습니다. 예) 2026. 7월' });
        return;
      }
      // 수정자 = 키 아이디 (개인 키 로그인 도입 후). who 는 지금 로그인한 키의 아이디 —
      // 화면이 수정자 기본값으로 쓴다. 공용키(admin)는 특정인이 아니라 기본값 없이 보낸다.
      const ids = editorIds();
      const who = adminWho(String(req.headers['x-admin-key'] || req.query?.k || ''));
      const view = await buildView(month);
      res.status(200).json({
        ...view,
        editors: ids.length ? ids : EDITORS,
        who: who && who !== 'admin' ? who : '',
        statuses: PROGRESS_STATUSES,   // 상세 리스트의 진행상태 선택지 (단일 정의처)
      });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (body.action === 'targets') { res.status(200).json(await saveTargets(body)); return; }
      if (body.action === 'settle') { res.status(200).json(await moveSettlement(body)); return; }
      if (body.action === 'status') { res.status(200).json(await changeStatus(body)); return; }
      if (body.action === 'ensure') { res.status(200).json(await ensureCampaign(body)); return; }
      res.status(400).json({ error: '알 수 없는 요청입니다.' });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    // 계약월·정산월은 단일선택이라 **없는 달로는 못 쓴다.** Airtable 은 이걸
    // INVALID_MULTIPLE_CHOICE_OPTIONS 로만 알려줘서 원인을 알기 어렵다.
    // 옵션 추가는 API 로 불가능하다(Update Field 는 이름·설명만 받는다) → 사람이 해야 한다.
    const msg = /choice|option/i.test(e.message || '')
      ? `${e.message} — Airtable 의 '계약월'·'정산월' 단일선택에 그 달 항목이 없습니다. 옵션을 먼저 추가해 주세요.`
      : (e.message || '처리 중 오류가 발생했습니다.');
    res.status(e.status || 500).json({ error: msg });
  }
}
