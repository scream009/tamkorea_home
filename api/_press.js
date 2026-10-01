/* eslint-env node */
/**
 * 기자단 결과 링크 대량등록 — 공용 본체. 라우트가 아니다(파일명 `_`).
 * 입구 두 개가 게이트만 달리해 이 파일을 부른다:
 *   api/admin-press.js → /admin/press  (관리자 키)
 *   api/staff-press.js → /staff/press  (담당자 키 — 관리자 키도 통과)
 *
 * 기자단은 이미 올라간 영상 링크만 받는다(인플 ID·예약일시 없음). 그동안 Airtable 에
 * 직접 붙여넣었고, 2026-09-28 전수 점검에서 그 방식의 사고가 실측됐다:
 *   - 같은 묶음 재등록: 모찌롱 7월 10건이 08-31·09-19·09-24 세 번, M1971 7월 20건이 두 번
 *   - 월 착오: 중문갈치노릇 6월분 20건이 8월로 다시 들어감
 *   - '귀속 정산월' 링크 공란 165건 → Campaign_DB 기자_실적(rollup)에 안 잡혀 실적 카드 0
 *   - 링크 230개에 앞뒤 공백·\xa0 이 붙어 있음
 * → 붙여넣기는 그대로 편하게 받고, **저장 전 검사**로 막는다.
 *
 * GET                        → 고객사 목록 + 매장별 계약(월·기자 목표·실적)
 * POST {action:'preview', campaignId, text}          → 추출·판정 결과 (쓰기 없음)
 * POST {action:'create',  campaignId, text, expect}  → 같은 판정을 서버에서 다시 돌려 '신규'만 생성
 * POST {action:'registered', campaignId}             → 이 계약에 이미 걸린 기자 링크 (쓰기 없음)
 *
 * 쓰는 필드 (진행_DB_OLD) — 기존 수동 입력 관례(기자 585건 실측)를 따른다:
 *   매장코드·정산월·**귀속 정산월(캠페인 직결)**·유형=기자·진행상태=촬영완료·예약_ID=FB·XHS_Result·비고(등록 태그)
 *   귀속 정산월을 오토메이션에 맡기지 않는다 — 09-18·09-24 입력분을 오토메이션이 안 걸었다(원인 미확인).
 *
 * 중복 판정 키: 단축링크 = 호스트+경로(대소문자 구분, http/https·끝 '/'·쿼리 무시),
 *   긴 주소 = 노트 ID. 붙여넣은 링크는 단축링크를 풀어 노트 ID 까지 비교한다
 *   (주소는 다른데 같은 영상 — 엘프바 4월 실측 2건).
 *   DB 쪽은 노트 ID 를 저장해 두지 않아 주소로만 비교한다 — 과거 중복 118건 중 116건이 주소 동일이었다.
 *
 * 게이트는 입구 파일 몫. 여기는 이미 통과한 요청만 받는다. CORS 헤더 없음(같은 오리진 전용).
 * 노출 범위: 고객사명·계약월·기자 목표/실적(돈 없음) — 담당자 진도 보드가 이미 보는 수준이다.
 */

const KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const API = `https://api.airtable.com/v0/${BASE}`;

const T_STORE = 'CS_DB';
const T_CAMPAIGN = 'Campaign_DB';
const T_PROGRESS = '진행_DB_OLD';

const MAX_TEXT = 60000;       // 붙여넣기 상한 (문자)
const MAX_LINKS = 200;        // 한 번에 받는 링크 상한
const MAX_RESOLVE = 120;      // 단축링크 풀기 상한 — 넘으면 주소 비교만
const RESOLVE_CONC = 8;
const RESOLVE_TIMEOUT = 6000;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

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
    throw Object.assign(new Error(msg), { status: r.status >= 500 ? 502 : 400 });
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
const num = (v) => (typeof v === 'number' ? v : Number(one(v)) || 0);
const isRec = (v) => /^rec[A-Za-z0-9]{14}$/.test(String(v || ''));

