import React from 'react';

/**
 * 메시지 본문 속 URL 을 클릭 가능한 링크로 (2026-08-20).
 *
 * 예약메시지에 인플 채널 링크가 들어가면서(채널카드), 상세 모달의 pre-wrap
 * 텍스트에 긴 URL 이 죽은 글자로 찍혔다 — 누르면 열리게 바꾼다.
 *
 * ⚠️ URL 조각을 [^\s]+ 로 잡으면 안 된다 — Airtable 이 lookup 여러 값을 구분자 없이
 *    이어 붙이면 'https://…62E敏敏特穆尔👑(127,000)' 처럼 뒤 텍스트까지 통째로 링크가 되고,
 *    그 링크는 열리지 않는다(실측 2026-08-21 아시시 애월본점).
 *    → URL 로 인정하는 문자를 **ASCII URL 문자로 한정**한다. 한글·중문·이모지·쉼표·공백이
 *      나오는 순간 링크가 끝나므로, 원문이 붙어 있어도 링크 자체는 정상 동작한다.
 */
// 문자 클래스에 넣을 ASCII URL 문자 (대시는 맨 뒤 — 이스케이프 불필요)
const URL_CHARS = "A-Za-z0-9._~:/?#@!$&'()*+;=%-";
const URL_RE = new RegExp('(https?://[' + URL_CHARS + ']+)', 'g');
const TRAIL = /[),.;:·。、\]】]+$/;

export default function LinkifiedText({ text }) {
  const parts = String(text || '').split(URL_RE);
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
