import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import './InfluencerSubmitPage.css';

// ─── 날짜 포맷 헬퍼 ──────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = days[d.getDay()];
    return `${month}/${day} (${dayName})`;
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
  const [links, setLinks] = useState({});          // { recordId: linkValue }
  const [invalidLinks, setInvalidLinks] = useState({}); // { recordId: true } URL 오류
  const [saving, setSaving] = useState({});         // { recordId: true/false }
  const [status, setStatus] = useState('idle');     // 'idle' | 'loading' | 'error' | 'empty'
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [inflName, setInflName] = useState('');     // 인플루언서 닉네임
  const [deadline, setDeadline] = useState('');     // 제출 마감일
  const [resolvedInflId, setResolvedInflId] = useState(''); // 서버에서 해석한 실제 INFL_ID

  // ─── 데이터 로드 ────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('링크가 올바르지 않습니다. 담당자에게 문의해 주세요.');
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
        if (data.deadline) setDeadline(data.deadline);
        if (data.inflId) setResolvedInflId(data.inflId);
        // 기존 제출 링크를 초기값으로 세팅
        const initLinks = {};
        data.records.forEach(rec => {
          initLinks[rec.id] = rec.resultLink || '';
        });
        setLinks(initLinks);
        setStatus('idle');
      })
      .catch(err => {
        console.error(err);
        setStatus('error');
        setErrorMsg('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
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
    const link = links[recordId]?.trim();
    if (!link) {
      showToast('링크를 입력해 주세요.', 'error');
      return;
    }

    // URL 형식 검사
    if (!isValidUrl(link)) {
      setInvalidLinks(prev => ({ ...prev, [recordId]: true }));
      showToast('올바른 URL 형식이 아닙니다.  (예: https://xhslink.com/...)', 'error');
      return;
    }
    // 유효 → 오류 상태 해제
    setInvalidLinks(prev => ({ ...prev, [recordId]: false }));

    setSaving(s => ({ ...s, [recordId]: true }));
    try {
      const res = await fetch('/api/influencer-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, resultLink: link }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed');

      // 로컬 상태 업데이트
      setRecords(prev =>
        prev.map(rec =>
          rec.id === recordId ? { ...rec, resultLink: link, status: '제출완료' } : rec
        )
      );
      showToast('저장되었습니다!', 'success');
    } catch (err) {
      console.error(err);
      showToast('저장에 실패했습니다. 다시 시도해 주세요.', 'error');
    } finally {
      setSaving(s => ({ ...s, [recordId]: false }));
    }
  }, [links, isValidUrl, showToast]);

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
            <div className="inf-logo"><span className="inf-logo-dot" /> GRAVITY × TAMKOREA</div>
            <h1>촬영 결과물 제출</h1>
          </div>
        </div>
        <div className="inf-container">
          <div className="inf-state-card">
            <div className="inf-spinner" />
            <p>스케줄을 불러오는 중...</p>
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
            <div className="inf-logo"><span className="inf-logo-dot" /> GRAVITY × TAMKOREA</div>
            <h1>촬영 결과물 제출</h1>
          </div>
        </div>
        <div className="inf-container">
          <div className="inf-state-card error">
            <div className="inf-state-icon">⚠️</div>
            <h2>오류가 발생했습니다</h2>
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
            <div className="inf-logo"><span className="inf-logo-dot" /> GRAVITY × TAMKOREA</div>
            <h1>촬영 결과물 제출</h1>
          </div>
        </div>
        <div className="inf-container">
          <div className="inf-state-card">
            <div className="inf-state-icon">📭</div>
            <h2>배정된 스케줄이 없습니다</h2>
            <p>담당자에게 문의해 주세요.</p>
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
          <div className="inf-logo"><span className="inf-logo-dot" /> GRAVITY × TAMKOREA</div>
          <h1>이번 달 촬영 결과물 제출</h1>
          <div className="inf-header-sub">
            <span className="inf-badge">📸 {inflName || resolvedInflId || token}</span>
            <span>총 {totalCount}개 고객사 · {doneCount}건 제출완료</span>
            {deadline && (
              <span className="inf-deadline-badge">📅 제출 마감: {deadline}</span>
            )}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="inf-progress-wrap">
        <div className="inf-progress-label">
          <span>제출 진행률</span>
          <span>{doneCount} / {totalCount} ({progressPct}%)</span>
        </div>
        <div className="inf-progress-bar">
          <div className="inf-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Main */}
      <div className="inf-container">
        {/* 안내 문구 */}
        <p className="inf-hint">작업이 완료된 고객사부터 순서대로 링크를 입력하고 <strong>저장</strong> 또는 <strong>Enter</strong>를 눌러주세요.</p>

        {/* 테이블 */}
        <div className="inf-table-wrap">
          <table className="inf-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>고객사</th>
                <th style={{ width: '10%' }}>가이드</th>
                <th style={{ width: '12%' }}>촬영일</th>
                <th>영상 링크 제출</th>
                <th style={{ width: '10%' }}>상태</th>
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
                      <div className="inf-client-date">{formatDate(rec.date)}</div>
                    </td>

                    {/* 촬영가이드 */}
                    <td>
                      {rec.guide ? (
                        <a
                          href={rec.guide}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inf-btn-guide"
                        >
                          📖 보기
                        </a>
                      ) : (
                        <span className="inf-btn-guide no-guide">📖 없음</span>
                      )}
                    </td>

                    {/* 날짜 (모바일 숨김) */}
                    <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      {formatDate(rec.date)}
                    </td>

                    {/* 링크 입력 */}
                    <td className="inf-link-cell">
                      <div className="inf-input-wrap">
                        <input
                          type="url"
                          className={`inf-link-input ${isDone ? 'submitted' : ''} ${invalidLinks[rec.id] ? 'invalid' : ''}`}
                          placeholder="https://xhslink.com/..."
                          value={links[rec.id] || ''}
                          onChange={e => {
                            setLinks(prev => ({ ...prev, [rec.id]: e.target.value }));
                            if (invalidLinks[rec.id]) setInvalidLinks(prev => ({ ...prev, [rec.id]: false }));
                          }}
                          onKeyDown={e => handleKeyDown(e, rec.id)}
                        />
                        <button
                          className={`inf-btn-save ${isDone ? 'resubmit' : ''}`}
                          onClick={() => handleSaveOne(rec.id)}
                          disabled={isSaving || !links[rec.id]?.trim()}
                          title={isDone ? '링크 수정 후 다시 저장' : '저장'}
                        >
                          {isSaving ? '⏳' : isDone ? '수정' : '저장'}
                        </button>
                      </div>
                    </td>

                    {/* 상태 */}
                    <td>
                      <span className={`inf-status ${isDone ? 'done' : 'pending'}`}>
                        {isDone ? '✅ 완료' : '⏳ 대기'}
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
    </div>
  );
}
