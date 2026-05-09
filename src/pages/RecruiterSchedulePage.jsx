import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  List,
  Camera,
  X,
  User,
  Users,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link as LinkIcon,
  FileSpreadsheet,
} from 'lucide-react';
import './ClientSchedulePage.css';
import './RecruiterSchedulePage.css';

const VALID_IDS = new Set(['HH', 'LH', 'AN', 'FB']);
const RECRUITER_LABEL = {
  HH: 'HH 담당자',
  LH: 'LH 담당자',
  AN: 'AN 담당자',
  FB: 'FB 담당자',
};

const getDaysInMonth     = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

const isHttpUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(s.trim());

// 1,000 단위 쉼표 포맷 — 숫자가 아니면 원본 반환
const formatPal = (pal) => {
  if (pal === '' || pal == null) return '-';
  const n = Number(pal);
  return Number.isFinite(n) ? n.toLocaleString('ko-KR') : String(pal);
};

// 결과물 셀 렌더러 (XHS / DP / DY 공통)
// emphasizeMissing=true 면 빈 값을 빨간 '미제출' 뱃지로 강조 (XHS 전용)
const ResultCell = ({ value, label, emphasizeMissing }) => {
  if (!value) {
    return emphasizeMissing
      ? <span className="mgr-result-missing">미제출</span>
      : <span className="mgr-result-pending">-</span>;
  }
  if (isHttpUrl(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="mgr-result-link">
        <ExternalLink className="w-3 h-3" /> {label}
      </a>
    );
  }
  return <span className="mgr-result-text" title={value}>{value}</span>;
};

// "2026. 4월" → Date(2026, 3, 1)
function parseAirtableMonth(s) {
  if (!s) return null;
  const m = /^(\d{4})\.\s*(\d+)월$/.exec(s);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1);
}

