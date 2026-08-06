import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import jsQR from 'jsqr';
import './InfluencerSubmitPage.css';

// ─── 날짜 포맷 헬퍼 ──────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dayName = days[d.getDay()];
    
    // 시간 추출
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    
    // 자정(00:00)인 경우 시간 생략 (선택사항, 에어테이블 특성 반영)
    if (hours === '00' && minutes === '00') {
      return `${month}月${day}日 (${dayName})`;
    }
    
    return `${month}月${day}日 (${dayName}) ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
}

// ─── Toast 컴포넌트 ───────────────────────────────────────────
function Toast({ message, type, show }) {
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  return (
    <div className={`inf-toast ${type} ${show ? 'show' : ''}`}>
      <span>{icon}</span>
      <span>{message}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function InfluencerSubmitPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || searchParams.get('id'); // token 우선, id는 하위호환

  const [records, setRecords] = useState([]);
  const [links, setLinks] = useState({});          // { recordId: { xhs, dp, dy } }
  const [invalidLinks, setInvalidLinks] = useState({}); // { recordId: { xhs: true, dp: false, dy: false } } URL 오류
  const [saving, setSaving] = useState({});         // { recordId: true/false }
  const [status, setStatus] = useState('idle');     // 'idle' | 'loading' | 'error' | 'empty'
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [inflName, setInflName] = useState('');     // 인플루언서 닉네임
  const [resolvedInflId, setResolvedInflId] = useState(''); // 서버에서 해석한 실제 INFL_ID
  const [guideModal, setGuideModal] = useState({ isOpen: false, text: '', client: '' }); // 롱텍스트 가이드 모달
  // ─── 입장 체크인 (v1.7 — 3단계) ─────────────────────────────
  // 1차: 페이지 안 라이브 카메라 스캔 (실시간 프레임 — 사진 한 장 디코드와 달리 모아레에 강함)
  // 2차: 매장 게시 일별 6자리 코드 입력 (카메라 권한이 안 열리는 폰)
  // 3차: 위챗 扫一扫 안내 (마지막 수단)
  const [checkinModal, setCheckinModal] = useState(false);
  const [camState, setCamState] = useState('idle'); // idle|starting|scanning|denied|done|nomatch
  const [ckResult, setCkResult] = useState(null);   // 성공/already 응답 (확인증 데이터)
  const [ckOther, setCkOther] = useState(null);     // noMatch 시 오늘 실제 예약 지점
  const [ckErr, setCkErr] = useState('');
  const [checkinCode, setCheckinCode] = useState('');
  const [checkinBusy, setCheckinBusy] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const scanBusyRef = useRef(false);
  const scanHitRef = useRef(false);

  // ─── 체크인 신원 심기 ─────────────────────────────────────────
  // 매장 QR(위챗 扫一扫)이 /checkin 을 열 때 이 토큰으로 본인 확인을 한다.
  // 제출 링크를 한 번이라도 연 폰이면 QR 스캔만으로 체크인이 끝난다.
  useEffect(() => {
    if (token && token.startsWith('submit_')) {
      try { localStorage.setItem('tk_submit_token', token); } catch { /* 프라이빗 모드 등 */ }
    }
  }, [token]);

  // ─── 데이터 로드 ────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('链接不正确。请联系负责人。'); // 링크가 올바르지 않습니다
      return;
    }

    setStatus('loading');
    fetch(`/api/influencer-schedule?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        if (!data.records || data.records.length === 0) {
          setStatus('empty');
          return;
        }
        setRecords(data.records);
        if (data.inflName) setInflName(data.inflName);
        if (data.inflId) setResolvedInflId(data.inflId);
        // 기존 제출 링크를 초기값으로 세팅
        const initLinks = {};
        data.records.forEach(rec => {
          initLinks[rec.id] = {
            xhs: rec.resultLink || '',
            dp: rec.dpResultLink || '',
            dy: rec.dyResultLink || ''
          };
        });
        setLinks(initLinks);
        setStatus('idle');
      })
      .catch(err => {
        console.error(err);
        setStatus('error');
        // Vercel/에어테이블에서 온 상세 에러 메시지가 있으면 화면에 그대로 출력
        setErrorMsg(err.message || '加载数据失败，请稍后再试。'); 
      });
  }, [token]);

  // ─── Toast 표시 ─────────────────────────────────────────────
  const showToast = useCallback((message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  }, []);

  // ─── URL 유효성 검사 헬퍼 ─────────────────────────────────
  const isValidUrl = useCallback((str) => {
    if (!str) return false;
    try { new URL(str); return true; }
    catch { return false; }
  }, []);

  // ─── 개별 저장 ──────────────────────────────────────────────
  const handleSaveOne = useCallback(async (recordId) => {
    const linkObj = links[recordId] || {};
    const xhsLink = linkObj.xhs?.trim() || '';
    const dpLink = linkObj.dp?.trim() || '';
    const dyLink = linkObj.dy?.trim() || '';

    if (!xhsLink && !dpLink && !dyLink) {
      showToast('请输入至少一个链接。', 'error'); // 최소 하나의 링크를 입력해 주세요
      return;
    }

    // URL 형식 검사
    let hasInvalid = false;
    const newInvalidState = { ...(invalidLinks[recordId] || {}) };
    
    if (xhsLink && !isValidUrl(xhsLink)) { hasInvalid = true; newInvalidState.xhs = true; } else { newInvalidState.xhs = false; }
    if (dpLink && !isValidUrl(dpLink)) { hasInvalid = true; newInvalidState.dp = true; } else { newInvalidState.dp = false; }
    if (dyLink && !isValidUrl(dyLink)) { hasInvalid = true; newInvalidState.dy = true; } else { newInvalidState.dy = false; }

    setInvalidLinks(prev => ({ ...prev, [recordId]: newInvalidState }));

    if (hasInvalid) {
      showToast('链接格式不正确。(例: https://xhslink.com/...)', 'error'); // 올바른 URL 형식이 아닙니다
      return;
    }

    setSaving(s => ({ ...s, [recordId]: true }));
    try {
      const res = await fetch('/api/influencer-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, resultLink: xhsLink, dpResultLink: dpLink, dyResultLink: dyLink }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed');

      // 로컬 상태 업데이트
      setRecords(prev =>
        prev.map(rec =>
          rec.id === recordId ? { ...rec, resultLink: xhsLink, dpResultLink: dpLink, dyResultLink: dyLink, status: '제출완료' } : rec
        )
      );
      showToast('保存成功！', 'success'); // 저장되었습니다
    } catch (err) {
      console.error(err);
      showToast('保存失败，请重试。', 'error'); // 저장에 실패했습니다
    } finally {
      setSaving(s => ({ ...s, [recordId]: false }));
    }
  }, [links, invalidLinks, isValidUrl, showToast]);

  // ─── Enter 키로 즉시 저장 ────────────────────────────────────
  const handleKeyDown = useCallback((e, recordId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveOne(recordId);
    }
  }, [handleSaveOne]);



  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) { clearInterval(scanTimerRef.current); scanTimerRef.current = null; }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch { /* 이미 종료 */ }
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // 언마운트 시 카메라 정리 (setState 없음 — 이펙트 규칙 안전)
  useEffect(() => () => stopCamera(), [stopCamera]);

  const submitCheckin = useCallback(async (payload) => {
    setCheckinBusy(true);
    setCkErr('');
    // 위챗 웹뷰에서 요청이 무한 대기하면 "아무 반응 없음"이 된다 — 15초 컷
    const ctrl = ('AbortController' in window) ? new AbortController() : null;
    const timeo = ctrl ? setTimeout(() => ctrl.abort(), 15000) : null;
    try {
      const r = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined,
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        stopCamera();
        setCkResult(data);
        setCamState('done');
        return true;
      }
      if (data.noMatch) {
        stopCamera();
        setCkOther({ list: data.otherToday || [], scanStore: data.scanStore || '' });
        setCamState('nomatch');
        return false;
      }
      setCkErr(data.error || `오류 ${r.status}`);
      return false;
    } catch {
      setCkErr('网络错误，请重试 / 네트워크 오류 — 다시 시도해 주세요');
      return false;
    } finally {
      if (timeo) clearTimeout(timeo);
      setCheckinBusy(false);
    }
  }, [stopCamera]);

  // 라이브 프레임 스캔 루프 — BarcodeDetector(안드로이드 위챗) 우선, jsQR(iOS) 폴백
  const startScanLoop = useCallback(() => {
    let detector = null;
    if ('BarcodeDetector' in window) {
      try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; }
    }
    const canvas = document.createElement('canvas');

    const handleHit = (raw) => {
      if (scanHitRef.current) return;
      let s = ''; let t = '';
      try {
        const u = new URL(String(raw));
        s = u.searchParams.get('s') || '';
        t = u.searchParams.get('t') || '';
      } catch { /* URL 아님 */ }
      if (!s || !t) {
        setCkErr('不是有效的签到二维码 / 체크인 QR이 아닙니다');
        return; // 계속 스캔
      }
      scanHitRef.current = true;
      if (scanTimerRef.current) { clearInterval(scanTimerRef.current); scanTimerRef.current = null; }
      submitCheckin({ inflToken: token, storeId: s, sig: t }).then((ok) => {
        if (!ok) { scanHitRef.current = false; startScanLoop(); } // 실패 시 재개 (nomatch/done 은 카메라 이미 정지)
      });
    };

    scanTimerRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (scanBusyRef.current || scanHitRef.current || !video || video.readyState < 2) return;
      scanBusyRef.current = true;
      try {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes && codes.length) handleHit(codes[0].rawValue);
        } else {
          const w = video.videoWidth; const h = video.videoHeight;
          if (w && h) {
            const scale = Math.min(1, 640 / Math.max(w, h));
            canvas.width = Math.floor(w * scale);
            canvas.height = Math.floor(h * scale);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (hit && hit.data) handleHit(hit.data);
          }
        }
      } catch { /* 프레임 스킵 */ } finally { scanBusyRef.current = false; }
    }, 350);
  }, [submitCheckin, token]);

  const openCheckin = useCallback(async () => {
    setCheckinModal(true);
    setCamState('starting');
    setCkResult(null);
    setCkOther(null);
    setCkErr('');
    setCheckinCode('');
    scanHitRef.current = false;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, audio: false,
      });
      streamRef.current = stream;
      // 모달 렌더 완료 대기 (getUserMedia 승인 사이에 보통 렌더되지만 안전망)
      for (let i = 0; i < 10 && !videoRef.current; i += 1) {
        await new Promise(r => setTimeout(r, 50));
      }
      if (!videoRef.current) throw new Error('novideo');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCamState('scanning');
      startScanLoop();
    } catch {
      stopCamera();
      setCamState('denied'); // → 2차(코드 입력)가 자동으로 펼쳐진다
    }
  }, [startScanLoop, stopCamera]);

  const closeCheckin = useCallback(() => {
    stopCamera();
    setCheckinModal(false);
    setCamState('idle');
  }, [stopCamera]);

  const handleCodeCheckin = useCallback(async () => {
    const codeVal = checkinCode.replace(/\D/g, '');
    if (codeVal.length !== 6) {
      showToast('请输入6位数字 / 6자리 숫자를 입력해 주세요.', 'error');
      return;
    }
    const ok = await submitCheckin({ inflToken: token, code: codeVal });
    if (ok) setCheckinCode('');
  }, [checkinCode, submitCheckin, token, showToast]);

  // ─── 진행률 계산 ─────────────────────────────────────────────
  const doneCount = records.filter(r => r.status === '제출완료').length;
  const totalCount = records.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // ─── 렌더링 ──────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="inf-submit-page">
        <div className="inf-header">
          <div className="inf-header-inner">
            <div className="inf-logo"><span className="inf-logo-dot" /> T A M K O R E A</div>
            <h1>拍摄结果提交</h1>
          </div>
        </div>
        <div className="inf-container">
          <div className="inf-state-card">
            <div className="inf-spinner" />
            <p>正在加载日程...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="inf-submit-page">
        <div className="inf-header">
          <div className="inf-header-inner">
            <div className="inf-logo"><span className="inf-logo-dot" /> T A M K O R E A</div>
            <h1>拍摄结果提交</h1>
          </div>
        </div>
        <div className="inf-container">
          <div className="inf-state-card error">
            <div className="inf-state-icon">⚠️</div>
            <h2>发生错误</h2>
            <p>{errorMsg}</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="inf-submit-page">
        <div className="inf-header">
          <div className="inf-header-inner">
            <div className="inf-logo"><span className="inf-logo-dot" /> T A M K O R E A</div>
            <h1>拍摄结果提交</h1>
          </div>
        </div>
        <div className="inf-container">
          <div className="inf-state-card">
            <div className="inf-state-icon">📭</div>
            <h2>暂无分配的日程</h2>
            <p>请联系负责人。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inf-submit-page">
      {/* Header */}
      <div className="inf-header">
        <div className="inf-header-inner">
          <div className="inf-logo"><span className="inf-logo-dot" /> T A M K O R E A</div>
          <h1>本月拍摄结果提交</h1>
          <div className="inf-header-sub">
            <span className="inf-badge">📸 {inflName || resolvedInflId || token}</span>
            <span>共 {totalCount} 个客户 · 已提交 {doneCount} 个</span>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
            <button onClick={openCheckin} style={{
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              color: 'white', border: 'none', padding: '0.6rem 1.2rem',
              borderRadius: '20px', fontSize: '1rem', fontWeight: 'bold',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: '0 4px 10px rgba(79, 70, 229, 0.3)'
            }}>
              📍 入场签到 (입장 체크인)
            </button>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="inf-progress-wrap">
        <div className="inf-progress-label">
          <span>提交进度</span>
          <span>{doneCount} / {totalCount} ({progressPct}%)</span>
        </div>
        <div className="inf-progress-bar">
          <div className="inf-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Main */}
      <div className="inf-container">
        {/* 안내 문구 */}
        <p className="inf-hint">请依次输入已完成客户的链接并点击 <strong>保存 (Save)</strong> 或按 <strong>Enter</strong> 键。</p>

        {/* 테이블 */}
        <div className="inf-table-wrap">
          <table className="inf-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>客户名</th>
                <th style={{ width: '10%' }}>拍摄指南</th>
                <th style={{ width: '17%' }}>拍摄日期 & 截止日期</th>
                <th>提交视频链接</th>
                <th style={{ width: '16%' }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {records.map(rec => {
                const isDone = rec.status === '제출완료';
                const isSaving = saving[rec.id];

                return (
                  <tr key={rec.id}>
                    {/* 고객사 */}
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                        <div className="inf-client-name">{rec.client}</div>
                        <span className={`inf-status mobile-only ${isDone ? 'done' : 'pending'}`}>
                          {isDone ? '✅ 已完成' : '⏳ 待提交'}
                        </span>
                      </div>
                    </td>

                    {/* 촬영가이드 (롱텍스트 팝업) */}
                    <td>
                      {rec.guide ? (
                        <button
                          className="inf-btn-guide"
                          onClick={() => setGuideModal({ isOpen: true, text: rec.guide, client: rec.client })}
                        >
                          📖 查看
                        </button>
                      ) : (
                        <span className="inf-btn-guide no-guide">📖 无</span>
                      )}
                    </td>

                    {/* 날짜 및 마감일 */}
                    <td className="inf-date-cell">
                      <div className="inf-shoot-date">
                        <span className="inf-date-icon" aria-hidden="true">📅</span>
                        <span>{formatDate(rec.date)}</span>
                      </div>
                      {rec.deadline && (
                        <div className="inf-deadline">
                          <span className="inf-date-icon" aria-hidden="true">⏰</span>
                          <span>截止: {rec.deadline}</span>
                        </div>
                      )}
                    </td>

                    {/* 링크 입력 */}
                    <td className="inf-link-cell">
                      <div className="inf-link-cell-content">
                        <div className="inf-input-wrap">
                          <input
                            type="url"
                            className={`inf-link-input ${isDone ? 'submitted' : ''} ${invalidLinks[rec.id]?.xhs ? 'invalid' : ''}`}
                            placeholder="小红书 (XHS) 链接"
                            value={links[rec.id]?.xhs || ''}
                            onChange={e => {
                              setLinks(prev => ({ ...prev, [rec.id]: { ...prev[rec.id], xhs: e.target.value } }));
                              if (invalidLinks[rec.id]?.xhs) setInvalidLinks(prev => ({ ...prev, [rec.id]: { ...prev[rec.id], xhs: false } }));
                            }}
                            onKeyDown={e => handleKeyDown(e, rec.id)}
                          />
                          <input
                            type="url"
                            className={`inf-link-input ${isDone ? 'submitted' : ''} ${invalidLinks[rec.id]?.dp ? 'invalid' : ''}`}
                            placeholder="大众点评 (DP) 链接"
                            value={links[rec.id]?.dp || ''}
                            onChange={e => {
                              setLinks(prev => ({ ...prev, [rec.id]: { ...prev[rec.id], dp: e.target.value } }));
                              if (invalidLinks[rec.id]?.dp) setInvalidLinks(prev => ({ ...prev, [rec.id]: { ...prev[rec.id], dp: false } }));
                            }}
                            onKeyDown={e => handleKeyDown(e, rec.id)}
                          />
                          <input
                            type="url"
                            className={`inf-link-input ${isDone ? 'submitted' : ''} ${invalidLinks[rec.id]?.dy ? 'invalid' : ''}`}
                            placeholder="抖音及其他 (DY及其他) 链接"
                            value={links[rec.id]?.dy || ''}
                            onChange={e => {
                              setLinks(prev => ({ ...prev, [rec.id]: { ...prev[rec.id], dy: e.target.value } }));
                              if (invalidLinks[rec.id]?.dy) setInvalidLinks(prev => ({ ...prev, [rec.id]: { ...prev[rec.id], dy: false } }));
                            }}
                            onKeyDown={e => handleKeyDown(e, rec.id)}
                          />
                        </div>
                        <button
                          className={`inf-btn-save ${isDone ? 'resubmit' : ''}`}
                          onClick={() => handleSaveOne(rec.id)}
                          disabled={isSaving || !(links[rec.id]?.xhs?.trim() || links[rec.id]?.dp?.trim() || links[rec.id]?.dy?.trim())}
                          title={isDone ? '修改链接后重新保存' : '保存'}
                        >
                          {isSaving ? '⏳' : isDone ? '修改' : '保存'}
                        </button>
                      </div>
                    </td>

                    {/* 상태 */}
                    <td>
                      <span className={`inf-status ${isDone ? 'done' : 'pending'}`}>
                        {isDone ? '✅ 已完成' : '⏳ 待提交'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast */}
      <Toast message={toast.message} type={toast.type} show={toast.show} />

      {/* 입장 체크인 모달 — 1차 라이브 스캔 → 2차 코드 입력 → 3차 위챗 스캔 안내 */}
      {checkinModal && (
        <div className="inf-modal-backdrop" onClick={closeCheckin}>
          <div className="inf-modal-content" onClick={e => e.stopPropagation()}>
            <div className="inf-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-color)' }}>📍 入场签到 / 입장 체크인</h3>
              <button onClick={closeCheckin} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {/* 성공 = 이 모달이 곧 매장 제시용 확인증 */}
            {camState === 'done' && ckResult && (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: '46px' }}>✅</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#16a34a', marginTop: '6px' }}>
                  예약된 체험단입니다
                </div>
                <div style={{
                  fontSize: '1.3rem', fontWeight: 800, marginTop: '10px', wordBreak: 'break-all',
                  background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                }}>
                  {ckResult.xid || ''}
                </div>
                <div style={{ color: '#333', marginTop: '8px', fontSize: '1rem', lineHeight: 1.6 }}>
                  <b>{ckResult.store || ''}</b>
                  <br />{ckResult.resvWhen ? `예약 ${ckResult.resvWhen}` : ''}
                  {ckResult.pax !== '' && ckResult.pax != null ? ` · ${ckResult.pax}인` : ''}
                  <br />{ckResult.already ? '체크인 완료 ' : '입장 확인 '}{ckResult.when || ''}
                </div>
                <div style={{ color: '#888', marginTop: '12px', fontSize: '0.85rem', lineHeight: 1.6 }}>
                  이 화면을 매장 직원에게 보여주세요. / 请向店员出示此页面。
                  <br />카톡 알림은 최대 1분 내 자동 발송됩니다. / 系统通知将在1分钟内自动发送。
                </div>
                <button onClick={closeCheckin} style={{
                  marginTop: '14px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  color: 'white', border: 'none', padding: '10px 32px', borderRadius: '20px',
                  fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer',
                }}>
                  확인 / 确认
                </button>
              </div>
            )}

            {/* 타지점 스캔 — 오늘 실제 예약 지점 안내 */}
            {camState === 'nomatch' && (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: '40px' }}>🔍</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: '6px' }}>
                  이 매장의 오늘 예약이 없습니다 / 未找到今天在此店的预约
                </div>
                {ckOther && ckOther.scanStore && (
                  <div style={{ marginTop: '6px', color: '#666', fontSize: '0.88rem' }}>
                    스캔한 매장 / 扫描的门店: <b>{ckOther.scanStore}</b>
                  </div>
                )}
                {ckOther && ckOther.list && ckOther.list.length > 0 && (
                  <div style={{
                    marginTop: '10px', background: '#fffbeb', border: '1px solid #fde68a',
                    borderRadius: '10px', padding: '10px 14px', textAlign: 'left', fontSize: '0.92rem', lineHeight: 1.7,
                  }}>
                    <b>오늘 예약 / 您今天的预约:</b>
                    {ckOther.list.map((o, i) => (
                      <div key={i}>📍 {o.store} <span style={{ color: '#92400e' }}>{o.when}</span></div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
                  <button onClick={openCheckin} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer' }}>
                    다시 스캔 / 重新扫描
                  </button>
                  <button onClick={closeCheckin} style={{ background: '#e5e7eb', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer' }}>
                    닫기 / 关闭
                  </button>
                </div>
              </div>
            )}

            {camState !== 'done' && camState !== 'nomatch' && (
              <div style={{ fontSize: '0.95rem', lineHeight: 1.7, color: '#111' }}>
                {/* 1차: 라이브 카메라 스캔 */}
                {(camState === 'starting' || camState === 'scanning') && (
                  <div style={{ textAlign: 'center' }}>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      style={{ width: '100%', maxHeight: '46vh', borderRadius: '12px', background: '#000', objectFit: 'cover' }}
                    />
                    <p style={{ margin: '8px 0 0', color: '#333', fontSize: '0.95rem' }}>
                      {camState === 'starting' ? '正在打开相机… / 카메라 여는 중…' : '请对准店内二维码 / 매장 QR을 화면에 맞춰주세요'}
                    </p>
                    {ckErr && <p style={{ margin: '6px 0 0', color: '#dc2626', fontSize: '0.85rem' }}>{ckErr}</p>}
                  </div>
                )}

                {camState === 'denied' && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 14px', fontSize: '0.9rem' }}>
                    无法打开相机，请使用下方数字码。
                    <br />카메라를 열 수 없습니다 — 아래 매장 코드를 입력해 주세요.
                  </div>
                )}

                {/* 2차: 매장 게시 일별 코드 (카메라 실패 시 자동 펼침) */}
                <details open={camState === 'denied'} style={{ marginTop: '12px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
                    方法② 输入店内数字码 / 매장 코드 입력
                  </summary>
                  <p style={{ margin: '8px 0', color: '#666', fontSize: '0.83rem' }}>
                    输入店内公示的<b>今日6位码</b>（每天更换）/ 매장에 게시된 오늘의 6자리 코드
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={checkinCode}
                      onChange={e => setCheckinCode(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={e => { if (e.key === 'Enter') handleCodeCheckin(); }}
                      placeholder="000000"
                      style={{
                        flex: 1, padding: '10px', fontSize: '1.2rem', letterSpacing: '0.3em',
                        textAlign: 'center', border: '1px solid #d1d5db', borderRadius: '8px', minWidth: 0,
                      }}
                    />
                    <button
                      onClick={handleCodeCheckin}
                      disabled={checkinBusy || checkinCode.length !== 6}
                      style={{
                        background: checkinCode.length === 6 ? 'linear-gradient(135deg, #7c3aed, #4f46e5)' : '#d1d5db',
                        color: 'white', border: 'none', padding: '0 18px', borderRadius: '8px',
                        fontWeight: 'bold', cursor: checkinCode.length === 6 ? 'pointer' : 'default', flexShrink: 0,
                      }}
                    >
                      {checkinBusy ? '⏳' : '签到'}
                    </button>
                  </div>
                  {/* 코드 전송 결과는 여기 항상 표시 — "아무 반응 없음"으로 보이지 않게 */}
                  {ckErr && (
                    <p style={{ margin: '8px 0 0', color: '#dc2626', fontSize: '0.85rem', fontWeight: 700 }}>{ckErr}</p>
                  )}
                  {checkinBusy && (
                    <p style={{ margin: '8px 0 0', color: '#666', fontSize: '0.85rem' }}>⏳ 확인 중… / 正在确认…</p>
                  )}
                </details>

                {/* 3차: 위챗 네이티브 스캔 (마지막 수단) */}
                <details style={{ marginTop: '10px' }}>
                  <summary style={{ cursor: 'pointer', color: '#888', fontSize: '0.85rem' }}>
                    方法③ 微信扫一扫 / 위챗 스캔으로 하기
                  </summary>
                  <p style={{ margin: '8px 0 0', color: '#666', fontSize: '0.85rem', lineHeight: 1.7 }}>
                    ① 打开微信 <b>➕ → 扫一扫</b>（长按微信图标也可以）
                    <br />② 扫描店内二维码 → 自动完成签到
                    <br />위챗 스캔으로 매장 QR을 찍어도 자동 체크인됩니다.
                  </p>
                </details>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 가이드 내용 모달 (Popup) */}
      {guideModal.isOpen && (
        <div className="inf-modal-backdrop" onClick={() => setGuideModal({ isOpen: false, text: '', client: '' })}>
          <div className="inf-modal-content" onClick={e => e.stopPropagation()}>
            <div className="inf-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-color)' }}>{guideModal.client} - 拍摄指南</h3>
              <button onClick={() => setGuideModal({ isOpen: false, text: '', client: '' })} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div className="inf-modal-body" style={{ whiteSpace: 'pre-wrap', color: '#111', fontSize: '0.95rem', lineHeight: '1.6', maxHeight: '50vh', overflowY: 'auto', background: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #e9ecef' }}>
              {guideModal.text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
