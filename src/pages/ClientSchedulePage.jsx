import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  List,
  Users,
  Camera,
  Newspaper,
  Megaphone,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Send,
  ExternalLink,
  AlertCircle,
  X,
  User,
  Info,
  Download,
  Lightbulb,
  Clock
} from 'lucide-react';
import QRCode from 'qrcode';
import { resolveEventMessage, eventMessageLabel } from '../lib/eventMessage';
import './ClientSchedulePage.css';
import './ClientReportPage.css';

// 상수 — 영상 이상 섹션 내 하위 그룹 순서 (유형 구분 표시용)
const VIDEO_ISSUE_GROUPS = ['influencer', 'experience', 'press'];

// ── 플랫폼 라벨 (2026-08-13) — 미기록·기본값은 기존 표기 유지, 인스타 등은 그 이름으로 ──
const pv1 = (v) => (Array.isArray(v) ? (v[0] || '') : (v || ''));
const xPlatOf = (it) => { const p = pv1(it.xhsPlat); return !p || p === '샤오홍슈' ? '샤오홍슈' : p; };
const dPlatOf = (it) => { const p = pv1(it.dpPlat); return !p || p === '따종디엔핑' ? '따종디엔핑' : p; };
// 섹션 컬럼 제목 — 플랫폼이 하나면 그 이름, 섞이면 '샤오홍슈·인스타그램' 병기
const platHeader = (items, pick, dflt) => {
  const u = [...new Set((items || []).map(pick))];
  return u.length ? u.join('·') : dflt;
};

// 서브 컴포넌트
const TypeBadge = ({ type }) => {
  const map = {
    influencer: [<Megaphone className="tb-ico" />, '인플루언서', 'infl'],
    experience: [<Camera className="tb-ico" />, '체험단', 'exp'],
    press:      [<Newspaper className="tb-ico" />, '기자단', 'press'],
  };
  const [icon, label, cls] = map[type] || [null, '기타', 'exp'];
  return <span className={`type-badge ${cls}`}>{icon}<span>{label}</span></span>;
};

const LinkBtn = ({ href, label }) =>
  href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link-btn">
      <ExternalLink className="w-3.5 h-3.5" /> {label}
    </a>
  ) : (
    <span className="link-pending">진행 중</span>
  );

// 날짜 유틸리티
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

// 순수 유틸 — 컴포넌트 외부로 호이스팅 (useMemo 내부 참조 시 TDZ 회피)
const formatType = (type) => {
  if (!type) return '';
  return String(type).replace(/.*(?:->|=>|→|➔|➡|▶|>)\s*/, '').trim();
};
const getTypeClass = (type) => {
  if (!type) return 'event-exp';
  if (type.includes('인플')) return 'event-infl';
  if (type.includes('기자')) return 'event-press';
  return 'event-exp';
};

// Tam Korea 카카오 채널 — 충전·서비스 신청 CTA
const KAKAO_URL = 'https://pf.kakao.com/_xkxhZzX';

// "2026. 7월" → "7월" (버튼이 길어지지 않게)
const shortMonth = (m) => {
  const x = String(m || '').match(/\d{4}\D+(\d{1,2})/);
  return x ? `${Number(x[1])}월` : (m || '');
};

