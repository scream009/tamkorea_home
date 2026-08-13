/**
 * Gravity | Recruiter Schedule API (v2 — multi-month + all-mode)
 *
 * GET /api/recruiter-schedule?id=HH                     → HH 담당자, 베이스월 = 현재월(KST)
 * GET /api/recruiter-schedule?id=HH&base=2026-04        → HH 담당자, 베이스월 명시
 * GET /api/recruiter-schedule?id=all                    → 전 담당자 통합
 * GET /api/recruiter-schedule?id=all&base=2026-04       → 전 담당자 통합 + 베이스 명시
 * (legacy) ?month=YYYY-MM → base로 변환해 처리
 *
 * 항상 base ±1 (전월·현재월·다음월) 3개월치 정산 레코드를 한 번에 반환.
 * 응답에 settlementMonth + settlementMonthShort + recruiterId 부착.
 */

import { composeSentMessage } from './_resv-message.js';

const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const RECORD_TABLE = encodeURIComponent('진행_DB_OLD');
const RESV_TABLE = encodeURIComponent('예약테이블');

const RECRUITER_LIST = ['HH', 'LH', 'AN', 'FB'];
const VALID_RECRUITERS = new Set([...RECRUITER_LIST, 'all']);

/* ── 상태 분류 ─────────────────────────────────────────── */
function isXhsSubmitted(fields) {
  const submitStatus = fields['제출상태'];
  if (typeof submitStatus === 'string' &&
      (submitStatus.includes('✅') || submitStatus.includes('제출완료'))) {
    return true;
  }
  const xhsResult = fields['XHS_Result'];
  if (!xhsResult) return false;
  const lower = String(xhsResult).toLowerCase();
  return lower.includes('xhslink') || lower.includes('xiaohongshu');
}

function classifyStatus(fields) {
  if (isXhsSubmitted(fields)) return 'completed';
  const status = String(fields['진행상태'] || '');
  if (status.includes('취소')) return 'cancelled';
  if (status.includes('노쇼')) return 'noShow';
  return 'inProgress';
}

// 변경메시지에 placeholder("⚠ 변경일시가 입력되지 않았습니다...") 가 들어있으면
// 변경된 적이 없는 것으로 간주하고 빈 문자열로 정규화.
function normalizeModMsg(s) {
  if (!s) return '';
  const str = String(s);
  if (str.includes('변경일시가 입력되지 않았습니다')) return '';
  return str;
}

/* ── 월 변환 헬퍼 ──────────────────────────────────────── */
function monthParamToAirtable(monthParam) {
  // "2026-04" → "2026. 4월"
  const m = /^(\d{4})-(\d{1,2})$/.exec(monthParam);
  if (!m) return null;
  return `${m[1]}. ${parseInt(m[2], 10)}월`;
}

function airtableMonthToParam(s) {
  // "2026. 4월" → "2026-04"
  const m = /^(\d{4})\.\s*(\d+)월$/.exec(String(s || '').trim());
  if (!m) return null;
  return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
}

function airtableMonthToLabel(s) {
  // "2026. 4월" → "2026년 4월"
  const m = /^(\d{4})\.\s*(\d+)월$/.exec(s);
  if (!m) return s;
  return `${m[1]}년 ${m[2]}월`;
}

function paramToShort(monthParam) {
  // "2026-04" → 4
  const m = /^(\d{4})-(\d{1,2})$/.exec(monthParam);
  return m ? parseInt(m[2], 10) : null;
}

