/* eslint-env node */
/**
 * 고객카드 (/admin/clients) — 한 고객사의 모든 것을 한 번에 내려보낸다.
 *
 * 왜 한 파일인가: CS·사업자·인물·서류·캠페인 다섯 테이블을 브라우저가 각각 부르면
 * 왕복이 다섯 번이고 Airtable 요청 한도(5/초)에 걸린다. 서버에서 조인해 한 번에 준다.
 *
 * 모드
 *   GET  ?              목록 (154행 + 서류구비 + 계약수) — 레일용, 가볍게
 *   GET  ?id=recXXX     카드 상세 (CS + 캠페인 + 사업자 + 인물 + 서류 + 계열)
 *   GET  ?doc=recXXX    서류 이미지 열람 URL 발급 + 열람기록
 *   PATCH {id, fields}  인라인 편집 (CS_DB 화이트리스트 항목만)
 *
 * 🔴 서류 이미지 URL 을 목록·상세 응답에 담지 않는다.
 *    Airtable 첨부 URL 은 서명된 공개 링크라 주소를 아는 사람은 로그인 없이 연다.
 *    카드에는 '있다/없다·접수일·버전'만 보내고, 실제 URL 은 ?doc= 로 그때 발급한다.
 *    신분증·통장은 누가 언제 열었는지 서류_DB.열람기록 에 남는다.
 */

import { blockedByAdminGate, adminWho } from './_admin-auth.js';

const KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const API = `https://api.airtable.com/v0/${BASE}`;

const T_STORE = 'CS_DB';
const T_CAMPAIGN = 'Campaign_DB';
const T_BIZ = '사업자_DB';
const T_PERSON = '인물_DB';
const T_DOC = '서류_DB';

/* 카드에서 바로 고칠 수 있는 항목. 여기 없는 건 /admin/stores 로 보낸다 —
   계약·목표처럼 파급이 큰 값을 카드에서 손대면 되돌리기 어렵다. */
const EDITABLE = {
  영업시간: '영업시간(필수)',
  브레이크타임: '브레이크타임(필수)',
  피크타임: '피크타임',
  방문가능시간: '방문가능시간',
  섭외주의사항: '섭외주의사항',
  비고: '비고',
  제공내역: '제공내역',
  톡방명: '톡방명',
  톡방링크: '톡방링크',
};

const STORE_FIELDS = [
  '고객사명(필수)', '지점명(필수)', '중문명', '영업시간(필수)', '브레이크타임(필수)',
  '피크타임', '정기휴무', '방문가능시간', '제공내역', '섭외주의사항', '비고',
  '톡방명', '톡방링크', '분류', '지역', '권역', '사용여부',
  'DP_매장코드', 'DP_CPT_만료일', 'DP_CPT_상태', 'DP_광고상태', 'DP_잔액',
  '사업자', '서류',
  /* 캠페인 링크는 두 필드에 갈라져 있다 — 'Campain_DB'(오타지만 실제로 쓰이는 쪽)와
     'Campaign_DB'(비어 있는 쪽). 실측(2026-09-03): 우아연은 Campain_DB 9건 / Campaign_DB 0건.
     어느 쪽이 채워질지 모르니 둘을 합쳐 읽는다. */
  'Campain_DB', 'Campaign_DB',
];

const BIZ_FIELDS = [
  '상호', '사업자등록번호', '사업자구분', '법인등록번호', '업태', '종목', '개업일',
  '사업장주소', '전화번호', '이메일', '톡방', '상태', '메모', '판독_요약',
  '정산계좌_은행', '정산계좌_번호', '정산계좌_예금주', '계좌_확인일',
  '대표자', '실질오너', '실무자', '매장', '서류',
  '사업자등록증_이미지', '통장사본_이미지', '기타서류_이미지',   // 개수만 쓴다. URL 은 안 내보낸다
  '실질오너명',
];

const CAMPAIGN_FIELDS = [
  '계약월', '계약유형', '총예산', '합산_목표', '합산_실적',
  '인플_목표', '체험_목표', '기자_목표', '인플_방문', '체험_방문', '기자_실적',
  '인플_업완', '체험_업완', '인플_취소', '체험_취소', '협력사', '비고', '확인요망',
];

