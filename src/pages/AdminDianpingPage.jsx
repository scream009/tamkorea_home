import React, { useEffect, useMemo, useState } from 'react';
import { adminHeaders } from '../lib/adminKey';
import './AdminDianpingPage.css';

/**
 * 따종디엔핑 고객 현황 (1단계 — 보기 전용)
 *
 * 데이터는 CS_DB 한 곳에서만 온다("지금 어떤 상태인가").
 * 계약월별 이력은 행을 펼쳤을 때만 Campaign_DB 에서 따로 읽는다 — 목록을 무겁게 두지 않는다.
 *
 * 2단계에서 일예산·단가를 이 화면에서 고치면 포털에 반영하는 걸로 확장한다.
 * 그때를 대비해 planId(캠페인ID)를 이미 내려받아 두고 있다.
 */

const n = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString());
// 금액은 정수로 끊는다. 포털이 2153.17 처럼 소수를 주는데, 화면에서 자릿수가
// 들쭉날쭉해 비교가 어렵다. 元 단위 이하는 판단에 영향이 없다.
const won = (v) => (v == null ? '—' : `${Math.round(Number(v)).toLocaleString()}元`);
const day = (v) => (v ? String(v).slice(0, 10) : '—');

// 값이 얼마나 묵었나. **숫자만 보여주면 안 된다** — 2026-08-02 사고의 핵심이다.
// 한라갈치 잔액이 화면엔 5,250元 인데 포털은 407.10元 이었다. 값은 7/29 에 맞았고
// 그 뒤로 수집이 안 돌았을 뿐인데, 확인일에 복사 시각이 찍혀 '오늘 확인'으로 보였다.
// 그래서 잔액 옆에 **언제 것인지**를 항상 붙인다. 모르면 '확인 안 됨'이라고 쓴다.
const STALE_DAYS = 1.5;

// ⚠️ Airtable 은 dateTime 을 **UTC(...Z)** 로 돌려준다. ISO 문자열을 그대로 잘라 쓰면
//    9시간 어긋난 시각이 화면에 뜬다 — 21:37 에 수집한 잔액이 '12:37' 로 보였다
//    (2026-08-02 Owner 지적). 반드시 한국 시간으로 바꿔 표시한다.
const KST = (iso) => {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(t).replace('T', ' ');
};
const ageOf = (iso) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (Date.now() - t) / 86400000;
};
// 잔액 소진일 — 날짜와 '며칠째'를 같이 보여준다.
// 며칠째가 중요한 이유: 0 인 매장은 늘 0 이라 날짜만 봐서는 심각도가 안 보인다.
// 근사(~) 는 관측 간격 때문에 하루 이틀 어긋날 수 있다는 뜻이다.
// 한 계약월 안의 리포트 회차 — 월 2~3회 돌리는 매장이 있어서 최신만 보면
// "지난번 것"을 꺼낼 수 없다. 최신 → v2 → v3 로 밀려난 회차를 같이 보여준다.
// 2건 이상일 때만 그린다(대부분은 1건이라 늘 띄우면 시끄럽다).
// 포털 계정 — 보고 고치는 칸.
// 비번은 기본으로 가린다. 공용 PC·사무실 화면에서 여는 일이 많아 그대로 두면
// 지나가는 사람이 다 본다. 눌러야 보이고, 복사는 가리고도 된다.
const Account = ({ r, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState({ acctId: r.acctId || '', acctPw: r.acctPw || '', shopNo: r.shopNo || '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const resp = await fetch('/api/admin-dianping', {
        method: 'PATCH',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, ...v }),
      });
      if (!resp.ok) throw new Error(`저장 실패 (${resp.status})`);
      setEdit(false);
      setMsg('저장됨 — 실행 PC 는 다음 새벽에 받아 갑니다');
      onSaved?.(r.id, v);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dpa-acct">
      <div className="dpa-acct-h">
        <b>포털 계정</b>
        {r.loginNeed && <span className="dpa-age bad">로그인 필요{r.loginWhy ? ` · ${r.loginWhy}` : ''}</span>}
        <span className="dpa-acct-sp" />
        {!edit && <button className="dpa-btn" onClick={() => setEdit(true)}>수정</button>}
        {edit && <button className="dpa-btn" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>}
        {edit && <button className="dpa-btn" onClick={() => { setEdit(false); setV({ acctId: r.acctId || '', acctPw: r.acctPw || '', shopNo: r.shopNo || '' }); }}>취소</button>}
      </div>
      <div className="dpa-acct-g">
        {[['아이디', 'acctId', false], ['비밀번호', 'acctPw', true], ['编号', 'shopNo', false]].map(([label, k, secret]) => (
          <label key={k} className="dpa-acct-f">
            <span>{label}</span>
            {edit
              ? <input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })}
                       type={secret && !open ? 'password' : 'text'} spellCheck={false} />
              : <i>{!v[k] ? '—' : (secret && !open ? '••••••••' : v[k])}</i>}
          </label>
        ))}
        <button className="dpa-btn" onClick={() => setOpen(!open)}>{open ? '비번 가리기' : '비번 보기'}</button>
      </div>
      {msg && <div className="dpa-acct-m">{msg}</div>}
      {r.acctAt && <div className="dpa-acct-m dim">계정 최종 수정 {KST(r.acctAt)}</div>}
    </div>
  );
};

