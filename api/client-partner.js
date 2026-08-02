// 협력사 묶음에 이 고객사를 넣을지 정하는 체크박스 필드명.
// '공유표출' → '협력사포함' 으로 리네임하는 중이라 둘 다 받는다.
// 배포와 Airtable 리네임은 동시에 일어날 수 없어서, 한쪽만 바뀐 순간에도
// 협력사 링크가 죽지 않아야 한다. 리네임이 끝나고 한동안 지나면 위 하나만 남긴다.
// 지금 Airtable 에 실제로 있는 이름을 앞에 둔다 — 평소엔 첫 번째로 성공해서
// 헛된 왕복이 없고, 리네임된 순간에만 두 번째로 넘어간다.
import { escFormula } from './_admin-auth.js';
import {
  monthKey, nowMonthKey, inMonthWindow, OUT_OF_RANGE_MESSAGE,
} from './_month-window.js';

const SHOW_FIELDS = ['공유표출', '협력사포함'];
let showField = null;   // 함수 인스턴스가 살아 있는 동안 재사용

// filterByFormula 에 없는 필드를 쓰면 Airtable 은 UNKNOWN_FIELD_NAME 이 아니라
// INVALID_FILTER_BY_FORMULA + "Unknown field names: <이름>" 을 준다.
// UNKNOWN_FIELD_NAME 만 보고 있다가 협력사 링크를 전부 죽인 적이 있다.
// 방금 시도한 이름이 메시지에 들어 있을 때만 넘어간다 — 다른 이유로 깨진
// 수식까지 삼키면 진짜 문제를 못 보고 지나친다.
const fieldMissing = (errText, field) =>
  errText.includes('UNKNOWN_FIELD_NAME')
  || (errText.includes('INVALID_FILTER_BY_FORMULA') && errText.includes(field));

