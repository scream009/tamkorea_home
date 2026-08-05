/**
 * 달력 예약 블록에 띄울 메시지 고르기 — 고객사·협력사·섭외담당 화면 공용.
 *
 * 취소·노쇼 예약은 고객사가 마지막으로 받은 카톡이 '원본 예약문 + 취소 안내'다.
 * 그런데 화면은 원본만 다시 만들어 보여 줘서, 취소된 예약을 열면 예약이 살아 있는
 * 것처럼 읽혔다(실측 2026-08-05 석화한우암소생구이 연동점 8/5 건).
 *
 * 서버(api/_resv-message.js)가 예약봇과 같은 규칙으로 복원한 발송문(sentMessage)이
 * 있으면 그것을 그대로 쓴다. 본문을 못 찾았을 때만 화면이 만든 본문 뒤에 안내문
 * 꼬리(noticeTail)를 붙인다 — 어느 경로로 가든 '취소됐다'는 사실이 빠지지 않게.
 */
export const resolveEventMessage = (event, fallbackBody) => {
  if (event.sentMessage) return event.sentMessage;
  const body = event.changeMessage || fallbackBody;
  return event.noticeTail ? `${body}\n\n${event.noticeTail}` : body;
};

// 같은 상자에 담기는 내용이 상태에 따라 달라지므로 이름표도 따라간다.
export const eventMessageLabel = (status) => {
  const s = String(status || '');
  if (s.includes('노쇼')) return '노쇼 안내 (발송분)';
  if (s.includes('취소')) return '취소 안내 (발송분)';
  return '예약 메시지 / 메모';
};