const DOC_FIELDS = ['종류', '상태', '버전', '발급일', '접수일', '유효종료일',
  '받은경로', '판독_신뢰도', '원본파일명', '파일해시', '대상_사업자', '개인정보_마스킹'];

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

/** 레코드 ID 목록으로만 가져온다 — 링크 필드를 formula 로 거르는 것보다 확실하다. */
async function fetchByIds(table, ids, fields) {
  const list = [...new Set((ids || []).filter(isRec))];
  if (!list.length) return [];
  const out = [];
  for (let i = 0; i < list.length; i += 50) {          // formula 길이 제한 여유
    const chunk = list.slice(i, i + 50);
    const formula = `OR(${chunk.map((r) => `RECORD_ID()="${r}"`).join(',')})`;
    out.push(...await fetchAll(table, { formula, fields }));
  }
  return out;
}

const one = (v) => (Array.isArray(v) ? String(v[0] ?? '').trim() : String(v ?? '').trim());
const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);
const arr = (v) => (Array.isArray(v) ? v : []);
const isRec = (v) => /^rec[A-Za-z0-9]{14}$/.test(String(v || ''));
const nowKST = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);

/* 계약월 '2026. 7월' → {y:2026, m:7} — 정렬·그래프에 쓴다 */
function parseMonth(v) {
  const m = /^(\d{4})\.\s*(\d{1,2})월$/.exec(String(v || '').trim());
  return m ? { y: Number(m[1]), m: Number(m[2]) } : null;
}

/* ── 목록 ────────────────────────────────────────── */
async function buildList() {
  const [stores, bizList] = await Promise.all([
    fetchAll(T_STORE, { fields: STORE_FIELDS }),
    fetchAll(T_BIZ, { fields: ['상호', '사업자등록번호', '상태', '사업자등록증_이미지', '통장사본_이미지', '대표자', '실질오너', '실질오너명'] }),
  ]);

  const bizById = new Map(bizList.map((b) => [b.id, b.fields || {}]));

  const rows = stores.map((s) => {
    const f = s.fields || {};
    const bizId = one(f['사업자']);
    const b = bizById.get(bizId) || null;
    const have = {
      사업자등록증: b ? arr(b['사업자등록증_이미지']).length : 0,
      통장사본: b ? arr(b['통장사본_이미지']).length : 0,
    };
    return {
      id: s.id,
      client: one(f['고객사명(필수)']),
      branch: one(f['지점명(필수)']),
      cls: one(f['분류']),
      region: one(f['지역']),
      use: !!f['사용여부'],
      campaigns: new Set([...arr(f['Campain_DB']), ...arr(f['Campaign_DB'])]).size,
      hasBiz: !!b,
      bizNo: b ? one(b['사업자등록번호']) : '',
      bizState: b ? one(b['상태']) : '',
      /* 총괄대표(실질오너)가 명시된 곳만 — 실질오너명 수식은 비면 대표자로 떨어지므로 링크가 있을 때만 */
      owner: b && arr(b['실질오너']).length ? one(b['실질오너명']) : '',
      docs: have,
      docsOk: have.사업자등록증 > 0 && have.통장사본 > 0,
      cptDue: one(f['DP_CPT_만료일']),
    };
  });

  rows.sort((a, b) => (a.client || '').localeCompare(b.client || '', 'ko')
    || (a.branch || '').localeCompare(b.branch || '', 'ko'));

  return {
    rows,
    counts: {
      total: rows.length,
      use: rows.filter((r) => r.use).length,
      withBiz: rows.filter((r) => r.hasBiz).length,
      needDoc: rows.filter((r) => r.hasBiz && !r.docsOk).length,
      needCheck: rows.filter((r) => r.bizState === '확인필요').length,
    },
  };
}

