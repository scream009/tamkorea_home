/**
 * Gravity | Admin Dashboard API
 * Fetches performance data for coordinators
 */

const AIRTABLE_API_KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const table = '진행_DB_OLD';
    // Only fetch records for the main coordinators. We could also just fetch all and filter in frontend.
    const formula = "OR({예약_ID}='HH', {예약_ID}='LH', {예약_ID}='AN')";
    const fields = ['예약_ID', '진행상태', '고객명', '중문명 Rollup (from 매장코드)', '귀속 정산월', '정산월', '유형'];
    
    let allRecords = [];
    let offset = '';

    do {
      let url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?filterByFormula=${encodeURIComponent(formula)}`;
      fields.forEach(f => url += `&fields[]=${encodeURIComponent(f)}`);
      if (offset) url += `&offset=${offset}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to fetch Airtable');
      }

      const data = await response.json();
      if (data.records) {
        allRecords = allRecords.concat(data.records);
      }
      offset = data.offset;
    } while (offset);

    // Clean up the data to send less payload to the frontend
    const cleanedRecords = allRecords.map(rec => {
      const f = rec.fields;
      let clientName = '';
      if (f['중문명 Rollup (from 매장코드)']) {
        const val = f['중문명 Rollup (from 매장코드)'];
        clientName = Array.isArray(val) ? val[0] : val;
      } else if (f['고객명']) {
        const val = f['고객명'];
        clientName = Array.isArray(val) ? val[0] : val;
      }
      
      // Ensure it's a string, just in case
      if (typeof clientName !== 'string') {
        clientName = String(clientName || '');
      }

      return {
        id: rec.id,
        coordinator: f['예약_ID'] || 'Unknown',
        status: f['진행상태'] || '상태없음',
        client: clientName || 'Unknown',
        type: f['유형'] || '',
        month: Array.isArray(f['정산월']) ? f['정산월'][0] : f['정산월'] || '',
        linkedMonth: Array.isArray(f['귀속 정산월']) ? f['귀속 정산월'][0] : f['귀속 정산월'] || '',
      };
    });

    return res.status(200).json({ records: cleanedRecords });

  } catch (error) {
    console.error('Admin Dashboard API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
