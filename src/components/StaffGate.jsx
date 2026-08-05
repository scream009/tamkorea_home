import React, { useState, useEffect, useCallback } from 'react';
import { getStaffKey, setStaffKey, clearStaffKey } from '../lib/staffKey';

/**
 * 담당자 화면 게이트 — AdminGate 의 담당자판.
 *
 * 서버(_staff-auth.js)가 이미 막고 있으므로 이건 보안 장치가 아니라 **입력 UI** 다.
 * 검증은 서버가 한다.
 *
 * AdminGate 와 다른 점 하나 — **?k= URL 파라미터를 받는다.**
 * Softr 임베드(iframe)에서는 키를 타이핑할 수 없으므로 iframe URL 에 키를 실어 보내고,
 * 여기서 검증 후 sessionStorage 로 옮긴 뒤 주소창에서 지운다(replaceState).
 */
export default function StaffGate({ children }) {
  const [status, setStatus] = useState('checking');   // checking | locked | open
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 검색엔진에 내부 경로가 잡히지 않게 한다 (AdminGate 와 동일).
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow,noarchive,nosnippet';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const verify = useCallback(async (key) => {
    if (!key) return false;
    const resp = await fetch('/api/staff-check', { headers: { 'x-staff-key': key } });
    return resp.ok;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 1) URL ?k= (Softr 임베드 경로) — **검증 전에 먼저 저장**하고 주소창에서 지운다.
      //    검증 후 저장하면 StrictMode 이중 실행(1회차가 URL을 지운 뒤 2회차가 빈손) 때 잠긴다.
      const params = new URLSearchParams(window.location.search);
      const urlKey = (params.get('k') || '').trim();
      if (urlKey) {
        setStaffKey(urlKey);
        params.delete('k');
        const qs = params.toString();
        window.history.replaceState(null, '',
          window.location.pathname + (qs ? `?${qs}` : ''));
      }

      // 2) 저장된 키가 있으면 조용히 통과 (틀린 키면 아래에서 지워진다)
      const saved = getStaffKey();
      if (!saved) { if (alive) setStatus('locked'); return; }
      try {
        const ok = await verify(saved);
        if (!alive) return;
        if (ok) { setStatus('open'); }
        else { clearStaffKey(); setStatus('locked'); setError('저장된 키가 더 이상 유효하지 않습니다.'); }
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
    if (!keyInput.trim()) return setError('담당자 키를 입력하세요.');
    setBusy(true);
    try {
      const ok = await verify(keyInput.trim());
      if (ok) { setStaffKey(keyInput.trim()); setStatus('open'); }
      else setError('키가 올바르지 않습니다.');
    } catch {
      setError('서버에 연결하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'open') return children;

  return (
    <div className="staff-gate" style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}><span style={styles.dot} /> T A M K O R E A · STAFF</div>
        <h1 style={styles.title}>담당자 인증</h1>
        <p style={styles.sub}>섭외·진행 데이터에 접근합니다. 담당자 키를 입력하세요.</p>

        {status === 'checking' ? (
          <div style={styles.checking}>확인 중…</div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label} htmlFor="staff-key">Staff Key</label>
            <input
              id="staff-key"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="담당자 키 (관리자 키도 사용 가능)"
              autoComplete="off"
              autoFocus
              style={styles.input}
            />
            {error && <div style={styles.error}>{error}</div>}
            <button type="submit" disabled={busy} style={{ ...styles.button, opacity: busy ? 0.6 : 1 }}>
              {busy ? '확인 중…' : '들어가기'}
            </button>
            <div style={styles.hint}>탭을 닫으면 키는 지워집니다.</div>
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
  hint: { fontSize: 11.5, color: '#6b7280', textAlign: 'center', marginTop: 4 },
  checking: { fontSize: 13, color: '#9ca3af', padding: '12px 0' },
};
