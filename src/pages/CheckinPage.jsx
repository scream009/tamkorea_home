import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * /checkin?s=<storeId>&t=<sig> — 매장 QR을 위챗 扫一扫로 스캔하면 열리는 페이지.
 *
 * 사진을 찍어 웹에서 디코드하던 이전 방식은 모니터 모아레를 못 이겨 폐기했다.
 * QR 은 URL 이므로 위챗 네이티브 스캐너가 그대로 이 페이지를 연다.
 * 신원은 /submit 방문 시 localStorage 에 심어둔 제출 토큰(tk_submit_token)으로 확인하고,
 * 토큰이 없으면 제출 링크를 먼저 열거나 링크를 붙여넣어 복구하게 한다.
 */

const TOKEN_KEY = 'tk_submit_token';

function readToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function saveToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* 사파리 프라이빗 등 */ }
}
/** 제출 링크 전체 또는 토큰 문자열에서 submit_ 토큰만 추출 */
function extractToken(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('submit_')) return s;
  try {
    const u = new URL(s);
    const t = u.searchParams.get('token') || '';
    if (t.startsWith('submit_')) return t;
  } catch { /* URL 아님 */ }
  const m = s.match(/submit_[A-Za-z0-9]+/);
  return m ? m[0] : '';
}

const box = {
  display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
  minHeight: '100vh', backgroundColor: '#f8f9fa', color: '#333',
  fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px', textAlign: 'center',
};
const card = {
  background: 'white', padding: '36px 22px', borderRadius: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: '420px', width: '100%',
};
const btn = {
  marginTop: '18px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white',
  border: 'none', padding: '0.7rem 1.6rem', borderRadius: '22px',
  fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer',
};

