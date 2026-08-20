import React, { useState, useEffect, useCallback } from 'react';
import { getAdminKey, setAdminKey, clearAdminKey } from '../lib/adminKey';

/**
 * 관리자 화면 게이트.
 *
 * 정산·계약 데이터를 다루는 /admin, /admin/board 를 감싼다.
 * 서버(_admin-auth.js)가 이미 막고 있으므로 이건 보안 장치가 아니라 **입력 UI** 다 —
 * 키 없이 들어온 사람에게 빈 화면 대신 입력창을 준다. 검증은 서버가 한다.
 *
 * 키는 sessionStorage 에 있으므로 탭 안에서는 한 번만 넣으면 된다.
 */
export default function AdminGate({ children }) {
  const [status, setStatus] = useState('checking');   // checking | locked | open
  const [keyInput, setKeyInput] = useState('');
  const [remember, setRemember] = useState(false);   // '이 기기에 키 저장' (Owner 요청 2026-08-20)
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 검색엔진에 관리자 경로가 잡히지 않게 한다(AdminClientLinkPage 와 동일).
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow,noarchive,nosnippet';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const verify = useCallback(async (key) => {
    if (!key) return false;
    const resp = await fetch('/api/admin-check', { headers: { 'x-admin-key': key } });
    return resp.ok;
  }, []);

  // 이미 키가 있으면 조용히 통과시킨다.
  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = getAdminKey();
      if (!saved) { if (alive) setStatus('locked'); return; }
      try {
        const ok = await verify(saved);
        if (!alive) return;
        if (ok) { setStatus('open'); }
        else { clearAdminKey(); setStatus('locked'); setError('저장된 키가 더 이상 유효하지 않습니다.'); }
      } catch {
        // 네트워크 실패를 인증 실패로 취급하면 키를 지워버린다. 그대로 두고 다시 묻는다.
        if (alive) { setStatus('locked'); setError('서버에 연결하지 못했습니다.'); }
      }
    })();
    return () => { alive = false; };
  }, [verify]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!keyInput.trim()) return setError('Admin Key를 입력하세요.');
    setBusy(true);
    try {
      const ok = await verify(keyInput.trim());
      if (ok) { setAdminKey(keyInput.trim(), remember); setStatus('open'); }
      else setError('키가 올바르지 않습니다.');
    } catch {
      setError('서버에 연결하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'open') return children;

  return (
    <div className="admin-gate" style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}><span style={styles.dot} /> T A M K O R E A · ADMIN</div>
        <h1 style={styles.title}>관리자 인증</h1>
        <p style={styles.sub}>정산·계약 데이터에 접근합니다. Admin Key를 입력하세요.</p>

        {status === 'checking' ? (
          <div style={styles.checking}>확인 중…</div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label} htmlFor="admin-key">Admin Key</label>
            <input
              id="admin-key"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="환경변수 CLIENTS_ADMIN_KEY 값"
              autoComplete="off"
              autoFocus
              style={styles.input}
            />
            {error && <div style={styles.error}>{error}</div>}
            <label style={styles.remember}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={styles.rememberBox}
              />
              이 기기에 키 저장 (홈화면 바로가기·위챗용)
            </label>
            <button type="submit" disabled={busy} style={{ ...styles.button, opacity: busy ? 0.6 : 1 }}>
              {busy ? '확인 중…' : '들어가기'}
            </button>
            <div style={styles.hint}>
              {remember
                ? '로그아웃을 누르기 전까지 이 기기에 키가 남습니다 — 공용 기기에서는 켜지 마세요.'
                : '탭을 닫으면 키는 지워집니다.'}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(1200px 600px at 50% -10%, rgba(168,85,247,0.18), transparent 60%), #0b0b0f',
    padding: 24,
  },
  card: {
    width: '100%', maxWidth: 420, padding: 32, borderRadius: 20,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(12px)', boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
  },
  logo: { fontSize: 11, letterSpacing: '0.18em', color: '#a78bfa', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 12px #a78bfa', display: 'inline-block' },
  title: { margin: '16px 0 6px', fontSize: 24, color: '#fff', fontWeight: 700, letterSpacing: '-0.01em' },
  sub: { margin: '0 0 24px', fontSize: 13, color: '#9ca3af', lineHeight: 1.6 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 12, color: '#9ca3af', fontWeight: 600 },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 14,
    background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
    outline: 'none', boxSizing: 'border-box',
  },
  button: {
    marginTop: 6, padding: '12px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg, #8b5cf6, #a855f7)', color: '#fff', fontWeight: 700, fontSize: 14,
    transition: 'all 0.2s',
  },
  error: { fontSize: 12.5, color: '#fca5a5', lineHeight: 1.5 },
  remember: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#9ca3af', cursor: 'pointer', userSelect: 'none' },
  rememberBox: { width: 15, height: 15, accentColor: '#8b5cf6', cursor: 'pointer', margin: 0 },
  hint: { fontSize: 11.5, color: '#6b7280', textAlign: 'center', marginTop: 4 },
  checking: { fontSize: 13, color: '#9ca3af', padding: '12px 0' },
};
