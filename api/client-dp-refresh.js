/**
 * Gravity | 고객 대시보드 — 따종디엔핑 실시간 조회 (VIP 온디맨드)
 *
 *   GET  /api/client-dp-refresh?campaignId=recXXXXXXXXXXXXXX   상태 + 마지막 조회값
 *   POST /api/client-dp-refresh  { campaignId }                조회 요청을 큐에 넣는다
 *
 * 큐 구조는 어드민 [⚡ 조회+전송]과 **같다**(api/admin-dianping.js · meituan_automation/dp_worker.py).
 *   여기(웹)  →  CS_DB.DP_조회요청 ✓ + DP_전송요청 ✓ + DP_조회요청시각 = now
 *              ▼  PC C 워커가 낮 60초마다 본다
 *   워커      →  portal_lock → vip_collect → vip_report → CS_DB 에 숫자 기록 + PNG 첨부
 *              →  vip_send.py --approve → 단체메시지_DB '승인' → 예약봇이 그 매장 톡방으로 발송
 *   여기(웹)  →  GET 폴링으로 그 값을 읽어 화면에 띄우고, [리포트 보기]로 PNG 를 연다
 *
 * 🔴 2026-09-23 변경(Owner): 버튼 한 번이 **고객사 톡방으로 카톡을 보낸다.** 사람 확인이 없다.
 *    되돌리려면 아래 POST 에서 `DP_전송요청` 한 줄을 빼면 조회만 한다.
 *
 * 🔴 이 엔드포인트는 **인증이 없는 공유 링크**에서 불린다(예약 톡방에 뿌린 대시보드).
 *    campaignId 는 데이터 스코핑용 공유 토큰이지 인증이 아니다. 그래서:
 *      · CORS 헤더를 두지 않는다 — 같은 오리진에서만 부른다(쓰기 엔드포인트에 `*` 는 금지)
 *      · POST 는 Origin/Referer 가 우리 도메인일 때만 받는다
 *      · **리뷰서비스 ✓ 매장만** 연다. 아니면 존재를 숨긴다(404)
 *      · 쿨다운·시간대·중복요청 가드로 포털을 두드리는 횟수를 묶는다
 *        (조회 한 번이 PC C 에서 실제 브라우저로 포털을 연다 — 무제한이면 세션이 죽는다)
 *
 * 🔴 GET 은 아무것도 쓰지 않는다. 카톡·메신저가 링크를 미리 열어 보기 때문에
 *    GET 에 쓰기를 달면 아무도 안 눌러도 요청이 쌓인다(CLAUDE.md §5).
 */

const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';

const CAMPAIGN_TABLE = encodeURIComponent('Campaign_DB');
const CS_TABLE = encodeURIComponent('CS_DB');

// ⚠️ 백슬래시를 **먼저** 늘린다. 순서를 바꾸면 `\` 로 끝나는 값이 뒤 따옴표를 삼킨다.
const escFormula = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const RE_CAMPAIGN = /^rec[A-Za-z0-9]{14}$/;
const RE_SLUG = /^[A-Za-z][A-Za-z0-9_]{2,30}$/;

// 조회 한 번 = PC C 가 포털을 실제로 연다. 사람이 연타해도 포털은 한 번만 두드린다.
// 🔴 조회 한 번이 **고객사 톡방으로 카톡까지** 나간다(아래 POST 의 DP_전송요청).
//    09-23 저녁에 도배를 걱정해 30분으로 올렸다가 **Owner 판단으로 10분으로 되돌렸다**
//    — "여러 고객사가 동시다발적으로 계속 돌리지는 않는다". 이론상 상한(09~22시 78건)보다
//    실제 사용 빈도를 기준으로 잡은 것이다. 도배가 실제로 생기면 그때 다시 올린다.
//    톡방 발송만 따로 더 길게 묶으려면 CS_DB 에 '마지막 전송시각' 필드가 하나 필요하다 —
//    지금은 없어서 조회 쿨다운이 곧 전송 쿨다운이다.
const COOLDOWN_MIN = 10;
// 워커가 60초마다 보는데 이만큼 지나도 안 집어가면 PC 가 꺼져 있거나 야간 배치에 막힌 것이다.
const PICKUP_TIMEOUT_MIN = 5;
// 워커 쪽 STALE_MIN(30분)과 같은 값 — 이보다 오래된 요청은 워커가 버린다.
const STALE_MIN = 30;
// 영업시간 밖에는 받지 않는다. 02:00 야간 배치가 포털 락을 한 시간 넘게 쥔다(PC C 실측 02:00~03:06+).
// 🔴 2026-09-23 Owner: 22 → 24. 새벽까지 여는 고객사가 있고, 21시에 광고가 꺼지므로
//    22~24시 조회는 '그날 최종 실적 확인' 으로 쓸모가 있다.
//    ⚠️ 이 값은 dp_worker.py 의 낮 판정(`9 <= h < 24`, 60초 주기)과 **짝이다.**
//    워커가 23시부터 300초로 느려지면 요청을 집는 데만 5분이 걸려 화면이 먼저 포기한다.
//    한쪽만 고치지 말 것.
const OPEN_H = 9;
const CLOSE_H = 24;

