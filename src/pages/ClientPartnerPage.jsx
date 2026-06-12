import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Calendar as CalendarIcon, 
  List, 
  Users, 
  Camera, 
  Newspaper,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  AlertCircle,
  X,
  User,
  Info
} from 'lucide-react';
import './ClientSchedulePage.css'; 
import './ClientReportPage.css';

const TOKEN   = import.meta.env.VITE_AT_TOKEN;
const BASE_ID = 'appdsAV2ewZWCkyIa';
const AT_BASE = `https://api.airtable.com/v0/${BASE_ID}`;
const CAMPAIGN_TB = encodeURIComponent('Campaign_DB');
const RECORD_TB   = encodeURIComponent('진행_DB_OLD');

async function atFetch(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  return res.json();
}

async function fetchAllRecords(baseUrl) {
  let records = [];
  let offset = null;
  do {
    const url = offset ? `${baseUrl}&offset=${offset}` : baseUrl;
    const data = await atFetch(url);
    records = records.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);
  return records;
}

const TypeBadge = ({ type }) => {
  const map = { influencer: ['📣 인플루언서','infl'], experience: ['🍽️ 체험단','exp'], press: ['📰 기자단','press'] };
  const [label, cls] = map[type] || ['기타','exp'];
  return <span className={`type-badge ${cls}`}>{label}</span>;
};

const LinkBtn = ({ href, label }) =>
  href ? <a href={href} target="_blank" rel="noopener noreferrer" className="link-btn">🔗 {label}</a> : <span className="link-pending">진행 중</span>;

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

