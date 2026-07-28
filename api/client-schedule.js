/**
 * Gravity | Client Schedule API
 * GET /api/client-schedule?campaignId=recXXXXXXXX
 */

const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const CAMPAIGN_TABLE = encodeURIComponent('Campaign_DB');
const RECORD_TABLE   = encodeURIComponent('진행_DB_OLD');

async function atFetch(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` }
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
    const url = offset ? `${baseUrl}&offset=${offset}` : baseUrl;
    const data = await atFetch(url);
    records = records.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);
  return records;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { campaignId } = req.query;
  if (!campaignId) return res.status(400).json({ error: 'campaignId is required' });

  try {
    // 1. Campaign_DB 정보 가져오기
    const campData = await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGN_TABLE}/${campaignId}`
    );
    const cf = campData.fields;

    const campaignName  = cf['계약명'] || '';
    const brandName     = Array.isArray(cf['고객사명']) ? cf['고객사명'][0] : (cf['고객사명'] || '');
    const branchName    = Array.isArray(cf['지점명'])   ? cf['지점명'][0]   : (cf['지점명'] || '');
    const month         = cf['계약월'] || '';
    
    const partnerField  = cf['협력사명'] || cf['협력사'] || '';
    const partnerRaw    = Array.isArray(partnerField) ? partnerField[0] : partnerField;
    let partnerName   = (partnerRaw && partnerRaw !== '직영' && partnerRaw !== '탐코리아' && partnerRaw.toUpperCase() !== 'TAMKOREA') ? partnerRaw : 'TAMKOREA';
    if (partnerName && partnerName.includes('에코')) {
      partnerName = '에코';
    }

    const linkedRecIds  = cf['진행_DB_OLD'] || [];

    // 목표 수량: 신규 '_목표' 필드 우선, 구 '_요청' 필드 폴백
    // 실적 수량: 인플/체험 = '_방문' rollup, 기자 = '기자_실적' rollup (스키마 리네임 반영)
    const stats = {
      infl_target:  cf['인플_목표'] || cf['인플_요청'] || cf['# 인플_목표'] || cf['# 인플_요청'] || 0,
      infl_done:    cf['인플_방문'] || cf['# 인플_방문'] || cf['인플_실적'] || cf['# 인플_실적'] || 0,
      exp_target:   cf['체험_목표'] || cf['체험단_요청'] || cf['# 체험_목표'] || cf['# 체험단_요청'] || 0,
      exp_done:     cf['체험_방문'] || cf['# 체험_방문'] || cf['체험_실적'] || cf['# 체험_실적'] || 0,
      press_target: cf['기자_목표'] || cf['기자단_요청'] || cf['# 기자_목표'] || cf['# 기자단_요청'] || 0,
      press_done:   cf['기자_실적'] || cf['# 기자_실적'] || 0,
    };

    // 2. 진행_DB_OLD 레코드 가져오기 (예약일시 필드 추가)
    let allRecords = [];

    if (linkedRecIds.length > 0) {
      const chunkSize = 30;
      for (let i = 0; i < linkedRecIds.length; i += chunkSize) {
        const chunk = linkedRecIds.slice(i, i + chunkSize);
        const orParts = chunk.map(id => `RECORD_ID()='${id}'`).join(',');
        const formula = encodeURIComponent(`OR(${orParts})`);
        // 특정 필드만 요청하면 에어테이블 스키마 변경 시(예: # 총인원 -> 총인원) 500 에러 발생하므로 전체 필드 요청
        const url = `https://api.airtable.com/v0/${BASE_ID}/${RECORD_TABLE}?filterByFormula=${formula}`;
        const chunk_recs = await fetchAllRecords(url);
        allRecords = allRecords.concat(chunk_recs);
      }
    }

    // 2.5 예약테이블(Shadow Group) 데이터 가져오기 (방문 인원, 예약메시지)
    const reservationIds = new Set();
    allRecords.forEach(rec => {
      const resvLinks = rec.fields['예약팀명_DB'] || [];
      resvLinks.forEach(id => reservationIds.add(id));
    });

    const resvMap = {};
    if (reservationIds.size > 0) {
      const resvArray = Array.from(reservationIds);
      const resvChunkSize = 30;
      for (let i = 0; i < resvArray.length; i += resvChunkSize) {
        const chunk = resvArray.slice(i, i + resvChunkSize);
        const orParts = chunk.map(id => `RECORD_ID()='${id}'`).join(',');
        const formula = encodeURIComponent(`OR(${orParts})`);
        const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent('예약테이블')}?filterByFormula=${formula}`;
        const chunk_recs = await fetchAllRecords(url);
        chunk_recs.forEach(r => {
          resvMap[r.id] = {
            pax: r.fields['방문 인원'] || r.fields['방문인원'] || r.fields['# 방문 인원'] || r.fields['# 방문인원'] || '',
            xhsCount: r.fields['XHS_건수'],
            dpCount: r.fields['DP_건수'],
            specialNote: r.fields['특이사항'] || r.fields['인원메모'] || r.fields['비고'] || ''
          };
        });
      }
    }

    // 영상 이상(삭제/비공개) 판별 — 공백 무시('영상 이상' 표기도 인식)
    const isVideoIssue = (status) => (status || '').replace(/\s/g, '').includes('영상이상');

    // 3. 데이터 가공 및 분류
    const scheduleItems = [];
    const teamGroups = {};
    const influencer = [];
    const experience = [];
    const press      = [];
    const videoIssue = [];

    allRecords.forEach((rec, index) => {
      const f = rec.fields;
      const type = f['유형'] || '';

      const xhsId    = Array.isArray(f['XHS_ID'])  ? f['XHS_ID'][0]  : (f['XHS_ID'] || '');
      const wcId     = Array.isArray(f['WC_ID'])    ? f['WC_ID'][0]   : (f['WC_ID'] || '');
      const inflId   = Array.isArray(f['INFL_ID'])  ? f['INFL_ID'][0] : (f['INFL_ID'] || '');
      let displayId = xhsId || wcId || inflId || '대기중';

      const xhsResult = f['XHS_Result'] || '';
      const dpResult  = f['DP_Result']  || '';
      const dyResult  = f['DY_Result']  || '';
      const status    = f['진행상태']   || '진행전';
      const shootId   = f['Shoot_ID']   || '';
      const reserveDate = f['예약일시'] || null;

      // 예약테이블(Shadow Group) 데이터와 매핑
      const resvLinks = f['예약팀명_DB'] || [];
      let totalPax = f['# 총인원'] || f['총인원'] || f['총 인원'] || ''; // Fallback
      
      // 예약메시지 직접 생성을 위한 필드들 (특이사항, 건수 등)
      let memo = f['특이사항'] || f['인원메모'] || f['비고'] || ''; 
      let xhsCount = f['XHS_건수'] || f['샤오홍슈 건수'];
      let dpCount = f['DP_건수'] || f['따중리뷰 건수'];

      const teamId = resvLinks.length > 0 ? resvLinks[0] : rec.id;

      if (resvLinks.length > 0 && resvMap[resvLinks[0]]) {
        const resvData = resvMap[resvLinks[0]];
        if (resvData.pax) totalPax = resvData.pax;
        if (resvData.specialNote) memo = resvData.specialNote;
        if (resvData.xhsCount !== undefined) xhsCount = resvData.xhsCount;
        if (resvData.dpCount !== undefined) dpCount = resvData.dpCount;
      }
      
      // 캠페인 레벨(Campaign_DB) 폴백
      if (xhsCount === undefined) xhsCount = cf['XHS_건수'] || cf['샤오홍슈 건수'];
      if (dpCount === undefined) dpCount = cf['DP_건수'] || cf['따중리뷰 건수'];

      // 최종 기본값
      xhsCount = xhsCount !== undefined ? xhsCount : 1;
      dpCount = dpCount !== undefined ? dpCount : 0;

      const item = {
        id:        rec.id,
        seq:       index + 1,
        shootId,
        displayId,
        xhsResult,
        dpResult,
        dyResult,
        status,
        type,
        reserveDate,
        totalPax,
        memo,
        xhsCount,
        dpCount
      };

      // 달력용 통합 리스트 (그룹핑)
      if (reserveDate) {
        if (!teamGroups[teamId]) {
          teamGroups[teamId] = {
            ...item,
            displayIds: displayId !== '대기중' && displayId ? [displayId] : [],
            xhsResults: xhsResult ? [xhsResult] : []
          };
        } else {
          // 팀 그룹이 이미 있으면 ID와 결과물만 배열에 추가
          if (displayId !== '대기중' && displayId) {
            teamGroups[teamId].displayIds.push(displayId);
          }
          if (xhsResult) {
            teamGroups[teamId].xhsResults.push(xhsResult);
          }
        }
      }

      // 리스트용 분류 — 취소·노쇼는 실적 리스트에서 제외 (달력에는 그대로 표시됨)
      const isExcluded = status.includes('취소') || status.includes('노쇼');

      if (!isExcluded) {
        // 유형 → 카테고리 판정
        let category;
        if (type === '인플' || type === '인플루언서' || type === '체험→인플' || type === '기자→인플') {
          category = 'influencer';
        } else if (type === '기자' || type === '기자단') {
          category = 'press';
        } else {
          category = 'experience'; // 체험 및 fallback
        }
        item.category = category;

        // 영상 이상(삭제/비공개) → 하단 별도 리스트로 분리
        if (isVideoIssue(status)) {
          videoIssue.push(item);
        } else if (category === 'influencer') {
          influencer.push(item);
        } else if (category === 'press') {
          press.push(item);
        } else {
          experience.push(item);
        }
      }
    });

    // Object.values를 통해 그룹화된 팀 이벤트 배열 생성
    const groupedScheduleItems = Object.values(teamGroups);

    influencer.forEach((r, i) => { r.seq = i + 1; });
    experience.forEach((r, i) => { r.seq = i + 1; });
    press.forEach((r, i)      => { r.seq = i + 1; });
    videoIssue.forEach((r, i) => { r.seq = i + 1; });

    // ── 따종디엔핑 CPC 배너 + 월간 리포트 (봇이 Campaign_DB에 적재) ──
    // 데이터가 없으면 null → 프론트에서 배너 미표시 (지어내지 않음)
    const STATUS_MAP = { '🟢 정상': 'green', '🟡 소진임박': 'amber', '🔴 충전필요': 'red' };
    // Airtable dateTime(ISO) → 한국시간 "YYYY-MM-DD HH:mm"
    const fmtKST = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      const k = new Date(d.getTime() + 9 * 3600 * 1000);
      const p = (n) => String(n).padStart(2, '0');
      return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
    };
    let cpc = null;
    if (cf['CPC_현재잔액'] !== undefined && cf['CPC_현재잔액'] !== null) {
      cpc = {
        balance: cf['CPC_현재잔액'],
        yesterday: cf['CPC_현재소진'] ?? 0,
        status: STATUS_MAP[cf['CPC_상태']] || 'red',
        daysLeft: cf['CPC_소진예상일'] ?? null,
        updated: fmtKST(cf['CPC_갱신일']),
        weekly: [1, 2, 3, 4, 5]
          .map((n) => cf[`CPC_주${n}잔액`])
          .filter((v) => v !== undefined && v !== null),
      };
    }

    let dpReport = null;
    if (cf['DP_기간']) {
      let detail = null;
      try { detail = cf['DP_리포트JSON'] ? JSON.parse(cf['DP_리포트JSON']) : null; } catch (e) { detail = null; }
      const storeCode = cf['DP_매장코드'] || '';
      dpReport = {
        storeCode,
        url: storeCode ? `/reports/dp_${storeCode}.html` : null,
        period: String(cf['DP_기간']).replace(/~/, ' ~ '),
        exposure: cf['DP_노출'] != null ? Number(cf['DP_노출']).toLocaleString() : null,
        click: cf['DP_클릭'] ?? null,
        visit: cf['DP_방문'] ?? null,
        intent: cf['DP_관심'] ?? null,
        rank: cf['DP_순위'] != null ? `상권 ${cf['DP_순위']}위` : null,
        mom: cf['DP_전월비'] ? (String(cf['DP_전월비']).startsWith('-') ? cf['DP_전월비'] : `+${cf['DP_전월비']}`) : null,
        good: cf['DP_호평률'] != null ? `호평률 ${cf['DP_호평률']}%` : null,
        adShare: detail?.adflow?.running ? detail.adflow.imp_share : null,
        detail,
      };
    }

    // ── 따종 고객사 여부 (매장 단위) ──────────────────────────────
    // 이번 달 리포트가 아직 없어도(월초·과거월 링크) 같은 매장의 다른 계약월에
    // DP 데이터가 하나라도 있으면 '우리 운영 매장'이다. 넛지 오노출 방지용.
    let dpClient = false;
    if (!dpReport && (brandName || branchName)) {
      try {
        const esc = (s) => String(s).replace(/"/g, '\\"');
        const conds = ['{DP_기간} != ""'];
        if (brandName)  conds.push(`FIND("${esc(brandName)}",  {고객사명} & "") > 0`);
        if (branchName) conds.push(`FIND("${esc(branchName)}", {지점명}   & "") > 0`);
        const formula = encodeURIComponent(`AND(${conds.join(',')})`);
        const url = `https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGN_TABLE}`
          + `?filterByFormula=${formula}&maxRecords=1&fields%5B%5D=${encodeURIComponent('DP_기간')}`;
        const probe = await atFetch(url);
        dpClient = (probe.records || []).length > 0;
      } catch (e) {
        // 조회 실패 시 '고객사'로 간주 → 넛지 미노출 (오노출보다 미노출이 안전)
        console.error('[client-schedule] dpClient probe failed:', e.message);
        dpClient = true;
      }
    }

    return res.status(200).json({
      campaignName,
      brandName,
      branchName,
      month,
      partnerName,
      stats,
      scheduleItems: groupedScheduleItems,
      records: { influencer, experience, press, videoIssue },
      cpc,
      dpReport,
      dpClient: dpReport ? true : dpClient,
    });

  } catch (err) {
    console.error('[client-schedule] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