const ALLOWED_HOSTS = new Set(['tamkorea.com', 'www.tamkorea.com']);

const nowKstHour = () => Number(
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false })
    .format(new Date()),
);

const minutesSince = (iso) => {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 60000;
};

// 'MM.DD HH:MM' (KST). ko-KR 기본 포맷은 '09. 23. 15:30' 처럼 점·공백이 섞여 나와
// 그대로 붙이면 '09.23.15:30' 이 된다 — 날짜와 시각이 안 갈린다. 조각으로 직접 만든다.
const fmtKst = (iso) => {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(t)).map((x) => [x.type, x.value]),
  );
  if (!p.month || !p.hour) return null;
  return `${p.month}.${p.day} ${p.hour}:${p.minute}`;
};

// 없는 레코드를 404 로 구분하기 위한 표식. 500 을 내면 '형식은 맞는데 뭔가 터졌다'는
// 정보를 주고, 로그에도 남의 오타가 에러로 쌓인다.
const NOT_FOUND = Symbol('not-found');

async function at(path, init) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  // 🔴 Airtable 은 없는 레코드에 404 가 아니라 **403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND** 를 준다
  //    (실측 2026-09-23). 둘 다 '없음'으로 본다. 토큰 권한이 진짜로 깨진 경우라면 정상 레코드도
  //    같이 실패하므로 바로 드러난다 — 공유 링크에 오타를 넣었을 때 500 을 주는 쪽이 더 나쁘다.
  if (res.status === 404 || res.status === 403) return NOT_FOUND;
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** campaignId → { slug, cs } · 자격 없으면 null. 여기가 유일한 게이트다. */
async function resolve(campaignId) {
  const camp = await at(`${CAMPAIGN_TABLE}/${campaignId}`);
  if (camp === NOT_FOUND) return null;
  const raw = camp?.fields?.['DP_매장코드'];
  const slug = String(Array.isArray(raw) ? (raw[0] || '') : (raw || '')).trim();
  if (!slug || !RE_SLUG.test(slug)) return null;

  const q = `?pageSize=1&filterByFormula=${encodeURIComponent(`{DP_매장코드}='${escFormula(slug)}'`)}`;
  const cs = await at(`${CS_TABLE}${q}`);
  if (cs === NOT_FOUND) return null;
  const rec = (cs.records || [])[0];
  if (!rec) return null;
  // 🔴 Owner 기준(2026-09-23): 어드민 리뷰서비스 탭에서 체크된 고객사에만 연다.
  if (!rec.fields['리뷰서비스']) return null;
  // 일시중지된 매장은 서비스가 멈춘 상태다 — 버튼도 같이 내린다.
  if (rec.fields['리뷰서비스_일시중지']) return null;
  return { slug, id: rec.id, f: rec.fields };
}

/** 화면에 내보낼 상태. 자격·값·진행 여부만. 자격증명이나 내부 경로는 절대 안 내보낸다. */
function statusOf(f) {
  const requested = !!f['DP_조회요청'];
  const reqMin = minutesSince(f['DP_조회요청시각']);
  const doneIso = f['DP_수시확인일'] || null;
  const doneMin = minutesSince(doneIso);

  let phase = 'idle';
  if (requested) {
    if (reqMin != null && reqMin > STALE_MIN) phase = 'expired';
    else if (reqMin != null && reqMin > PICKUP_TIMEOUT_MIN) phase = 'slow';
    else phase = 'running';
  }

  const clk = f['DP_오늘클릭'];
  const spend = f['DP_오늘소진'];
  return {
    phase,
    // 🔴 첨부 URL 자체는 내보내지 않는다 — 약 2시간이면 만료돼서 열어 둔 화면에서 죽는다.
    //    있다/없다만 알려주고, 실제로 열 때 /api/client-dp-image 가 새 URL 로 302 한다.
    hasImage: (f['DP_조회이미지'] || []).length > 0,
    // 워커가 남기는 안내문 — '⏸ 포털 사용 중', '🔄 수집 중', '완료 · … 기준', 실패 사유
    note: f['DP_조회결과'] || null,
    at: doneIso,
    atText: fmtKst(doneIso),
    ageMin: doneMin == null ? null : Math.floor(doneMin),
    live: doneIso ? {
      spend: spend ?? null,
      budget: f['DP_오늘예산'] ?? null,
      imp: f['DP_오늘노출'] ?? null,
      clk: clk ?? null,
      cpc: f['DP_실효단가'] ?? null,
    } : null,
    cooldownSec: (() => {
      const base = [f['DP_조회요청시각'], doneIso]
        .map(minutesSince).filter((v) => v != null);
      if (!base.length) return 0;
      const left = COOLDOWN_MIN - Math.min(...base);
      return left > 0 ? Math.ceil(left * 60) : 0;
    })(),
  };
}

