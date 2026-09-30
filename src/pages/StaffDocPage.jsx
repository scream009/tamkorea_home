import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { staffHeaders } from '../lib/staffKey';
import './StaffDocPage.css';

/**
 * 담당자용 내부 문서 뷰어 (/staff/doc/:key) — 검수표 등.
 *
 * 문서는 완성된 HTML 한 장이다(자체 CSS·스크립트 포함). 이 화면의 스타일과 섞이지 않게
 * sandbox iframe 에 넣는다. allow-same-origin 은 주지 않는다 — 문서 스크립트가
 * 이 사이트의 저장소(담당자 키)에 손대지 못하게.
 */

function wrap(body) {
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<base target="_blank"><style>body{margin:0}</style></head><body>'
    + body + '</body></html>';
}

export default function StaffDocPage() {
  const { key } = useParams();
  // 결과를 어느 문서 키의 것인지와 함께 둔다 — 키가 바뀌면 옛 결과는 자동으로 무시된다
  const [loaded, setLoaded] = useState({ key: null, doc: null, error: '' });

  useEffect(() => {
    let alive = true;
    fetch(`/api/staff-doc?key=${encodeURIComponent(key || '')}`, { headers: staffHeaders() })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then((d) => {
        if (!alive) return;
        document.title = `${d.title} | 탐코리아 담당자`;
        setLoaded({ key, doc: d, error: '' });
      })
      .catch((e) => { if (alive) setLoaded({ key, doc: null, error: e.message || '불러오기 실패' }); });
    return () => { alive = false; };
  }, [key]);

  const { doc, error } = loaded.key === key ? loaded : { doc: null, error: '' };
  if (error) return <div className="sdoc-msg sdoc-err">{error}</div>;
  if (!doc) return <div className="sdoc-msg">문서를 불러오는 중…</div>;

  return (
    <div className="sdoc">
      <iframe
        className="sdoc-frame"
        title={doc.title}
        srcDoc={wrap(doc.html)}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        allow="clipboard-write"
      />
    </div>
  );
}
