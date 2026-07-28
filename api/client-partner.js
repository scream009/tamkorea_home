export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let partnerName = req.query.name;
    if (!partnerName) {
      return res.status(400).json({ error: '협력사 이름이 필요합니다 (?name=...)' });
    }
    if (partnerName.includes('에코')) {
      partnerName = '에코';
    }

    const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY
                || process.env.VITE_AT_TOKEN;
    const BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
    const CAMP_TB = encodeURIComponent('Campaign_DB');

    // 계약월 필터 — ?month=2026. 7월 처럼 넘기면 그 달 실적만.
    // 협력사마다 계약월이 섞여 있어 월 구분 없이 보면 지난달 건까지 함께 나온다.
    // ?month=2607 (YYMM) 또는 "2026. 7월" 둘 다 허용
    const ymToLabel = (v) => {
      const d = String(v || '').replace(/\D/g, '');
      if (d.length === 4) return `20${d.slice(0, 2)}. ${Number(d.slice(2))}월`;
      if (d.length === 6) return `${d.slice(0, 4)}. ${Number(d.slice(4))}월`;
      return '';
    };
    const rawMonth = (req.query.month || '').trim();
    const monthQ = rawMonth ? (ymToLabel(rawMonth) || rawMonth) : '';
    const esc = (v) => String(v).replace(/'/g, "\'");

    // 필터: 협력사 컬럼이 일치하는 레코드 검색
    let base;
    if (partnerName === '에코') {
      // 표시는 '에코'로 통일하되 대상은 제주에코만 (서울에코는 별개 협력사)
      base = "{협력사}='제주에코'";
    } else {
      base = `{협력사}='${esc(partnerName)}'`;
    }
    const formula = encodeURIComponent(
      monthQ ? `AND(${base}, {계약월}='${esc(monthQ)}')` : base
    );
    
    // 필드를 지정하지 않는다. 특정 필드만 요청하면 Airtable 스키마가 리네임될 때
    // UNKNOWN_FIELD_NAME 으로 500 이 난다 — 실제로 '인플_실적' 이 사라져 이 API 가
    // 계속 500 이었다(프론트가 Airtable 을 직접 불러서 드러나지 않았을 뿐).
    // client-schedule.js 도 같은 이유로 전체 필드를 받는다.
    const url = `https://api.airtable.com/v0/${BASE_ID}/${CAMP_TB}?filterByFormula=${formula}&pageSize=100`;
    
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
          infl_target: cf['인플_목표'] || cf['인플_요청'] || cf['# 인플_목표'] || cf['# 인플_요청'] || 0,
          infl_done: cf['인플_방문'] || cf['# 인플_방문'] || cf['인플_실적'] || cf['# 인플_실적'] || 0,
          exp_target: cf['체험_목표'] || cf['체험단_요청'] || cf['# 체험_목표'] || cf['# 체험단_요청'] || 0,
          exp_done: cf['체험_방문'] || cf['# 체험_방문'] || cf['체험_실적'] || cf['# 체험_실적'] || 0,
          press_target: cf['기자_목표'] || cf['기자단_요청'] || cf['# 기자_목표'] || cf['# 기자단_요청'] || 0,
          press_done: cf['기자_실적'] || cf['# 기자_실적'] || 0,
        }
      };
    });

    // 화면에서 월을 고를 수 있도록 이 협력사가 가진 계약월 전체를 함께 준다.
    // (월 필터가 걸려 있으면 결과에 그 달만 남으므로 별도로 한 번 더 조회한다)
    let months = [];
    try {
      const mUrl = `https://api.airtable.com/v0/${BASE_ID}/${CAMP_TB}`
        + `?filterByFormula=${encodeURIComponent(base)}`
        + `&fields[]=${encodeURIComponent('계약월')}&pageSize=100`;
      let off = null, all = [];
      do {
        const r = await fetch(off ? `${mUrl}&offset=${off}` : mUrl,
                              { headers: { Authorization: `Bearer ${TOKEN}` } });
        if (!r.ok) break;
        const d = await r.json();
        all = all.concat(d.records || []);
        off = d.offset || null;
      } while (off);
      months = [...new Set(all.map(x => x.fields['계약월']).filter(Boolean))]
        .sort((a, b) => {
          const p = (v) => { const m = String(v).match(/(\d{4})\D+(\d{1,2})/); return m ? +m[1] * 12 + +m[2] : 0; };
          return p(a) - p(b);
        });
    } catch (e) {
      console.error('[client-partner] months lookup failed:', e.message);
    }

    return res.status(200).json({ partnerName, month: monthQ || null, months, campaigns });
    
  } catch (error) {
    console.error('Partner API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
