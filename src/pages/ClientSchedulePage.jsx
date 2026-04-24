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
        if (!res.ok) throw new Error('데이터를 불러오는데 실패했습니다.');
        const result = await res.json();
        
        // 예약일시 기준 오름차순 정렬
        if (result.scheduleItems) {
          result.scheduleItems.sort((a, b) => new Date(a.reserveDate) - new Date(b.reserveDate));
        }

        setData(result);
        
        // 데이터가 있으면 가장 첫 예약일이 포함된 달로 캘린더 이동 (옵션)
        if (result.scheduleItems && result.scheduleItems.length > 0) {
           const firstEventDate = new Date(result.scheduleItems[0].reserveDate);
           if (!isNaN(firstEventDate.getTime())) {
               setCurrentDate(firstEventDate);
           }
        }
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
    if (status.includes('완료')) return <span className="status-dot status-done" title={status}></span>;
    if (status.includes('확정')) return <span className="status-dot status-resv" title={status}></span>;
    if (status.includes('취소')) return <span className="status-dot status-cancel" title={status}></span>;
    return <span className="status-dot status-wait" title={status}></span>;
  };

  const getTypeClass = (type) => {
    if (type.includes('인플')) return 'event-infl';
    if (type.includes('기자')) return 'event-press';
    return 'event-exp';
  };

  // 에러 화면
  if (error) {
    return (
      <div className="schedule-page flex items-center justify-center">
        <div className="text-center bg-[#1e1e2d] p-8 rounded-2xl max-w-md w-full border border-red-500/30">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">접근 오류</h2>
          <p className="text-[#a09eb5]">{error}</p>
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

  const { stats, campaignName, brandName, branchName, month } = data;
  
  // 퍼센티지 계산 (방어 로직 포함)
  const calcPercent = (done, target) => {
    if (!target || target === 0) return 0;
    const p = Math.round((done / target) * 100);
    return p > 100 ? 100 : p; // 100% 초과 방지
  };

  const inflPercent = calcPercent(stats.infl_done, stats.infl_target);
  const expPercent = calcPercent(stats.exp_done, stats.exp_target);
  const pressPercent = calcPercent(stats.press_done, stats.press_target);

  const displayName = brandName && branchName ? `${brandName} ${branchName}` : campaignName;

  return (
    <div className="schedule-page">
      {/* 1. Header Section */}
      <header className="schedule-header">
        <h1 className="schedule-title">{displayName}</h1>
        <p className="schedule-subtitle">{month} 캠페인 현황 대시보드</p>
      </header>

      <main className="schedule-container">
        {/* 2. KPI Summary Cards */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-title">인플루언서 진행</span>
              <Users className="w-5 h-5 kpi-icon" />
            </div>
            <div className="kpi-numbers">
              <span className="kpi-current">{stats.infl_done}</span>
              <span className="kpi-target">/ {stats.infl_target}건</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${inflPercent}%` }}></div>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-title">체험단 진행</span>
              <Camera className="w-5 h-5 kpi-icon text-blue-400" style={{ background: 'rgba(59, 130, 246, 0.1)' }} />
            </div>
            <div className="kpi-numbers">
              <span className="kpi-current text-blue-400">{stats.exp_done}</span>
              <span className="kpi-target">/ {stats.exp_target}건</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ background: 'linear-gradient(90deg, #3b82f6, #93c5fd)', width: `${expPercent}%` }}></div>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-title">기자단 진행</span>
              <Newspaper className="w-5 h-5 kpi-icon text-emerald-400" style={{ background: 'rgba(16, 185, 129, 0.1)' }} />
            </div>
            <div className="kpi-numbers">
              <span className="kpi-current text-emerald-400">{stats.press_done}</span>
              <span className="kpi-target">/ {stats.press_target}건</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ background: 'linear-gradient(90deg, #10b981, #6ee7b7)', width: `${pressPercent}%` }}></div>
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
            <List className="w-4 h-4" /> 전체 리스트
          </button>
        </div>

        {/* 4. Main Content (Calendar / List) */}
        {viewMode === 'calendar' ? (
          <div className="calendar-container">
            <div className="calendar-header">
              <button onClick={prevMonth} className="calendar-nav-btn"><ChevronLeft className="w-5 h-5" /></button>
              <h2 className="calendar-month-title">
                {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
              </h2>
              <button onClick={nextMonth} className="calendar-nav-btn"><ChevronRight className="w-5 h-5" /></button>
            </div>
            
            <div className="calendar-grid">
              {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                <div key={day} className="calendar-day-name">{day}</div>
              ))}
              
              {calendarDays.map((dayObj, idx) => {
                const events = getEventsForDate(dayObj.date);
                const isToday = new Date().toDateString() === dayObj.date.toDateString();
                
                return (
                  <div 
                    key={idx} 
                    className={`calendar-cell ${!dayObj.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
                  >
                    <span className="calendar-date-num">{dayObj.date.getDate()}</span>
                    <div className="event-list flex flex-col gap-1">
                      {events.map((ev, i) => (
                        <div 
                          key={i} 
                          className={`event-badge ${getTypeClass(ev.type)} flex flex-col`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(ev);
                          }}
                        >
                          <div className="flex items-center gap-1 font-medium text-xs mb-0.5">
                            {getStatusDot(ev.status)} {ev.type}
                          </div>
                          <div className="flex items-center justify-between opacity-90 text-[10px]">
                            <span>{new Date(ev.reserveDate).getHours()}:{String(new Date(ev.reserveDate).getMinutes()).padStart(2, '0')}</span>
                            <span>{ev.totalPax ? `${ev.totalPax}명` : ''}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="calendar-container">
             <h3 className="text-xl font-bold mb-6 text-white">전체 예약 및 실적 리스트</h3>
             {data.scheduleItems && data.scheduleItems.length > 0 ? (
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                   <thead>
                     <tr className="border-b border-white/10 text-[#a09eb5]">
                       <th className="py-3 px-4 font-medium">예약일시</th>
                       <th className="py-3 px-4 font-medium">진행상태</th>
                       <th className="py-3 px-4 font-medium">유형</th>
                       <th className="py-3 px-4 font-medium">이름(ID)</th>
                       <th className="py-3 px-4 font-medium">결과물</th>
                     </tr>
                   </thead>
                   <tbody>
                     {data.scheduleItems.map((item, idx) => (
                       <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                         <td className="py-3 px-4 text-sm">
                           {item.reserveDate ? new Date(item.reserveDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '미정'}
                         </td>
                         <td className="py-3 px-4">
                           <span className="flex items-center text-sm">
                             {getStatusDot(item.status)} {item.status}
                           </span>
                         </td>
                         <td className="py-3 px-4 text-sm text-[#a09eb5]">{item.type}</td>
                         <td className="py-3 px-4 font-medium">{item.displayId}</td>
                         <td className="py-3 px-4">
                           {item.xhsResult ? (
                             <a href={item.xhsResult} target="_blank" rel="noopener noreferrer" className="text-var-revu-purple hover:underline flex items-center gap-1 text-sm">
                               확인 <ExternalLink className="w-3 h-3" />
                             </a>
                           ) : (
                             <span className="text-white/20 text-sm">-</span>
                           )}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             ) : (
               <div className="text-center py-12 text-[#a09eb5]">등록된 일정이 없습니다.</div>
             )}
          </div>
        )}

        {/* 5. Client Feedback Area (고객사 소통 창구) */}
        <div className="feedback-section">
          <div className="feedback-header">
            <MessageSquare className="w-6 h-6 text-var-revu-purple" />
            <h3 className="feedback-title">운영팀에 메시지 남기기</h3>
          </div>
          <p className="text-[#a09eb5] text-sm mb-4">
            일정 변경 요청이나 특별한 지시사항이 있다면 남겨주세요. 실시간으로 담당자에게 전달됩니다.
          </p>
          <textarea 
            className="feedback-textarea" 
            placeholder="메모를 입력해주세요..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          ></textarea>
          <div className="flex justify-end">
            <button 
              className="feedback-submit" 
              onClick={handleFeedbackSubmit}
              disabled={!feedback.trim() || feedbackSent}
            >
              {feedbackSent ? '전송 완료!' : <><Send className="w-4 h-4" /> 전송하기</>}
            </button>
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
                {getStatusDot(selectedEvent.status)} {selectedEvent.type} 상세정보
              </h3>
            </div>
            
            <div className="modal-body">
              <div className="detail-row">
                <span className="detail-label"><CalendarIcon className="w-4 h-4" /> 예약 일시</span>
                <span className="detail-value text-white font-medium">
                  {new Date(selectedEvent.reserveDate).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              
              <div className="detail-row">
                <span className="detail-label"><Users className="w-4 h-4" /> 방문 인원</span>
                <span className="detail-value">{selectedEvent.totalPax ? `${selectedEvent.totalPax}명` : '미정'}</span>
              </div>
              
              <div className="detail-row">
                <span className="detail-label"><User className="w-4 h-4" /> 방문자 ID (닉네임)</span>
                <span className="detail-value">{selectedEvent.displayId}</span>
              </div>
              
              <div className="detail-row">
                <span className="detail-label"><Info className="w-4 h-4" /> 예약 메시지 / 메모</span>
                <span className="detail-value memo-box">
                  {selectedEvent.memo ? selectedEvent.memo : '등록된 메모가 없습니다.'}
                </span>
              </div>

              {selectedEvent.xhsResult && (
                <div className="detail-row mt-4 pt-4 border-t border-white/10">
                  <span className="detail-label text-var-revu-purple">완료 결과물</span>
                  <a href={selectedEvent.xhsResult} target="_blank" rel="noopener noreferrer" className="result-link">
                    확인하기 <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