function dateToMonthParam(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function RecruiterSchedulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const recruiterId = searchParams.get('id');
  const monthParam = searchParams.get('month') || '2026-04';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [viewMode, setViewMode] = useState('calendar');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const modalCloseBtnRef = useRef(null);

  // 모달 ESC + scroll lock + 자동 포커스
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

  // 데이터 로드
  useEffect(() => {
    if (!recruiterId || !VALID_IDS.has(recruiterId)) {
      setError('담당자 ID가 올바르지 않습니다. (HH / LH / AN / FB 중 하나)');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/recruiter-schedule?id=${recruiterId}&month=${monthParam}`);
        if (!res.ok) {
          let errorMsg = '데이터를 불러오는데 실패했습니다.';
          try {
            const errData = await res.json();
            if (errData.error) errorMsg = `API 오류: ${errData.error}`;
          } catch {
            errorMsg = `네트워크/서버 오류 (${res.status})`;
          }
          throw new Error(errorMsg);
        }
        const result = await res.json();
        if (result.scheduleItems) {
          result.scheduleItems.sort((a, b) => new Date(a.reserveDate) - new Date(b.reserveDate));
        }
        setData(result);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [recruiterId, monthParam]);

  // 표시 월
  const displayMonth = useMemo(() => parseAirtableMonth(data?.month) || new Date(), [data]);

  // 캘린더 그리드
  const calendarDays = useMemo(() => {
    const year = displayMonth.getFullYear();
    const month = displayMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const days = [];
    const prevMonthDays = getDaysInMonth(year, month - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    return days;
  }, [displayMonth]);

  // 이벤트 인덱싱
  const eventsByDate = useMemo(() => {
    const map = new Map();
    if (!data?.scheduleItems) return map;
    for (const item of data.scheduleItems) {
      if (!item.reserveDate) continue;
      const d = new Date(item.reserveDate);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    for (const events of map.values()) {
      events.sort((a, b) => new Date(a.reserveDate) - new Date(b.reserveDate));
    }
    return map;
  }, [data]);

  const getEventsForDate = useCallback((d) => {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    return eventsByDate.get(key) || [];
  }, [eventsByDate]);

  // 월 이동
  const changeMonth = (delta) => {
    const cur = parseAirtableMonth(data?.month) || new Date();
    const newDate = new Date(cur.getFullYear(), cur.getMonth() + delta, 1);
    setSearchParams({ id: recruiterId, month: dateToMonthParam(newDate) });
  };

  const getBucketDot = (bucket) => (
    <span className={`status-dot status-${bucket}`} />
  );

  // 에러 화면
  if (error) {
    return (
      <div className="schedule-page flex items-center justify-center">
        <div className="text-center bg-[var(--surface2)] p-8 rounded-2xl max-w-md w-full border border-red-500/30">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">접근 오류</h2>
          <p className="text-[var(--muted)]">{error}</p>
          <div className="mt-6 text-xs text-[var(--muted)] text-left bg-[var(--surface)] p-3 rounded-lg">
            <strong>사용법</strong><br />
            URL: <code className="text-white">/manager?id=HH&month=2026-04</code><br />
            가능한 ID: HH, LH, AN, FB<br />
            month 형식: YYYY-MM
          </div>
        </div>
      </div>
    );
  }

  // 로딩 스켈레톤
  if (loading || !data) {
    return (
      <div className="schedule-page">
        <div className="schedule-header">
          <div className="skeleton-pulse h-10 w-64 mx-auto mb-4" />
          <div className="skeleton-pulse h-4 w-48 mx-auto" />
        </div>
        <div className="schedule-container">
          <div className="kpi-grid kpi-grid--mgr">
            {[1, 2].map((i) => <div key={i} className="skeleton-pulse h-32 w-full rounded-2xl" />)}
          </div>
          <div className="skeleton-pulse h-96 w-full rounded-2xl mt-8" />
        </div>
      </div>
    );
  }

  const { stats, monthLabel } = data;
  const recruiterName = RECRUITER_LABEL[recruiterId] || recruiterId;
  const inProgressTotal = stats.completed + stats.inProgress;
  const issueTotal = stats.cancelled + stats.noShow;

  return (
    <div className="schedule-page">
      <header className="schedule-header flex flex-col items-center mb-10">
        <div className="inline-block bg-[var(--purple-dim)] text-[var(--purple-light)] px-5 py-2 rounded-full text-base font-bold mb-4 tracking-wider shadow-[0_0_15px_rgba(168,85,247,0.3)] border border-[var(--purple-light)]/20">
          {monthLabel}
        </div>
        <h1 className="schedule-title text-center">{recruiterName}</h1>
        <p className="schedule-subtitle text-center mt-2">체험단 섭외 일정 / 실적</p>
      </header>

      <main className="schedule-container">
        {/* KPI — 진행 / 주의 (옵션 c) */}
        <div className="kpi-grid kpi-grid--mgr">
          <div className="kpi-card mgr-card mgr-progress">
            <div className="kpi-header">
              <span className="kpi-title">진행 현황</span>
              <CheckCircle2 className="w-5 h-5 mgr-icon-ok" />
            </div>
            <div className="mgr-row">
              <div className="mgr-stat">
                <span className="mgr-stat-num mgr-num-done">{stats.completed}</span>
                <span className="mgr-stat-label">완료</span>
              </div>
              <div className="mgr-divider" />
              <div className="mgr-stat">
                <span className="mgr-stat-num mgr-num-prog">{stats.inProgress}</span>
                <span className="mgr-stat-label">진행중</span>
              </div>
            </div>
            <div className="mgr-footer">{inProgressTotal}건 진행</div>
          </div>

          <div className="kpi-card mgr-card mgr-issue">
            <div className="kpi-header">
              <span className="kpi-title">주의 사항</span>
              <AlertTriangle className="w-5 h-5 mgr-icon-warn" />
            </div>
            <div className="mgr-row">
              <div className="mgr-stat">
                <span className="mgr-stat-num mgr-num-cancel">{stats.cancelled}</span>
                <span className="mgr-stat-label">취소</span>
              </div>
              <div className="mgr-divider" />
              <div className="mgr-stat">
                <span className="mgr-stat-num mgr-num-noshow">{stats.noShow}</span>
                <span className="mgr-stat-label">노쇼</span>
              </div>
            </div>
            <div className="mgr-footer">{issueTotal}건 발생</div>
          </div>
        </div>

        {/* 뷰 토글 */}
        <div className="view-tabs">
          <button className={`view-tab ${viewMode === 'calendar' ? 'active' : ''}`} onClick={() => setViewMode('calendar')}>
            <CalendarIcon className="w-4 h-4" /> 달력 뷰
          </button>
          <button className={`view-tab ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
            <List className="w-4 h-4" /> 리스트 뷰
          </button>
        </div>

        {viewMode === 'calendar' ? (
          <div className="section">
            <div className="section-header">
              <div className="section-title section-title--lg">
                <CalendarIcon className="w-5 h-5" /> 체험단 일정
              </div>
              <div className="section-badge">{monthLabel}</div>
            </div>
            <div className="cal-wrap">
              <div className="cal-nav">
                <div className="cal-month">{monthLabel}</div>
                <div className="cal-btns">
                  <button onClick={() => changeMonth(-1)} className="cal-btn">‹ 이전</button>
                  <button onClick={() => changeMonth(1)} className="cal-btn">다음 ›</button>
                </div>
              </div>
              <div className="cal-grid mgr-cal-grid">
                {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                  <div key={day} className="cal-hdr">{day}</div>
                ))}
                {calendarDays.map((dayObj, idx) => {
                  const events = getEventsForDate(dayObj.date);
                  const today = new Date();
                  const isToday = today.toDateString() === dayObj.date.toDateString();
                  const hasEvents = events.length > 0;
                  return (
                    <div
                      key={idx}
                      className={`cal-cell mgr-cell${!dayObj.isCurrentMonth ? ' empty' : ''}${isToday ? ' today-cell' : ''}${hasEvents ? ' cal-cell--has-events' : ''}`}
                    >
                      {dayObj.isCurrentMonth && (
                        <>
                          <div className="cell-num">{dayObj.date.getDate()}</div>
                          <div className="event-list flex flex-col gap-[3px]">
                            {events.map((ev, i) => {
                              const statusStr = String(ev.status || '');
                              const isCancelled = statusStr.includes('취소');
                              const isNoShow = statusStr.includes('노쇼');
                              const isCompleted = ev.statusBucket === 'completed';
                              const d = ev.reserveDate ? new Date(ev.reserveDate) : null;
                              const time = (d && !Number.isNaN(d.getTime()))
                                ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                                : '';
                              const customer = `${ev.brandName || ''}${ev.branchName ? ' ' + ev.branchName : ''}`.trim() || '미정';
                              return (
                                <button
                                  type="button"
                                  key={i}
                                  className={`event-badge mgr-event-badge mgr-bucket-${ev.statusBucket || 'inProgress'}${(isCancelled || isNoShow) ? ' is-cancelled' : ''}`}
                                  aria-label={`${time} ${customer} ${ev.totalPax ? ev.totalPax + '명' : ''}${isCancelled ? ' 취소' : ''}${isNoShow ? ' 노쇼' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                                >
                                  <span className="ev-row">
                                    {time && <span className="ev-time">{time}</span>}
                                    <span className="ev-type mgr-customer" title={customer}>{customer}</span>
                                    {ev.totalPax ? <span className="ev-pax">({ev.totalPax}명)</span> : null}
                                    {isCancelled && <span className="ev-tag-cancel">취소</span>}
                                    {isNoShow    && <span className="ev-tag-noshow">노쇼</span>}
                                    {isCompleted && !isCancelled && !isNoShow && <span className="ev-tag-done">완료</span>}
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
          <div className="section">
            <div className="section-header">
              <div className="section-title section-title--lg">
                <List className="w-5 h-5" /> 체험단 전체 리스트
              </div>
              <div className="section-badge">{(data.records || []).length}건</div>
            </div>
            <div className="mgr-list-wrap">
              {!data.records || data.records.length === 0 ? (
                <div className="mgr-empty">이번 달 등록된 체험단 일정이 없습니다.</div>
              ) : (
                <div className="mgr-list-scroll">
                  <table className="mgr-list-table mgr-list-table--wide">
                    <thead>
                      <tr>
                        <th style={{ width: '12%' }}>일정</th>
                        <th style={{ width: '20%' }}>고객사</th>
                        <th style={{ width: '18%' }}>방문자 ID</th>
                        <th className="mgr-th-num" style={{ width: '8%' }}>PAL</th>
                        <th style={{ width: '14%' }}>샤오홍슈</th>
                        <th style={{ width: '12%' }}>따종디엔핑</th>
                        <th style={{ width: '8%' }}>DY</th>
                        <th style={{ width: '8%' }}>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.records.map((item, idx) => {
                        const d = item.reserveDate ? new Date(item.reserveDate) : null;
                        const dateStr = (d && !Number.isNaN(d.getTime()))
                          ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                          : '미정';
                        const customer = `${item.brandName || ''}${item.branchName ? ' ' + item.branchName : ''}`.trim() || '미정';
                        const bucket = item.statusBucket || 'inProgress';
                        // 진행중·완료 상태인데 XHS 결과물이 비어있으면 강조
                        // (취소·노쇼는 미제출이 정상이므로 제외)
                        const isXhsMissing = !item.xhsResult && bucket !== 'cancelled' && bucket !== 'noShow';
                        return (
                          <tr
                            key={idx}
                            className={`mgr-list-row mgr-bucket-row-${bucket}${isXhsMissing ? ' mgr-row-xhs-missing' : ''}`}
                            onClick={() => setSelectedEvent(item)}
                          >
                            <td className="mgr-list-date">{dateStr}</td>
                            <td className="mgr-list-customer">{customer}</td>
                            <td className="mgr-list-id-cell">
                              <span className="mgr-list-id">{item.displayId || '-'}</span>
                              {item.channelLink && (
                                <a
                                  href={item.channelLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mgr-list-channel"
                                  onClick={(e) => e.stopPropagation()}
                                  title="인플 채널 바로가기"
                                  aria-label="인플 채널 바로가기"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </td>
                            <td className="mgr-list-pal">{formatPal(item.pal)}</td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <ResultCell value={item.xhsResult} label="포스팅" emphasizeMissing={isXhsMissing} />
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <ResultCell value={item.dpResult} label="리뷰" />
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <ResultCell value={item.dyResult} label="DY" />
                            </td>
                            <td className="mgr-list-status">
                              {getBucketDot(bucket)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Event Modal */}
      {selectedEvent && (
        <div
          className="event-modal-overlay"
          onClick={() => setSelectedEvent(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mgr-modal-title"
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
            <div className={`modal-header mgr-bucket-${selectedEvent.statusBucket || 'inProgress'}`}>
              <h3 id="mgr-modal-title" className="modal-title flex items-center gap-2">
                {getBucketDot(selectedEvent.statusBucket || 'inProgress')}
                <span>{selectedEvent.brandName} {selectedEvent.branchName}</span>
              </h3>
              <div className="mgr-modal-sub">{selectedEvent.status}</div>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span className="detail-label"><CalendarIcon className="w-4 h-4" /> 예약 일시</span>
                <span className="detail-value">
                  {selectedEvent.reserveDate && !Number.isNaN(new Date(selectedEvent.reserveDate).getTime())
                    ? new Date(selectedEvent.reserveDate).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '시간 미정'}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><Users className="w-4 h-4" /> 방문 인원</span>
                <span className="detail-value">{selectedEvent.totalPax ? `${selectedEvent.totalPax}명` : '미정'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><FileSpreadsheet className="w-4 h-4" /> 콘텐츠 건수</span>
                <span className="detail-value">
                  샤오홍슈 {selectedEvent.xhsCount ?? 0}건
                  {Number(selectedEvent.dpCount) > 0 && ` · 따중리뷰 ${selectedEvent.dpCount}건`}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><User className="w-4 h-4" /> 방문 인플</span>
                <div className="mgr-infl-list">
                  {(selectedEvent.influencers && selectedEvent.influencers.length > 0
                    ? selectedEvent.influencers
                    : [{ displayId: selectedEvent.displayId, pal: selectedEvent.pal, channelLink: selectedEvent.channelLink }]
                  ).map((inf, i) => (
                    <div key={i} className="mgr-infl-item">
                      <span className="mgr-infl-name">{inf.displayId || '-'}</span>
                      {inf.pal ? <span className="mgr-infl-pal">PAL {inf.pal}</span> : null}
                      {inf.channelLink ? (
                        <a
                          href={inf.channelLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mgr-infl-link"
                        >
                          <LinkIcon className="w-3.5 h-3.5" /> 채널 바로가기
                        </a>
                      ) : (
                        <span className="mgr-infl-link mgr-infl-link--disabled">채널 링크 없음</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {(selectedEvent.xhsResult || selectedEvent.dpResult || selectedEvent.dyResult ||
                (selectedEvent.xhsResults && selectedEvent.xhsResults.length > 0)) && (
                <div className="detail-row">
                  <span className="detail-label"><ExternalLink className="w-4 h-4" /> 결과물</span>
                  <div className="mgr-result-row">
                    {selectedEvent.xhsResults && selectedEvent.xhsResults.length > 0 ? (
                      selectedEvent.xhsResults.map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="mgr-result-link">
                          <ExternalLink className="w-3 h-3" /> 샤오홍슈 {selectedEvent.xhsResults.length > 1 ? i + 1 : ''}
                        </a>
                      ))
                    ) : (
                      selectedEvent.xhsResult && (
                        <a href={selectedEvent.xhsResult} target="_blank" rel="noopener noreferrer" className="mgr-result-link">
                          <ExternalLink className="w-3 h-3" /> 샤오홍슈
                        </a>
                      )
                    )}
                    {selectedEvent.dpResult && (
                      <a href={selectedEvent.dpResult} target="_blank" rel="noopener noreferrer" className="mgr-result-link">
                        <ExternalLink className="w-3 h-3" /> 따종디엔핑
                      </a>
                    )}
                    {selectedEvent.dyResult && isHttpUrl(selectedEvent.dyResult) && (
                      <a href={selectedEvent.dyResult} target="_blank" rel="noopener noreferrer" className="mgr-result-link">
                        <ExternalLink className="w-3 h-3" /> DY
                      </a>
                    )}
                    {selectedEvent.dyResult && !isHttpUrl(selectedEvent.dyResult) && (
                      <span className="mgr-result-text">DY: {selectedEvent.dyResult}</span>
                    )}
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
