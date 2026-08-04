import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { staffHeaders, clearStaffKey } from '../lib/staffKey';
import './StaffBoardPage.css';

/**
 * 담당자 진도 보드 (/staff) — Phase 1, 조회 전용.
 *
 * 고객사 나래비 × 선택월. 각 행에 유형별 목표 대비 방문·업완 진행바.
 * 색은 "진도율 vs 월 경과율" — 달이 60% 지났는데 방문이 30%면 빨강이다.
 * 우상단 지연 카운터 → 방문은 끝났는데 링크가 마감 넘도록 안 올라온 건.
 *
 * Phase 2: 행에서 바로 예약입력(예약입력_DB) 폼으로 진입.
 * Phase 3: 건 단위 액션(링크 제출·메모·취소/노쇼 요청).
 */

/* ── 월 헬퍼 — 서버(staff-board.js)와 같은 표기 ── */
const MONTH_RE = /^(\d{4})\.\s*(\d{1,2})월$/;
function parseMonth(v) {
  const m = MONTH_RE.exec(String(v || '').trim());
  return m ? { y: Number(m[1]), n: Number(m[2]) } : null;
}
function fmtMonth(y, n) {
  let yy = y; let nn = n;
  while (nn < 1) { nn += 12; yy -= 1; }
  while (nn > 12) { nn -= 12; yy += 1; }
  return `${yy}. ${nn}월`;
}
function shiftMonth(v, d) {
  const p = parseMonth(v);
  return p ? fmtMonth(p.y, p.n + d) : v;
}
function currentMonth() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return fmtMonth(k.getUTCFullYear(), k.getUTCMonth() + 1);
}
function shortMonth(v) {
  const p = parseMonth(v);
  return p ? `${p.n}월` : v;
}

const TYPE_ORDER = ['인플', '체험', '기자'];

/* ── 진도 색 — 진도율(방문/목표)과 월 경과율의 차이로 판정 ── */
function paceClass(pct, el, target) {
  if (!target) return 'mut';
  const diff = pct - el;
  if (diff >= -0.05) return 'ok';
  if (diff >= -0.15) return 'warn';
  if (diff >= -0.3) return 'orange';
  return 'bad';
}

/** 월 셀 집계 — 유형 합산 (typeFilter 적용) */
function cellAgg(cell, typeFilter) {
  if (!cell) return null;
  let tg = 0; let vis = 0; let up = 0; let cx = 0;
  Object.entries(cell.t || {}).forEach(([k, arr]) => {
    if (typeFilter && k !== typeFilter) return;
    tg += arr[0]; vis += arr[1]; up += arr[2]; cx += arr[3];
  });
  return { tg, vis, up, cx, pct: tg ? vis / tg : 0, upPct: tg ? up / tg : 0 };
}

