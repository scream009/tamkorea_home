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

// 진행상태 → 4개 카테고리 매핑
const STATUS_BUCKETS = {
  completed:  ['업로드완료', '송부완료', '배포완료'],
  inProgress: ['예약요청', '예약확정', '촬영완료', '변경요청', '업로드대기', '긴급예약', '예약반려'],
  cancelled:  ['취소_방문자', '취소_고객사'],
  noShow:     ['노쇼'],
};

function classifyStatus(status) {
  for (const [bucket, list] of Object.entries(STATUS_BUCKETS)) {
    if (list.includes(status)) return bucket;
  }
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

    allRecords.forEach((rec, index) => {
      const f = rec.fields;
      const status = f['진행상태'] || '진행전';
      const bucket = classifyStatus(status);
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
      const reserveDate = f['예약일시'] || null;
      const type = f['유형'] || '';

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
        shootId: f['Shoot_ID'] || '',
        brandName,
        branchName,
        displayId,
        xhsResult,
        dpResult,
        status,
        statusBucket: bucket,
        type,
        reserveDate,
        totalPax,
        memo,
        xhsCount,
        dpCount,
      };

      // 캘린더용 팀 그룹화
      if (reserveDate) {
        if (!teamGroups[teamId]) {
          teamGroups[teamId] = {
            ...item,
            displayIds: displayId !== '대기중' && displayId ? [displayId] : [],
            xhsResults: xhsResult ? [xhsResult] : [],
          };
        } else {
          if (displayId !== '대기중' && displayId) {
            teamGroups[teamId].displayIds.push(displayId);
          }
          if (xhsResult) {
            teamGroups[teamId].xhsResults.push(xhsResult);
          }
        }
      }
    });

    const scheduleItems = Object.values(teamGroups);

    return res.status(200).json({
      recruiterId: id,
      month: airtableMonth,
      monthLabel: airtableMonthToLabel(airtableMonth),
      stats,
      scheduleItems,
    });
  } catch (err) {
    console.error('[recruiter-schedule] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
