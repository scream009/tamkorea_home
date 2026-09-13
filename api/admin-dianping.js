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

async function atFetch(url, init = {}) {
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!r.ok) {
    const e = new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 200)}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

const csUrl = (id) => `https://api.airtable.com/v0/${BASE}/CS_DB/${id}`;
const csPatch = (id, fields) => atFetch(csUrl(id), { method: 'PATCH', body: JSON.stringify({ fields }) });

// ── 수시조회 요청의 신선도 ─────────────────────────────────────────────
// 🔴 요청 시각(DP_조회요청시각)은 **어드민만 쓴다. 워커는 읽기만 한다.**
//    예전엔 [전송] 때 시각을 안 남겨서 전송 요청은 판정할 기준이 없었고, 워커가 없으면
//    세 버튼이 무기한 잠겼다(2026-09-13 감사). 조회든 전송이든 요청마다 여기 기록한다.
// 🔴 워커는 집어간 뒤 수집이 끝날 때까지 결과칸에 **아무것도 안 쓴다**. 그래서 '손대지 않음'
//    기준이 워커 최악 지연보다 짧으면 한창 수집 중인 요청이 '응답 없음'으로 뜬다(5분이던 시절 리뷰 지적).
//    최악 = 밤 폴링 300초(dp_worker NIGHT_SEC) + vip_collect 제한 420초 + 여유 → 15분.
const REQ_WAIT_MS = 15 * 60 * 1000;   // 워커가 한 번도 손대지 않은 채 이만큼 → PC 가 안 집어갔다
const REQ_DEAD_MS = 35 * 60 * 1000;   // 워커가 손댄 뒤라도 이만큼 → 멈춘 것으로 본다
                                      // (워커는 30분 넘은 요청을 스스로 끈다 — 그 뒤 여유 5분)
// 포털 락 대기 표식(dp_worker WAIT_MARK) — 워커가 최대 LOCK_WAIT_MAX_MIN(180분) 붙잡아 둔다
const WAIT_MARK = '⏸ 포털 사용 중';
const REQ_LOCKWAIT_MS = 185 * 60 * 1000;
// stale 이 된 뒤에도 이 나이까지는 워커가 뒤늦게 결과·초안을 쓸 수 있다
// (30분 직전에 집어가면 수집 420초 + 리포트 + 업로드). 화면은 이 동안 느리게 계속 확인한다.
const REQ_WATCH_MS = 45 * 60 * 1000;
const ACCEPT_GET = '요청 접수 — PC 가 집어가길 기다리는 중';
const ACCEPT_SEND = '전송 요청 접수 — PC 가 초안을 만드는 중';
const CANCEL_NOTE = '어드민에서 요청 취소';

// 화면에서 Date.now() 를 부르면 렌더가 불순해져 lint 가 막는다(react-hooks/purity) — 서버가 계산한다.
function reqState(f) {
  const t = Date.parse(f['DP_조회요청시각'] || '');
  const age = Number.isNaN(t) ? null : Date.now() - t;
  const get = !!f['DP_조회요청'];
  const send = !!f['DP_전송요청'];
  // 결과 문구가 어드민이 쓴 접수 문구에서 바뀌었으면 워커가 한 번은 손댄 것이다
  const touchedGet = String(f['DP_조회결과'] || '').trim() !== ACCEPT_GET;
  const touchedSend = String(f['DP_전송결과'] || '').trim() !== ACCEPT_SEND;
  // 요청 뒤에 수시확인일이 찍혔으면 워커가 조회를 끝낸 것이다(조회+전송의 전송 대기 구간)
  const live = Date.parse(f['DP_수시확인일'] || '');
  const doneAfter = age != null && !Number.isNaN(live) && live >= t;
  const lockWait = String(f['DP_조회결과'] || '').startsWith(WAIT_MARK);
  const limitOf = (touched) => (!touched ? REQ_WAIT_MS : lockWait ? REQ_LOCKWAIT_MS : REQ_DEAD_MS);
  // 요청 시각 없이 켜진 체크(Airtable 에서 직접 켰거나 옛 판)는 잠그지 않는다 — 풀 방법이 없어진다
  const staleOf = (touched) => age == null || age > limitOf(touched);
  const refreshStale = get && staleOf(touchedGet);
  // 조회+전송이면 전송은 조회 뒤에 돈다 — 조회와 같은 판정을 따른다
  const sendStale = send && (get ? refreshStale : staleOf(touchedSend || doneAfter));
  // 🔴 취소 직후·stale 직후에도 워커가 수집 중이었을 수 있다 — 그러면 취소 문구를 '완료'로 덮고
  //    초안까지 만든다. 화면이 여기서 폴링을 끊으면 그걸 못 보고 다시 눌러 초안이 두 건 쌓인다.
  //    취소 문구의 시각이 요청 시각 이후일 때만 '이 요청의 취소'로 본다 — 안 그러면 전송 취소 뒤
  //    [지금 조회]만 끝난 매장에 남은 옛 취소 문구 때문에 45분간 헛경고·헛폴링이 돈다.
  const reqStamp = age == null ? '' : kstStamp(new Date(t)).slice(0, 11);
  const cancelled = !get && !send && !!reqStamp && [f['DP_조회결과'], f['DP_전송결과']].some((v) => {
    const s = String(v || '');
    const m = s.startsWith(CANCEL_NOTE) && s.match(/\((\d\d-\d\d \d\d:\d\d) KST\)/);
    return !!m && m[1] >= reqStamp;
  });
  const watchLimit = Math.max(REQ_WATCH_MS, lockWait ? REQ_LOCKWAIT_MS : 0);
  const recent = age != null && age <= watchLimit;
  return {
    refreshStale,
    sendStale,
    reqPickedUp: (get && touchedGet) || (send && (touchedSend || doneAfter)),
    // 워커가 아직 뒤늦게 쓸 수 있는 구간(stale 이거나 방금 취소함) — 화면은 느리게 계속 확인한다
    reqWatch: recent && ((refreshStale || sendStale) || cancelled),
  };
}

