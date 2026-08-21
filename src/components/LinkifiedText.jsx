import React from 'react';

/**
 * 메시지 본문 속 URL 을 클릭 가능한 링크로 (2026-08-20).
 *
 * 예약메시지에 인플 채널 링크가 들어가면서(채널카드), 상세 모달의 pre-wrap
 * 텍스트에 긴 URL 이 죽은 글자로 찍혔다 — 누르면 열리게 바꾼다.
 *
 * ⚠️ URL 조각을 [^\s]+ 로 잡으면 안 된다 — Airtable 이 여러 값을 ',' 로 이어 붙이면
 *    'https://…62E,다음인플(122,000)' 처럼 뒤 텍스트까지 통째로 링크가 된다(실측 2026-08-21).
 *    공백·쉼표에서 끊고, 끝에 붙은 문장부호는 링크에서 뺀다.
 */
const TRAIL = /[),.;:·。、\]】]+$/;

export default function LinkifiedText({ text }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s,]+)/g);
  return parts.map((p, i) => {
    if (!/^https?:\/\//.test(p)) return p;
    const tail = (p.match(TRAIL) || [''])[0];
    const url = tail ? p.slice(0, -tail.length) : p;
    return (
      <React.Fragment key={i}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#A78BFA', textDecoration: 'underline', wordBreak: 'break-all' }}
        >
          {url}
        </a>
        {tail}
      </React.Fragment>
    );
  });
}
