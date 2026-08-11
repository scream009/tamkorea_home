/* eslint-env node */
/**
 * 공유 링크(협력사·고객사)가 열어 주는 계약월 범위 — 한 곳에서만 정한다.
 *
 * 예전 규칙은 '전월·당월·다음달' **상대** 창이었다. 문제는 링크가 특정 달에
 * 못 박혀 배포된다는 점이다. 달이 바뀌면 그 링크가 창 밖으로 밀려나 통째로 죽는다.
 *   실측 2026-08-02 — 투어패스 6월 링크(?t=...): 6월 레코드 11건이 전부
 *   "조회 가능 기간이 아닙니다" 로 막혔다. 8월 기준 하한이 7월이라서다.
 *   같은 이유로 양푼왕갈비 6월 링크도 client-schedule.js 에 브랜드별 예외를
 *   하드코딩해 땜질하고 있었다 — 링크를 하나 더 배포할 때마다 반복될 문제다.
 *
 * 그래서 하한을 **절대값으로 고정**한다. 상한만 상대로 둔다 —
 * 다음 달까지(진행 예정 건을 미리 봐야 한다).
 *
 * 하한을 옮길 일이 생기면 FLOOR_LABEL 한 줄만 고친다.
 *
 * ⚠️ **전역 하한을 내려서 개별 매장 문제를 풀지 않는다.** 하한의 목적은
 *    '달을 타고 끝없이 과거로 올라가는 것'을 막는 것이다(Owner 지시 2026-08-05).
 *    한 매장 때문에 전부 내리면 모든 고객사·협력사 링크가 같이 열린다.
 *    그런 건은 아래 FLOOR_EXCEPTIONS 에 그 매장만 적는다.
 */

// 하한 — 이 달부터의 실적만 공유 링크로 열린다.
export const FLOOR_LABEL = '2026. 6월';

/**
 * 매장별 임시 예외 — 계약이 하한보다 앞에 걸쳐 있는 곳만 한 칸씩 연다.
 *
 * 예전에 client-schedule.js 안에 브랜드별 하한을 흩어 놓고 땜질하다 실패한 적이
 * 있다(링크를 배포할 때마다 한 줄씩 늘어났다). 그래서 예외를 **여기 한 곳에만**
 * 모으고, 언제·왜 열었는지를 줄마다 남긴다. 계약이 끝나 필요 없어지면 줄을 지운다.
 *
 * match = Campaign_DB '계약명' 에 들어가는 문자열(공백 무시 부분일치).
 *         지점까지 적는다 — '제주육림' 만 적으면 다른 지점까지 같이 열린다.
 * floor = 이 매장에만 적용할 하한.
 * skip  = 월 이동에서 건너뛸 계약월. 계약이 없는데 레코드만 남아 있는 달이다.
 *
 * ⚠️ 예외는 **고객사 링크(/schedule)에만** 먹는다. 협력사 링크(/partner)는
 *    한 화면에 여러 고객사를 묶어 열기 때문에 '어느 매장 기준인지'가 성립하지 않는다.
 *    → 협력사는 FLOOR_LABEL 그대로.
 *
 * ⚠️ skip 을 **자동 판정으로 바꾸려 하지 말 것.** 한 번 시도했다가 접었다 —
 *    '목표·실적·예약링크·계약정보가 전부 0이면 빈 달' 규칙을 전수로 돌려 보니
 *    (실측 2026-08-05) 6월 88건 중 23건 · 7월 98건 중 56건 · **8월 120건 중 91건**
 *    이 빈 달로 잡혔다. 진행 중인 달이 76% 지워지는 셈이다.
 *    목표는 구글시트에서 이관하는 중이고 실적 rollup 은 방문 뒤에야 차기 때문에,
 *    Campaign_DB 만으로는 '계약이 없는 달'과 '아직 안 채워진 달'을 구분할 수 없다.
 *    → 사람이 아는 사실만 여기 손으로 적는다.
 */
export const FLOOR_EXCEPTIONS = [
  {
    // 계약이 5·6·8월에만 있다(Owner 확인). 7월 레코드는 계약도 실적도 없는 껍데기라
    // 6월 링크에서 '다음 실적'을 누르면 빈 화면이 한 번 끼어들었다.
    // 6월 계약분도 실적 0건이라 고객이 가진 6월 링크는 그대로면 빈 화면만 연다.
    // 실제 실적 6건은 5월에 있는데 링크를 따로 발급하기 애매한 상황이라(Owner)
    // 이 매장만 5월까지 거슬러 열고, 7월은 건너뛴다.
    match: '제주육림서사라점',
    floor: '2026. 5월',
    skip: ['2026. 7월'],
    since: '2026-08-05',
    why: '5·6·8월 계약 — 6월 링크에서 5월을 보고, 빈 7월은 건너뛴다',
  },
];

// 상한 — 오늘 기준 몇 달 앞까지 열 것인가.
const MONTHS_FWD = 1;

// "2026. 7월" → 정렬·비교 가능한 정수(년*12 + 월). 파싱 실패는 0.
export const monthKey = (label) => {
  const m = String(label || '').match(/(\d{4})\D+(\d{1,2})/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : 0;
};

export const FLOOR_KEY = monthKey(FLOOR_LABEL);

// 서버는 UTC 로 돈다. 계약월은 한국 달력 기준이라 KST 로 환산해서 '이번 달'을 정한다.
// (안 그러면 매월 1일 0~9시에 상한이 한 달 뒤처진다)
export const nowMonthKey = () => {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return k.getUTCFullYear() * 12 + (k.getUTCMonth() + 1);
};

const nospace = (v) => String(v || '').replace(/\s/g, '');

// scope(계약명)에 걸리는 예외 한 건. 없으면 null.
const exceptionFor = (scope) => {
  const s = nospace(scope);
  if (!s) return null;
  return FLOOR_EXCEPTIONS.find((ex) => s.includes(nospace(ex.match))) || null;
};

/**
 * 이 매장에 적용할 하한. scope 를 안 주면 전역 하한이다.
 * @param {string} scope Campaign_DB '계약명'(또는 고객사명+지점명) — 예외 판정용
 */
export const floorKeyFor = (scope) => {
  const ex = exceptionFor(scope);
  return ex ? monthKey(ex.floor) : FLOOR_KEY;
};

/**
 * 이 매장의 월 이동에서 건너뛸 계약월 — monthKey 집합.
 * 링크가 가리키는 달 자체는 건너뛰지 않는다(부르는 쪽 책임).
 */
export const skipKeysFor = (scope) => {
  const ex = exceptionFor(scope);
  return new Set((ex?.skip || []).map(monthKey).filter(Boolean));
};

/**
 * 이 계약월을 공유 링크로 열어도 되는가.
 * ⚠️ `.filter(inMonthWindow)` 로 넘기지 말 것 — Array.filter 가 두 번째 인자로
 *    **인덱스**를 주는데 그게 scope 자리에 들어간다. 반드시 `.filter((m) => inMonthWindow(m))`.
 */
export const inMonthWindow = (label, scope) => {
  const k = monthKey(label);
  return k >= floorKeyFor(scope) && k <= nowMonthKey() + MONTHS_FWD;
};

// 막혔을 때 화면에 보여 줄 이유. 규칙이 바뀌면 문구도 같이 따라간다.
// 예외 매장은 이 경로로 오지 않는다(협력사 전용 문구라 전역 하한만 쓴다).
export const OUT_OF_RANGE_MESSAGE =
  `조회 가능 기간이 아닙니다 (${FLOOR_LABEL} 이후 실적만 조회할 수 있습니다).`;