export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const TOKEN = process.env.TAMLINK_API_KEY || process.env.AIRTABLE_API_KEY
                || process.env.VITE_AT_TOKEN;
    const BASE_ID0 = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
    const CAMP_TB0 = encodeURIComponent('Campaign_DB');

    // 허용 범위 규칙 자체는 _month-window.js 한 곳에 있다.
    const nowKey = nowMonthKey();

    // ── 토큰 방식 (?t=...) ────────────────────────────────────
    // 토큰이 가리키는 것은 **협력사까지다. 계약월은 가리키지 않는다.**
    // Campaign_DB '협력사토큰' 에 있으므로 별도 매핑 테이블이 필요 없다.
    const shareToken = (req.query.t || '').trim();
    let partnerName = req.query.name;

    if (shareToken) {
      if (!/^[A-Za-z0-9]{6,32}$/.test(shareToken)) {
        return res.status(400).json({ error: '잘못된 링크입니다.' });
      }
      // maxRecords=1 로 아무거나 하나 잡으면 안 된다.
      // 같은 토큰이 여러 달에 걸린 협력사가 실제로 있었고(좋아좋아 1~8월 21행),
      // 그 경우 어느 레코드가 잡히는지는 Airtable 내부 순서라 보장되지 않는다.
      // 1월 레코드가 잡히면 조회 가능 기간을 벗어나 링크가 통째로 죽는다.
      // 전부 받아서 **결정적으로** 고른다.
      // 위 정규식(^[A-Za-z0-9]{6,32}$)이 이미 막지만, 이스케이프도 제대로 된 걸 쓴다.
      const tf = encodeURIComponent(`{협력사토큰}='${escFormula(shareToken)}'`);
      const tu = `https://api.airtable.com/v0/${BASE_ID0}/${CAMP_TB0}`
        + `?filterByFormula=${tf}&fields%5B%5D=${encodeURIComponent('협력사')}`
        + `&fields%5B%5D=${encodeURIComponent('계약월')}&pageSize=100`;
      const tr = await fetch(tu, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (!tr.ok) throw new Error(`Airtable error: ${await tr.text()}`);
      const td = await tr.json();
      const hits = td.records || [];
      if (!hits.length) {
        return res.status(404).json({ error: '유효하지 않은 링크입니다.' });
      }
      const one = (v) => (Array.isArray(v) ? v[0] : v) || '';

      // 한 토큰이 서로 다른 협력사에 걸려 있으면 누구 것인지 단정할 수 없다.
      // 잘못 고르면 남의 고객사 목록이 통째로 열린다 — 열지 않고 막는다.
      const partners = [...new Set(hits.map((r) => one(r.fields['협력사'])).filter(Boolean))];
      if (partners.length > 1) {
        return res.status(409).json({
          error: '링크가 여러 협력사에 걸려 있어 열 수 없습니다. 담당자에게 문의해 주세요.',
        });
      }

      // 여기서 확정하는 것은 **협력사뿐**이다. 어느 달을 열지는 아래에서 정한다.
      //
      // 예전엔 토큰이 박힌 행의 계약월로 기본 월을 못 박았다. 그런데 토큰은
      // 계약월마다 새로 발급돼 있다(실측 2026-08-02: 투어패스 6월 M2syA7fFgrxF ·
      // 7월 pCAhHW7DKB3M · 8월 DFJ7qlItnhq2 — 전부 다른 토큰. 제주에코·웹플로우·
      // 광고시홍보동도 같다. 좋아좋아만 단일 토큰이 1~8월을 덮는다).
      // 그래서 한 번 공유한 링크가 그 달에 갇혔고, 달이 바뀔 때마다 새 링크를
      // 다시 뿌려야 했다. 못 뿌린 협력사는 지난달 화면을 계속 보게 된다.
      //
      // 토큰을 '협력사 신분증'으로만 쓰면 이 문제가 통째로 사라진다 —
      // 이미 뿌린 옛 링크까지 전부 되살아나고, 달은 알아서 따라온다.
      partnerName = partners[0];
    }

    if (!partnerName) {
      return res.status(400).json({ error: '협력사 링크가 아닙니다.' });
    }
    // 표시는 '에코'로 통일 (제주에코/서울에코 구분은 조회 조건에서만)
    const displayName = String(partnerName).includes('에코') ? '에코' : partnerName;
    const BASE_ID = process.env.TAMLINK_BASE_ID || 'appdsAV2ewZWCkyIa';
    const CAMP_TB = encodeURIComponent('Campaign_DB');

    // ⚠️ 예전 코드는 `replace(/'/g, "\'")` 였는데 이건 **no-op** 이다 —
    // JS 에서 "\'" 는 그냥 "'" 이라 작은따옴표를 자기 자신으로 바꿨다.
    // ?name= 경로는 partnerName 을 비었는지만 검사하므로 수식이 열려 있었다.
    // 백슬래시를 먼저 늘리지 않으면 `\` 로 끝나는 값이 다음 따옴표를 삼킨다.
    const esc = escFormula;

    // 필터: 협력사 컬럼이 일치하는 레코드 검색
    // 토큰 링크는 레코드에서 읽은 협력사 원본값을 그대로 쓴다.
    // name= 방식일 때만 '에코' → 제주에코 로 해석한다(표시는 '에코' 통일).
    let base;
    if (!shareToken && partnerName === '에코') {
      base = "{협력사}='제주에코'";
    } else {
      base = `{협력사}='${esc(partnerName)}'`;
    }

    // ── 이 협력사가 가진 계약월 ────────────────────────────────
    // 화면의 월 버튼이자, 기본 월을 고르는 근거다. 그래서 **월 필터를 걸기 전에**
    // 조회한다 — 월 필터를 건 결과에는 그 달만 남아 근거가 사라진다.
    let months = [];
    try {
      const mUrl = `https://api.airtable.com/v0/${BASE_ID}/${CAMP_TB}`
        + `?filterByFormula=${encodeURIComponent(base)}`
        + `&fields[]=${encodeURIComponent('계약월')}&pageSize=100`;
      let off = null, all = [];
      do {
        const r = await fetch(off ? `${mUrl}&offset=${off}` : mUrl,
                              { headers: { Authorization: `Bearer ${TOKEN}` } });
        if (!r.ok) break;
        const d = await r.json();
        all = all.concat(d.records || []);
        off = d.offset || null;
      } while (off);
      months = [...new Set(all.map(x => x.fields['계약월']).filter(Boolean))]
        .filter(inMonthWindow)
        .sort((a, b) => monthKey(a) - monthKey(b));
    } catch (e) {
      console.error('[client-partner] months lookup failed:', e.message);
    }

    // 계약월 필터 — ?month=2026. 7월 처럼 넘기면 그 달 실적만.
    // 협력사마다 계약월이 섞여 있어 월 구분 없이 보면 지난달 건까지 함께 나온다.
    // ?month=2607 (YYMM) 또는 "2026. 7월" 둘 다 허용
    const ymToLabel = (v) => {
      const d = String(v || '').replace(/\D/g, '');
      if (d.length === 4) return `20${d.slice(0, 2)}. ${Number(d.slice(2))}월`;
      if (d.length === 6) return `${d.slice(0, 4)}. ${Number(d.slice(4))}월`;
      return '';
    };
    const rawMonth = (req.query.month || '').trim();

    // ── 기본 월 = 직전 완료월 ──────────────────────────────────
    // 당월은 아직 진행 중이라 실적이 덜 찬 화면이 열린다. 협력사에게 보여 줄
    // '메인'은 마감된 달이다. 그 달이 없으면 가장 가까운 달로 물러선다.
    // 이 규칙이 링크를 영속시킨다 — 8월이 되면 7월을, 9월이 되면 8월을 연다.
    // 월 버튼을 누르면(?month=) 그 값이 이기므로 지난달도 그대로 볼 수 있다.
    const targetKey = nowKey - 1;
    const defaultMonth = months.length
      ? [...months].sort((a, b) =>
          Math.abs(monthKey(a) - targetKey) - Math.abs(monthKey(b) - targetKey)
          || monthKey(b) - monthKey(a))[0]
      : '';
    let monthQ = rawMonth ? (ymToLabel(rawMonth) || rawMonth) : defaultMonth;

    // ── 조회 가능 기간 제한 ────────────────────────────────────
    // 협력사 링크는 ?name=..&month=.. 조합이라 누구나 URL 을 고칠 수 있다.
    // month=2401 같이 직접 넣으면 옛 실적이 다 열리므로 **서버가** 범위를 정한다.
    // 하한은 절대값(2026. 6월)으로 고정 — 상대 창이면 달이 바뀔 때마다
    // 이미 배포한 링크가 창 밖으로 밀려나 죽는다. 규칙은 _month-window.js 참고.
    if (monthQ && !inMonthWindow(monthQ)) {
      return res.status(200).json({
        partnerName: displayName, month: monthQ, months, campaigns: [],
        outOfRange: true,
        message: OUT_OF_RANGE_MESSAGE,
      });
    }
    // 체크된 캠페인만 노출한다.
    // 예전엔 '실적이 있으면 표시'로 추측했는데, 그러면 월초에 실적이 0이라
    // 전부 숨겨지고(협력사가 열면 빈 화면), 진행 예정 매장과 안 하는 매장이
    // 구분되지 않았다. 이제 담당자가 매월 명시적으로 체크한다.
    //
    // 필드를 지정하지 않는다. 특정 필드만 요청하면 Airtable 스키마가 리네임될 때
    // UNKNOWN_FIELD_NAME 으로 500 이 난다 — 실제로 '인플_실적' 이 사라져 이 API 가
    // 계속 500 이었다(프론트가 Airtable 을 직접 불러서 드러나지 않았을 뿐).
    // client-schedule.js 도 같은 이유로 전체 필드를 받는다.
    const askAirtable = async (field) => {
      const parts = [base, `{${field}}`];
      if (monthQ) parts.push(`{계약월}='${esc(monthQ)}'`);
      const formula = encodeURIComponent(`AND(${parts.join(', ')})`);
      const url = `https://api.airtable.com/v0/${BASE_ID}/${CAMP_TB}`
        + `?filterByFormula=${formula}&pageSize=100`;
      return fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    };

    // 아는 이름이 있으면 그것부터, 없으면 순서대로 시도한다.
    const order = showField
      ? [showField, ...SHOW_FIELDS.filter((f) => f !== showField)]
      : SHOW_FIELDS;
    let response = null, errText = '';
    for (const field of order) {
      const r = await askAirtable(field);
      if (r.ok) { showField = field; response = r; break; }
      errText = await r.text();
      if (!fieldMissing(errText, field)) break;
    }
    if (!response) {
      throw new Error(`Airtable error: ${errText}`);
    }

    const data = await response.json();

    const campaigns = data.records.map(rec => {
      const cf = rec.fields;
      return {
        id: rec.id,
        campaignName: cf['계약명'] || '',
        brandName: Array.isArray(cf['고객사명']) ? cf['고객사명'][0] : (cf['고객사명'] || ''),
        branchName: Array.isArray(cf['지점명']) ? cf['지점명'][0] : (cf['지점명'] || ''),
        month: cf['계약월'] || '',
        stats: {
          infl_target: cf['인플_목표'] || cf['인플_요청'] || cf['# 인플_목표'] || cf['# 인플_요청'] || 0,
          infl_done: cf['인플_방문'] || cf['# 인플_방문'] || cf['인플_실적'] || cf['# 인플_실적'] || 0,
          exp_target: cf['체험_목표'] || cf['체험단_요청'] || cf['# 체험_목표'] || cf['# 체험단_요청'] || 0,
          exp_done: cf['체험_방문'] || cf['# 체험_방문'] || cf['체험_실적'] || cf['# 체험_실적'] || 0,
          press_target: cf['기자_목표'] || cf['기자단_요청'] || cf['# 기자_목표'] || cf['# 기자단_요청'] || 0,
          press_done: cf['기자_실적'] || cf['# 기자_실적'] || 0,
        }
      };
    });

    // months 는 기본 월을 고르기 위해 위에서 이미 조회했다(월 필터 이전 시점).
    return res.status(200).json({
      partnerName: displayName, month: monthQ || null, months, campaigns,
      tokenMode: !!shareToken,
    });
    
  } catch (error) {
    console.error('Partner API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
