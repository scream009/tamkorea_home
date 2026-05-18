import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import './ClientListPage.css';

// ─── 휴무 포맷 ────────────────────────────────────────────────
function formatHoliday(holiday) {
  if (!holiday) return '';
  const parts = holiday.split(', ').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.includes('무휴')) return '연중무휴';
  return `매주 ${parts.join('·')} 휴무`;
}

// ─── 월 레이블 (UI 표시용) ────────────────────────────────────
function toDisplayMonth(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  return y && m ? `${y}年${parseInt(m, 10)}月` : monthStr;
}

// ─── 권역 CSS 키 ──────────────────────────────────────────────
const REGION_KEY = { '제주': 'jeju', '서울': 'seoul', '부산': 'busan', '기타': 'etc' };

// ─── Modal ────────────────────────────────────────────────────
function Modal({ modal, onClose }) {
  if (!modal.isOpen || !modal.client) return null;
  const isGuide = modal.type === 'guide';
  const title   = isGuide ? '拍摄剧本' : '제공내역';
  const content = isGuide ? modal.client.guide : modal.client.services;
  const clientName = modal.client.zhName || modal.client.krName;

  return (
    <div className="cl-modal-backdrop" onClick={onClose}>
      <div className="cl-modal" onClick={e => e.stopPropagation()}>
        <div className="cl-modal-header">
          <div>
            <div className="cl-modal-title">{title}</div>
            <div className="cl-modal-subtitle">{clientName}</div>
          </div>
          <button className="cl-modal-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="cl-modal-body">{content || '내용 없음'}</div>
      </div>
    </div>
  );
}

// ─── Client Card ──────────────────────────────────────────────
function ClientCard({ client, onOpenModal }) {
  const rKey = REGION_KEY[client.region] || 'etc';
  const holiday = formatHoliday(client.holiday);
  const hasActions = client.guide || client.services;

  return (
    <div className={`cl-card cl-card--${rKey}`}>
      {/* 카드 상단: 이름 + 권역 뱃지 */}
      <div className="cl-card-top">
        <div className="cl-names">
          <div className="cl-zh-name">{client.zhName || client.krName}</div>
          {client.zhName && client.krName && (
            <div className="cl-kr-name">{client.krName}</div>
          )}
        </div>
        <span className={`cl-region-badge cl-region-badge--${rKey}`}>{client.region}</span>
      </div>

      {/* 영업 정보 */}
      <div className="cl-info">
        {client.hours && (
          <div className="cl-info-row">
            <span className="cl-info-icon" aria-hidden="true">🕐</span>
            <span>{client.hours}</span>
          </div>
        )}
        {holiday && (
          <div className="cl-info-row">
            <span className="cl-info-icon" aria-hidden="true">📅</span>
            <span>{holiday}</span>
          </div>
        )}
        {client.breakTime && (
          <div className="cl-info-row cl-info-row--break">
            <span className="cl-info-icon" aria-hidden="true">☕</span>
            <span>{client.breakTime}</span>
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      {hasActions && (
        <div className="cl-actions">
          {client.guide && (
            <button
              className="cl-btn cl-btn--guide"
              onClick={() => onOpenModal('guide', client)}
            >
              📋 拍摄剧本
            </button>
          )}
          {client.services && (
            <button
              className="cl-btn cl-btn--services"
              onClick={() => onOpenModal('services', client)}
            >
              🎁 제공내역
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 상태별 전체 레이아웃 공통 래퍼 ──────────────────────────
function PageShell({ month, children }) {
  return (
    <div className="cl-page">
      <div className="cl-header">
        <div className="cl-header-inner">
          <div className="cl-logo"><span className="cl-logo-dot" /> T A M K O R E A</div>
          <h1>本月体验团餐厅</h1>
          {month && (
            <div className="cl-header-sub">
              <span className="cl-badge">{toDisplayMonth(month)}</span>
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function ClientListPage() {
  const [searchParams] = useSearchParams();
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);

  const [clients, setClients]         = useState([]);
  const [status, setStatus]           = useState('loading');
  const [errorMsg, setErrorMsg]       = useState('');
  const [regionFilter, setRegionFilter] = useState('전체');
  const [modal, setModal]             = useState({ isOpen: false, type: '', client: null });

  useEffect(() => {
    setStatus('loading');
    setClients([]);
    fetch(`/api/client-list?month=${encodeURIComponent(month)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        const list = data.clients || [];
        setClients(list);
        setStatus(list.length ? 'idle' : 'empty');
      })
      .catch(err => {
        setErrorMsg(err.message);
        setStatus('error');
      });
  }, [month]);

  const openModal  = useCallback((type, client) => setModal({ isOpen: true, type, client }), []);
  const closeModal = useCallback(() => setModal({ isOpen: false, type: '', client: null }), []);

  // 권역 필터 목록 (존재하는 권역만)
  const presentRegions = [...new Set(clients.map(c => c.region))];
  const regions = ['전체', ...presentRegions];

  const filtered = regionFilter === '전체'
    ? clients
    : clients.filter(c => c.region === regionFilter);

  // ── 로딩 ──────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <PageShell month={month}>
        <div className="cl-container">
          <div className="cl-state-card">
            <div className="cl-spinner" />
            <p>正在加载餐厅列表...</p>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── 에러 ──────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <PageShell month={month}>
        <div className="cl-container">
          <div className="cl-state-card cl-state-card--error">
            <div className="cl-state-icon">⚠️</div>
            <h2>加载失败</h2>
            <p>{errorMsg}</p>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── 빈 목록 ───────────────────────────────────────────────
  if (status === 'empty') {
    return (
      <PageShell month={month}>
        <div className="cl-container">
          <div className="cl-state-card">
            <div className="cl-state-icon">📭</div>
            <h2>暂无体验餐厅</h2>
            <p>该月份暂无标注展示的餐厅，请联系负责人。</p>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── 메인 렌더 ─────────────────────────────────────────────
  return (
    <div className="cl-page">
      {/* 헤더 */}
      <div className="cl-header">
        <div className="cl-header-inner">
          <div className="cl-logo"><span className="cl-logo-dot" /> T A M K O R E A</div>
          <h1>本月体验团餐厅</h1>
          <div className="cl-header-sub">
            <span className="cl-badge">{toDisplayMonth(month)}</span>
            <span>共 {clients.length} 家餐厅</span>
          </div>
        </div>
      </div>

      {/* 권역 필터 */}
      {presentRegions.length > 1 && (
        <div className="cl-filter-wrap">
          <div className="cl-filter-inner">
            {regions.map(r => {
              const count = r === '전체' ? clients.length : clients.filter(c => c.region === r).length;
              return (
                <button
                  key={r}
                  className={`cl-filter-btn ${regionFilter === r ? 'active' : ''}`}
                  onClick={() => setRegionFilter(r)}
                >
                  {r} <span className="cl-filter-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 카드 그리드 */}
      <div className="cl-container">
        <div className="cl-grid">
          {filtered.map(client => (
            <ClientCard key={client.id} client={client} onOpenModal={openModal} />
          ))}
        </div>
      </div>

      {/* 모달 */}
      <Modal modal={modal} onClose={closeModal} />
    </div>
  );
}
