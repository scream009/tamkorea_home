import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import './ClientListPage.css';

// ─── 코드 → 표시 매핑 ────────────────────────────────────────
const REGION_MAP = {
  J: { label: '제주', key: 'jeju' },
  S: { label: '서울', key: 'seoul' },
  B: { label: '부산', key: 'busan' },
  E: { label: '기타', key: 'etc' },
};

const CATEGORY_MAP = {
  FB: { label: '미식',        icon: '🍽️', key: 'fb' },
  AT: { label: '액티비티',    icon: '🎯', key: 'at' },
  RT: { label: '리테일·미용', icon: '💄', key: 'rt' },
  HT: { label: '호텔',        icon: '🏨', key: 'ht' },
};

// ─── 휴무 포맷 ────────────────────────────────────────────────
function formatHoliday(holiday) {
  if (!holiday) return '';
  const parts = holiday.split(', ').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.includes('무휴')) return '연중무휴';
  return `매주 ${parts.join('·')} 휴무`;
}

// ─── 월 레이블 (UI 표시용) ───────────────────────────────────
function toDisplayMonth(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  return y && m ? `${y}年${parseInt(m, 10)}月` : monthStr;
}

// ─── Modal (拍摄剧本 전용) ───────────────────────────────────
function GuideModal({ client, onClose }) {
  if (!client) return null;
  return (
    <div className="cl-modal-backdrop" onClick={onClose}>
      <div className="cl-modal" onClick={e => e.stopPropagation()}>
        <div className="cl-modal-header">
          <div>
            <div className="cl-modal-title">拍摄剧本</div>
            <div className="cl-modal-subtitle">{client.zhName || client.krName}</div>
          </div>
          <button className="cl-modal-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="cl-modal-body">{client.guide || '내용 없음'}</div>
      </div>
    </div>
  );
}

// ─── Client Card ─────────────────────────────────────────────
function ClientCard({ client, onOpenGuide }) {
  const regionInfo   = REGION_MAP[client.region]   || { label: client.region, key: 'etc' };
  const categoryInfo = CATEGORY_MAP[client.category] || null;
  const holiday      = formatHoliday(client.holiday);

  return (
    <div className={`cl-card cl-card--${regionInfo.key}`}>

      {/* ── 카드 헤더: 배지 + 이름 ───────────────────── */}
      <div className="cl-card-top">
        <div className="cl-badges">
          <span className={`cl-badge-region cl-badge-region--${regionInfo.key}`}>
            {regionInfo.label}
          </span>
          {client.subarea && (
            <span className="cl-badge-subarea">{client.subarea}</span>
          )}
          {categoryInfo && (
            <span className={`cl-badge-cat cl-badge-cat--${categoryInfo.key}`}>
              <span aria-hidden="true">{categoryInfo.icon}</span>
              {categoryInfo.label}
            </span>
          )}
        </div>

        <div className="cl-zh-name">{client.zhName || client.krName}</div>
        {client.zhName && client.krName && (
          <div className="cl-kr-name">{client.krName}</div>
        )}
      </div>

      {/* ── 영업 정보 ────────────────────────────────── */}
      <div className="cl-info">
        {/* 영업시간 + 정기휴무 2열 */}
        {(client.hours || holiday) && (
          <div className="cl-info-grid">
            {client.hours && (
              <div className="cl-info-item">
                <span className="cl-info-label">
                  <span aria-hidden="true">🕐</span> 영업시간
                </span>
                <span className="cl-info-value">{client.hours}</span>
              </div>
            )}
            {holiday && (
              <div className="cl-info-item">
                <span className="cl-info-label">
                  <span aria-hidden="true">📅</span> 정기휴무
                </span>
                <span className="cl-info-value">{holiday}</span>
              </div>
            )}
          </div>
        )}

        {/* 브레이크타임 (있을 때만) */}
        {client.breakTime && (
          <div className="cl-info-row">
            <span className="cl-info-icon" aria-hidden="true">☕</span>
            <span className="cl-break-label">브레이크</span>
            <span className="cl-info-value">{client.breakTime}</span>
          </div>
        )}

        {/* 제공내역 (있을 때만) */}
        {client.services && (
          <div className="cl-services-box">
            <div className="cl-services-header">
              <span aria-hidden="true">🎁</span> 제공내역
            </div>
            <div className="cl-services-text">{client.services}</div>
          </div>
        )}
      </div>

      {/* ── 촬영 가이드 버튼 (있을 때만) ───────────────── */}
      {client.guide && (
        <div className="cl-actions">
          <button
            className="cl-btn-guide"
            onClick={() => onOpenGuide(client)}
          >
            📋 拍摄剧本 보기
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 공통 페이지 껍데기 ──────────────────────────────────────
function PageShell({ month, children }) {
  return (
    <div className="cl-page">
      <div className="cl-header">
        <div className="cl-header-inner">
          <div className="cl-logo"><span className="cl-logo-dot" /> T A M K O R E A</div>
          <h1>本月体验团餐厅</h1>
          {month && (
            <div className="cl-header-sub">
              <span className="cl-month-badge">{toDisplayMonth(month)}</span>
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

  const [clients, setClients]           = useState([]);
  const [status, setStatus]             = useState('loading');
  const [errorMsg, setErrorMsg]         = useState('');
  const [regionFilter, setRegionFilter] = useState('전체');
  const [guideClient, setGuideClient]   = useState(null); // 모달 대상

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

  const openGuide  = useCallback(client => setGuideClient(client), []);
  const closeGuide = useCallback(() => setGuideClient(null), []);

  // 필터 탭: 실제 데이터에 있는 지역만
  const presentRegionCodes = [...new Set(clients.map(c => c.region).filter(Boolean))];
  const filterTabs = ['전체', ...presentRegionCodes.map(code => REGION_MAP[code]?.label || code)];

  const filtered = regionFilter === '전체'
    ? clients
    : clients.filter(c => (REGION_MAP[c.region]?.label || c.region) === regionFilter);

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

  // ── 메인 ──────────────────────────────────────────────────
  return (
    <div className="cl-page">
      <div className="cl-header">
        <div className="cl-header-inner">
          <div className="cl-logo"><span className="cl-logo-dot" /> T A M K O R E A</div>
          <h1>本月体验团餐厅</h1>
          <div className="cl-header-sub">
            <span className="cl-month-badge">{toDisplayMonth(month)}</span>
            <span>共 {clients.length} 家</span>
          </div>
        </div>
      </div>

      {/* 지역 필터 탭 */}
      {filterTabs.length > 2 && (
        <div className="cl-filter-wrap">
          <div className="cl-filter-inner">
            {filterTabs.map(tab => {
              const count = tab === '전체'
                ? clients.length
                : clients.filter(c => (REGION_MAP[c.region]?.label || c.region) === tab).length;
              return (
                <button
                  key={tab}
                  className={`cl-filter-btn${regionFilter === tab ? ' active' : ''}`}
                  onClick={() => setRegionFilter(tab)}
                >
                  {tab} <span className="cl-filter-count">{count}</span>
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
            <ClientCard key={client.id} client={client} onOpenGuide={openGuide} />
          ))}
        </div>
      </div>

      {/* 拍摄剧本 모달 */}
      {guideClient && <GuideModal client={guideClient} onClose={closeGuide} />}
    </div>
  );
}
