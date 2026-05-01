/**
 * Gravity | Admin Dashboard API
 * 두 테이블 조합:
 *  1. Campaign_DB   → 고객사별 체험단 목표 수량 (체험_목표 or 체험단_요청)
 *  2. 진행_DB_OLD   → 담당자별 실적 (유형=체험단만)
 */

const AIRTABLE_API_KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';

async function fetchAll(table, formula, fields) {
  let allRecords = [];
  let offset = '';
  do {
    let url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
    const params = [];
    if (formula) params.push(`filterByFormula=${encodeURIComponent(formula)}`);
    fields.forEach(f => params.push(`fields[]=${encodeURIComponent(f)}`));
    if (offset) params.push(`offset=${offset}`);
    if (params.length) url += '?' + params.join('&');

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `Airtable fetch failed (${response.status})`);
    }
    const data = await response.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset || '';
  } while (offset);
  return allRecords;
}

function extractString(val) {
  if (!val) return '';
  if (Array.isArray(val)) return String(val[0] || '');
  return String(val);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ─── 1. Campaign_DB: 체험단 목표 수량 ──────────────────
    // 체험_목표 또는 체험단_요청 이 있는 레코드만 (4월 필터는 프론트엔드에서)
    const campaignRecords = await fetchAll(
      'Campaign_DB',
      null,
      ['계약월', '고객사명', '지점명', '체험_목표', '체험단_요청']
    );

    const targetMap = {}; // key: "고객사명+지점명" → { month, target }
    campaignRecords.forEach(rec => {
      const f = rec.fields;
      const month = extractString(f['계약월']); // e.g. "2026. 4월"
      const clientName = extractString(f['고객사명']);
      const branchName = extractString(f['지점명']);
      const target = Number(f['체험_목표'] || f['체험단_요청'] || 0);
      if (!clientName) return;

      // 중국명이 없으므로 한국명으로 key 생성
      const key = `${clientName}__${branchName}`;
      if (!targetMap[key]) {
        targetMap[key] = [];
      }
      targetMap[key].push({ month, target, clientName, branchName });
    });

    // ─── 2. 진행_DB_OLD: 담당자별 실적 (HH/LH/AN, 체험단만) ─
    const formula = "OR({예약_ID}='HH', {예약_ID}='LH', {예약_ID}='AN')";
    const scheduleRecords = await fetchAll(
      '진행_DB_OLD',
      formula,
      ['예약_ID', '진행상태', '고객명', '중문명 Rollup (from 매장코드)', '귀속 정산월', '정산월', '유형']
    );

    const cleanedRecords = scheduleRecords.map(rec => {
      const f = rec.fields;
      let clientName = extractString(f['중문명 Rollup (from 매장코드)']) ||
                       extractString(f['고객명']);
      if (typeof clientName !== 'string') clientName = String(clientName || '');

      return {
        id: rec.id,
        coordinator: f['예약_ID'] || 'Unknown',
        status: f['진행상태'] || '상태없음',
        client: clientName || 'Unknown',
        type: f['유형'] || '',
        month: extractString(f['정산월']),
        linkedMonth: extractString(f['귀속 정산월']),
      };
    });

    return res.status(200).json({
      records: cleanedRecords,
      targetMap   // 프론트엔드에서 월+고객사명으로 매칭
    });

  } catch (error) {
    console.error('Admin Dashboard API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
