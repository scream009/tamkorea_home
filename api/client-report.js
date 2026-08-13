/* eslint-env node */
/**
 * Gravity | Client Report API  v2
 * GET /api/client-report?recordId=recXXXXXXXX
 *
 * 1. Campaign_DB 에서 캠페인 기본정보 및 진행_DB_OLD 연결 ID 목록 가져오기
 * 2. 진행_DB_OLD 에서 각 레코드의 유형(인플루언서/체험/기자단) + ID + 링크 가져오기
 * 3. 유형별로 분류하여 반환
 *    - 인플루언서: XHS_ID + XHS_Result
 *    - 체험단:     XHS_ID + WC_ID + XHS_Result + DP_Result (따종디엔핑)
 *    - 기자단:     XHS_ID + XHS_Result + DP_Result
 */

const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const CAMPAIGN_TABLE = encodeURIComponent('Campaign_DB');
const RECORD_TABLE   = encodeURIComponent('진행_DB_OLD');

async function atFetch(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
  return res.json();
}

const nospace = (v) => String(v || '').replace(/\s/g, '');
// 백슬래시부터 늘려야 한다 — replace(/'/g, "\'") 는 no-op (_admin-auth.js 와 같은 규칙)
const escFormula = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// 에어테이블 페이지네이션 처리 (100건 초과 시)
async function fetchAllRecords(baseUrl) {
  let records = [];
  let offset = null;
  do {
    const url = offset ? `${baseUrl}&offset=${offset}` : baseUrl;
    const data = await atFetch(url);
    records = records.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);
  return records;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { recordId } = req.query;
  if (!recordId) return res.status(400).json({ error: 'recordId is required' });

  try {
    // ─── 1. Campaign_DB 기본 정보 가져오기 ──────────────────────────
    const campData = await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGN_TABLE}/${recordId}`
    );
    const cf = campData.fields;

    const campaignName  = cf['계약명'] || '';
    const brandName     = Array.isArray(cf['고객사명']) ? cf['고객사명'][0] : (cf['고객사명'] || '');
    const branchName    = Array.isArray(cf['지점명'])   ? cf['지점명'][0]   : (cf['지점명'] || '');
    const month         = cf['계약월'] || '';
    const partnerField  = cf['협력사명'] || cf['협력사'] || '';
    const partnerRaw    = Array.isArray(partnerField) ? partnerField[0] : partnerField;
    let partnerName     = (partnerRaw && partnerRaw !== '직영' && partnerRaw !== '탐코리아' && partnerRaw.toUpperCase() !== 'TAMKOREA') ? partnerRaw : 'TAMKOREA';
    if (partnerName && partnerName.includes('에코')) {
      partnerName = '에코';
    }
    const linkedRecIds  = cf['진행_DB_OLD'] || [];   // linked record IDs

    // 실적 수량: 인플/체험 = '_방문' rollup, 기자 = '기자_실적' rollup (스키마 리네임 반영)
    const stats = {
      infl_target:  cf['인플_목표'] || cf['인플_요청'] || cf['# 인플_목표'] || cf['# 인플_요청'] || 0,
      infl_done:    cf['인플_방문'] || cf['# 인플_방문'] || cf['인플_실적'] || cf['# 인플_실적'] || 0,
      exp_target:   cf['체험_목표'] || cf['체험단_요청'] || cf['# 체험_목표'] || cf['# 체험단_요청'] || 0,
      exp_done:     cf['체험_방문'] || cf['# 체험_방문'] || cf['체험_실적'] || cf['# 체험_실적'] || 0,
      press_target: cf['기자_목표'] || cf['기자단_요청'] || cf['# 기자_목표'] || cf['# 기자단_요청'] || 0,
      press_done:   cf['기자_실적'] || cf['# 기자_실적'] || 0,
    };

    // ─── 2. 진행_DB_OLD 레코드 가져오기 ────────────────────────────
    // 연결된 레코드 ID가 100개 이하면 RECORD_ID() 필터로 직접 조회
    // ID 목록을 OR 필터로 묶어서 요청
    const PROG_FIELDS = ['유형','XHS_ID','WC_ID','INFL_ID','XHS_Result','DP_Result','DY_Result','진행상태','Shoot_ID','팀명생성기','XHS_건수','DP_건수'];
    const fieldQ = PROG_FIELDS.map((f) => `fields%5B%5D=${encodeURIComponent(f)}`).join('&');
    let allRecords = [];

    if (linkedRecIds.length > 0) {
      // 최대 100개 ID를 OR로 묶어 필터
      const chunkSize = 30; // 필터 URL이 너무 길어지지 않게 분할
      for (let i = 0; i < linkedRecIds.length; i += chunkSize) {
        const chunk = linkedRecIds.slice(i, i + chunkSize);
        const orParts = chunk.map(id => `RECORD_ID()='${id}'`).join(',');
        const formula = encodeURIComponent(`OR(${orParts})`);
        const url = `https://api.airtable.com/v0/${BASE_ID}/${RECORD_TABLE}?filterByFormula=${formula}&${fieldQ}`;
        const chunk_recs = await fetchAllRecords(url);
        allRecords = allRecords.concat(chunk_recs);
      }
    }

    // '귀속 정산월' 링크가 비어도 실적을 찾는다 — 계약명(공백 제거)으로 보정.
    // 오토메이션의 exact match 가 매장명 공백 때문에 실패한 레코드가 실재한다
    // (구 ClientReportPage 가 브라우저에서 하던 보정을 서버로 이식, 2026-08-13).
    try {
      const key = nospace(campaignName);
      if (key) {
        const expr = `SUBSTITUTE({입력 정산월}, " ", "") = '${escFormula(key)}'`;
        const u = `https://api.airtable.com/v0/${BASE_ID}/${RECORD_TABLE}`
          + `?filterByFormula=${encodeURIComponent(expr)}&pageSize=100&${fieldQ}`;
        const seen = new Set(allRecords.map((r) => r.id));
        const extra = (await fetchAllRecords(u)).filter((r) => !seen.has(r.id));
        if (extra.length) allRecords = allRecords.concat(extra);
      }
    } catch (e) {
      // 보정 실패는 무시 — 링크로 찾은 실적은 그대로 보여준다
      console.error('[client-report] 계약명 보정 실패:', e.message);
    }

    // ─── 2.5 게시 플랫폼 (예약입력_DB, 팀명생성기 매칭) ─────────────
    // 인스타그램 인플 등 타매체 건의 컬럼 제목·버튼 라벨용. 빈값 = 기본(샤오홍슈/따종).
    // 예약입력_DB↔진행_DB 는 링크가 없어 팀명생성기 문자열이 유일한 연결이다(2026-08-13 실측).
    const platMap = {};
    try {
      const teamKeys = [...new Set(
        allRecords.map((r) => nospace(r.fields['팀명생성기'])).filter(Boolean)
      )];
      for (let i = 0; i < teamKeys.length; i += 20) {
        const chunk = teamKeys.slice(i, i + 20);
        const orParts = chunk
          .map((k) => `SUBSTITUTE({팀명생성기}, " ", "")='${escFormula(k)}'`)
          .join(',');
        const u = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent('예약입력_DB')}`
          + `?filterByFormula=${encodeURIComponent(`OR(${orParts})`)}&pageSize=100`
          + `&fields%5B%5D=${encodeURIComponent('팀명생성기')}`
          + `&fields%5B%5D=${encodeURIComponent('XHS_플랫폼')}`
          + `&fields%5B%5D=${encodeURIComponent('DP_플랫폼')}`;
        const recs = await fetchAllRecords(u);
        recs.forEach((r) => {
          const k = nospace(r.fields['팀명생성기']);
          if (k && !platMap[k]) {
            platMap[k] = { x: r.fields['XHS_플랫폼'] || '', d: r.fields['DP_플랫폼'] || '' };
          }
        });
      }
    } catch (e) {
      // 실패해도 보고서는 떠야 한다 — 기본 라벨로 그린다.
      console.error('[client-report] 예약입력_DB 플랫폼 조회 실패:', e.message);
    }

    // ─── 3. 유형별 분류 ─────────────────────────────────────────────
    // 구 ClientReportPage(브라우저 직결)의 판정 규칙을 그대로 이식:
    // 취소·노쇼 제외, includes 판정, 영상이상은 하단 별도 리스트.
    const isVideoIssue = (s) => (s || '').replace(/\s/g, '').includes('영상이상');
    const influencer = [];
    const experience = [];
    const press      = [];
    const videoIssue = [];
    // 미발송으로 숨긴 건수 (유형별) — 아래에서 rollup 기반 stats 를 같이 깎는다
    let hidInfl = 0, hidExp = 0, hidPress = 0;

    allRecords.forEach((rec) => {
      const f = rec.fields;
      const type   = f['유형'] || '';
      const status = f['진행상태'] || '';

      // 취소·노쇼 레코드는 보고서에서 제외
      if (status.includes('취소') || status.includes('노쇼')) return;

      // 미발송(예약요청·긴급예약) 제외 (Owner 지정 2026-08-13) — 아직 매장에
      // 발송되지 않은 예약은 고객 화면에 보이면 안 된다. 결과물이 이미 달린
      // 건은 상태만 멈춘 실제 방문 건이므로 남긴다 (client-schedule 과 같은 규칙).
      const stNorm = status.replace(/\s/g, '');
      if ((stNorm === '예약요청' || stNorm === '긴급예약')
        && !(f['XHS_Result'] || f['DP_Result'] || f['DY_Result'])) {
        // 아래 카테고리 판정과 같은 규칙으로 센다
        if (type.includes('인플')) hidInfl += 1;
        else if (type.includes('기자')) hidPress += 1;
        else hidExp += 1;
        return;
      }

      // XHS_ID: 배열일 수 있음
      const xhsId    = Array.isArray(f['XHS_ID'])  ? f['XHS_ID'][0]  : (f['XHS_ID'] || '');
      const wcId     = Array.isArray(f['WC_ID'])    ? f['WC_ID'][0]   : (f['WC_ID'] || '');
      const inflId   = Array.isArray(f['INFL_ID'])  ? f['INFL_ID'][0] : (f['INFL_ID'] || '');
      const displayId = xhsId || wcId || inflId || '';

      let category;
      if (type.includes('인플')) category = 'influencer';
      else if (type.includes('기자')) category = 'press';
      else category = 'experience'; // 유형 불명확 → 체험으로 fallback

      const plat = platMap[nospace(f['팀명생성기'])] || {};
      const item = {
        id:        rec.id,
        seq:       0,
        category,
        shootId:   f['Shoot_ID'] || '',
        displayId,
        xhsResult: (f['XHS_Result'] || '').trim(),
        dpResult:  (f['DP_Result']  || '').trim(),
        dyResult:  (f['DY_Result']  || '').trim(),
        status,
        xhsPlat:   plat.x || '',   // 게시 플랫폼 — 빈값 = 기본(샤오홍슈/따종)
        dpPlat:    plat.d || '',
        xhsCount:  f['XHS_건수'],  // 열 표시 판정용 — 大 건이 전혀 없으면 DP 열을 숨긴다
        dpCount:   f['DP_건수'],
      };

      if (isVideoIssue(status)) { videoIssue.push(item); return; }
      if (category === 'influencer') influencer.push(item);
      else if (category === 'press') press.push(item);
      else experience.push(item);
    });

    // seq 재부여
    [influencer, experience, press, videoIssue].forEach(
      (arr) => arr.forEach((r, i) => { r.seq = i + 1; })
    );

    // 실적 카드 보정 — stats 는 Campaign_DB rollup 인데 그 rollup 이 예약요청 건도
    // 센다(차백도 실측). 리스트에서 뺀 건은 숫자에서도 뺀다.
    // ⚠️ Airtable rollup 조건을 나중에 고치면 이중 차감 — 그날엔 이 블록을 지운다.
    if (hidInfl || hidExp || hidPress) {
      const num = (v) => Number(Array.isArray(v) ? v[0] : v) || 0;
      stats.infl_done  = Math.max(0, num(stats.infl_done)  - hidInfl);
      stats.exp_done   = Math.max(0, num(stats.exp_done)   - hidExp);
      stats.press_done = Math.max(0, num(stats.press_done) - hidPress);
    }

    return res.status(200).json({
      campaignName,
      brandName,
      branchName,
      month,
      partnerName,
      stats,
      records: { influencer, experience, press, videoIssue },
    });

  } catch (err) {
    console.error('[client-report] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
