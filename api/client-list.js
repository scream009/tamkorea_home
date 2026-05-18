/* eslint-env node */
/**
 * Gravity | Client List API (체험단 후보 전달용)
 * GET /api/client-list?month=2026-05
 *
 * 1. Campaign_DB: 계약월 + 표출 체크박스 필터 → CS_DB 링크 ID 수집
 * 2. CS_DB: 지역(J/S/B/E)·분류(FB/AT/RT/HT)·권역 + 상세정보 일괄 조회
 * 3. 지역 → 권역 → 이름 순 정렬
 */

const TOKEN   = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';

const CAMPAIGN_TABLE = 'Campaign_DB';
const CS_TABLE       = 'CS_DB';

// Campaign_DB fields
const F_CAMP_MONTH   = '계약월';   // singleSelect: "2026. 5월"
const F_CAMP_SHOW    = '표출';     // checkbox
const F_CAMP_CS_LINK = '업체명';   // multipleRecordLinks → CS_DB

// CS_DB fields
const F_ZH_NAME  = '중문명';
const F_KR_NAME  = '매장명_검색용';
const F_REGION   = '지역';              // singleLineText: J/S/B/E
const F_CATEGORY = '분류';             // singleLineText: FB/AT/RT/HT
const F_SUBAREA  = '권역';             // singleSelect: 市区/南线/西线/东线/여의도/홍대...
const F_HOURS    = '영업시간(필수)';
const F_HOLIDAY  = '정기휴무';          // multipleSelects
const F_BREAK    = '브레이크타임(필수)';
const F_GUIDE    = '拍摄剧本';
const F_SERVICES = '제공내역';

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

// 지역 코드 정렬 우선순위
const REGION_ORDER = { J: 0, S: 1, B: 2, E: 3 };

// 제주 권역 정렬 (방향)
const JEJU_SUBAREA_ORDER = { '市区': 0, '南线': 1, '西线': 2, '东线': 3 };

// 서울 권역 정렬
const SEOUL_SUBAREA_ORDER = { '여의도': 0, '명동/시청/남대문': 1, '홍대': 2, '강남': 3 };

function getSubareaOrder(region, subarea) {
  if (region === 'J') return JEJU_SUBAREA_ORDER[subarea] ?? 99;
  if (region === 'S') return SEOUL_SUBAREA_ORDER[subarea] ?? 99;
  return 99;
}

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
  try { airtableMonth = toAirtableMonth(month); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  try {
    // ── 1. Campaign_DB: 계약월 + 표출=TRUE ─────────────────────────
    const campFilter = encodeURIComponent(
      `AND({${F_CAMP_MONTH}} = "${airtableMonth}", {${F_CAMP_SHOW}} = TRUE())`
    );
    const campFields = [F_CAMP_CS_LINK]
      .map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
    const campUrl =
      `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(CAMPAIGN_TABLE)}` +
      `?filterByFormula=${campFilter}&${campFields}`;

    const campRecords = await fetchAllPages(campUrl);
    if (campRecords.length === 0) {
      return res.status(200).json({ month, monthLabel: airtableMonth, clients: [] });
    }

    // ── 2. CS_DB 레코드 ID 수집 (중복 제거) ──────────────────────────
    const csIdSet = new Set();
    for (const cr of campRecords) {
      for (const csId of (cr.fields[F_CAMP_CS_LINK] || [])) csIdSet.add(csId);
    }
    const uniqueIds = [...csIdSet];
    if (uniqueIds.length === 0) {
      return res.status(200).json({ month, monthLabel: airtableMonth, clients: [] });
    }

    // ── 3. CS_DB 일괄 조회 ──────────────────────────────────────────
    const csFields = [
      F_ZH_NAME, F_KR_NAME, F_REGION, F_CATEGORY, F_SUBAREA,
      F_HOURS, F_HOLIDAY, F_BREAK, F_GUIDE, F_SERVICES
    ].map(f => `fields[]=${encodeURIComponent(f)}`).join('&');

    const idFilter = encodeURIComponent(
      `OR(${uniqueIds.map(id => `RECORD_ID()="${id}"`).join(',')})`
    );
    const csUrl =
      `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(CS_TABLE)}` +
      `?filterByFormula=${idFilter}&${csFields}`;

    const csRecords = await fetchAllPages(csUrl);

    // ── 4. 정제 + 정렬 ─────────────────────────────────────────────
    const clients = csRecords
      .map(rec => {
        const f = rec.fields;
        const holidayArr = Array.isArray(f[F_HOLIDAY]) ? f[F_HOLIDAY] : [];
        return {
          id:        rec.id,
          zhName:    f[F_ZH_NAME]  || '',
          krName:    f[F_KR_NAME]  || '',
          region:    (f[F_REGION]   || '').toUpperCase().trim(),   // J/S/B/E
          category:  (f[F_CATEGORY] || '').toUpperCase().trim(),   // FB/AT/RT/HT
          subarea:   f[F_SUBAREA]  || '',
          hours:     f[F_HOURS]    || '',
          holiday:   holidayArr.join(', '),
          breakTime: f[F_BREAK]    || '',
          guide:     f[F_GUIDE]    || '',
          services:  f[F_SERVICES] || '',
        };
      })
      .sort((a, b) => {
        // 1) 지역 (J < S < B < E)
        const rDiff = (REGION_ORDER[a.region] ?? 99) - (REGION_ORDER[b.region] ?? 99);
        if (rDiff !== 0) return rDiff;
        // 2) 권역
        const sDiff = getSubareaOrder(a.region, a.subarea) - getSubareaOrder(b.region, b.subarea);
        if (sDiff !== 0) return sDiff;
        // 3) 이름
        return (a.zhName || a.krName).localeCompare(b.zhName || b.krName, 'zh');
      });

    // 60초 CDN 캐시 + 5분 stale-while-revalidate (매장 데이터는 자주 안 바뀜)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ month, monthLabel: airtableMonth, clients });

  } catch (err) {
    console.error('[client-list]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
