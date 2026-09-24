/* eslint-env node */
/**
 * 관리자 — 고객사(CS_DB) 등록·수정 + 계약·목표(Campaign_DB) 등록.
 *
 * Softr ⑧(고객등록, 어드민)의 대체 + 기존 /admin(목표·실적)의 구멍 하나를 메운다:
 * admin-targets 의 ensureCampaign 은 **기존 계약의 업체명 링크를 복사**하는 방식이라
 * 계약이 하나도 없는 신규 고객사는 첫 계약을 만들 수 없었다. 여기서는 CS 레코드 ID 로
 * 업체명 링크를 직접 걸어 신규 고객사도 바로 첫 계약+목표를 등록한다.
 *
 * GET             → 고객사 목록
 * GET ?store=rec… → 그 고객사의 계약 목록 (정방향 업체명 링크 기준 — 역링크는 빈 매장이 있다)
 * POST create / update / contract
 *
 * 게이트 = _admin-auth.js (CS·계약 전체를 다루므로 관리자 등급).
 */

import { blockedByAdminGate, escFormula } from './_admin-auth.js';
import { storeSig } from './_qr-sign.js';

const KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const API = `https://api.airtable.com/v0/${BASE}`;

const T_STORE = 'CS_DB';
const T_CAMPAIGN = 'Campaign_DB';

const EDITORS = ['대표', '이사', '실장', '관리자'];
const REST_DAYS = ['월', '화', '수', '목', '금', '토', '일', '무휴'];
const CLS = ['FB', 'AT', 'RT', 'HT', 'ET'];
const REGIONS = ['J', 'S', 'B', 'E'];
const AREAS = ['市区', '南线', '西线', '东线', '여의도', '명동/시청/남대문', '홍대', '강남', '성수', '동대문'];

/* ── CS_DB 필드 매핑 — (필수) 접미까지가 실제 필드명이다 ── */
const F = {
  client: '고객사명(필수)',
  branch: '지점명(필수)',
  cn: '중문명',
  open: '영업시간(필수)',
  brk: '브레이크타임(필수)',
  peak: '피크타임',
  rest: '정기휴무',
  visitOk: '방문가능시간',
  give: '제공내역',
  script: '拍摄剧本',
  warn: '섭외주의사항',
  note: '비고',
  talkName: '톡방명',
  talkLink: '톡방링크',
  cls: '분류',
  region: '지역',
  area: '권역',
  use: '사용여부',
};

const STORE_FIELDS = Object.values(F);

/* ── 월 표기 ── */
const MONTH_RE = /^(\d{4})\.\s*(\d{1,2})월$/;
const parseMonth = (v) => MONTH_RE.exec(String(v || '').trim());

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
const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);
const isRec = (v) => /^rec[A-Za-z0-9]{14}$/.test(String(v || ''));

function nowKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
}

/* ── 목록 ── */
/* 협력사 선택지 — Campaign_DB 에서 실제로 쓰이는 값. singleSelect 라 typecast:false 로 쓰려면
   이미 있는 옵션이어야 한다(새 협력사는 Airtable 에서 옵션을 먼저 만든다). */
async function partnerChoices() {
  const recs = await fetchAll(T_CAMPAIGN, { fields: ['협력사'] });
  const set = new Set(recs.map((r) => one(r.fields['협력사'])).filter(Boolean));
  set.delete('직영');
  return ['직영', ...[...set].sort((a, b) => a.localeCompare(b, 'ko'))];
}

async function listStores() {
  const [recs, partners] = await Promise.all([fetchAll(T_STORE, { fields: STORE_FIELDS }), partnerChoices()]);
  const stores = recs.map((r) => {
    const g = r.fields;
    return {
      id: r.id,
      client: one(g[F.client]),
      branch: one(g[F.branch]),
      cn: one(g[F.cn]),
      open: one(g[F.open]),
      brk: one(g[F.brk]),
      peak: one(g[F.peak]),
      rest: Array.isArray(g[F.rest]) ? g[F.rest] : [],
      visitOk: one(g[F.visitOk]),
      give: one(g[F.give]),
      script: one(g[F.script]),
      warn: one(g[F.warn]),
      note: one(g[F.note]),
      talkName: one(g[F.talkName]),
      talkLink: one(g[F.talkLink]),
      cls: one(g[F.cls]),
      region: one(g[F.region]),
      area: one(g[F.area]),
      use: g[F.use] ? 1 : 0,
      // 시크릿 미설정이면 빈 값 → 프론트가 QR 버튼을 숨긴다 (fail-closed)
      storeSignature: storeSig(r.id),

    };
  })
    .filter((s) => s.client || s.branch)
    .sort((a, b) => (b.use - a.use)
      || `${a.client} ${a.branch}`.localeCompare(`${b.client} ${b.branch}`, 'ko'));
  return {
    stores,
    options: { rest: REST_DAYS, cls: CLS, regions: REGIONS, areas: AREAS, editors: EDITORS, partners },
  };
}

