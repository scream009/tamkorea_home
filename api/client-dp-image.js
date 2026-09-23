/* eslint-env node */
/**
 * Gravity | 따종디엔핑 실시간 리포트 이미지 열기 (고객사 공유 링크)
 *
 * GET /api/client-dp-image?campaignId=recXXXXXXXXXXXXXX
 *   → 302 redirect to the attachment URL (CS_DB.DP_조회이미지)
 *
 * 왜 리다이렉트인가
 *   Airtable 첨부 URL 은 **발급 후 약 2시간이면 만료**된다. 화면에 URL 을 박아 두면
 *   열어 둔 대시보드에서 링크가 조용히 죽는다. 누를 때마다 여기서 새 URL 을 받아 넘긴다.
 *   `api/client-review-pdf.js` 와 같은 패턴이다.
 *
 * 🔴 게이트는 `api/client-dp-refresh.js` 의 resolve() 와 **같아야 한다.**
 *    거기서는 안 열리는데 여기서 열리면 이미지가 게이트 밖으로 새는 뒷문이 된다.
 *      · campaignId → Campaign_DB → DP_매장코드 → CS_DB 정확일치
 *      · 리뷰서비스 ✓ 이고 일시중지가 아닐 때만
 *      · 매장코드를 쿼리로 직접 받지 않는다 — 받으면 남의 매장 리포트를 연다
 *    CORS 헤더를 두지 않는다(같은 오리진 전용). 캐시도 두지 않는다(URL 이 만료된다).
 */
const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';

const CAMPAIGN = 'Campaign_DB';
const CS = 'CS_DB';
const FLD_IMG = 'DP_조회이미지';

const RE_CAMPAIGN = /^rec[A-Za-z0-9]{14}$/;
const RE_SLUG = /^[A-Za-z][A-Za-z0-9_]{2,30}$/;

// ⚠️ 백슬래시를 **먼저** 늘린다. 순서를 바꾸면 `\` 로 끝나는 값이 뒤 따옴표를 삼킨다.
const escFormula = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const NOT_FOUND = Symbol('not-found');

async function at(path, params) {
  const p = new URLSearchParams(params || {});
  // ⚠️ 경로를 통째로 encodeURIComponent 하면 `Campaign_DB/recXXX` 의 슬래시가 %2F 로 바뀌어
  //    Airtable 이 404 를 준다(client-review-pdf.js 2026-09-09 실측). 세그먼트만 인코딩한다.
  const seg = String(path).split('/').map(encodeURIComponent).join('/');
  const url = `https://api.airtable.com/v0/${BASE}/${seg}${p.toString() ? `?${p}` : ''}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  // 🔴 Airtable 은 없는 레코드에 404 가 아니라 403 을 주기도 한다(client-dp-refresh.js 실측).
  if (r.status === 404 || r.status === 403) return NOT_FOUND;
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!TOKEN) return res.status(503).json({ error: 'not configured' });

  const campaignId = String(req.query?.campaignId || '').trim();
  if (!RE_CAMPAIGN.test(campaignId)) return res.status(400).json({ error: 'bad campaignId' });

  try {
    const camp = await at(`${CAMPAIGN}/${campaignId}`);
    if (camp === NOT_FOUND) return res.status(404).json({ error: 'not found' });

    const raw = camp?.fields?.['DP_매장코드'];
    const slug = String(Array.isArray(raw) ? (raw[0] || '') : (raw || '')).trim();
    if (!slug || !RE_SLUG.test(slug)) return res.status(404).json({ error: 'not found' });

    const j = await at(CS, {
      pageSize: '1',
      filterByFormula: `{DP_매장코드}='${escFormula(slug)}'`,
    });
    if (j === NOT_FOUND) return res.status(404).json({ error: 'not found' });
    const rec = (j.records || [])[0];
    if (!rec) return res.status(404).json({ error: 'not found' });

    // 게이트 — client-dp-refresh.js 와 같은 조건. 자격 없으면 존재를 숨긴다.
    if (!rec.fields['리뷰서비스']) return res.status(404).json({ error: 'not found' });
    if (rec.fields['리뷰서비스_일시중지']) return res.status(404).json({ error: 'not found' });

    // 워커(replace_png)는 항상 1장만 남기지만, 교체가 덜 된 상황에서 **옛 이미지**를 여는 게
    // 제일 나쁘다 — 마지막(가장 최근 업로드)을 고른다.
    const atts = rec.fields[FLD_IMG] || [];
    const att = atts[atts.length - 1];
    if (!att?.url) {
      return res.status(404).json({ error: '아직 생성된 리포트 이미지가 없습니다' });
    }

    console.log('[client-dp-image]', slug, att.filename || '');
    res.setHeader('Location', att.url);
    return res.status(302).end();
  } catch (e) {
    console.error('[client-dp-image]', e.message);
    return res.status(500).json({ error: 'internal error' });
  }
}
