/* eslint-env node */
/**
 * Gravity | 주간 리뷰 리포트 PDF 열기 (고객사 공유 링크)
 *
 * GET /api/client-review-pdf?campaignId=recXXXX[&week=2026-W37]
 *   → 302 redirect to the attachment URL
 *
 * 왜 리다이렉트인가 (2026-09-09)
 *   Airtable 첨부 URL 은 **발급 후 약 2시간이면 만료**된다. 페이지에 URL 을 그대로 박으면
 *   열어 둔 화면에서 링크가 조용히 죽는다. 그래서 누를 때마다 여기서 새 URL 을 받아 넘긴다.
 *
 * 접근 범위
 *   기존 공유 링크와 같은 모델 — campaignId(레코드 ID)를 아는 사람만 연다.
 *   campaignId → Campaign_DB → DP_매장코드 → 리뷰주간_DB 에서 그 매장 행만 고른다.
 *   ⚠️ 매장코드를 쿼리로 직접 받지 않는다. 받으면 남의 매장 리포트를 열 수 있다.
 *   CORS 헤더를 두지 않는다(같은 오리진에서만 부른다). 캐시도 두지 않는다(URL 이 만료된다).
 */
const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const CAMPAIGN = 'Campaign_DB';
const WEEKLY = '리뷰주간_DB';
const REC_RE = /^rec[A-Za-z0-9]{14}$/;
const WEEK_RE = /^\d{4}-W\d{2}$/;

async function at(path, params) {
  const p = new URLSearchParams(params || {});
  const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(path)}${p.toString() ? `?${p}` : ''}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

/** 최신 우선 정렬 — 주차 문자열(GGGG-Www)은 사전순이 곧 시간순이다. */
function pickRow(rows, week) {
  const done = rows
    .filter((r) => (r.fields['PDF'] || []).length && r.fields['발송상태'] === '완료')
    .sort((a, b) => String(b.fields['주차'] || '').localeCompare(String(a.fields['주차'] || '')));
  if (week) return done.find((r) => String(r.fields['주차'] || '') === week) || null;
  return done[0] || null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const campaignId = String(req.query?.campaignId || '');
    const week = String(req.query?.week || '');
    if (!REC_RE.test(campaignId)) return res.status(400).json({ error: 'campaignId 형식 오류' });
    if (week && !WEEK_RE.test(week)) return res.status(400).json({ error: 'week 형식 오류 (2026-W37)' });
    if (!TOKEN) return res.status(503).json({ error: 'Airtable 토큰이 설정되지 않았습니다' });

    let camp;
    try {
      camp = await at(`${CAMPAIGN}/${campaignId}`);
    } catch {
      return res.status(404).json({ error: 'Not found' });
    }
    const slug = String(camp.fields?.['DP_매장코드'] || '').trim();
    if (!slug) return res.status(404).json({ error: 'Not found' });

    // 매장코드는 우리가 정한 영문 코드라 formula 에 그대로 넣지 않고 형식을 먼저 거른다
    if (!/^[A-Za-z][A-Za-z0-9_]{2,30}$/.test(slug)) return res.status(404).json({ error: 'Not found' });
    const j = await at(WEEKLY, { pageSize: '100', filterByFormula: `{매장코드}='${slug}'` });
    const row = pickRow(j.records || [], week);
    if (!row) return res.status(404).json({ error: '아직 발행된 주간 리뷰 리포트가 없습니다' });

    const att = (row.fields['PDF'] || [])[0];
    if (!att?.url) return res.status(404).json({ error: '첨부를 찾지 못했습니다' });
    console.log('[client-review-pdf]', slug, row.fields['주차'], att.filename || '');
    res.setHeader('Location', att.url);
    return res.status(302).end();
  } catch (e) {
    console.error('[client-review-pdf]', e);
    return res.status(500).json({ error: String(e.message || e).slice(0, 160) });
  }
}
