import React, { useState } from 'react';
import { KeyRound, Copy, Check, Eye } from 'lucide-react';

/**
 * 따종디엔핑 상인포털 로그인 정보 카드 (2026-08-21 Owner 요청).
 *
 * 고객사가 "우리 따종 계정이 뭐냐"고 물을 때 담당자가 Airtable 을 뒤지던 일을 없앤다.
 * 비번은 우리가 주기적으로 바꾸므로 **마지막 변경일**을 함께 보여 준다 —
 * 옛 비번을 알려주는 사고가 여기서 걸린다.
 *
 * 설계: 화면을 열기만 해서는 비번이 오지 않는다. '보기'를 눌러야 /api/store-login 을 부른다.
 *       (평소 화면 캡처·공유에 비번이 딸려 나가지 않게 하려는 것)
 */
export default function StoreLoginCard({ campaignId }) {
  const [state, setState] = useState('idle'); // idle | loading | open | none | error
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');

  const reveal = async () => {
    if (state === 'loading') return;
    setState('loading'); setErr('');
    try {
      const r = await fetch(`/api/store-login?campaignId=${encodeURIComponent(campaignId)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `불러오기 실패 (${r.status})`);
      if (!j.ok) { setState('none'); return; }
      setData(j); setState('open');
    } catch (e) {
      setErr(e.message); setState('error');
    }
  };

  const copy = (label, value) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 1600);
    }).catch(() => { /* 클립보드 차단 환경 — 사용자가 직접 선택해 복사 */ });
  };

  const fmtDate = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="slog">
      <div className="slog-h">
        <span className="slog-ic"><KeyRound className="w-4 h-4" /></span>
        <div className="slog-t">
          <b>따종디엔핑 상인포털 로그인</b>
          <span className="slog-d">매장에서 직접 로그인하실 때 사용하는 계정입니다</span>
        </div>
        {state !== 'open' && (
          <button type="button" className="slog-btn" onClick={reveal} disabled={state === 'loading'}>
            <Eye className="w-3.5 h-3.5" /> {state === 'loading' ? '불러오는 중…' : '로그인 정보 보기'}
          </button>
        )}
      </div>

      {state === 'open' && data && (
        <>
          <div className="slog-rows">
            <div className="slog-row">
              <span className="slog-k">아이디</span>
              <span className="slog-v">{data.id || '—'}</span>
              {data.id && (
                <button type="button" className="slog-cp" onClick={() => copy('id', data.id)}>
                  {copied === 'id' ? <><Check className="w-3.5 h-3.5" /> 복사됨</> : <><Copy className="w-3.5 h-3.5" /> 복사</>}
                </button>
              )}
            </div>
            <div className="slog-row">
              <span className="slog-k">비밀번호</span>
              <span className="slog-v slog-pw">{data.pw || '—'}</span>
              {data.pw && (
                <button type="button" className="slog-cp" onClick={() => copy('pw', data.pw)}>
                  {copied === 'pw' ? <><Check className="w-3.5 h-3.5" /> 복사됨</> : <><Copy className="w-3.5 h-3.5" /> 복사</>}
                </button>
              )}
            </div>
          </div>
          <div className="slog-f">
            {fmtDate(data.updated)
              ? <>마지막 변경 <b>{fmtDate(data.updated)}</b> · 보안을 위해 계정 정보는 주기적으로 변경됩니다</>
              : <>보안을 위해 계정 정보는 주기적으로 변경됩니다</>}
          </div>
        </>
      )}

      {state === 'none' && (
        <div className="slog-f slog-warn">등록된 상인포털 계정이 없습니다. 담당 매니저에게 문의해 주세요.</div>
      )}
      {state === 'error' && (
        <div className="slog-f slog-warn">{err} — 잠시 후 다시 시도해 주세요.</div>
      )}
    </div>
  );
}