export const CpcBanner = ({ cpc, isPartner }) => {
  if (!cpc) return null;
  // 잔액 0 + 어제 소진 있음 = **방금 바닥난 것**. 광고 공백이 막 시작된
  // 시점이라 오히려 가장 급하다(한때 '대행 계정 집행'으로 봤으나 근거가 없었다 —
  // 2026-08-13 FK 통보액과 수집값이 일치했고 일예산×일수로 정확히 소진됐다).
  const justRanOut = Number(cpc.balance) <= 0 && Number(cpc.yesterday) > 0;
  const cls = cpc.status; // green | amber | red
  const label = cls === 'red' ? '🔴 충전 필요' : cls === 'amber' ? '🟡 소진 임박' : '🟢 정상';
  // 잔액은 매일 줄어드는 값이라 수집이 오래되면 사실과 벌어진다.
  // 2일 이상 지난 값으로 '광고가 중단됐다'고 단정하면, 그 사이 충전한
  // 고객사에게 틀린 안내가 나간다(실측 2026-08-10 한라갈치: 08-08 수집분 0원).
  // 하루만 지나도 그 사이 충전이 있을 수 있다. '중단됐다'는 단정은
  // 오늘 수집한 값일 때만 한다.
  const stale = cpc.ageDays != null && cpc.ageDays >= 1;
  const msg = justRanOut
    ? `어제 ${Number(cpc.yesterday).toLocaleString()}元 집행을 끝으로 잔액이 소진됐습니다. 지금 충전하시면 노출 공백 없이 이어집니다.`
    : cls === 'red'
    ? (stale
        ? `${cpc.updated} 확인 기준으로 잔액이 소진된 상태였습니다. 이후 충전하셨다면 다음 갱신에 반영됩니다.`
        : '광고가 중단된 상태입니다. 충전하시면 즉시 재개됩니다.')
    : cls === 'amber'
    ? `약 ${cpc.daysLeft}일 후 소진이 예상됩니다. 미리 충전을 권장드립니다.`
    : cpc.daysLeft
    ? `광고가 정상 운영 중입니다. 약 ${cpc.daysLeft}일 후 소진이 예상됩니다.`
    : '광고가 정상 운영 중입니다.';
  const fmt = (n) => Number(n).toLocaleString();
  return (
    <div className={`cpc-banner ${cls}`}>
      <div className="cpc-h">
        <div className="cpc-t">
          <span className="cpc-tag">따종디엔핑 광고(CPC)</span>
          <b>이번 주 광고 현황</b>
        </div>
        <div className="cpc-m">
          <div className="cpc-mi">
            <div className="cpc-bal" data-status={cls}>{fmt(cpc.balance)}<span className="cpc-unit">元</span></div>
            <div className="cpc-ml">현재 잔액</div>
          </div>
          <div className="cpc-mi">
            <div className="cpc-bal cpc-bal--sub">{fmt(cpc.yesterday)}<span className="cpc-unit">元</span></div>
            <div className="cpc-ml">어제 소진</div>
          </div>
          <div className="cpc-mi cpc-mi--st">
            <span className={`cpc-pill ${cls}`}>{label}</span>
            <div className="cpc-ml">{cpc.daysLeft ? `약 ${cpc.daysLeft}일분 남음` : '상태'}</div>
          </div>
        </div>
      </div>
      <div className="cpc-msg">
        <span className="cpc-msg-t"><span className={`cpc-dot ${cls}`} />{msg}</span>
        {/* 협력사 링크에는 우리 카카오 채널을 노출하지 않는다 (화이트라벨) */}
        {isPartner ? (
          <span className="cpc-ask">담당 매니저에게 충전 요청</span>
        ) : (
          <a className="kko-btn" href={KAKAO_URL} target="_blank" rel="noopener noreferrer">
            💬 광고비 충전 신청
          </a>
        )}
      </div>
      {/* CPC 잔액은 '지금 상태'라 계약월과 무관하게 최신 수집분을 보여준다.
          링크의 달과 다르면 어느 달 회차인지 밝힌다 — 안 밝히면 7월 화면에
          8월 숫자가 왜 있는지 설명되지 않는다. */}
      <div className={`cpc-upd${stale ? ' stale' : ''}`}>
        갱신: {cpc.updated}
        {cpc.ageDays != null && cpc.ageDays >= 1 && <> · {cpc.ageDays}일 전</>}
        {cpc.fromOtherMonth && cpc.month && <> · {cpc.month} 수집분(최신)</>}
      </div>
    </div>
  );
};

// 따종디엔핑 미운영 매장(미입점 또는 타사 운영) 대상 넛지
//  · 판정: API의 dpReport 부재 = 데이터 없음 = 미운영 그룹
//  · 원칙: 달력·실적 아래 배치 · 1줄 카드 · 닫으면 14일 숨김 · 실측 수치만 사용
const DpNudge = ({ campaignId, isPartner }) => {
  const KEY = `dp_nudge_hide_${campaignId || 'x'}`;
  const readHidden = (k) => {
    try { return Date.now() < Number(localStorage.getItem(k) || 0); } catch { return false; }
  };
  const [hidden, setHidden] = useState(() => readHidden(KEY));
  // KEY(캠페인) 변경 시 렌더 중 동기화 — 이펙트 setState 금지 규칙 준수
  const [prevKey, setPrevKey] = useState(KEY);
  if (prevKey !== KEY) {
    setPrevKey(KEY);
    setHidden(readHidden(KEY));
  }

  const close = () => {
    try { localStorage.setItem(KEY, String(Date.now() + 14 * 864e5)); } catch { /* 저장 실패 무시 */ }
    setHidden(true);
  };

  if (hidden) return null;
  return (
    <div className="dp-nudge">
      <button type="button" className="dp-nudge-x" onClick={close} aria-label="닫기">
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="dp-nudge-body">
        <div className="dp-nudge-t">🇨🇳 중화권 고객 유치, 따종디엔핑(大众点评)은 어떠세요?</div>
        <p className="dp-nudge-d">
          제주 상권에서 따종디엔핑을 운영 중인 매장은 중화권 고객 노출이
          <b> 상권 평균의 8~9배</b>입니다. 이미 운영 중이시라면 현재 노출·리뷰·광고 효율이
          어느 수준인지 무료로 진단해 드립니다.
          {/* 협력사 링크에는 대행사 브랜드를 노출하지 않는다 (화이트라벨) */}
          <span className="dp-nudge-src">
            {isPartner ? '제주 운영 매장 실측 · 2026.07' : 'Tam Korea 운영 매장 실측 · 2026.07'}
          </span>
        </p>
      </div>
      {/* 협력사 링크는 우리 카카오 채널로 보내지 않고, 협력사 담당자 안내로 대체 */}
      {isPartner ? (
        <div className="dp-nudge-ask">담당 매니저에게 문의해 주세요</div>
      ) : (
        <a className="kko-btn dp-nudge-btn" href={KAKAO_URL} target="_blank" rel="noopener noreferrer">
          💬 무료 진단 받기
        </a>
      )}
    </div>
  );
};

