import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { staffHeaders } from '../lib/staffKey';
import StaffNav from '../components/StaffNav';
import StaffGame from '../components/StaffGame';
import './StaffBoardPage.css';

/**
 * 담당자 진도 보드 (/staff) — Phase 1, 조회 전용.
 *
 * 체험단 섭외담당용 — **인플 유형은 이 보드에서 뺀다** (체험·기자만).
 * 고객사 나래비 × 선택월. 숫자줄 = 목표·섭외(방문)·업로드·취소, 숫자를 누르면
 * 해당 목록만 필터돼 나온다. 업체명을 누르면 관리화면처럼 앞뒤월 요약 블록이
 * 먼저 나오고, 블록의 요소를 누르면 세부리스트가 나온다.
 *
 * 숫자의 출처 두 갈래:
 *   - 담당자 필터 없음 → Campaign_DB rollup (관리화면과 같은 값, 정산 기준)
 *   - 담당자 필터 있음 → 건 목록에서 그 담당자 것만 세어 계산
 *     (rollup 은 담당자별로 쪼갤 수 없다. 목표는 매장 목표 그대로 둔다)
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

/* ── 보드 범위 — 오직 체험단. 인플·기자단은 이 보드가 다루지 않는다 ── */
const VISIBLE_TYPES = ['체험'];
// FB 는 인플 입력용 계정이라 담당자 버튼에서 뺀다 (기록에 있으면 '담당' 열에는 그대로 보인다)
const RECRUITERS = ['HH', 'LH', 'AN'];

const BUCKETS = {
  visit: '섭외(방문)',
  upload: '업로드',
  cancel: '취소·노쇼',
  pend: '제출대기',
  late: '지연',
};

/* ── 건 단위 분류 — detail 은 서버가 내려주는 객체 (staff-board.js 참조) ── */
function typeOf(d) {
  const t = String(d.ty || '');
  // '기자→체험' 같은 전환 유형은 마지막(현재) 유형으로 센다
  return t.includes('→') ? t.split('→').pop().trim() : t;
}
function bucketOf(d) {
  const st = String(d.st || '');
  if (st.includes('취소') || st.includes('노쇼')) return 'cancel';
  const sub = String(d.sub || '');
  if (sub.includes('제출완료') || sub.includes('✅')
    || st.includes('업로드완료') || st.includes('송부완료')) return 'upload';
  return 'visit';
}
function inBucket(d, bucket) {
  if (!bucket) return true;
  const b = bucketOf(d);
  if (bucket === 'visit') return b !== 'cancel';   // 섭외수량 = 취소 뺀 전부
  if (bucket === 'upload') return b === 'upload';
  if (bucket === 'cancel') return b === 'cancel';
  if (bucket === 'pend') return d.dl !== null && b !== 'upload';
  if (bucket === 'late') return d.dl !== null && d.dl < 0 && b !== 'upload';
  return true;
}

function filterDetails(cell, { type, recruiter }) {
  return (cell?.d || []).filter((d) => {
    const ty = typeOf(d);
    if (!VISIBLE_TYPES.includes(ty)) return false;
    if (type && ty !== type) return false;
    if (recruiter && d.mgr !== recruiter) return false;
    return true;
  });
}
function countsOf(ds) {
  let vis = 0; let up = 0; let cx = 0; let pend = 0; let late = 0;
  ds.forEach((d) => {
    const b = bucketOf(d);
    if (b === 'cancel') cx += 1;
    else { vis += 1; if (b === 'upload') up += 1; }
    if (d.dl !== null && b !== 'upload') { pend += 1; if (d.dl < 0) late += 1; }
  });
  return { vis, up, cx, pend, late };
}

