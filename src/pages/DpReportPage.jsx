import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import './DpReportPage.css';

/**
 * 따종디엔핑(大众点评) 월간 리포트 — DB 렌더링 버전
 *
 * /dp-report?campaignId=recXXXX
 *   → /api/client-schedule 의 dpReport.detail (= Airtable DP_리포트JSON) 을 렌더한다.
 *
 * 봇(meituan_bot.py)이 Airtable을 갱신하면 이 링크는 별도 배포 없이 최신 데이터를 보여준다.
 * 수치 코멘트는 AI가 아니라 규칙 기반 — 정적 생성기(generate_report_v7.py)와 동일 로직을 이식했다.
 */

const KAKAO_URL = 'https://pf.kakao.com/_xkxhZzX';

/**
 * 화이트라벨 — 협력사(웹플로우·제주에코·좋아좋아 …) 경유 링크에는
 * Tam Korea 브랜드와 우리 카카오 채널이 일절 노출되면 안 된다.
 * 대행사명은 brand 로 치환하고, 카카오 CTA는 담당자 안내 문구로 대체한다.
 */
const BrandCtx = React.createContext({ brand: 'Tam Korea', isPartner: false });
const useBrand = () => React.useContext(BrandCtx);

const Kko = ({ label }) => {
  const { isPartner } = useBrand();
  if (isPartner) return <span className="dpr-ask">담당 매니저에게 문의해 주세요</span>;
  return (
    <a className="dpr-kko" href={KAKAO_URL} target="_blank" rel="noopener noreferrer">
      <span className="dpr-kko-ic">💬</span>{label}
    </a>
  );
};

const CtaRow = ({ text, label }) => (
  <div className="dpr-cta-row">
    <div className="dpr-cta-txt">{text}</div>
    <Kko label={label} />
  </div>
);

const Section = ({ icon, title, note, children }) => (
  <section className="dpr-sec">
    <div className="dpr-sh"><span className="dpr-ic">{icon}</span><h2>{title}</h2></div>
    {note && <div className="dpr-s-note">{note}</div>}
    {children}
  </section>
);

const Stat = ({ items }) => (
  <div className="dpr-stat">
    {items.map((it, i) => (
      <div className="dpr-cst" key={i}>
        <div className="dpr-cv mono" style={{ color: it.color || '#f1f5f9', ...(it.style || {}) }}>{it.value}</div>
        <div className="dpr-cl">{it.label}</div>
      </div>
    ))}
  </div>
);

const num = (n) => (n == null ? '-' : Number(n).toLocaleString());

// ── 별점 렌더 (0.5 단위) ────────────────────────────────────────────
const Stars = ({ v, low }) => {
  const val = Number(v) || 0;
  if (val <= 0) return <span className="dpr-stars s1">📌</span>;
  const full = Math.floor(val);
  const half = val - full >= 0.5;
  const txt = '★'.repeat(full) + (half ? '⯨' : '') + '☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)));
  return (
    <>
      <span className={`dpr-stars${low ? ' s1' : ''}`}>{txt}</span>
      <span className="dpr-star-num">★{+val.toFixed(1)}</span>
    </>
  );
};