export const DpReportEntry = ({ report, campaignId }) => {
  if (!report) return null;
  const chips = [
    report.exposure ? `노출 ${report.exposure}` : null,
    report.rank || null,
    report.mom ? `전월비 ${report.mom}` : null,
    report.good || null,
    report.adShare != null ? `CPC 광고기여 ${report.adShare}%` : null,
  ].filter(Boolean);

  const inner = (
    <div className="dprep-l">
      <div className="dprep-ic">📊</div>
      <div>
        <div className="dprep-tt">
          따종디엔핑 월간 마케팅 리포트
          {report.month && <span className="dprep-mon">{report.month}</span>}
          {report.isLatest && <span className="dprep-new">최신</span>}
        </div>
        <div className="dprep-ss">
          {report.period} · 노출·리뷰·광고 종합
          {/* 같은 매장에 회차가 여러 개라 기간만으로는 방금 돌린 게 어느 것인지
              알 수 없다(궁서체 2026-08-13). 생성 시각을 같이 밝힌다. */}
          {report.generatedAt && <> · {report.generatedAt} 생성</>}
        </div>
        <div className="dprep-chips">
          {chips.map((c, i) => <span key={i} className="dprep-chip">{c}</span>)}
        </div>
      </div>
    </div>
  );

  // DB를 읽어 렌더하는 React 리포트로 연결 — 정적 HTML은 협력사 화이트라벨이 불가하고
  // 봇이 Airtable만 갱신하면 옛 데이터로 남는 문제가 있다.
  // 링크의 계약월이 아니라 **최신 회차**로 연결한다. API 가 골라 준 id 를 쓴다 —
  // 7월 링크를 받은 고객사도 8월 리포트가 나오면 그걸 보게 된다.
  const target = report.campaignId || campaignId || '';
  return (
    <a className="dprep" href={`/dp-report?campaignId=${encodeURIComponent(target)}`} target="_blank" rel="noopener noreferrer">
      {inner}
      <span className="dprep-btn">리포트 열기 →</span>
    </a>
  );
};

