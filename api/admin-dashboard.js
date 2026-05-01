/**
 * Gravity | Admin Dashboard API v3
 *
 * 두 테이블 조합:
 *  1. 진행_DB_OLD  → 담당자별 실적 (유형=체험단) — 고객명(한국어) 사용
 *  2. Campaign_DB  → 고객사별 체험단 목표 수량  — 고객사명(한국어) + 지점명 기준
 *
 * 매칭 전략: 양쪽 모두 한국어 고객사명으로 일치 비교
 */

const AIRTABLE_API_KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';

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
    // ─── 1. Campaign_DB: 고객사별 체험단 목표 수량 ─────────────
    // 체험_목표 또는 체험단_요청 이 있는 레코드만 가져옴
    // 계약월 필터는 프론트에서 처리 (전체 로드 후 선택)
    const campaignRecords = await fetchAll(
      'Campaign_DB',
      null,
      ['계약월', '고객사명', '지점명', '체험_목표', '체험단_요청']
    );

    // targetMap: { "고객사명+지점명" → [ { month, target } ] }
    const targetMap = {};
    campaignRecords.forEach(rec => {
      const f = rec.fields;
      const month       = extractString(f['계약월']);   // e.g. "2026. 4월"
      const clientName  = extractString(f['고객사명']); // 한국어 고객사명
      const branchName  = extractString(f['지점명']);   // 한국어 지점명
      // 체험_목표 우선, 없으면 체험단_요청
      const target      = Number(f['체험_목표'] ?? f['체험단_요청'] ?? 0);

      if (!clientName || target === 0) return;

      // 매칭 키: "고객사명__지점명" (지점명이 있으면 조합, 없으면 고객사명만)
      const key = branchName ? `${clientName}__${branchName}` : clientName;
      if (!targetMap[key]) targetMap[key] = [];
      targetMap[key].push({ month, target, clientName, branchName });
    });

    // ─── 2. 진행_DB_OLD: 담당자별 실적 ─────────────────────────
    // HH / LH / AN 만 가져오고, 고객명(한국어) 사용
    const formula = "OR({예약_ID}='HH', {예약_ID}='LH', {예약_ID}='AN')";
    const scheduleRecords = await fetchAll(
      '진행_DB_OLD',
      formula,
      ['예약_ID', '진행상태', '고객명', '지점명', '정산월', '귀속 정산월', '유형']
    );

    const cleanedRecords = scheduleRecords.map(rec => {
      const f = rec.fields;

      // 고객명: 한국어 필드 우선 (linked array 가능)
      const clientName = extractString(f['고객명']);
      const branchName = extractString(f['지점명']);

      return {
        id:          rec.id,
        coordinator: f['예약_ID'] || 'Unknown',
        status:      f['진행상태'] || '상태없음',
        client:      clientName || 'Unknown',
        branch:      branchName,
        type:        f['유형'] || '',
        month:       extractString(f['정산월']),
        linkedMonth: extractString(f['귀속 정산월']),
      };
    });

    return res.status(200).json({ records: cleanedRecords, targetMap });

  } catch (error) {
    console.error('Admin Dashboard API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