export default function CheckinPage() {
  const [params] = useSearchParams();
  const storeId = params.get('s') || '';
  const sig = params.get('t') || '';

  // phase: checking | done | already | nomatch | notoken | badqr | error
  // 초기 판정은 lazy init 으로 — 이펙트에서 동기 setState 금지(react-hooks/set-state-in-effect)
  const [phase, setPhase] = useState(() => {
    if (!storeId || !sig) return 'badqr';
    return readToken() ? 'checking' : 'notoken';
  });
  const [result, setResult] = useState({});
  const [errMsg, setErrMsg] = useState('');
  const [pasted, setPasted] = useState('');
  const postedRef = useRef(false); // StrictMode 이중 실행 가드 — 체크인 POST는 한 번만

  // 주의: 이 함수는 phase 를 'checking' 으로 바꾸지 않는다 — 이펙트에서 호출되므로
  // 동기 setState 금지. 호출자(핸들러)가 필요 시 setPhase('checking') 을 먼저 부른다.
  const doCheckin = useCallback(async (token) => {
    try {
      const r = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inflToken: token, storeId, sig }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.already) { setResult(data); setPhase('already'); return; }
      if (r.ok && data.ok) { setResult(data); setPhase('done'); return; }
      if (data.noMatch) { setPhase('nomatch'); return; }
      setErrMsg(data.error || `오류 (${r.status})`);
      setPhase('error');
    } catch {
      setErrMsg('网络错误 / 네트워크 오류');
      setPhase('error');
    }
  }, [storeId, sig]);

  useEffect(() => {
    if (phase !== 'checking') return undefined;
    // setTimeout 으로 미뤄 이펙트 동기 setState 규칙을 지키고,
    // postedRef 는 타이머 안에서 세워 StrictMode(마운트→언마운트→재마운트)에서도 정확히 1회 발사한다
    const timer = setTimeout(() => {
      if (postedRef.current) return;
      postedRef.current = true;
      doCheckin(readToken());
    }, 0);
    return () => clearTimeout(timer);
  }, [phase, doCheckin]);

  const handlePaste = () => {
    const t = extractToken(pasted);
    if (!t) {
      setErrMsg('无法识别链接。请粘贴负责人发送的完整提交链接。/ 링크를 인식하지 못했습니다.');
      return;
    }
    saveToken(t);
    setErrMsg('');
    postedRef.current = true;
    setPhase('checking');
    doCheckin(t);
  };

  const brand = <p style={{ marginTop: '28px', fontSize: '0.85rem', color: '#aaa' }}>T A M K O R E A</p>;

  if (phase === 'checking') {
    return (
      <div style={box}><div style={card}>
        <div style={{ fontSize: '46px', marginBottom: '16px' }}>⏳</div>
        <h2 style={{ fontSize: '1.15rem' }}>正在签到...</h2>
        <p style={{ color: '#666', marginTop: '6px' }}>체크인 처리 중입니다</p>
        {brand}
      </div></div>
    );
  }

  if (phase === 'done' || phase === 'already') {
    return (
      <div style={box}><div style={card}>
        <div style={{ fontSize: '52px', marginBottom: '16px' }}>✅</div>
        <h2 style={{ fontSize: '1.25rem', color: '#16a34a' }}>
          {phase === 'already' ? '已签到' : '签到成功！'}
        </h2>
        <p style={{ color: '#333', marginTop: '10px', fontSize: '1.05rem', fontWeight: 'bold' }}>
          {result.store || ''}
        </p>
        <p style={{ color: '#666', marginTop: '6px' }}>
          {phase === 'already'
            ? `이미 체크인되어 있습니다 (${result.when || ''})`
            : `입장 확인 ${result.when || ''}`}
        </p>
        <p style={{ color: '#888', marginTop: '14px', fontSize: '0.9rem' }}>
          可以关闭此页面，祝拍摄顺利！📸
        </p>
        {brand}
      </div></div>
    );
  }

  if (phase === 'nomatch') {
    return (
      <div style={box}><div style={card}>
        <div style={{ fontSize: '46px', marginBottom: '16px' }}>🔍</div>
        <h2 style={{ fontSize: '1.1rem' }}>未找到今天在此店的预约</h2>
        <p style={{ color: '#666', marginTop: '8px' }}>오늘 이 매장의 예약을 찾지 못했습니다.</p>
        <p style={{ color: '#888', marginTop: '10px', fontSize: '0.9rem' }}>
          请联系您的负责人确认预约信息。<br />담당자에게 예약 정보를 확인해 주세요.
        </p>
        {brand}
      </div></div>
    );
  }

  if (phase === 'badqr') {
    return (
      <div style={box}><div style={card}>
        <div style={{ fontSize: '46px', marginBottom: '16px' }}>⚠️</div>
        <h2 style={{ fontSize: '1.1rem' }}>二维码无效</h2>
        <p style={{ color: '#666', marginTop: '8px' }}>유효하지 않은 QR 코드입니다. 매장 QR을 다시 스캔해 주세요.</p>
        {brand}
      </div></div>
    );
  }

  if (phase === 'notoken') {
    return (
      <div style={box}><div style={card}>
        <div style={{ fontSize: '46px', marginBottom: '16px' }}>🔗</div>
        <h2 style={{ fontSize: '1.1rem', lineHeight: 1.5 }}>请先打开您的"提交链接"</h2>
        <p style={{ color: '#666', marginTop: '8px', fontSize: '0.92rem', lineHeight: 1.6 }}>
          在微信中打开负责人发给您的提交链接（打开一次即可），然后回来重新扫码。
          <br />
          담당자가 보낸 <b>제출 링크</b>를 한 번 연 뒤, 이 QR을 다시 스캔해 주세요.
        </p>
        <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
          <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '8px' }}>
            或将提交链接粘贴到下方 / 또는 제출 링크를 붙여넣기
          </p>
          <input
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="https://tamkorea.com/submit?token=..."
            style={{
              width: '100%', padding: '10px', border: '1px solid #d1d5db',
              borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box',
            }}
          />
          <button style={btn} onClick={handlePaste}>确认签到 / 체크인</button>
          {errMsg && <p style={{ color: '#dc2626', marginTop: '10px', fontSize: '0.85rem' }}>{errMsg}</p>}
        </div>
        {brand}
      </div></div>
    );
  }

  // error
  return (
    <div style={box}><div style={card}>
      <div style={{ fontSize: '46px', marginBottom: '16px' }}>❌</div>
      <h2 style={{ fontSize: '1.1rem' }}>签到失败</h2>
      <p style={{ color: '#666', marginTop: '8px', fontSize: '0.92rem' }}>{errMsg}</p>
      <button style={btn} onClick={() => { postedRef.current = true; setPhase('checking'); doCheckin(readToken()); }}>
        重试 / 다시 시도
      </button>
      {brand}
    </div></div>
  );
}
