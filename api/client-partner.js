export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const partnerName = req.query.name;
    if (!partnerName) {
      return res.status(400).json({ error: '협력사 이름이 필요합니다 (?name=...)' });
    }

    const TOKEN = process.env.TAMLINK_API_KEY || process.env.VITE_AT_TOKEN;
    const BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
    const CAMP_TB = encodeURIComponent('Campaign_DB');

    // 필터: 협력사 컬럼이 일치하는 레코드 검색
    const formula = encodeURIComponent(`{협력사}='${partnerName}'`);
    
    // 가져올 필드 목록 지정 (트래픽 최적화)
    const fields = ['계약명', '고객사명', '지점명', '계약월', '인플_요청', '인플_실적', '체험단_요청', '체험_실적', '기자단_요청', '기자_실적'];
    const fieldQ = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
    
    const url = `https://api.airtable.com/v0/${BASE_ID}/${CAMP_TB}?filterByFormula=${formula}&${fieldQ}`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Airtable error: ${errText}`);
    }

    const data = await response.json();
    
    const campaigns = data.records.map(rec => {
      const cf = rec.fields;
      return {
        id: rec.id,
        campaignName: cf['계약명'] || '',
        brandName: Array.isArray(cf['고객사명']) ? cf['고객사명'][0] : (cf['고객사명'] || ''),
        branchName: Array.isArray(cf['지점명']) ? cf['지점명'][0] : (cf['지점명'] || ''),
        month: cf['계약월'] || '',
        stats: {
          infl_target: cf['인플_요청'] || 0, infl_done: cf['인플_실적'] || 0,
          exp_target: cf['체험단_요청'] || 0, exp_done: cf['체험_실적'] || 0,
          press_target: cf['기자단_요청'] || 0, press_done: cf['기자_실적'] || 0,
        }
      };
    });

    return res.status(200).json({ partnerName, campaigns });
    
  } catch (error) {
    console.error('Partner API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