// ── CPC 잔액 · 충전 ─────────────────────────────────────────────────
const CpcSection = ({ cpc, funnel, dominance, store }) => {
  const { brand } = useBrand();
  if (!cpc) {
    return (
      <>
        <div className="dpr-recharge warn">
          <b>⚠️ CPC 데이터 수집 지연</b>
          이번 달 광고 데이터를 가져오지 못했습니다. 다음 리포트에 반영됩니다.
        </div>
        <div className="dpr-foot-note">인플루언서·체험단 바이럴은 정상 진행 중입니다.</div>
      </>
    );
  }
  const bal = Number(cpc.balance) || 0;
  const yst = Number(cpc.yesterday) || 0;
  const days = yst > 0 ? bal / yst : null;
  const r0 = (n) => Math.round(n).toLocaleString();

  let lvl, tag, bs, recomTitle, recomBody, contrib;
  if (bal <= 0) {
    lvl = 'urgent'; tag = '비활성'; bs = '광고가 노출되지 않는 상태';
    recomTitle = '🔴 지금 광고가 꺼져 있습니다 — 충전이 필요합니다';
    recomBody = (
      <>캠페인은 세팅돼 있으나 <b>잔액이 0원</b>이라 어제 {r0(yst)}元을 끝으로 노출이 멈췄습니다. 권장 충전액 <b>약 5,000元</b>(일예산×약7일). 충전만 해주시면 {brand}가 즉시 재개·운영합니다.</>
    );
    contrib = (
      <>📉 <b>기회손실 발생 중</b> — 광고가 멈추면 상권 노출 순위가 하락하고, 인플루언서·체험단으로 만든 유입 모멘텀이 꺼집니다. 플랫폼 밖 <b>인플루언서 바이럴</b>과 플랫폼 안 <b>CPC 상단 노출</b>이 맞물릴 때 효과가 극대화됩니다.</>
    );
  } else if (bal < 1000) {
    lvl = 'warn'; tag = '충전 임박'; bs = days ? `약 ${Math.round(days)}일분 남음` : '잔액 부족';
    recomTitle = '🟡 곧 소진 예상 — 충전을 준비해주세요';
    recomBody = (
      <>일평균 {r0(yst)}元 기준 잔액 {r0(bal)}元는 약 {Math.round(days || 0)}일분입니다. 소진 전 충전을 권장드립니다.</>
    );
    contrib = (
      <>🔗 어제 <b>{r0(yst)}元</b> 집행으로 상권 상단 노출을 견인했습니다. 인플루언서·체험단 바이럴(플랫폼 외부) + CPC 상단노출(플랫폼 내부)의 <b>톱니바퀴</b>가 노출을 끌어올립니다.</>
    );
  } else {
    lvl = 'ok'; tag = '정상 운영'; bs = days ? `약 ${Math.round(days)}일분 여유` : '운영 양호';
    recomTitle = '🟢 안정적으로 운영 중';
    recomBody = `${brand}가 매일 시간대별 클릭단가를 모니터링하며 점심·저녁 피크에 입찰가를 최적화하고 있습니다. 성수기(중국 연휴)엔 예산 상향으로 점유율 확대를 제안드립니다.`;
    contrib = (
      <>🔗 어제 <b>{r0(yst)}元</b>을 집행해 노출 도달 <b>{num(funnel?.exposure)}명</b>을 견인했습니다. 플랫폼 외부 <b>인플루언서·체험단 바이럴</b>과 내부 <b>CPC 상단 노출</b>이 맞물려 상권 노출 랭킹 <b>{dominance?.rank}위</b>를 방어하고 있습니다.</>
    );
  }

  const budget = cpc?.daily_budget ?? store?.budget;   // 수집값 우선
  return (
    <>
      <div className={`dpr-bal ${lvl}`}>
        <div><div className="dpr-bl2">계정 잔액 <small>账户余额 · 광고비 충전금</small></div></div>
        <div className="dpr-bv mono">{r0(bal)}<span style={{ fontSize: '1.2rem' }}>元</span><span className="dpr-tag">{tag}</span></div>
        <div className="dpr-bs">{bs}</div>
      </div>
      <div className={`dpr-recharge ${lvl === 'ok' ? 'ok' : lvl}`}>
        <b>{recomTitle}</b>{recomBody}
      </div>
      <Stat items={[
        { value: `${r0(yst)}元`, label: '어제 광고비 소진', color: '#9B70FF' },
        { value: `${r0(bal)}元`, label: '현재 잔액', color: bal <= 0 ? '#ff6b6b' : bal >= 1000 ? '#34d399' : '#fbbf24' },
        { value: budget ? `${num(budget)}元/일`
                 : (cpc?.budget_status === 'not_set' ? '미책정'
                    : cpc?.budget_status === 'fetch_failed' ? '수집 실패'
                    : `${brand} 최적 예산 추천`),
          label: '일예산 책정',
          style: budget ? {} : { fontSize: '.95rem', lineHeight: 1.35 } },
        { value: '1개', label: '활성 캠페인' },
      ]} />
      <div className="dpr-foot-note" style={{ marginTop: 14 }}>💡 <b>{brand} CPC 기여도</b> — {contrib}</div>
      <CtaRow
        text={bal <= 0
          ? `충전만 해주시면 ${brand}가 즉시 광고를 재개하고 운영·최적화까지 진행합니다.`
          : '소진 전 미리 충전하시면 광고 공백 없이 노출이 유지됩니다.'}
        label="광고비 충전 신청"
      />
    </>
  );
};