// 개별 고객사 대시보드 블록 컴포넌트
const CampaignDashboardBlock = ({ camp, partnerName }) => {
  const [viewMode, setViewMode] = useState('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const modalCloseBtnRef = useRef(null);

  // ESC 키 닫기 + 스크롤 잠금 (Schedule 페이지와 동기화)
  useEffect(() => {
    if (!selectedEvent) return;
    const handleKey = (e) => { if (e.key === 'Escape') setSelectedEvent(null); };
    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => modalCloseBtnRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedEvent]);

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const calendarDays = useMemo(() => {
    const y = currentDate.getFullYear(), m = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(y, m);
    const firstDay = getFirstDayOfMonth(y, m);
    const days = [];
    const prevDays = getDaysInMonth(y, m - 1);
    for (let i = firstDay - 1; i >= 0; i--) days.push({ date: new Date(y, m - 1, prevDays - i), isCurrentMonth: false });
    for (let i = 1; i <= daysInMonth; i++) days.push({ date: new Date(y, m, i), isCurrentMonth: true });
    const remain = 42 - days.length;
    for (let i = 1; i <= remain; i++) days.push({ date: new Date(y, m + 1, i), isCurrentMonth: false });
    return days;
  }, [currentDate]);

  // O(1) 날짜별 이벤트 인덱싱
  const eventsByDate = useMemo(() => {
    const map = new Map();
    for (const item of camp.scheduleItems) {
      if (!item.reserveDate) continue;
      const d = new Date(item.reserveDate);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    for (const events of map.values()) {
      events.sort((a, b) => {
        const ia = String(a.type || '').includes('인플'), ib = String(b.type || '').includes('인플');
        if (ia && !ib) return -1; if (!ia && ib) return 1;
        return new Date(a.reserveDate) - new Date(b.reserveDate);
      });
    }
    return map;
  }, [camp.scheduleItems]);

  const getEventsForDate = useCallback((dateObj) => {
    const key = `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}`;
    return eventsByDate.get(key) || [];
  }, [eventsByDate]);

  const getStatusDot = (status) => {
    if (!status) return <span className="status-dot status-wait"></span>;
    if (status.includes('완료')) return <span className="status-dot status-done"></span>;
    if (status.includes('확정')) return <span className="status-dot status-resv"></span>;
    if (status.includes('취소')) return <span className="status-dot status-cancel"></span>;
    return <span className="status-dot status-wait"></span>;
  };

  const getTypeClass = (type) => {
    if (!type) return 'event-exp';
    if (type.includes('인플')) return 'event-infl';
    if (type.includes('기자')) return 'event-press';
    return 'event-exp';
  };

  const formatType = (type) => type ? String(type).replace(/.*(?:->|=>|→|➔|➡|▶|>)\s*/, '').trim() : '';

  // 예약 메시지 자동 생성 (Schedule 페이지와 동기화)
  const generateDynamicMemo = (event) => {
    const typeStr = formatType(event.type);
    const typeText = typeStr ? `${typeStr} 예약` : '예약';
    const ids = event.displayIds?.length > 0 ? event.displayIds.join(', ') : event.displayId;
    let dateStr = '미정';
    if (!isNaN(new Date(event.reserveDate).getTime())) {
      const d = new Date(event.reserveDate);
      const dow = ['(일)', '(월)', '(화)', '(수)', '(목)', '(금)', '(토)'];
      dateStr = `${d.getMonth() + 1}/${d.getDate()}${dow[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    const paxStr = event.totalPax ? `${event.totalPax}명` : '미정';
    const safeMemo = Array.isArray(event.memo) ? event.memo.join(', ') : String(event.memo || '');
    const specialNote = safeMemo.trim() ? ` (${safeMemo.trim()})` : '';
    const safeXhs = Array.isArray(event.xhsCount) ? event.xhsCount[0] : (event.xhsCount || 1);
    const safeDp  = Array.isArray(event.dpCount)  ? event.dpCount[0]  : (event.dpCount  || 0);
    let contentStr = `샤오홍슈 ${safeXhs}건`;
    if (Number(safeDp) > 0) contentStr += `, 따중리뷰 ${safeDp}건`;
    const brandLabel = camp.brandName && camp.branchName ? `${camp.brandName} ${camp.branchName}` : (camp.brandName || '캠페인');
    return `【${brandLabel}】 ${typeText}입니다.\n\n- 닉네임: ${ids}\n- 일정: ${dateStr}\n- 인원: ${paxStr}${specialNote}\n- 내용: ${contentStr}\n\n* 방문시간은 약간의 변동이 있을 수 있습니다.`;
  };

  const hasInfl = camp.records.influencer.length > 0;
  const hasExp = camp.records.experience.length > 0;
  const hasPress = camp.records.press.length > 0;

  const copyClientLink = () => {
    const link = `https://report.tamkorea.com/schedule?campaignId=${camp.id}`;
    navigator.clipboard.writeText(link).then(() => {
      alert(`[${camp.brandName}] 전용 리포트 링크가 복사되었습니다.\n이 링크를 고객사에게 전달하세요!\n\n${link}`);
    }).catch(err => {
      console.error('링크 복사 실패:', err);
      alert('링크 복사에 실패했습니다.');
    });
  };

  const handleDownloadCSV = () => {
    if (!camp.records) return;
    
    const headers = ['구분', 'No.', '닉네임(ID)', '샤오홍슈 링크', '따종디엔핑 링크'];
    const rows = [];
    
    const escape = (text) => `"${(text || '').toString().replace(/"/g, '""')}"`;
    
    const addRows = (categoryName, items) => {
      if (!items) return;
      items.forEach(item => {
        const row = [
          escape(categoryName),
          item.seq,
          escape(item.displayId),
          escape(item.xhsResult),
          escape(item.dpResult)
        ];
        rows.push(row.join(','));
      });
    };

    addRows('인플루언서', camp.records.influencer);
    addRows('체험단', camp.records.experience);
    addRows('기자단', camp.records.press);

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const safeBrand = (camp.brandName || '캠페인').replace(/\s+/g, '_');
    const safeMonth = (camp.month || '').replace(/\s+/g, '');
    const filename = `${safeBrand}_${safeMonth}_실적보고서.csv`;
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="campaign-dashboard-block" style={{ marginBottom: '80px', paddingBottom: '40px', borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'relative' }}>
      
      {/* 공유 버튼 수정 (은은한 고스트 버튼 스타일) */}
      <button 
        onClick={copyClientLink}
        style={{
          position: 'absolute', top: '0', right: '0',
          background: 'transparent', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.15)',
          padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
          fontSize: '0.75rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px',
          transition: 'all 0.2s'
        }}
        onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
        onMouseOut={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
      >
        <ExternalLink className="w-3.5 h-3.5" /> 고객사 전달용 링크 복사
      </button>

      {/* 1. Header */}
      <header className="schedule-header flex flex-col items-center mb-10">
        <div className="inline-block bg-[var(--purple-dim)] text-[var(--purple-light)] px-5 py-2 rounded-full text-base font-bold mb-4 tracking-wider shadow-[0_0_15px_rgba(168,85,247,0.3)] border border-[var(--purple-light)]/20">
          {camp.month}
        </div>
        <h1 className="schedule-title text-center">{camp.brandName} {camp.branchName}</h1>
        <p className="schedule-subtitle text-center mt-2">캠페인 현황 대시보드</p>
      </header>

      {/* 2. KPI Summary */}
      <div className="kpi-grid">
        <div className="kpi-card purple">
          <div className="kpi-header"><span className="kpi-title">인플루언서 진행</span><Users className="w-5 h-5 kpi-icon" /></div>
          <div className="kpi-numbers"><span className="kpi-current">{camp.stats.infl_done}</span><span className="kpi-target">건</span></div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-header"><span className="kpi-title">체험단 진행</span><Camera className="w-5 h-5 kpi-icon" /></div>
          <div className="kpi-numbers"><span className="kpi-current">{camp.stats.exp_done}</span><span className="kpi-target">건</span></div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-header"><span className="kpi-title">기자단 진행</span><Newspaper className="w-5 h-5 kpi-icon" /></div>
          <div className="kpi-numbers"><span className="kpi-current">{camp.stats.press_done}</span><span className="kpi-target">건</span></div>
        </div>
      </div>

      {/* 3. View Toggles */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '1.5rem', position: 'relative' }}>
        <div className="view-tabs" style={{ marginBottom: 0 }}>
          <button className={`view-tab ${viewMode === 'calendar' ? 'active' : ''}`} onClick={() => setViewMode('calendar')}>
            <CalendarIcon className="w-4 h-4" /> 달력 뷰
          </button>
          <button className={`view-tab ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
            <List className="w-4 h-4" /> 리스트 뷰
          </button>
        </div>
        <button 
          onClick={handleDownloadCSV}
          style={{
            position: 'absolute',
            right: 0,
            background: 'rgba(168, 85, 247, 0.1)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            color: '#d8b4fe',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s',
            boxShadow: '0 0 10px rgba(168, 85, 247, 0.1)',
            height: 'fit-content'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.2)'; e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)'; e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)'; }}
        >
          📥 CSV 다운로드
        </button>
      </div>

      {/* 4. Calendar View */}
      {viewMode === 'calendar' ? (
        <div className="section">
          <div className="section-header">
            <div className="section-title text-white font-extrabold text-[1.4rem] tracking-tight drop-shadow-md">📅 예약 현황 달력</div>
            <div className="section-badge">{camp.month}</div>
          </div>
          <div className="cal-wrap">
            <div className="cal-nav">
              <div className="cal-month">{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월</div>
              <div className="cal-btns">
                <button onClick={prevMonth} className="cal-btn">‹ 이전</button>
                <button onClick={() => setCurrentDate(new Date())} className="cal-btn today">오늘</button>
                <button onClick={nextMonth} className="cal-btn">다음 ›</button>
              </div>
            </div>
            
            <div className="cal-grid">
              {['일', '월', '화', '수', '목', '금', '토'].map(day => <div key={day} className="cal-hdr">{day}</div>)}
              {calendarDays.map((dayObj, idx) => {
                const events = getEventsForDate(dayObj.date);
                const isToday = new Date().toDateString() === dayObj.date.toDateString();
                return (
                  <div key={idx} className={`cal-cell ${!dayObj.isCurrentMonth ? 'empty' : ''} ${isToday ? 'today-cell' : ''}`}>
                    {dayObj.isCurrentMonth && (
                      <>
                        <div className="cell-num">{dayObj.date.getDate()}</div>
                        <div className="event-list">
                          {events.map((ev, i) => {
                            const displayType = formatType(ev.type);
                            const statusStr = String(ev.status || '');
                            const isCancelled = statusStr.includes('취소');
                            const isNoShow = statusStr.includes('노쇼');
                            const d = ev.reserveDate ? new Date(ev.reserveDate) : null;
                            const time = (d && !Number.isNaN(d.getTime()))
                              ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                              : '';
                            return (
                              <button
                                type="button"
                                key={i}
                                className={`event-badge ${getTypeClass(ev.type)}${(isCancelled || isNoShow) ? ' is-cancelled' : ''}`}
                                aria-label={`${time ? time + ' ' : ''}${displayType}${ev.totalPax ? ' ' + ev.totalPax + '명' : ''}${isCancelled ? ' 취소' : ''}${isNoShow ? ' 노쇼' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                              >
                                <span className="ev-row">
                                  {time && <span className="ev-time">{time}</span>}
                                  {getStatusDot(ev.status)}
                                  <span className="ev-type">{displayType}</span>
                                  {ev.totalPax ? <span className="ev-pax">({ev.totalPax}명)</span> : null}
                                  {isCancelled && <span className="ev-tag-cancel">취소</span>}
                                  {isNoShow    && <span className="ev-tag-noshow">노쇼</span>}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* 5. List View */
        <div className="section mt-8">
          <div className="cr-wrap" style={{ minHeight: 'auto', padding: 0 }}>
            <div className="report-paper">
              <header className="report-header" style={{ marginBottom: '30px' }}>
                <div>
                  <h1 className="report-title">{camp.brandName}</h1>
                  <p className="report-sub">{camp.branchName} · {camp.month} 실적 보고서</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
                  <div className="gravity-logo-accent" style={{ margin: 0 }}>
                    {partnerName}<br />
                    <span style={{ fontSize:'0.65rem', color:'#9ca3af' }}>PERFORMANCE REPORT</span>
                  </div>
                </div>
              </header>

              {hasInfl && (
                <section className="category-section">
                  <h2 className="category-title"><TypeBadge type="influencer" /></h2>
                  <div className="premium-table-wrapper">
                    <table className="premium-table">
                      <thead><tr><th style={{width:'6%'}}>No.</th><th style={{width:'38%'}}>방문자 ID</th><th style={{width:'56%'}}>샤오홍슈 결과물</th></tr></thead>
                      <tbody>
                        {camp.records.influencer.map(item => (
                          <tr key={item.id} className={!item.xhsResult ? 'row-pending' : ''}>
                            <td>{item.seq}</td><td><span className="id-tag">{item.displayId || '-'}</span></td>
                            <td><LinkBtn href={item.xhsResult} label="포스팅 확인" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {hasExp && (
                <section className="category-section">
                  <h2 className="category-title"><TypeBadge type="experience" /></h2>
                  <div className="premium-table-wrapper">
                    <table className="premium-table">
                      <thead><tr><th style={{width:'6%'}}>No.</th><th style={{width:'28%'}}>방문자 ID</th><th style={{width:'33%'}}>샤오홍슈 결과물</th><th style={{width:'33%'}}>따종디엔핑</th></tr></thead>
                      <tbody>
                        {camp.records.experience.map(item => (
                          <tr key={item.id} className={!item.xhsResult && !item.dpResult ? 'row-pending' : ''}>
                            <td>{item.seq}</td><td><span className="id-tag">{item.displayId || '-'}</span></td>
                            <td><LinkBtn href={item.xhsResult} label="샤오홍슈" /></td>
                            <td><LinkBtn href={item.dpResult} label="따종디엔핑" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {hasPress && (
                <section className="category-section">
                  <h2 className="category-title"><TypeBadge type="press" /></h2>
                  <div className="press-grid">
                    {camp.records.press.map(item => (
                      <div key={item.id} className={`press-card ${!item.xhsResult ? 'press-pending' : ''}`}>
                        <span className="press-seq">{item.seq}</span>
                        {item.xhsResult ? <a href={item.xhsResult} target="_blank" rel="noopener noreferrer" className="press-link">포스팅 확인 →</a> : <span className="press-wait">진행 중</span>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {!hasInfl && !hasExp && !hasPress && (
                <div className="cr-center" style={{ padding:'60px 0', color:'#6b7280' }}>
                  아직 등록된 실적이 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Event Modal — Schedule 페이지 기준으로 동기화 */}
      {selectedEvent && (
        <div
          className="event-modal-overlay"
          onClick={() => setSelectedEvent(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-modal-title"
        >
          <div className="event-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              ref={modalCloseBtnRef}
              type="button"
              className="event-modal-close"
              onClick={() => setSelectedEvent(null)}
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
            <div className={`modal-header ${getTypeClass(selectedEvent.type)}`}>
              <h3 id="event-modal-title" className="modal-title flex items-center gap-2">
                {getStatusDot(selectedEvent.status)} {formatType(selectedEvent.type)} 상세정보
              </h3>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span className="detail-label"><CalendarIcon className="w-4 h-4" /> 예약 일시</span>
                <span className="detail-value text-white font-medium">
                  {!isNaN(new Date(selectedEvent.reserveDate).getTime())
                    ? new Date(selectedEvent.reserveDate).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '시간 미정'}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><Users className="w-4 h-4" /> 방문 인원</span>
                <span className="detail-value">{selectedEvent.totalPax ? `${selectedEvent.totalPax}명` : '미정'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><User className="w-4 h-4" /> 방문자 ID (닉네임)</span>
                <span className="detail-value">{selectedEvent.displayIds?.length > 0 ? selectedEvent.displayIds.join(', ') : selectedEvent.displayId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><Info className="w-4 h-4" /> 예약 메시지 / 메모</span>
                <span className="detail-value memo-box" style={{ whiteSpace: 'pre-wrap' }}>
                  {generateDynamicMemo(selectedEvent)}
                </span>
              </div>
              {selectedEvent.xhsResults && selectedEvent.xhsResults.length > 0 && (
                <div className="detail-row" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <span className="detail-label" style={{ color: 'var(--purple-light)' }}>완료 결과물</span>
                  <div className="flex flex-wrap gap-2" style={{ marginTop: '8px' }}>
                    {selectedEvent.xhsResults.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="result-link">
                        확인하기 {i + 1} <ExternalLink className="w-4 h-4" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function ClientPartnerPage() {
  const [searchParams] = useSearchParams();
  const partnerName = searchParams.get('name') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!partnerName) {
      setError('협력사 이름이 지정되지 않았습니다. (예: ?name=광고시홍보동)');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const formula = encodeURIComponent(`{협력사}='${partnerName}'`);
        const campUrl = `${AT_BASE}/${CAMPAIGN_TB}?filterByFormula=${formula}`;
        const campData = await fetchAllRecords(campUrl);

        if (campData.length === 0) {
          setData({ campaigns: [] });
          return;
        }

        const campaignMap = {};
        let allLinkedRecIds = [];

        campData.forEach(rec => {
          const cf = rec.fields;
          const campId = rec.id;
          const brandName = Array.isArray(cf['고객사명']) ? cf['고객사명'][0] : (cf['고객사명'] || cf['계약명'] || '알수없음');
          const branchName = Array.isArray(cf['지점명']) ? cf['지점명'][0] : (cf['지점명'] || '');
          const month = cf['계약월'] || '';

          const stats = {
            infl_done: cf['인플_방문'] || cf['인플_실적'] || cf['# 인플_실적'] || 0,
            exp_done:  cf['체험_방문'] || cf['체험_실적'] || cf['# 세팅_실적'] || cf['# 체험_실적'] || 0,
            press_done: cf['기자_실적'] || cf['# 기자_실적'] || 0,
          };

          campaignMap[campId] = { id: campId, brandName, branchName, month, stats, records: { influencer: [], experience: [], press: [] }, scheduleItems: [] };
          
          if (cf['진행_DB_OLD']) {
            cf['진행_DB_OLD'].forEach(id => { allLinkedRecIds.push({ recId: id, campId }); });
          }
        });

        let allRecords = [];
        if (allLinkedRecIds.length > 0) {
          const chunkSize = 30;
          for (let i = 0; i < allLinkedRecIds.length; i += chunkSize) {
            const chunk = allLinkedRecIds.slice(i, i + chunkSize);
            const orParts = chunk.map(item => `RECORD_ID()='${item.recId}'`).join(',');
            const chunkUrl = `${AT_BASE}/${RECORD_TB}?filterByFormula=${encodeURIComponent(`OR(${orParts})`)}`;
            const chunkRecs = await fetchAllRecords(chunkUrl);
            chunkRecs.forEach(r => {
              const mapping = chunk.find(m => m.recId === r.id);
              if (mapping) r.campId = mapping.campId;
              allRecords.push(r);
            });
          }
        }

        const teamGroups = {};
        
        allRecords.forEach((rec) => {
          const f = rec.fields;
          const camp = campaignMap[rec.campId];
          const type = f['유형'] || '';
          
          const displayId = (Array.isArray(f['XHS_ID']) ? f['XHS_ID'][0] : f['XHS_ID']) || 
                            (Array.isArray(f['WC_ID']) ? f['WC_ID'][0] : f['WC_ID']) || 
                            (Array.isArray(f['INFL_ID']) ? f['INFL_ID'][0] : f['INFL_ID']) || '대기중';

          const xhsResult = f['XHS_Result'] || '';
          const dpResult  = f['DP_Result']  || '';
          const status    = f['진행상태']   || '진행전';
          const reserveDate = f['예약일시'] || null;
          const totalPax = f['# 총인원'] || f['총인원'] || f['총 인원'] || '';
          
          const teamId = (f['예약팀명_DB'] && f['예약팀명_DB'].length > 0) ? f['예약팀명_DB'][0] : rec.id;
          const item = { id: rec.id, displayId, xhsResult, dpResult, status, type, reserveDate, totalPax };

          if (reserveDate) {
            if (!teamGroups[teamId]) {
              teamGroups[teamId] = { ...item, campId: rec.campId, displayIds: displayId !== '대기중' && displayId ? [displayId] : [], xhsResults: xhsResult ? [xhsResult] : [] };
            } else {
              if (displayId !== '대기중' && displayId) teamGroups[teamId].displayIds.push(displayId);
              if (xhsResult) teamGroups[teamId].xhsResults.push(xhsResult);
            }
          }

          const isExcluded = status.includes('취소') || status.includes('노쇼');
          if (!isExcluded) {
            if (type.includes('인플')) camp.records.influencer.push(item);
            else if (type.includes('기자')) camp.records.press.push(item);
            else camp.records.experience.push(item);
          }
        });

        // 분배 완료된 스케줄 그룹들을 각 캠페인에 할당
        Object.values(teamGroups).forEach(group => {
          campaignMap[group.campId].scheduleItems.push(group);
        });

        Object.values(campaignMap).forEach(camp => {
          camp.scheduleItems.sort((a, b) => new Date(a.reserveDate) - new Date(b.reserveDate));
          camp.records.influencer.forEach((r, i) => r.seq = i + 1);
          camp.records.experience.forEach((r, i) => r.seq = i + 1);
          camp.records.press.forEach((r, i) => r.seq = i + 1);
        });

        setData({ campaigns: Object.values(campaignMap).filter(c => c.scheduleItems.length > 0 || c.records.influencer.length > 0 || c.records.experience.length > 0 || c.records.press.length > 0) });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [partnerName]);

  // 파트너사에 따른 브라우저 탭 및 파비콘 동적 변경 (화이트라벨링)
  useEffect(() => {
    if (partnerName && partnerName !== '탐코리아' && partnerName.toUpperCase() !== 'TAMKOREA') {
      document.title = `${partnerName} - 캠페인 성과 대시보드`;
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    } else {
      document.title = `탐코리아 - 캠페인 성과 대시보드`;
    }
  }, [partnerName]);

  if (loading) return (
    <div className="schedule-page flex items-center justify-center">
      <div style={{ color:'#a855f7', fontSize:'1.2rem', fontWeight:'600' }}>고객사 대시보드를 불러오는 중입니다...</div>
    </div>
  );
  
  if (error) return (
    <div className="schedule-page flex items-center justify-center">
      <div style={{ color:'#ef4444', background:'rgba(239,68,68,0.1)', padding:'20px', borderRadius:'12px' }}>오류 발생: {error}</div>
    </div>
  );

  return (
    <div className="schedule-page" style={{ paddingBottom: '100px' }}>
      {data.campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-20">
          <h1 className="schedule-title text-center mb-4">{partnerName}</h1>
          <p style={{ color:'#6b7280' }}>등록된 고객사 캠페인 실적이 없습니다.</p>
        </div>
      ) : (
        <div className="schedule-container">
          <div className="mb-14 pb-10 border-b border-[rgba(255,255,255,0.05)] relative flex flex-col items-center justify-center w-full" style={{ textAlign: 'center', width: '100%' }}>
             {/* 파트너명 (고급스러운 은은한 퍼플-실버 톤 적용 및 섀도우) */}
             <h2 style={{ color: '#e9d5ff', fontSize: '2.5rem', fontWeight: '800', margin: '0 0 8px 0', letterSpacing: '-0.02em', textShadow: '0 4px 20px rgba(168,85,247,0.2)', textAlign: 'center', width: '100%' }}>
               {partnerName}
             </h2>
             
             {/* 서브 타이틀 */}
             <p style={{ color: '#9ca3af', fontSize: '0.95rem', margin: 0, textAlign: 'center', width: '100%' }}>
               통합 캠페인 성과 대시보드
             </p>
          </div>
          {data.campaigns.map(camp => (
            <CampaignDashboardBlock key={camp.id} camp={camp} partnerName={partnerName} />
          ))}
        </div>
      )}
    </div>
  );
}
