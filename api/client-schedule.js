/**
 * Gravity | Client Schedule API
 * GET /api/client-schedule?campaignId=recXXXXXXXX
 */

import { monthKey, inMonthWindow, skipKeysFor } from './_month-window.js';
import { composeSentMessage, pickMessage, maskBrand } from './_resv-message.js';
import { storeSig, storeCodeDaily } from './_qr-sign.js';

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

    // ⚠️ 예약테이블은 **폐기 예정 테이블**이다 (Owner 확인 2026-08-13 — 지금 흐름은
    //    예약입력_DB → 진행_DB_OLD). 여기서는 옛 건의 폴백으로만 쓴다.
    //    try/catch 가 필수다 — 테이블이 삭제되면 예전 코드는 통째로 500 이 나서
    //    고객 달력이 열리지 않는다. 실패하면 폴백만 포기하고 화면은 그린다.
    //    (실측 2026-08-13: 예약입력_DB 매칭률 8월 98% · 7월 87% · 6월 83%)
    const resvMap = {};
    if (reservationIds.size > 0) {
      try {
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
            specialNote: r.fields['특이사항'] || r.fields['인원메모'] || r.fields['비고'] || '',
            // 취소·노쇼 안내문 복원용. 예약입력_DB 를 못 찾은 건(팀명생성기 불일치)의
            // 유일한 본문 공급원이다 — 이 테이블은 링크로 걸려 있어 항상 따라온다.
            reservationMsg: r.fields['예약메시지'] || '',
            changeMessage: r.fields['변경메시지'] || '',
            customerMemo: r.fields['고객전달메모'] || '',
          };
        });
      }
      } catch (e) {
        // 폐기 테이블이 사라졌거나 조회 실패 — 폴백 없이 예약입력_DB 기준으로 그린다
        console.error('[client-schedule] 예약테이블(폐기예정) 조회 실패 — 폴백 생략:', e.message);
      }
    }

    // ── 2.7 예약입력_DB (팀 단위 원본) ────────────────────────
    // 달력에 보여 줄 '예약 내용'의 원본은 예약입력_DB 다. 담당자가 팀 단위로
    // 여기에 입력하고, 오토메이션이 인플별로 쪼개 진행_DB_OLD 를 만든다.
    // 쪼개는 과정에서 값이 깨지는 일이 있어(실측: 예약일시가 자정으로 소실되거나
    // 타임스탬프가 섞여 들어간 건 16건) 원본을 직접 읽는다.
    // ⚠️ 상태(취소·노쇼)와 정산월은 그대로 진행_DB_OLD 를 쓴다.
    //    예약입력_DB 는 '예약 시점' 테이블이라 노쇼가 0건이고(방문 후 판정),
    //    취소도 절반만 반영된다. 그것으로 달력을 만들면 취소된 예약이 살아난다.
    // 매칭은 팀명생성기(매장명_MMDD_인플ID). 예약봇 캐스케이드가 쓰는 키와 같다.
    // 짝을 못 찾으면 아래 로직이 기존 값을 그대로 쓰므로 과거 달도 안전하다.
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
        const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent('예약입력_DB')}`
          + `?filterByFormula=${encodeURIComponent(`OR(${orParts})`)}&pageSize=100`;
        const recs = await fetchAllRecords(url);
        recs.forEach((r) => {
          const k = nospace(r.fields['팀명생성기']);
          if (k && !resvInputMap[k]) resvInputMap[k] = r.fields;
        });
      }
    } catch (e) {
      // 실패해도 화면은 떠야 한다. 기존 값으로 그리면 된다.
      console.error('[client-schedule] 예약입력_DB 조회 실패:', e.message);
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

    // ── 종결처리 제외 (Owner 지정 2026-08-10) ─────────────────
    // 종결처리 = 관리용 마감 상태. 취소·노쇼(달력에는 남겨 이력을 보여줌)와 달리
    // 고객 화면에 보여줄 이유가 없다 — 달력뷰·리스트뷰 모두에서 완전히 뺀다.
    {
      const before = allRecords.length;
      allRecords = allRecords.filter(
        (rec) => String(rec.fields['진행상태'] || '').replace(/\s/g, '') !== '종결처리');
      const dropped = before - allRecords.length;
      if (dropped) console.log(`[client-schedule] ${campaignId} 종결처리 ${dropped}건 제외`);
    }

    // 영상 이상(삭제/비공개) 판별 — 공백 무시('영상 이상' 표기도 인식)
    const isVideoIssue = (status) => (status || '').replace(/\s/g, '').includes('영상이상');

    // 3. 데이터 가공 및 분류
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
      let reserveDate = f['예약일시'] || null;

      // 예약테이블(Shadow Group) 데이터와 매핑
      const resvLinks = f['예약팀명_DB'] || [];
      let totalPax = f['# 총인원'] || f['총인원'] || f['총 인원'] || ''; // Fallback
      
      // 예약메시지 직접 생성을 위한 필드들 (특이사항, 건수 등)
      let memo = f['특이사항'] || f['인원메모'] || f['비고'] || ''; 
      let xhsCount = f['XHS_건수'] || f['샤오홍슈 건수'];
      let dpCount = f['DP_건수'] || f['따중리뷰 건수'];
      // 플랫폼 다변화(2026-08-13) — 값은 아래 inTeam(예약입력_DB, 팀명생성기 매칭)에서 온다.
      // 빈값이면 기본(샤오홍슈/따종디엔핑)으로 취급하므로 구 데이터도 그대로 그려진다.
      const arr1 = (v) => (Array.isArray(v) ? (v[0] || '') : (v || ''));
      let xhsPlat = '';
      let dpPlat = '';

      // 팀 묶음 키 — 링크가 있으면 기존대로 예약테이블 레코드 ID(동작 불변),
      // 예약테이블이 폐기돼 링크 필드가 사라지면 팀명생성기 문자열로 묶는다.
      // 이 폴백이 없으면 테이블 삭제 순간 2인 팀이 달력에 낱개 블록으로 흩어진다.
      const teamKeyStr = nospace(f['팀명생성기']);
      const teamId = (resvLinks.length > 0 ? resvLinks[0] : '') || teamKeyStr || rec.id;
      const resvData = resvLinks.length > 0 ? resvMap[resvLinks[0]] : null;

      if (resvData) {
        if (resvData.pax) totalPax = resvData.pax;
        if (resvData.specialNote) memo = resvData.specialNote;
        if (resvData.xhsCount !== undefined) xhsCount = resvData.xhsCount;
        if (resvData.dpCount !== undefined) dpCount = resvData.dpCount;
      }

      // ── 예약입력_DB(팀 단위 원본)가 있으면 표시값을 그것으로 덮는다 ──
      // 예약봇 V7 은 변경이 확정돼도 예약일시를 원본으로 두고 변경일시에만
      // 새 값을 남긴다. 달력이 예약일시만 읽어 변경된 예약이 옛 시각으로
      // 계속 표시됐다(실측 110건).
      // 변경일시가 있으면 그것이 최신 예약 시각이다. 상태는 보지 않는다.
      // 설계서(v1.3 §4.1.4)에는 IF(진행상태="변경확정", 변경일시, 예약일시) 로
      // 적혀 있지만 그건 변경요청 → 사람이 변경확정 하던 V5 시절 규칙이다.
      // V6 부터 봇이 변경요청을 발송 즉시 변경확정으로 바꾸므로 '변경요청'
      // 상태는 데이터에 남지 않고(실측 0건), 상태 조건을 걸면 변경 뒤 취소된
      // 건이 옛 시각으로 표시된다(용담밭담 함덕점 7월: 최종 8/5 인데 7/5 로 표시).
      const inTeam = resvInputMap[nospace(f['팀명생성기'])];
      if (inTeam) {
        const d = inTeam['변경일시'] || inTeam['예약일시'];
        if (d) reserveDate = d;
        const pax = inTeam['변경인원'] ?? inTeam['총인원'];
        if (pax !== undefined && pax !== null && pax !== '') totalPax = pax;
        if (inTeam['인원메모']) memo = inTeam['인원메모'];
        if (inTeam['XHS_건수'] !== undefined) xhsCount = inTeam['XHS_건수'];
        if (inTeam['DP_건수'] !== undefined) dpCount = inTeam['DP_건수'];
        // ⚠️ 플랫폼의 **유일한 실제 공급원**이 여기다.
        //    예약입력_DB ↔ 예약테이블 링크는 2,782건 전부 비어 있어(2026-08-13 실측)
        //    lookup 체인으로는 값이 흐르지 않는다. 두 테이블을 잇는 건 팀명생성기 문자열뿐이고,
        //    이 inTeam 이 바로 그 매칭 결과다.
        if (inTeam['XHS_플랫폼']) xhsPlat = arr1(inTeam['XHS_플랫폼']);
        if (inTeam['DP_플랫폼']) dpPlat = arr1(inTeam['DP_플랫폼']);
      }

      // 취소·노쇼 사유 — 담당자가 적어 둔 경우에만 달력에 함께 보여 준다.
      // '변경/취소 내용' 은 섭외담당이 사유를 적는 칸인데, 예약봇이 여기에
      // 변경메시지 전문을 덮어써 왔다(실측 101건 중 96건이 봇 복사본).
      // 봇 복사본은 【매장명】으로 시작하는 예약 안내문이라 고객 화면에 그대로
      // 노출되면 안 된다. 사람이 쓴 짧은 사유만 통과시킨다.
      const pickNote = (v) => {
        const s = String(v || '').trim();
        if (!s || s === '-') return '';
        if (s.includes('【') || s.length > 60) return '';   // 봇이 복사한 메시지 전문
        if (s.startsWith('⚠')) return '';                   // 시스템 경고문
        return s;
      };
      // '고객전달메모' 가 실제 사유란이다 — 담당자가 여기 적으면 예약봇이
      // 취소·노쇼 안내문 뒤에 붙여 고객사에 발송한다({memo_line}).
      const cancelNote = (status.includes('취소') || status.includes('노쇼'))
        ? (pickNote(f['고객전달메모'])
           || (inTeam ? pickNote(inTeam['고객전달메모']) : '')
           || pickNote(f['변경/취소 내용']))
        : '';

      // ── 변경 이력 ────────────────────────────────────────────
      // 달력 블록은 변경된 일시에 그려지는데, 그것만 보면 고객사는 예약이
      // 바뀌었다는 사실 자체를 알 수 없다. "원래 7/18 이었는데?" 라는 문의가
      // 그래서 생긴다. 원래 값과 변경 안내문을 함께 내려보내 화면에서 알린다.
      const chSrc = inTeam || f;
      const changedFrom = (chSrc['변경일시'] && chSrc['예약일시']
        && chSrc['변경일시'] !== chSrc['예약일시']) ? chSrc['예약일시'] : '';
      const changedPaxFrom = (changedFrom && chSrc['변경인원'] != null
        && chSrc['변경인원'] !== chSrc['총인원']) ? chSrc['총인원'] : null;
      // 변경메시지는 '▼ 기존 예약 … ▼ 변경 요청 내용' 을 담은 완성형 Formula.
      // 예약봇이 식당에 실제로 보낸 문구라, 고객사가 받은 카톡과 같은 내용이다.
      const changeMessage = changedFrom ? String(chSrc['변경메시지'] || '') : '';

      // ── 취소·노쇼: 고객사가 마지막으로 받은 카톡을 복원한다 ──────
      // 달력의 취소 블록은 '예약이 잡혔습니다' 원본 안내문만 보여 줬다. 정작 고객사
      // 톡방에 마지막으로 간 건 그 뒤에 취소 안내가 붙은 메시지다. 화면과 카톡이
      // 어긋나면 "취소한다더니 예약 화면엔 그대로냐"는 문의가 그대로 생긴다.
      // 봇은 발송문을 저장하지 않으므로(_resv-message.js 주석) 같은 규칙으로 조립한다.
      // 본문 우선순위도 봇과 같다: 예약입력_DB(봇이 읽는 원본) → 예약테이블 → 진행_DB_OLD 사본.
      // 봇이 읽는 순서와 같다: 예약입력_DB(원본) → 예약테이블 → 진행_DB_OLD 사본.
      const rawReservationMsg = (inTeam && inTeam['예약메시지'])
        || (resvData && resvData.reservationMsg) || '';
      const { sentMessage, noticeTail } = composeSentMessage({
        status,
        reservationMsg: rawReservationMsg,
        changeMessage: (inTeam && inTeam['변경메시지'])
          || (resvData && resvData.changeMessage) || f['변경메시지'] || '',
        customerMemo: (inTeam && inTeam['고객전달메모'])
          || f['고객전달메모'] || (resvData && resvData.customerMemo) || '',
      });

      // ── 평소 예약도 '보낸 그대로' ────────────────────────────────
      // 취소·변경 건은 위에서 실제 발송문을 내려보내는데, 정작 **가장 많은 정상
      // 예약**은 화면이 자체 조립한 문구를 보여 줬다(generateDynamicMemo).
      // 그래서 Airtable 예약메시지 Formula 를 고쳐도 달력에는 반영되지 않았다
      // (실측 2026-08-05: 제주육림 채널링크 추가분이 취소·변경 건에만 나타남).
      // 화면이 '보낸 그대로'를 보여 준다는 원칙은 상태와 무관해야 한다.
      // ⚠ 로 시작하는 값은 봇이 발송을 막는 문구라 여기서도 버린다(pickMessage).
      const reservationMsg = pickMessage(rawReservationMsg);


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
        dpCount,
        xhsPlat,   // 게시 플랫폼 — 빈값 = 기본(샤오홍슈/따종)
        dpPlat,
        cancelNote,
        changedFrom,
        changedPaxFrom,
        // 세 메시지 모두 협력사 화면이면 브랜드를 협력사명으로 치환해 내보낸다.
        // Formula 가 만든 완성 문장이라 본문에 브랜드가 박혀 있을 수 있다.
        changeMessage: maskBrand(changeMessage, partnerName),
        sentMessage: maskBrand(sentMessage, partnerName),  // 취소·노쇼일 때만 채워진다
        reservationMsg: maskBrand(reservationMsg, partnerName),  // 평소 예약의 발송 원문
        noticeTail,    // 본문을 못 찾은 경우 화면이 자체 본문 뒤에 붙일 안내문
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
    // ── 같은 매장의 모든 계약월 레코드 ────────────────────────────
    // 공유 링크는 계약월 하나에 묶여 있다. 그런데 CPC 잔액·광고 설정은
    // '지금 상태'라 7월 링크에서도 **가장 최근에 수집한 값**이 나와야 한다.
    // (7월로 공유한 고객사와 8월로 공유한 고객사가 섞여 있는데, CPC 현황이
    //  링크의 달에 갇히면 어떤 고객사는 몇 주 전 잔액을 계속 보게 된다)
    // 리포트도 마찬가지 — 최신본을 기본으로 보여주고 지난 달도 고를 수 있어야 한다.
    // 여기서 한 번만 읽어 siblings·CPC·리포트가 같이 쓴다(질의 중복 제거).
    let storeRecs = [];
    {
      const escQ = (s) => String(s).replace(/'/g, "\\'");
      const escF = (s) => String(s).replace(/"/g, '\\"');
      const parts = [];
      const code = cf['DP_매장코드'] || '';
      if (code) parts.push(`{DP_매장코드}='${escQ(code)}'`);
      const nameConds = [];
      if (brandName) nameConds.push(`FIND("${escF(brandName)}", {고객사명} & "") > 0`);
      if (branchName) nameConds.push(`FIND("${escF(branchName)}", {지점명} & "") > 0`);
      if (nameConds.length) parts.push(`AND(${nameConds.join(',')})`);
      if (parts.length) {
        try {
          // fields[] 를 지정하지 않는다 — 스키마가 리네임되면 UNKNOWN_FIELD_NAME 으로
          // 500 이 난다(실측: '인플_실적'). 매장당 레코드는 10건 안쪽이라 전체를 받아도 가볍다.
          const f = encodeURIComponent(parts.length > 1 ? `OR(${parts.join(',')})` : parts[0]);
          storeRecs = await fetchAllRecords(
            `https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGN_TABLE}?filterByFormula=${f}&pageSize=100`);
        } catch (e) {
          console.error('[client-schedule] store records lookup failed:', e.message);
        }
      }
      if (!storeRecs.length) storeRecs = [{ id: campaignId, fields: cf }];
    }
    // 가장 최근에 CPC 를 수집한 레코드. 갱신일이 없으면 후보가 아니다.
    const cpcSrc = storeRecs
      .filter((r) => r.fields['CPC_갱신일'] && r.fields['CPC_현재잔액'] != null)
      .sort((a, b) => String(b.fields['CPC_갱신일']).localeCompare(String(a.fields['CPC_갱신일'])))[0]
      || (cf['CPC_현재잔액'] != null ? { id: campaignId, fields: cf } : null);

    let cpc = null;
    if (cpcSrc) {
      const sf = cpcSrc.fields;
      cpc = {
        balance: sf['CPC_현재잔액'],
        yesterday: sf['CPC_현재소진'] ?? 0,
        status: STATUS_MAP[sf['CPC_상태']] || 'red',
        daysLeft: sf['CPC_소진예상일'] ?? null,
        updated: fmtKST(sf['CPC_갱신일']),
        // 어느 계약월에서 온 값인지 밝힌다. 링크의 달과 다르면 화면이 그렇게 표시한다 —
        // 안 밝히면 7월 리포트에 8월 잔액이 섞여 나온 것처럼 보인다.
        month: sf['계약월'] || '',
        fromOtherMonth: (sf['계약월'] || '') !== month,
        // 며칠 전 값인가. 잔액은 매일 줄어드는 값이라 오래되면 사실과 벌어진다.
        // 실측 2026-08-10 한라갈치: 08-08 수집분이 0원인데 그 뒤 충전됐다 —
        // 화면은 '광고 중단'이라 단정하고 있었다. 나이를 알려 주고 단정을 피한다.
        ageDays: (() => {
          const t = Date.parse(sf['CPC_갱신일'] || '');
          if (Number.isNaN(t)) return null;
          return Math.max(0, Math.floor((Date.now() - t) / 86400000));
        })(),
        weekly: [1, 2, 3, 4, 5]
          .map((n) => sf[`CPC_주${n}잔액`])
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

    // 넛지 판정 — 현재값 경로와 리포트 스냅샷 경로가 **같은 규칙**을 쓰도록 한 곳에 둔다.
    // 순서(정지 → 잔액 → 임박 → 예산바닥 → 미집행 → 여유)의 근거는 아래 adSet 블록 주석 참조.
    const judgeNudge = ({ paused, bal, yst, useRate, daysLeft, hoursOn }) => {
      if (paused) return 'paused';
      if (bal != null && Number(bal) <= 0) return 'no_balance';   // 충전이 먼저
      if (daysLeft != null && Number(daysLeft) <= 3) return 'low_balance';
      if (useRate != null && useRate >= 95) return 'budget_capped';
      if (yst != null && Number(yst) <= 0) return 'no_spend';
      if (useRate != null && useRate < 60) {
        return hoursOn != null && hoursOn >= 168 ? 'bid_only' : 'room_to_grow';
      }
      return null;
    };

    // ── 광고 설정 (예산·클릭단가·노출시간) ─────────────────────
    // ad_settings.py 가 推广通 포털에서 읽어 Campaign_DB 에 적재한다.
    // 리포트가 "얼마 썼다"만 말하면 사장님이 손댈 곳이 안 보인다. 손잡이는 셋뿐이다
    // — 예산 / 클릭단가 / 노출시간. 그 현재값을 같이 보여줘야 제안이 성립한다.
    // ⚠️ 美团 단가(AD_단가_메이투안)는 수집만 하고 **내보내지 않는다**(Owner 지시).
    let adSet = null;
    // 포털 설정을 **실제로 수집했는가**. 이 구분이 없으면 '못 가져온 것'을
    // '꺼져 있는 것'으로 단정하게 된다 — 주말 상향이 대표적이다.
    let adFetched = false;
    {
      // 광고 설정도 '지금 상태'다. CPC 와 같은 회차에 수집되므로 같은 레코드에서 읽는다.
      // 링크의 달에 갇히면 8월에 바꾼 예산·단가가 7월 링크에 영영 안 나온다.
      const af = (cpcSrc && cpcSrc.fields) || cf;
      const basic = af['AD_기초예산'] ?? null;
      const bid   = af['AD_단가_따종'] ?? null;
      const hours = af['AD_노출시간'] || null;
      const ratio = af['AD_주말상향률'] ?? null;
      // 기초예산이 없으면 CPC_일예산으로 대체한다. 단 그 값은 '그날 적용된 예산'이라
      // 주말엔 상향분이 섞여 있다 — 어디서 왔는지 프론트가 알 수 있게 표시해 준다.
      const budget = basic != null ? basic : (af['CPC_일예산'] ?? null);
      // ⚠️ 게이트에 **budget 을 반드시 포함**한다. AD_* 세 개만 보면, ad_settings.py 가
      //    아직 안 돈 신규 계약월(추가 당일 등)은 셋 다 비어 adSet 이 통째로 null 이 되고,
      //    그러면 프론트의 AdSettings 가 즉시 return null 하면서 그 안에 들어 있는
      //    **소진률 게이지·넛지·'개선 여지'(Upside) 가 전부 사라진다.**
      //    예산이 남는 매장에 정작 그 안내가 안 나가는 게 이 경로였다
      //    (실측 2026-08-03 용담밭담 8월: CPC_일예산 120元·소진 34元(28%)인데 화면 공백).
      //    CPC_일예산만 있어도 예산/소진률/넛지는 전부 성립한다 — 단가·시간 카드는
      //    프론트가 값이 있을 때만 그리므로 비어 있어도 깨지지 않는다.
      adFetched = basic != null || bid != null || hours != null;
      if (adFetched || budget != null) {
        const yst = af['CPC_현재소진'] ?? null;
        const useRate = budget ? Math.round((Number(yst) / Number(budget)) * 100) : null;
        const hoursOn = af['AD_주간노출시간'] ?? null;
        const daysLeft = af['CPC_소진예상일'] ?? null;
        // ── 넛지 판정 ──────────────────────────────────────────
        // ⚠️ 소진률 하나로 판단하면 안 된다. 잔액이 0이면 광고가 꺼져 어제 집행도 0 이고,
        //    그게 '예산이 남는다'로 읽혀 충전이 필요한 매장에 "노출을 늘리세요"라는
        //    엉뚱한 제안이 나갔다(실측: 제주육림 — 잔액 0·소진 0 인데 room_to_grow).
        //    그래서 **잔액 → 집행여부 → 소진률** 순으로 걸러 낸다.
        const bal = af['CPC_현재잔액'] ?? null;
        //    캠페인이 **정지**돼 있으면 잔액도 소진률도 의미가 없다. 설정은 멀쩡히
        //    살아 있고 광고만 꺼져 있는 상태다(실측 2026-08-02 함덕찜: 잔액 3,000元·
        //    예산 150元·단가 10.78元인데 "长期无消耗" 로 시스템이 정지시켰다).
        //    잔액부터 보면 '정상'으로 읽혀 정반대로 알린다 → 정지를 맨 앞에 둔다.
        //    ⚠️ 단 '정지' 판정은 **오탐이 난다.** ad_settings.py 가 사유 문구 없이
        //    `추광통 캠페인 수>0 && 집행중 0` 만으로도 정지로 찍는데, 이 분기는
        //    **돌고 있는 매장에서도 걸린다**(실측 2026-08-03: 석화 연동점 — 소진률
        //    107%·일 320元 집행 중인데 paused 판정).
        //    돈이 실제로 나갔다는 사실이 포털 카운터보다 강한 증거다. 어제 집행액이
        //    있으면 정지 주장을 채택하지 않는다 — 안 그러면 같은 리포트 안에서
        //    "노출이 없었습니다" 와 "어제 34元 집행 · 노출의 94.9%가 광고" 가
        //    나란히 서서 서로를 반박한다(실측 2026-08-03 용담밭담).
        const pausedFlag = String(af['AD_캠페인상태'] || '') === 'paused';
        const paused = pausedFlag && !(yst != null && Number(yst) > 0);
        const nudge = judgeNudge({ paused, bal, yst, useRate, daysLeft, hoursOn });
        adSet = {
          budget, budgetIsFallback: basic == null && budget != null,
          hasSettings: adFetched,   // false = 설정 미수집 → '미설정'이라 단정하면 안 된다
          floatRatio: ratio, peak: af['AD_피크예산'] ?? null,
          // 캠페인이 여러 개인 매장이 있다. '3개 중 1개 활성'을 구분하려면
          // 전체/활성 개수가 둘 다 필요하다(고이정: 매장 전체가 '정지'로 나갔었다).
          campaignTotal: af['AD_캠페인수'] ?? null,
          campaignOnline: af['AD_활성캠페인수'] ?? null,
          bid, hours, hoursOn, yesterday: yst, useRate, daysLeft,
          checked: af['AD_설정확인일'] || null,
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
          // 주말 상향이 꺼져 있으면 그 자체가 '추가 예산 없이' 쓸 수 있는 손잡이다.
          // 단 **설정을 수집한 매장만** 판단한다 — 미수집(빈 값)을 '꺼짐'으로 읽으면
          // 실제로는 켜 둔 매장에 "지금 꺼져 있습니다"라고 고객 화면에 적게 된다.
          weekendOff: adFetched && !(Number(cf['AD_주말상향률']) > 0),
          peerBid, peerHours, peer,
        };
      }
    } catch (e) {
      console.error('[client-schedule] projection 계산 실패:', e.message);
    }

    // ── 월간 리포트 ────────────────────────────────────────────
    // 링크가 7월이어도 8월 리포트가 나와 있으면 **최신본을 기본으로** 보여준다.
    // 계약월에 갇히면 새 리포트를 만들어도 옛 링크를 받은 고객사는 영영 못 본다.
    // 지난 회차도 고를 수 있게 목록을 함께 내려준다.
    const hasReport = (f) => {
      const p = String(f['DP_기간'] || '');
      return !!p && !!f['DP_리포트JSON'];
    };
    // 생성 시각 우선(같은 달을 다시 돌린 경우까지 잡힌다), 없으면 계약월로 정렬.
    const genAt = (f) => {
      try {
        const j = JSON.parse(f['DP_리포트JSON'] || '{}');
        if (j.generated_at) return String(j.generated_at);
      } catch { /* 파싱 실패는 계약월로 갈음한다 */ }
      return '';
    };
    // 정렬 기준은 **계약월이 아니라 실제 데이터 신선도**다.
    // 계약월이 늦다고 데이터가 최신인 게 아니다 — 실측 2026-08 우대 노형본점:
    //   8월 레코드 = 06.28~07.27 (07-28 생성)
    //   7월 레코드 = 07.03~08.01 (08-02 생성)  ← 이쪽이 최신
    // 계약월로 정렬하면 더 오래된 8월분을 '최신'이라 내보내게 된다.
    // 1순위 생성시각 → 2순위 수집기간 끝 → 3순위 계약월.
    const periodEnd = (f) => String(f['DP_기간'] || '').split('~').pop().trim();
    const reportRecs = storeRecs
      .filter((r) => hasReport(r.fields))
      .sort((a, b) => {
        const ga = genAt(a.fields), gb = genAt(b.fields);
        if (ga !== gb) return gb.localeCompare(ga);
        const pa = periodEnd(a.fields), pb = periodEnd(b.fields);
        if (pa !== pb) return pb.localeCompare(pa);
        return monthKey(b.fields['계약월']) - monthKey(a.fields['계약월']);
      });

    // 화면이 고를 수 있는 회차 목록. 조회 가능 기간 밖은 내보내지 않는다 —
    // 오래된 리포트는 값이 불완전해 화면이 깨진다(협력사 링크와 같은 규칙).
    const dpReportMonths = reportRecs
      .filter((r) => inMonthWindow(r.fields['계약월'], campaignName))
      .map((r, i) => ({
        id: r.id,
        month: r.fields['계약월'] || '',
        period: String(r.fields['DP_기간'] || '').replace(/~/, ' ~ '),
        generatedAt: fmtKST(genAt(r.fields)) || null,
        isCurrent: r.id === campaignId,
        isLatest: i === 0,          // reportRecs 는 신선도 순 정렬 — 첫 항목이 최신본
      }));

    // 기본은 최신본. 조회 가능 기간 안에 없으면 이 레코드 것으로 물러선다.
    // ?exact=1 이면 **요청한 레코드 그대로** 준다 — 리포트 화면에서 지난 회차를
    // 골랐을 때 다시 최신으로 튕기지 않게 하는 스위치다.
    // (달력 쪽은 exact 없이 불러 최신 요약·최신 링크를 받는다)
    const wantExact = String(req.query.exact || '') === '1' && hasReport(cf);
    const rpt = wantExact
      ? { id: campaignId, fields: cf }
      : (reportRecs.filter((r) => inMonthWindow(r.fields['계약월'], campaignName))[0]
         || (hasReport(cf) ? { id: campaignId, fields: cf } : null));

    let dpReport = null;
    if (rpt || cf['DP_기간']) {
      const rf = rpt ? rpt.fields : cf;
      const rid = rpt ? rpt.id : campaignId;
      let detail = null;
      try { detail = rf['DP_리포트JSON'] ? JSON.parse(rf['DP_리포트JSON']) : null; } catch { detail = null; }
      const storeCode = rf['DP_매장코드'] || cf['DP_매장코드'] || '';
      dpReport = {
        cpt,
        storeCode,
        // 리포트를 열 때 쓸 레코드. 최신본이 다른 달이면 그쪽을 가리킨다.
        campaignId: rid,
        month: rf['계약월'] || '',
        fromOtherMonth: (rf['계약월'] || '') !== month,
        months: dpReportMonths,
        // 리포트를 **언제 만들었는지**. 같은 매장에 회차가 여러 개라
        // 기간만 봐서는 방금 돌린 게 어느 것인지 알 수 없다(궁서체 2026-08-13).
        generatedAt: fmtKST(genAt(rf)) || null,
        // 이 회차가 최신본인가 — 지난 회차를 열었을 때 화면이 그렇게 밝힌다.
        isLatest: !dpReportMonths.length || dpReportMonths[0].id === rid,
        url: storeCode ? `/reports/dp_${storeCode}.html` : null,
        period: String(rf['DP_기간'] || '').replace(/~/, ' ~ '),
        exposure: rf['DP_노출'] != null ? Number(rf['DP_노출']).toLocaleString() : null,
        click: rf['DP_클릭'] ?? null,
        visit: rf['DP_방문'] ?? null,
        intent: rf['DP_관심'] ?? null,
        rank: rf['DP_순위'] != null ? `상권 ${rf['DP_순위']}위` : null,
        mom: rf['DP_전월비'] ? (String(rf['DP_전월비']).startsWith('-') ? rf['DP_전월비'] : `+${rf['DP_전월비']}`) : null,
        good: rf['DP_호평률'] != null ? `호평률 ${rf['DP_호평률']}%` : null,
        adShare: detail?.adflow?.running ? detail.adflow.imp_share : null,
        detail,
      };
    }

    // ── 월간 리포트 일관성 (Owner 룰 2026-08-10: 리포트는 작성 당시 데이터로) ──
    // adSet 의 소비자는 리포트 화면(DpReportPage)뿐이다. 잔액·소진 같은 유동값을
    // '지금' 기준으로 내리면 리포트 본문 스냅샷(잔액 4,350·어제 900)과 하단 광고 설정
    // 분석("잔액이 없어 광고가 나가지 않는다")이 **한 문서 안에서 서로를 반박**한다
    // (실측 2026-08-10 한라갈치 — CPC 재수집이 현재잔액을 0으로 갱신한 직후).
    // 리포트에 생성 시점 스냅샷(detail.cpc / detail.ad_set)이 있으면 유동값과 넛지
    // 판정을 그 시점으로 고정한다. 스냅샷이 없는 구 리포트는 현재값 그대로(한계).
    {
      const snapCpc = dpReport?.detail?.cpc || null;
      const snapAd = dpReport?.detail?.ad_set || null;   // 신 리포트만 있음 (2026-08-10+)
      if (adSet && snapCpc && snapCpc.balance != null) {
        const bal = Number(snapCpc.balance);
        const yst = snapCpc.yesterday != null ? Number(snapCpc.yesterday) : null;
        const budget = (snapAd?.budget ?? adSet.budget) ?? (snapCpc.daily_budget ?? null);
        const useRate = budget ? Math.round((Number(yst) / Number(budget)) * 100) : null;
        const daysLeft = snapCpc.days_left ?? null;
        // 스냅샷 시점에 집행이 있었으면 '정지' 주장은 기각 (현재값 경로와 같은 원칙)
        const paused = adSet.paused && !(yst != null && yst > 0);
        adSet = {
          ...adSet,
          paused,
          yesterday: yst,
          useRate,
          daysLeft,
          budget,
          // 설정값도 스냅샷이 있으면 그 시점으로 (없으면 현재 레코드 값 유지)
          bid: snapAd?.bid ?? adSet.bid,
          hours: snapAd?.hours ?? adSet.hours,
          hoursOn: snapAd?.hours_on ?? adSet.hoursOn,
          floatRatio: snapAd?.float ?? adSet.floatRatio,
          peak: snapAd?.peak ?? adSet.peak,
          nudge: judgeNudge({
            paused, bal, yst, useRate, daysLeft,
            hoursOn: snapAd?.hours_on ?? adSet.hoursOn,
          }),
          snapAt: snapCpc.updated || null,   // 화면 라벨용 — 어느 시점 실측인지
        };
      }
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
    // 같은 매장의 이전/다음 레코드 ID를 함께 주어 화면에서 전환하게 한다.
    //
    // 예전엔 **정확히 ±1개월**만 봤다. 그러면 중간에 낀 빈 껍데기 달이 길을 막는다 —
    // 계약도 실적도 없는데 레코드만 남아 있는 달이다(제주육림 서사라점 7월:
    // 계약은 5·6·8월뿐인데 7월 레코드가 남아 있다). 6월 링크에서 '다음 실적'을
    // 누르면 빈 화면이 한 번 끼어들고, 8월을 보려면 한 번 더 눌러야 했다.
    // → 건너뛸 달을 지정해 두고, 그 달을 지나 다음 달로 간다.
    //
    // 건너뛸 달은 _month-window.js FLOOR_EXCEPTIONS 에 손으로 적되, **그 달이 아직
    // 비어 있을 때만** 실제로 건너뛴다. 나중에 목표나 실적이 들어가면 저절로 다시
    // 보인다(Owner 지시 2026-08-05: 레코드는 Airtable 에 그대로 두고, 값이 들어오면
    // 그때 표출). 빈 상태 판정을 **지정된 달에만** 거는 게 핵심이다 — 전체에 걸면
    // 진행 중인 달의 76%가 빈 달로 잡힌다(실측은 _month-window.js 주석).
    //
    // 범위를 넓히는 변경이 아니다. 어디까지 열지는 여전히 조회 가능 기간이 정한다
    // (하한 = _month-window.js · 매장별 예외 포함, 상한 = 다음 달).
    let siblings = { prev: null, next: null };
    if (brandName) {
      try {
        // 위에서 이미 매장 전체를 읽어 뒀다 — 같은 질의를 두 번 하지 않는다.
        const all = storeRecs;
        const cur = monthKey(month);
        // 링크가 가리키는 달 자체는 건너뛰지 않는다 — 숨길 화면이 아니라 지금 열린 화면이다.
        const skipCandidates = skipKeysFor(campaignName);
        // '이 달에 보여 줄 게 있는가' — 네 축 중 하나라도 있으면 살린다.
        // 목표·실적만 보면 계약은 했는데 아직 목표를 안 넣은 달이 숨는다.
        // 그래서 예약 링크와 계약 정보(계약유형·총예산)까지 함께 본다.
        const num = (v) => Number(Array.isArray(v) ? v[0] : v) || 0;
        const sum = (f, names) => names.reduce((s, k) => s + num(f[k]), 0);
        const hasSubstance = (f) => {
          // 필드명 폴백 목록은 위 stats 계산과 같은 규칙을 쓴다(리네임 이력 때문).
          const target = sum(f, ['인플_목표', '인플_요청', '# 인플_목표', '# 인플_요청',
            '체험_목표', '체험단_요청', '# 체험_목표', '# 체험단_요청',
            '기자_목표', '기자단_요청', '# 기자_목표', '# 기자단_요청']);
          const done = sum(f, ['인플_방문', '# 인플_방문', '인플_실적', '# 인플_실적',
            '체험_방문', '# 체험_방문', '체험_실적', '# 체험_실적',
            '기자_실적', '# 기자_실적']);
          if (target > 0 || done > 0) return true;
          if ((f['진행_DB_OLD'] || []).length > 0) return true;   // 예약은 잡혔고 방문 전
          if (f['계약유형'] || num(f['총예산']) > 0) return true;  // 목표 입력 전 신규 계약월
          return false;
        };
        // 지정된 달이라도 값이 들어왔으면 건너뛰지 않는다.
        const skip = new Set(
          all.filter((r) => skipCandidates.has(monthKey(r.fields['계약월']))
                            && !hasSubstance(r.fields))
             .map((r) => monthKey(r.fields['계약월']))
        );
        // 조회 가능 기간 — 협력사 화면과 같은 규칙(_month-window.js).
        // 이 제한이 없으면 7월 링크에서 6월 → 5월 → 4월 로 계속 거슬러 올라가
        // 오래된 실적이 전부 열린다.
        // 예전엔 여기에 브랜드별 하한(양푼왕갈비 6월)을 하드코딩해 뒀었다. 지금은
        // 매장별 예외도 _month-window.js 의 FLOOR_EXCEPTIONS 한 곳에만 산다 —
        // 계약명을 넘겨 주면 그쪽이 이 매장에 맞는 하한을 골라 준다.
        // (제주육림 서사라점처럼 계약이 하한보다 앞에 걸친 곳을 위한 통로다)
        const list = all
          .map((r) => ({
            id: r.id,
            month: r.fields['계약월'] || '',
            k: monthKey(r.fields['계약월']),
          }))
          .filter((x) => !skip.has(x.k) && inMonthWindow(x.month, campaignName));
        // 같은 달 레코드가 둘인 경우(중복 계약월 — 워치리스트 항목)는 먼저 잡히는 것.
        const byKey = new Map();
        for (const x of list) if (!byKey.has(x.k)) byKey.set(x.k, x);

        // 종전대로 **바로 옆 달**만 본다. 건너뛰기로 지정된 달일 때만 한 칸 더 간다.
        // (가장 가까운 달을 찾는 방식으로 열면, 레코드가 띄엄띄엄한 매장에서
        //  6월 → 9월 처럼 몇 달을 건너뛰게 된다. 그건 요청한 적 없는 확장이다)
        const step = (dir) => {
          for (let k = cur + dir, guard = 0; guard < 12; k += dir, guard++) {
            if (!skip.has(k)) return byKey.get(k) || null;
          }
          return null;
        };
        const prev = step(-1);
        const next = step(1);
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
      // QR 체크인 — 시크릿 미설정이면 빈 값 → 프론트가 QR 버튼을 숨긴다 (fail-closed)
      storeCode: cf['업체명'] ? cf['업체명'][0] : '',
      storeSignature: storeSig(cf['업체명'] && cf['업체명'][0]),
      checkinCode: storeCodeDaily(cf['업체명'] && cf['업체명'][0]), // 오늘 코드 — 매일 자동 변경 (2차 수단)
    });

  } catch (err) {
    console.error('[client-schedule] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
