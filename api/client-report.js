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
    const linkedRecIds  = cf['진행_DB_OLD'] || [];   // linked record IDs

    const stats = {
      infl_target: cf['인플_요청'] || 0,
      infl_done:   cf['인플_실적'] || 0,
      exp_target:  cf['체험단_요청'] || 0,
      exp_done:    cf['체험_실적'] || 0,
      press_target: cf['기자단_요청'] || 0,
      press_done:  cf['기자_실적'] || 0,
    };

    // ─── 2. 진행_DB_OLD 레코드 가져오기 ────────────────────────────
    // 연결된 레코드 ID가 100개 이하면 RECORD_ID() 필터로 직접 조회
    // ID 목록을 OR 필터로 묶어서 요청
    let allRecords = [];

    if (linkedRecIds.length > 0) {
      // 최대 100개 ID를 OR로 묶어 필터
      const chunkSize = 30; // 필터 URL이 너무 길어지지 않게 분할
      for (let i = 0; i < linkedRecIds.length; i += chunkSize) {
        const chunk = linkedRecIds.slice(i, i + chunkSize);
        const orParts = chunk.map(id => `RECORD_ID()='${id}'`).join(',');
        const formula = encodeURIComponent(`OR(${orParts})`);
        const url = `https://api.airtable.com/v0/${BASE_ID}/${RECORD_TABLE}?filterByFormula=${formula}&fields%5B%5D=유형&fields%5B%5D=XHS_ID&fields%5B%5D=WC_ID&fields%5B%5D=INFL_ID&fields%5B%5D=XHS_Result&fields%5B%5D=DP_Result&fields%5B%5D=진행상태&fields%5B%5D=Shoot_ID`;
        const chunk_recs = await fetchAllRecords(url);
        allRecords = allRecords.concat(chunk_recs);
      }
    }

    // ─── 3. 유형별 분류 ─────────────────────────────────────────────
    const influencer = [];
    const experience = [];
    const press      = [];

    allRecords.forEach((rec, index) => {
      const f = rec.fields;
      const type = f['유형'] || '';

      // XHS_ID: 배열일 수 있음
      const xhsId    = Array.isArray(f['XHS_ID'])  ? f['XHS_ID'][0]  : (f['XHS_ID'] || '');
      const wcId     = Array.isArray(f['WC_ID'])    ? f['WC_ID'][0]   : (f['WC_ID'] || '');
      const inflId   = Array.isArray(f['INFL_ID'])  ? f['INFL_ID'][0] : (f['INFL_ID'] || '');
      const displayId = xhsId || wcId || inflId || '';

      const xhsResult = f['XHS_Result'] || '';
      const dpResult  = f['DP_Result']  || '';
      const status    = f['진행상태']   || '';
      const shootId   = f['Shoot_ID']   || '';

      const item = {
        id:        rec.id,
        seq:       index + 1,
        shootId,
        displayId,
        xhsResult,
        dpResult,
        status,
      };

      if (type === '인플' || type === '인플루언서' || type === '체험→인플' || type === '기자→인플') {
        influencer.push(item);
      } else if (type === '체험' || type === '체험단' || type === '기자→체험') {
        experience.push(item);
      } else if (type === '기자' || type === '기자단') {
        press.push(item);
      } else {
        // 유형 불명확 → 체험으로 fallback
        experience.push(item);
      }
    });

    // seq 재부여
    influencer.forEach((r, i) => { r.seq = i + 1; });
    experience.forEach((r, i) => { r.seq = i + 1; });
    press.forEach((r, i)      => { r.seq = i + 1; });

    return res.status(200).json({
      campaignName,
      brandName,
      branchName,
      month,
      stats,
      records: { influencer, experience, press },
    });

  } catch (err) {
    console.error('[client-report] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
