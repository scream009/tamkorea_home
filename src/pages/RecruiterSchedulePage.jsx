import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  List,
  X,
  User,
  Users,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Link as LinkIcon,
  FileSpreadsheet,
  Filter,
} from 'lucide-react';
import './ClientSchedulePage.css';
import './RecruiterSchedulePage.css';

const RECRUITER_LIST = ['HH', 'LH', 'AN', 'FB'];
const VALID_IDS = new Set([...RECRUITER_LIST, 'all']);
const RECRUITER_LABEL = {
  HH: 'HH 담당자',
  LH: 'LH 담당자',
  AN: 'AN 담당자',
  FB: 'FB 담당자',
  all: '전체 담당자 (HH·LH·AN·FB)',
};

const getDaysInMonth     = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

const isHttpUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(s.trim());

const formatPal = (pal) => {
  if (pal === '' || pal == null) return '-';
  const n = Number(pal);
  return Number.isFinite(n) ? n.toLocaleString('ko-KR') : String(pal);
};

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

/* ── 월 헬퍼 ─────────────────────────────────── */
function getCurrentKstMonth() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function paramToShort(p) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(p || '');
  return m ? parseInt(m[2], 10) : null;
}
function paramToLabel(p) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(p || '');
  return m ? `${m[1]}년 ${parseInt(m[2], 10)}월` : p;
}
function shortLabel(p) {
  // "2026-04" → "4월"
  const m = /^(\d{4})-(\d{1,2})$/.exec(p || '');
  return m ? `${parseInt(m[2], 10)}월` : p;
}
function parseAirtableMonth(s) {
  if (!s) return null;
  const m = /^(\d{4})\.\s*(\d+)월$/.exec(s);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1);
}

