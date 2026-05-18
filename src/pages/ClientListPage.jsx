import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import './ClientListPage.css';

// ─── 코드 → 표시 매핑 (중문) ─────────────────────────────────
const REGION_MAP = {
  J: { label: '济州', key: 'jeju' },
  S: { label: '首尔', key: 'seoul' },
  B: { label: '釜山', key: 'busan' },
  E: { label: '其他', key: 'etc' },
};

const CATEGORY_MAP = {
  FB: { label: '美食',      icon: '🍽️', key: 'fb' },
  AT: { label: '活动',      icon: '🎯', key: 'at' },
  RT: { label: '零售·美容', icon: '💄', key: 'rt' },
  HT: { label: '酒店',      icon: '🏨', key: 'ht' },
};

// ─── 권역 ── 제주는 이미 중문, 서울만 한글 → 중문 매핑 ────────
const SUBAREA_LABEL_CN = {
  '여의도': '汝矣岛',
  '명동/시청/남대문': '明洞/市厅/南大门',
  '홍대': '弘大',
  '강남': '江南',
};
const getSubareaLabel = (raw) => SUBAREA_LABEL_CN[raw] || raw;

// 지역별 권역 사전 정의 순서 (UI 정렬용)
const SUBAREA_ORDER_BY_REGION = {
  J: ['市区', '南线', '西线', '东线'],
  S: ['여의도', '명동/시청/남대문', '홍대', '강남'],
};

// ─── 휴무 포맷 (한글 요일 → 중문 변환) ────────────────────────
const WEEKDAY_SET = new Set(['월', '화', '수', '목', '금', '토', '일']);
const WEEKDAY_CN  = { '월': '一', '화': '二', '수': '三', '목': '四', '금': '五', '토': '六', '일': '日' };

function formatHoliday(holiday) {
  if (!holiday) return '';
  const parts = holiday.split(', ').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.includes('무휴')) return '全年无休';

  const days   = parts.filter(p => WEEKDAY_SET.has(p));
  const others = parts.filter(p => !WEEKDAY_SET.has(p));
  const cnDays = days.map(d => WEEKDAY_CN[d] || d);

  if (days.length === 0)   return others.join(', ');
  if (others.length === 0) return `每周${cnDays.join('·')}休`;
  return `每周${cnDays.join('·')}休 · ${others.join(', ')}`;
}

// ─── 월 레이블 (UI 표시용) ───────────────────────────────────
function toDisplayMonth(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  return y && m ? `${y}年${parseInt(m, 10)}月` : monthStr;
}

