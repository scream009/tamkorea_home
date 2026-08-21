/* eslint-env node */
/**
 * Gravity | 따종디엔핑 고객 현황 API (관리자 전용)
 *
 * GET /api/admin-dianping            → 목록. CS_DB 한 번만 읽는다.
 * GET /api/admin-dianping?slug=xxx   → 상세. 위 + 그 매장의 계약월별 리포트 목록.
 *
 * 왜 CS_DB 인가
 *   "지금 어떤 상태인가" = CS_DB(매장당 1행·덮어쓰기)
 *   "그 달에 무슨 일이 있었나" = Campaign_DB(계약월 스냅샷)
 *   목록은 현재 상태만 보므로 CS_DB 한 방이면 된다. 월별 이력은 상세에서만 읽는다.
 *
 * 인증은 _admin-auth.js — env 시크릿 + timingSafeEqual + 실패 시 404(존재 은폐).
 * ⚠️ 이건 계약·정산 데이터다. CORS 헤더를 두지 않는다(같은 오리진에서만 부른다).
 */
import { blockedByAdminGate, escFormula } from './_admin-auth.js';

const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';

async function atFetch(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function fetchAll(table, { formula, fields } = {}) {
  const out = [];
  let offset = '';
  do {
    const p = new URLSearchParams();
    p.set('pageSize', '100');
    if (formula) p.set('filterByFormula', formula);
    (fields || []).forEach((f) => p.append('fields[]', f));
    if (offset) p.set('offset', offset);
    const j = await atFetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}?${p}`);
    out.push(...(j.records || []));
    offset = j.offset || '';
  } while (offset);
  return out;
}

// 계약월 "2026. 7월" → 정렬 키
const monthKey = (v) => {
  const m = String(v || '').match(/(\d{4})\D+(\d{1,2})/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : 0;
};

// CPT 만료까지 남은 일수 — 만료된 매장이 트래픽 미제공의 실제 원인인 경우가 있다
function cptDays(expire) {
  if (!expire) return null;
  const t = Date.parse(`${String(expire).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((t - today) / 86400000);
}

function toRow(f) {
  const expire = f['DP_CPT_만료일'] || null;
  const d = cptDays(expire);
  return {
    officeId: String(f['DP-office_ID'] || ''),
    name: f['매장명_검색용'] || f['고객사명(필수)'] || '',
    brand: f['고객사명(필수)'] || '',
    branch: f['지점명(필수)'] || '',
    cn: f['DP_중문명'] || '',
    category: f['DP_업종_한글'] || f['DP_업종'] || null,
    shopType: f['DP_상점유형'] ?? null,
    // 계정
    status: f['DP_광고상태'] || null,
    // 캠페인 자체의 상태 — 잔액과 별개다. paused 는 '설정은 살아 있고 꺼져 있음'.
    campaign: f['DP_캠페인상태'] || null,
    pauseReason: f['DP_정지사유'] || null,
    campaignCnt: f['DP_캠페인수'] ?? null,
    balance: f['DP_잔액'] ?? null,
    spend: f['DP_일소진'] ?? null,
    daysLeft: f['DP_소진예상일'] ?? null,
    chargedAt: f['DP_최근충전일'] || null,
    balanceAt: f['DP_잔액확인일'] || null,
    // 잔액이 0 이 된 날 — 플랫폼이 이력을 안 줘서 수집기가 관측으로 판정한다.
    // '며칠째 멈춰 있나'를 사람이 로그를 뒤져 세던 걸 대신한다(2026-08-21).
    depletedAt: f['DP_소진일'] || null,
    depletedDays: f['DP_소진경과일'] ?? null,
    depletedApprox: !!f['DP_소진일_근사'],
    // 광고 설정
    budget: f['DP_일예산'] ?? null,
    floatRatio: f['DP_주말할증'] ?? null,
    peak: f['DP_피크예산'] ?? null,
    bid: f['DP_클릭단가'] ?? null,
    hours: f['DP_노출시간'] || null,
    hoursOn: f['DP_주간노출시간'] ?? null,
    planId: f['DP_캠페인ID'] || null,
    settingAt: f['DP_설정확인일'] || null,
    // CPT
    cptExpire: expire, cptState: f['DP_CPT_상태'] || null, cptDaysLeft: d,
    cptExpired: d != null && d < 0,
    // 리뷰
    bad7: f['DP_악평_7일'] ?? null,
    bad30: f['DP_악평_30일'] ?? null,
    badTotal: f['DP_악평_누적'] ?? null,
    reviewAt: f['DP_리뷰확인일'] || null,
  };
}

const CS_FIELDS = [
  'DP-office_ID', '매장명_검색용', '고객사명(필수)', '지점명(필수)', 'DP_중문명',
  'DP_업종', 'DP_업종_한글', 'DP_상점유형',
  'DP_광고상태', 'DP_캠페인상태', 'DP_정지사유', 'DP_캠페인수',
  'DP_잔액', 'DP_일소진', 'DP_소진예상일', 'DP_최근충전일', 'DP_잔액확인일',
  'DP_소진일', 'DP_소진경과일', 'DP_소진일_근사',
  'DP_일예산', 'DP_주말할증', 'DP_피크예산', 'DP_클릭단가', 'DP_노출시간',
  'DP_주간노출시간', 'DP_캠페인ID', 'DP_설정확인일',
  'DP_CPT_만료일', 'DP_CPT_상태', 'DP_악평_7일', 'DP_악평_30일', 'DP_악평_누적', 'DP_리뷰확인일',
];

export default async function handler(req, res) {
  if (blockedByAdminGate(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 따종을 쓰는 매장만 — office_ID 가 있어야 포털 계정이 있는 것이다.
    const recs = await fetchAll('CS_DB', {
      formula: 'AND({DP-office_ID} != "")',
      fields: CS_FIELDS,
    });

    // slug(DP_매장코드)는 CS_DB 에 없고 Campaign_DB 에만 있다.
    // 상세(계약월별 리포트)를 열려면 필요하므로 여기서 매핑을 만들어 붙인다.
    // Campaign_DB → 업체명(CS_DB 링크) 로 연결한다.
    const slugByCs = {};
    try {
      const camps = await fetchAll('Campaign_DB', {
        formula: '{DP_매장코드} != ""',
        fields: ['DP_매장코드', '업체명'],
      });
      for (const c of camps) {
        const slug = c.fields['DP_매장코드'];
        for (const csId of (c.fields['업체명'] || [])) {
          if (slug) slugByCs[csId] = slug;
        }
      }
    } catch (e) {
      // 매핑 실패는 목록 자체를 막지 않는다 — 상세만 못 열릴 뿐이다.
      console.error('[admin-dianping] slug 매핑 실패:', e.message);
    }

    const rows = recs
      .map((r) => ({ id: r.id, slug: slugByCs[r.id] || null, ...toRow(r.fields) }))
      // 기본은 가나다 — 목록의 첫 용도가 '그 매장 찾기' 다.
      // 악평순 등 다른 기준은 화면에서 다시 정렬한다(전 매장을 통째로 내려주므로 서버 왕복 불필요).
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));

    const slug = String(req.query.slug || '').trim();
    if (!slug) {
      // 목록 화면이 바로 쓸 수 있게 요약도 같이 준다
      const n = (p) => rows.filter(p).length;
      return res.status(200).json({
        rows,
        summary: {
          total: rows.length,
          running: n((r) => r.status && r.status.includes('정상')),
          lowBalance: n((r) => r.status && r.status.includes('소진임박')),
          needCharge: n((r) => r.status && r.status.includes('충전필요')),
          paused: n((r) => r.status && r.status.includes('정지')),
          idle: n((r) => r.status && r.status.includes('미집행')),
          cptExpired: n((r) => r.cptExpired),
          bad7Total: rows.reduce((s, r) => s + (r.bad7 || 0), 0),
          noSetting: n((r) => r.bid == null),
        },
      });
    }

    // ── 상세: 그 매장의 계약월별 리포트 ────────────────────
    // 화이트리스트로 먼저 거른다 — 이스케이프에만 기대지 않는다.
    if (!/^[a-z0-9_]{1,40}$/i.test(slug)) {
      return res.status(400).json({ error: 'bad slug' });
    }
    const camp = await fetchAll('Campaign_DB', {
      formula: `{DP_매장코드}='${escFormula(slug)}'`,
      fields: ['계약월', 'DP_기간', 'DP_노출', 'DP_클릭', 'DP_방문', 'DP_순위', 'DP_전월비',
               'DP_호평률', 'DP_중차평수', 'CPC_현재잔액', 'CPC_현재소진', 'AD_총소진',
               '따종리포트_URL', 'DP_매장코드'],
    });
    const months = camp
      .map((r) => {
        const f = r.fields;
        return {
          id: r.id, month: f['계약월'] || '', k: monthKey(f['계약월']),
          period: f['DP_기간'] || null,
          exposure: f['DP_노출'] ?? null, click: f['DP_클릭'] ?? null,
          visit: f['DP_방문'] ?? null, rank: f['DP_순위'] ?? null,
          mom: f['DP_전월비'] || null, good: f['DP_호평률'] ?? null,
          bad: f['DP_중차평수'] ?? null, spend: f['AD_총소진'] ?? null,
          // 리포트를 돌린 달에만 링크가 있다(빈 달을 눌렀다 빈 화면 보는 일이 없게)
          reportUrl: f['따종리포트_URL'] || null,
        };
      })
      .filter((m) => m.k > 0)
      .sort((a, b) => b.k - a.k);

    // 목록은 화면이 이미 들고 있다 — 상세는 월별 이력만 돌려준다.
    return res.status(200).json({ slug, months });
  } catch (e) {
    console.error('[admin-dianping]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