export default async function handler(req, res) {
  // CORS 헤더를 두지 않는다 — 같은 오리진 전용(CLAUDE.md §5).
  if (!TOKEN) return res.status(503).json({ error: 'not configured' });

  const method = req.method;
  if (method !== 'GET' && method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const campaignId = String(
    (method === 'GET' ? req.query?.campaignId : (req.body?.campaignId ?? req.query?.campaignId)) || '',
  ).trim();
  if (!RE_CAMPAIGN.test(campaignId)) return res.status(400).json({ error: 'bad campaignId' });

  try {
    const target = await resolve(campaignId);
    // 자격 없음 = 존재를 숨긴다. 401 은 '여기 뭔가 있다'는 신호가 된다.
    if (!target) return res.status(404).json({ error: 'not found' });

    if (method === 'GET') {
      return res.status(200).json({ enabled: true, ...statusOf(target.f) });
    }

    // ── POST: 요청 접수 ────────────────────────────────────────
    // 같은 오리진에서만. 헤더가 아예 없는 요청(curl)은 막지 않으면 공유 링크만으로 큐를 채울 수 있다.
    const origin = req.headers.origin || req.headers.referer || '';
    if (origin) {
      let host = '';
      try { host = new URL(origin).hostname; } catch { host = ''; }
      if (!ALLOWED_HOSTS.has(host) && !host.endsWith('.vercel.app')) {
        return res.status(403).json({ error: 'forbidden' });
      }
    } else {
      return res.status(403).json({ error: 'forbidden' });
    }

    const st = statusOf(target.f);

    const h = nowKstHour();
    if (h < OPEN_H || h >= CLOSE_H) {
      return res.status(200).json({
        ok: false, reason: 'closed',
        message: `실시간 조회는 ${OPEN_H}시~${CLOSE_H}시에 이용하실 수 있습니다.`,
        ...st,
      });
    }
    if (st.phase === 'running' || st.phase === 'slow') {
      return res.status(200).json({ ok: false, reason: 'running', message: '이미 조회 중입니다.', ...st });
    }
    if (st.cooldownSec > 0) {
      return res.status(200).json({
        ok: false, reason: 'cooldown',
        message: `방금 조회했습니다. ${Math.ceil(st.cooldownSec / 60)}분 뒤에 다시 눌러 주세요.`,
        ...st,
      });
    }

    await at(`${CS_TABLE}/${target.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          'DP_조회요청': true,
          'DP_조회요청시각': new Date().toISOString(),
          // 🔴 전송까지 같이 요청한다(Owner 2026-09-23). 워커는 조회+전송이면
          //    수집 → 리포트 → vip_send(--approve) 로 이어가고, 예약봇이 **그 매장 톡방 한 곳**
          //    으로만 보낸다(대상 '개별' + 대상매장 지정). 사람 승인 단계는 없다.
          //    ⚠️ 끄려면 이 한 줄을 지우면 된다 — 조회만 하고 카톡은 안 나간다.
          'DP_전송요청': true,
          // 접수 문구. 워커가 집어가면 '🔄 수집 중' 으로 덮는다 — 화면은 그 변화를 보고 진행을 안다.
          'DP_조회결과': '접수됨 · 잠시만 기다려 주세요',
        },
      }),
    });

    const after = await at(`${CS_TABLE}/${target.id}`);
    const f2 = after === NOT_FOUND ? target.f : after.fields;
    return res.status(200).json({ ok: true, enabled: true, ...statusOf(f2) });
  } catch (err) {
    console.error('[client-dp-refresh]', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
}