export default function RecruiterSchedulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const recruiterId = searchParams.get('id');
  const isAll = recruiterId === 'all';

  // 베이스월 = URL의 base 또는 현재월(KST)
  const [baseMonth, setBaseMonth] = useState(
    () => searchParams.get('base') || getCurrentKstMonth()
  );

  // URL ↔ state 동기화
  useEffect(() => {
    const urlBase = searchParams.get('base');
    if (urlBase && urlBase !== baseMonth) setBaseMonth(urlBase);
  }, [searchParams, baseMonth]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [viewMode, setViewMode] = useState('calendar');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const modalCloseBtnRef = useRef(null);

  // 정산월 필터 — 멀티 (기본: 전체)
  const [monthFilter, setMonthFilter] = useState('all'); // 'all' | "2026-04" 같은 정산월 paramKey
  // 담당자 필터 — id=all 모드 전용 (기본: 전체)
  const [recruiterFilter, setRecruiterFilter] = useState('all');

  // 베이스월 바뀌면 필터 리셋
  useEffect(() => { setMonthFilter('all'); }, [baseMonth]);
  useEffect(() => { setRecruiterFilter('all'); }, [recruiterId]);

  // 모달 ESC + scroll lock
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
      setError('담당자 ID가 올바르지 않습니다. (HH / LH / AN / FB / all 중 하나)');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/recruiter-schedule?id=${recruiterId}&base=${baseMonth}`);
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
  }, [recruiterId, baseMonth]);

  // 베이스월 변경 (드롭다운 또는 prev/next 버튼)
  const changeBaseMonth = (newBase) => {
    setBaseMonth(newBase);
    const next = new URLSearchParams(searchParams);
    next.set('base', newBase);
    setSearchParams(next);
  };

  // 캘린더 그리드는 항상 베이스월 기준
  const displayMonth = useMemo(() => {
    const m = /^(\d{4})-(\d{1,2})$/.exec(baseMonth);
    return m ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1) : new Date();
  }, [baseMonth]);

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

  // 필터 적용된 scheduleItems
  const filteredScheduleItems = useMemo(() => {
    if (!data?.scheduleItems) return [];
    return data.scheduleItems.filter((item) => {
      if (monthFilter !== 'all' && item.settlementMonth !== monthFilter) return false;
      if (isAll && recruiterFilter !== 'all' && item.recruiterId !== recruiterFilter) return false;
      return true;
    });
  }, [data, monthFilter, recruiterFilter, isAll]);

  // 필터 적용된 records (리스트 뷰)
  const filteredRecords = useMemo(() => {
    if (!data?.records) return [];
    return data.records.filter((item) => {
      if (monthFilter !== 'all' && item.settlementMonth !== monthFilter) return false;
      if (isAll && recruiterFilter !== 'all' && item.recruiterId !== recruiterFilter) return false;
      return true;
    });
  }, [data, monthFilter, recruiterFilter, isAll]);

  // 이벤트 인덱싱 (날짜 → 이벤트 배열)
  const eventsByDate = useMemo(() => {
    const map = new Map();
    for (const item of filteredScheduleItems) {
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
  }, [filteredScheduleItems]);

  const getEventsForDate = useCallback((d) => {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    return eventsByDate.get(key) || [];
  }, [eventsByDate]);

  const getBucketDot = (bucket) => <span className={`status-dot status-${bucket}`} />;

  /* ── 에러/로딩 ─────────────────────────────── */
  if (error) {
    return (
      <div className="schedule-page flex items-center justify-center">
        <div className="text-center bg-[var(--surface2)] p-8 rounded-2xl max-w-md w-full border border-red-500/30">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">접근 오류</h2>
          <p className="text-[var(--muted)]">{error}</p>
          <div className="mt-6 text-xs text-[var(--muted)] text-left bg-[var(--surface)] p-3 rounded-lg">
            <strong>사용법</strong><br />
            URL: <code className="text-white">/manager?id=HH</code> 또는 <code className="text-white">/manager?id=all</code><br />
            가능한 ID: HH, LH, AN, FB, all<br />
            (옵션) base 형식: YYYY-MM
          </div>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="schedule-page">
        <div className="schedule-header">
          <div className="skeleton-pulse h-10 w-64 mx-auto mb-4" />
          <div className="skeleton-pulse h-4 w-48 mx-auto" />
        </div>
        <div className="schedule-container">
          <div className="kpi-3col">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton-pulse h-40 w-full rounded-2xl" />)}
          </div>
          <div className="skeleton-pulse h-96 w-full rounded-2xl mt-8" />
        </div>
      </div>
    );
  }

  const { months, monthLabels, statsByMonth } = data;
  const recruiterName = RECRUITER_LABEL[recruiterId] || recruiterId;
  const baseLabel = monthLabels[baseMonth] || paramToLabel(baseMonth);

  // 베이스월 ±1 드롭다운 옵션 (요청대로 ±1만)
  const baseOptions = useMemo(() => {
    const today = getCurrentKstMonth();
    const opts = [-1, 0, 1].map((delta) => {
      const m = /^(\d{4})-(\d{1,2})$/.exec(today);
      const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1 + delta, 1);
      const y = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return { value: `${y}-${mm}`, label: paramToLabel(`${y}-${mm}`) };
    });
    return opts;
  }, []);

  /* ── 렌더 ─────────────────────────────────── */
  return (
    <div className="schedule-page">
      <header className="schedule-header flex flex-col items-center mb-10">
        <div className="mgr-base-pill">
          <button
            type="button"
            className="mgr-base-arrow"
            aria-label="이전 베이스월"
            onClick={() => changeBaseMonth(baseOptions[0].value)}
            disabled={baseMonth === baseOptions[0].value}
          >‹</button>
          <select
            className="mgr-base-select"
            value={baseMonth}
            onChange={(e) => changeBaseMonth(e.target.value)}
          >
            {baseOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="mgr-base-arrow"
            aria-label="다음 베이스월"
            onClick={() => changeBaseMonth(baseOptions[2].value)}
            disabled={baseMonth === baseOptions[2].value}
          >›</button>
        </div>
        <h1 className="schedule-title text-center">{recruiterName}</h1>
        <p className="schedule-subtitle text-center mt-2">체험단 섭외 일정 / 실적</p>
      </header>

      <main className="schedule-container">
        {/* ── 3개월 KPI 카드 ─────────────────────────── */}
        <div className="kpi-3col">
          {months.map((m) => {
            const s = statsByMonth[m] || { total: 0, completed: 0, inProgress: 0, cancelled: 0, noShow: 0 };
            const isBase = m === baseMonth;
            return (
              <div key={m} className={`kpi-card mgr-card mgr-month-card${isBase ? ' is-base' : ''}`}>
                <div className="kpi-header">
                  <span className="kpi-title">
                    <span className={`mgr-month-pill${isBase ? ' is-base' : ''}`}>{paramToShort(m)}</span>
                    <span className="ml-2">{shortLabel(m)} 정산</span>
                    {isBase && <span className="mgr-base-tag">기준</span>}
                  </span>
                  <CheckCircle2 className="w-5 h-5 mgr-icon-ok" />
                </div>
                <div className="mgr-row mgr-row--5">
                  <div className="mgr-stat">
                    <span className="mgr-stat-num mgr-num-total">{s.total}</span>
                    <span className="mgr-stat-label">전체</span>
                  </div>
                  <div className="mgr-divider" />
                  <div className="mgr-stat">
                    <span className="mgr-stat-num mgr-num-done">{s.completed}</span>
                    <span className="mgr-stat-label">완료</span>
                  </div>
                  <div className="mgr-divider" />
                  <div className="mgr-stat">
                    <span className="mgr-stat-num mgr-num-prog">{s.inProgress}</span>
                    <span className="mgr-stat-label">진행중</span>
                  </div>
                  <div className="mgr-divider" />
                  <div className="mgr-stat">
                    <span className="mgr-stat-num mgr-num-cancel">{s.cancelled}</span>
                    <span className="mgr-stat-label">취소</span>
                  </div>
                  <div className="mgr-divider" />
                  <div className="mgr-stat">
                    <span className="mgr-stat-num mgr-num-noshow">{s.noShow}</span>
                    <span className="mgr-stat-label">노쇼</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── 뷰 토글 ─────────────────────────────── */}
        <div className="view-tabs">
          <button className={`view-tab ${viewMode === 'calendar' ? 'active' : ''}`} onClick={() => setViewMode('calendar')}>
            <CalendarIcon className="w-4 h-4" /> 달력 뷰
          </button>
          <button className={`view-tab ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
            <List className="w-4 h-4" /> 리스트 뷰
          </button>
        </div>

        {/* ── 필터 칩 ─────────────────────────────── */}
        <div className="mgr-filter-bar">
          <div className="mgr-filter-group">
            <span className="mgr-filter-label"><Filter className="w-3.5 h-3.5" /> 정산월</span>
            <button
              className={`mgr-filter-chip${monthFilter === 'all' ? ' active' : ''}`}
              onClick={() => setMonthFilter('all')}
            >전체</button>
            {months.map((m) => (
              <button
                key={m}
                className={`mgr-filter-chip${monthFilter === m ? ' active' : ''}`}
                onClick={() => setMonthFilter(m)}
              >
                <span className="mgr-month-pill xs">{paramToShort(m)}</span>
                {shortLabel(m)}
              </button>
            ))}
          </div>

          {isAll && (
            <div className="mgr-filter-group">
              <span className="mgr-filter-label">담당자</span>
              <button
                className={`mgr-filter-chip${recruiterFilter === 'all' ? ' active' : ''}`}
                onClick={() => setRecruiterFilter('all')}
              >전체</button>
              {RECRUITER_LIST.map((r) => (
                <button
                  key={r}
                  className={`mgr-filter-chip mgr-recruiter-${r}${recruiterFilter === r ? ' active' : ''}`}
                  onClick={() => setRecruiterFilter(r)}
                >{r}</button>
              ))}
            </div>
          )}
        </div>

        {viewMode === 'calendar' ? (
          <div className="section">
            <div className="section-header">
              <div className="section-title section-title--lg">
                <CalendarIcon className="w-5 h-5" /> 체험단 일정
              </div>
              <div className="section-badge">{baseLabel}</div>
            </div>
            <div className="cal-wrap">
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
                          <div className="event-list">
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
                              const monthShort = ev.settlementMonthShort;
                              const isOtherMonth = ev.settlementMonth && ev.settlementMonth !== baseMonth;
                              return (
                                <button
                                  type="button"
                                  key={i}
                                  className={`event-badge mgr-event-badge mgr-bucket-${ev.statusBucket || 'inProgress'}${(isCancelled || isNoShow) ? ' is-cancelled' : ''}${isOtherMonth ? ' is-other-month' : ''}`}
                                  aria-label={`${monthShort ? monthShort + '월정산 ' : ''}${time} ${customer} ${ev.totalPax ? ev.totalPax + '명' : ''}${isCancelled ? ' 취소' : ''}${isNoShow ? ' 노쇼' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                                >
                                  <span className="ev-row">
                                    {monthShort != null && (
                                      <span className="mgr-month-pill xxs" title={`${monthShort}월 정산`}>{monthShort}</span>
                                    )}
                                    {isAll && ev.recruiterId && (
                                      <span className={`mgr-recruiter-chip mgr-recruiter-${ev.recruiterId}`} title={RECRUITER_LABEL[ev.recruiterId] || ev.recruiterId}>
                                        {ev.recruiterId}
                                      </span>
                                    )}
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
              <div className="section-badge">{filteredRecords.length}건</div>
            </div>
            <div className="mgr-list-wrap">
              {filteredRecords.length === 0 ? (
                <div className="mgr-empty">조건에 해당하는 체험단 일정이 없습니다.</div>
              ) : (
                <div className="mgr-list-scroll">
                  <table className="mgr-list-table mgr-list-table--wide">
                    <thead>
                      <tr>
                        <th style={{ width: '6%' }}>정산</th>
                        {isAll && <th style={{ width: '7%' }}>담당</th>}
                        <th style={{ width: isAll ? '11%' : '12%' }}>일정</th>
                        <th style={{ width: isAll ? '18%' : '20%' }}>고객사</th>
                        <th style={{ width: '16%' }}>방문자 ID</th>
                        <th className="mgr-th-num" style={{ width: '8%' }}>PAL</th>
                        <th style={{ width: '12%' }}>샤오홍슈</th>
                        <th style={{ width: '11%' }}>따종디엔핑</th>
                        <th style={{ width: '7%' }}>DY</th>
                        <th style={{ width: '6%' }}>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((item, idx) => {
                        const d = item.reserveDate ? new Date(item.reserveDate) : null;
                        const dateStr = (d && !Number.isNaN(d.getTime()))
                          ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                          : '미정';
                        const customer = `${item.brandName || ''}${item.branchName ? ' ' + item.branchName : ''}`.trim() || '미정';
                        const bucket = item.statusBucket || 'inProgress';
                        const isXhsMissing = !item.xhsResult && bucket !== 'cancelled' && bucket !== 'noShow';
                        return (
                          <tr
                            key={idx}
                            className={`mgr-list-row mgr-bucket-row-${bucket}${isXhsMissing ? ' mgr-row-xhs-missing' : ''}`}
                            onClick={() => setSelectedEvent(item)}
                          >
                            <td>
                              {item.settlementMonthShort != null && (
                                <span className="mgr-month-pill xs">{item.settlementMonthShort}</span>
                              )}
                            </td>
                            {isAll && (
                              <td>
                                <span className={`mgr-recruiter-chip mgr-recruiter-${item.recruiterId || 'UNK'}`}>
                                  {item.recruiterId || '-'}
                                </span>
                              </td>
                            )}
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

      {/* ── Event Modal ──────────────────────────────── */}
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
                {selectedEvent.settlementMonthShort != null && (
                  <span className="mgr-month-pill" title={`${selectedEvent.settlementMonthShort}월 정산`}>
                    {selectedEvent.settlementMonthShort}
                  </span>
                )}
                <span>{selectedEvent.brandName} {selectedEvent.branchName}</span>
              </h3>
              <div className="mgr-modal-sub">{selectedEvent.status}</div>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span className="detail-label"><CalendarIcon className="w-4 h-4" /> 정산월</span>
                <span className="detail-value">
                  {selectedEvent.settlementMonth ? paramToLabel(selectedEvent.settlementMonth) : '-'}
                </span>
              </div>
              {isAll && (
                <div className="detail-row">
                  <span className="detail-label"><User className="w-4 h-4" /> 담당자</span>
                  <span className="detail-value">
                    <span className={`mgr-recruiter-chip mgr-recruiter-${selectedEvent.recruiterId || 'UNK'}`}>
                      {selectedEvent.recruiterId || '-'}
                    </span>
                    <span className="ml-2 text-sm">{RECRUITER_LABEL[selectedEvent.recruiterId] || ''}</span>
                  </span>
                </div>
              )}
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
