/**
 * Quick helper: list Campaign_DB fields from a few records to find
 * the exact field name for 체험단 목표수량 and 계약월
 */
const AIRTABLE_API_KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Campaign_DB?maxRecords=5`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
    const d = await r.json();
    // Return raw fields so we can see field names
    return res.status(200).json({ fields: d.records?.map(r => Object.keys(r.fields)) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