const MONTH_RE = /^(\d{4})\.\s*(\d{1,2})월$/;
function monthNum(v) {
  const m = MONTH_RE.exec(String(v || '').trim());
  return m ? Number(m[1]) * 100 + Number(m[2]) : 0;
}
function kstStamp(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
}
const kstDate = (iso) => (iso ? kstStamp(new Date(iso)).slice(0, 10) : '');

/* ══════════════ 링크 추출 ══════════════
   줄 단위로 자르지 않는다 — 텍스트에서 URL 만 뽑는다.
   URL 문자는 ASCII 로 한정해서 공백·\xa0·한자(复制本条信息)·전각 문장부호에서 저절로 끊긴다.
   제목 줄("모찌롱 7월 기자단")·빈 줄은 URL 이 아니라 자연히 빠진다. */
const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%]+/g;
// https:// \uc5c6\uc774 \ub4e4\uc5b4\uc628 \uc0e4\uc624\ud64d\uc288 \uc8fc\uc18c\uc5d0 \ubd99\uc5ec \uc900\ub2e4 \u2014 \ub4f1\ub85d \ubaa9\ub85d \ud654\uba74\uc774 \uc8fc\uc18c\ub97c \uc9e7\uac8c \ubcf4\uc5ec \uc918\uc11c \uadf8\uac78 \ubcf5\uc0ac\ud558\uba74
// 'xhslink.cn/o/\u2026' \ub9cc \ub4e4\uc5b4\uc628\ub2e4(2026-10-01 Owner \ud14c\uc2a4\ud2b8\uc5d0\uc11c 0\uac1c \uc778\uc2dd \u2192 \ud655\uc778 \ubc84\ud2bc \uaebc\uc9d0).
// \uc55e \uae00\uc790\ub97c \uc7a1\uc544 \ub450\ub294 \ubc29\uc2dd \u2014 lookbehind \ub294 \uc61b iOS Safari \uc5d0\uc11c \ubc88\ub4e4 \uc804\uccb4\uac00 \uc8fd\ub294\ub2e4. PressBulk.jsx \uc640 \uac19\uc740 \uaddc\uce59.
const BARE_XHS_RE = /(^|[^A-Za-z0-9\-._~:/])((?:xhslink\.(?:cn|com)|(?:www\.|m\.)?xiaohongshu\.com)\/)/gi;

export function extractLinks(text) {
  const s = String(text || '')
    .slice(0, MAX_TEXT)
    .replace(/[\s\u200b-\u200d]/g, ' ')
    .replace(BARE_XHS_RE, '$1https://$2');
  const out = [];
  for (const m of s.matchAll(URL_RE)) {
    // 두 링크가 공백 없이 붙어 들어온 경우 — 'http' 앞에서 끊는다
    m[0].split(/(?=https?:\/\/)/).forEach((u) => {
      const c = u.replace(/[.,;:!?*]+$/, '');
      if (c.length > 10) out.push(c);
    });
  }
  return out;
}

const NOTE_RE = /\/(?:discovery\/item|explore|item)\/([0-9a-f]{24})/i;

/** 링크 한 개 → { url, key, kind, note, bad } */
export function classify(raw) {
  let u;
  try { u = new URL(raw); } catch { return { url: raw, key: `raw:${raw}`, bad: '주소 형식이 올바르지 않음' }; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '');

  if (host === 'xhslink.cn' || host === 'xhslink.com') {
    if (!/^\/[a-z]\/[A-Za-z0-9]{6,}$/.test(path)) {
      return { url: raw, key: `raw:${host}${path}`, bad: '단축링크 뒷부분이 잘렸거나 형식이 다름' };
    }
    return { url: `${u.protocol}//${u.host}${path}`, key: `${host}${path}`, kind: 'short' };
  }
  if (host === 'xiaohongshu.com' || host === 'm.xiaohongshu.com') {
    if (/\/user\/profile\//.test(path)) {
      return { url: raw, key: `raw:${host}${path}`, bad: '게시물이 아니라 계정 프로필 링크' };
    }
    const m = NOTE_RE.exec(path);
    if (!m) return { url: raw, key: `raw:${host}${path}`, bad: '샤오홍슈 게시물 주소가 아님' };
    const note = m[1].toLowerCase();
    return { url: raw, key: `note:${note}`, kind: 'long', note };
  }
  return { url: raw, key: `raw:${host}${path}`, bad: '샤오홍슈 링크가 아님' };
}