// ── 광고 기여도 ────────────────────────────────────────────────────
const AdflowSection = ({ adflow, name, cpc }) => {
  if (!adflow || !adflow.running || adflow.imp_share == null) {
    // 실제 미집행과 수집 실패를 구분해 안내한다.
    // 잔액만 보고 추측하면 잔액이 있는 미집행 매장을 '수집 실패'로 잘못 알린다.
    // 집행 여부의 근거는 推广通 실제 소비액이다.
    // (cureLaunchNum 을 캠페인 수로 오해해 '캠페인 미개설'로 잘못 안내한 적이 있다.
    //  그 값은 최적화 제안 수이며 판정에 쓰지 않는다.)
    const failed = (adflow?.status || 'fetch_failed') === 'fetch_failed';
    const spent = adflow?.cpc_yesterday_rmb;
    return (
      <div className="dpr-box no">
        <div className="dpr-gt">
          {failed ? '⏳ 광고 기여도 — 이번 회차 수집 실패' : '📉 광고 기여도 — CPC 미집행'}
        </div>
        <div className="dpr-gd">
          {failed
            ? <>광고 성과 데이터를 <b>가져오지 못했습니다</b>. 광고를 하지 않는다는 뜻이 <b>아닙니다</b>{spent > 0 ? <> — 실제로 어제 CPC 광고비 <b>{spent}元</b>이 집행됐습니다</> : null}. 다음 리포트에 반영됩니다. (노출·리뷰 등 다른 수치는 정상입니다)</>
            : <>이 기간 <b>CPC 광고가 집행되지 않았습니다</b>. 다른 매장 실측에서는 <b>광고가 전체 노출의 60~92%</b>를 만들어내고 있습니다 — 광고를 켜면 노출·유입이 즉시 반응합니다.</>}
        </div>
      </div>
    );
  }
  const imp = adflow.imp_share;
  return (
    <>
      <div className="dpr-box yes">
        <div className="dpr-gt">🚀 광고(CPC) 기여도 — 실측</div>
        <div className="dpr-gd">따종디엔핑이 계산한 <b>광고 성과</b>와 <b>전체 트래픽</b>을 같은 기간으로 맞춰 비교했습니다.</div>
        <div style={{ margin: '14px 0 6px' }}>
          <div className="dpr-share">
            <div className="dpr-share-ad" style={{ width: `${imp}%` }}>광고 {imp}%</div>
            <div className="dpr-share-org">자연 {Math.round((100 - imp) * 10) / 10}%</div>
          </div>
          <div className="dpr-share-cap">
            전체 노출 {num(adflow.total_imp)}회 중 광고 {num(adflow.ad_imp)}회 · {adflow.period}
          </div>
        </div>
        <Stat items={[
          { value: `${imp}%`, label: '노출 기여도', color: '#9B70FF' },
          { value: `${adflow.click_share}%`, label: '유입(클릭) 기여도', color: '#34d399' },
          { value: <>{num(adflow.ad_click)}<span style={{ fontSize: '.7rem' }}>회</span></>, label: '광고 유입 클릭' },
          { value: adflow.ad_ctr, label: '광고 클릭률' },
        ]} />
      </div>
      <div className="dpr-foot-note" style={{ marginTop: 14 }}>
        💡 <b>광고를 끄면 무엇을 잃는가</b> — {name}의 노출 중 <b>{imp}%</b>가 광고에서 발생했고, 매장으로 들어온 클릭의 <b>{adflow.click_share}%</b>({num(adflow.ad_click)}회)가 광고 유입입니다. 광고를 중단하면 이 몫이 <b>그대로 사라지고</b> 상권 노출 순위도 함께 내려갑니다.{' '}
        <span className="dpr-dim">※ 광고·전체 모두 '次(횟수)' 단위로 같은 기간({adflow.period})을 비교한 실측값입니다.</span>
      </div>
    </>
  );
};

// ── 상권 지배력 + Traffic Gap ──────────────────────────────────────
const DominanceSection = ({ dominance, funnel, days, period }) => {
  const d = dominance || {};
  const down = String(d.trend || '').startsWith('-');
  const mult = d.multiple;
  const dayAvg = d.daily_avg;
  const [begin, end] = String(period || '').split('~');

  const ours = dayAvg || 0;
  const region = d.region_view && days ? Math.floor(d.region_view / days) : 0;
  const gapMult = region ? ours / region : 0;
  const lead = gapMult >= 1;
  const mx = Math.max(ours, region) || 1;

  return (
    <>
      <Stat items={[
        { value: `${d.rank}위`, label: <>상권 노출 순위<br />({d.city} · {d.category})</>, color: '#9B70FF' },
        { value: mult != null ? `${mult}배` : '-', label: '상권 평균 대비 노출', color: '#34d399' },
        { value: `${down ? '▼' : '▲'} ${d.trend}`, label: <>전월 대비 노출<br /><span style={{ fontSize: '.62rem' }}>(플랫폼 近30天)</span></>, color: down ? '#fca5a5' : '#6ee7b7' },
        { value: `${num(dayAvg)}명`, label: '일평균 노출(사람)' },
      ]} />
      <div className="dpr-foot-note" style={{ marginTop: 14 }}>
        💡 우리 매장은 <b>{d.city} {d.category}</b> 상권에서 노출 <b>{d.rank}위</b>, 노출량은 상권 평균의 <b>{mult}배</b>이며, 전월 대비 <b>{d.trend} {down ? '감소' : '증가'}</b>했습니다.{' '}
        <span className="dpr-dim">※ 최근 30일({begin}~{end}, 조회 당일 제외) 기준 · 순위·전월비는 플랫폼 공식값(近30天)입니다.</span>
      </div>

      {region > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className={`dpr-tg-box ${lead ? 'up' : 'down'}`}>
            <div className={`dpr-tg-badge ${lead ? 'up' : 'down'}`}>
              {lead ? '▲' : '▼'} 상권 평균의 <b>{gapMult.toFixed(1)}배</b>
            </div>
            <div className="dpr-tg-row">
              <div className="dpr-tg-lb">우리 매장</div>
              <div className="dpr-tg-bar"><div className="dpr-tg-fill ours" style={{ width: `${Math.max(Math.round(ours / mx * 100), 8)}%` }}>{num(ours)}명</div></div>
            </div>
            <div className="dpr-tg-row">
              <div className="dpr-tg-lb">상권 평균</div>
              <div className="dpr-tg-bar"><div className="dpr-tg-fill reg" style={{ width: `${Math.max(Math.round(region / mx * 100), 8)}%` }}>{num(region)}명</div></div>
            </div>
            <div className="dpr-tg-cap">하루 평균 노출 도달 인원 · 최근 {days}일 · {d.city} {d.category} 동종업종</div>
          </div>
          <div className="dpr-foot-note" style={{ marginTop: 14 }}>
            {lead
              ? <>💪 <b>{funnel?.storeName}</b> 같은 상권 동종업종 평균보다 <b>{gapMult.toFixed(1)}배</b> 많이 노출되고 있습니다 (하루 {num(ours)}명 vs {num(region)}명). 이 격차가 곧 <b>신규 고객 유입 우위</b>입니다.</>
              : <>⚠️ 상권 평균보다 노출이 <b>{(region / (ours || 1)).toFixed(1)}배 적습니다</b> (하루 {num(ours)}명 vs {num(region)}명). 경쟁 매장들이 노출을 가져가는 동안 우리 매장은 <b>고객에게 보이지 않는 상태</b>입니다. 같은 상권 내 광고 집행 매장은 평균의 8~9배까지 노출되고 있습니다.</>}
          </div>
        </div>
      )}
    </>
  );
};

