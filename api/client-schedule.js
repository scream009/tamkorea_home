/**
 * Gravity | Client Schedule API
 * GET /api/client-schedule?campaignId=recXXXXXXXX
 */

import { monthKey, inMonthWindow } from './_month-window.js';

const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
const CAMPAIGN_TABLE = encodeURIComponent('Campaign_DB');
// Airtable formula 안 문자열 리터럴 이스케이프.
// ⚠️ 백슬래시를 **먼저** 늘려야 한다. 순서를 바꾸면 `\` 로 끝나는 값이
//    뒤따르는 따옴표를 삼켜 수식이 깨진다(_admin-auth.js 의 escFormula 와 같은 규칙).
const escFormula = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

    // ── 2.2 링크 누락 보정 ('귀속 정산월' 이 비어도 예약을 찾는다) ────
    // Campaign_DB '계약명' = 고객사명 + 지점명 을 **공백 없이** 붙인 formula.
    // 진행_DB_OLD '입력 정산월' = CS_DB 매장명(= '몽그레 월정리점') 기반.
    // 매장명에 공백이 있으면 두 문자열이 영원히 달라, 링크를 걸어주는
    // 오토메이션이 exact match 에 실패한다(실측: 누락 21건이 전부 이 경우).
    // 그러면 예약이 DB 에 있는데도 고객사 달력에서 사라진다.
    // → 링크는 지름길로만 쓰고, 화면은 '입력 정산월' 로도 같은 레코드를 찾는다.
    //   문자열에 정산월이 들어 있어 다른 달을 끌어오지 않는다.
    const nospace = (v) => String(v || '').replace(/\s/g, '');
    if (campaignName) {
      try {
        const key = nospace(campaignName);
        const expr = `SUBSTITUTE({입력 정산월}, " ", "") = '${key}'`;
        const url = `https://api.airtable.com/v0/${BASE_ID}/${RECORD_TABLE}`
          + `?filterByFormula=${encodeURIComponent(expr)}&pageSize=100`;
        const byName = await fetchAllRecords(url);
        const seen = new Set(allRecords.map((r) => r.id));
        const extra = byName.filter((r) => !seen.has(r.id));
        if (extra.length) {
          allRecords = allRecords.concat(extra);
          console.log(`[client-schedule] ${campaignId} 링크 누락 ${extra.length}건 이름으로 복구 (${campaignName})`);
        }
      } catch (e) {
        // 폴백 실패는 조용히 넘긴다 — 링크로 찾은 결과는 그대로 살린다
        console.error('[client-schedule] 이름기반 보정 실패:', e.message);
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

    // ── 정산월이 다른 실적 제거 ────────────────────────────────
    // Airtable 의 '귀속 정산월' 링크가 여러 캠페인에 걸린 레코드가 많다(실측 636건).
    // 링크만 믿으면 6월에 방문한 인플루언서가 6·7·8월 화면에 모두 나온다.
    // 레코드에는 '정산월' 이 정확히 들어 있으므로 그것으로 거른다.
    // 정산월이 비어 있으면(판단 불가) 기존대로 포함해 누락을 만들지 않는다.
    const normMonth = (v) => String(v || '').replace(/\s/g, '');
    const thisMonth = normMonth(month);
    if (thisMonth) {
      const before = allRecords.length;
      allRecords = allRecords.filter((rec) => {
        const sm = normMonth(rec.fields['정산월']);
        return !sm || sm === thisMonth;
      });
      const dropped = before - allRecords.length;
      if (dropped) {
        console.log(`[client-schedule] ${campaignId} 정산월 불일치 ${dropped}건 제외 (${month})`);
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

    // ── CPT(유료 입점) 상태 ────────────────────────────────────
    // CS_DB 가 마스터, Campaign_DB 는 lookup. 매장 단위 계약이라 계약월마다
    // 복사하지 않는다. lookup 이라 값이 배열로 온다.
    // 만료되면 따종이 유입 데이터를 아예 안 준다(소급 조회도 안 된다).
    // 그래서 '왜 숫자가 없는지'를 설명하려면 이 값이 필요하다.
    const one = (v) => (Array.isArray(v) ? v[0] : v) ?? null;
    const cptExpire = one(cf['DP_CPT_만료일 (from CS_DB)']);
    const cptState = one(cf['DP_CPT_상태 (from CS_DB)']);
    let cpt = null;
    if (cptExpire || cptState) {
      let daysLeft = null;
      if (cptExpire) {
        const t = Date.parse(`${String(cptExpire).slice(0, 10)}T00:00:00Z`);
        if (!Number.isNaN(t)) {
          const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
          daysLeft = Math.round((t - today) / 86400000);
        }
      }
      // 상태값이 비어 있어도 날짜만으로 판단할 수 있어야 한다.
      // 담당자가 만료일만 채우고 상태를 안 고르는 경우가 실제로 생긴다.
      const expired = daysLeft != null && daysLeft < 0;
      cpt = {
        expire: cptExpire ? String(cptExpire).slice(0, 10) : null,
        state: cptState || null,
        daysLeft,
        expired: expired || /만료/.test(String(cptState || '')) && !/임박/.test(String(cptState || '')),
        pending: /개통대기/.test(String(cptState || '')),
        // 60일 이내면 갱신 안내를 띄운다. 계약 갱신은 즉시 처리되지 않고,
        // 만료되면 그 기간 데이터가 영영 복구되지 않아 미리 알려야 한다.
        soon: daysLeft != null && daysLeft >= 0 && daysLeft <= 60,
        checked: one(cf['DP_CPT_확인일 (from CS_DB)']) || null,
      };
    }

    // ── 광고 설정 (예산·클릭단가·노출시간) ─────────────────────
    // ad_settings.py 가 推广通 포털에서 읽어 Campaign_DB 에 적재한다.
    // 리포트가 "얼마 썼다"만 말하면 사장님이 손댈 곳이 안 보인다. 손잡이는 셋뿐이다
    // — 예산 / 클릭단가 / 노출시간. 그 현재값을 같이 보여줘야 제안이 성립한다.
    // ⚠️ 美团 단가(AD_단가_메이투안)는 수집만 하고 **내보내지 않는다**(Owner 지시).
    let adSet = null;
    {
      const basic = cf['AD_기초예산'] ?? null;
      const bid   = cf['AD_단가_따종'] ?? null;
      const hours = cf['AD_노출시간'] || null;
      if (basic != null || bid != null || hours) {
        const ratio = cf['AD_주말상향률'] ?? null;
        // 기초예산이 없으면 CPC_일예산으로 대체한다. 단 그 값은 '그날 적용된 예산'이라
        // 주말엔 상향분이 섞여 있다 — 어디서 왔는지 프론트가 알 수 있게 표시해 준다.
        const budget = basic != null ? basic : (cf['CPC_일예산'] ?? null);
        const yst = cf['CPC_현재소진'] ?? null;
        const useRate = budget ? Math.round((Number(yst) / Number(budget)) * 100) : null;
        const hoursOn = cf['AD_주간노출시간'] ?? null;
        const daysLeft = cf['CPC_소진예상일'] ?? null;
        // ── 넛지 판정 ──────────────────────────────────────────
        // ⚠️ 소진률 하나로 판단하면 안 된다. 잔액이 0이면 광고가 꺼져 어제 집행도 0 이고,
        //    그게 '예산이 남는다'로 읽혀 충전이 필요한 매장에 "노출을 늘리세요"라는
        //    엉뚱한 제안이 나갔다(실측: 제주육림 — 잔액 0·소진 0 인데 room_to_grow).
        //    그래서 **잔액 → 집행여부 → 소진률** 순으로 걸러 낸다.
        const bal = cf['CPC_현재잔액'] ?? null;
        //    캠페인이 **정지**돼 있으면 잔액도 소진률도 의미가 없다. 설정은 멀쩡히
        //    살아 있고 광고만 꺼져 있는 상태다(실측 2026-08-02 함덕찜: 잔액 3,000元·
        //    예산 150元·단가 10.78元인데 "长期无消耗" 로 시스템이 정지시켰다).
        //    잔액부터 보면 '정상'으로 읽혀 정반대로 알린다 → 정지를 맨 앞에 둔다.
        const paused = String(cf['AD_캠페인상태'] || '') === 'paused';
        let nudge = null;
        if (paused) {
          nudge = 'paused';
        } else if (bal != null && Number(bal) <= 0) {
          nudge = 'no_balance';           // 광고 꺼짐 — 설정 얘기보다 충전이 먼저
        } else if (daysLeft != null && Number(daysLeft) <= 3) {
          nudge = 'low_balance';          // 곧 멈춘다
        } else if (useRate != null && useRate >= 95) {
          nudge = 'budget_capped';        // 예산이 매일 바닥 → 증액 검토
        } else if (yst != null && Number(yst) <= 0) {
          nudge = 'no_spend';             // 잔액은 있는데 집행 0 — 예산 문제가 아니다
        } else if (useRate != null && useRate < 60) {
          // 예산이 남는 건 돈이 모자란 게 아니라 노출 기회가 없다는 뜻이다.
          // 시간이 이미 168h면 늘릴 곳이 없어 단가밖에 남지 않는다.
          nudge = hoursOn != null && hoursOn >= 168 ? 'bid_only' : 'room_to_grow';
        }
        adSet = {
          budget, budgetIsFallback: basic == null && budget != null,
          floatRatio: ratio, peak: cf['AD_피크예산'] ?? null,
          bid, hours, hoursOn, yesterday: yst, useRate, daysLeft,
          checked: cf['AD_설정확인일'] || null,
          paused,
          nudge,
        };
      }
    }

    // ── 개선 여지 추정 ────────────────────────────────────────
    // "설정을 바꾸면 얼마나 오를까"를 숫자로 말한다. 근거가 없으면 아예 만들지 않는다.
    //
    // 세 축을 쓴다:
    //   ① 소진 여력 — 예산 대비 실제 집행률의 역수. **산술이라 반박 여지가 없다.**
    //   ② 노출↔순위 — 21곳 실측 회귀(2026-08-02, log-log r=-0.757, 기울기 -0.93).
    //      노출이 2배면 순위 숫자가 약 절반. 어디까지나 **추정**이라 화면에 그렇게 적는다.
    //   ③ 광고 기여도 — 노출 중 광고가 만든 비율. 높을수록 설정 변경이 그대로 반영된다.
    //      낮은 매장(자연 유입 위주)에 같은 제안을 하면 기대만 키운다.
    // 노출↔순위 회귀 — **하드코딩하지 않는다.** 같은 달 실측으로 매번 계산한다.
    // 매장이 늘거나 상권 판도가 바뀌면 계수도 따라 움직여야 한다.
    //
    // 같은 업종끼리 보면 관계가 훨씬 뚜렷하다(실측: 烤肉 8곳 r=-0.95 vs 전체 21곳 r=-0.76).
    // 다만 3곳짜리 업종에서 r=-0.99 가 나오는 건 우연이기 쉬워, **표본이 5곳 이상일 때만**
    // 업종 계수를 쓰고 아니면 상권 전체로 물러선다. 화면에 표본 수는 적지 않으므로
    // (개수가 적어 보이면 오히려 신뢰를 잃는다) 이 안전장치가 정직성을 대신 담보한다.
    const MIN_CAT_N = 5;
    const regress = (pairs) => {
      const v = pairs.filter(([e, r]) => e > 0 && r > 0);
      if (v.length < 3) return null;
      const lx = v.map(([e]) => Math.log10(e));
      const ly = v.map(([, r]) => Math.log10(r));
      const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
      const mx = mean(lx), my = mean(ly);
      let num = 0, dx = 0, dy = 0;
      for (let i = 0; i < lx.length; i++) {
        num += (lx[i] - mx) * (ly[i] - my);
        dx += (lx[i] - mx) ** 2;
        dy += (ly[i] - my) ** 2;
      }
      if (!dx || !dy) return null;
      return { r: num / Math.sqrt(dx * dy), slope: num / dx, n: v.length };
    };
    const detailAdShare = (f) => {
      try {
        const j = JSON.parse(f['DP_리포트JSON'] || '{}');
        return j?.adflow?.running ? j.adflow.imp_share : null;
      } catch { return null; }
    };
    let projection = null;
    try {
      const expNow = Number(cf['DP_노출']) || 0;
      const rankNow = Number(cf['DP_순위']) || 0;
      const budget = Number(cf['AD_기초예산'] ?? cf['CPC_일예산']) || 0;
      const spent = Number(cf['CPC_현재소진']) || 0;
      const useRate = budget ? (spent / budget) * 100 : null;
      const adShare = adSet && detailAdShare(cf);
      // 여력이 없거나(이미 다 씀) 기준 수치가 없으면 제안하지 않는다
      if (expNow > 0 && rankNow > 0 && useRate != null && useRate > 0 && useRate < 90) {
        const headroom = Math.min(100 / useRate, 4);      // 4배 넘는 추정은 과장이다
        const expMax = Math.round(expNow * headroom);
        // 계산 근거를 그대로 내보낸다. "몇 명 더"만 던지면 고객이 검산할 수 없다.
        //   지금 집행액으로 얻은 1元당 노출 × 책정 예산 = 도달 가능치
        const perYuan = spent > 0 ? expNow / spent : null;

        // 같은 달 실측을 **한 번만** 읽어 회귀·설정범위·사례를 모두 뽑는다.
        const myCat = cf['DP_업종'] || '';
        const myArea = cf['DP_상권'] || '';
        let reg = null, scope = '', peerBid = null, peerHours = null, peer = null;
        try {
          const mf = encodeURIComponent(
            `AND({계약월}='${escFormula(month)}', {DP_노출}>0, {DP_순위}>0)`);
          const purl = `https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGN_TABLE}`
            + `?filterByFormula=${mf}&pageSize=100`
            + `&fields%5B%5D=${encodeURIComponent('DP_노출')}`
            + `&fields%5B%5D=${encodeURIComponent('DP_순위')}`
            + `&fields%5B%5D=${encodeURIComponent('DP_매장코드')}`
            + `&fields%5B%5D=${encodeURIComponent('DP_업종')}`
            + `&fields%5B%5D=${encodeURIComponent('AD_단가_따종')}`
            + `&fields%5B%5D=${encodeURIComponent('AD_주간노출시간')}`;
          const all = (await fetchAllRecords(purl)).map((r) => ({
            slug: r.fields['DP_매장코드'], cat: r.fields['DP_업종'] || '',
            exp: Number(r.fields['DP_노출']), rank: Number(r.fields['DP_순위']),
            bid: Number(r.fields['AD_단가_따종']) || null,
            hours: Number(r.fields['AD_주간노출시간']) || null,
          }));
          const sameCat = all.filter((x) => myCat && x.cat === myCat);

          // 업종 표본이 충분하면 업종 계수, 아니면 상권 전체로 물러선다.
          const catReg = sameCat.length >= MIN_CAT_N
            ? regress(sameCat.map((x) => [x.exp, x.rank])) : null;
          reg = catReg || regress(all.map((x) => [x.exp, x.rank]));
          // 상권명은 플랫폼이 중문으로 준다(济州岛). 고객 화면엔 한글로 내보낸다.
          const AREA_KO = { '济州岛': '제주', '首尔': '서울', '釜山': '부산' };
          const area = AREA_KO[myArea] || myArea;
          scope = catReg ? `같은 업종${area ? ` · ${area} 상권` : ''}`
                         : (area ? `${area} 상권` : '같은 상권');

          // 설정 범위·사례는 **같은 업종에서 우리보다 노출이 많은 매장**만 본다.
          // 순위는 상권 안에서 매겨지므로 업종이 다르면 비교가 성립하지 않는다.
          const up = sameCat.filter((x) => x.slug !== cf['DP_매장코드'] && x.exp > expNow);
          const rng = (vals) => {
            const v = vals.filter((x) => x > 0).sort((a, b) => a - b);
            return v.length ? { lo: v[0], hi: v[v.length - 1] } : null;
          };
          peerBid = rng(up.map((x) => x.bid));
          peerHours = rng(up.map((x) => x.hours));
          if (up.length) {
            up.sort((a, b) => Math.abs(a.exp - expMax) - Math.abs(b.exp - expMax));
            const c = up[0];
            // 목표와 동떨어진 사례를 들면 오히려 신뢰를 잃는다(±60% 안쪽만)
            // ⚠️ 매장명은 절대 내보내지 않는다 — 다른 고객사의 계약 정보다.
            if (Math.abs(c.exp - expMax) <= expMax * 0.6) peer = { exp: c.exp, rank: c.rank };
          }
        } catch (e) {
          console.error('[client-schedule] 비교군 조회 실패:', e.message);
        }

        // 회귀를 못 구했으면 순위 추정을 내지 않는다 — 근거 없는 숫자는 만들지 않는다.
        const rankEst = reg
          ? Math.max(1, Math.round(rankNow * Math.pow(headroom, reg.slope))) : null;

        projection = {
          useRate: Math.round(useRate), headroom: Number(headroom.toFixed(1)),
          expNow, expMax, rankNow, rankEst, adShare: adShare ?? null,
          budget: Math.round(budget), spent: Math.round(spent),
          unused: Math.round(budget - spent),
          perYuan: perYuan ? Math.round(perYuan) : null,
          // 표본 수는 내보내지 않는다(적어 보이면 오히려 신뢰를 잃는다).
          // 대신 MIN_CAT_N 안전장치로 '표본이 적은 업종 계수'는 애초에 쓰지 않는다.
          corr: reg ? reg.r.toFixed(2) : null, scope,
          bid: cf['AD_단가_따종'] ?? null,
          hours: cf['AD_주간노출시간'] ?? null,
          // 주말 상향이 꺼져 있으면 그 자체가 '추가 예산 없이' 쓸 수 있는 손잡이다
          weekendOff: !(Number(cf['AD_주말상향률']) > 0),
          peerBid, peerHours, peer,
        };
      }
    } catch (e) {
      console.error('[client-schedule] projection 계산 실패:', e.message);
    }

    let dpReport = null;
    if (cf['DP_기간']) {
      let detail = null;
      try { detail = cf['DP_리포트JSON'] ? JSON.parse(cf['DP_리포트JSON']) : null; } catch (e) { detail = null; }
      const storeCode = cf['DP_매장코드'] || '';
      dpReport = {
        cpt,
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
    // 판정 기준 2가지 (OR):
    //   ① DP-office_ID  — 따종 상인포털 계정을 우리가 보유 = 입점·운영 중.
    //                     리포트를 아직 한 번도 안 돌린 신규 매장도 잡힌다.
    //   ② DP_기간       — 월간 리포트를 돌린 적이 있다.
    //                     (office_ID가 비어 있는데 리포트는 있는 매장이 실제로 존재)
    // 이번 달 리포트가 없어도(월초·과거월 링크) 같은 매장의 다른 계약월을 보고 판단한다.
    // ※ office_ID/PASS는 자격증명이므로 존재 여부만 쓰고 값은 절대 응답에 담지 않는다.
    const OFFICE_ID_FIELD = 'DP-office_ID (from CS_DB)';
    const officeIdHere = cf[OFFICE_ID_FIELD];
    const hasOfficeId = Array.isArray(officeIdHere)
      ? officeIdHere.some((v) => String(v || '').trim() !== '')
      : String(officeIdHere || '').trim() !== '';

    let dpClient = !!dpReport || hasOfficeId;
    if (!dpClient && (brandName || branchName)) {
      try {
        const esc = (s) => String(s).replace(/"/g, '\\"');
        const conds = [`OR({DP_기간} != "", ARRAYJOIN({${OFFICE_ID_FIELD}}) != "")`];
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

    // ── 같은 매장의 인접 실적월 ────────────────────────────────
    // 링크는 계약월 레코드 하나에 고정돼 있어 다른 달 실적을 볼 수 없다.
    // 같은 매장의 전월/다음달 레코드 ID를 함께 주어 화면에서 전환하게 한다.
    // (요청대로 ±1개월만 — 전체 목록을 열어주면 오래된 달까지 노출된다)
    let siblings = { prev: null, next: null };
    if (brandName) {
      try {
        const esc = (s) => String(s).replace(/"/g, '\\"');
        const conds = [`FIND("${esc(brandName)}", {고객사명} & "") > 0`];
        if (branchName) conds.push(`FIND("${esc(branchName)}", {지점명} & "") > 0`);
        const f = encodeURIComponent(`AND(${conds.join(',')})`);
        const u = `https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGN_TABLE}`
          + `?filterByFormula=${f}&pageSize=100&fields%5B%5D=${encodeURIComponent('계약월')}`;
        const all = await fetchAllRecords(u);
        const cur = monthKey(month);
        // 조회 가능 기간 — 협력사 화면과 같은 규칙(_month-window.js).
        // 이 제한이 없으면 7월 링크에서 6월 → 5월 → 4월 로 계속 거슬러 올라가
        // 오래된 실적이 전부 열린다.
        // 예전엔 여기에 브랜드별 하한(양푼왕갈비 6월)을 하드코딩해 뒀었다.
        // 하한이 절대값(2026. 6월)으로 바뀌면서 그 예외가 필요 없어졌다 —
        // 링크를 새로 배포할 때마다 브랜드를 한 줄씩 추가하던 문제도 같이 사라진다.
        const list = all
          .map((r) => ({ id: r.id, month: r.fields['계약월'] || '', k: monthKey(r.fields['계약월']) }))
          .filter((x) => inMonthWindow(x.month));
        const prev = list.filter((x) => x.k === cur - 1)[0];
        const next = list.filter((x) => x.k === cur + 1)[0];
        siblings = {
          prev: prev ? { id: prev.id, month: prev.month } : null,
          next: next ? { id: next.id, month: next.month } : null,
        };
      } catch (e) {
        console.error('[client-schedule] siblings lookup failed:', e.message);
      }
    }

    return res.status(200).json({
      campaignName,
      brandName,
      branchName,
      month,
      siblings,
      partnerName,
      stats,
      adSet,      // 광고 설정 — 리포트 화면(DpReportPage)이 쓴다
      projection, // 개선 여지 추정(근거 있을 때만 · 없으면 null)
      scheduleItems: groupedScheduleItems,
      records: { influencer, experience, press, videoIssue },
      cpc,
      cpt,        // 달력 화면도 쓸 수 있게 최상위에도 둔다(리포트를 한 번도 안 돌린 매장 포함)
      dpReport,
      dpClient,   // boolean 만 — 자격증명 값은 절대 내보내지 않는다
    });

  } catch (err) {
    console.error('[client-schedule] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