/* ══════════════ 단축링크 → 노트 ID ══════════════
   xhslink 는 302 로 게시물 주소를 준다. 없는 코드는 샤오홍슈 홈으로, /m/ 계열은 프로필로 간다(실측).
   노트 ID = MongoDB ObjectId 라 앞 8자리가 게시 시각(unix)이다 — 화면에 게시일로 보여준다. */
async function resolveShort(url) {
  try {
    const r = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT),
      headers: { 'User-Agent': UA },
    });
    const loc = r.headers.get('location') || '';
    const m = NOTE_RE.exec(loc);
    if (m) return { note: m[1].toLowerCase() };
    if (/\/user\/profile\//.test(loc)) return { profile: true };
    if (r.status >= 300 && r.status < 400 && /^https?:\/\/(www\.)?xiaohongshu\.com\/?(\?.*)?$/.test(loc)) {
      return { home: true };
    }
    return { unknown: `${r.status}` };
  } catch (e) {
    return { unknown: e.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const k = i; i += 1;
      out[k] = await fn(items[k]);
    }
  });
  await Promise.all(workers);
  return out;
}

function postedAt(note) {
  const t = parseInt(String(note || '').slice(0, 8), 16);
  return Number.isFinite(t) && t > 1.4e9 ? kstStamp(new Date(t * 1000)).slice(0, 10) : '';
}

/* ══════════════ 계약 ══════════════ */
async function loadCampaign(campaignId) {
  if (!isRec(campaignId)) throw Object.assign(new Error('계약을 선택해 주세요.'), { status: 400 });
  const d = await at(`/${encodeURIComponent(T_CAMPAIGN)}/${campaignId}`);
  const f = d.fields || {};
  const storeId = one(f['업체명']);
  const month = one(f['계약월']);
  if (!isRec(storeId)) throw Object.assign(new Error('이 계약에 고객사(업체명)가 연결돼 있지 않습니다.'), { status: 400 });
  if (!MONTH_RE.test(month)) throw Object.assign(new Error(`계약월 형식이 올바르지 않습니다: ${month}`), { status: 400 });
  return {
    id: d.id,
    name: one(f['계약명']),
    client: one(f['고객사명']),
    branch: one(f['지점명']),
    month,
    storeId,
    goal: num(f['기자_목표']),
    done: num(f['기자_실적']),
  };
}