const Versions = ({ m }) => {
  const vs = m?.versions || [];
  if (vs.length < 2) return null;
  return (
    <div className="dpa-vers">
      <span className="dpa-vers-l">회차 {vs.length}건</span>
      {vs.map((v) => (
        <span key={v.v} className={`dpa-ver${v.latest ? ' on' : ''}`}>
          {v.latest ? '최신' : `v${v.v}`}
          <i>{v.generatedAt || v.period || '—'}</i>
          {v.exposure != null && <em>노출 {n(v.exposure)}</em>}
        </span>
      ))}
    </div>
  );
};

// 이번 달 예산 추정 = 일예산×평일 + 피크예산×주말 (피크 없으면 일예산×(1+할증%)).
// ClientSchedulePage.monthBudgetEst 와 같은 식 — 값이 달라지면 고객 화면과 어긋나니 함께 고칠 것.
const monthBudgetEst = (budget, ratio, peak, d = new Date()) => {
  const b = Number(budget);
  if (!b || b <= 0) return null;
  const y = d.getFullYear(), m = d.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  let we = 0;
  for (let i = 1; i <= days; i++) {
    const w = new Date(y, m, i).getDay();
    if (w === 0 || w === 6) we++;
  }
  const wd = days - we;
  const p = Number(peak) > 0 ? Number(peak)
    : (Number(ratio) > 0 ? Math.round(b * (1 + Number(ratio) / 100)) : b);
  return { total: wd * b + we * p, wd, we, daily: b, peakVal: p, days, month: m + 1 };
};

const Depleted = ({ r }) => {
  if (!r?.depletedAt) return <span className="dpa-age none">—</span>;
  const d = r.depletedDays;
  const cls = d == null ? '' : d >= 7 ? ' bad' : d >= 3 ? ' warn' : '';
  return (
    <>
      {r.depletedApprox ? '~' : ''}{day(r.depletedAt)}
      {d != null && (
        <span className={`dpa-age${cls}`}>
          {d <= 0 ? '어제 소진' : `${d}일째 멈춤`}
        </span>
      )}
    </>
  );
};

const Age = ({ at }) => {
  const d = ageOf(at);
  if (d == null) return <span className="dpa-age none">확인 안 됨</span>;
  if (d < STALE_DAYS) return null;                 // 신선하면 굳이 표시하지 않는다
  return <span className="dpa-age">{d < 1 ? '오늘' : `${Math.floor(d)}일 전`}</span>;
};

// 상태 칩 — 색은 의미를 담는다(정상/주의/멈춤/미설정)
//
// ⚠️ 이모지로 판정하지 않는다. '🔴' 은 JS 에서 **2글자짜리 서로게이트 쌍**이라
//    charAt(0) 이 '\ud83d' 를 돌려준다. 그래서 예전 코드는 모든 상태가 idle 로 떨어져
//    충전필요·소진임박·정상 필터가 전부 0건이 됐다(실측).
//    글자로 맞추면 이모지가 바뀌거나 빠져도 안전하다.
const tone = (s) => {
  const t = String(s || '');
  if (t.includes('정상')) return 'ok';
  if (t.includes('정지')) return 'paused';
  if (t.includes('소진임박')) return 'warn';
  if (t.includes('충전필요')) return 'bad';
  if (t.includes('미집행') || t.includes('미설정')) return 'idle';
  return 'none';                      // 상태가 아예 없는 매장 — idle 로 뭉뚱그리지 않는다
};

