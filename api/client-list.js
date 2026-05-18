/* eslint-env node */
/**
 * Gravity | Client List API (체험단 후보 전달용)
 * GET /api/client-list?month=2026-05
 *
 * 1. Campaign_DB에서 계약월 + 표출 체크박스 필터
 * 2. 링크된 CS_DB 레코드 일괄 조회
 * 3. 권역(지역구분)은 Campaign_DB에서, 상세정보는 CS_DB에서 병합
 */

const TOKEN   = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';

const CAMPAIGN_TABLE = 'Campaign_DB';
const CS_TABLE       = 'CS_DB';

// Campaign_DB fields
const F_CAMP_MONTH   = '계약월';        // singleSelect: "2026. 5월"
const F_CAMP_SHOW    = '표출';          // checkbox: TRUE/FALSE
const F_CAMP_REGION  = '지역구분';      // singleSelect: 제주/서울/부산/기타
const F_CAMP_CS_LINK = '업체명';        // multipleRecordLinks → CS_DB

// CS_DB fields
const F_ZH_NAME   = '중문명';
const F_KR_NAME   = '매장명_검색용';
const F_HOURS     = '영업시간(필수)';
const F_HOLIDAY   = '정기휴무';         // multipleSelects
const F_BREAK     = '브레이크타임(필수)';
const F_GUIDE     = '拍摄剧本';
const F_SERVICES  = '제공내역';

async function atFetch(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchAllPages(baseUrl) {
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

// "2026-05" → "2026. 5월"
function toAirtableMonth(monthStr) {
  const [year, mon] = (monthStr || '').split('-');
  if (!year || !mon) throw new Error(`Invalid month format "${monthStr}". Use YYYY-MM`);
  return `${year}. ${parseInt(mon, 10)}월`;
}

const REGION_ORDER = { '제주': 0, '서울': 1, '부산': 2, '기타': 3 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!TOKEN) return res.status(500).json({ error: 'API key not configured' });

  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month parameter required (e.g. 2026-05)' });

  let airtableMonth;
  try {
    airtableMonth = toAirtableMonth(month);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    // ── 1. Campaign_DB: 계약월 + 표출=TRUE ─────────────────────────
    const campFilter = encodeURIComponent(
      `AND({${F_CAMP_MONTH}} = "${airtableMonth}", {${F_CAMP_SHOW}} = TRUE())`
    );
    const campFields = [F_CAMP_CS_LINK, F_CAMP_REGION]
      .map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
    const campUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(CAMPAIGN_TABLE)}` +
      `?filterByFormula=${campFilter}&${campFields}`;

    const campRecords = await fetchAllPages(campUrl);

    if (campRecords.length === 0) {
      return res.status(200).json({ month, monthLabel: airtableMonth, clients: [] });
    }

    // ── 2. CS_DB 레코드 ID 수집 + 권역 매핑 (중복 제거) ──────────────
    const csIdToRegion = new Map();
    for (const cr of campRecords) {
      const region = cr.fields[F_CAMP_REGION] || '기타';
      for (const csId of (cr.fields[F_CAMP_CS_LINK] || [])) {
        if (!csIdToRegion.has(csId)) csIdToRegion.set(csId, region);
      }
    }

    const uniqueIds = [...csIdToRegion.keys()];
    if (uniqueIds.length === 0) {
      return res.status(200).json({ month, monthLabel: airtableMonth, clients: [] });
    }

    // ── 3. CS_DB 일괄 조회 ──────────────────────────────────────────
    const csFields = [F_ZH_NAME, F_KR_NAME, F_HOURS, F_HOLIDAY, F_BREAK, F_GUIDE, F_SERVICES]
      .map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
    const idFilter = encodeURIComponent(
      `OR(${uniqueIds.map(id => `RECORD_ID()="${id}"`).join(',')})`
    );
    const csUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(CS_TABLE)}` +
      `?filterByFormula=${idFilter}&${csFields}`;

    const csRecords = await fetchAllPages(csUrl);

    // ── 4. 정제 + 권역 순 정렬 ─────────────────────────────────────
    const clients = csRecords
      .map(rec => {
        const f = rec.fields;
        const holidayArr = Array.isArray(f[F_HOLIDAY]) ? f[F_HOLIDAY] : [];
        return {
          id:        rec.id,
          zhName:    f[F_ZH_NAME]  || '',
          krName:    f[F_KR_NAME]  || '',
          region:    csIdToRegion.get(rec.id) || '기타',
          hours:     f[F_HOURS]    || '',
          holiday:   holidayArr.join(', '),
          breakTime: f[F_BREAK]    || '',
          guide:     f[F_GUIDE]    || '',
          services:  f[F_SERVICES] || '',
        };
      })
      .sort((a, b) => {
        const ra = REGION_ORDER[a.region] ?? 99;
        const rb = REGION_ORDER[b.region] ?? 99;
        if (ra !== rb) return ra - rb;
        return (a.zhName || a.krName).localeCompare(b.zhName || b.krName, 'zh');
      });

    return res.status(200).json({ month, monthLabel: airtableMonth, clients });

  } catch (err) {
    console.error('[client-list]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
