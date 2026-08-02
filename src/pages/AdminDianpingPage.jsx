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

// 상태 칩 — 색은 의미를 담는다(정상/주의/멈춤/미설정)
const TONE = { '🟢': 'ok', '🟡': 'warn', '🔴': 'bad', '⚪': 'idle' };
const tone = (s) => TONE[String(s || '').trim().charAt(0)] || 'idle';

// Airtable 선택지 이름을 화면 표기로 바꾼다.
// '미집행'은 결과처럼 읽히는데 실제로는 **예산이 책정되지 않은** 상태다
// (캠페인이 없어 충전해도 광고가 안 나간다). Airtable Meta API 가 선택지 이름 변경을
// 막아(422) DB 값은 그대로 두고 표기만 바꾼다. 나중에 Airtable 화면에서 이름을 고치면
// 이 매핑은 저절로 무의미해진다.
const STATUS_LABEL = { '⚪ 미집행': '⚪ 광고 미설정' };
const label = (s) => STATUS_LABEL[String(s || '').trim()] || s || '—';

const FILTERS = [
  { k: 'all', label: '전체' },
  { k: 'bad', label: '충전필요' },
  { k: 'warn', label: '소진임박' },
  { k: 'ok', label: '정상' },
  { k: 'idle', label: '광고 미설정' },
  { k: 'review', label: '악평 있음' },
  { k: 'cpt', label: 'CPT 만료' },
];

export default function AdminDianpingPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [cat, setCat] = useState('all');           // 업종 — 8종이라 칩 대신 드롭다운
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
    return all.filter((r) => {
      if (kw && !`${r.name} ${r.cn} ${r.category || ''}`.toLowerCase().includes(kw)) return false;
      if (cat !== 'all' && (r.category || '미분류') !== cat) return false;
      if (filter === 'all') return true;
      if (filter === 'review') return (r.bad7 || 0) > 0;
      if (filter === 'cpt') return r.cptExpired;
      return tone(r.status) === filter;
    });
  }, [data, q, filter, cat]);

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
        <label className="dpa-tg">
          <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />
          업종별 묶기
        </label>
        <span className="dpa-cnt">{rows.length}곳</span>
      </div>

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
              </div>
            </button>

            <div className="dpa-card-g">
              <Cell k="잔액" v={won(r.balance)} strong />
              <Cell k="일예산" v={won(r.budget)} />
              <Cell k="클릭단가" v={r.bid == null ? '—' : `${Number(r.bid).toFixed(1)}元`} />
              <Cell k="주말 할증" v={r.floatRatio == null ? '—' : `+${r.floatRatio}%`} />
              <Cell k="노출시간" v={r.hours ? r.hours.replace('매일 ', '') : '—'} wide />
              <Cell k="충전일" v={day(r.chargedAt)} />
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
              <th className="l">매장</th>
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
                    <div className="dpa-nm">{r.name || '—'}</div>
                    {r.cn && <div className="dpa-cn">{r.cn}</div>}
                  </td>
                  <td className="l dpa-dim">{r.category || '—'}</td>
                  <td><span className={`dpa-st ${tone(r.status)}`}>{label(r.status)}</span></td>
                  <td className="num">{won(r.balance)}</td>
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
        <Kv k="악평 30일 / 누적" v={`${n(r.bad30)} / ${n(r.badTotal)}`} />
        <Kv k="설정 확인" v={r.settingAt ? String(r.settingAt).slice(0, 16).replace('T', ' ') : null} />
        <Kv k="잔액 확인" v={r.balanceAt ? String(r.balanceAt).slice(0, 16).replace('T', ' ') : null} />
        <Kv k="리뷰 확인" v={r.reviewAt ? String(r.reviewAt).slice(0, 16).replace('T', ' ') : null} />
      </div>

      <div className="dpa-dt-h">계약월별 리포트</div>
      {loading && <div className="dpa-dim">불러오는 중…</div>}
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
