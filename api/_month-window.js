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
 * 그래서 하한을 **절대값으로 고정**한다: 2026년 6월.
 * 그 이전(5월 이하)은 값이 불완전해 화면이 깨질 수 있어 계속 막는다.
 * 상한만 상대로 둔다 — 다음 달까지(진행 예정 건을 미리 봐야 한다).
 *
 * 하한을 올릴 일이 생기면 FLOOR_LABEL 한 줄만 고친다.
 */

// 하한 — 이 달부터의 실적만 공유 링크로 열린다.
export const FLOOR_LABEL = '2026. 6월';

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

// 이 계약월을 공유 링크로 열어도 되는가.
export const inMonthWindow = (label) => {
  const k = monthKey(label);
  return k >= FLOOR_KEY && k <= nowMonthKey() + MONTHS_FWD;
};

// 막혔을 때 화면에 보여 줄 이유. 규칙이 바뀌면 문구도 같이 따라간다.
export const OUT_OF_RANGE_MESSAGE =
  `조회 가능 기간이 아닙니다 (${FLOOR_LABEL} 이후 실적만 조회할 수 있습니다).`;