function getCurrentKstMonth() {
  // 한국 시간(UTC+9) 기준 YYYY-MM
  const nowUtcMs = Date.now();
  const kst = new Date(nowUtcMs + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function shiftMonth(monthParam, delta) {
  const [y, m] = monthParam.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  const ny = date.getUTCFullYear();
  const nm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

/* ── Airtable fetch ───────────────────────────────────── */
async function atFetch(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchAllRecords(baseUrl) {
  let records = [];
  let offset = null;
  do {
    const url = offset ? `${baseUrl}&offset=${encodeURIComponent(offset)}` : baseUrl;
    const data = await atFetch(url);
    records = records.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);
  return records;
}

const firstOf = (v) => (Array.isArray(v) ? v[0] : v);
const nospace = (v) => String(v || '').replace(/\s/g, '');
// 백슬래시부터 늘려야 한다 — String.replace(/'/g, "\'") 는 no-op (_admin-auth.js 와 같은 규칙)
const escFormula = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function emptyStats() {
  return { total: 0, completed: 0, inProgress: 0, cancelled: 0, noShow: 0 };
}

/* ── handler ──────────────────────────────────────────── */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  // legacy month=… 를 base=… 로 받아넘김
  const base = req.query.base || req.query.month || getCurrentKstMonth();

  if (!id || !VALID_RECRUITERS.has(id)) {
    return res.status(400).json({
      error: '담당자 ID는 HH / LH / AN / FB / all 중 하나여야 합니다.',
    });
  }
  if (!/^\d{4}-\d{1,2}$/.test(base)) {
    return res.status(400).json({ error: 'base 파라미터 형식: YYYY-MM (예: 2026-05)' });
  }

  const baseMonth = base.replace(/^(\d{4})-(\d)$/, '$1-0$2'); // zero-pad
  const months = [shiftMonth(baseMonth, -1), baseMonth, shiftMonth(baseMonth, +1)];
  const airtableMonths = months.map(monthParamToAirtable);
  const monthLabels = Object.fromEntries(
    months.map((m) => [m, airtableMonthToLabel(monthParamToAirtable(m))])
  );

  try {
    /* ── 진행_DB_OLD 필터 ─────────────────────────
       항상 3개월치 정산 데이터 + 체험단 유형만.
       id=HH 면 예약_ID 조건 추가, id=all 이면 미적용. */
    const monthOr = airtableMonths.map((am) => `{정산월}='${am}'`).join(',');
    const idClause = id === 'all' ? '' : `{예약_ID}='${id}',`;
    const formula = encodeURIComponent(
      `AND(${idClause}OR(${monthOr}))`
    );
    const url = `https://api.airtable.com/v0/${BASE_ID}/${RECORD_TABLE}?filterByFormula=${formula}`;
    const allRecords = await fetchAllRecords(url);

    /* ── 예약테이블 Shadow Group 보강 ───────────── */
    const reservationIds = new Set();
    allRecords.forEach((rec) => {
      const links = rec.fields['예약팀명_DB'] || [];
      links.forEach((rId) => reservationIds.add(rId));
    });

    // ⚠️ 예약테이블은 **폐기 예정** (Owner 확인 2026-08-13). 삭제되면 이 조회가 던져
    //    화면 전체가 500 이 된다 → try/catch 로 감싸 폴백만 포기한다.
    const resvMap = {};
    if (reservationIds.size > 0) {
      try {
      const resvArray = Array.from(reservationIds);
      const chunkSize = 30;
      for (let i = 0; i < resvArray.length; i += chunkSize) {
        const chunk = resvArray.slice(i, i + chunkSize);
        const orParts = chunk.map((rId) => `RECORD_ID()='${rId}'`).join(',');
        const f = encodeURIComponent(`OR(${orParts})`);
        const u = `https://api.airtable.com/v0/${BASE_ID}/${RESV_TABLE}?filterByFormula=${f}`;
        const recs = await fetchAllRecords(u);
        recs.forEach((r) => {
          resvMap[r.id] = {
            pax: r.fields['방문 인원'] || r.fields['방문인원'] || '',
            xhsCount: r.fields['XHS_건수'],
            dpCount: r.fields['DP_건수'],
            specialNote: r.fields['특이사항'] || r.fields['인원메모'] || r.fields['비고'] || '',
            reservationMsg: r.fields['예약메시지'] || r.fields['예약 메시지'] || '',
            modificationMsg: normalizeModMsg(r.fields['변경메시지'] || r.fields['변경 메시지']),
            // 취소·노쇼 안내문에 붙는 사유. rollup 이라 배열로 온다(빈 칸이면 [null]).
            customerMemo: r.fields['고객전달메모'] || '',
          };
        });
      }
      } catch (e) {
        console.error('[recruiter-schedule] 예약테이블(폐기예정) 조회 실패 — 폴백 생략:', e.message);
      }
    }

    /* ── 예약입력_DB (팀 단위 원본, 팀명생성기 매칭) ─────────
       고객 달력(client-schedule c865d2c)과 같은 이관 — 예약테이블 폐기 후에도
       예약·변경 메시지와 인원·건수가 나오도록 원본을 직접 읽는다.
       매칭 키 = 팀명생성기(고객명 지점명_MMDD_대표인플). 수식 재료가 전부
       자기 테이블 필드라 예약테이블과 무관하게 생성된다(Meta API 실측 2026-08-13). */
    const resvInputMap = {};
    try {
      const teamKeys = [...new Set(
        allRecords.map((r) => nospace(r.fields['팀명생성기'])).filter(Boolean)
      )];
      for (let i = 0; i < teamKeys.length; i += 20) {
        const chunk = teamKeys.slice(i, i + 20);
        const orParts = chunk
          .map((k) => `SUBSTITUTE({팀명생성기}, " ", "")='${escFormula(k)}'`)
          .join(',');
        const u = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent('예약입력_DB')}`
          + `?filterByFormula=${encodeURIComponent(`OR(${orParts})`)}&pageSize=100`;
        const recs = await fetchAllRecords(u);
        recs.forEach((r) => {
          const k = nospace(r.fields['팀명생성기']);
          if (k && !resvInputMap[k]) resvInputMap[k] = r.fields;
        });
      }
    } catch (e) {
      // 실패해도 화면은 떠야 한다 — 예약테이블 폴백/진행_DB 값으로 그린다.
      console.error('[recruiter-schedule] 예약입력_DB 조회 실패:', e.message);
    }

    /* ── 집계 ──────────────────────────────────── */
    const statsByMonth = Object.fromEntries(months.map((m) => [m, emptyStats()]));
    const statsByRecruiter = id === 'all'
      ? Object.fromEntries(
          RECRUITER_LIST.map((r) => [
            r,
            Object.fromEntries(months.map((m) => [m, emptyStats()])),
          ])
        )
      : null;

    const teamGroups = {};
    const records = []; // 인플 단위 (리스트 뷰용)

    allRecords.forEach((rec, index) => {
      const f = rec.fields;
      const status = f['진행상태'] || '진행전';
      const bucket = classifyStatus(f);

      const settlementMonth = airtableMonthToParam(f['정산월']);
      const settlementMonthShort = settlementMonth ? paramToShort(settlementMonth) : null;
      const recruiterId = String(f['예약_ID'] || '').trim() || 'UNK';

      // 월별 집계
      if (settlementMonth && statsByMonth[settlementMonth]) {
        statsByMonth[settlementMonth][bucket] += 1;
        statsByMonth[settlementMonth].total += 1;
      }
      // 담당자별 집계 (id=all 모드)
      if (statsByRecruiter && RECRUITER_LIST.includes(recruiterId) && settlementMonth) {
        const rbucket = statsByRecruiter[recruiterId][settlementMonth];
        if (rbucket) {
          rbucket[bucket] += 1;
          rbucket.total += 1;
        }
      }

      const xhsId  = firstOf(f['XHS_ID'])  || '';
      const wcId   = firstOf(f['WC_ID'])   || '';
      const inflId = firstOf(f['INFL_ID']) || '';
      const displayId = xhsId || wcId || inflId || '대기중';

      const brandName  = firstOf(f['고객명']) || '';
      const branchName = firstOf(f['지점명']) || '';

      const xhsResult = f['XHS_Result'] || '';
      const dpResult  = f['DP_Result']  || '';
      const dyResult  = f['DY_Result']  || '';
      let reserveDate = f['예약일시'] || null;
      const type = f['유형'] || '';

      const channelLink =
        firstOf(f['XHS_link1 (from WC_ID_)']) ||
        firstOf(f['XHS_link1']) ||
        '';

      const pal = firstOf(f['PAL#']) || firstOf(f['PAL']) || '';

      const resvLinks = f['예약팀명_DB'] || [];
      let totalPax = f['# 총인원'] || f['총인원'] || '';
      let memo = f['특이사항'] || f['인원메모'] || f['비고'] || '';
      let xhsCount = f['XHS_건수'];
      let dpCount = f['DP_건수'];
      // 예약/변경 메시지 본문 — 예약입력_DB(원본) 우선, 예약테이블(폐기예정)은 폴백.
      // ⚠️ 예전 주석은 "자동 송출기가 취소·노쇼 안내문을 예약메시지에 붙인다"고 했지만
      //    사실이 아니다. 예약메시지는 Formula 라 봇이 쓸 수 없고, 안내문은 발송 직전
      //    Python 이 조립하고 버린다. 그래서 취소 건도 원본 예약문만 떠 있었다.
      //    → 아래에서 봇과 같은 규칙으로 최종 발송문을 복원한다(_resv-message.js).
      let reservationMsg = '';
      let modificationMsg = '';
      let customerMemo = f['고객전달메모'] || '';   // 봇이 캐스케이드로 복사해 둔 값

      // 팀 묶음 키 — 링크가 있으면 기존대로(동작 불변), 예약테이블 폐기 후에는
      // 팀명생성기 문자열로 묶는다. 없으면 팀이 낱개로 흩어진다.
      const teamKeyStr = nospace(f['팀명생성기']);
      const teamId = (resvLinks.length > 0 ? resvLinks[0] : '') || teamKeyStr || rec.id;

      if (resvLinks.length > 0 && resvMap[resvLinks[0]]) {
        const r = resvMap[resvLinks[0]];
        if (r.pax) totalPax = r.pax;
        if (r.specialNote) memo = r.specialNote;
        if (r.xhsCount !== undefined) xhsCount = r.xhsCount;
        if (r.dpCount !== undefined) dpCount = r.dpCount;
        reservationMsg = r.reservationMsg || '';
        modificationMsg = r.modificationMsg || '';   // placeholder는 resvMap 단계에서 ''로 정규화됨
        if (!customerMemo) customerMemo = r.customerMemo || '';
      }

      // 예약입력_DB(팀 단위 원본)가 있으면 그것으로 덮는다 — 고객 달력과 같은 우선순위.
      // 변경일시가 있으면 그것이 최신 예약 시각이다(상태는 보지 않는다 — client-schedule 주석 참조).
      const inTeam = resvInputMap[teamKeyStr];
      if (inTeam) {
        const d = inTeam['변경일시'] || inTeam['예약일시'];
        if (d) reserveDate = d;
        const pax = inTeam['변경인원'] ?? inTeam['총인원'];
        if (pax !== undefined && pax !== null && pax !== '') totalPax = pax;
        if (inTeam['인원메모']) memo = inTeam['인원메모'];
        if (inTeam['XHS_건수'] !== undefined) xhsCount = inTeam['XHS_건수'];
        if (inTeam['DP_건수'] !== undefined) dpCount = inTeam['DP_건수'];
        // 예약메시지는 Formula 라 필드 미비 시 ⚠ 경고문을 반환한다 — 봇과 같은 가드
        const rm = String(inTeam['예약메시지'] || '');
        if (rm && !rm.startsWith('⚠')) reservationMsg = rm;
        const mod = normalizeModMsg(inTeam['변경메시지']);
        if (mod) modificationMsg = mod;
        if (!customerMemo && inTeam['고객전달메모']) customerMemo = inTeam['고객전달메모'];
      }

      // 취소·노쇼면 담당자도 '내가 뭘 보냈는지'를 그대로 봐야 한다.
      const { sentMessage, noticeTail } = composeSentMessage({
        status,
        reservationMsg,
        changeMessage: modificationMsg,
        customerMemo,
      });

      xhsCount = xhsCount !== undefined ? xhsCount : 1;
      dpCount  = dpCount  !== undefined ? dpCount  : 0;

      const item = {
        id: rec.id,
        seq: index + 1,
        teamId,
        brandName,
        branchName,
        displayId,
        pal,
        channelLink,
        xhsResult,
        dpResult,
        dyResult,
        status,
        statusBucket: bucket,
        type,
        reserveDate,
        totalPax,
        xhsCount,
        dpCount,
        memo,
        reservationMsg,
        modificationMsg,
        sentMessage,   // 취소·노쇼일 때만 채워진다(본문 확보 실패 시 '')
        noticeTail,    // 본문을 못 찾은 경우 화면이 자체 본문 뒤에 붙일 안내문
        // v2 신규
        settlementMonth,           // "2026-04"
        settlementMonthShort,      // 4
        recruiterId,               // "HH" / "LH" / "AN" / "FB"
      };

      records.push(item);

      // 캘린더용 팀 그룹화 — teamId + recruiterId 조합 (전체 모드에서 같은 팀이라도 담당자 다르면 분리)
      if (reserveDate) {
        const groupKey = `${teamId}::${recruiterId}`;
        const inflInfo = {
          displayId: displayId !== '대기중' ? displayId : '',
          pal,
          channelLink,
        };
        if (!teamGroups[groupKey]) {
          teamGroups[groupKey] = {
            ...item,
            displayIds: displayId !== '대기중' && displayId ? [displayId] : [],
            xhsResults: xhsResult ? [xhsResult] : [],
            influencers: inflInfo.displayId ? [inflInfo] : [],
          };
        } else {
          if (inflInfo.displayId) {
            teamGroups[groupKey].displayIds.push(inflInfo.displayId);
            teamGroups[groupKey].influencers.push(inflInfo);
          }
          if (xhsResult) {
            teamGroups[groupKey].xhsResults.push(xhsResult);
          }
        }
      }
    });

    records.sort((a, b) => {
      const da = a.reserveDate ? new Date(a.reserveDate).getTime() : 0;
      const db = b.reserveDate ? new Date(b.reserveDate).getTime() : 0;
      return da - db;
    });
    records.forEach((r, i) => { r.seq = i + 1; });

    const scheduleItems = Object.values(teamGroups);

    return res.status(200).json({
      recruiterId: id,                    // "HH" | "all"
      baseMonth,                          // "2026-05"
      months,                             // ["2026-04","2026-05","2026-06"]
      monthLabels,                        // { "2026-04": "2026년 4월", ... }
      monthLabel: monthLabels[baseMonth], // legacy 호환 — 베이스월 라벨
      statsByMonth,                       // 월별 5칸 통계
      statsByRecruiter,                   // id=all 일 때만, 그 외 null
      stats: statsByMonth[baseMonth],     // legacy 호환 — 베이스월 5칸
      scheduleItems,
      records,
    });
  } catch (err) {
    console.error('[recruiter-schedule] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