/* ══════════════ 판정 ══════════════ */
async function analyze(campaignId, text) {
  const camp = await loadCampaign(campaignId);
  const raws = extractLinks(text);
  if (!raws.length) {
    return { camp, items: [], counts: { total: 0, fresh: 0, dupPaste: 0, dupDb: 0, bad: 0 }, note: '' };
  }
  if (raws.length > MAX_LINKS) {
    throw Object.assign(new Error(`한 번에 ${MAX_LINKS}개까지 받습니다 (지금 ${raws.length}개). 나눠서 넣어 주세요.`), { status: 400 });
  }

  // 1) DB 의 기자 링크 전부 — 다른 고객사·다른 달에 들어간 것도 잡아야 한다(중문갈치 6월↔8월 실측)
  const dbRecs = await fetchAll(T_PROGRESS, {
    formula: `AND(FIND('기자', {유형}&''), {XHS_Result}!='')`,
    fields: ['XHS_Result', '고객명', '지점명', '정산월', 'Created time', '진행상태'],
  });
  const dbMap = new Map();
  dbRecs.forEach((r) => {
    const f = r.fields;
    const first = extractLinks(f['XHS_Result'])[0];
    if (!first) return;
    const c = classify(first);
    const where = {
      client: one(f['고객명']), branch: one(f['지점명']), month: one(f['정산월']),
      at: kstDate(f['Created time']), status: one(f['진행상태']),
    };
    [c.key, c.note ? `note:${c.note}` : ''].filter(Boolean).forEach((k) => {
      if (!dbMap.has(k)) dbMap.set(k, []);
      dbMap.get(k).push(where);
    });
  });

  // 2) 분류 + 단축링크 풀기 (고유한 것만, 상한까지)
  const items = raws.map((raw, i) => ({ i: i + 1, raw, ...classify(raw) }));
  const shorts = [...new Set(items.filter((x) => x.kind === 'short').map((x) => x.url))];
  const toResolve = shorts.slice(0, MAX_RESOLVE);
  const resolved = new Map();
  (await mapLimit(toResolve, RESOLVE_CONC, resolveShort)).forEach((res, k) => resolved.set(toResolve[k], res));

  // 전부 홈으로 튕기면 링크가 아니라 우리 쪽(지역 차단 등) 문제일 확률이 높다 — '없는 링크' 판정을 끈다.
  const homeAll = toResolve.length >= 3 && [...resolved.values()].every((r) => r.home);
  let resolveNote = '';
  if (homeAll) resolveNote = '단축링크 확인이 모두 실패해서 주소 비교로만 판정했습니다.';
  else if (shorts.length > toResolve.length) resolveNote = `단축링크 ${shorts.length - toResolve.length}개는 확인을 건너뛰고 주소로만 비교했습니다.`;

  items.forEach((x) => {
    if (x.kind !== 'short' || x.bad) return;
    const r = resolved.get(x.url);
    if (!r) { x.check = 'skip'; return; }
    if (r.note) { x.note = r.note; return; }
    if (r.profile) { x.bad = '게시물이 아니라 계정 프로필 링크'; return; }
    if (r.home && !homeAll) { x.bad = '없는 링크 (열면 샤오홍슈 홈으로 감 — 잘렸거나 만료)'; return; }
    x.check = 'fail';
  });

  // 3) 판정 — 순서대로. 앞에서 신규로 잡힌 영상이 뒤에 또 오면 '입력 안 중복'
  const seen = new Map();   // key → 먼저 나온 줄 번호
  items.forEach((x) => {
    x.posted = x.note ? postedAt(x.note) : '';
    if (x.bad) { x.status = 'bad'; return; }
    const keys = [x.key, x.note ? `note:${x.note}` : ''].filter(Boolean);
    const prev = keys.map((k) => seen.get(k)).find(Boolean);
    if (prev) { x.status = 'dupPaste'; x.firstAt = prev; return; }
    const hit = keys.map((k) => dbMap.get(k)).find(Boolean);
    keys.forEach((k) => seen.set(k, x.i));
    // 처음 등록된 것부터 — "언제 처음 들어갔나"가 실장님께 되물을 근거다
    if (hit) {
      x.status = 'dupDb';
      x.where = [...hit].sort((p, q) => p.at.localeCompare(q.at)).slice(0, 5);
      x.whereN = hit.length;
      return;
    }
    x.status = 'new';
  });

  const counts = {
    total: items.length,
    fresh: items.filter((x) => x.status === 'new').length,
    dupPaste: items.filter((x) => x.status === 'dupPaste').length,
    dupDb: items.filter((x) => x.status === 'dupDb').length,
    bad: items.filter((x) => x.status === 'bad').length,
  };
  return {
    camp,
    counts,
    note: resolveNote,
    items: items.map((x) => ({
      i: x.i, raw: x.raw, url: x.url, status: x.status, reason: x.bad || '',
      note: x.note || '', posted: x.posted, check: x.check || '',
      firstAt: x.firstAt || 0, where: x.where || [], whereN: x.whereN || 0,
    })),
  };
}

