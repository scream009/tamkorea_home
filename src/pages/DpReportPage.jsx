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

// 따종디엔핑 광고 상품 — 중문 그대로 두면 고객사가 못 읽는다
const PRODUCT_KO = {
  '推广通': 'CPC 검색광고',
  '智选展位': '배너·추천 노출',
  '品牌秀': '브랜드 쇼케이스',
  '商户通': '상점 프로모션',
};

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
// ── 광고 설정 (예산·클릭단가·노출시간) ─────────────────────────
// 리포트가 "얼마 썼다"만 말하면 사장님이 손댈 곳이 안 보인다.
// 손잡이는 셋뿐이다 — 예산 / 클릭단가 / 노출시간. 현재값을 보여줘야 제안이 성립한다.
// 넛지 판정(nudge)은 API 가 계산해 내려준다 — 화면은 문구만 고른다.
const HOURS_LABEL = ['0', '', '', '3', '', '', '6', '', '', '9', '', '',
                     '12', '', '', '15', '', '', '18', '', '', '21', '', ''];

const AdSettings = ({ ad }) => {
  const { brand } = useBrand();
  if (!ad) return null;
  const { budget, floatRatio, peak, bid, hours, hoursOn, yesterday, useRate, nudge } = ad;

  // 노출시간 문자열("매일 11:00-21:00")에서 시작·끝을 뽑아 24칸으로 그린다.
  // 요일마다 다른 매장은 문자열만 보여주고 막대는 생략한다(오해를 만들지 않는다).
  let from = null, to = null;
  const m = /^매일\s+(\d{2}):00-(\d{2}):00$/.exec(String(hours || ''));
  if (m) { from = Number(m[1]); to = Number(m[2]); }

  const NUDGE = {
    // 잔액 0 — 위쪽에 이미 빨간 충전 배너가 크게 떠 있다. 같은 말을 반복하지 않고
    // '아래 숫자가 0인 이유'만 사실로 설명한다.
    // ⚠️ "충전이 먼저입니다" 같은 판단·지시는 쓰지 않는다. 우리끼리 하는 말이지
    //    사장님께 드릴 말이 아니다(2026-08-02 Owner 지적).
    no_balance: {
      pill: '안내', cls: 'warn',
      title: '잔액이 소진되어 광고가 나가지 않았습니다',
      body: <>잔액이 없어 노출이 발생하지 않았습니다. 아래 집행액과 소진률이
        0으로 표시됩니다. <b>광고 설정은 그대로 살아 있습니다</b> — 충전되면 별도 작업 없이
        지금 이 설정 그대로 바로 재개됩니다.</>,
    },
    low_balance: {
      pill: '안내', cls: 'warn',
      title: '잔액이 곧 소진됩니다',
      body: <>지금 집행 속도면 며칠 안에 노출이 멈춥니다. 광고가 멈추면 상권 노출 순위가
        내려가고 회복에는 시간이 걸립니다. 소진 전에 여유를 두시면 순위를 지킬 수 있습니다.</>,
    },
    // 잔액은 있는데 집행이 0 — 예산이 남는 것과는 원인이 다르다.
    no_spend: {
      pill: '안내', cls: 'info',
      title: '잔액은 있으나 집행이 없었습니다',
      body: <>예산이 남아서가 아니라 광고가 <b>노출 기회를 얻지 못한</b> 경우입니다.
        노출 시간대에 상권 경쟁이 몰렸거나 입찰가가 밀렸을 수 있습니다.
        {brand}가 원인을 확인해 알려드리겠습니다.</>,
    },
    budget_capped: {
      pill: '검토 제안', cls: 'warn',
      title: '예산이 매일 상한에 닿고 있습니다',
      body: <>하루 예산을 <b>전액 소진</b>했습니다. 광고가 아직 노출될 수 있는 시간에 예산이
        먼저 끝나면, 그 뒤에 검색한 손님에게는 매장이 보이지 않습니다.
        충전 시점과 함께 예산 조정도 한번 같이 보시면 좋겠습니다.</>,
    },
    room_to_grow: {
      pill: '검토 제안', cls: 'info',
      title: '예산이 남고 있습니다 — 노출 기회를 늘릴 수 있습니다',
      body: <>예산이 부족한 게 아니라 <b>광고가 보일 기회 자체가 적다</b>는 뜻입니다.
        노출 시간을 넓히거나 클릭 단가를 올리는 두 가지 방법이 있습니다.
        어느 쪽이 효율적인지 {brand}가 상권 데이터로 확인해 제안드리겠습니다.
        <b> 추가 비용 없이 설정만으로</b> 개선되는 구간일 수 있습니다.</>,
    },
    bid_only: {
      pill: '검토 제안', cls: 'info',
      title: '노출 시간은 이미 최대입니다 — 남은 조정 여지는 단가입니다',
      body: <>노출 시간이 <b>24시간 전부</b> 열려 있어 더 넓힐 곳이 없고, 예산도 남아 있습니다.
        이런 경우는 <b>클릭 단가가 상권 경쟁가에 밀려 노출을 충분히 확보하지 못한</b> 상황일
        수 있습니다. 단가를 얼마나 올리면 노출이 어디까지 회복되는지 확인해 제안드리겠습니다.</>,
    },
  }[nudge] || null;

  return (
    <div className="dpr-adset">
      <div className="dpr-adset-h">⚙️ 현재 광고 설정 <span className="dpr-sm">推广通 실측</span></div>
      <div className="dpr-adset-grid">
        {budget != null && (
          <div className="dpr-adset-c">
            <div className="dpr-adset-l">{floatRatio ? '평일 예산' : '하루 예산'}</div>
            <div className="dpr-adset-v mono">{num(budget)}<small>元</small></div>
            <div className="dpr-adset-f">
              {floatRatio && peak ? `주말·명절 ${num(peak)}元 (+${floatRatio}%)` : '주말 상향 미설정'}
            </div>
          </div>
        )}
        {yesterday != null && useRate != null && (
          <div className="dpr-adset-c">
            <div className="dpr-adset-l">일 집행액</div>
            {/* 위 광고비 소진 지표가 반올림 표시라 여기도 맞춘다(74.29元 → 74元) */}
            <div className="dpr-adset-v mono">{num(Math.round(yesterday))}<small>元</small></div>
            <div className="dpr-adset-f">예산의 {useRate}%</div>
          </div>
        )}
        {bid != null && (
          <div className="dpr-adset-c">
            <div className="dpr-adset-l">클릭 단가 <span className="dpr-sm">出价</span></div>
            <div className="dpr-adset-v mono">{bid}<small>元</small></div>
            <div className="dpr-adset-f">입찰 상한</div>
          </div>
        )}
        {hours && (
          <div className="dpr-adset-c">
            <div className="dpr-adset-l">노출 시간</div>
            <div className="dpr-adset-v mono" style={{ fontSize: '1.05rem' }}>
              {hours.replace('매일 ', '')}
            </div>
            <div className="dpr-adset-f">{hoursOn ? `주 ${hoursOn}시간` : '매일'}</div>
          </div>
        )}
      </div>

      {useRate != null && (
        <div className="dpr-adset-gauge">
          <div className="dpr-adset-gt">
            <span>예산 소진률</span>
            <span><b>{useRate}%</b> · {num(yesterday)} / {num(budget)}元</span>
          </div>
          <div className="dpr-adset-bar">
            <i className={useRate >= 95 ? 'full' : useRate < 60 ? 'low' : ''}
               style={{ width: `${Math.min(useRate, 100)}%` }} />
          </div>
        </div>
      )}

      {from != null && (
        <div className="dpr-adset-hours">
          <div className="dpr-adset-strip">
            {Array.from({ length: 24 }, (_, h) => (
              <i key={h} className={h >= from && h < to ? 'on' : ''} />
            ))}
          </div>
          <div className="dpr-adset-ticks">
            {HOURS_LABEL.map((t, i) => <span key={i}>{t}</span>)}
          </div>
        </div>
      )}

      {NUDGE && (
        <div className={`dpr-adset-nudge ${NUDGE.cls}`}>
          <div className="dpr-adset-nh">
            <span className="dpr-adset-pill">{NUDGE.pill}</span>{NUDGE.title}
          </div>
          <p>{NUDGE.body}</p>
        </div>
      )}
    </div>
  );
};

