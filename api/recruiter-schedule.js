/**
 * Gravity | Recruiter Schedule API
 * GET /api/recruiter-schedule?id=HH&month=2026-04
 *
 * 진행_DB_OLD 에서 (예약_ID = id) AND (정산월 = month) AND (유형 contains 체험)
 * 으로 필터링한 체험단 일정 + 상태 통계를 반환.
 */

const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const RECORD_TABLE = encodeURIComponent('진행_DB_OLD');
const RESV_TABLE = encodeURIComponent('예약테이블');

const VALID_RECRUITERS = new Set(['HH', 'LH', 'AN', 'FB']);

/**
 * 카테고리 분류 — 새 기준
 *  완료    : XHS 링크 제출됨 (진행_DB_OLD.제출상태 ✅ 또는 XHS_Result에 xhslink/xiaohongshu 포함)
 *  취소    : 진행상태에 '취소' 포함
 *  노쇼    : 진행상태에 '노쇼' 포함
 *  진행중  : 그 외 (예약확정/촬영완료/예약요청/예약반려/변경요청 등)
 *
 * 진행상태로만 보면 "촬영완료" 인데 실제 XHS 링크 미제출 건이 완료로 잡히는 문제가 있어,
 * "링크가 들어온 건 = 완료"로 운영 기준을 바꿈.
 */
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

function monthParamToAirtable(monthParam) {
  // "2026-04" → "2026. 4월"
  const m = /^(\d{4})-(\d{1,2})$/.exec(monthParam);
  if (!m) return null;
  return `${m[1]}. ${parseInt(m[2], 10)}월`;
}

function airtableMonthToLabel(s) {
  // "2026. 4월" → "2026년 4월"
  const m = /^(\d{4})\.\s*(\d+)월$/.exec(s);
  if (!m) return s;
  return `${m[1]}년 ${m[2]}월`;
}