// 결과 칸에 남기는 시각 — 관리자가 읽는 문구라 한국 시간으로 적는다.
// ⚠️ 'sv-SE' 로 월·일만 뽑으면 '13/09'(일/월)로 나온다(실측) — 조각을 직접 잇는다.
function kstStamp(d = new Date()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.month}-${p.day} ${p.hour}:${p.minute} KST`;
  } catch {
    return d.toISOString();
  }
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
  const rq = reqState(f);
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
    // 계정 정보 — 관리자 화면에서 보고 고친다. 비번이 자주 바뀌는데
    // 그때마다 Airtable 을 직접 열기는 번거롭다(Owner 2026-08-21).
    acctId: f['DP_계정ID'] || '',
    acctPw: f['DP_계정PW'] || '',
    shopNo: f['DP_편호'] || '',
    acctAt: f['DP_계정수정일'] || null,
    loginNeed: !!f['DP_로그인필요'],
    loginWhy: f['DP_로그인실패사유'] || '',
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
    // VIP 온디맨드
    vip: !!f['VIP리포트'],
    refreshing: !!f['DP_조회요청'],
    // 마지막 요청 시각 — 조회·전송 공용(reqState 주석 참조)
    refreshAt: f['DP_조회요청시각'] || null,
    refreshStale: rq.refreshStale,
    sendStale: rq.sendStale,
    reqPickedUp: rq.reqPickedUp,
    reqWatch: rq.reqWatch,
    refreshMsg: f['DP_조회결과'] || null,
    liveAt: f['DP_수시확인일'] || null,
    todaySpend: f['DP_오늘소진'] ?? null,
    todayBudget: f['DP_오늘예산'] ?? null,
    todayImp: f['DP_오늘노출'] ?? null,
    todayClick: f['DP_오늘클릭'] ?? null,
    todayCpc: f['DP_실효단가'] ?? null,
    // 첨부 URL 은 호출할 때마다 새로 발급된다(몇 시간 뒤 만료) — 그래서 저장하지 않고
    // 화면이 그릴 때 쓰는 값으로만 내려보낸다.
    reportImg: (f['DP_조회이미지'] || [])[0]?.url || null,
    reportThumb: (f['DP_조회이미지'] || [])[0]?.thumbnails?.large?.url || null,
    sending: !!f['DP_전송요청'],
    sendMsg: f['DP_전송결과'] || null,
  };
}

const CS_FIELDS = [
  'DP-office_ID', '매장명_검색용', '고객사명(필수)', '지점명(필수)', 'DP_중문명',
  'DP_업종', 'DP_업종_한글', 'DP_상점유형',
  'DP_광고상태', 'DP_캠페인상태', 'DP_정지사유', 'DP_캠페인수',
  'DP_잔액', 'DP_일소진', 'DP_소진예상일', 'DP_최근충전일', 'DP_잔액확인일',
  'DP_소진일', 'DP_소진경과일', 'DP_소진일_근사',
  // 포털 계정 — 원본이 여기다. 각 PC 의 clients.json 은 이 값에서 만들어진다.
  'DP_계정ID', 'DP_계정PW', 'DP_편호', 'DP_계정수정일',
  'DP_로그인필요', 'DP_로그인실패사유', 'DP_로그인확인일',
  'DP_일예산', 'DP_주말할증', 'DP_피크예산', 'DP_클릭단가', 'DP_노출시간',
  'DP_주간노출시간', 'DP_캠페인ID', 'DP_설정확인일',
  'DP_CPT_만료일', 'DP_CPT_상태', 'DP_악평_7일', 'DP_악평_30일', 'DP_악평_누적', 'DP_리뷰확인일',
  // VIP 온디맨드 — 여기 안 넣으면 GET 응답에 안 실려 화면이 영영 못 본다
  'VIP리포트', 'DP_조회요청', 'DP_조회요청시각', 'DP_조회결과', 'DP_수시확인일',
  'DP_오늘소진', 'DP_오늘예산', 'DP_오늘노출', 'DP_오늘클릭', 'DP_실효단가',
  'DP_조회이미지', 'DP_전송요청', 'DP_전송결과',
];

export default async function handler(req, res) {
  if (blockedByAdminGate(req, res)) return;

  // ── 계정 정보 수정 ────────────────────────────────────────────────
  // 비번은 포털이 주기적으로 변경을 강제하고 FK·매장도 각자 바꾼다.
  // 바뀔 때마다 Airtable 을 직접 열기는 번거로워 관리자 화면에서 고치게 한다.
  // ⚠️ 고칠 수 있는 필드를 **화이트리스트로 못 박는다**. 본문에 담긴 아무 필드나
  //    통과시키면 이 엔드포인트가 CS_DB 전체에 대한 쓰기 통로가 된다.
  if (req.method === 'PATCH') {
    const ALLOW = { acctId: 'DP_계정ID', acctPw: 'DP_계정PW', shopNo: 'DP_편호' };
    const body = req.body || {};
    const id = String(body.id || '').trim();
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) {
      return res.status(400).json({ error: 'bad record id' });
    }

    // ── 지금 조회 요청 ──────────────────────────────────────────────
    // 웹(Vercel)에서 PC 의 파이썬을 직접 못 부른다. Airtable 을 큐로 쓴다 —
    // 예약봇이 단체메시지_DB 를 60초 폴링하는 것과 같은 방식이고, 이미 검증된 패턴이다.
    // PC 워커(dp_worker.py)가 이 체크를 보고 수집한 뒤 값을 채우고 체크를 끈다.
    // ⚠️ 계정 수정과 **분리해서** 처리한다. 같이 묶으면 조회 한 번에
    //    DP_계정수정일 이 갱신돼 "누가 계정을 건드렸나" 이력이 오염된다.
    const hasReq = body.refresh !== undefined || body.send !== undefined;

    // ── 요청 취소 ───────────────────────────────────────────────────
    // 워커가 없으면 체크가 영영 안 꺼진다. Airtable 을 직접 열지 않고 여기서 끈다.
    // 🔴 현재 값을 먼저 읽는다 — 이미 끝난 요청을 '취소'로 덮으면 워커가 남긴 결과가 사라진다.
    if (body.cancel !== undefined) {
      if (body.cancel !== true) return res.status(400).json({ error: 'bad cancel' });
      if (hasReq) return res.status(400).json({ error: 'cancel cannot be combined' });
      try {
        const cur = (await atFetch(csUrl(id))).fields || {};
        const was = { get: !!cur['DP_조회요청'], send: !!cur['DP_전송요청'] };
        if (!was.get && !was.send) return res.status(200).json({ ok: true, cancelled: [] });
        const note = `${CANCEL_NOTE} (${kstStamp()})`;
        const f = { 'DP_조회요청': false, 'DP_전송요청': false };
        if (was.get) f['DP_조회결과'] = note;
        if (was.send) f['DP_전송결과'] = note;
        await csPatch(id, f);
        const cancelled = [was.get && 'refresh', was.send && 'send'].filter(Boolean);
        console.log('[admin-dianping] 요청 취소', id, cancelled.join(','));
        return res.status(200).json({ ok: true, cancelled });
      } catch (e) {
        console.error('[admin-dianping] 요청 취소 실패', e.message);
        return res.status(e.status === 404 ? 404 : 500).json({ error: e.message });
      }
    }

    if (hasReq) {
      // 불리언만 받는다(옛 화면의 'true'/'false' 문자열까지). 그 밖의 값은 거절 — 예전엔
      // 아무 값이나 false 로 읽혀 요청이 조용히 꺼졌다.
      const bool = (v) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null);
      const on = body.refresh === undefined ? false : bool(body.refresh);
      const snd = body.send === undefined ? false : bool(body.send);
      if (on === null || snd === null) return res.status(400).json({ error: 'bad refresh/send' });
      const f = {};
      if (body.refresh !== undefined) f['DP_조회요청'] = on;
      if (body.send !== undefined) f['DP_전송요청'] = snd;
      try {
        if (on || snd) {
          // 처리 대기 중인(stale 아닌) 요청이 있으면 요청 시각을 덮지 않는다 — 두 탭·연타로
          // 시각이 갱신되면 멈춘 요청이 영영 stale 로 안 넘어간다.
          const cur = (await atFetch(csUrl(id))).fields || {};
          const st = reqState(cur);
          if ((cur['DP_조회요청'] && !st.refreshStale) || (cur['DP_전송요청'] && !st.sendStale)) {
            return res.status(409).json({ error: '이미 처리 대기 중인 요청이 있습니다 — 끝나길 기다리거나 [요청 취소] 후 다시 누르세요.' });
          }
          const now = new Date();
          f['DP_조회요청시각'] = now.toISOString();   // 조회·전송 공용 — 워커는 읽기만 한다
          const replaced = `이전 요청은 새 요청으로 대체됨 (${kstStamp(now)})`;
          if (on) f['DP_조회결과'] = ACCEPT_GET;
          else if (cur['DP_조회요청'] && f['DP_조회요청'] === false) f['DP_조회결과'] = replaced;
          if (snd) f['DP_전송결과'] = ACCEPT_SEND;
          else if (cur['DP_전송요청'] && f['DP_전송요청'] === false) f['DP_전송결과'] = replaced;
        }
        await csPatch(id, f);
        console.log('[admin-dianping] 요청', id, `조회=${on} 전송=${snd}`);
        return res.status(200).json({ ok: true, refresh: on, send: snd });
      } catch (e) {
        console.error('[admin-dianping] 조회요청 실패', e.message);
        return res.status(e.status === 404 ? 404 : 500).json({ error: e.message });
      }
    }

    const fields = {};
    for (const [k, fld] of Object.entries(ALLOW)) {
      if (body[k] === undefined) continue;
      const v = String(body[k] ?? '').trim();
      if (v.length > 120) return res.status(400).json({ error: `${k} too long` });
      fields[fld] = v;
    }
    if (!Object.keys(fields).length) {
      return res.status(400).json({ error: 'nothing to update' });
    }
    fields['DP_계정수정일'] = new Date().toISOString();
    try {
      const r = await fetch(`https://api.airtable.com/v0/${BASE}/CS_DB/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 200)}`);
      // 비밀번호는 로그에 남기지 않는다 — 무엇을 고쳤는지만 남긴다.
      console.log('[admin-dianping] 계정 수정', id, Object.keys(fields).join(','));
      return res.status(200).json({ ok: true, updated: Object.keys(fields) });
    } catch (e) {
      console.error('[admin-dianping] 계정 수정 실패', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

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
               '따종리포트_URL', 'DP_매장코드',
               // 같은 계약월에 월 2~3회 돌린다 — 밀려난 회차도 꺼내 볼 수 있게 한다
               'DP_리포트JSON', 'DP_리포트JSON_v2', 'DP_리포트JSON_v3'],
    });
    // 리포트는 2026년 7월분부터 존재한다. 그 이전 계약월은 리포트 칸이 영영 비어 있어
    // 목록에 남겨두면 "왜 안 나오지"를 매번 다시 확인하게 된다 — 아예 거른다.
    const REPORT_FLOOR = 2026 * 12 + 7;
    // 한 계약월 안의 회차 — 최신(DP_리포트JSON) → v2 → v3 순.
    // 기간·생성시각은 JSON 안에 있으므로 파싱해서 뽑는다(별도 칸을 두지 않았다).
    const versions = (f) => ['DP_리포트JSON', 'DP_리포트JSON_v2', 'DP_리포트JSON_v3']
      .map((k, i) => {
        if (!f[k]) return null;
        let j = null;
        try { j = JSON.parse(f[k]); } catch { return null; }
        return {
          v: i + 1,
          latest: i === 0,
          period: j.period || null,
          generatedAt: j.generated_at ? String(j.generated_at).replace('T', ' ').slice(0, 16) : null,
          exposure: j?.funnel?.exposure ?? null,
          rank: j?.dominance?.rank ?? null,
          adShare: j?.adflow?.running ? j.adflow.imp_share : null,
        };
      })
      .filter(Boolean);

    const months = camp
      .map((r) => {
        const f = r.fields;
        return {
          versions: versions(f),
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
      .filter((m) => m.k >= REPORT_FLOOR)
      .sort((a, b) => b.k - a.k);

    // 목록은 화면이 이미 들고 있다 — 상세는 월별 이력만 돌려준다.
    return res.status(200).json({ slug, months });
  } catch (e) {
    console.error('[admin-dianping]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