/* ── 카드 상세 ───────────────────────────────────── */
async function buildCard(storeId) {
  const store = await at(`/${encodeURIComponent(T_STORE)}/${storeId}`);
  const f = store.fields || {};

  const bizId = one(f['사업자']);
  const campIds = [...new Set([...arr(f['Campain_DB']), ...arr(f['Campaign_DB'])])];

  const [bizRecs, campRecs] = await Promise.all([
    bizId ? fetchByIds(T_BIZ, [bizId], BIZ_FIELDS) : Promise.resolve([]),
    fetchByIds(T_CAMPAIGN, campIds, CAMPAIGN_FIELDS),
  ]);
  const biz = bizRecs[0] || null;
  const bf = biz ? (biz.fields || {}) : {};

  /* 인물 + 서류 + 계열 — 사업자가 있을 때만 의미가 있다 */
  const personIds = [...arr(bf['대표자']), ...arr(bf['실질오너']), ...arr(bf['실무자'])];
  const docIds = [...arr(bf['서류']), ...arr(f['서류'])];

  const [persons, docs] = await Promise.all([
    fetchByIds(T_PERSON, personIds, ['이름', '구분', '직위', '연락처', '이메일', '생년월일',
      '대표_사업자', '실질오너_사업자', '계열_매장수', '계열_사업자수', '관계메모', '신분증·사진']),
    fetchByIds(T_DOC, docIds, DOC_FIELDS),
  ]);

  /* 계열 — 같은 사람이 대표/실질오너인 다른 사업자 */
  const kinBizIds = new Set();
  persons.forEach((p) => {
    arr(p.fields['대표_사업자']).forEach((x) => kinBizIds.add(x));
    arr(p.fields['실질오너_사업자']).forEach((x) => kinBizIds.add(x));
  });
  kinBizIds.delete(bizId);
  const kinRecs = await fetchByIds(T_BIZ, [...kinBizIds], ['상호', '사업자등록번호', '매장', '대표자']);

  /* 캠페인 정리 — 월 오름차순, 같은 달이 두 줄이면 표시 */
  const camps = campRecs.map((c) => {
    const cf = c.fields || {};
    const pm = parseMonth(cf['계약월']);
    return {
      id: c.id,
      month: one(cf['계약월']),
      y: pm ? pm.y : 0,
      m: pm ? pm.m : 0,
      type: one(cf['계약유형']),
      budget: num(cf['총예산']),
      goal: num(cf['합산_목표']),
      done: num(cf['합산_실적']),
      infl: { goal: num(cf['인플_목표']), visit: num(cf['인플_방문']), fin: num(cf['인플_업완']), cancel: num(cf['인플_취소']) },
      exp: { goal: num(cf['체험_목표']), visit: num(cf['체험_방문']), fin: num(cf['체험_업완']), cancel: num(cf['체험_취소']) },
      rep: { goal: num(cf['기자_목표']), done: num(cf['기자_실적']) },
      partner: one(cf['협력사']),
      memo: one(cf['비고']),
      flag: !!cf['확인요망'],
    };
  }).sort((a, b) => a.y - b.y || a.m - b.m);

  const dupMonths = [...new Set(
    camps.map((c) => c.month).filter((mo, i, a) => mo && a.indexOf(mo) !== i),
  )];

  /* 서류 — 이미지 URL 은 보내지 않는다. 있다/없다와 메타만. */
  const docList = docs.map((d) => {
    const df = d.fields || {};
    return {
      id: d.id,
      kind: one(df['종류']) || '기타',
      state: one(df['상태']) || '현행',
      ver: num(df['버전']) || 1,
      issued: one(df['발급일']),
      received: one(df['접수일']),
      endsAt: one(df['유효종료일']),
      via: one(df['받은경로']),
      conf: one(df['판독_신뢰도']),
      file: one(df['원본파일명']),
      masked: !!df['개인정보_마스킹'],
    };
  }).sort((a, b) => (a.kind === b.kind ? b.ver - a.ver : a.kind.localeCompare(b.kind, 'ko')));

  /* 사업자_DB 첨부 칸 — 개수만 (URL 은 ?doc= 으로) */
  const shots = {
    사업자등록증: arr(bf['사업자등록증_이미지']).map((x) => x.filename),
    통장사본: arr(bf['통장사본_이미지']).map((x) => x.filename),
    기타서류: arr(bf['기타서류_이미지']).map((x) => x.filename),
  };

  return {
    store: {
      id: store.id,
      client: one(f['고객사명(필수)']),
      branch: one(f['지점명(필수)']),
      cn: one(f['중문명']),
      open: one(f['영업시간(필수)']),
      brk: one(f['브레이크타임(필수)']),
      peak: one(f['피크타임']),
      rest: arr(f['정기휴무']),
      visitOk: one(f['방문가능시간']),
      give: one(f['제공내역']),
      warn: one(f['섭외주의사항']),
      note: one(f['비고']),
      talkName: one(f['톡방명']),
      talkLink: one(f['톡방링크']),
      cls: one(f['분류']),
      region: one(f['지역']),
      area: one(f['권역']),
      use: !!f['사용여부'],
      dpCode: one(f['DP_매장코드']),
      cptDue: one(f['DP_CPT_만료일']),
      cptState: one(f['DP_CPT_상태']),
      adState: one(f['DP_광고상태']),
      adBal: num(f['DP_잔액']),
    },
    biz: biz ? {
      id: biz.id,
      name: one(bf['상호']),
      no: one(bf['사업자등록번호']),
      kind: one(bf['사업자구분']),
      corpNo: one(bf['법인등록번호']),
      biz1: one(bf['업태']),
      biz2: one(bf['종목']),
      opened: one(bf['개업일']),
      addr: one(bf['사업장주소']),
      tel: one(bf['전화번호']),
      mail: one(bf['이메일']),
      talk: one(bf['톡방']),
      state: one(bf['상태']),
      memo: one(bf['메모']),
      ocr: one(bf['판독_요약']),
      bank: one(bf['정산계좌_은행']),
      acct: one(bf['정산계좌_번호']),
      holder: one(bf['정산계좌_예금주']),
      acctAt: one(bf['계좌_확인일']),
      owner: arr(bf['실질오너']).length ? one(bf['실질오너명']) : '',
      shots,
    } : null,
    people: persons.map((p) => {
      const pf = p.fields || {};
      const isRep = arr(bf['대표자']).includes(p.id);
      const isOwner = arr(bf['실질오너']).includes(p.id);
      return {
        id: p.id,
        name: one(pf['이름']),
        roles: arr(pf['구분']),
        title: one(pf['직위']),
        tel: one(pf['연락처']),
        mail: one(pf['이메일']),
        born: one(pf['생년월일']),
        memo: one(pf['관계메모']),
        idCard: arr(pf['신분증·사진']).length,
        kinStores: num(pf['계열_매장수']),
        kinBiz: num(pf['계열_사업자수']),
        on: isOwner ? '총괄대표' : (isRep ? '대표' : '실무'),
      };
    }),
    campaigns: camps,
    dupMonths,
    docs: docList,
    kin: kinRecs.map((k) => ({
      id: k.id,
      name: one(k.fields['상호']),
      no: one(k.fields['사업자등록번호']),
      stores: arr(k.fields['매장']).length,
    })),
  };
}