/** 비고(richText)가 마크다운 이스케이프("2026\\.")를 물고 온다 — 표시할 때만 벗긴다 */
function unescapeMd(s) {
  return String(s || '').replace(/\\([\\.`*_{}[\]()#+\-!>])/g, '$1');
}

/** 클립보드 복사 — http 환경·구형 브라우저 폴백 포함 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/** 유형 하나의 숫자 4종 — 담당자 필터 없으면 rollup, 있으면 건 목록 계산 */
function typeNums(cell, k, recruiter) {
  const roll = cell.t?.[k];
  const tg = roll ? roll[0] : 0;
  if (!recruiter) {
    if (!roll) return null;
    return { tg, vis: roll[1], up: roll[2], cx: roll[3] };
  }
  const c = countsOf(filterDetails(cell, { type: k, recruiter }));
  if (!roll && !c.vis && !c.cx) return null;
  return { tg, vis: c.vis, up: c.up, cx: c.cx };
}

/** 월 셀 집계 (표시 유형 전체) — 미니 셀·KPI·정렬용 */
function aggOf(cell, { type, recruiter }) {
  if (!cell) return null;
  let tg = 0; let vis = 0; let up = 0; let cx = 0;
  VISIBLE_TYPES.filter((k) => !type || k === type).forEach((k) => {
    const n = typeNums(cell, k, recruiter);
    if (!n) return;
    tg += n.tg; vis += n.vis; up += n.up; cx += n.cx;
  });
  const c = countsOf(filterDetails(cell, { type, recruiter }));
  return { tg, vis, up, cx, pend: c.pend, late: c.late, pct: tg ? vis / tg : 0 };
}

/* ── 진도 색 — 진도율(섭외/목표)과 월 경과율의 차이로 판정 ── */
function paceClass(pct, el, target) {
  if (!target) return 'mut';
  const diff = pct - el;
  if (diff >= -0.05) return 'ok';
  if (diff >= -0.15) return 'warn';
  if (diff >= -0.3) return 'orange';
  return 'bad';
}

export default function StaffBoardPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [recruiter, setRecruiter] = useState('');   // 지연·대기 카운트와 목록의 기본 담당자
  const [statusFilter, setStatusFilter] = useState(''); // '' | pace(섭외지연) | late(업로드지연) | done(완료)
  const [sort, setSort] = useState('late');       // late | pace | name
  const [expanded, setExpanded] = useState(null); // 고객사명
  const [sel, setSel] = useState(null);           // {month, type|null, bucket|null}
  const [infoFor, setInfoFor] = useState(null);   // ⓘ 업체정보 카드가 열린 고객사명
  const [memoEdits, setMemoEdits] = useState({}); // {recId: 저장된 메모} — 재조회 전 낙관 반영

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
      setMemoEdits({});
    } catch (e) {
      setError(e.message || '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveMemo = useCallback(async (id, memo) => {
    const res = await fetch('/api/staff-board', {
      method: 'POST',
      headers: staffHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'memo', id, memo }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || '메모 저장에 실패했습니다.');
    setMemoEdits((prev) => ({ ...prev, [id]: memo }));
  }, []);

  useEffect(() => { load(month); }, [month, load]);
  // 월이 바뀌면 3개월 창 자체가 밀리므로 펼침을 접는다.
  // 담당자·유형 필터 변경 때는 접지 않는다 — 보던 세부리스트가 새 필터로 갱신만 된다.
  useEffect(() => { setExpanded(null); setSel(null); setInfoFor(null); }, [month]);

  const focus = data?.months?.[1] || month;
  const el = data?.el?.[focus] ?? 0;
  // 담당자별 보기는 세부리스트 안의 버튼으로 한다 — 보드 숫자는 항상 정산 기준(rollup) 하나.
  const flt = useMemo(() => ({ type: '', recruiter: '' }), []);

  /* ── 필터 전 단계 행 — 숫자는 rollup, 지연·대기만 담당자 기준 재계산 ── */
  const baseRows = useMemo(() => {
    if (!data?.rows) return [];
    const q = search.trim().toLowerCase();
    return data.rows
      .filter((r) => r.m[focus])
      .filter((r) => !q || r.n.toLowerCase().includes(q))
      .map((r) => {
        const cell = r.m[focus];
        const agg = aggOf(cell, flt);
        if (!agg || !(agg.tg > 0 || agg.vis > 0 || agg.cx > 0)) return null;
        const rc = recruiter ? countsOf(filterDetails(cell, { type: '', recruiter })) : null;
        return {
          ...r,
          agg,
          late2: rc ? rc.late : agg.late,   // 담당자 선택 시 그 담당자 건만
          pend2: rc ? rc.pend : agg.pend,
          paceBehind: agg.tg > 0 && agg.vis < agg.tg && (agg.pct - el) < -0.05,
          done: agg.tg > 0 && agg.vis >= agg.tg,
        };
      })
      .filter(Boolean);
  }, [data, focus, search, flt, recruiter, el]);

  /* ── 상태 필터 카운트 (버튼 뱃지용) ── */
  const statusCounts = useMemo(() => ({
    pace: baseRows.filter((r) => r.paceBehind).length,
    late: baseRows.filter((r) => r.late2 > 0).length,
    done: baseRows.filter((r) => r.done).length,
  }), [baseRows]);

  /* ── 상태 필터 + 정렬 ── */
  const rows = useMemo(() => {
    const out = baseRows.filter((r) => {
      if (statusFilter === 'pace') return r.paceBehind;
      if (statusFilter === 'late') return r.late2 > 0;
      if (statusFilter === 'done') return r.done;
      return true;
    });
    if (sort === 'name') out.sort((a, b) => a.n.localeCompare(b.n, 'ko'));
    else if (sort === 'pace') out.sort((a, b) => (a.agg.pct - el) - (b.agg.pct - el));
    else out.sort((a, b) => (b.late2 - a.late2)
      || (b.pend2 - a.pend2)
      || ((a.agg.pct - el) - (b.agg.pct - el)));
    return out;
  }, [baseRows, statusFilter, sort, el]);

  /* ── KPI (필터 반영, 선택월) ── */
  const kpi = useMemo(() => {
    const sum = { n: rows.length, tg: 0, vis: 0, up: 0, pend: 0, late: 0 };
    rows.forEach((r) => {
      sum.tg += r.agg.tg; sum.vis += r.agg.vis; sum.up += r.agg.up;
      sum.pend += r.pend2; sum.late += r.late2;
    });
    return sum;
  }, [rows]);

  function openSel(rowName, next) {
    setExpanded(rowName);
    setSel(next);
  }
  function toggleRow(rowName) {
    if (expanded === rowName) { setExpanded(null); setSel(null); }
    else { setExpanded(rowName); setSel(null); }
  }
  return (
    <div className="stb-root">
      <div className="stb-wrap">

        {/* ── 헤더 ── */}
        <header className="stb-head">
          <div className="stb-title">
            <span className="stb-dot" />
            <h1>진도 보드</h1>
            <span className="stb-scope">체험단</span>
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
              {['', ...RECRUITERS].map((r) => (
                <button
                  key={r || '전체'}
                  className={recruiter === r ? 'on' : ''}
                  title="지연·대기 숫자와 세부리스트를 이 담당자 기준으로"
                  onClick={() => setRecruiter(r)}
                >{r || '담당 전체'}</button>
              ))}
            </div>
            <div className="stb-seg">
              <button className={statusFilter === '' ? 'on' : ''} onClick={() => setStatusFilter('')}>전체</button>
              <button
                className={`${statusFilter === 'pace' ? 'on' : ''}`}
                title="목표 미달 + 진도가 월 경과보다 뒤처진 매장"
                onClick={() => setStatusFilter(statusFilter === 'pace' ? '' : 'pace')}
              >🟠 섭외지연 {statusCounts.pace || ''}</button>
              <button
                className={`${statusFilter === 'late' ? 'on' : ''}`}
                title="방문 후 7일 넘도록 미제출 건이 있는 매장"
                onClick={() => setStatusFilter(statusFilter === 'late' ? '' : 'late')}
              >🔴 업로드지연 {statusCounts.late || ''}</button>
              <button
                className={`${statusFilter === 'done' ? 'on' : ''}`}
                title="섭외가 목표에 도달한 매장"
                onClick={() => setStatusFilter(statusFilter === 'done' ? '' : 'done')}
              >✅ 완료 {statusCounts.done || ''}</button>
            </div>
            <div className="stb-seg stb-sort">
              <button className={sort === 'late' ? 'on' : ''} onClick={() => setSort('late')}>지연순</button>
              <button className={sort === 'pace' ? 'on' : ''} onClick={() => setSort('pace')}>진도순</button>
              <button className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}>이름순</button>
            </div>
            <StaffNav current="board" />
            <button className="stb-ghost" onClick={() => load(month)} title="새로고침">⟳</button>
          </div>
        </header>

        {/* ── KPI ── */}
        {!loading && !error && (
          <div className="stb-kpis">
            <div className="stb-kpi"><i>계약</i><b>{kpi.n}</b></div>
            <div className="stb-kpi"><i>목표</i><b>{kpi.tg}</b></div>
            <div className="stb-kpi">
              <i>섭외</i>
              <b className={paceClass(kpi.tg ? kpi.vis / kpi.tg : 0, el, kpi.tg)}>{kpi.vis}</b>
              <s>{kpi.tg ? Math.round((kpi.vis / kpi.tg) * 100) : 0}%</s>
            </div>
            <div className="stb-kpi"><i>업로드</i><b>{kpi.up}</b><s>{kpi.tg ? Math.round((kpi.up / kpi.tg) * 100) : 0}%</s></div>
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
            <div className="stb-cols">
              <span>고객사</span>
              <span className="stb-mini-h">{shortMonth(data.months[0])}</span>
              <span>{shortMonth(focus)} — 목표 · 섭외 · 업로드 · 취소 (숫자 클릭 = 목록)</span>
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
                    onClick={() => toggleRow(r.n)}
                  >
                    <div className="stb-name">
                      <b>{r.n}</b>
                      <button
                        type="button"
                        className={`stb-info-btn ${infoFor === r.n ? 'on' : ''}`}
                        title="제공내역·영업시간·주의사항 등 업체 정보"
                        onClick={(e) => { e.stopPropagation(); setInfoFor(infoFor === r.n ? null : r.n); }}
                      >ⓘ</button>
                      {r.info?.sid && (
                        <Link
                          className="stb-addlink"
                          to={`/staff/new?store=${r.info.sid}`}
                          title="이 매장 예약입력"
                          onClick={(e) => e.stopPropagation()}
                        >＋</Link>
                      )}
                      {cell.add === 1 && <span className="stb-chip stb-chip-add" title="목표량 넘어도 추가 섭외 가능">추가OK</span>}
                      {(cell.chk === 1 || cell.notice) && (
                        <span
                          className="stb-chip stb-chip-chk"
                          title={cell.notice ? `관리자 전달사항:\n${cell.notice}` : '관리자 확인요망'}
                        >🔔{cell.notice ? ' 전달' : ' 확인'}</span>
                      )}
                      {r.p && <span className="stb-chip stb-chip-p">{r.p}</span>}
                    </div>

                    <MiniCell cell={r.m[data.months[0]]} el={data.el[data.months[0]]} flt={flt} />

                    {/* 선택월 — 체험단 바 + 숫자줄 */}
                    <div className="stb-main">
                      {VISIBLE_TYPES
                        .map((k) => {
                          const n = typeNums(cell, k, '');
                          if (!n) return null;
                          const pc = paceClass(n.tg ? n.vis / n.tg : 0, el, n.tg);
                          return (
                            <div key={k} className="stb-ty">
                              <i>{k}</i>
                              <div className="stb-bar">
                                <em className="stb-bar-v" style={{ width: `${Math.min(n.tg ? (n.vis / n.tg) * 100 : 0, 100)}%` }} />
                                <em className={`stb-bar-u bg-${pc}`} style={{ width: `${Math.min(n.tg ? (n.up / n.tg) * 100 : 0, 100)}%` }} />
                                <em className="stb-mk" style={{ left: `${el * 100}%` }} />
                              </div>
                              <div className="stb-nums" onClick={(e) => e.stopPropagation()}>
                                <span className="stb-cnum stb-cnum-tg" title="목표">
                                  <i>목</i><b>{n.tg}</b>
                                </span>
                                <NumBtn label="섭" value={n.vis} cls={pc} title="섭외(방문) — 취소 뺀 전부"
                                  on={() => openSel(r.n, { month: focus, type: k, bucket: 'visit' })}
                                  active={open && sel?.month === focus && sel?.type === k && sel?.bucket === 'visit'} />
                                <NumBtn label="업" value={n.up} cls="" title="업로드 완료"
                                  on={() => openSel(r.n, { month: focus, type: k, bucket: 'upload' })}
                                  active={open && sel?.month === focus && sel?.type === k && sel?.bucket === 'upload'} />
                                <NumBtn label="취" value={n.cx} cls={n.cx > 0 ? 'orange' : 'mut'} title="취소·노쇼"
                                  on={() => openSel(r.n, { month: focus, type: k, bucket: 'cancel' })}
                                  active={open && sel?.month === focus && sel?.type === k && sel?.bucket === 'cancel'} />
                                {n.tg > 0 && n.vis >= n.tg && (
                                  <span className="stb-done" title="이번 달 목표를 채웠습니다. 신규 예약은 다음 달 정산월로 입력하세요.">
                                    ✅ 섭외완료 · 다음달 입력
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}

                      {/* 업로드지연 보기 — 지연 건을 행 안에서 바로 보여준다 */}
                      {statusFilter === 'late' && r.late2 > 0 && (
                        <div className="stb-latein" onClick={(e) => e.stopPropagation()}>
                          {filterDetails(cell, { type: '', recruiter })
                            .filter((d) => inBucket(d, 'late'))
                            .slice(0, 8)
                            .map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                className="stb-latechip"
                                title={`${d.mgr} · ${d.st} · 방문 ${d.visit}${d.infl ? `\n${d.infl}` : ''}`}
                                onClick={() => openSel(r.n, { month: focus, type: null, bucket: 'late' })}
                              >
                                {d.infl || d.lead || d.sid}<b>D+{-d.dl}</b>
                              </button>
                            ))}
                          {r.late2 > 8 && <span className="stb-mut">+{r.late2 - 8}</span>}
                        </div>
                      )}
                    </div>

                    <MiniCell cell={r.m[data.months[2]]} el={data.el[data.months[2]]} flt={flt} />

                    <div className="stb-late">
                      {r.late2 > 0
                        ? (
                          <button
                            className="stb-badge-late"
                            onClick={(e) => { e.stopPropagation(); openSel(r.n, { month: focus, type: null, bucket: 'late' }); }}
                            title={`지연 목록 보기${recruiter ? ` (${recruiter})` : ''}`}
                          >{r.late2}</button>
                        )
                        : r.pend2 > 0
                          ? (
                            <button
                              className="stb-badge-pend"
                              onClick={(e) => { e.stopPropagation(); openSel(r.n, { month: focus, type: null, bucket: 'pend' }); }}
                              title={`제출대기 목록 보기${recruiter ? ` (${recruiter})` : ''}`}
                            >{r.pend2}</button>
                          )
                          : <span className="stb-mut">—</span>}
                    </div>
                  </div>

                  {infoFor === r.n && (
                    <StoreInfo row={r} cell={cell} onClose={() => setInfoFor(null)} />
                  )}

                  {open && (
                    <Expand
                      row={r}
                      months={data.months}
                      el={data.el}
                      flt={flt}
                      sel={sel}
                      setSel={setSel}
                      initMgr={recruiter}
                      memoEdits={memoEdits}
                      onSaveMemo={saveMemo}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        <footer className="stb-foot">
          숫자줄: 목=목표 · 섭=섭외(방문, 취소 제외) · 업=업로드 완료 · 취=취소·노쇼 — 숫자를 누르면 해당 목록만.
          진행바 = 섭외(옅음)·업로드(짙음) / 목표 · 세로선 = 월 경과 기준 ·
          지연 = 방문 후 7일 초과 미제출 건 · 섭외지연 = 목표 미달 + 진도가 월 경과보다 뒤처짐 ·
          담당자를 고르면 지연·대기 숫자와 목록이 그 담당자 것만 (목·섭·업·취 숫자는 매장 전체)
        </footer>

        {/* 스태프 아케이드 — 접힌 배너가 기본, 업무 화면을 침범하지 않는다 */}
        <StaffGame />
      </div>
    </div>
  );
}

/* ── 클릭 가능한 숫자 ── */
function NumBtn({ label, value, cls, title, on, active }) {
  return (
    <button
      type="button"
      className={`stb-cnum ${active ? 'sel' : ''}`}
      title={`${title} — 클릭하면 목록`}
      onClick={on}
    >
      <i>{label}</i><b className={cls}>{value}</b>
    </button>
  );
}

/* ── 전월/익월 미니 셀 ── */
function MiniCell({ cell, el, flt }) {
  const agg = aggOf(cell, flt);
  if (!agg || (!agg.tg && !agg.vis)) return <div className="stb-mini stb-mut">—</div>;
  const pc = paceClass(agg.pct, el ?? 1, agg.tg);
  return (
    <div className="stb-mini">
      <b className={pc}>{agg.tg ? Math.round(agg.pct * 100) : '—'}%</b>
      <s>{agg.vis}/{agg.tg}</s>
      {agg.late > 0 && <i className="stb-minidot" title={`지연 ${agg.late}건`} />}
    </div>
  );
}

/* ── ⓘ 업체 정보 카드 — 섭외 전에 봐야 하는 것들. 전체 복사 지원 ── */
function storeInfoText(row, cell) {
  const i = row.info || {};
  const lines = [
    `[${row.n}]${i.cn ? ` ${i.cn}` : ''}`,
    [i.open && `영업 ${i.open}`, i.brk && `브레이크 ${i.brk}`, i.peak && `피크 ${i.peak}`]
      .filter(Boolean).join(' · '),
    [i.rest && `휴무 ${i.rest}`, i.visitOk && `방문가능 ${i.visitOk}`].filter(Boolean).join(' · '),
    i.give && `제공내역: ${i.give}`,
    i.warn && `섭외주의: ${i.warn}`,
    i.note && `비고: ${i.note}`,
    cell?.memo && `계약비고: ${cell.memo}`,
    cell?.add === 1 ? '※ 목표량 초과 추가 섭외 가능' : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function StoreInfo({ row, cell, onClose }) {
  const i = row.info;
  return (
    <div className="stb-sinfo" onClick={(e) => e.stopPropagation()}>
      <div className="stb-sinfo-h">
        <b>{row.n}</b>
        {i?.cn && <span className="stb-sinfo-cn">{i.cn}</span>}
        {cell?.add === 1
          ? <span className="stb-chip stb-chip-add">목표 초과 추가 가능</span>
          : <span className="stb-chip">추가 여부 미표시</span>}
        <CopyBtn label="📋 전체 복사" text={storeInfoText(row, cell)} title="업체 정보 전체 복사" />
        <button className="stb-ghost stb-x" onClick={onClose}>닫기</button>
      </div>
      {!i
        ? <div className="stb-sinfo-empty">CS_DB 에 연결된 업체 정보가 없습니다.</div>
        : (
          <div className="stb-sinfo-grid">
            <InfoItem k="영업시간" v={i.open} />
            <InfoItem k="브레이크" v={i.brk} />
            <InfoItem k="피크타임" v={i.peak} />
            <InfoItem k="정기휴무" v={i.rest} />
            <InfoItem k="방문가능" v={i.visitOk} />
            <InfoItem k="제공내역" v={i.give} wide />
            <InfoItem k="섭외주의" v={i.warn} wide warn />
            <InfoItem k="비고" v={i.note} wide />
            {cell?.memo && <InfoItem k="계약비고" v={cell.memo} wide />}
            {cell?.notice && <InfoItem k="🔔 전달사항" v={cell.notice} wide warn />}
          </div>
        )}
    </div>
  );
}

function InfoItem({ k, v, wide, warn }) {
  if (!v) return null;
  return (
    <div className={`stb-sinfo-it ${wide ? 'wide' : ''} ${warn ? 'warn2' : ''}`}>
      <i>{k}</i>
      <span>{v}</span>
    </div>
  );
}

/* ── 펼침 — 앞뒤월 요약 블록 먼저, 요소를 누르면 세부리스트 ── */
function Expand({ row, months, el, flt, sel, setSel, initMgr, memoEdits, onSaveMemo }) {
  return (
    <div className="stb-det" onClick={(e) => e.stopPropagation()}>
      <div className="stb-blks">
        {months.map((m) => {
          const cell = row.m[m];
          if (!cell) return <div key={m} className="stb-blk stb-blk-none"><b>{m}</b><span className="stb-mut">계약 없음</span></div>;
          const agg = aggOf(cell, flt);
          const active = sel?.month === m;
          return (
            <div key={m} className={`stb-blk ${active ? 'on' : ''}`}>
              <div className="stb-blk-h">
                <b>{m}</b>
                {cell.memo && <span className="stb-blk-memo" title={cell.memo}>{cell.memo}</span>}
                <span className="stb-blk-el">경과 {Math.round((el[m] ?? 0) * 100)}%</span>
              </div>
              {VISIBLE_TYPES
                .map((k) => {
                  const n = typeNums(cell, k, '');
                  if (!n) return null;
                  const pc = paceClass(n.tg ? n.vis / n.tg : 0, el[m] ?? 0, n.tg);
                  const isSel = (b) => active && sel?.type === k && sel?.bucket === b;
                  return (
                    <div key={k} className="stb-blk-ty">
                      <i>{k}</i>
                      <span className="stb-cnum stb-cnum-tg"><i>목</i><b>{n.tg}</b></span>
                      <NumBtn label="섭" value={n.vis} cls={pc} title="섭외(방문)"
                        on={() => setSel({ month: m, type: k, bucket: 'visit' })} active={isSel('visit')} />
                      <NumBtn label="업" value={n.up} cls="" title="업로드 완료"
                        on={() => setSel({ month: m, type: k, bucket: 'upload' })} active={isSel('upload')} />
                      <NumBtn label="취" value={n.cx} cls={n.cx > 0 ? 'orange' : 'mut'} title="취소·노쇼"
                        on={() => setSel({ month: m, type: k, bucket: 'cancel' })} active={isSel('cancel')} />
                      {n.tg > 0 && n.vis >= n.tg && (
                        <span className="stb-done" title="이 달 목표를 채웠습니다. 신규 예약은 다음 달 정산월로 입력하세요.">
                          ✅ 완료 · 다음달
                        </span>
                      )}
                    </div>
                  );
                })}
              <div className="stb-blk-f">
                <NumBtn label="대기" value={agg.pend} cls={agg.pend > 0 ? 'warn' : 'mut'} title="제출대기"
                  on={() => setSel({ month: m, type: null, bucket: 'pend' })}
                  active={active && sel?.bucket === 'pend'} />
                <NumBtn label="지연" value={agg.late} cls={agg.late > 0 ? 'bad' : 'mut'} title="마감 넘긴 미제출"
                  on={() => setSel({ month: m, type: null, bucket: 'late' })}
                  active={active && sel?.bucket === 'late'} />
                <button
                  type="button"
                  className={`stb-cnum stb-all ${active && !sel?.bucket ? 'sel' : ''}`}
                  onClick={() => setSel({ month: m, type: null, bucket: null })}
                >전체 목록</button>
              </div>
            </div>
          );
        })}
      </div>

      {sel && row.m[sel.month] && (
        <DetailList
          cell={row.m[sel.month]}
          sel={sel}
          initMgr={initMgr}
          memoEdits={memoEdits}
          onSaveMemo={onSaveMemo}
          onClose={() => setSel(null)}
        />
      )}
    </div>
  );
}

function DetailList({ cell, sel, initMgr, memoEdits, onSaveMemo, onClose }) {
  // 담당자별 보기 — 표 안에서 바로 전환한다 (FB 는 인플 입력용이라 버튼 없음).
  // 헤더에서 담당자를 골라뒀으면 그걸 기본값으로 물고, 헤더가 바뀌면 따라간다.
  const [mgr, setMgr] = useState(initMgr || '');
  const [prevInit, setPrevInit] = useState(initMgr);
  if (prevInit !== initMgr) {
    setPrevInit(initMgr);
    setMgr(initMgr || '');
  }
  const base = filterDetails(cell, { type: sel.type, recruiter: '' })
    .filter((d) => inBucket(d, sel.bucket));
  const ds = mgr ? base.filter((d) => d.mgr === mgr) : base;
  return (
    <div className="stb-dlist">
      <div className="stb-dlist-h">
        <b>{sel.month}</b>
        {sel.type && <span className="stb-chip">{sel.type}</span>}
        <span className="stb-chip stb-chip-b">{sel.bucket ? BUCKETS[sel.bucket] : '전체'}</span>
        <div className="stb-seg stb-seg-sm">
          <button className={mgr === '' ? 'on' : ''} onClick={() => setMgr('')}>
            전체 {base.length}
          </button>
          {RECRUITERS.map((r) => (
            <button key={r} className={mgr === r ? 'on' : ''} onClick={() => setMgr(r)}>
              {r} {base.filter((d) => d.mgr === r).length}
            </button>
          ))}
        </div>
        <span className="stb-det-cnt">{ds.length}건</span>
        <button className="stb-ghost stb-x" onClick={onClose}>닫기</button>
      </div>
      {ds.length === 0
        ? <div className="stb-dlist-empty">해당하는 건이 없습니다.</div>
        : (
          <table>
            <thead>
              <tr>
                <th>담당</th><th>유형</th><th>상태</th>
                <th>방문일시</th><th>대표인플</th><th>인플</th>
                <th>인원·건수</th><th>제출링크</th><th className="stb-th-memo">메모</th>
                <th>전달</th><th className="stb-th-dl">기한</th>
              </tr>
            </thead>
            <tbody>
              {ds.map((d) => (
                <DetailRow
                  key={d.id}
                  d={d}
                  memoVal={memoEdits[d.id] !== undefined ? memoEdits[d.id] : d.memo}
                  onSaveMemo={onSaveMemo}
                />
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}

/** 제출 링크 칩 — 마우스 올리면 전체 URL(title), 클릭하면 새 탭 */
function ResultLink({ label, url }) {
  if (!url) return null;
  return (
    <a
      className="stb-lnk"
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      onClick={(e) => e.stopPropagation()}
    >{label}</a>
  );
}

/** 복사 버튼 — 누르면 ✓ 로 1.5초 표시 */
function CopyBtn({ label, text, title }) {
  const [ok, setOk] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      className={`stb-copy ${ok ? 'ok2' : ''}`}
      title={`${title}\n\n${text.slice(0, 300)}`}
      onClick={async (e) => {
        e.stopPropagation();
        await copyText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >{ok ? '✓ 복사됨' : label}</button>
  );
}

/** 메모(비고) — 클릭하면 그 자리에서 편집, Airtable 에 바로 저장 */
function MemoCell({ value, onSave }) {
  const [edit, setEdit] = useState(false);
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const shown = unescapeMd(value);

  if (!edit) {
    return (
      <button
        type="button"
        className={`stb-memo ${shown ? '' : 'empty'}`}
        title={shown ? `${shown}\n\n클릭하면 수정` : '클릭해서 메모 입력'}
        onClick={(e) => { e.stopPropagation(); setTxt(shown); setErr(''); setEdit(true); }}
      >{shown || '＋ 메모'}</button>
    );
  }
  return (
    <div className="stb-memo-ed" onClick={(e) => e.stopPropagation()}>
      <textarea
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        rows={2}
        autoFocus
        disabled={busy}
      />
      {err && <div className="stb-memo-err">{err}</div>}
      <div className="stb-memo-btns">
        <button
          type="button"
          disabled={busy}
          className="stb-memo-save"
          onClick={async () => {
            setBusy(true); setErr('');
            try { await onSave(txt.trim()); setEdit(false); }
            catch (e2) { setErr(e2.message); }
            finally { setBusy(false); }
          }}
        >{busy ? '저장 중…' : '저장'}</button>
        <button type="button" disabled={busy} onClick={() => setEdit(false)}>취소</button>
      </div>
    </div>
  );
}

// 방문시간 +30분 경과 & 미체크인 & 아직 방문 전 상태 → "안 왔나?" 후보.
// 실무자가 매일 확인 전화를 돌리던 일을 보드가 대신 표시한다.
const AWAITING_VISIT = ['예약요청', '예약확정', '긴급예약', '변경확정'];
function overdueHours(d) {
  if (d.checkinTime || !d.visit) return 0;
  if (!AWAITING_VISIT.includes(d.st)) return 0;
  const t = new Date(`${(d.chg || d.visit).replace(' ', 'T')}:00+09:00`).getTime();
  if (Number.isNaN(t)) return 0;
  const h = (Date.now() - t) / 3600000;
  // 72시간 넘은 건 체크인 도입 전 미정리 레코드일 확률이 높다 — 최근 건만 경보
  return (h > 0.5 && h < 72) ? h : 0;
}

function DetailRow({ d, memoVal, onSaveMemo }) {
  const submitted = d.sub.includes('제출완료') || d.sub.includes('✅');
  const odue = overdueHours(d);
  let dlNode = <span className="stb-mut">—</span>;
  if (d.dl !== null && !submitted) {
    if (d.dl < 0) dlNode = <span className="bad">D+{-d.dl}</span>;
    else if (d.dl <= 2) dlNode = <span className="warn">D-{d.dl}</span>;
    else dlNode = <span className="stb-mut">D-{d.dl}</span>;
  }
  const hasResult = d.rx || d.rd || d.ry;
  return (
    <tr className={d.dl !== null && d.dl < 0 && !submitted ? 'stb-tr-late' : ''}>
      <td>{d.mgr || '—'}</td>
      <td>{d.ty || '—'}</td>
      <td>{d.st || '—'}</td>
      <td className="stb-td-when">
        {d.visit || '—'}
        {d.chg && <div className="stb-chg" title="변경일시">변경 {d.chg}</div>}
        {d.checkinTime && (
          <div style={{ color: '#16a34a', fontSize: '0.8rem', marginTop: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '2px' }}>
            ✅ 체크인 {d.checkinTime.split(' ')[1] || ''}
          </div>
        )}
        {odue > 0 && (
          <div
            style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', fontWeight: 'bold' }}
            title="방문시간이 지났는데 체크인이 없습니다 — 노쇼·지각 확인 필요"
          >
            ⚠ 미체크인 {odue >= 1 ? `${Math.floor(odue)}시간` : `${Math.round(odue * 60)}분`} 경과
          </div>
        )}
      </td>
      <td className="stb-td-infl">{d.lead || '—'}</td>
      <td className="stb-td-infl">
        {d.ilink
          ? (
            <a
              href={d.ilink}
              target="_blank"
              rel="noreferrer"
              title={`샤오홍슈 홈 열기\n${d.ilink}`}
              onClick={(e) => e.stopPropagation()}
            >{d.infl || '링크'}</a>
          )
          : (d.infl || '—')}
      </td>
      <td className="stb-td-cnt">
        {d.pax !== '' ? `${d.pax}명` : '—'}
        {d.paxChg !== '' && d.paxChg !== d.pax && <span className="orange">→{d.paxChg}</span>}
        <div className="stb-cnt2">小{d.nx === '' ? 0 : d.nx} 大{d.nd === '' ? 0 : d.nd}</div>
      </td>
      <td className="stb-td-lnks">
        {hasResult
          ? (
            <span className="stb-lnks">
              <ResultLink label="小红" url={d.rx} />
              <ResultLink label="大众" url={d.rd} />
              <ResultLink label="抖音" url={d.ry} />
            </span>
          )
          : <span className="stb-mut">—</span>}
      </td>
      <td className="stb-td-memo">
        <MemoCell value={memoVal} onSave={(t) => onSaveMemo(d.id, t)} />
      </td>
      <td className="stb-td-give">
        <CopyBtn label="🔗 링크" text={d.give} title="인플 전달용 제출 링크 복사" />
        <CopyBtn label="📋 가이드" text={d.guide} title="촬영 가이드 복사" />
      </td>
      <td className="stb-td-dl">{dlNode}</td>
    </tr>
  );
}
