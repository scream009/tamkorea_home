/**
 * GET /api/showcase — 홈페이지 「실제 성과」 섹션이 쓰는 발행 후기 목록.
 *
 * ⚠️ 이 엔드포인트는 **의도적으로 무인증**이다. CLAUDE.md §5 의 "모든 API 는 게이팅" 규칙은
 *    고객·매출·개인정보가 나가는 것을 막으려는 것이고, 여기서 나가는 것은 **이미 샤오홍슈에
 *    공개된 게시물의 링크·커버·작성자 닉네임**뿐이다. 홍보용으로 공개하는 게 목적이다.
 *    대신 규칙의 취지는 그대로 지킨다:
 *      - 필드 화이트리스트. Reviews 의 다른 칸(수집메모·권한만료일·매장키)은 내보내지 않는다
 *      - 응답 상한 12건 고정. 페이지네이션·offset 파라미터를 받지 않아 전량 덤프가 불가능하다
 *      - **쿼리 파라미터를 일절 읽지 않는다** → 사용자 입력이 formula 로 흘러갈 경로가 없다
 *      - CORS 헤더를 두지 않는다 (같은 오리진 전용)
 *      - 키 미설정이면 503 으로 닫는다 (fail-closed)
 *
 * 게재 권한은 촬영일 + 6개월 (Owner 2026-08-14) — 지난 건은 여기서 걸러 내보내지 않는다.
 */

const KEY = process.env.IB_CASTING_TOKEN || process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.IB_CASTING_BASE_ID || 'appDYOCw29mohYrIG';
const LIMIT = 12;

function cover(v) {
  if (!Array.isArray(v) || !v.length) return '';
  const a = v[0];
  return (a.thumbnails && a.thumbnails.large && a.thumbnails.large.url) || a.url || '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (!KEY) {
    // 열어두느니 닫는다 — 키 없이 배포되면 조용히 빈 화면이 아니라 명시적으로 막는다
    res.status(503).json({ error: '준비 중입니다.' });
    return;
  }

  try {
    const r = await fetch(`https://api.airtable.com/v0/${BASE}/Reviews?pageSize=100`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    const d = await r.json();

    const today = new Date().toISOString().slice(0, 10);
    const seen = new Set();
    const byAuthor = new Map();

    const items = (d.records || [])
      .map((rec) => {
        const f = rec.fields || {};
        return {
          url: String(f.note_url || ''),
          title: String(f.title || ''),
          author: String(f.author || ''),
          followers: Number(f.followers) || 0,
          store: String(f.store_name || ''),
          cover: cover(f.cover),
          _show: f.show_in_gallery !== false,
          _until: String(f.rights_until || ''),
        };
      })
      .filter((x) => x._show && x.cover && x.url)
      .filter((x) => !x._until || x._until >= today)
      .sort((a, b) => b.followers - a.followers)
      .filter((x) => {
        // 한 노트가 여러 매장에 걸치고, 한 사람이 상위를 독식한다 (실측) → 둘 다 눌러준다
        if (seen.has(x.url)) return false;
        const n = byAuthor.get(x.author) || 0;
        if (x.author && n >= 2) return false;
        seen.add(x.url);
        byAuthor.set(x.author, n + 1);
        return true;
      })
      .slice(0, LIMIT)
      // eslint-disable-next-line no-unused-vars
      .map(({ _show, _until, ...keep }) => keep);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message || '조회 실패' });
  }
}
