import React, { useState, useEffect, useMemo } from 'react';
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

  const getEventsForDate = (dateObj) => {
    return camp.scheduleItems.filter(item => {
      if (!item.reserveDate) return false;
      const d = new Date(item.reserveDate);
      return d.getFullYear() === dateObj.getFullYear() && d.getMonth() === dateObj.getMonth() && d.getDate() === dateObj.getDate();
    });
  };

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

  const hasInfl = camp.records.influencer.length > 0;
  const hasExp = camp.records.experience.length > 0;
  const hasPress = camp.records.press.length > 0;

  return (
    <div className="campaign-dashboard-block" style={{ marginBottom: '80px', paddingBottom: '40px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
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
      <div className="view-tabs">
        <button className={`view-tab ${viewMode === 'calendar' ? 'active' : ''}`} onClick={() => setViewMode('calendar')}>
          <CalendarIcon className="w-4 h-4" /> 달력 뷰
        </button>
        <button className={`view-tab ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
          <List className="w-4 h-4" /> 리스트 뷰
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
                        <div className="event-list flex flex-col gap-[2px]">
                          {events.map((ev, i) => (
                            <div key={i} className={`event-badge ${getTypeClass(ev.type)}`} onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}>
                              <div className="flex items-center gap-1">
                                {getStatusDot(ev.status)} {formatType(ev.type)} {ev.totalPax ? `(${ev.totalPax}명)` : ''}
                              </div>
                            </div>
                          ))}
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

      {/* Event Modal */}
      {selectedEvent && (
        <div className="event-modal-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="event-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="event-modal-close" onClick={() => setSelectedEvent(null)}><X className="w-5 h-5" /></button>
            <div className={`modal-header ${getTypeClass(selectedEvent.type)}`}>
              <h3 className="modal-title flex items-center gap-2">{getStatusDot(selectedEvent.status)} {formatType(selectedEvent.type)}</h3>
            </div>
            <div className="modal-body">
              <div className="detail-row"><span className="detail-label"><CalendarIcon className="w-4 h-4" /> 일시</span><span className="detail-value text-white font-medium">{new Date(selectedEvent.reserveDate).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
              <div className="detail-row"><span className="detail-label"><Users className="w-4 h-4" /> 인원</span><span className="detail-value">{selectedEvent.totalPax ? `${selectedEvent.totalPax}명` : '미정'}</span></div>
              <div className="detail-row"><span className="detail-label"><User className="w-4 h-4" /> 닉네임</span><span className="detail-value">{selectedEvent.displayIds?.length > 0 ? selectedEvent.displayIds.join(', ') : selectedEvent.displayId}</span></div>
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
            infl_done: cf['인플_실적'] || cf['# 인플_실적'] || 0,
            exp_done:  cf['체험_실적'] || cf['# 세팅_실적'] || cf['# 체험_실적'] || 0,
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

          if (type.includes('인플')) camp.records.influencer.push(item);
          else if (type === '기자' || type === '기자단') camp.records.press.push(item);
          else camp.records.experience.push(item);
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
          <div className="text-center mb-12 opacity-50">
             <h2 className="text-2xl font-bold tracking-widest">{partnerName}</h2>
             <p className="text-sm">PARTNER DASHBOARD</p>
          </div>
          {data.campaigns.map(camp => (
            <CampaignDashboardBlock key={camp.id} camp={camp} partnerName={partnerName} />
          ))}
        </div>
      )}
    </div>
  );
}
