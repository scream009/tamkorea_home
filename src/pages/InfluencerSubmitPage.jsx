import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
                <th style={{ width: '30%' }}>客户名</th>
                <th style={{ width: '10%' }}>拍摄指南</th>
                <th style={{ width: '12%' }}>拍摄日期 & 截止日期</th>
                <th>提交视频链接</th>
                <th style={{ width: '10%' }}>状态</th>
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
                      <div className="inf-client-name">{rec.client}</div>
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
                    <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      <div>{formatDate(rec.date)}</div>
                      {rec.deadline && (
                        <div style={{ color: 'var(--revu-red)', marginTop: '4px', fontWeight: '500' }}>
                          截止: {rec.deadline}
                        </div>
                      )}
                    </td>

                    {/* 링크 입력 */}
                    <td className="inf-link-cell">
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
