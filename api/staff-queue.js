/* eslint-env node */
/**
 * 담당자 업무·발송 큐 — Softr ②업무조회 액션 + ⑥예약 메시지 전송 + ⑦변경 메시지 전송 통합.
 *
 * 대상 테이블은 **예약입력_DB 하나뿐이다** (팀 단위). 진행_DB_OLD 는 예약봇이
 * 팀명생성기 매칭으로 캐스케이드한다 — 여기서 직접 만지지 않는다.
 *
 * 버튼 → 필드 명세는 TK_Resv_V7 README "Softr 모달" 절 그대로:
 *   전송      = 자동발송체크 ON                       (예약요청·긴급예약만)
 *   변경      = 변경일시 + 변경인원 + 진행상태=변경요청 + 자동발송체크
 *   변경확정  = 진행상태=변경확정 + 자동발송체크        (봇이 예약일시←변경일시 정리, 발송 없음)
 *   취소·노쇼 = 진행상태(취소_방문자|취소_고객사|노쇼) + 고객전달메모 + 자동발송체크
 *   삭제      = 예약요청 & 미발송만 (Owner 확정 2026-08-05: 고객에게 나간 적 없으므로 무방)
 *              — 이미 쪼개진 진행_DB_OLD 건도 팀명생성기 매칭으로 같이 지운다 (고아 방지)
 *
 * F1 반영: 취소·노쇼는 이 경로(봇 발송) 하나로 통일한다. 진행_DB_OLD 직접 수정 경로는
 * 웹으로 옮기지 않는다.
 */

import { staffIdentity } from './_staff-auth.js';
import { escFormula } from './_admin-auth.js';

const KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const API = `https://api.airtable.com/v0/${BASE}`;

const T_ENTRY = '예약입력_DB';
const T_PROGRESS = '진행_DB_OLD';

const CANCEL_KINDS = ['취소_방문자', '취소_고객사', '노쇼'];
const SENDABLE = ['예약요청', '긴급예약'];

const ENTRY_FIELDS = [
  'Shoot_ID', '예약_ID', '유형', '진행상태', '정산월',
  '고객명', '지점명', '매장코드_텍스트',
  '예약일시', '변경일시', '총인원', '변경인원', 'XHS_건수', 'DP_건수',
  'XHS_ID', 'WC_ID (from 대표인플)', '인원메모', '고객전달메모', '비고',
  '예약메시지', '변경메시지', '자동발송체크', '팀명생성기', 'Created time',
];

/* ── 월 헬퍼 ── */
const MONTH_RE = /^(\d{4})\.\s*(\d{1,2})월$/;
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

/* ── Airtable ── */
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

function one(v) {
  if (Array.isArray(v)) {
    for (const x of v) { const s = String(x ?? '').trim(); if (s) return s; }
    return '';
  }
  return String(v ?? '').trim();
}
function allJoin(v) {
  if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean).join(', ');
  return String(v ?? '').trim();
}
const isRec = (v) => /^rec[A-Za-z0-9]{14}$/.test(String(v || ''));

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

/* ── 목록 ─────────────────────────────────────────────────── */
async function buildQueue() {
  const months = currentMonths3();
  const formula = `OR(${months.map((m) => `{정산월}='${escFormula(m)}'`).join(',')})`;
  const recs = await fetchAll(T_ENTRY, { formula, fields: ENTRY_FIELDS });

  const items = recs.map((r) => {
    const f = r.fields;
    return {
      id: r.id,
      sid: one(f['Shoot_ID']),
      mgr: one(f['예약_ID']),
      ty: one(f['유형']),
      st: one(f['진행상태']),
      mon: one(f['정산월']),
      store: `${one(f['고객명'])} ${one(f['지점명'])}`.trim() || one(f['매장코드_텍스트']),
      when: kstDT(f['예약일시']),
      chgWhen: kstDT(f['변경일시']),
      pax: f['총인원'] ?? '',
      chgPax: f['변경인원'] ?? '',
      nx: f['XHS_건수'] ?? '',
      nd: f['DP_건수'] ?? '',
      infls: allJoin(f['XHS_ID']).slice(0, 120),
      leadWc: one(f['WC_ID (from 대표인플)']),
      paxMemo: one(f['인원메모']),
      clientMemo: one(f['고객전달메모']),
      note: one(f['비고']),
      msg: String(f['예약메시지'] || ''),
      chgMsg: String(f['변경메시지'] || ''),
      sent: f['자동발송체크'] ? 1 : 0,
      created: f['Created time'] || '',
    };
  });

  // 최근 만든 것 먼저 — 발송 대기는 보통 방금 입력한 건이다
  items.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return { months, items };
}