// ─── Modal (拍摄剧本 전용) ───────────────────────────────────
function GuideModal({ client, onClose }) {
  // ESC 키로 닫기 + 모달 열린 동안 body 스크롤 잠금
  useEffect(() => {
    if (!client) return;
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [client, onClose]);

  if (!client) return null;
  return (
    <div className="cl-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="cl-modal" onClick={e => e.stopPropagation()}>
        <div className="cl-modal-header">
          <div>
            <div className="cl-modal-title">拍摄剧本</div>
            <div className="cl-modal-subtitle">{client.zhName || client.krName}</div>
          </div>
          <button className="cl-modal-close" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="cl-modal-body">{client.guide || '内容暂无'}</div>
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
            <span className="cl-badge-subarea">{getSubareaLabel(client.subarea)}</span>
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
                  <span aria-hidden="true">🕐</span> 营业时间
                </span>
                <span className="cl-info-value">{client.hours}</span>
              </div>
            )}
            {holiday && (
              <div className="cl-info-item">
                <span className="cl-info-label">
                  <span aria-hidden="true">📅</span> 公休日
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
            <span className="cl-break-label">中休</span>
            <span className="cl-info-value">{client.breakTime}</span>
          </div>
        )}

        {/* 제공내역 (있을 때만) */}
        {client.services && (
          <div className="cl-services-box">
            <div className="cl-services-header">
              <span aria-hidden="true">🎁</span> 提供内容
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
            📋 查看拍摄剧本
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 공통 페이지 껍데기 ──────────────────────────────────────
function PageShell({ month, count, children }) {
  return (
    <div className="cl-page">
      <div className="cl-header">
        <div className="cl-header-inner">
          <div className="cl-logo"><span className="cl-logo-dot" /> T A M K O R E A</div>
          <h1>本月体验团餐厅</h1>
          {(month || count != null) && (
            <div className="cl-header-sub">
              {month && <span className="cl-month-badge">{toDisplayMonth(month)}</span>}
              {count != null && <span>共 {count} 家</span>}
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

  const [clients, setClients]               = useState([]);
  const [status, setStatus]                 = useState('loading');
  const [errorMsg, setErrorMsg]             = useState('');
  const [regionFilter, setRegionFilter]     = useState('all'); // 'all' | 'J' | 'S' | ...
  const [subareaFilter, setSubareaFilter]   = useState('all'); // 'all' | '市区' | '여의도' | ...
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' | 'FB' | ...
  const [guideClient, setGuideClient]       = useState(null);  // 모달 대상

  // 지역 변경 시 권역 자동 리셋 (지역 종속이므로)
  const handleRegionChange = useCallback((code) => {
    setRegionFilter(code);
    setSubareaFilter('all');
  }, []);

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

  // 필터 탭: 실제 데이터에 있는 지역/업종만 (사전 정의 순서 유지)
  const REGION_ORDER   = ['J', 'S', 'B', 'E'];
  const CATEGORY_ORDER = ['FB', 'AT', 'RT', 'HT'];
  const presentRegions    = REGION_ORDER.filter(r => clients.some(c => c.region   === r));
  const presentCategories = CATEGORY_ORDER.filter(k => clients.some(c => c.category === k));

  // 현재 지역에 속한 권역 (지역 'all'이면 빈 배열 → 권역 필터 숨김)
  const presentSubareas = regionFilter === 'all'
    ? []
    : (SUBAREA_ORDER_BY_REGION[regionFilter] || []).filter(s =>
        clients.some(c => c.region === regionFilter && c.subarea === s)
      );

  // 지역 × 권역 × 업종 AND 필터링
  const filtered = clients.filter(c => {
    const passRegion   = regionFilter   === 'all' || c.region   === regionFilter;
    const passSubarea  = subareaFilter  === 'all' || c.subarea  === subareaFilter;
    const passCategory = categoryFilter === 'all' || c.category === categoryFilter;
    return passRegion && passSubarea && passCategory;
  });

  // 현재 지역에서 active 색상 키 (권역 active 시 사용)
  const activeRegionKey = REGION_MAP[regionFilter]?.key || '';

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
    <PageShell month={month} count={clients.length}>
      {/* 필터: 지역 × 업종 */}
      {(presentRegions.length > 1 || presentCategories.length > 1) && (
        <div className="cl-filter-wrap">
          {/* 지역 필터 */}
          {presentRegions.length > 1 && (
            <div className="cl-filter-row">
              <span className="cl-filter-label">地区</span>
              <div className="cl-filter-buttons">
                <button
                  className={`cl-filter-btn${regionFilter === 'all' ? ' active' : ''}`}
                  onClick={() => handleRegionChange('all')}
                >
                  全部 <span className="cl-filter-count">{clients.length}</span>
                </button>
                {presentRegions.map(code => {
                  const info = REGION_MAP[code];
                  const cnt  = clients.filter(c => c.region === code).length;
                  return (
                    <button
                      key={code}
                      className={`cl-filter-btn cl-filter-btn--${info.key}${regionFilter === code ? ' active' : ''}`}
                      onClick={() => handleRegionChange(code)}
                    >
                      {info.label} <span className="cl-filter-count">{cnt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 권역 필터 (Cascading — 지역 선택 시에만 등장) */}
          {presentSubareas.length > 1 && (
            <div className="cl-filter-row cl-filter-row--subarea">
              <span className="cl-filter-label">区域</span>
              <div className="cl-filter-buttons">
                <button
                  className={`cl-filter-btn cl-filter-btn--${activeRegionKey}${subareaFilter === 'all' ? ' active' : ''}`}
                  onClick={() => setSubareaFilter('all')}
                >
                  全部 <span className="cl-filter-count">
                    {clients.filter(c => c.region === regionFilter).length}
                  </span>
                </button>
                {presentSubareas.map(subarea => {
                  const cnt = clients.filter(c => c.region === regionFilter && c.subarea === subarea).length;
                  return (
                    <button
                      key={subarea}
                      className={`cl-filter-btn cl-filter-btn--${activeRegionKey}${subareaFilter === subarea ? ' active' : ''}`}
                      onClick={() => setSubareaFilter(subarea)}
                    >
                      {getSubareaLabel(subarea)} <span className="cl-filter-count">{cnt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 업종 필터 */}
          {presentCategories.length > 1 && (
            <div className="cl-filter-row">
              <span className="cl-filter-label">类别</span>
              <div className="cl-filter-buttons">
                <button
                  className={`cl-filter-btn${categoryFilter === 'all' ? ' active' : ''}`}
                  onClick={() => setCategoryFilter('all')}
                >
                  全部 <span className="cl-filter-count">{clients.length}</span>
                </button>
                {presentCategories.map(code => {
                  const info = CATEGORY_MAP[code];
                  const cnt  = clients.filter(c => c.category === code).length;
                  return (
                    <button
                      key={code}
                      className={`cl-filter-btn cl-filter-btn--${info.key}${categoryFilter === code ? ' active' : ''}`}
                      onClick={() => setCategoryFilter(code)}
                    >
                      <span aria-hidden="true">{info.icon}</span> {info.label} <span className="cl-filter-count">{cnt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 카드 그리드 (또는 빈 결과 안내) */}
      <div className="cl-container">
        {filtered.length > 0 ? (
          <div className="cl-grid">
            {filtered.map(client => (
              <ClientCard key={client.id} client={client} onOpenGuide={openGuide} />
            ))}
          </div>
        ) : (
          <div className="cl-state-card">
            <div className="cl-state-icon">🔍</div>
            <h2>没有符合条件的店铺</h2>
            <p>请尝试选择其他地区或类别。</p>
          </div>
        )}
      </div>

      {/* 拍摄剧本 모달 */}
      {guideClient && <GuideModal client={guideClient} onClose={closeGuide} />}
    </PageShell>
  );
}
