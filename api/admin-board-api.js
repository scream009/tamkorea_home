/**
 * Admin Board API Handler (Vercel Serverless Function)
 * Proxies Airtable requests securely.
 *
 * 정산·계약 데이터를 통째로 읽고 쓰는 엔드포인트라 관리자 게이트 뒤에 둔다.
 * 게이트를 통과 못하면 404 — 존재 자체를 숨긴다(_admin-auth.js 참조).
 */

import { blockedByAdminGate, escFormula } from './_admin-auth.js';

async function fetchAll(table, formula, fields) {
  let allRecords = [];
  let offset = '';
  const AIRTABLE_API_KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
  
  do {
    const params = new URLSearchParams();
    if (formula) params.set('filterByFormula', formula);
    if (fields) {
      fields.forEach(f => params.append('fields[]', f));
    }
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

export default async function handler(req, res) {
  // CORS 헤더를 두지 않는다. 관리자 화면은 같은 오리진(/api/...)에서 부르므로
  // preflight 자체가 없고, `Allow-Origin: *` 는 아무 사이트에서나 이 API 를
  // 부를 수 있게 만들던 통로였다.

  if (blockedByAdminGate(req, res)) return;

  try {
    const { action, client } = req.query;

    // 1. Fetch Campaigns (Targets)
    if (req.method === 'GET' && action === 'campaigns') {
      const records = await fetchAll('Campaign_DB', null, null); // fetch all fields
      return res.status(200).json(records);
    }

    // 2. Fetch Progress (by Client)
    if (req.method === 'GET' && action === 'progress') {
      if (!client) return res.status(400).json({ error: 'Client required' });

      // 사용자 입력을 수식에 그대로 넣던 자리다(formula injection).
      // 이스케이프만으로 끝내지 않고 길이도 자른다 — 매장코드는 짧다.
      if (String(client).length > 100) return res.status(400).json({ error: 'Client too long' });
      const formula = `FIND('${escFormula(client)}', {매장코드})`;
      const records = await fetchAll('진행_DB_OLD', formula, null);
      
      // Send raw records back so frontend has all fields (links, status, original fields, etc)
      return res.status(200).json(records);
    }

    // 3. Bulk Patch Updates
    if (req.method === 'PATCH' && action === 'bulk_update') {
      const { updates } = req.body;
      if (!Array.isArray(updates)) return res.status(400).json({ error: 'Updates must be an array' });

      const AIRTABLE_API_KEY = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN;
      const AIRTABLE_BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';

      const chunkSize = 10;
      const results = [];
      const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/%EC%A7%84%ED%96%89_DB_OLD`;

      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        
        const body = {
          records: chunk.map(u => ({
            id: u.id,
            fields: {
              "정산월": u.newMonth,
              "유형": u.newType,
              ...(u.newCampaignId ? { "귀속 정산월": [u.newCampaignId] } : {})
            }
          }))
        };

        const response = await fetch(patchUrl, {
          method: 'PATCH',
          headers: { 
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || 'Airtable patch error');
        }
        const data = await response.json();
        results.push(data);
      }
      
      return res.status(200).json({ success: true, results });
    }

    return res.status(404).json({ error: 'Action not found' });

  } catch (error) {
    console.error('Admin Board API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