/* ── 액션 공통 ── */
async function getEntry(id) {
  const r = await at(`/${encodeURIComponent(T_ENTRY)}/${id}`);
  return r.fields || {};
}
async function patchEntry(id, fields) {
  await at(`/${encodeURIComponent(T_ENTRY)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields, typecast: false }),
  });
}

/* 전송 — 자동발송체크만 켠다. 봇이 다음 폴링에서 집어간다. */
async function actSend(body) {
  const id = String(body.id || '');
  if (!isRec(id)) throw Object.assign(new Error('레코드가 올바르지 않습니다.'), { status: 400 });
  const f = await getEntry(id);
  const st = one(f['진행상태']);
  if (!SENDABLE.includes(st)) {
    throw Object.assign(new Error(`'${st}' 상태는 예약 발송 대상이 아닙니다 (예약요청·긴급예약만).`), { status: 409 });
  }
  if (f['자동발송체크']) return { ok: true, already: 1 };
  await patchEntry(id, { 자동발송체크: true });
  return { ok: true };
}

/* 변경 — 변경일시·변경인원 + 상태 변경요청 + 발송 트리거 */
async function actModify(body) {
  const id = String(body.id || '');
  if (!isRec(id)) throw Object.assign(new Error('레코드가 올바르지 않습니다.'), { status: 400 });
  const when = String(body.when || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) {
    // 변경일시 없이 상태만 바꾸면 봇의 Formula 차단(⚠)에 걸린다 — 여기서 먼저 막는다
    throw Object.assign(new Error('변경일시를 입력하세요.'), { status: 400 });
  }
  const fields = {
    변경일시: new Date(`${when}:00+09:00`).toISOString(),
    진행상태: '변경요청',
    자동발송체크: true,
  };
  if (body.pax !== undefined && body.pax !== null && body.pax !== '') {
    fields['변경인원'] = Math.max(1, Math.round(Number(body.pax) || 1));
  }
  const memo = String(body.memo || '').trim().slice(0, 500);
  if (memo) fields['고객전달메모'] = memo;
  await patchEntry(id, fields);
  return { ok: true };
}

/* 변경확정 — 봇이 예약일시←변경일시 이관 + 캐스케이드 (발송 없음) */
async function actConfirmChange(body) {
  const id = String(body.id || '');
  if (!isRec(id)) throw Object.assign(new Error('레코드가 올바르지 않습니다.'), { status: 400 });
  const f = await getEntry(id);
  if (one(f['진행상태']) !== '변경요청') {
    throw Object.assign(new Error('변경요청 상태에서만 변경확정할 수 있습니다.'), { status: 409 });
  }
  await patchEntry(id, { 진행상태: '변경확정', 자동발송체크: true });
  return { ok: true };
}

/* 취소·노쇼 — F1: 이 경로(봇 발송) 하나로 통일 */
async function actCancel(body) {
  const id = String(body.id || '');
  if (!isRec(id)) throw Object.assign(new Error('레코드가 올바르지 않습니다.'), { status: 400 });
  const kind = String(body.kind || '');
  if (!CANCEL_KINDS.includes(kind)) {
    throw Object.assign(new Error('취소 유형은 취소_방문자·취소_고객사·노쇼 중 하나입니다.'), { status: 400 });
  }
  const fields = { 진행상태: kind, 자동발송체크: true };
  const memo = String(body.memo || '').trim().slice(0, 500);
  if (memo) fields['고객전달메모'] = memo;
  await patchEntry(id, fields);
  return { ok: true };
}

/* 삭제 — F3: 예약요청 & 미발송만. 쪼개진 진행_DB_OLD 도 같이 지운다 (고아 방지) */
async function actRemove(body) {
  const id = String(body.id || '');
  if (!isRec(id)) throw Object.assign(new Error('레코드가 올바르지 않습니다.'), { status: 400 });
  const f = await getEntry(id);
  const st = one(f['진행상태']);
  if (st !== '예약요청' || f['자동발송체크']) {
    throw Object.assign(
      new Error('발송된 적 없는 예약요청 건만 삭제할 수 있습니다. 이미 진행된 건은 취소 처리하세요.'),
      { status: 409 },
    );
  }

  // 자동화가 이미 쪼개 놓은 진행 건 — 팀명생성기 exact 매칭 (예약봇과 같은 키)
  const teamKey = one(f['팀명생성기']);
  let removedChildren = 0;
  if (teamKey) {
    const children = await fetchAll(T_PROGRESS, {
      formula: `{팀명생성기}='${escFormula(teamKey)}'`,
      fields: ['진행상태'],
    });
    // 하나라도 진행이 나갔으면(상태가 예약요청이 아니면) 지우지 않는다 — 실수 방지
    const moved = children.filter((c) => one(c.fields['진행상태']) !== '예약요청');
    if (moved.length) {
      throw Object.assign(
        new Error(`분할된 진행 건 중 ${moved.length}건이 이미 진행 중이라 삭제할 수 없습니다. 취소 처리하세요.`),
        { status: 409 },
      );
    }
    for (let k = 0; k < children.length; k += 10) {
      const chunk = children.slice(k, k + 10);
      const qs = chunk.map((c) => `records[]=${c.id}`).join('&');

      await at(`/${encodeURIComponent(T_PROGRESS)}?${qs}`, { method: 'DELETE' });
      removedChildren += chunk.length;
    }
  }

  await at(`/${encodeURIComponent(T_ENTRY)}?records[]=${id}`, { method: 'DELETE' });
  return { ok: true, removedChildren };
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
      res.status(200).json({ ...(await buildQueue()), who });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const map = {
        send: actSend,
        modify: actModify,
        confirmChange: actConfirmChange,
        cancel: actCancel,
        remove: actRemove,
      };
      const fn = map[body.action];
      if (!fn) { res.status(400).json({ error: '알 수 없는 요청입니다.' }); return; }
      res.status(200).json(await fn(body));
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || '처리 중 오류가 발생했습니다.' });
  }
}