// ── 퍼널 ───────────────────────────────────────────────────────────
const FunnelSection = ({ funnel }) => {
  const f = funnel || {};
  const view = f.exposure || 0, clicks = f.click || 0, visit = f.visit || 0, intent = f.intent || 0, buy = f.buy || 0;
  // 노출은 UV(사람), 클릭은 PV(횟수)라 그대로 나누면 클릭률이 100%를 넘는다.
  // 클릭률은 같은 단위(노출 횟수 대비 클릭 횟수)로 계산한다.
  const viewPv = f.exposure_pv || view;
  const gb = !!f.groupbuy_on;
  const mx = Math.max(view, clicks, 1);   // 클릭(PV)이 노출(UV)보다 클 수 있다
  const w = (v) => Math.max(16, Math.min(100, Math.round(v / mx * 100)));
  const p1 = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '-');
  const ctr = f.ctr != null ? `${f.ctr}%` : p1(clicks, viewPv);

  const steps = [
    { lab: '노출', sub: '曝光 · 목록/검색에 노출된 사람', n: `${num(view)}명`, ex: '얼마나 많은 잠재고객에게 노출됐나', g: 'linear-gradient(90deg,#7434FF,#9B70FF)', w: w(view) },
    { lab: '클릭', sub: '点击 · 매장을 눌러 본 횟수', n: `${num(clicks)}회`, ex: '노출된 사람이 실제로 클릭한 횟수', g: 'linear-gradient(90deg,#6366f1,#818cf8)', w: w(clicks) },
    { lab: '방문', sub: '访问 · 매장 페이지 순 방문자', n: `${num(visit)}명`, ex: '클릭해서 매장을 방문한 실제 인원', g: 'linear-gradient(90deg,#3b82f6,#60a5fa)', w: w(visit) },
    { lab: '관심', sub: '意向 · 찜·전화·길찾기·团购조회', n: `${num(intent)}명`, ex: '메뉴·리뷰 보고 구매 의향을 표현', g: 'linear-gradient(90deg,#10b981,#34d399)', w: w(intent) },
    { lab: '구매', sub: '团购 · 실제 구매·검증',
      n: gb ? `${num(buy)}건` : '0건',
      ex: gb ? (buy > 0 ? '团购 검증 발생' : '团购 운영 매장 (당 집계기간 0건)') : '团购 미개설 → 매출 추적 불가',
      g: 'linear-gradient(90deg,#ef4444,#f87171)', w: w(gb && buy > 0 ? buy : 1) },
  ];
  const convs = ['',
    `↓ 클릭률(노출 횟수→클릭 횟수) ${ctr}`,
    `↓ 방문 전환(노출→방문) ${f.visit_rate != null ? f.visit_rate + '%' : p1(visit, view)}`,
    `↓ 관심 전환(방문→관심) ${p1(intent, visit)}`,
    `↓ 구매 전환(관심→구매) ${gb && buy > 0 && intent ? p1(buy, intent) : (gb ? '집계 대기' : '0% (团购 미개설)')}`,
  ];

  return (
    <>
      <div className="dpr-funnel">
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            {convs[i] && <div className="dpr-conv">{convs[i]}</div>}
            <div className="dpr-fstep">
              <div className="dpr-fl">{s.lab} <small>{s.sub}</small></div>
              <div className="dpr-fwrap">
                <div className="dpr-fbar mono" style={{ width: `${s.w}%`, background: s.g }}><span className="dpr-fnum">{s.n}</span></div>
                <div className="dpr-fex">{s.ex}</div>
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
      <div className="dpr-foot-note" style={{ marginTop: 18 }}>
        💡 <b>진단</b> — 노출 {num(view)}명 → 클릭 {num(clicks)}회 → <b>방문 {num(visit)}명</b> → 관심 {num(intent)}명으로 이어졌습니다 (클릭률 {ctr}, 방문 전환 {f.visit_rate != null ? f.visit_rate + '%' : p1(visit, Math.max(view, 1))}).{' '}
        {gb
          ? '团购 운영 매장입니다 — 이번 기간 검증은 대시보드 기준으로 별도 확인해 매출과 연결하겠습니다.'
          : <>团购 상품이 없어 '구매' 단계가 0으로, 높은 관심이 매출로 집계되지 않습니다 → <b>团购 개설이 최우선</b>입니다.</>}{' '}
        <span className="dpr-dim">※ 노출·방문·관심 = 사람 수, 클릭 = 횟수. 클릭률은 노출 횟수({num(viewPv)}회) 대비입니다.</span>
      </div>
    </>
  );
};

