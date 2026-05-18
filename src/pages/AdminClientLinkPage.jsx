import React, { useState, useEffect } from 'react';
import './ClientListPage.css';

// 어드민 키를 sessionStorage에 보관 (탭 닫으면 사라짐)
const KEY_STORAGE = 'tamkorea_admin_key';

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow,noarchive,nosnippet';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function AdminClientLinkPage() {
  useNoIndex();

  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) || '');
  const [month, setMonth]       = useState(currentMonth());
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);   // { url, token, month }
  const [error, setError]       = useState('');
  const [copied, setCopied]     = useState(false);

  async function handleGenerate(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setCopied(false);
    if (!adminKey)               return setError('Admin Key를 입력하세요.');
    if (!/^\d{4}-\d{2}$/.test(month)) return setError('월 형식이 잘못되었습니다 (YYYY-MM)');

    setLoading(true);
    try {
      const resp = await fetch(
        `/api/clients-link?month=${encodeURIComponent(month)}`,
        { headers: { 'x-admin-key': adminKey } }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      sessionStorage.setItem(KEY_STORAGE, adminKey);
      setResult(data);
    } catch (err) {
      setError(err.message || '요청 실패');
    } finally {
      setLoading(false);
    }
  }

  function copyUrl() {
    if (!result?.url) return;
    navigator.clipboard.writeText(result.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="cl-page">
      {/* 헤더 */}
      <div className="cl-header">
        <div className="cl-header-inner">
          <div className="cl-logo"><span className="cl-logo-dot" /> T A M K O R E A · ADMIN</div>
          <h1>체험단 매장 리스트 링크 생성</h1>
          <div className="cl-header-sub">
            <span style={{ fontSize: '13px' }}>월별 공유 URL을 안전한 토큰과 함께 생성합니다.</span>
          </div>
        </div>
      </div>

      {/* 폼 */}
      <div className="cl-container" style={{ maxWidth: 560 }}>
        <form
          onSubmit={handleGenerate}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>Admin Key</label>
            <input
              type="password"
              value={adminKey}
              onChange={e => setAdminKey(e.target.value)}
              placeholder="환경변수 CLIENTS_ADMIN_KEY 값"
              autoComplete="off"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>월 (YYYY-MM)</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '생성 중...' : '링크 생성'}
          </button>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              padding: 12,
              fontSize: 13,
              color: '#fca5a5',
            }}>
              ⚠️ {error}
            </div>
          )}
        </form>

        {/* 결과 */}
        {result && (
          <div style={{
            marginTop: 20,
            background: 'rgba(16,185,129,0.06)',
            border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 16,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}>
            <div style={{ fontSize: 12, color: '#6ee7b7', fontWeight: 700, letterSpacing: '0.05em' }}>
              ✅ {result.month} 공유 URL
            </div>
            <div style={{
              background: '#0a0a0f',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 12,
              fontFamily: 'ui-monospace,SF Mono,Menlo,monospace',
              fontSize: 13,
              color: '#f0f0f5',
              wordBreak: 'break-all',
            }}>
              {result.url}
            </div>
            <button
              onClick={copyUrl}
              style={{
                background: copied ? '#10b981' : 'rgba(124,58,237,0.15)',
                border: '1px solid ' + (copied ? '#10b981' : 'rgba(124,58,237,0.4)'),
                color: copied ? '#fff' : '#a78bfa',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {copied ? '✓ 복사됨' : '📋 URL 복사'}
            </button>
            <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>
              ▸ 이 URL을 위챗/카톡으로 공유하세요.<br />
              ▸ 토큰은 매월 자동 변경됩니다.<br />
              ▸ 사고 발생 시 Vercel에서 <code>CLIENTS_TOKEN_SECRET</code> 값을 변경하면 모든 기존 링크가 즉시 무효화됩니다.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  color: '#f0f0f5',
  outline: 'none',
  fontFamily: 'inherit',
};
