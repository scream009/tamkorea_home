/**
 * 예약봇(TK_Resv_V7)이 **실제로 발송한** 안내문을 웹에서 다시 조립한다.
 *
 * ⚠️ 봇은 발송문을 Airtable 에 남기지 않는다. 발송 직전에 Python 이 조립하고 끝이다
 *    (TK_Resv_V7.py `_compose_message`). 본문이 되는 `예약메시지`·`변경메시지` 는
 *    Formula 필드라 애초에 쓰기가 불가능하다.
 *    → 화면이 '보낸 그대로'를 보여주려면 같은 규칙으로 다시 조립하는 길밖에 없다.
 *
 *    recruiter-schedule.js 에 "송출기가 취소·노쇼 안내문을 예약메시지에 붙인다"고
 *    적혀 있었지만 사실이 아니다. 그 오해 때문에 취소된 예약을 열어도 **취소되기 전
 *    원본 예약문**만 떠 있었다(실측 2026-08-05 석화한우암소생구이 연동점 8/5 건).
 *
 * 규칙 원본 : 03_Epic_Automation_RPA/TK_Resv_V7_App/TK_Resv_V7.py — DEFAULT_CONFIG
 * 실사용 확인: 같은 폴더 airtable_config_v7.json — 2026-08-05 대조, 템플릿 4종 동일.
 * 봇 설정 탭에서 템플릿을 고치면 이 파일도 같이 고쳐야 화면과 카톡이 어긋나지 않는다.
 */

// 봇은 본문이 이 접두사로 시작하면 발송 자체를 막는다(Formula 가 남긴 경고문).
// 보내지 않은 문구를 '보낸 메시지'라고 화면에 띄우면 안 되므로 여기서도 버린다.
const WARN_PREFIX = '⚠';
const SEPARATOR = '━━━━━━━━━━━';

// 진행상태 셀렉트에 실제로 존재하는 취소·노쇼 값은 이 셋뿐이다
// (2026-08-05 스키마 실측: 취소_방문자 · 취소_고객사 · 노쇼).
const NOTICE_TEXT = {
  cancel_visitor:  '❌ 해당 예약은 방문자 측 사정으로 취소되었습니다.',
  cancel_customer: '❌ 해당 예약은 식당 측 사정으로 취소되었습니다.',
  noshow:          '⚠️ 해당 예약은 노쇼 처리되었습니다.',
};

// lookup·rollup 은 값을 배열로 준다. [null] 처럼 빈 칸이 담겨 오는 경우도 있어
// '내용이 있는 첫 값'을 고른다.
export const firstValue = (v) => {
  if (!Array.isArray(v)) return v ?? '';
  return v.find((x) => x != null && String(x).trim() !== '') ?? '';
};

/** 안내문을 붙일 상태인가. 아니면 '' */
export function noticeKind(status) {
  const s = String(firstValue(status) || '');
  if (s.includes('노쇼')) return 'noshow';
  if (!s.includes('취소')) return '';
  // 취소는 방문자/고객사 둘뿐이다 — '고객사'가 아니면 방문자 건이다.
  return s.includes('고객사') ? 'cancel_customer' : 'cancel_visitor';
}

/** 발송 본문으로 쓸 수 있는 값만 통과시킨다(봇의 `*_valid` 판정과 같은 규칙) */
export function pickMessage(v) {
  const s = String(firstValue(v) || '').trim();
  if (!s || s.startsWith(WARN_PREFIX)) return '';
  // 변경된 적 없는 예약의 변경메시지 Formula 가 남기는 placeholder
  if (s.includes('변경일시가 입력되지 않았습니다')) return '';
  return s;
}

/**
 * 취소·노쇼 예약이 카톡으로 나갈 때 붙은 안내문 꼬리(구분선 + 문구 + 고객전달메모).
 * 본문을 못 찾았을 때 화면이 자체 생성 본문 뒤에 이어 붙일 수 있도록 따로 낸다.
 */
export function buildNoticeTail(status, customerMemo) {
  const kind = noticeKind(status);
  if (!kind) return '';
  const memo = String(firstValue(customerMemo) || '').trim();
  const memoLine = memo ? `\n\n📝 ${memo}` : '';
  return `${SEPARATOR}\n\n${NOTICE_TEXT[kind]}${memoLine}`;
}

/**
 * 봇이 보낸 최종 메시지를 복원한다.
 *
 * @returns {{ sentMessage: string, noticeTail: string }}
 *   sentMessage — 본문까지 확보됐을 때만 채운다. 못 찾으면 '' 이고, 화면이
 *                 자체 본문 + noticeTail 로 대신한다(취소 사실은 어느 경로로도 안 빠진다).
 */
export function composeSentMessage({ status, reservationMsg, changeMessage, customerMemo }) {
  const noticeTail = buildNoticeTail(status, customerMemo);
  if (!noticeTail) return { sentMessage: '', noticeTail: '' };
  // 본문 선택 순서는 봇과 같다 — 변경메시지가 살아 있으면 그것, 없으면 예약메시지.
  // (변경 뒤 취소된 건은 고객사가 마지막으로 받은 본문이 '변경된 예약' 쪽이다)
  const body = pickMessage(changeMessage) || pickMessage(reservationMsg);
  return {
    sentMessage: body ? `${body}\n\n${noticeTail}` : '',
    noticeTail,
  };
}
