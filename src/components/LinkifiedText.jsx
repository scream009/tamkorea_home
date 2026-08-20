import React from 'react';

/**
 * 메시지 본문 속 URL 을 클릭 가능한 링크로 (2026-08-20).
 *
 * 예약메시지에 인플 채널 링크가 들어가면서(채널카드), 상세 모달의 pre-wrap
 * 텍스트에 긴 URL 이 죽은 글자로 찍혔다 — 누르면 열리게 바꾼다.
 * 텍스트는 그대로 두고 http(s) 조각만 <a> 로 감싼다.
 */
export default function LinkifiedText({ text }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) => (/^https?:\/\//.test(p) ? (
    <a
      key={i}
      href={p}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#A78BFA', textDecoration: 'underline', wordBreak: 'break-all' }}
    >
      {p}
    </a>
  ) : p));
}