/* ── 서류 열람 URL 발급 (+ 기록) ─────────────────── */
async function issueDocUrl(docId, who) {
  const rec = await at(`/${encodeURIComponent(T_DOC)}/${docId}`);
  const f = rec.fields || {};
  const kind = one(f['종류']);
  const hash8 = String(f['파일해시'] || '').slice(0, 8);
  let files = arr(f['파일']);

  /* 서류_DB.파일 이 비어 있으면 사업자_DB 첨부칸에서 **해시로** 찾는다.
     로더(scripts/docs_intake/load_airtable.py)가 이미지를 사업자_DB 의 종류별 칸에 올리고
     서류_DB 에는 메타만 남겼다(2026-09-03). 파일명에 해시 앞 8자가 박혀 있다 —
     예) 사업자등록증_v1_2026-03-10_06c0178c.jpg ↔ 파일해시 06c0178c861b8ac6.
     실측: 배포 직후 122건 전부 "첨부 없음"이 떴다. 이 함수가 서류_DB.파일만 봤기 때문이다. */
  if (!files.length && hash8) {
    const bizId = one(f['대상_사업자']);
    if (bizId) {
      const b = await at(`/${encodeURIComponent(T_BIZ)}/${bizId}`);
      const bf = b.fields || {};
      const pool = [
        ...arr(bf['사업자등록증_이미지']), ...arr(bf['통장사본_이미지']), ...arr(bf['기타서류_이미지']),
      ];
      files = pool.filter((x) => String(x.filename || '').includes(hash8));

      /* 신분증은 사람 것이라 인물_DB.신분증·사진 에 있다 */
      if (!files.length && kind === '신분증') {
        for (const pid of arr(bf['대표자'])) {
          const p = await at(`/${encodeURIComponent(T_PERSON)}/${pid}`);
          const hit = arr(p.fields?.['신분증·사진']).filter((x) => String(x.filename || '').includes(hash8));
          if (hit.length) { files = hit; break; }
        }
      }
    }
  }

  if (!files.length) {
    const e = new Error('이미지를 찾지 못했습니다. 서류_DB 파일해시와 사업자_DB 첨부 파일명이 어긋났을 수 있습니다 — 로더를 다시 돌리면 맞춰집니다.');
    e.status = 404;
    throw e;
  }

  /* 누가 언제 열었는지 남긴다. 신분증·통장이 섞여 있어 이건 선택이 아니다.
     실패해도 열람은 막지 않는다 — 기록 때문에 업무가 멈추면 기록을 꺼 버리게 된다. */
  try {
    const line = `${nowKST()} ${who || 'admin'}`;
    const prev = String(f['열람기록'] || '');
    await at(`/${encodeURIComponent(T_DOC)}/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 열람기록: [line, prev].join(String.fromCharCode(10)).slice(0, 99000) } }),
    });
  } catch { /* 기록 실패는 삼킨다 */ }

  return {
    kind,
    files: files.map((x) => ({ url: x.url, name: x.filename, type: x.type, size: x.size })),
  };
}

/* ── 인라인 편집 ─────────────────────────────────── */
async function patchStore(body, who) {
  const id = String(body.id || '');
  if (!isRec(id)) { const e = new Error('레코드 ID 가 올바르지 않습니다.'); e.status = 400; throw e; }

  const fields = {};
  Object.entries(body.fields || {}).forEach(([k, v]) => {
    const col = EDITABLE[k];
    if (col) fields[col] = String(v ?? '');
  });
  if (!Object.keys(fields).length) {
    const e = new Error('카드에서 고칠 수 있는 항목이 아닙니다. /admin/stores 에서 수정하세요.');
    e.status = 400;
    throw e;
  }

  /* 누가 고쳤는지 비고 끝에 남긴다 — 개인별 관리자 키가 곧 신원이다 */
  if (fields['비고'] !== undefined) {
    fields['비고'] = `${fields['비고']}`.trim();
  }
  await at(`/${encodeURIComponent(T_STORE)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields, typecast: true }),
  });
  return { ok: true, by: who, at: nowKST() };
}

/* ── 핸들러 ─────────────────────────────────────── */
export default async function handler(req, res) {
  if (blockedByAdminGate(req, res)) return;

  if (!KEY) {
    res.status(503).json({ error: 'Airtable 토큰이 설정되지 않았습니다.' });
    return;
  }

  const who = adminWho(
    req.headers['x-admin-key'] || req.query?.key || '',
  );

  try {
    if (req.method === 'GET') {
      const docId = String(req.query.doc || '');
      if (docId) {
        if (!isRec(docId)) { res.status(400).json({ error: '서류 ID 가 올바르지 않습니다.' }); return; }
        res.status(200).json(await issueDocUrl(docId, who));
        return;
      }
      const id = String(req.query.id || '');
      if (id) {
        if (!isRec(id)) { res.status(400).json({ error: '고객사 ID 가 올바르지 않습니다.' }); return; }
        res.status(200).json(await buildCard(id));
        return;
      }
      res.status(200).json(await buildList());
      return;
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      res.status(200).json(await patchStore(body, who));
      return;
    }

    res.setHeader('Allow', 'GET, PATCH');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    const msg = e?.message || '서버 오류';
    res.status(e?.status || 500).json({ error: msg });
  }
}
