/* eslint-env node */
/**
 * 담당자용 내부 문서 (/staff/doc/:key 의 데이터 소스)
 *
 * 문서 본문은 이 저장소에 두지 않는다 — 이 저장소는 GitHub 공개 repo 라서
 * 파일로 넣으면 누구나 읽는다. 본문은 IB_Casting 의 Staff_Docs 표에 HTML 첨부로 있고,
 * 담당자 키를 통과한 요청에만 여기서 내려준다.
 * 올리는 쪽: Sagan_MAS/04_IB캐스팅/tools/gen_review_2610.py --upload
 *
 * GET ?key=<doc_key>  →  { title, updated_at, html }
 */

import { staffIdentity } from './_staff-auth.js';

const TOKEN = process.env.IB_CASTING_TOKEN || process.env.TAMLINK_API_KEY
  || process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN;
const BASE = process.env.IB_CASTING_BASE_ID || 'appDYOCw29mohYrIG';
const TABLE = 'Staff_Docs';

export default async function handler(req, res) {
  const who = staffIdentity(req, res);
  if (!who) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET 만 받습니다.' });
  if (!TOKEN) return res.status(503).json({ error: 'Airtable 토큰이 설정되지 않았습니다.' });

  // 화이트리스트로 먼저 거른다 — formula 에 들어가는 값이라 이스케이프에 기대지 않는다
  const key = String(req.query?.key || '');
  if (!/^[a-z0-9-]{1,40}$/.test(key)) return res.status(400).json({ error: '문서 키 형식이 올바르지 않습니다.' });

  try {
    const qs = new URLSearchParams({ filterByFormula: `{doc_key}='${key}'`, maxRecords: '1' });
    const r = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}?${qs}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    const rec = (await r.json()).records?.[0];
    const att = rec?.fields?.html?.[0];
    if (!att?.url) return res.status(404).json({ error: '문서를 찾을 수 없습니다.' });

    const f = await fetch(att.url);   // 첨부 URL 은 서명돼 있고 몇 시간 뒤 만료 — 매번 새로 받는다
    if (!f.ok) throw new Error(`첨부 ${f.status}`);
    const html = await f.text();
    res.status(200).json({ title: rec.fields.title || key, updated_at: rec.fields.updated_at || '', html });
  } catch (e) {
    console.error('[staff-doc]', e);
    res.status(502).json({ error: '문서를 불러오지 못했습니다.' });
  }
}