/* ══════════════ 생성 ══════════════ */
async function create(body, who) {
  const a = await analyze(body.campaignId, body.text);
  const fresh = a.items.filter((x) => x.status === 'new');
  // 미리보기 뒤로 DB 가 바뀌었으면(두 번 누름·다른 사람이 먼저 등록) 멈춘다 — 중복 생성 방지
  if (Number(body.expect) !== fresh.length) {
    throw Object.assign(new Error(
      `확인한 뒤로 상태가 바뀌었습니다 (신규 ${body.expect}건 → ${fresh.length}건). 다시 확인을 눌러 주세요.`,
    ), { status: 409 });
  }
  if (!fresh.length) throw Object.assign(new Error('등록할 신규 링크가 없습니다.'), { status: 400 });

  const tag = `[기자 대량등록 ${kstStamp()} ${who}]`;
  // 태그 뒤 #순번 = 붙여넣은 순서. 생성 시각이 초 단위라 한 묶음이 같은 시각이 되어 순서가 사라진다(2026-10-01 실측)
  const records = fresh.map((x, k) => ({
    fields: {
      매장코드: [a.camp.storeId],
      정산월: a.camp.month,
      '귀속 정산월': [a.camp.id],
      유형: '기자',
      진행상태: '촬영완료',
      예약_ID: 'FB',
      XHS_Result: x.url,
      비고: `${tag} #${k + 1}`,
    },
  }));

  const created = [];
  for (let k = 0; k < records.length; k += 10) {
    try {
      // typecast: 정산월 단일선택에 그 달 옵션이 아직 없을 때(월초) 자동 생성되게 한다
      const d = await at(`/${encodeURIComponent(T_PROGRESS)}`, {
        method: 'POST',
        body: JSON.stringify({ records: records.slice(k, k + 10), typecast: true }),
      });
      (d.records || []).forEach((r) => created.push(r.id));
    } catch (e) {
      // 앞 묶음은 이미 들어갔다 — 몇 건 들어갔는지 같이 알린다. 다시 확인하면 들어간 건 'DB에 있음'으로 빠진다.
      throw Object.assign(new Error(
        `${created.length}건 등록 후 실패: ${e.message}. 다시 확인을 누르면 들어간 건은 자동으로 빠집니다.`,
      ), { status: e.status || 502, created: created.length });
    }
  }
  return { ok: true, created: created.length, camp: a.camp, tag };
}

/* ══════════════ 이 계약에 이미 등록된 기자 링크 ══════════════
   담당자 요청(2026-10-01): "누구까지 올렸는지 몰라 다시 돌아가서 찾아봐야 한다" — 등록하면 입력칸이 비워지고
   건수만 남아서다. 실적 숫자(기자_실적 rollup)와 같은 기준으로 보여준다 = '귀속 정산월' 로 이 계약에 걸린 기자 레코드.
   Campaign_DB 의 역링크(진행_DB_OLD)로 찾는다 — 인플·체험도 섞여 있어 유형으로 한 번 더 거른다.
   묶음(group) = 대량등록 태그 단위. 태그 없는 옛 직접 입력은 등록 날짜 단위. */
const TAG_RE = /\[기자 대량등록 (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) ([^\]]*)\]/;
const SEQ_RE = /\]\s*#(\d+)/;      // 태그 뒤 붙여넣은 순번 (2026-10-01 이후 등록분만 — 그 전 묶음 안 순서는 복구 불가)
const LINK_CHUNK = 40;

async function registered(campaignId) {
  if (!isRec(campaignId)) throw Object.assign(new Error('계약을 선택해 주세요.'), { status: 400 });
  const d = await at(`/${encodeURIComponent(T_CAMPAIGN)}/${campaignId}`);
  const ids = (Array.isArray(d.fields?.[T_PROGRESS]) ? d.fields[T_PROGRESS] : []).filter(isRec);

  const chunks = [];
  for (let k = 0; k < ids.length; k += LINK_CHUNK) chunks.push(ids.slice(k, k + LINK_CHUNK));
  const recs = (await mapLimit(chunks, 3, (ch) => fetchAll(T_PROGRESS, {
    formula: `AND(OR(${ch.map((id) => `RECORD_ID()='${id}'`).join(',')}), OR({유형}&''='기자', {유형}&''='기자단'))`,
    fields: ['XHS_Result', 'Created time', '비고', '진행상태'],
  }))).flat();

  const items = recs.map((r) => {
    const f = r.fields;
    const link = extractLinks(f['XHS_Result'])[0] || '';
    const c = link ? classify(link) : null;
    const memo = String(f['비고'] || '');
    const tag = TAG_RE.exec(memo);
    const created = String(f['Created time'] || '');
    return {
      id: r.id,
      url: c && !c.bad ? c.url : link,
      posted: c?.note ? postedAt(c.note) : '',        // 긴 주소만 — 단축링크는 풀어야 알아서 목록에선 생략
      created,
      at: created ? kstStamp(new Date(created)) : '',
      group: tag ? `bulk:${tag[1]} ${tag[2]}` : `day:${created ? kstDate(created) : '?'}`,
      by: tag ? tag[2] : '',
      bulkAt: tag ? tag[1] : '',
      status: one(f['진행상태']),
      seq: Number(SEQ_RE.exec(memo)?.[1]) || 0,
    };
  });
  // 등록 순서대로 번호를 매긴다 — "몇 번째까지 올렸나"를 번호로 말할 수 있게.
  // 묶음은 첫 생성 시각 순. 묶음 안은 생성 시각(10건씩 차례로 만들어 뒤 조각이 늦다) → 같은 초면 붙여넣은 순번.
  // 시각을 먼저 보는 이유: 같은 분에 두 번 등록하면 묶음 키가 같아져 순번 1 이 둘이 된다
  const first = new Map();
  items.forEach((x) => { if (!first.has(x.group) || x.created < first.get(x.group)) first.set(x.group, x.created); });
  items.sort((p, q) => first.get(p.group).localeCompare(first.get(q.group)) || p.group.localeCompare(q.group)
    || p.created.localeCompare(q.created) || p.seq - q.seq || p.id.localeCompare(q.id));
  items.forEach((x, k) => { x.n = k + 1; delete x.seq; });
  return { campaignId, items };
}

