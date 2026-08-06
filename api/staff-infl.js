/* eslint-env node */
/**
 * 인플루언서별 방문·업로드·지연 집계 — 인플 보드의 통계 소스.
 *
 * 고객사 관점의 지연은 진도 보드가 보여주지만, "한 인플이 어느 매장들을 갔고
 * 몇 건을 업로드했고 몇 건이 밀렸는가"는 인플 관점 뒤집기가 필요하다 (Owner 2026-08-06).
 *
 * 창: 정산월 ±1개월 전체 + **과거 월이라도 방문이 지났는데 미제출인 건 전부** —
 * 지연은 월 경계로 잘리면 안 된다 (발송 큐에서 검증된 패턴).
 *
 * 집계 키 = 진행_DB_OLD.XHS_ID_ 링크(참여 인플 레코드). 분할된 건은 인플 1명씩이라
 * 첫 링크가 그 건의 주인이다. 링크가 빈 건은 대표인플로 폴백.
 */

import { staffIdentity } from './_staff-auth.js';
import { escFormula } from './_admin-auth.js';

const KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const API = `https://api.airtable.com/v0/${BASE}`;

const T_PROGRESS = '진행_DB_OLD';

const PROGRESS_FIELDS = [
  'XHS_ID_', 'XHS_ID', '대표인플', '대표인플_ID',
  '고객명', '지점명', '정산월', '예약일시', '제출상태', '진행상태',
  'XHS_Result', 'DP_Result', 'DY_Result', '예약_ID', '유형',
];

const UPLOAD_GRACE_DAYS = 7;   // 진도 보드와 동일 기준

/* ── 월 ── */
function fmtMonth(y, n) {
  let yy = y; let nn = n;
  while (nn < 1) { nn += 12; yy -= 1; }
  while (nn > 12) { nn -= 12; yy += 1; }
  return `${yy}. ${nn}월`;
}
function currentMonths3() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const y = k.getUTCFullYear();
  const n = k.getUTCMonth() + 1;
  return [fmtMonth(y, n - 1), fmtMonth(y, n), fmtMonth(y, n + 1)];
}

/* ── 날짜 ── */
function dayNum(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((t + 9 * 3600 * 1000) / 86400000);
}
const todayNum = () => Math.floor((Date.now() + 9 * 3600 * 1000) / 86400000);

function kstMD(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const k = new Date(t.getTime() + 9 * 3600 * 1000);
  return `${String(k.getUTCMonth() + 1).padStart(2, '0')}.${String(k.getUTCDate()).padStart(2, '0')}`;
}

/* ── Airtable ── */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function at(path, init) {
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

/* ── 집계 ── */
async function buildInflStats() {
  const win = currentMonths3();   // [전월, 당월, 익월]

  // 창 3개월 + (미제출 & 방문 경과)는 월 무관 전부
  const formula = `OR(${win.map((m) => `{정산월}='${escFormula(m)}'`).join(',')},`
    + `AND(NOT(FIND('제출완료',{제출상태}&'')),IS_BEFORE({예약일시},NOW())))`;
  const recs = await fetchAll(T_PROGRESS, { formula, fields: PROGRESS_FIELDS });

  const today = todayNum();
  const map = new Map();   // inflRecId → row

  recs.forEach((r) => {
    const f = r.fields;
    const st = one(f['진행상태']);
    if (st.includes('취소') || st.includes('노쇼')) return;   // 실적도 지연도 아님

    const inflId = (f['XHS_ID_'] || [])[0] || (f['대표인플'] || [])[0] || '';
    if (!inflId) return;
    const xid = one(f['XHS_ID']) || one(f['대표인플_ID']);

    const visit = dayNum(f['예약일시']);
    const visited = visit !== null && visit <= today;
    const submitted = String(f['제출상태'] || '').includes('제출완료')
      || String(f['제출상태'] || '').includes('✅')
      || st.includes('업로드완료') || st.includes('송부완료');
    // dl = 기한까지 남은 날 (음수=지연). 방문 전이거나 제출됐으면 null
    const dl = (visited && !submitted) ? (visit + UPLOAD_GRACE_DAYS - today) : null;

    if (!map.has(inflId)) {
      map.set(inflId, {
        id: inflId, xid, visits: 0, uploads: 0, pend: 0, late: 0, maxLate: 0, d: [],
      });
    }
    const row = map.get(inflId);
    if (!row.xid && xid) row.xid = xid;

    if (visited) {
      row.visits += 1;
      if (submitted) row.uploads += 1;
      else {
        row.pend += 1;
        if (dl !== null && dl < 0) {
          row.late += 1;
          row.maxLate = Math.max(row.maxLate, -dl);
        }
      }
    }

    row.d.push({
      store: `${one(f['고객명'])} ${one(f['지점명'])}`.trim(),
      mon: one(f['정산월']),
      mgr: one(f['예약_ID']),
      ty: one(f['유형']),
      st,
      visit: kstMD(f['예약일시']),
      visitRaw: f['예약일시'] || '',
      submitted: submitted ? 1 : 0,
      dl,
      rx: one(f['XHS_Result']),
      rd: one(f['DP_Result']),
      ry: one(f['DY_Result']),
    });
  });

  const rows = [...map.values()];
  rows.forEach((row) => {
    row.d.sort((a, b) => String(b.visitRaw).localeCompare(String(a.visitRaw)));
    row.d = row.d.slice(0, 50);   // 한 인플 상세는 최근 50건이면 충분
  });

  return { months: win, rows };
}

/* ── 핸들러 ── */
export default async function handler(req, res) {
  const who = staffIdentity(req, res);
  if (!who) return;
  if (!KEY) {
    res.status(503).json({ error: 'Airtable 토큰이 설정되지 않았습니다.' });
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  try {
    res.status(200).json({ ...(await buildInflStats()), who });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || '처리 중 오류가 발생했습니다.' });
  }
}