/* ── 매장의 계약 목록 — 정방향 업체명 링크 기준 ── */
async function listContracts(storeId) {
  const recs = await fetchAll(T_CAMPAIGN, {
    fields: ['계약월', '업체명', '계약유형', '인플_목표', '체험_목표', '기자_목표', '총예산',
      '인플_방문', '체험_방문', '기자_실적', '목표수정이력', '협력사', '공유표출'],
  });
  const contracts = recs
    .filter((r) => (r.fields['업체명'] || []).includes(storeId))
    .map((r) => ({
      id: r.id,
      month: one(r.fields['계약월']),
      ct: one(r.fields['계약유형']),
      infl: num(r.fields['인플_목표']),
      exp: num(r.fields['체험_목표']),
      rep: num(r.fields['기자_목표']),
      budget: num(r.fields['총예산']),
      inflVis: num(r.fields['인플_방문']),
      expVis: num(r.fields['체험_방문']),
      repDone: num(r.fields['기자_실적']),
      hist: one(r.fields['목표수정이력']).split('\n').filter(Boolean).slice(-1)[0] || '',
      partner: one(r.fields['협력사']),
      share: !!r.fields['공유표출'],
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
  return { contracts };
}

/* ── CS 필드 조립 (create·update 공용) — 넘어온 키만 쓴다 ── */
function buildStoreFields(body, { forCreate }) {
  const fields = {};
  const put = (key, val) => { fields[F[key]] = val; };

  const textKeys = ['client', 'branch', 'cn', 'open', 'brk', 'peak', 'visitOk',
    'give', 'script', 'warn', 'note', 'talkName', 'talkLink'];
  textKeys.forEach((k) => {
    if (body[k] !== undefined) put(k, String(body[k] || '').trim().slice(0, 2000));
  });

  if (body.rest !== undefined) {
    const rest = (Array.isArray(body.rest) ? body.rest : []).filter((d) => REST_DAYS.includes(d));
    put('rest', rest);
  }
  if (body.cls !== undefined) put('cls', CLS.includes(body.cls) ? body.cls : null);
  if (body.region !== undefined) put('region', REGIONS.includes(body.region) ? body.region : null);
  if (body.area !== undefined) put('area', AREAS.includes(body.area) ? body.area : null);
  if (body.use !== undefined) put('use', !!body.use);

  if (forCreate) {
    for (const k of ['client', 'branch', 'open', 'brk']) {
      if (!String(fields[F[k]] || '').trim()) {
        const label = { client: '고객사명', branch: '지점명', open: '영업시간', brk: '브레이크타임' }[k];
        throw Object.assign(new Error(`${label}은(는) 필수입니다.`), { status: 400 });
      }
    }
  }
  return fields;
}

/* ── 고객사 생성 — 같은 이름+지점 중복 거부 ── */
async function createStore(body) {
  const fields = buildStoreFields(body, { forCreate: true });

  const client = fields[F.client];
  const branch = fields[F.branch];
  const dup = await fetchAll(T_STORE, {
    formula: `AND({${F.client}}='${escFormula(client)}',{${F.branch}}='${escFormula(branch)}')`,
    fields: [F.client],
  });
  if (dup.length) {
    throw Object.assign(new Error(`'${client} ${branch}' 는 이미 등록돼 있습니다.`), { status: 409 });
  }
  if (body.use === undefined) fields[F.use] = true;   // 신규는 기본 사용

  const created = await at(`/${encodeURIComponent(T_STORE)}`, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });
  return { ok: true, id: created.records[0].id };
}

async function updateStore(body) {
  const id = String(body.id || '');
  if (!isRec(id)) throw Object.assign(new Error('레코드가 올바르지 않습니다.'), { status: 400 });
  const fields = buildStoreFields(body, { forCreate: false });
  if (!Object.keys(fields).length) return { ok: true, changed: 0 };
  await at(`/${encodeURIComponent(T_STORE)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields, typecast: false }),
  });
  return { ok: true, changed: Object.keys(fields).length };
}

/* ── 계약·목표 등록 — 있으면 목표 수정(원본·이력 보존), 없으면 생성 ── */
async function upsertContract(body) {
  const storeId = String(body.storeId || '');
  if (!isRec(storeId)) throw Object.assign(new Error('고객사를 선택하세요.'), { status: 400 });
  const month = String(body.month || '').trim();
  if (!parseMonth(month)) throw Object.assign(new Error('계약월 형식이 올바르지 않습니다. 예) 2026. 9월'), { status: 400 });
  const by = EDITORS.includes(body.by) ? body.by : '';
  if (!by) throw Object.assign(new Error('수정자를 고르세요.'), { status: 400 });

  const goals = {
    인플_목표: Math.max(0, Math.round(Number(body.infl) || 0)),
    체험_목표: Math.max(0, Math.round(Number(body.exp) || 0)),
    기자_목표: Math.max(0, Math.round(Number(body.rep) || 0)),
  };
  const budget = Math.max(0, Math.round(Number(body.budget) || 0));
  const stamp = nowKST();
  const memo = String(body.memo || '').trim().slice(0, 200);

  // 같은 매장×월 계약 탐색 — 정방향 업체명 링크
  const sameMonth = await fetchAll(T_CAMPAIGN, {
    formula: `{계약월}='${escFormula(month)}'`,
    fields: ['업체명', '계약유형', '인플_목표', '체험_목표', '기자_목표', '총예산',
      '(원)인플_목표', '(원)체험_목표', '(원)기자_목표', '(원)총예산', '목표수정이력', '협력사', '공유표출'],
  });
  const exist = sameMonth.find((r) => (r.fields['업체명'] || []).includes(storeId));

  // ── 협력사·공유표출 (Owner 2026-09-24: "협력사 매장을 추가해도 대시보드에 안 뜬다 — 반복") ──
  // 🔴 예전엔 이 화면이 두 칸을 **아예 쓰지 않았다** → 새로 등록한 협력사 매장(비유비베이커리)이
  //    협력사 링크에서 빠졌다. 협력사 화면은 `{협력사}=이름 AND {공유표출}` 로 고른다.
  //    body.partner 가 오면 그 값, 안 오면 이 매장의 **가장 최근 계약**에서 이어받는다(ensure_month_records 와 같은 규칙).
  let partnerF = null;
  if (body.partner !== undefined && body.partner !== null && String(body.partner).trim() !== '') {
    partnerF = String(body.partner).trim();
    if (!(await partnerChoices()).includes(partnerF)) {
      throw Object.assign(new Error(`'${partnerF}' 는 등록된 협력사가 아닙니다. Airtable 협력사 선택지에 먼저 추가하세요.`), { status: 400 });
    }
  }
  const shareF = body.share === undefined || body.share === null ? null : !!body.share;
  let carry = {};
  if (partnerF === null && !exist) {
    const hist = await fetchAll(T_CAMPAIGN, { fields: ['업체명', '계약월', '협력사', '공유표출'] });
    const mk = (m) => { const p = parseMonth(one(m)); return p ? Number(p[1]) * 100 + Number(p[2]) : 0; };
    const latest = hist.filter((r) => (r.fields['업체명'] || []).includes(storeId))
      .sort((a, b) => mk(b.fields['계약월']) - mk(a.fields['계약월']))[0];
    if (latest && one(latest.fields['협력사'])) {
      carry = { 협력사: one(latest.fields['협력사']), 공유표출: !!latest.fields['공유표출'] };
    }
  }
  // 협력사를 고르고 표시 여부를 따로 안 주면: 협력사 매장은 표시(✓), 직영은 해제
  const partnerFields = partnerF !== null
    ? { 협력사: partnerF, 공유표출: shareF !== null ? shareF : partnerF !== '직영' }
    : (shareF !== null ? { ...carry, 공유표출: shareF } : carry);

  if (exist) {
    const f = exist.fields;
    const patch = {};
    const parts = [];
    Object.entries(goals).forEach(([key, nv]) => {
      if (nv === num(f[key])) return;
      if (f[`(원)${key}`] === undefined || f[`(원)${key}`] === null) patch[`(원)${key}`] = num(f[key]);
      patch[key] = nv;
      parts.push(`${key.replace('_목표', '')} ${num(f[key])}→${nv}`);
    });
    if (budget !== num(f['총예산'])) {
      if (f['(원)총예산'] === undefined || f['(원)총예산'] === null) patch['(원)총예산'] = num(f['총예산']);
      patch['총예산'] = budget;
      parts.push(`예산 ${num(f['총예산']).toLocaleString()}→${budget.toLocaleString()}`);
    }
    if (!one(f['계약유형'])) {
      patch['계약유형'] = '월계약';
      parts.push('빈 계약 되살림');
    }
    if (partnerFields.협력사 !== undefined && partnerFields.협력사 !== one(f['협력사'])) {
      patch['협력사'] = partnerFields.협력사;
      parts.push(`협력사 ${one(f['협력사']) || '빈칸'}→${partnerFields.협력사}`);
    }
    if (partnerFields.공유표출 !== undefined && partnerFields.공유표출 !== !!f['공유표출']) {
      patch['공유표출'] = partnerFields.공유표출;
      parts.push(`협력사 화면 표시 ${partnerFields.공유표출 ? '켬' : '끔'}`);
    }
    if (!parts.length) return { ok: true, id: exist.id, mode: 'unchanged' };

    patch['목표수정이력'] = [one(f['목표수정이력']),
      `${stamp} ${by} · ${parts.join(', ')}${memo ? ` (${memo})` : ''}`]
      .filter(Boolean).join('\n').slice(-4000);
    patch['목표수정자'] = by;
    patch['목표수정일'] = new Date().toISOString();

    await at(`/${encodeURIComponent(T_CAMPAIGN)}/${exist.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: patch, typecast: false }),
    });
    return { ok: true, id: exist.id, mode: 'updated', changed: parts.length };
  }

  // 신규 계약 — 업체명 링크를 CS 레코드로 직접 건다 (신규 고객사도 가능)
  const created = await at(`/${encodeURIComponent(T_CAMPAIGN)}`, {
    method: 'POST',
    body: JSON.stringify({
      records: [{
        fields: {
          업체명: [storeId],
          계약월: month,
          계약유형: '월계약',
          ...goals,
          ...partnerFields,
          총예산: budget,
          목표수정이력: `${stamp} ${by} · ${month} 계약 생성 (고객사 등록화면)`
            + (partnerFields.협력사 ? ` · 협력사 ${partnerFields.협력사}${partnerFields.공유표출 ? '(화면 표시)' : ''}` : '')
            + (memo ? ` (${memo})` : ''),
          목표수정자: by,
          목표수정일: new Date().toISOString(),
        },
      }],
      typecast: false,
    }),
  });
  return { ok: true, id: created.records[0].id, mode: 'created' };
}

/* ── 핸들러 ── */
export default async function handler(req, res) {
  if (blockedByAdminGate(req, res)) return;

  if (!KEY) {
    res.status(503).json({ error: 'Airtable 토큰이 설정되지 않았습니다.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const storeId = String(req.query.store || '');
      if (isRec(storeId)) {
        res.status(200).json(await listContracts(storeId));
        return;
      }
      res.status(200).json(await listStores());
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (body.action === 'create') { res.status(200).json(await createStore(body)); return; }
      if (body.action === 'update') { res.status(200).json(await updateStore(body)); return; }
      if (body.action === 'contract') { res.status(200).json(await upsertContract(body)); return; }
      res.status(400).json({ error: '알 수 없는 요청입니다.' });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    const msg = /choice|option/i.test(e.message || '')
      ? `${e.message} — Airtable 단일선택(계약월·분류 등)에 해당 항목이 없습니다. Airtable 에서 옵션을 먼저 추가해 주세요.`
      : (e.message || '처리 중 오류가 발생했습니다.');
    res.status(e.status || 500).json({ error: msg });
  }
}