async function atFetch(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, month } = req.query;

  if (!id || !VALID_RECRUITERS.has(id)) {
    return res.status(400).json({ error: '담당자 ID는 HH / LH / AN / FB 중 하나여야 합니다.' });
  }

  const monthParam = month || '2026-04';
  const airtableMonth = monthParamToAirtable(monthParam);
  if (!airtableMonth) {
    return res.status(400).json({ error: 'month 파라미터 형식: YYYY-MM (예: 2026-04)' });
  }

  try {
    // 진행_DB_OLD 필터 — 담당자 + 정산월 + 체험단 계열만
    const formula = encodeURIComponent(
      `AND({예약_ID}='${id}',{정산월}='${airtableMonth}',FIND('체험',{유형}&'')>0)`
    );
    const url = `https://api.airtable.com/v0/${BASE_ID}/${RECORD_TABLE}?filterByFormula=${formula}`;
    const allRecords = await fetchAllRecords(url);

    // 예약테이블(Shadow Group) 보강 데이터
    const reservationIds = new Set();
    allRecords.forEach((rec) => {
      const links = rec.fields['예약팀명_DB'] || [];
      links.forEach((rId) => reservationIds.add(rId));
    });

    const resvMap = {};
    if (reservationIds.size > 0) {
      const resvArray = Array.from(reservationIds);
      const chunkSize = 30;
      for (let i = 0; i < resvArray.length; i += chunkSize) {
        const chunk = resvArray.slice(i, i + chunkSize);
        const orParts = chunk.map((id) => `RECORD_ID()='${id}'`).join(',');
        const f = encodeURIComponent(`OR(${orParts})`);
        const u = `https://api.airtable.com/v0/${BASE_ID}/${RESV_TABLE}?filterByFormula=${f}`;
        const recs = await fetchAllRecords(u);
        recs.forEach((r) => {
          resvMap[r.id] = {
            pax: r.fields['방문 인원'] || r.fields['방문인원'] || '',
            xhsCount: r.fields['XHS_건수'],
            dpCount: r.fields['DP_건수'],
            specialNote: r.fields['특이사항'] || r.fields['인원메모'] || r.fields['비고'] || '',
          };
        });
      }
    }

    const stats = { completed: 0, inProgress: 0, cancelled: 0, noShow: 0, total: 0 };
    const teamGroups = {};
    const records = []; // 인플 단위 (리스트 뷰용)

    allRecords.forEach((rec, index) => {
      const f = rec.fields;
      const status = f['진행상태'] || '진행전';
      const bucket = classifyStatus(f);
      stats[bucket] = (stats[bucket] || 0) + 1;
      stats.total += 1;

      const xhsId  = firstOf(f['XHS_ID'])  || '';
      const wcId   = firstOf(f['WC_ID'])   || '';
      const inflId = firstOf(f['INFL_ID']) || '';
      const displayId = xhsId || wcId || inflId || '대기중';

      const brandName  = firstOf(f['고객명']) || '';
      const branchName = firstOf(f['지점명']) || '';

      const xhsResult = f['XHS_Result'] || '';
      const dpResult  = f['DP_Result']  || '';
      const dyResult  = f['DY_Result']  || '';
      const reserveDate = f['예약일시'] || null;
      const type = f['유형'] || '';

      // 인플 채널 링크 (인플 마스터의 XHS_link1 lookup) — 두 가지 필드명 폴백
      const channelLink =
        firstOf(f['XHS_link1 (from WC_ID_)']) ||
        firstOf(f['XHS_link1']) ||
        '';

      // PAL (인플 등급/팔로워 수)
      const pal = firstOf(f['PAL#']) || firstOf(f['PAL']) || '';

      const resvLinks = f['예약팀명_DB'] || [];
      let totalPax = f['# 총인원'] || f['총인원'] || '';
      let memo = f['특이사항'] || f['인원메모'] || f['비고'] || '';
      let xhsCount = f['XHS_건수'];
      let dpCount = f['DP_건수'];

      const teamId = resvLinks.length > 0 ? resvLinks[0] : rec.id;

      if (resvLinks.length > 0 && resvMap[resvLinks[0]]) {
        const r = resvMap[resvLinks[0]];
        if (r.pax) totalPax = r.pax;
        if (r.specialNote) memo = r.specialNote;
        if (r.xhsCount !== undefined) xhsCount = r.xhsCount;
        if (r.dpCount !== undefined) dpCount = r.dpCount;
      }

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
      };

      // 리스트 뷰용 — 인플 단위
      records.push(item);

      // 캘린더용 — 팀 단위로 그룹화
      if (reserveDate) {
        const inflInfo = {
          displayId: displayId !== '대기중' ? displayId : '',
          pal,
          channelLink,
        };
        if (!teamGroups[teamId]) {
          teamGroups[teamId] = {
            ...item,
            displayIds: displayId !== '대기중' && displayId ? [displayId] : [],
            xhsResults: xhsResult ? [xhsResult] : [],
            influencers: inflInfo.displayId ? [inflInfo] : [],
          };
        } else {
          if (inflInfo.displayId) {
            teamGroups[teamId].displayIds.push(inflInfo.displayId);
            teamGroups[teamId].influencers.push(inflInfo);
          }
          if (xhsResult) {
            teamGroups[teamId].xhsResults.push(xhsResult);
          }
        }
      }
    });

    // 리스트 뷰 정렬 — 일정 오름차순
    records.sort((a, b) => {
      const da = a.reserveDate ? new Date(a.reserveDate).getTime() : 0;
      const db = b.reserveDate ? new Date(b.reserveDate).getTime() : 0;
      return da - db;
    });
    records.forEach((r, i) => { r.seq = i + 1; });

    const scheduleItems = Object.values(teamGroups);

    return res.status(200).json({
      recruiterId: id,
      month: airtableMonth,
      monthLabel: airtableMonthToLabel(airtableMonth),
      stats,
      scheduleItems,
      records,
    });
  } catch (err) {
    console.error('[recruiter-schedule] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
