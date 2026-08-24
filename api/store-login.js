/* eslint-env node */
/**
 * 따종디엔핑 상인포털 로그인 정보 — 고객사 공유 화면에서 '보기'를 눌렀을 때만 내려준다.
 * GET /api/store-login?campaignId=recXXXXXXXXXXXXXX
 *
 * 왜 별도 엔드포인트인가 (2026-08-21 Owner 요청):
 *   고객사가 "우리 따종 아이디·비번이 뭐냐"고 물을 때마다 담당자가 Airtable 을 뒤져야 했다.
 *   비번은 우리가 주기적으로 바꾸므로 옛 값을 알려주는 사고도 난다 → 화면에서 바로 보이게 한다.
 *   다만 client-schedule 응답에 실으면 **화면을 열기만 해도** 비번이 페이로드에 실려
 *   캐시·스크린샷·개발자도구에 남는다. 그래서 누를 때만 부르는 전용 통로로 분리했다.
 *   (client-schedule.js 의 "자격증명은 값이 아니라 존재 여부만 쓴다" 정책은 그대로 둔다.)
 *
 * ⚠️ 이 링크는 로그인이 없다 — 링크를 가진 사람 = 그 매장 정보를 볼 자격이 있는 사람이라는
 *    전제 위에 서 있다. 링크가 유출되면 그 매장의 포털 계정도 함께 유출된다.
 *    그래서 ① 매장 하나만(campaignId 로 특정) ② 캐시 금지 ③ 로그 남김 으로 제한한다.
 */

const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const CAMPAIGN_TABLE = encodeURIComponent('Campaign_DB');
const CS_TABLE = encodeURIComponent('CS_DB');

// 백슬래시부터 늘려야 한다 — replace(/'/g, "\'") 는 no-op (_admin-auth.js 와 같은 규칙)
const escFormula = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const one = (v) => (Array.isArray(v) ? v[0] : v);
const txt = (v) => String(one(v) ?? '').trim();

async function atGet(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export default async function handler(req, res) {
  // 같은 오리진에서만 부르는 API — CORS 헤더를 두지 않는다 (CLAUDE.md §5)
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!TOKEN) return res.status(503).json({ error: '서버 설정이 완료되지 않았습니다.' });

  const campaignId = String(req.query.campaignId || '');
  if (!/^rec[A-Za-z0-9]{14}$/.test(campaignId)) {
    return res.status(400).json({ error: 'campaignId 형식이 올바르지 않습니다.' });
  }

  try {
    const camp = await atGet(`https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGN_TABLE}/${campaignId}`);
    const cf = camp.fields || {};
    const storeCode = txt(cf['DP_매장코드']);
    const brand = txt(cf['고객사명']);
    const branch = txt(cf['지점명']);

    // ① 매장코드로 CS_DB 를 찾는다(정확). 없으면 ② 고객사명+지점명으로 보정.
    const FIELDS = ['DP_계정ID', 'DP_계정PW', 'DP_계정수정일', '매장명_검색용']
      .map((f) => `fields%5B%5D=${encodeURIComponent(f)}`).join('&');
    let store = null;

    if (storeCode) {
      const f = encodeURIComponent(`{DP_매장코드}='${escFormula(storeCode)}'`);
      const d = await atGet(`https://api.airtable.com/v0/${BASE_ID}/${CS_TABLE}?filterByFormula=${f}&maxRecords=1&${FIELDS}`);
      store = (d.records || [])[0] || null;
    }
    if (!store && brand) {
      const conds = [`{고객사명(필수)}='${escFormula(brand)}'`];
      if (branch) conds.push(`{지점명(필수)}='${escFormula(branch)}'`);
      const f = encodeURIComponent(`AND(${conds.join(',')})`);
      const d = await atGet(`https://api.airtable.com/v0/${BASE_ID}/${CS_TABLE}?filterByFormula=${f}&maxRecords=1&${FIELDS}`);
      store = (d.records || [])[0] || null;
    }

    const sf = (store && store.fields) || {};
    const id = txt(sf['DP_계정ID']);
    const pw = txt(sf['DP_계정PW']);
    if (!id && !pw) {
      // 계정이 없는 매장(따종 미운영·미입점) — 404 로 감추지 않고 사유를 준다(화면이 안내문을 띄운다)
      return res.status(200).json({ ok: false, reason: 'none' });
    }

    // 누가 열었는지는 알 수 없지만(로그인 없는 링크), 어느 매장 것이 언제 열렸는지는 남긴다.
    console.log(`[store-login] ${campaignId} → ${txt(sf['매장명_검색용']) || storeCode || brand}`);

    return res.status(200).json({
      ok: true,
      id,
      pw,
      updated: txt(sf['DP_계정수정일']) || null,
      store: txt(sf['매장명_검색용']) || [brand, branch].filter(Boolean).join(' '),
    });
  } catch (err) {
    console.error('[store-login] error:', err.message);
    return res.status(500).json({ error: '로그인 정보를 불러오지 못했습니다.' });
  }
}