// ── 团购 ───────────────────────────────────────────────────────────
const GroupbuySection = ({ gb, name }) => {
  const { brand } = useBrand();
  const pts = [
    ['따종디엔핑이 团购 보유 매장에 노출 가점(랭킹 우대)을 부여', '团购가 있으면 검색·목록 상단 노출 확률↑ — 플랫폼 공식 정책'],
    ['할인 딜 자체가 신규 클릭·유입을 유발', "'세트 특가'가 목록에서 눈에 띄어 클릭률·유입↑"],
    ['매출·전환이 숫자로 추적됨', "검증량·검증액으로 ROI 측정 (퍼널의 '구매' 데이터가 이것)"],
    ['중국 본토 맛집은 团购를 전략적으로 필수 활용', '현지 표준 — 미개설은 경쟁에서 구조적으로 불리'],
  ];
  return (
    <>
      <div className={`dpr-box ${gb ? 'yes' : 'no'}`}>
        <div className="dpr-gt">{gb ? '📈 团购 운영 중 — 확대 적용으로 매출을 더 키울 수 있습니다' : '🚀 团购 미개설 — 지금 가장 큰 성장 기회를 놓치고 있습니다'}</div>
        <div className="dpr-gd">
          <b>团购(퇀거우)</b>란, 세트메뉴·할인 딜 상품을 따종디엔핑에 <b>미리 온라인으로 등록·판매</b>하고 고객이 매장에서 QR로 검증(核销)하는 <b>공동구매형 상품</b>입니다. 중국 관광객이 방문 전 앱에서 미리 결제·예약하는 <b>핵심 구매 경로</b>이자, 퍼널의 마지막 "구매" 단계가 바로 이 团购 검증입니다.
        </div>
        <div className="dpr-gb-pts">
          {pts.map(([h, d], i) => (
            <div className="dpr-gb-pt" key={i}><span className="dpr-pi">✓</span><div>{h} <span className="dpr-dim2">— {d}</span></div></div>
          ))}
        </div>
        <div className={`dpr-gb-cta ${gb ? 'yes' : 'no'}`}>
          {gb
            ? <><b>{name}은(는) 团购 운영 매장</b>입니다. 세트 다양화·시즌 한정 딜·객단가 상향 세트를 추가하면 노출 가점과 유입이 더 커집니다. <b>{brand}가 딜 구성·가격 A/B를 최적화</b>해 검증량(매출)을 확대합니다.</>
            : <><b>{name}은(는) 아직 团购가 없어</b> 위 3가지(노출 가점·유입·매출 추적)를 모두 놓치고 있습니다. 따종디엔핑 본사도 团购 개설을 적극 유도하며, 중국 본토 인기 매장은 团购를 필수로 운영합니다. <b>{brand}가 세트 상품 기획·등록·가격 설계까지 대행</b>합니다 — 개설만 하면 노출·유입이 즉시 반응합니다.</>}
        </div>
        <CtaRow
          text={gb ? `세트 다양화·시즌 딜 구성을 ${brand}가 설계·등록해 드립니다.` : `기획·등록·가격 설계까지 ${brand}가 대행합니다. 신청만 해주세요.`}
          label={gb ? '团购 상품 추가·확대 신청' : '团购 상품 진열 신청'}
        />
      </div>
    </>
  );
};