// Airtable 선택지 이름을 화면 표기로 바꾼다.
// '미집행'은 결과처럼 읽히는데 실제로는 **예산이 책정되지 않은** 상태다
// (캠페인이 없어 충전해도 광고가 안 나간다). Airtable Meta API 가 선택지 이름 변경을
// 막아(422) DB 값은 그대로 두고 표기만 바꾼다. 나중에 Airtable 화면에서 이름을 고치면
// 이 매핑은 저절로 무의미해진다.
const STATUS_LABEL = { '⚪ 미집행': '⚪ 광고 미설정' };

// 캠페인 자체의 상태. 잔액과 별개다 — paused 는 '설정은 살아 있고 스위치만 꺼짐'.
const CAMPAIGN = {
  running: '집행 중',
  paused: '⏸️ 정지 — 설정은 유지됨',
  none: '없음 (충전해도 안 나감)',
};
const label = (s) => STATUS_LABEL[String(s || '').trim()] || s || '—';

// 정렬. 기본은 **가나다** 다 — 목록의 첫 용도가 '그 매장 찾기' 이기 때문이다.
// 예전 기본값이던 악평순은 악평 0 곳이 대부분이라 사실상 무순으로 보여 찾기가 어려웠다.
// 급한 곳부터 보는 용도는 정렬을 바꾸거나 위 필터 칩으로 간다.
const SORTS = [
  { k: 'name', label: '가나다순' },
  { k: 'bad', label: '악평 많은 순' },
  { k: 'days', label: '충전 시급한 순' },
  { k: 'use', label: '소진률 낮은 순' },
];

const FILTERS = [
  { k: 'all', label: '전체' },
  { k: 'bad', label: '충전필요' },
  { k: 'warn', label: '소진임박' },
  { k: 'ok', label: '정상' },
  { k: 'paused', label: '정지' },
  { k: 'idle', label: '광고 미설정' },
  { k: 'none', label: '수집 전' },
  { k: 'review', label: '악평 있음' },
  { k: 'cpt', label: 'CPT 만료' },
];