export default function ClientSchedulePage() {
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get('campaignId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'
  
  // 캘린더 기준 월 (초기값: 현재)
  // 달력 기준월 = 이 링크의 계약월(data.month). 데이터 로드 후 맞춘다.
  const [currentDate, setCurrentDate] = useState(new Date());

  // ⚠️ 훅은 early return(로딩·에러) 보다 위에 있어야 한다.
  //    아래쪽에 두면 렌더마다 훅 개수가 달라져 React #310 으로 화면이 통째로 죽는다.
  useEffect(() => {
    const x = String(data?.month || '').match(/(\d{4})\D+(\d{1,2})/);
    if (x) setCurrentDate(new Date(Number(x[1]), Number(x[2]) - 1, 1));
  }, [data]);

  // 팝업(모달) 상태
  const [selectedEvent, setSelectedEvent] = useState(null);
  
  // 신규: QR 체크인 모달 상태
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const qrCanvasRef = useRef(null);

  useEffect(() => {
    if (qrModalOpen && qrCanvasRef.current && data?.storeCode && data?.storeSignature) {
      // www 직결 — apex 는 307 리다이렉트를 타서 위챗 웹뷰에서 한 홉 더 느리다
      const url = `https://www.tamkorea.com/checkin?s=${data.storeCode}&t=${data.storeSignature}`;
      QRCode.toCanvas(qrCanvasRef.current, url, {
        width: 400,
        margin: 4,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      }, function (error) {
        if (error) console.error(error);
      });
    }
  }, [qrModalOpen, data]);

  const modalCloseBtnRef = useRef(null);

  // 모달 접근성: ESC 키 닫기 + body scroll lock + 자동 포커스
  useEffect(() => {
    if (!selectedEvent) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setSelectedEvent(null);
    };
    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // 닫기 버튼에 포커스 (스크린리더 + 키보드 사용자 대응)
    setTimeout(() => modalCloseBtnRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedEvent]);

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
          } catch {
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

  // 파트너사에 따른 브라우저 탭 및 파비콘 동적 변경 (화이트라벨링)
  useEffect(() => {
    if (data) {
      let { brandName, branchName, campaignName, partnerName = 'TAMKOREA' } = data;
      if (partnerName && partnerName.includes('에코')) {
        partnerName = '에코';
      }
      const displayName = brandName && branchName ? `${brandName} ${branchName}` : (brandName || campaignName || '캠페인');
      
      if (partnerName && partnerName !== 'TAMKOREA') {
        document.title = `${displayName} 캠페인 현황 - ${partnerName}`;
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      } else {
        document.title = `${displayName} 캠페인 현황 - 탐코리아`;
      }
    }
  }, [data]);

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

  // 날짜별 이벤트 사전 인덱싱 — O(1) 조회 (이전 코드는 셀마다 전체 배열 필터링했음)
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

    // 날짜별 이벤트 정렬 (인플 우선 + 시간순)
    for (const events of map.values()) {
      events.sort((a, b) => {
        const isInflA = formatType(a.type).includes('인플');
        const isInflB = formatType(b.type).includes('인플');
        if (isInflA && !isInflB) return -1;
        if (!isInflA && isInflB) return 1;
        return new Date(a.reserveDate) - new Date(b.reserveDate);
      });
    }
    return map;
  }, [data]);

  const getEventsForDate = useCallback((dateObj) => {
    const key = `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}`;
    return eventsByDate.get(key) || [];
  }, [eventsByDate]);

  // 진행 상태 렌더러
  const getStatusDot = (status) => {
    if (!status) return <span className="status-dot status-wait" title="진행전"></span>;
    if (status.includes('완료')) return <span className="status-dot status-done" title={status}></span>;
    if (status.includes('확정')) return <span className="status-dot status-resv" title={status}></span>;
    if (status.includes('취소')) return <span className="status-dot status-cancel" title={status}></span>;
    return <span className="status-dot status-wait" title={status}></span>;
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

    // 플랫폼 다변화(2026-08-13) — 빈값·기본값은 기존 표기 유지, 인스타 등은 그 이름으로
    const arr1 = (v) => (Array.isArray(v) ? (v[0] || '') : (v || ''));
    const xp = arr1(event.xhsPlat);
    const dpp = arr1(event.dpPlat);
    const xLabel = !xp || xp === '샤오홍슈' ? '샤오홍슈' : xp;
    const dLabel = !dpp || dpp === '따종디엔핑' ? '따중리뷰' : dpp;

    let contentStr = `${xLabel} ${safeXhsCount}건`;
    if (Number(safeDpCount) > 0) {
      contentStr += `, ${dLabel} ${safeDpCount}건`;
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

  let { stats, campaignName, brandName, branchName, month, records, partnerName = 'TAMKOREA' } = data;
  if (partnerName && partnerName.includes('에코')) {
    partnerName = '에코';
  }
  
  const displayName = brandName && branchName ? `${brandName} ${branchName}` : campaignName;

  // ── 협력사(화이트라벨) 판정 ───────────────────────────────────────
  // API가 빈값·'직영'·'탐코리아'를 모두 'TAMKOREA'로 정규화해 준다.
  // 협력사 경유 링크는 데이터는 그대로 보여주되 Tam Korea 브랜드·카카오 채널만 지운다.
  const isPartner = !!partnerName && partnerName !== 'TAMKOREA';

  // 따종디엔핑 CPC/월간리포트 — Airtable(봇 적재) → API 응답만 사용.
  // 없으면 없는 대로 둔다(지어내지 않음). 넛지는 '매장 단위'로 고객사가 아닐 때만.
  const cpcInfo  = data?.cpc || null;
  const dpReport = data?.dpReport || null;
  const isDpClient = data?.dpClient === true;
  const sib = data?.siblings || { prev: null, next: null };


  const hasInfl  = records?.influencer?.length > 0;
  const hasExp   = records?.experience?.length > 0;
  const hasPress = records?.press?.length > 0;
  const hasVideoIssue = records?.videoIssue?.length > 0;

  const handleDownloadCSV = () => {
    if (!records) return;
    
    const allItems = [
      ...(records.influencer || []), ...(records.experience || []),
      ...(records.press || []), ...(records.videoIssue || []),
    ];
    const headers = ['구분', 'No.', '닉네임(ID)',
      `${platHeader(allItems, xPlatOf, '샤오홍슈')} 링크`,
      `${platHeader(allItems, dPlatOf, '따종디엔핑')} 링크`];
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
          escape(item.dpResult)
        ];
        rows.push(row.join(','));
      });
    };

    addRows('인플루언서', records.influencer);
    addRows('체험단', records.experience);
    addRows('기자단', records.press);
    const vi = records.videoIssue || [];
    addRows('영상이상·인플루언서', vi.filter(i => i.category === 'influencer'));
    addRows('영상이상·체험단', vi.filter(i => i.category === 'experience'));
    addRows('영상이상·기자단', vi.filter(i => i.category === 'press'));

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
        {/* 실적월 전환 — 링크는 계약월 1개에 고정돼 있어 다른 달을 볼 수 없었다.
            같은 매장의 전월/다음달 레코드로 이동한다(±1개월만). */}
        <div className="mo-nav">
          {sib.prev ? (
            <a className="mo-btn" href={`/schedule?campaignId=${sib.prev.id}`}>
              ‹ {shortMonth(sib.prev.month)} 실적
            </a>
          ) : <span className="mo-btn is-off">‹ 이전 없음</span>}

          <div className="mo-cur">{month}</div>

          {sib.next ? (
            <a className="mo-btn" href={`/schedule?campaignId=${sib.next.id}`}>
              {shortMonth(sib.next.month)} 실적 ›
            </a>
          ) : <span className="mo-btn is-off">다음 없음 ›</span>}
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
          
          {data?.storeCode && data?.storeSignature && (
            <button 
              className="view-tab" 
              style={{ marginLeft: 'auto', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white', border: 'none' }}
              onClick={() => setQrModalOpen(true)}
            >
              📷 체크인 QR
            </button>
          )}
        </div>

        {/* ★ 신규: 주간 CPC 배너 + 따종디엔핑 월간 리포트 진입 (달력 위) */}
        <CpcBanner cpc={cpcInfo} isPartner={isPartner} />
        <DpReportEntry report={dpReport} campaignId={campaignId} />

        {/* 4. Main Content (Calendar / List) */}
        {viewMode === 'calendar' ? (
          <div className="section">
            <div className="section-header">
              <div className="section-title section-title--lg">
                <CalendarIcon className="w-5 h-5" /> 예약 현황 달력
              </div>
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
                  const hasEvents = events.length > 0;

                  return (
                    <div
                      key={idx}
                      className={`cal-cell${!dayObj.isCurrentMonth ? ' empty' : ''}${isToday ? ' today-cell' : ''}${hasEvents ? ' cal-cell--has-events' : ''}`}
                    >
                      {dayObj.isCurrentMonth && (
                        <>
                          <div className="cell-num">{dayObj.date.getDate()}</div>
                          <div className="event-list">
                            {events.map((ev, i) => {
                              const displayType = formatType(ev.type);
                              // 진행상태 정확매칭 → 부분문자열로 강건성 향상
                              const statusStr = String(ev.status || '');
                              const isCancelled = statusStr.includes('취소');
                              const isNoShow = statusStr.includes('노쇼');
                              // 일정이 바뀐 예약. 블록은 바뀐 날짜에 그려지므로
                              // 표시가 없으면 고객사는 변경 사실을 알 수 없다.
                              const isChanged = !!ev.changedFrom && !isCancelled && !isNoShow;
                              const d = ev.reserveDate ? new Date(ev.reserveDate) : null;
                              const time = (d && !Number.isNaN(d.getTime()))
                                ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                                : '';
                              const ariaLabel = `${time ? time + ' ' : ''}${displayType}${ev.totalPax ? ' ' + ev.totalPax + '명' : ''}${isCancelled ? ' 취소' : ''}${isNoShow ? ' 노쇼' : ''}${isChanged ? ' 일정 변경됨' : ''}`;
                              return (
                                <button
                                  type="button"
                                  key={i}
                                  className={`event-badge ${getTypeClass(ev.type)}${(isCancelled || isNoShow) ? ' is-cancelled' : ''}`}
                                  aria-label={ariaLabel}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEvent(ev);
                                  }}
                                >
                                  <span className="ev-row">
                                    {time && <span className="ev-time">{time}</span>}
                                    {getStatusDot(ev.status)}
                                    <span className="ev-type">{displayType}</span>
                                    {ev.totalPax ? <span className="ev-pax">({ev.totalPax}명)</span> : null}
                                    {isCancelled && <span className="ev-tag-cancel">취소</span>}
                                    {isNoShow    && <span className="ev-tag-noshow">노쇼</span>}
                                    {isChanged   && <span className="ev-tag-change">변경</span>}
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
              {/* 수치 오해 방지 — 달력의 인원 ≠ 실적 건수 (직영·협력사 공통) */}
              <div className="cal-note">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  달력에 표시되는 인원은 <b>방문 인원</b>입니다. 실적은
                  <b> 샤오홍슈 / 따종디엔핑 건수</b>를 참고해 주세요.
                </span>
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
                  <div className="report-meta">
                    <div className="gravity-logo-accent report-logo-accent">
                      {partnerName}<br />
                      <span className="report-logo-sub">PERFORMANCE REPORT</span>
                    </div>
                    <button type="button" onClick={handleDownloadCSV} className="csv-btn">
                      <Download className="w-4 h-4" /> CSV 다운로드
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
                          <th style={{width:'28%'}}>방문자 ID</th>
                          <th style={{width:'33%'}}>{platHeader(records.influencer, xPlatOf, '샤오홍슈')} 결과물</th>
                          <th style={{width:'33%'}}>{platHeader(records.influencer, dPlatOf, '따종디엔핑')}</th>
                        </tr></thead>
                        <tbody>
                          {records.influencer.map(item => (
                            <tr key={item.id} className={!item.xhsResult && !item.dpResult ? 'row-pending' : ''}>
                              <td>{item.seq}</td>
                              <td><span className="id-tag">{item.displayId || '-'}</span></td>
                              <td><LinkBtn href={item.xhsResult} label={xPlatOf(item)} /></td>
                              <td><LinkBtn href={item.dpResult} label={dPlatOf(item)} /></td>
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
                          <th style={{width:'33%'}}>{platHeader(records.experience, xPlatOf, '샤오홍슈')} 결과물</th>
                          <th style={{width:'33%'}}>{platHeader(records.experience, dPlatOf, '따종디엔핑')}</th>
                        </tr></thead>
                        <tbody>
                          {records.experience.map(item => (
                            <tr key={item.id} className={!item.xhsResult && !item.dpResult ? 'row-pending' : ''}>
                              <td>{item.seq}</td>
                              <td><span className="id-tag">{item.displayId || '-'}</span></td>
                              <td><LinkBtn href={item.xhsResult} label={xPlatOf(item)} /></td>
                              <td><LinkBtn href={item.dpResult}  label={dPlatOf(item)} /></td>
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

                {hasVideoIssue && (
                  <section className="category-section video-issue-section">
                    <h2 className="category-title">
                      <span className="type-badge vissue">⚠️ 영상 이상</span>
                      <span className="cat-count">{records.videoIssue.length}건 · 삭제 또는 비공개 처리됨</span>
                    </h2>
                    <p className="video-issue-note">
                      아래 항목은 게시 후 플랫폼 광고 제한 정책에 따라 영상이 삭제·비공개 처리된 건입니다.
                    </p>
                    {VIDEO_ISSUE_GROUPS.map(cat => {
                      const items = records.videoIssue.filter(i => i.category === cat);
                      if (items.length === 0) return null;
                      return (
                        <div key={cat} className="vissue-group">
                          <h3 className="vissue-group-title">
                            <TypeBadge type={cat} />
                            <span className="cat-count">{items.length}건</span>
                          </h3>
                          <div className="premium-table-wrapper">
                            <table className="premium-table">
                              <thead><tr>
                                <th style={{width:'6%'}}>No.</th>
                                <th style={{width:'34%'}}>방문자 ID</th>
                                <th style={{width:'30%'}}>{platHeader(items, xPlatOf, '샤오홍슈')}</th>
                                <th style={{width:'30%'}}>{platHeader(items, dPlatOf, '따종디엔핑')}</th>
                              </tr></thead>
                              <tbody>
                                {items.map((item, i) => (
                                  <tr key={item.id} className="row-vissue">
                                    <td>{i + 1}</td>
                                    <td><span className="id-tag">{item.displayId || '-'}</span></td>
                                    <td><LinkBtn href={item.xhsResult} label={xPlatOf(item)} /></td>
                                    <td><LinkBtn href={item.dpResult}  label={dPlatOf(item)} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                )}

                {!hasInfl && !hasExp && !hasPress && !hasVideoIssue && (
                  <div className="cr-center" style={{ padding:'60px 0', color:'#6b7280' }}>
                    아직 등록된 실적이 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 4-B. 따종디엔핑 미운영 매장 넛지 (데이터 없으면 = 미입점/타사 그룹) */}
        {!dpReport && !isDpClient && <DpNudge campaignId={campaignId} isPartner={isPartner} />}

        {/* 5. 문의 — 협력사 링크는 브랜드 없는 '준비중' 안내, 직영은 카카오 채널 카드 */}
        {isPartner ? (
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <MessageSquare className="w-4 h-4" /> 문의 / 메모
            </div>
            <div className="section-badge section-badge--soft">준비중</div>
          </div>
          <div className="memo-wrap">
            <div className="memo-intro">
              <Lightbulb className="w-4 h-4 flex-shrink-0" />
              <span>일정 변경이나 특별 요청사항은 현재 담당 매니저에게 <b>카카오톡으로 직접</b> 전달해 주세요. 이 페이지의 폼 전송 기능은 준비 중입니다.</span>
            </div>
            <div className="memo-form" aria-disabled="true">
              <textarea
                className="memo-input"
                placeholder="(준비중) 추후 이 입력창을 통해 운영팀에 직접 메모가 전달됩니다."
                disabled
              ></textarea>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="memo-submit"
                  disabled
                  title="현재 폼 전송은 준비중입니다. 카카오톡으로 전달해 주세요."
                >
                  <Send className="w-3.5 h-3.5" /> 전송 (준비중)
                </button>
              </div>
            </div>
          </div>
        </div>
        ) : (
        <div className="section">
          <div className="section-header">
            <div className="section-title">
              <MessageSquare className="w-4 h-4" /> 문의 / 상담
            </div>
            <div className="section-badge">카카오 채널</div>
          </div>

          <div className="kko-wrap">
            <div className="kko-left">
              <div className="kko-brand">
                <span className="kko-logo" aria-hidden="true">
                  <svg viewBox="0 0 40 40" width="40" height="40">
                    <rect width="40" height="40" rx="10" fill="#FEE500" />
                    <path d="M20 9c-6.1 0-11 3.8-11 8.5 0 3 2 5.6 5 7.1l-1.1 4.1c-.1.4.3.7.7.5l4.8-3.1c.5.1 1.1.1 1.6.1 6.1 0 11-3.8 11-8.5S26.1 9 20 9z" fill="#191600" />
                    <text x="20" y="21" textAnchor="middle" fontSize="9" fontWeight="800" fill="#FEE500">Ch</text>
                  </svg>
                </span>
                <div>
                  <div className="kko-title">탐코리아 카카오 채널</div>
                  <div className="kko-sub">일정 변경 · 특별 요청 · 광고비 충전 · 서비스 신청</div>
                </div>
              </div>
              <p className="kko-desc">
                모든 문의는 <b>카카오 채널</b>로 편하게 남겨주세요. 담당 매니저가 확인 후 바로 안내드립니다.
              </p>
              <a className="kko-btn kko-btn--lg" href={KAKAO_URL} target="_blank" rel="noopener noreferrer">
                💬 카카오 채널로 문의하기
              </a>
            </div>

            <div className="kko-right">
              <a href={KAKAO_URL} target="_blank" rel="noopener noreferrer" className="kko-qr-link">
                <img src="/kakao_qr.png" alt="탐코리아 카카오 채널 QR" className="kko-qr" />
              </a>
              <div className="kko-qr-cap">
                <b>탐코리아 카카오 채널 추가</b>
                <span>스마트폰 카메라로 스캔하세요</span>
              </div>
            </div>
          </div>
        </div>
        )}

      </main>

      
      {/* QR Check-in Modal */}
      {qrModalOpen && (
        <div className="event-modal-overlay" onClick={() => setQrModalOpen(false)}>
          <div className="event-modal-content" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', padding: '2rem' }}>
            <button
              type="button"
              className="event-modal-close"
              onClick={() => setQrModalOpen(false)}
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1rem', color: '#111827' }}>
              입장 체크인 QR
            </h3>
            <p style={{ color: '#4b5563', fontSize: '0.9rem', marginBottom: '1rem' }}>
              방문자(체험단)가 입장하면 이 QR을 스캔하게 해주세요.
            </p>
            <div style={{ background: 'white', padding: '10px', display: 'inline-block', borderRadius: '12px' }}>
              <canvas ref={qrCanvasRef}></canvas>
            </div>

            {/* 매장용 안내 카드 — 중국어를 몰라도 이 화면을 그대로 보여주며 안내할 수 있다.
                ⚠ 색상은 고정값 — 테마 변수(--text-color 등)는 다크 페이지 기준이라
                흰 모달 위에서 글자가 안 보이는 사고가 있었다 (2026-08-06 실측) */}
            <div style={{
              textAlign: 'left', margin: '1.2rem auto 0', maxWidth: '420px',
              background: '#f8f9fa', border: '1px solid #e5e7eb',
              borderRadius: '10px', padding: '12px 16px', fontSize: '0.88rem', lineHeight: 1.7,
              color: '#1f2937',
            }}>
              <b style={{ color: '#111827' }}>방문자 안내 방법</b> — 중국어를 몰라도 아래 중문을 그대로 보여주시면 됩니다.
              <div style={{ marginTop: '6px' }}>
                ① 위챗 <b>➕ → 스캔(扫一扫)</b>으로 이 QR 찍기
                <br />② 초록색 <b>&quot;예약된 체험단입니다&quot;</b> 화면 확인
                <br />③ 화면의 계정명·인원이 예약과 맞는지 확인
              </div>
              <div style={{
                marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #d1d5db',
                fontSize: '0.92rem',
              }}>
                🇨🇳 请用微信右上角 <b>➕ → 扫一扫</b> 扫描此二维码，
                出现绿色确认页面后请出示给店员。
              </div>
              {data?.checkinCode && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #d1d5db' }}>
                  카메라·스캔이 안 되는 방문자에게는 이 코드를 입력하게 하세요:{' '}
                  <b style={{ fontSize: '1.15rem', letterSpacing: '0.15em', color: '#4f46e5' }}>{data.checkinCode}</b>
                  <span style={{ color: '#6b7280', fontSize: '0.8rem' }}> (매일 자동 변경)</span>
                </div>
              )}
              <div style={{ marginTop: '8px', color: '#6b7280', fontSize: '0.8rem' }}>
                체크인이 되면 카카오톡 알림이 최대 1분 내에 자동 발송됩니다.
              </div>
            </div>

            <p style={{ marginTop: '1.5rem', color: '#ff4d4f', fontSize: '0.85rem' }}>
              ※ 이 화면은 고객사 전용 화면입니다. 외부 유출에 주의하세요.
            </p>
          </div>
        </div>
      )}

      {/* Event Details Modal */}
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
              {/* 취소·노쇼는 제일 먼저 알려야 한다. 일시·인원부터 읽고 나서
                  뒤늦게 '취소된 건'임을 알면 이미 준비를 시작한 뒤다. */}
              {(String(selectedEvent.status || '').includes('취소')
                || String(selectedEvent.status || '').includes('노쇼')) && (
                <div className="modal-alert modal-alert--cancel">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <b>
                    {String(selectedEvent.status).includes('노쇼')
                      ? '방문자가 오지 않은 건입니다 (노쇼)'
                      : String(selectedEvent.status).includes('고객사')
                        ? '식당 측 사정으로 취소된 예약입니다'
                        : '방문자 측 사정으로 취소된 예약입니다'}
                  </b>
                </div>
              )}

              {/* 일정이 바뀐 예약 — 원래 언제였는지 함께 보여 준다 */}
              {selectedEvent.changedFrom && (
                <div className="modal-alert modal-alert--change">
                  <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <b>일정이 변경된 예약입니다</b>
                    <div className="mt-1">
                      {new Date(selectedEvent.changedFrom).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {selectedEvent.changedPaxFrom ? ` · ${selectedEvent.changedPaxFrom}명` : ''}
                      {' → '}
                      <b>
                        {new Date(selectedEvent.reserveDate).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {selectedEvent.totalPax ? ` · ${selectedEvent.totalPax}명` : ''}
                      </b>
                    </div>
                  </div>
                </div>
              )}

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
                <span className="detail-label">
                  <Info className="w-4 h-4" /> {eventMessageLabel(selectedEvent.status)}
                </span>
                <span className="detail-value memo-box" style={{ whiteSpace: 'pre-wrap' }}>
                  {/* 예약봇이 식당에 실제로 보낸 문구를 그대로 보여 준다.
                      취소·노쇼는 취소 안내까지, 변경 건은 기존 예약 + 변경 내용까지
                      한 덩어리로 들어 있어 고객사가 받은 카톡과 화면이 일치한다. */}
                  {resolveEventMessage(
                    selectedEvent,
                    generateDynamicMemo(selectedEvent, campaignName, brandName, branchName)
                  )}
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