// ── 일자별 추이 차트 ───────────────────────────────────────────────
const TrendChart = ({ series }) => {
  const s = series || {};
  if (!s.d || !s.d.length) return <div className="dpr-foot-note">일자별 데이터가 없습니다.</div>;
  const rows = s.d.map((d, i) => ({ date: d, '우리 매장': s.own?.[i] ?? 0, '상권 평균': s.reg?.[i] ?? 0 }));
  return (
    <div className="dpr-chart">
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={rows} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="dprOwn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7434FF" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#7434FF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={18} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
          <Tooltip
            contentStyle={{ background: 'rgba(13,15,26,.94)', border: '1px solid #7434FF', borderRadius: 10, color: '#fff' }}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(v) => [Number(v).toLocaleString() + '명']}
          />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
          <Area type="monotone" dataKey="우리 매장" stroke="#7434FF" strokeWidth={2.4} fill="url(#dprOwn)" dot={false} activeDot={{ r: 5 }} />
          <Area type="monotone" dataKey="상권 평균" stroke="#10b981" strokeWidth={2} fill="none" dot={false} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// ── 리뷰 ───────────────────────────────────────────────────────────
const StarDist = ({ reviews }) => {
  const dist = reviews?.star_dist;
  if (!dist) return null;
  const norm = Object.entries(dist)
    .map(([k, v]) => [parseFloat(k), Number(v)])
    .filter(([k, v]) => !Number.isNaN(k) && v > 0)
    .sort((a, b) => b[0] - a[0]);
  if (!norm.length) return null;
  const total = norm.reduce((a, [, v]) => a + v, 0) || 1;
  const mx = Math.max(...norm.map(([, v]) => v)) || 1;
  return (
    <>
      <div className="dpr-subh">⭐ 별점 분포 <span className="dpr-subh-cap">· 최근 수집 리뷰 기준</span></div>
      <div className="dpr-sd-box">
        {reviews.avg_star && (
          <div className="dpr-sd-head">
            <span className="dpr-sd-avg">★{+Number(reviews.avg_star).toFixed(2)}</span>
            <span className="dpr-sd-cap">최근 리뷰 {total}건 평균</span>
          </div>
        )}
        {norm.map(([s, cnt]) => (
          <div className="dpr-sd-row" key={s}>
            <div className="dpr-sd-lb">★{+s.toFixed(1)}</div>
            <div className="dpr-sd-bar"><div className={`dpr-sd-fill${s <= 3.5 ? ' low' : ''}`} style={{ width: `${Math.max(Math.round(cnt / mx * 100), 4)}%` }} /></div>
            <div className="dpr-sd-num">{cnt}건 <span>({Math.round(cnt / total * 100)}%)</span></div>
          </div>
        ))}
      </div>
    </>
  );
};

const ReviewSection = ({ reviews }) => {
  const { brand } = useBrand();
  const r = reviews;
  if (!r) return <div className="dpr-foot-note">이번 기간 리뷰 분석 데이터가 없습니다.</div>;
  const recent = r.unanswered ?? r.recent ?? 0;
  return (
    <>
      <div className="dpr-rsum">
        {r.avg_star != null && <span className="dpr-rchip s">⭐ 최근 평균 ★{+Number(r.avg_star).toFixed(2)}</span>}
        <span className="dpr-rchip g">👍 누적 호평 {num(r.good)}건 ({r.good_rate}%)</span>
        <span className="dpr-rchip b">⚠️ 中差评(악성) {num(r.bad)}건</span>
        <span className="dpr-rchip u">✉️ 미답변 {num(recent)}건 (답변율 0%)</span>
      </div>
      <div className="dpr-s-note" style={{ marginLeft: 0 }}>
        이번 달 신규 리뷰 {num(recent)}건 · 답글이 하나도 없는 상태입니다. 아래는 대표 호평과, 사장님이 꼭 대응해야 할 악성리뷰입니다.
      </div>

      {r.summary && <div className="dpr-rsummary">🧠 <b>AI 리뷰 요약</b> — {r.summary}</div>}

      <StarDist reviews={r} />

      <div className="dpr-subh">👍 이번 달 대표 호평</div>
      {(r.pos || []).map((p, i) => (
        <div className="dpr-rev pos" key={i}>
          <div className="dpr-rh"><Stars v={p.star} /><span className="dpr-who">{p.author}</span><span className="dpr-tp">호평</span></div>
          <div className="dpr-cn-o"><span className="dpr-lab">[중국어 원문]</span>{p.cn}</div>
          <div className="dpr-ko-t"><span className="dpr-lab">[한글 번역]</span>{p.ko}</div>
        </div>
      ))}

      <div className="dpr-subh">⚠️ 사장님이 꼭 대응해야 할 악성리뷰</div>
      {(r.neg || []).length > 0 ? (r.neg).map((n, i) => (
        <div className="dpr-rev neg" key={i}>
          <div className="dpr-rh">
            <Stars v={n.star} low={Number(n.star) > 0 && Number(n.star) <= 3} />
            <span className="dpr-who">{n.author}</span>
            <span className="dpr-tn">악성{n.star ? ` ★${+Number(n.star).toFixed(1)}` : ''}</span>
          </div>
          <div className="dpr-cn-o"><span className="dpr-lab">[중국어 원문]</span>{n.cn}</div>
          <div className="dpr-ko-t"><span className="dpr-lab">[한글 번역]</span>{n.ko}</div>
          {(n.reply_cn || n.reply_ko) && (
            <div className="dpr-reply">
              <div className="dpr-rl">✍️ {brand}가 달 수 있는 정중한 답글 (사과·해명·보상)</div>
              {n.reply_cn && <div className="dpr-rc">🇨🇳 {n.reply_cn}</div>}
              {n.reply_ko && <div className="dpr-rk">🇰🇷 {n.reply_ko}</div>}
            </div>
          )}
        </div>
      )) : (
        <div className="dpr-act-note">이번 기간 신규 악성리뷰가 없습니다.</div>
      )}

      <div className="dpr-act-note">
        🛡️ <b>악성리뷰는 임의로 삭제·숨김이 불가</b>합니다. 유일한 조치는 ① 정중한 <b>사과·해명</b> 답글 ② <b>보상 안내</b>(위챗 추가 유도 → 환불 또는 다음 방문 선물) ③ 신규 <b>호평으로 밀어내기</b>입니다. 답글을 보고 고객이 위챗으로 연락해오길 기다리는 것이 실질적인 해결 경로입니다.
        <br /><br />
        💎 <b>{brand} 리뷰관리 서비스</b>를 이용하시면 악성리뷰를 <b>더 자주·더 잘 모니터링</b>하고, 원어민 매니저가 즉시 사과·해명·보상 답글로 대응해 드립니다.
      </div>

      {((r.kw_p || []).length > 0 || (r.kw_n || []).length > 0) && (
        <>
          <div className="dpr-subh">🏷️ 리뷰 키워드</div>
          <div className="dpr-kw">
            {(r.kw_p || []).map((k, i) => <span className="dpr-kwc p" key={`p${i}`}>#{k[0]} <small>{k[1]}</small></span>)}
            {(r.kw_n || []).map((k, i) => <span className="dpr-kwc n" key={`n${i}`}>#{k[0]} <small>{k[1]}</small></span>)}
          </div>
        </>
      )}

      <CtaRow text={`악성리뷰 모니터링과 원어민 답글 작성을 ${brand}가 대신 관리해 드립니다.`} label="리뷰관리 서비스 신청" />
    </>
  );
};

// ── 실행 제안 ──────────────────────────────────────────────────────
const ActionPlan = ({ cpc, gb, actions }) => {
  const { brand } = useBrand();
  const bal = Number(cpc?.balance) || 0;
  const acts = [];
  if (!cpc || bal <= 0) acts.push(['1', '🔴 광고 즉시 충전', '잔액 0원으로 광고가 꺼져 노출 순위가 하락 중입니다.', `→ 권장 5,000元 충전 시 ${brand}가 즉시 재개·운영`]);
  else if (bal < 1000) acts.push(['1', '🟡 광고 잔액 충전 준비', '곧 소진되어 노출 공백이 생길 수 있습니다.', '→ 소진 전 충전으로 상단 노출 유지']);
  else acts.push(['1', '🟢 성수기 예산 상향 검토', '잔액이 넉넉해 점유율 확대 최적 타이밍입니다.', '→ 중국 연휴 피크타임 입찰가 상향']);

  acts.push(gb
    ? ['2', '🛒 团购 세트 구성 최적화', '구매 전환을 더 끌어올릴 여지가 있습니다.', '→ 인기 메뉴 묶음·객단가 세트 추가']
    : ['2', '🛒 团购 상품 개설 (매출 추적 시작)', '방문·관심은 높은데 团购가 없어 매출이 0으로 집계됩니다.', '→ 团购 세트 1~2개 개설로 전환·매출 가시화']);
  acts.push(['3', '✍️ 미답변 리뷰 답글 + 악성 대응', '답변율 0%. 특히 악성리뷰는 노출·전환에 직접 타격.', `→ ${brand} 리뷰관리로 악성 즉시 대응·호평 밀어내기`]);
  acts.push(['4', '⭐ 호평 리뷰 이벤트 강화', '인플루언서·체험단 방문을 호평 리뷰로 연결.', '→ 영수증 리뷰 유도 멘트 교육 + 음료 제공']);

  return (
    <div className="dpr-plan">
      <h2>🚀 이번 달 실행 제안 (Action Plan)</h2>
      <div className="dpr-subttl">실측 데이터 기반 우선순위</div>
      <div className="dpr-acts">
        {acts.map(([n, h, d, w]) => (
          <div className="dpr-act" key={n}>
            <div className="dpr-n">{n}</div>
            <div><div className="dpr-h">{h}</div><div className="dpr-d">{d}</div><div className="dpr-w">{w}</div></div>
          </div>
        ))}
      </div>
      {(actions || []).length > 0 && (
        <>
          <div className="dpr-subttl" style={{ marginTop: 22 }}>🧠 AI 리뷰 분석이 제안하는 개선 포인트</div>
          <div className="dpr-ai-acts">
            {actions.map((a, i) => <div className="dpr-ai-act" key={i}><span>▸</span><div>{typeof a === 'string' ? a : (a.text || JSON.stringify(a))}</div></div>)}
          </div>
        </>
      )}
    </div>
  );
};

// ── 페이지 ─────────────────────────────────────────────────────────
export default function DpReportPage() {
  const [sp] = useSearchParams();
  const campaignId = sp.get('campaignId');
  const [state, setState] = useState({ loading: true, err: null, data: null });

  useEffect(() => {
    if (!campaignId) { setState({ loading: false, err: 'campaignId가 없습니다.', data: null }); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/client-schedule?campaignId=${encodeURIComponent(campaignId)}`);
        if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다 (${res.status})`);
        const json = await res.json();
        if (alive) setState({ loading: false, err: null, data: json });
      } catch (e) {
        if (alive) setState({ loading: false, err: e.message, data: null });
      }
    })();
    return () => { alive = false; };
  }, [campaignId]);

  const { loading, err, data } = state;
  const detail = data?.dpReport?.detail;

  // 화이트라벨 — API가 빈값·'직영'·'탐코리아'를 'TAMKOREA'로 정규화해 준다.
  const partnerName = data?.partnerName || 'TAMKOREA';
  const isPartner = partnerName !== 'TAMKOREA';
  const brand = isPartner ? partnerName : 'Tam Korea';

  useEffect(() => {
    document.title = detail?.store?.name
      ? `${detail.store.name} · 따종디엔핑 월간 리포트`
      : `따종디엔핑 월간 리포트 · ${brand}`;
  }, [detail, brand]);

  if (loading) return <div className="dpr-page"><div className="dpr-msg">리포트를 불러오는 중…</div></div>;
  if (err) return <div className="dpr-page"><div className="dpr-msg err">{err}</div></div>;

  if (!detail) {
    return (
      <BrandCtx.Provider value={{ brand, isPartner }}>
        <div className="dpr-page">
          <div className="dpr-msg">
            <b>{data?.brandName} {data?.branchName}</b>의 따종디엔핑 리포트가 아직 준비되지 않았습니다.
            <div className="dpr-msg-sub">월간 리포트는 매월 집계 완료 후 공개됩니다.</div>
            <div style={{ marginTop: 18 }}><Kko label="따종디엔핑 문의하기" /></div>
          </div>
        </div>
      </BrandCtx.Provider>
    );
  }

  const { store, period, days, funnel, dominance, adflow, cpc, reviews, series, generated_at: gen } = detail;
  const name = store?.name || `${data?.brandName || ''} ${data?.branchName || ''}`.trim();
  const gb = !!funnel?.groupbuy_on;

  return (
    <BrandCtx.Provider value={{ brand, isPartner }}>
    <div className="dpr-page">
      <div className="dpr-wrap">
        <div className="dpr-hero">
          <div className="dpr-bl">{brand} · 따종디엔핑(大众点评) 월간 마케팅 리포트</div>
          <h1>{name}</h1>
          <div className="dpr-cn">{store?.cn}{store?.id ? ` · 编号 ${store.id}` : ''}</div>
          <div className="dpr-chips">
            <span className="dpr-chip">📅 {String(period || '').replace('~', ' ~ ')}</span>
            {store?.cat && <span className="dpr-chip">{store.cat}</span>}
            <span className="dpr-chip">🌏 중화권 관광객 · 인플루언서 바이럴</span>
          </div>
        </div>

        <Section icon="📢" title="CPC 광고 · 잔액 & 노출 기여" note="推广通 계정 실측 · 광고비는 元(RMB)">
          <CpcSection cpc={cpc} funnel={funnel} dominance={dominance} store={store} />
        </Section>

        <Section icon="🚀" title="광고 기여도 — 광고가 만든 노출·유입" note="推广通 광고 성과 vs 전체 트래픽 · 동일 기간 실측 비교">
          <AdflowSection adflow={adflow} name={name} cpc={cpc} />
        </Section>

        <div className="dpr-kpis">
          <div className="dpr-kpi"><div className="dpr-l">🎯 노출 <span className="dpr-sm">曝光</span></div><div className="dpr-v mono">{num(funnel?.exposure)}<small>명</small></div><div className="dpr-dd up">상권 {dominance?.rank}위</div></div>
          <div className="dpr-kpi"><div className="dpr-l">👣 방문 <span className="dpr-sm">访问</span></div><div className="dpr-v mono">{num(funnel?.visit)}<small>명</small></div><div className="dpr-dd neu">클릭 유입</div></div>
          <div className="dpr-kpi"><div className="dpr-l">🛒 관심 <span className="dpr-sm">意向</span></div><div className="dpr-v mono">{num(funnel?.intent)}<small>명</small></div><div className="dpr-dd neu">{funnel?.intent_rate}% 전환</div></div>
          <div className="dpr-kpi"><div className="dpr-l">⭐ 호평률 <span className="dpr-sm">好评</span></div><div className="dpr-v mono">{reviews?.good_rate ?? '-'}<small>%</small></div><div className="dpr-dd up">{reviews?.avg_star ? `최근 평균 ★${+Number(reviews.avg_star).toFixed(2)}` : `${num(reviews?.good)}건`}</div></div>
        </div>

        <Section icon="🏆" title="상권 지배력 (우리 vs 상권 평균)" note="竞争分析 실측 · 순위·배수·전월 대비">
          <DominanceSection dominance={dominance} funnel={{ ...funnel, storeName: name }} days={days} period={period} />
        </Section>

        <Section icon="🔻" title="유입 → 전환 퍼널 (노출·클릭·방문·관심·구매)" note="经营参谋 실측 · 최근 30일(월간) · 노출·방문·관심=사람수, 클릭=횟수">
          <FunnelSection funnel={funnel} />
        </Section>

        <Section icon="🎁" title="团购(공동구매) — 노출·매출의 핵심 지렛대" note="따종디엔핑 할인 딜 상품 · 노출 가점 정책">
          <GroupbuySection gb={gb} name={name} />
        </Section>

        <Section icon="📈" title="일자별 노출 추이 (우리 vs 상권 평균)" note="최근 30일 일자별 노출 도달 · 우리 매장 vs 상권 평균">
          <TrendChart series={series} />
        </Section>

        <Section icon="💬" title="월간 리뷰 관리 (호평·악성 대응)" note="评价管理 실측 · 악성리뷰 답글 예시 포함">
          <ReviewSection reviews={reviews} />
        </Section>

        <ActionPlan cpc={cpc} gb={gb} actions={reviews?.actions} />

        <div className="dpr-fo">
          <b>{brand} 원스톱 대행</b> — 따종디엔핑 입점 · 세팅 · CPC 운영 · 인플루언서/체험단 바이럴 · 리뷰 관리<br />
          © 2026 {brand} · 중화권 마케팅 전문 에이전시<br />
          <span className="dpr-fo-sm">
            본 리포트는 따종디엔핑 상인포털(大众点评) 실측 데이터를 기반으로 작성되었습니다.
            {gen && ` · 데이터 갱신 ${String(gen).replace('T', ' ').slice(0, 16)}`}
          </span>
        </div>
      </div>
    </div>
    </BrandCtx.Provider>
  );
}
