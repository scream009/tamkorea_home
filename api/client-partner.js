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
    let monthQ = rawMonth ? (ymToLabel(rawMonth) || rawMonth) : '';

    // ── 조회 가능 기간 제한 ────────────────────────────────────
    // 협력사 링크는 ?name=..&month=.. 조합이라 누구나 URL 을 고칠 수 있다.
    // 화면 버튼만 ±1 로 줄여도 month=2401 같이 직접 넣으면 옛 실적이 다 열린다.
    // 그래서 **서버가** 허용 범위를 정한다. 오래된 데이터는 값이 불완전해
    // 화면이 깨질 수 있어 노출 자체를 막는 것이 목적이다.
    // 전월·당월·다음달 3개만 연다. 그보다 이전은 데이터가 불완전해
    // 화면이 깨질 수 있고, 협력사에게 오래된 실적을 열어줄 이유도 없다.
    const MONTHS_BACK = 1;
    const MONTHS_FWD = 1;
    const now = new Date();
    const nowK = now.getFullYear() * 12 + (now.getMonth() + 1);
    const keyOf = (label) => {
      const m = String(label || '').match(/(\d{4})\D+(\d{1,2})/);
      return m ? Number(m[1]) * 12 + Number(m[2]) : 0;
    };
    const inRange = (label) => {
      const k = keyOf(label);
      return k > 0 && k >= nowK - MONTHS_BACK && k <= nowK + MONTHS_FWD;
    };
    if (monthQ && !inRange(monthQ)) {
      return res.status(200).json({
        partnerName, month: monthQ, months: [], campaigns: [],
        outOfRange: true,
        message: '조회 가능 기간이 아닙니다 (전월·당월·다음달만 조회할 수 있습니다).',
      });
    }
    const esc = (v) => String(v).replace(/'/g, "\'");

    // 필터: 협력사 컬럼이 일치하는 레코드 검색
    let base;
    if (partnerName === '에코') {
      // 표시는 '에코'로 통일하되 대상은 제주에코만 (서울에코는 별개 협력사)
      base = "{협력사}='제주에코'";
    } else {
      base = `{협력사}='${esc(partnerName)}'`;
    }
    // 공유표출 체크된 캠페인만 노출한다.
    // 예전엔 '실적이 있으면 표시'로 추측했는데, 그러면 월초에 실적이 0이라
    // 전부 숨겨지고(협력사가 열면 빈 화면), 진행 예정 매장과 안 하는 매장이
    // 구분되지 않았다. 이제 담당자가 매월 명시적으로 체크한다.
    const parts = [base, '{공유표출}'];
    if (monthQ) parts.push(`{계약월}='${esc(monthQ)}'`);
    const formula = encodeURIComponent(`AND(${parts.join(', ')})`);
    
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
        .filter(inRange)
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
