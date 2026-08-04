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
 *   기한 = 제출마감일, 없으면 방문일 + 7일. dl = 기한까지 남은 날 수(음수 = 지연).
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

const TYPES = ['인플', '체험', '기자'];

const CAMPAIGN_FIELDS = [
  '고객사명', '지점명', '계약월', '계약유형', '비고',
  '인플_목표', '체험_목표', '기자_목표',
  '인플_방문', '체험_방문', '인플_업완', '체험_업완',
  '인플_취소', '체험_취소', '기자_실적',
  '협력사', '진행_DB_OLD',
];

// ⚠️ 필드명 공백 함정: 이 테이블에는 '입력 정산월'·'귀속 정산월'처럼 공백 있는
//    필드가 있다. 여기 목록은 전부 실측 스키마(_raw_schema.json) 기준.
const PROGRESS_FIELDS = [
  'Shoot_ID', '예약_ID', '제출상태', '진행상태', '유형',
  '정산월', '예약일시', 'XHS_ID', '대표인플_ID', '제출마감일',
];

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

/* ── 값 꺼내기 ───────────────────────────────────────────── */
function one(v) {
  if (Array.isArray(v)) {
    for (const x of v) { const s = String(x ?? '').trim(); if (s) return s; }
    return '';
  }
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

  const deadline = dayNum(g['제출마감일'], false) ?? (visit + 7);
  return { dl: deadline - today };                    // 음수 = 지연 일수
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
    // 계약유형이 비면 껍데기다. 화면에 띄우면 유령 계약이 실적처럼 보인다.
    if (!one(f['계약유형'])) return;

    const client = one(f['고객사명']);
    const branch = one(f['지점명']);
    const name = `${client} ${branch}`.trim();
    if (!stores.has(name)) {
      stores.set(name, { n: name, p: one(f['협력사']), m: {} });
    }
    const row = stores.get(name);
    if (!row.p) row.p = one(f['협력사']);

    let late = 0;
    let pend = 0;
    const det = (f['진행_DB_OLD'] || [])
      .map((id) => (progress.has(id) ? { id, g: progress.get(id) } : null))
      .filter(Boolean)
      .map(({ id, g }) => {
        const pi = pendInfo(g, today);
        if (pi) { pend += 1; if (pi.dl < 0) late += 1; }
        return [
          one(g['Shoot_ID']),
          one(g['예약_ID']),
          one(g['제출상태']),
          one(g['진행상태']),
          one(g['유형']),
          one(g['정산월']),
          kstMD(g['예약일시']),
          one(g['XHS_ID']).slice(0, 24) || one(g['대표인플_ID']).slice(0, 24),
          pi ? pi.dl : null,   // [8] 기한까지 남은 날 (음수=지연, null=대기 아님)
          id,                  // [9] 레코드 ID — Phase 3 액션에 쓴다
        ];
      });

    row.m[mon] = {
      ct: one(f['계약유형']),
      memo: one(f['비고']),
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

  // 목표도 실적도 0인 유형은 줄을 만들지 않는다 — 빈 줄이 화면을 흐린다.
  const rows = [...stores.values()];
  rows.forEach((r) => Object.values(r.m).forEach((mm) => {
    TYPES.forEach((k) => { if (!mm.t[k][0] && !mm.t[k][1]) delete mm.t[k]; });
  }));

  const el = {};
  months.forEach((m) => { el[m] = elapsed(m); });
  return { months, el, rows };
}

/* ── 핸들러 ──────────────────────────────────────────────── */
export default async function handler(req, res) {
  const who = staffIdentity(req, res);
  if (!who) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (!KEY) {
    res.status(503).json({ error: 'Airtable 토큰이 설정되지 않았습니다.' });
    return;
  }

  try {
    const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
    const month = one(req.query.month)
      || fmtMonth(kstNow.getUTCFullYear(), kstNow.getUTCMonth() + 1);
    if (!parseMonth(month)) {
      res.status(400).json({ error: '월 형식이 올바르지 않습니다. 예) 2026. 7월' });
      return;
    }
    const board = await buildBoard(month);
    res.status(200).json({ ...board, who });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || '처리 중 오류가 발생했습니다.' });
  }
}
