/**
 * Gravity | Admin Dashboard API v4
 *
 * 4월 데이터만 반환 (하드코딩 → 추후 ?month=2604 파라미터로 확장 가능)
 *
 * 월 키 기준:
 *  - 진행_DB_OLD  : 정산월 = "2604"
 *  - Campaign_DB  : 계약월 = "2026. 4월"
 */

const AIRTABLE_API_KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';

// 정산월 코드 → 계약월 텍스트 매핑
const MONTH_CODE_TO_TEXT = {
  '2601': '2026. 1월', '2602': '2026. 2월', '2603': '2026. 3월',
  '2604': '2026. 4월', '2605': '2026. 5월', '2606': '2026. 6월',
  '2607': '2026. 7월', '2608': '2026. 8월', '2609': '2026. 9월',
  '2610': '2026. 10월', '2611': '2026. 11월', '2612': '2026. 12월',
};

async function fetchAll(table, formula, fields) {
  let allRecords = [];
  let offset = '';
  do {
    const params = new URLSearchParams();
    if (formula) params.set('filterByFormula', formula);
    fields.forEach(f => params.append('fields[]', f));
    if (offset) params.set('offset', offset);

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `Airtable error (${response.status})`);
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
    // 월 파라미터 (기본값 = 2604 / 4월)
    const monthCode = req.query?.month || '2604';
    const monthText = MONTH_CODE_TO_TEXT[monthCode] || '2026. 4월'; // e.g. "2026. 4월"

    // ─── 1. Campaign_DB: 해당 월 체험단 목표 ──────────────────
    // 계약월 = "2026. 4월" 인 레코드만
    const campaignFormula = `{계약월}='${monthText}'`;
    const campaignRecords = await fetchAll(
      'Campaign_DB',
      campaignFormula,
      ['고객사명', '지점명', '체험_목표', '체험단_요청']
    );

    // targetMap: { "고객사명__지점명" → target }  (단일 월이므로 숫자 바로 저장)
    const targetMap = {};
    campaignRecords.forEach(rec => {
      const f = rec.fields;
      const clientName = extractString(f['고객사명']);
      const branchName = extractString(f['지점명']);
      const target     = Number(f['체험_목표'] ?? f['체험단_요청'] ?? 0);
      if (!clientName || target === 0) return;

      const key = branchName ? `${clientName}__${branchName}` : clientName;
      // 같은 고객사+지점이 여러 행이면 합산
      targetMap[key] = (targetMap[key] || 0) + target;
    });

    // ─── 2. 진행_DB_OLD: 해당 월 실적 (정산월 = "2604") ────────
    // HH/LH/AN 담당자 + 정산월 일치
    const scheduleFormula = `AND(OR({예약_ID}='HH',{예약_ID}='LH',{예약_ID}='AN'),{정산월}='${monthCode}')`;
    const scheduleRecords = await fetchAll(
      '진행_DB_OLD',
      scheduleFormula,
      ['예약_ID', '진행상태', '고객명', '지점명', '유형']
    );

    const cleanedRecords = scheduleRecords.map(rec => {
      const f = rec.fields;
      return {
        id:          rec.id,
        coordinator: f['예약_ID'] || 'Unknown',
        status:      f['진행상태'] || '상태없음',
        client:      extractString(f['고객명']),
        branch:      extractString(f['지점명']),
        type:        f['유형'] || '',
      };
    });

    return res.status(200).json({
      records:   cleanedRecords,
      targetMap,
      monthCode,
      monthText,
    });

  } catch (error) {
    console.error('Admin Dashboard API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