export default function AdminDianpingPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [cat, setCat] = useState('all');           // 업종 — 8종이라 칩 대신 드롭다운
  const [sort, setSort] = useState('name');         // 정렬 — 기본 가나다
  const [group, setGroup] = useState(false);       // 업종별로 묶어 보기
  const [open, setOpen] = useState(null);          // 펼친 매장 officeId
  const [months, setMonths] = useState({});        // officeId → 월별 이력
  const [loadingM, setLoadingM] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/admin-dianping', { headers: adminHeaders() });
        if (!r.ok) throw new Error(r.status === 404 ? '접근 권한이 없습니다.' : `불러오지 못했습니다 (${r.status})`);
        const j = await r.json();
        if (alive) setData(j);
      } catch (e) {
        if (alive) setErr(e.message);
      }
    })();
    return () => { alive = false; };
  }, []);

  // 업종 목록 — 매장 수 많은 순. 8종이라 칩으로 늘리면 지저분해 드롭다운으로 둔다.
  const cats = useMemo(() => {
    const m = new Map();
    for (const r of (data?.rows || [])) {
      const c = r.category || '미분류';
      m.set(c, (m.get(c) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const rows = useMemo(() => {
    const all = data?.rows || [];
    const kw = q.trim().toLowerCase();
    const hit = all.filter((r) => {
      if (kw && !`${r.name} ${r.cn} ${r.category || ''}`.toLowerCase().includes(kw)) return false;
      if (cat !== 'all' && (r.category || '미분류') !== cat) return false;
      if (filter === 'all') return true;
      if (filter === 'review') return (r.bad7 || 0) > 0;
      if (filter === 'cpt') return r.cptExpired;
      return tone(r.status) === filter;
    });
    return hit.sort(cmp(sort));
  }, [data, q, filter, cat, sort]);

  async function toggle(r) {
    if (open === r.officeId) { setOpen(null); return; }
    setOpen(r.officeId);
    if (months[r.officeId]) return;      // 이미 받아온 매장은 다시 부르지 않는다
    if (!r.slug) { setMonths((m) => ({ ...m, [r.officeId]: [] })); return; }
    const slug = r.slug;
    setLoadingM(r.officeId);
    try {
      const resp = await fetch(`/api/admin-dianping?slug=${encodeURIComponent(slug)}`,
                               { headers: adminHeaders() });
      const j = await resp.json();
      setMonths((m) => ({ ...m, [r.officeId]: j.months || [] }));
    } catch {
      setMonths((m) => ({ ...m, [r.officeId]: [] }));
    } finally {
      setLoadingM(null);
    }
  }

  if (err) return <div className="dpa-msg err">{err}</div>;
  if (!data) return <div className="dpa-msg">불러오는 중…</div>;

  const s = data.summary || {};
  return (
    <div className="dpa">
      {/* ── 요약 ── */}
      <div className="dpa-sum">
        <Tile label="따종 매장" value={s.total} />
        <Tile label="정상 운영" value={s.running} tone="ok" />
        <Tile label="소진 임박" value={s.lowBalance} tone="warn" />
        <Tile label="충전 필요" value={s.needCharge} tone="bad" />
        <Tile label="정지" value={s.paused} tone="paused" />
        <Tile label="광고 미설정" value={s.idle} tone="idle" />
        <Tile label="최근 7일 악평" value={s.bad7Total} tone={s.bad7Total ? 'warn' : 'idle'} />
      </div>

      {/* ── 검색·필터 ── */}
      <div className="dpa-bar">
        <input
          className="dpa-q" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="매장명·중문명·업종으로 검색" aria-label="매장 검색"
        />
        <div className="dpa-chips">
          {FILTERS.map((f) => (
            <button key={f.k} type="button"
                    className={`dpa-chip${filter === f.k ? ' on' : ''}`}
                    onClick={() => setFilter(f.k)}>{f.label}</button>
          ))}
        </div>
        <select className="dpa-sel" value={cat} onChange={(e) => setCat(e.target.value)}
                aria-label="업종 선택">
          <option value="all">업종 전체 ({data.rows.length})</option>
          {cats.map(([c, k]) => <option key={c} value={c}>{c} ({k})</option>)}
        </select>
        <select className="dpa-sel" value={sort} onChange={(e) => setSort(e.target.value)}
                aria-label="정렬 기준">
          {SORTS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
        </select>
        <label className="dpa-tg">
          <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />
          업종별 묶기
        </label>
        <span className="dpa-cnt">{rows.length}곳</span>
      </div>

      {/* 상세가 있다는 걸 모르고 지나치는 경우가 많다 — 눌러야 안다는 걸 미리 알린다 */}
      <div className="dpa-hint">👆 매장을 누르면 <b>상세 정보와 월별 리포트</b>가 열립니다</div>

      {/* ── 목록 · 모바일(카드) ──
          11칸 표를 가로로 밀어 보는 건 현장에서 못 쓴다. 폭이 좁으면 카드로 바꾼다.
          같은 데이터를 두 번 그리지만, 표를 억지로 접는 CSS 보다 읽기 쉽다. */}
      <div className="dpa-cards">
        {groupRows(rows, group).map(({ head, items }) => (
          <React.Fragment key={head || '_'}>
            {head && <div className="dpa-gh">{head} <span>{items.length}</span></div>}
            {items.map((r) => (
          <div key={r.officeId || r.id}
               className={`dpa-card${open === r.officeId ? ' open' : ''}`}>
            <button type="button" className="dpa-card-hd" onClick={() => toggle(r)}>
              <div className="dpa-card-t">
                <div className="dpa-nm">{r.name || '—'}</div>
                <div className="dpa-card-sub">
                  {r.category || '업종 미확인'}{r.cn ? ` · ${r.cn}` : ''}
                </div>
              </div>
              <div className="dpa-card-badges">
                {r.bad7 ? <span className="dpa-bad">악평 {r.bad7}</span> : null}
                <span className={`dpa-st ${tone(r.status)}`}>{label(r.status)}</span>
                <span className="dpa-caret" aria-hidden="true">
                  {open === r.officeId ? '▲' : '▼'}
                </span>
              </div>
            </button>

            <div className="dpa-card-g">
              <Cell k="잔액" v={<>{won(r.balance)}<Age at={r.balanceAt} /></>} strong />
              <Cell k="일예산" v={won(r.budget)} />
              <Cell k="클릭단가" v={r.bid == null ? '—' : `${Number(r.bid).toFixed(1)}元`} />
              <Cell k="주말 할증" v={r.floatRatio == null ? '—' : `+${r.floatRatio}%`} />
              <Cell k="노출시간" v={r.hours ? r.hours.replace('매일 ', '') : '—'} wide />
              <Cell k="충전일" v={day(r.chargedAt)} />
              {/* 잔액 0 이 된 날 — "며칠째 멈춰 있나"가 한눈에 보이게.
                  플랫폼이 이력을 안 줘서 수집기가 관측으로 판정한 값이다. */}
              <Cell k="소진일" v={<Depleted r={r} />} />
              {(() => {
                const est = monthBudgetEst(r.budget, r.floatRatio, r.peak);
                return <Cell k={`${new Date().getMonth() + 1}월 예산 추정`}
                             v={est ? `${est.total.toLocaleString()}元` : '—'} />;
              })()}
              <Cell
                k="CPT"
                v={r.cptExpire
                  ? `${day(r.cptExpire)}${r.cptExpired ? ' · 만료' : (r.cptDaysLeft != null ? ` · D-${r.cptDaysLeft}` : '')}`
                  : '미입력'}
                danger={r.cptExpired}
              />
            </div>

            {open === r.officeId && (
              <Detail r={r} months={months[r.officeId]} loading={loadingM === r.officeId} />
            )}
          </div>
            ))}
          </React.Fragment>
        ))}
        {!rows.length && <div className="dpa-empty">조건에 맞는 매장이 없습니다.</div>}
      </div>

      {/* ── 목록 · 데스크톱(표) ── */}
      <div className="dpa-wrap">
        <table className="dpa-tb">
          <thead>
            <tr>
              <th className="l">매장 <span className="dpa-th-h">클릭 → 상세</span></th>
              <th className="l">업종</th>
              <th>상태</th>
              <th>잔액</th>
              <th>충전일</th>
              <th>일예산</th>
              <th>단가</th>
              <th>주말</th>
              <th className="l">노출시간</th>
              <th>악평 7일</th>
              <th className="l">CPT</th>
            </tr>
          </thead>
          <tbody>
            {groupRows(rows, group).map(({ head, items }) => (
              <React.Fragment key={head || '_'}>
                {head && (
                  <tr className="dpa-ghr"><td colSpan={11}>{head} <span>{items.length}</span></td></tr>
                )}
                {items.map((r) => (
              <React.Fragment key={r.officeId || r.id}>
                <tr className={`dpa-row${open === r.officeId ? ' open' : ''}`}
                    onClick={() => toggle(r)} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') toggle(r); }}>
                  <td className="l">
                    <div className="dpa-nm">
                      <span className="dpa-caret" aria-hidden="true">
                        {open === r.officeId ? '▲' : '▼'}
                      </span>{r.name || '—'}
                    </div>
                    {r.cn && <div className="dpa-cn">{r.cn}</div>}
                  </td>
                  <td className="l dpa-dim">{r.category || '—'}</td>
                  <td><span className={`dpa-st ${tone(r.status)}`}>{label(r.status)}</span></td>
                  <td className="num">{won(r.balance)}<Age at={r.balanceAt} /></td>
                  <td className="num dpa-dim">{day(r.chargedAt)}</td>
                  <td className="num">{won(r.budget)}</td>
                  <td className="num">{r.bid == null ? '—' : `${Number(r.bid).toFixed(1)}元`}</td>
                  <td className="num">{r.floatRatio == null ? '—' : `+${r.floatRatio}%`}</td>
                  <td className="l dpa-hrs">{r.hours ? r.hours.replace('매일 ', '') : '—'}</td>
                  <td className="num">
                    {r.bad7 ? <span className="dpa-bad">{r.bad7}</span> : <span className="dpa-dim">0</span>}
                  </td>
                  <td className="l">
                    {r.cptExpire
                      ? <span className={r.cptExpired ? 'dpa-cpt bad' : 'dpa-cpt'}>
                          {day(r.cptExpire)}{r.cptDaysLeft != null && (r.cptExpired
                            ? ' · 만료' : ` · D-${r.cptDaysLeft}`)}
                        </span>
                      : <span className="dpa-dim">미입력</span>}
                  </td>
                </tr>

                {open === r.officeId && (
                  <tr className="dpa-detail">
                    <td colSpan={11}>
                      <Detail r={r} months={months[r.officeId]} loading={loadingM === r.officeId} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
                ))}
              </React.Fragment>
            ))}
            {!rows.length && (
              <tr><td colSpan={11} className="dpa-empty">조건에 맞는 매장이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value, tone: t }) {
  return (
    <div className={`dpa-tile${t ? ` ${t}` : ''}`}>
      <div className="dpa-tv">{value ?? '—'}</div>
      <div className="dpa-tl">{label}</div>
    </div>
  );
}

function Detail({ r, months, loading }) {
  return (
    <div className="dpa-dt">
      <div className="dpa-dt-grid">
        <Kv k="포털 계정" v={r.officeId} />
        <Kv k="캠페인 ID" v={r.planId} />
        <Kv k="주간 노출" v={r.hoursOn ? `${r.hoursOn}시간 / 168` : null} />
        <Kv k="피크 예산" v={r.peak ? won(r.peak) : null} />
        <Kv k="일 소진" v={r.spend != null ? won(r.spend) : null} />
        <Kv k="소진 예상" v={r.daysLeft != null ? `약 ${r.daysLeft}일` : null} />
        <Kv k="잔액 소진일" v={r.depletedAt ? <Depleted r={r} /> : null} />
        {(() => {
          const est = monthBudgetEst(r.budget, r.floatRatio, r.peak);
          return <Kv k="월예산 추정" v={est
            ? `${est.total.toLocaleString()}元 (평일 ${est.wd}일×${est.daily.toLocaleString()} + 주말 ${est.we}일×${est.peakVal.toLocaleString()})`
            : null} />;
        })()}
        <Kv k="악평 30일 / 누적" v={`${n(r.bad30)} / ${n(r.badTotal)}`} />
        <Kv k="설정 확인" v={KST(r.settingAt)} />
        <Kv k="잔액 확인"
            v={r.balanceAt
              ? <>{KST(r.balanceAt)}<Age at={r.balanceAt} /></>
              : <span className="dpa-age none">확인 안 됨</span>} />
        <Kv k="리뷰 확인" v={KST(r.reviewAt)} />
        <Kv k="캠페인" v={CAMPAIGN[r.campaign] || null} />
      </div>
      <Account r={r} />

      {/* 정지 사유 — 포털 원문 그대로 둔다. 번역만 붙여서 판단은 사람이 하게 한다.
          '왜 꺼졌나'에 따라 대응이 갈린다(무소비 자동정지 vs 심사·위반). */}
      {r.campaign === 'paused' && r.pauseReason && (
        <div className="dpa-reason">
          ⏸️ <b>정지 사유</b> — {r.pauseReason}
          {r.pauseReason.includes('长期无消耗') && (
            <> <br />집행 내역이 오래 없어 플랫폼이 자동 정지시킨 경우입니다.
              포털에서 <b>恢复推广</b>(추진 재개)을 누르면 지금 설정 그대로 다시 나갑니다.</>
          )}
        </div>
      )}

      <div className="dpa-dt-h">계약월별 리포트</div>
      {loading && <div className="dpa-dim">불러오는 중…</div>}

      {/* 모바일 — 10칸 표는 가로로 밀어도 잘려 보인다. 월별로 한 덩이씩 쌓는다. */}
      {!loading && months && months.length > 0 && (
        <div className="dpa-mcards">
          {months.map((m) => (
            <div className="dpa-mcard" key={m.id}>
              <div className="dpa-mcard-h">
                <div>
                  <b>{m.month}</b>
                  <span className="dpa-mcard-p">{m.period || '기간 미상'}</span>
                </div>
                {m.reportUrl
                  ? <a className="dpa-link" href={m.reportUrl} target="_blank"
                       rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>리포트 ↗</a>
                  : <span className="dpa-dim">리포트 없음</span>}
              </div>
              <div className="dpa-mcard-g">
                <Cell k="노출" v={n(m.exposure)} />
                <Cell k="방문" v={n(m.visit)} />
                <Cell k="상권 순위" v={m.rank ? `${m.rank}위` : '—'} />
                <Cell k="전월비" v={m.mom || '—'} />
                <Cell k="호평률" v={m.good != null ? `${m.good}%` : '—'} />
                <Cell k="악평" v={n(m.bad)} />
              </div>
              <Versions m={m} />
            </div>
          ))}
        </div>
      )}

      {!loading && months && months.length > 0 && (
        <div className="dpa-mwrap">
          <table className="dpa-mt">
            <thead>
              <tr><th className="l">계약월</th><th className="l">기간</th><th>노출</th><th>방문</th>
                  <th>순위</th><th>전월비</th><th>호평률</th><th>악평</th><th>광고비</th><th>리포트</th></tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.id}>
                  <td className="l"><b>{m.month}</b></td>
                  <td className="l dpa-dim">{m.period || '—'}</td>
                  <td className="num">{n(m.exposure)}</td>
                  <td className="num">{n(m.visit)}</td>
                  <td className="num">{m.rank ? `${m.rank}위` : '—'}</td>
                  <td className="num dpa-dim">{m.mom || '—'}</td>
                  <td className="num">{m.good != null ? `${m.good}%` : '—'}</td>
                  <td className="num">{n(m.bad)}</td>
                  <td className="num">{m.spend != null ? won(m.spend) : '—'}</td>
                  <td>
                    {m.reportUrl
                      ? <a className="dpa-link" href={m.reportUrl} target="_blank"
                           rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>열기 ↗</a>
                      : <span className="dpa-dim">없음</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && months && !months.length && (
        <div className="dpa-dim">기록된 계약월이 없습니다.</div>
      )}
    </div>
  );
}

const Kv = ({ k, v }) => (
  <div className="dpa-kv"><span>{k}</span><b>{v || '—'}</b></div>
);

/** 정렬 비교자.
 *  값이 없는 매장(아직 수집 전)을 0 으로 치면 '충전 시급 1위'처럼 보여 위험하다.
 *  그래서 어떤 기준이든 **값 없음은 항상 뒤로** 보내고, 동률은 가나다로 푼다. */
function cmp(kind) {
  const ko = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko');
  if (kind === 'name') return ko;
  // asc=true 면 작은 값이 위(충전 시급·소진률 낮은 순), false 면 큰 값이 위(악평)
  const pick = {
    bad: [(r) => r.bad7, false],
    days: [(r) => r.daysLeft, true],
    use: [(r) => (r.budget > 0 && r.spend != null ? r.spend / r.budget : null), true],
  }[kind];
  if (!pick) return ko;
  const [val, asc] = pick;
  return (a, b) => {
    const x = val(a), y = val(b);
    const nx = x == null || Number.isNaN(x), ny = y == null || Number.isNaN(y);
    if (nx || ny) return nx && ny ? ko(a, b) : nx ? 1 : -1;   // 값 없음은 항상 뒤
    return x === y ? ko(a, b) : (asc ? x - y : y - x);
  };
}

/** 업종별로 묶어 보기. 끄면 한 덩어리로 돌려준다(머리글 없음). */
function groupRows(rows, on) {
  if (!on) return [{ head: null, items: rows }];
  const m = new Map();
  for (const r of rows) {
    const c = r.category || '미분류';
    if (!m.has(c)) m.set(c, []);
    m.get(c).push(r);
  }
  return [...m.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([head, items]) => ({ head, items }));
}

// 모바일 카드의 한 칸. wide 는 두 칸을 먹는다(노출시간처럼 긴 값).
const Cell = ({ k, v, strong, wide, danger }) => (
  <div className={`dpa-cell${wide ? ' wide' : ''}`}>
    <span>{k}</span>
    <b className={`${strong ? 'big' : ''}${danger ? ' danger' : ''}`}>{v}</b>
  </div>
);