const CpcSection = ({ cpc, funnel, dominance, store, adSet }) => {
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
      {/* 일예산이 방금 위에 나왔으니, 그 바로 밑이 설정 상세의 제자리다 */}
      <AdSettings ad={adSet} />
      {/* 광고비가 CPC 외 다른 상품으로도 나간다. 어디에 쓰였는지 그대로 보여준다. */}
      {Object.keys(cpc.by_product || {}).length > 0 && (
        <div className="dpr-foot-note" style={{ marginTop: 14 }}>
          🧾 <b>어제 광고비 {r0(yst)}元의 사용처</b>{' '}
          {Object.entries(cpc.by_product).map(([k, v], i, arr) => (
            <span key={k}>
              <b>{PRODUCT_KO[k] || k}</b> {Number(v).toLocaleString()}元{i < arr.length - 1 ? ' · ' : ''}
            </span>
          ))}
          <br />
          <span className="dpr-dim">
            ※ 검색·목록 상단 노출을 만드는 것은 <b>{PRODUCT_KO['推广通']}</b>입니다.
            다른 상품은 배너·브랜드 노출 영역에 쓰입니다.
          </span>
        </div>
      )}
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
const fmtDate = (d) => {
  const m = String(d || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}년 ${+m[2]}월 ${+m[3]}일` : String(d || '');
};

// 플랫폼이 유입 데이터를 안 주는 매장 안내.
// 0 을 띄우면 '성과가 없었다'로 읽힌다 — 사실이 아니므로 사유를 그대로 쓴다.
// CPT(유료 입점) 만료가 원인이면 그 사실을 밝힌다. 원인을 숨기면 사장님은
// 우리 수집이 부실한 줄 알고, 갱신하면 해결된다는 것도 모른다.
const TrafficUnavailable = ({ cpt }) => {
  const { brand } = useBrand();
  return (
    <div className="dpr-act-note" style={{ lineHeight: 1.85 }}>
      {cpt?.expired ? (
        <>
          📊 <b>유료 입점(CPT) 기간이 종료되어 유입 데이터가 집계되지 않았습니다.</b><br />
          {cpt.expire && <>계약 종료일: <b>{fmtDate(cpt.expire)}</b><br /></>}
          <b>성과가 0이라는 뜻이 아니라, 플랫폼이 집계를 중단한 상태</b>입니다.
          노출·클릭·방문 수치는 상인 페이지에서도 조회되지 않습니다.
        </>
      ) : cpt?.pending ? (
        <>
          📊 <b>유료 입점(CPT) 개통 처리가 진행 중이라 유입 데이터가 아직 집계되지 않습니다.</b><br />
          {cpt.expire && <>등록된 계약 기간: <b>{fmtDate(cpt.expire)}</b>까지<br /></>}
          플랫폼 개통이 완료되는 즉시 집계가 시작되며, 다음 리포트부터 포함됩니다.
        </>
      ) : (
        <>
          📊 <b>이 매장은 따종디엔핑에서 유입 데이터(노출·클릭·방문)를 제공하지 않습니다.</b><br />
          상인 페이지의 데이터 대시보드에도 방문자·조회수 항목이 표시되지 않는 상태로,{' '}
          <b>성과가 0이라는 뜻이 아니라 집계 자체가 열려 있지 않다는 뜻</b>입니다.<br />
          플랫폼에 데이터 권한 개통을 요청해 두었습니다.
        </>
      )}
      {cpt?.expired && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.12)' }}>
          ⚠️ <b>중단 기간의 데이터는 갱신 후에도 소급 조회되지 않습니다.</b>{' '}
          갱신 시점부터 다시 집계됩니다. 유입 지표를 이어서 보시려면 {brand} 담당자에게
          갱신을 요청해 주세요.
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        그동안은 아래 <b>리뷰 여론 분석</b>으로 매장 상태를 확인해 주세요 — 리뷰는 정상적으로 수집되고 있습니다.
      </div>
    </div>
  );
};

// 아직 유효하지만 곧 끝나는 계약 — 만료되면 그 기간 데이터가 영영 사라지므로
// 데이터가 정상인 동안에도 미리 알린다.
const CptExpirySoon = ({ cpt }) => {
  const { brand } = useBrand();
  if (!cpt?.soon || cpt.expired || cpt.pending) return null;
  return (
    <div className="dpr-act-note" style={{ lineHeight: 1.8, marginBottom: 18 }}>
      ⏳ <b>유료 입점(CPT) 기간이 {fmtDate(cpt.expire)}에 종료됩니다</b>
      {cpt.daysLeft != null && <> (D-{cpt.daysLeft})</>}.<br />
      종료되면 노출·클릭·방문 집계가 중단되고, <b>중단 기간은 갱신 후에도 소급 조회되지 않습니다.</b>{' '}
      리포트를 이어서 받으시려면 만료 전에 {brand} 담당자에게 갱신을 요청해 주세요.
    </div>
  );
};

const FunnelSection = ({ funnel }) => {
  const f = funnel || {};
  const view = f.exposure || 0, visit = f.visit || 0, intent = f.intent || 0, buy = f.buy || 0;
  // shopUV/shopPV 는 **같은 행동(매장 페이지 진입)의 사람/횟수**다.
  // 예전엔 shopPV 를 '클릭', shopUV 를 '방문'으로 갈라 두 단계로 그렸는데,
  // 그러면 노출(사람) 옆에 방문 횟수가 서서 퍼널이 늘어난 것처럼 보인다
  // — 우대 노형본점: 노출 10,304명 → '클릭' 10,910회.
  // 한 단계로 합치고 횟수는 괄호로만 보여준다.
  const viewPv = f.exposure_pv || 0;
  const visitPv = f.visit_pv || f.click || 0;   // click 은 구버전 데이터의 같은 값
  const intentPv = f.intent_pv || 0;
  const gb = !!f.groupbuy_on;
  const FUNNEL_W = [100, 84, 68, 52, 36];
  const p1 = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '-');
  const sub = (n, u) => (n ? <small style={{ opacity: 0.75 }}> ({num(n)}{u})</small> : null);
  // 클릭 ÷ 방문자 = 1인당 조회 횟수. 전환율이 아니다.
  const perVisit = f.per_visit != null ? f.per_visit
    : (visitPv && visit ? +(visitPv / visit).toFixed(1) : null);

  const steps = [
    { lab: '노출', sub: '曝光 · 목록/검색에 뜬 횟수', n: <>{num(viewPv)}회{sub(view, '명')}</>,
      ex: '얼마나 많이 노출됐나 · 실제 사람 수는 괄호', g: 'linear-gradient(90deg,#7434FF,#9B70FF)', w: FUNNEL_W[0] },
    { lab: '클릭', sub: '点击 · 매장을 눌러 본 횟수', n: <>{num(visitPv)}회</>,
      ex: '노출된 것 중 실제로 눌린 횟수', g: 'linear-gradient(90deg,#6366f1,#818cf8)', w: FUNNEL_W[1] },
    { lab: '방문', sub: '访问 · 매장 페이지를 연 사람', n: <>{num(visit)}명</>,
      ex: view ? `노출된 ${num(view)}명 중 ${p1(visit, view)} 가 방문` : '매장을 방문한 실제 인원',
      g: 'linear-gradient(90deg,#3b82f6,#60a5fa)', w: FUNNEL_W[2] },
    { lab: '관심', sub: '意向 · 찜·전화·길찾기·团购조회', n: <>{num(intent)}명{sub(intentPv, '회')}</>,
      ex: '메뉴·리뷰 보고 구매 의향을 표현', g: 'linear-gradient(90deg,#10b981,#34d399)', w: FUNNEL_W[3] },
    { lab: '구매', sub: '团购 · 실제 구매·검증',
      n: gb ? `${num(buy)}건` : '0건',
      ex: gb ? (buy > 0 ? '团购 검증 발생' : '团购 운영 매장 (당 집계기간 0건)') : '团购 미개설 → 매출 추적 불가',
      g: 'linear-gradient(90deg,#ef4444,#f87171)', w: FUNNEL_W[4] },
  ];
  // 클릭→방문 사이는 전환이 아니다 — 같은 행동(매장 페이지 진입)의 횟수와 사람이다.
  // "전환율 28%" 로 쓰면 72%가 이탈한 것처럼 읽혀 사실과 다르다.
  const convs = ['',
    `↓ 클릭률(노출 횟수→클릭 횟수) ${f.ctr != null ? f.ctr + '%' : p1(visitPv, viewPv)}`,
    <>↓ 1인당 평균 {perVisit != null ? `${perVisit}회 조회` : '-'}{' '}
      <small style={{ opacity: 0.7 }}>(전환이 아니라 같은 사람의 반복 조회)</small></>,
    `↓ 관심 전환(방문→관심) ${f.intent_rate != null ? f.intent_rate + '%' : p1(intent, visit)}`,
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
        💡 <b>진단</b> — 노출 {num(viewPv)}회({num(view)}명) → 클릭 {num(visitPv)}회 →{' '}
        <b>방문 {num(visit)}명</b> → 관심 {num(intent)}명으로 이어졌습니다
        {' '}(클릭률 {f.ctr != null ? f.ctr + '%' : p1(visitPv, Math.max(viewPv, 1))},
        {' '}노출된 사람 중 방문 {f.visit_rate != null ? f.visit_rate + '%' : p1(visit, Math.max(view, 1))},
        {' '}관심 전환 {f.intent_rate != null ? f.intent_rate + '%' : p1(intent, Math.max(visit, 1))}).{' '}
        {gb
          ? '团购 운영 매장입니다 — 이번 기간 검증은 대시보드 기준으로 별도 확인해 매출과 연결하겠습니다.'
          : <>团购 상품이 없어 '구매' 단계가 0으로, 높은 관심이 매출로 집계되지 않습니다 → <b>团购 개설이 최우선</b>입니다.</>}{' '}
        <span className="dpr-dim">
          ※ 노출·클릭은 <b>횟수</b>, 방문·관심은 <b>사람 수</b>입니다.
          한 사람이 여러 번 보면 횟수가 사람 수보다 큽니다
          {perVisit != null && <> (이 매장은 방문자 1명당 평균 {perVisit}회 조회)</>}.
        </span>
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

      <div className="dpr-subh">⚠️ 사장님이 꼭 대응해야 할 中差评 (★3.5 이하)</div>
      {(r.neg || []).length > 0 ? (r.neg).map((n, i) => {
        const sev = Number(n.star) > 0 && Number(n.star) <= 3;
        // ★3.5 인데 내용에 불만이 없는 리뷰까지 '악성'이라 부르고 사과 답글을 붙이면
        // 사장님이 놀라고 답글도 어색해진다(호평에 사과한 적이 있다).
        // reply_type 이 없는 예전 데이터는 별점으로 갈음한다.
        const listening = n.reply_type ? n.reply_type === 'listening' : !sev;
        return (
        <div className="dpr-rev neg" key={i}>
          <div className="dpr-rh">
            <Stars v={n.star} low={sev} />
            <span className="dpr-who">{n.author}</span>
            <span className="dpr-tn">
              {listening ? '낮은 별점' : '악성'}{n.star ? ` ★${+Number(n.star).toFixed(1)}` : ''}
            </span>
          </div>
          <div className="dpr-cn-o"><span className="dpr-lab">[중국어 원문]</span>{n.cn}</div>
          <div className="dpr-ko-t"><span className="dpr-lab">[한글 번역]</span>{n.ko}</div>
          {listening && (
            <div className="dpr-foot-note">
              별점은 낮지만 내용에 뚜렷한 불만이 없습니다. 말로 하지 않은 아쉬움이 있을 수 있어
              {' '}<b>사과 대신 확인·감사</b>로 대응합니다.
            </div>
          )}
          {(n.reply_cn || n.reply_ko) && (
            <div className="dpr-reply">
              <div className="dpr-rl">
                ✍️ {brand}가 달 수 있는 {listening ? '답글 (감사·아쉬운 점 확인)'
                                                  : '정중한 답글 (사과·해명·보상)'}
              </div>
              {n.reply_cn && <div className="dpr-rc">🇨🇳 {n.reply_cn}</div>}
              {n.reply_ko && <div className="dpr-rk">🇰🇷 {n.reply_ko}</div>}
            </div>
          )}
        </div>
      );
      }) : (
        <div className="dpr-act-note">이번 기간 신규 中差评(★3.5 이하)가 없습니다.</div>
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
  // 플랫폼이 유입 데이터를 안 주는 매장. 봇이 traffic_unavailable 로 표시해 준다.
  // 예전 리포트에는 그 필드가 없으므로, 노출이 0 인데 기간까지 비어 있으면
  // (정상 매장은 기간이 항상 채워진다) 같은 상황으로 본다.
  const trafficNA = detail.traffic_unavailable === true
    || (!funnel?.exposure && !String(period || '').replace(/[-~\s]/g, ''));
  // CPT 상태는 Airtable(CS_DB) 마스터가 원본 — API lookup 으로 온다.
  // 봇을 다시 돌리지 않아도 반영되도록 응답값을 우선하고, 리포트 JSON 에
  // 박혀 있는 값은 오프라인·구버전 대비 폴백으로만 쓴다.
  const cpt = data?.dpReport?.cpt || data?.cpt || detail.cpt || null;

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
          <CpcSection cpc={cpc} funnel={funnel} dominance={dominance} store={store}
                      adSet={data?.adSet} />
        </Section>

        <Section icon="🚀" title="광고 기여도 — 광고가 만든 노출·유입" note="推广通 광고 성과 vs 전체 트래픽 · 동일 기간 실측 비교">
          <AdflowSection adflow={adflow} name={name} cpc={cpc} />
        </Section>

        {/* 플랫폼이 유입 데이터를 안 주는 매장이 있다. 그때 0 을 띄우면
            '성과가 없었다'로 읽히므로, 숫자 자리를 사유 안내로 바꾸고
            상권 비교·추이처럼 트래픽에 기대는 섹션은 아예 뺀다. */}
        <div className="dpr-kpis">
          {!trafficNA && (
            <div className="dpr-kpi"><div className="dpr-l">🎯 노출 <span className="dpr-sm">曝光</span></div><div className="dpr-v mono">{num(funnel?.exposure)}<small>명</small></div><div className="dpr-dd up">상권 {dominance?.rank}위</div></div>
          )}
          {!trafficNA && (
            <div className="dpr-kpi"><div className="dpr-l">👣 방문 <span className="dpr-sm">访问</span></div><div className="dpr-v mono">{num(funnel?.visit)}<small>명</small></div><div className="dpr-dd neu">클릭 유입</div></div>
          )}
          {!trafficNA && (
            <div className="dpr-kpi"><div className="dpr-l">🛒 관심 <span className="dpr-sm">意向</span></div><div className="dpr-v mono">{num(funnel?.intent)}<small>명</small></div><div className="dpr-dd neu">{funnel?.intent_rate}% 전환</div></div>
          )}
          <div className="dpr-kpi"><div className="dpr-l">💬 리뷰 <span className="dpr-sm">评价</span></div><div className="dpr-v mono">{num(reviews?.total)}<small>건</small></div><div className="dpr-dd neu">누적 평가</div></div>
          <div className="dpr-kpi"><div className="dpr-l">⭐ 호평률 <span className="dpr-sm">好评</span></div><div className="dpr-v mono">{reviews?.good_rate ?? '-'}<small>%</small></div><div className="dpr-dd up">{reviews?.avg_star ? `최근 평균 ★${+Number(reviews.avg_star).toFixed(2)}` : `${num(reviews?.good)}건`}</div></div>
        </div>

        {!trafficNA && (
          <Section icon="🏆" title="상권 지배력 (우리 vs 상권 평균)" note="竞争分析 실측 · 순위·배수·전월 대비">
            <DominanceSection dominance={dominance} funnel={{ ...funnel, storeName: name }} days={days} period={period} />
          </Section>
        )}

        <Section icon="🔻" title="유입 → 전환 퍼널 (노출·클릭·방문·관심·구매)"
                 note={trafficNA
                   ? (cpt?.expired ? '유료 입점(CPT) 종료로 집계 중단'
                      : cpt?.pending ? '유료 입점(CPT) 개통 처리 중'
                      : '플랫폼 데이터 미제공 매장')
                   : '经营参谋 실측 · 최근 30일(월간) · 노출·방문·관심=사람수, 클릭=횟수'}>
          {trafficNA ? <TrafficUnavailable cpt={cpt} /> : (
            <>
              <CptExpirySoon cpt={cpt} />
              <FunnelSection funnel={funnel} />
            </>
          )}
        </Section>

        <Section icon="🎁" title="团购(공동구매) — 노출·매출의 핵심 지렛대" note="따종디엔핑 할인 딜 상품 · 노출 가점 정책">
          <GroupbuySection gb={gb} name={name} />
        </Section>

        {!trafficNA && (
          <Section icon="📈" title="일자별 노출 추이 (우리 vs 상권 평균)" note="최근 30일 일자별 노출 도달 · 우리 매장 vs 상권 평균">
            <TrendChart series={series} />
          </Section>
        )}

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
