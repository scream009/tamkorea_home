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
  MessageSquare,
  Send,
  ExternalLink,
  AlertCircle,
  X,
  User,
  Info
} from 'lucide-react';
import './ClientSchedulePage.css';
import './ClientReportPage.css';

// 서브 컴포넌트
const TypeBadge = ({ type }) => {
  const map = { influencer: ['📣 인플루언서','infl'], experience: ['🍽️ 체험단','exp'], press: ['📰 기자단','press'] };
  const [label, cls] = map[type] || ['기타','exp'];
  return <span className={`type-badge ${cls}`}>{label}</span>;
};

const LinkBtn = ({ href, label }) =>
  href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link-btn">🔗 {label}</a>
  ) : (
    <span className="link-pending">진행 중</span>
  );

// 날짜 유틸리티
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

export default function ClientSchedulePage() {
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get('campaignId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'
  
  // 캘린더 기준 월 (초기값: 현재)
  const [currentDate, setCurrentDate] = useState(new Date());

  // 피드백 상태
  const [feedback, setFeedback] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  // 팝업(모달) 상태
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    if (!campaignId) {
      setError('올바른 접근 링크가 아닙니다. (캠페인 ID 누락)');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/client-schedule?campaignId=${campaignId}`);
        if (!res.ok) {
          let errorMsg = '데이터를 불러오는데 실패했습니다.';
          try {
            const errData = await res.json();
            if (errData.error) errorMsg = `API 오류: ${errData.error}`;
          } catch (e) {
            errorMsg = `네트워크/서버 오류 (${res.status})`;
          }
          throw new Error(errorMsg);
        }
        const result = await res.json();
        
        // 예약일시 기준 오름차순 정렬
        if (result.scheduleItems) {
          result.scheduleItems.sort((a, b) => new Date(a.reserveDate) - new Date(b.reserveDate));
        }

        setData(result);
        
        // 초기 로드 시 달력은 '오늘(이번 달)' 기준으로 표출 (별도 이동 안함)
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [campaignId]);

  // 캘린더 네비게이션
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  // 캘린더 그리드 생성 로직
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = [];
    
    // 이전 달 빈칸
    const prevMonthDays = getDaysInMonth(year, month - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false
      });
    }
    
    // 현재 달
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }
    
    // 다음 달 빈칸 (총 42칸 유지)
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }
    
    return days;
  }, [currentDate]);

  // 해당 날짜의 이벤트 필터링
  const getEventsForDate = (dateObj) => {
    if (!data || !data.scheduleItems) return [];
    return data.scheduleItems.filter(item => {
      if (!item.reserveDate) return false;
      const d = new Date(item.reserveDate);
      return d.getFullYear() === dateObj.getFullYear() &&
             d.getMonth() === dateObj.getMonth() &&
             d.getDate() === dateObj.getDate();
    }).sort((a, b) => {
      const isInflA = formatType(a.type).includes('인플');
      const isInflB = formatType(b.type).includes('인플');
      if (isInflA && !isInflB) return -1;
      if (!isInflA && isInflB) return 1;
      return new Date(a.reserveDate) - new Date(b.reserveDate);
    });
  };

  const handleFeedbackSubmit = async () => {
    if (!feedback.trim()) return;
    // 임시: 서버 연동 전 더미 처리
    // 실제 운영 시 api/submit-contact 등으로 POST 요청
    setFeedbackSent(true);
    setTimeout(() => {
      setFeedback('');
      setFeedbackSent(false);
    }, 3000);
  };

  // 진행 상태 렌더러
  const getStatusDot = (status) => {
    if (!status) return <span className="status-dot status-wait" title="진행전"></span>;
    if (status.includes('완료')) return <span className="status-dot status-done" title={status}></span>;
    if (status.includes('확정')) return <span className="status-dot status-resv" title={status}></span>;
    if (status.includes('취소')) return <span className="status-dot status-cancel" title={status}></span>;
    return <span className="status-dot status-wait" title={status}></span>;
  };

  const getTypeClass = (type) => {
    if (!type) return 'event-exp';
    if (type.includes('인플')) return 'event-infl';
    if (type.includes('기자')) return 'event-press';
    return 'event-exp';
  };

  const formatType = (type) => {
    if (!type) return '';
    return String(type).replace(/.*(?:->|=>|→|➔|➡|▶|>)\s*/, '').trim();
  };

  const generateDynamicMemo = (event, campaignName, brandName, branchName) => {
    const typeStr = formatType(event.type);
    const typeText = typeStr ? `${typeStr} 예약` : '예약';
    
    const ids = event.displayIds?.length > 0 ? event.displayIds.join(', ') : event.displayId;
    
    let dateStr = '미정';
    if (!isNaN(new Date(event.reserveDate).getTime())) {
      const d = new Date(event.reserveDate);
      const days = ['(일)', '(월)', '(화)', '(수)', '(목)', '(금)', '(토)'];
      dateStr = `${d.getMonth() + 1}/${d.getDate()}${days[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    const paxStr = event.totalPax ? `${event.totalPax}명` : '미정';
    
    // SAFE HANDLING: event.memo가 배열일 수 있으므로 문자열로 강제 변환 후 trim
    const safeMemo = Array.isArray(event.memo) ? event.memo.join(', ') : String(event.memo || '');
    const specialNote = safeMemo.trim() ? ` (${safeMemo.trim()})` : '';

    // SAFE HANDLING: 건수도 배열일 수 있으므로 안전하게 처리
    const safeXhsCount = Array.isArray(event.xhsCount) ? event.xhsCount[0] : (event.xhsCount || 1);
    const safeDpCount = Array.isArray(event.dpCount) ? event.dpCount[0] : (event.dpCount || 0);

    let contentStr = `샤오홍슈 ${safeXhsCount}건`;
    if (Number(safeDpCount) > 0) {
      contentStr += `, 따중리뷰 ${safeDpCount}건`;
    }

    const brandLabel = brandName && branchName ? `${brandName} ${branchName}` : (brandName || campaignName || '캠페인');

    return `【${brandLabel}】 ${typeText}입니다.\n\n- 닉네임: ${ids}\n- 일정: ${dateStr}\n- 인원: ${paxStr}${specialNote}\n- 내용: ${contentStr}\n\n* 방문시간은 약간의 변동이 있을 수 있습니다.`;
  };

  // 에러 화면
  if (error) {
    return (
      <div className="schedule-page flex items-center justify-center">
        <div className="text-center bg-[var(--surface2)] p-8 rounded-2xl max-w-md w-full border border-red-500/30">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">접근 오류</h2>
          <p className="text-[var(--muted)]">{error}</p>
          <div className="mt-6 text-xs text-[var(--muted)] text-left bg-[var(--surface)] p-3 rounded-lg">
            <strong>💡 해결 방법:</strong><br />
            1. URL 뒤에 <code className="text-white">?campaignId=rec...</code> 파라미터가 제대로 붙어있는지 확인하세요.<br />
            2. 현재 로컬 환경이라면 터미널에서 <code className="text-white">npm run dev</code> 대신 <code className="text-white">vercel dev</code>로 실행해야 API가 정상 작동합니다.
          </div>
        </div>
      </div>
    );
  }

  // 스켈레톤 로딩
  if (loading || !data) {
    return (
      <div className="schedule-page">
        <div className="schedule-header">
          <div className="skeleton-pulse h-10 w-64 mx-auto mb-4"></div>
          <div className="skeleton-pulse h-4 w-48 mx-auto"></div>
        </div>
        <div className="schedule-container">
          <div className="kpi-grid">
            {[1,2,3].map(i => <div key={i} className="skeleton-pulse h-32 w-full rounded-2xl"></div>)}
          </div>
          <div className="skeleton-pulse h-96 w-full rounded-2xl mt-8"></div>
        </div>
      </div>
    );
  }

  const { stats, campaignName, brandName, branchName, month, records, partnerName = 'TAMKOREA' } = data;
  
  const displayName = brandName && branchName ? `${brandName} ${branchName}` : campaignName;

  const hasInfl  = records?.influencer?.length > 0;
  const hasExp   = records?.experience?.length > 0;
  const hasPress = records?.press?.length > 0;

  const handleDownloadCSV = () => {
    if (!records) return;
    
    const headers = ['구분', 'No.', '닉네임(ID)', '샤오홍슈 링크', '따종디엔핑 링크', '진행상태'];
    const rows = [];
    
    const escape = (text) => `"${(text || '').toString().replace(/"/g, '""')}"`;
    
    const addRows = (categoryName, items) => {
      if (!items) return;
      items.forEach(item => {
        const row = [
          escape(categoryName),
          item.seq,
          escape(item.displayId || item.displayIds?.join(', ')),
          escape(item.xhsResult || (item.xhsResults ? item.xhsResults.join(', ') : '')),
          escape(item.dpResult),
          escape(item.status)
        ];
        rows.push(row.join(','));
      });
    };

    addRows('인플루언서', records.influencer);
    addRows('체험단', records.experience);
    addRows('기자단', records.press);

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const safeBrand = (brandName || '캠페인').replace(/\s+/g, '_');
    const safeMonth = (month || '').replace(/\s+/g, '');
    const filename = `${safeBrand}_${safeMonth}_실적보고서.csv`;
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="schedule-page">
      {/* 1. Header Section */}
      <header className="schedule-header flex flex-col items-center mb-10">
        <div className="inline-block bg-[var(--purple-dim)] text-[var(--purple-light)] px-5 py-2 rounded-full text-base font-bold mb-4 tracking-wider shadow-[0_0_15px_rgba(168,85,247,0.3)] border border-[var(--purple-light)]/20">
          {month}
        </div>
        <h1 className="schedule-title text-center">{displayName}</h1>
        <p className="schedule-subtitle text-center mt-2">캠페인 현황 대시보드</p>
      </header>

      <main className="schedule-container">
        {/* 2. KPI Summary Cards */}
        <div className="kpi-grid">
          <div className="kpi-card purple">
            <div className="kpi-header">
              <span className="kpi-title">인플루언서 진행</span>
              <Users className="w-5 h-5 kpi-icon" />
            </div>
            <div className="kpi-numbers">
              <span className="kpi-current">{stats.infl_done}</span>
              <span className="kpi-target">건</span>
            </div>
          </div>

          <div className="kpi-card blue">
            <div className="kpi-header">
              <span className="kpi-title">체험단 진행</span>
              <Camera className="w-5 h-5 kpi-icon" />
            </div>
            <div className="kpi-numbers">
              <span className="kpi-current">{stats.exp_done}</span>
              <span className="kpi-target">건</span>
            </div>
          </div>

          <div className="kpi-card green">
            <div className="kpi-header">
              <span className="kpi-title">기자단 진행</span>
              <Newspaper className="w-5 h-5 kpi-icon" />
            </div>
            <div className="kpi-numbers">
              <span className="kpi-current">{stats.press_done}</span>
              <span className="kpi-target">건</span>
            </div>
          </div>
        </div>

        {/* 3. View Toggles */}
        <div className="view-tabs">
          <button 
            className={`view-tab ${viewMode === 'calendar' ? 'active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            <CalendarIcon className="w-4 h-4" /> 달력 뷰
          </button>
          <button 
            className={`view-tab ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            <List className="w-4 h-4" /> 리스트 뷰
          </button>
        </div>

        {/* 4. Main Content (Calendar / List) */}
        {viewMode === 'calendar' ? (
          <div className="section">
            <div className="section-header">
              <div className="section-title text-white font-extrabold text-[1.4rem] tracking-tight drop-shadow-md">📅 예약 현황 달력</div>
              <div className="section-badge">{month}</div>
            </div>
            <div className="cal-wrap">
              <div className="cal-nav">
                <div className="cal-month">
                  {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
                </div>
                <div className="cal-btns">
                  <button onClick={prevMonth} className="cal-btn">‹ 이전</button>
                  <button onClick={() => setCurrentDate(new Date())} className="cal-btn today">오늘</button>
                  <button onClick={nextMonth} className="cal-btn">다음 ›</button>
                </div>
              </div>
              
              <div className="cal-grid">
                {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                  <div key={day} className="cal-hdr">{day}</div>
                ))}
                
                {calendarDays.map((dayObj, idx) => {
                  const events = getEventsForDate(dayObj.date);
                  const isToday = new Date().toDateString() === dayObj.date.toDateString();
                  
                  return (
                    <div 
                      key={idx} 
                      className={`cal-cell ${!dayObj.isCurrentMonth ? 'empty' : ''} ${isToday ? 'today-cell' : ''}`}
                    >
                      {dayObj.isCurrentMonth && (
                        <>
                          <div className="cell-num">{dayObj.date.getDate()}</div>
                          <div className="event-list flex flex-col gap-[2px]">
                            {events.map((ev, i) => {
                              const displayType = formatType(ev.type);
                              return (
                                <div 
                                  key={i} 
                                  className={`event-badge ${getTypeClass(ev.type)}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEvent(ev);
                                  }}
                                >
                                  <div className="flex items-center gap-1">
                                    {getStatusDot(ev.status)} {displayType} {ev.totalPax ? `(${ev.totalPax}명)` : ''}
                                  </div>
                                </div>
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
          <div className="section mt-8">
            <div className="cr-wrap" style={{ minHeight: 'auto', padding: 0 }}>
              <div className="report-paper">
                <header className="report-header" style={{ marginBottom: '30px' }}>
                  <div>
                    <h1 className="report-title">{brandName}</h1>
                    <p className="report-sub">{branchName} · {month} 실적 보고서</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
                    <div className="gravity-logo-accent" style={{ margin: 0 }}>
                      {partnerName}<br />
                      <span style={{ fontSize:'0.65rem', color:'#9ca3af' }}>PERFORMANCE REPORT</span>
                    </div>
                    <button 
                      onClick={handleDownloadCSV}
                      style={{
                        background: 'rgba(168, 85, 247, 0.1)',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        color: '#d8b4fe',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s',
                        boxShadow: '0 0 10px rgba(168, 85, 247, 0.1)'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.2)'; e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)'; e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)'; }}
                    >
                      📥 CSV 다운로드
                    </button>
                  </div>
                </header>

                {hasInfl && (
                  <section className="category-section">
                    <h2 className="category-title">
                      <TypeBadge type="influencer" />
                    </h2>
                    <div className="premium-table-wrapper">
                      <table className="premium-table">
                        <thead><tr>
                          <th style={{width:'6%'}}>No.</th>
                          <th style={{width:'38%'}}>방문자 ID</th>
                          <th style={{width:'56%'}}>샤오홍슈 결과물</th>
                        </tr></thead>
                        <tbody>
                          {records.influencer.map(item => (
                            <tr key={item.id} className={!item.xhsResult ? 'row-pending' : ''}>
                              <td>{item.seq}</td>
                              <td><span className="id-tag">{item.displayId || '-'}</span></td>
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
                    <h2 className="category-title">
                      <TypeBadge type="experience" />
                    </h2>
                    <div className="premium-table-wrapper">
                      <table className="premium-table">
                        <thead><tr>
                          <th style={{width:'6%'}}>No.</th>
                          <th style={{width:'28%'}}>방문자 ID</th>
                          <th style={{width:'33%'}}>샤오홍슈 결과물</th>
                          <th style={{width:'33%'}}>따종디엔핑</th>
                        </tr></thead>
                        <tbody>
                          {records.experience.map(item => (
                            <tr key={item.id} className={!item.xhsResult && !item.dpResult ? 'row-pending' : ''}>
                              <td>{item.seq}</td>
                              <td><span className="id-tag">{item.displayId || '-'}</span></td>
                              <td><LinkBtn href={item.xhsResult} label="샤오홍슈" /></td>
                              <td><LinkBtn href={item.dpResult}  label="따종디엔핑" /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {hasPress && (
                  <section className="category-section">
                    <h2 className="category-title">
                      <TypeBadge type="press" />
                    </h2>
                    <div className="press-grid">
                      {records.press.map(item => (
                        <div key={item.id} className={`press-card ${!item.xhsResult ? 'press-pending' : ''}`}>
                          <span className="press-seq">{item.seq}</span>
                          {item.xhsResult ? (
                            <a href={item.xhsResult} target="_blank" rel="noopener noreferrer" className="press-link">
                              포스팅 확인 →
                            </a>
                          ) : (
                            <span className="press-wait">진행 중</span>
                          )}
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

        {/* 5. Client Feedback Area (고객사 소통 창구) */}
        <div className="section">
          <div className="section-header">
            <div className="section-title">💬 문의 / 메모</div>
            <div className="section-badge" style={{background: 'var(--purple-dim)', color: 'var(--purple-light)'}}>운영팀 직접 전달</div>
          </div>
          <div className="memo-wrap">
            <div className="memo-intro">
              💡 아래에 입력하신 내용은 탐코리아 담당 매니저에게 즉시 전달됩니다.
            </div>
            <div className="memo-form">
              <textarea 
                className="memo-input" 
                placeholder="일정 변경 요청이나 특별한 지시사항이 있다면 남겨주세요."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              ></textarea>
              <div className="flex justify-end">
                <button 
                  className="memo-submit" 
                  onClick={handleFeedbackSubmit}
                  disabled={!feedback.trim() || feedbackSent}
                >
                  {feedbackSent ? '전송 완료!' : '전송하기 →'}
                </button>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="event-modal-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="event-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="event-modal-close" onClick={() => setSelectedEvent(null)}>
              <X className="w-5 h-5" />
            </button>
            
            <div className={`modal-header ${getTypeClass(selectedEvent.type)}`}>
              <h3 className="modal-title flex items-center gap-2">
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
                  {generateDynamicMemo(selectedEvent, campaignName, brandName, branchName)}
                </span>
              </div>

              {selectedEvent.xhsResults && selectedEvent.xhsResults.length > 0 && (
                <div className="detail-row mt-4 pt-4 border-t border-white/10">
                  <span className="detail-label" style={{color: 'var(--purple-light)'}}>완료 결과물</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedEvent.xhsResults.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="result-link ml-0">
                        확인하기 {i+1} <ExternalLink className="w-4 h-4" />
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
}