/* ══════════════ 목록 ══════════════ */
async function listStores() {
  const [camps, stores] = await Promise.all([
    fetchAll(T_CAMPAIGN, { fields: ['계약월', '업체명', '기자_목표', '기자_실적'] }),
    fetchAll(T_STORE, { fields: ['고객사명(필수)', '지점명(필수)', '사용여부'] }),
  ]);
  const byStore = new Map();
  camps.forEach((r) => {
    const sid = one(r.fields['업체명']);
    const month = one(r.fields['계약월']);
    if (!isRec(sid) || !MONTH_RE.test(month)) return;
    if (!byStore.has(sid)) byStore.set(sid, []);
    byStore.get(sid).push({
      id: r.id, month, goal: num(r.fields['기자_목표']), done: num(r.fields['기자_실적']),
    });
  });
  const out = [];
  stores.forEach((r) => {
    const cs = byStore.get(r.id);
    if (!cs) return;
    const mc = new Map();
    cs.forEach((c) => mc.set(c.month, (mc.get(c.month) || 0) + 1));
    cs.forEach((c) => { c.twin = mc.get(c.month) > 1; });   // 같은 달 계약 2개 — Campaign_DB 중복 실측 4조합
    cs.sort((x, y) => monthNum(y.month) - monthNum(x.month));
    out.push({
      id: r.id,
      client: one(r.fields['고객사명(필수)']),
      branch: one(r.fields['지점명(필수)']),
      use: r.fields['사용여부'] ? 1 : 0,
      press: cs.some((c) => c.goal > 0 || c.done > 0) ? 1 : 0,
      contracts: cs,
    });
  });
  out.sort((a, b) => (b.press - a.press) || (b.use - a.use)
    || `${a.client} ${a.branch}`.localeCompare(`${b.client} ${b.branch}`, 'ko'));
  return { stores: out };
}

/** 게이트를 통과한 요청 처리. who = 등록 태그에 남길 신원(개인 ID | 'admin' | 'staff'). */
export async function pressHandler(req, res, who) {
  try {
    if (!KEY) throw Object.assign(new Error('Airtable 키가 설정되지 않았습니다.'), { status: 503 });

    if (req.method === 'GET') {
      res.status(200).json(await listStores());
      return;
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (body.action === 'preview') { res.status(200).json(await analyze(body.campaignId, body.text)); return; }
      if (body.action === 'create') { res.status(200).json(await create(body, who)); return; }
      if (body.action === 'registered') { res.status(200).json(await registered(body.campaignId)); return; }
      res.status(400).json({ error: '알 수 없는 요청입니다.' });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[press]', who, e.message);
    res.status(e.status || 500).json({ error: e.message || '서버 오류', created: e.created });
  }
}