export default function StaffBoardPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [lateOnly, setLateOnly] = useState(false);
  const [sort, setSort] = useState('late');       // late | pace | name
  const [expanded, setExpanded] = useState(null); // 고객사명

  const load = useCallback(async (m) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/staff-board?month=${encodeURIComponent(m)}`, {
        headers: staffHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `서버 오류 (${res.status})`);
      setData(body);
    } catch (e) {
      setError(e.message || '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(month); }, [month, load]);

  const focus = data?.months?.[1] || month;
  const el = data?.el?.[focus] ?? 0;

  /* ── 필터·정렬된 행 ── */
  const rows = useMemo(() => {
    if (!data?.rows) return [];
    const q = search.trim().toLowerCase();
    const out = data.rows
      .filter((r) => r.m[focus])   // 선택월에 계약이 있는 고객사만
      .filter((r) => !q || r.n.toLowerCase().includes(q))
      .filter((r) => !typeFilter || (r.m[focus].t || {})[typeFilter])
      .filter((r) => !lateOnly || r.m[focus].late > 0)
      .map((r) => {
        const agg = cellAgg(r.m[focus], typeFilter);
        return { ...r, agg };
      });
    if (sort === 'name') out.sort((a, b) => a.n.localeCompare(b.n, 'ko'));
    else if (sort === 'pace') out.sort((a, b) => (a.agg.pct - el) - (b.agg.pct - el));
    else out.sort((a, b) => (b.m[focus].late - a.m[focus].late)
      || (b.m[focus].pend - a.m[focus].pend)
      || ((a.agg.pct - el) - (b.agg.pct - el)));
    return out;
  }, [data, focus, search, typeFilter, lateOnly, sort, el]);

  /* ── KPI (필터 반영, 선택월) ── */
  const kpi = useMemo(() => {
    const sum = { n: rows.length, tg: 0, vis: 0, up: 0, pend: 0, late: 0 };
    rows.forEach((r) => {
      sum.tg += r.agg.tg; sum.vis += r.agg.vis; sum.up += r.agg.up;
      sum.pend += r.m[focus].pend; sum.late += r.m[focus].late;
    });
    return sum;
  }, [rows, focus]);

  function logout() {
    clearStaffKey();
    window.location.reload();
  }

  return (
    <div className="stb-root">
      <div className="stb-wrap">

        {/* ── 헤더 ── */}
        <header className="stb-head">
          <div className="stb-title">
            <span className="stb-dot" />
            <h1>진도 보드</h1>
            {data?.who && <span className="stb-who">{data.who}</span>}
          </div>
          <div className="stb-monthnav">
            <button onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="이전 달">◀</button>
            <b>{month}</b>
            <button onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="다음 달">▶</button>
            {month !== currentMonth() && (
              <button className="stb-now" onClick={() => setMonth(currentMonth())}>이번달</button>
            )}
          </div>
          <div className="stb-tools">
            <input
              className="stb-search"
              placeholder="고객사 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="stb-seg">
              {['', ...TYPE_ORDER].map((t) => (
                <button
                  key={t || '전체'}
                  className={typeFilter === t ? 'on' : ''}
                  onClick={() => setTypeFilter(t)}
                >{t || '전체'}</button>
              ))}
            </div>
            <button
              className={`stb-latebtn ${lateOnly ? 'on' : ''}`}
              onClick={() => setLateOnly((v) => !v)}
              title="마감을 넘긴 미제출 건이 있는 고객사만"
            >
              🔴 지연 {kpi.late > 0 ? kpi.late : ''}
            </button>
            <div className="stb-seg stb-sort">
              <button className={sort === 'late' ? 'on' : ''} onClick={() => setSort('late')}>지연순</button>
              <button className={sort === 'pace' ? 'on' : ''} onClick={() => setSort('pace')}>진도순</button>
              <button className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}>이름순</button>
            </div>
            <button className="stb-ghost" onClick={() => load(month)} title="새로고침">⟳</button>
            <button className="stb-ghost" onClick={logout} title="키 지우고 나가기">나가기</button>
          </div>
        </header>

        {/* ── KPI ── */}
        {!loading && !error && (
          <div className="stb-kpis">
            <div className="stb-kpi"><i>계약</i><b>{kpi.n}</b></div>
            <div className="stb-kpi"><i>목표</i><b>{kpi.tg}</b></div>
            <div className="stb-kpi">
              <i>방문</i>
              <b className={paceClass(kpi.tg ? kpi.vis / kpi.tg : 0, el, kpi.tg)}>{kpi.vis}</b>
              <s>{kpi.tg ? Math.round((kpi.vis / kpi.tg) * 100) : 0}%</s>
            </div>
            <div className="stb-kpi"><i>업완</i><b>{kpi.up}</b><s>{kpi.tg ? Math.round((kpi.up / kpi.tg) * 100) : 0}%</s></div>
            <div className="stb-kpi"><i>제출대기</i><b>{kpi.pend}</b></div>
            <div className="stb-kpi stb-kpi-late"><i>지연</i><b>{kpi.late}</b></div>
            <div className="stb-kpi stb-kpi-el"><i>월 경과</i><b>{Math.round(el * 100)}%</b></div>
          </div>
        )}

        {/* ── 본문 ── */}
        {error && (
          <div className="stb-error">
            {error}
            <button onClick={() => load(month)}>다시 시도</button>
          </div>
        )}

        {loading && (
          <div className="stb-list">
            {[...Array(6)].map((_, i) => <div key={i} className="stb-skel" />)}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="stb-empty">이 조건에 표시할 계약이 없습니다.</div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="stb-list">
            {/* 열 머리 */}
            <div className="stb-cols">
              <span>고객사</span>
              <span className="stb-mini-h">{shortMonth(data.months[0])}</span>
              <span>{shortMonth(focus)} — 목표 대비 방문·업완</span>
              <span className="stb-mini-h">{shortMonth(data.months[2])}</span>
              <span className="stb-late-h">지연</span>
            </div>

            {rows.map((r) => {
              const cell = r.m[focus];
              const open = expanded === r.n;
              return (
                <React.Fragment key={r.n}>
                  <div
                    className={`stb-r ${open ? 'open' : ''}`}
                    onClick={() => setExpanded(open ? null : r.n)}
                  >
                    {/* 고객사 */}
                    <div className="stb-name">
                      <b>{r.n}</b>
                      {r.p && <span className="stb-chip stb-chip-p">{r.p}</span>}
                      {cell.ct && cell.ct !== '월계약' && <span className="stb-chip">{cell.ct}</span>}
                    </div>

                    {/* 전월 미니 */}
                    <MiniCell cell={r.m[data.months[0]]} el={data.el[data.months[0]]} typeFilter={typeFilter} />

                    {/* 선택월 — 유형별 바 */}
                    <div className="stb-main">
                      {Object.keys(cell.t || {}).length === 0 && <span className="stb-mut">—</span>}
                      {TYPE_ORDER.filter((k) => cell.t?.[k])
                        .filter((k) => !typeFilter || k === typeFilter)
                        .map((k) => {
                          const [tg, vis, up, cx] = cell.t[k];
                          const pc = paceClass(tg ? vis / tg : 0, el, tg);
                          return (
                            <div key={k} className="stb-ty">
                              <i>{k}</i>
                              <div className="stb-bar">
                                <em className="stb-bar-v" style={{ width: `${Math.min(tg ? (vis / tg) * 100 : 0, 100)}%` }} />
                                <em className={`stb-bar-u bg-${pc}`} style={{ width: `${Math.min(tg ? (up / tg) * 100 : 0, 100)}%` }} />
                                <em className="stb-mk" style={{ left: `${el * 100}%` }} />
                              </div>
                              <span className={`stb-num ${pc}`}>
                                {vis}<u>/{tg}</u>
                              </span>
                              <span className="stb-num2" title="업로드 완료">업 {up}</span>
                              {cx > 0 && <span className="stb-num3" title="취소·노쇼">취 {cx}</span>}
                            </div>
                          );
                        })}
                    </div>

                    {/* 익월 미니 */}
                    <MiniCell cell={r.m[data.months[2]]} el={data.el[data.months[2]]} typeFilter={typeFilter} />

                    {/* 지연 */}
                    <div className="stb-late">
                      {cell.late > 0
                        ? <span className="stb-badge-late">{cell.late}</span>
                        : cell.pend > 0
                          ? <span className="stb-badge-pend" title="제출 대기">{cell.pend}</span>
                          : <span className="stb-mut">—</span>}
                    </div>
                  </div>

                  {open && <Details row={r} months={data.months} />}
                </React.Fragment>
              );
            })}
          </div>
        )}

        <footer className="stb-foot">
          진행바 = 방문(옅음)·업완(짙음) / 목표 · 세로선 = 월 경과 기준 ·
          지연 = 제출마감(없으면 방문+7일)을 넘긴 미제출 건
        </footer>
      </div>
    </div>
  );
}

/* ── 전월/익월 미니 셀 ── */
function MiniCell({ cell, el, typeFilter }) {
  const agg = cellAgg(cell, typeFilter);
  if (!agg || !agg.tg) return <div className="stb-mini stb-mut">—</div>;
  const pc = paceClass(agg.pct, el ?? 1, agg.tg);
  return (
    <div className="stb-mini">
      <b className={pc}>{Math.round(agg.pct * 100)}%</b>
      <s>{agg.vis}/{agg.tg}</s>
      {cell.late > 0 && <i className="stb-minidot" title={`지연 ${cell.late}건`} />}
    </div>
  );
}

/* ── 펼침 상세 — 3개월 건 단위 ── */
function Details({ row, months }) {
  return (
    <div className="stb-det">
      {months.filter((m) => row.m[m]).map((m) => {
        const cell = row.m[m];
        if (!cell.d?.length) return null;
        return (
          <div key={m} className="stb-det-mon">
            <div className="stb-det-h">
              <b>{m}</b>
              {cell.memo && <span className="stb-det-memo">{cell.memo}</span>}
              <span className="stb-det-cnt">
                {cell.d.length}건
                {cell.pend > 0 && ` · 제출대기 ${cell.pend}`}
                {cell.late > 0 && ` · 지연 ${cell.late}`}
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>담당</th><th>유형</th><th>진행상태</th>
                  <th>방문일</th><th>인플</th><th>제출</th><th className="stb-th-dl">기한</th>
                </tr>
              </thead>
              <tbody>
                {cell.d.map((d) => <DetailRow key={d[9]} d={d} />)}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function DetailRow({ d }) {
  const [shootId, mgr, submit, status, type, , visitMD, infl, dl] = d;
  const submitted = submit.includes('제출완료') || submit.includes('✅');
  let dlNode = <span className="stb-mut">—</span>;
  if (dl !== null && !submitted) {
    if (dl < 0) dlNode = <span className="bad">D+{-dl}</span>;
    else if (dl <= 2) dlNode = <span className="warn">D-{dl}</span>;
    else dlNode = <span className="stb-mut">D-{dl}</span>;
  }
  return (
    <tr className={dl !== null && dl < 0 ? 'stb-tr-late' : ''}>
      <td className="stb-td-id">{shootId || '—'}</td>
      <td>{mgr || '—'}</td>
      <td>{type || '—'}</td>
      <td>{status || '—'}</td>
      <td>{visitMD || '—'}</td>
      <td className="stb-td-infl">{infl || '—'}</td>
      <td>{submitted ? <span className="ok">완료</span> : (submit || '대기')}</td>
      <td className="stb-td-dl">{dlNode}</td>
    </tr>
  );
}
