import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { staffHeaders, clearStaffKey } from '../lib/staffKey';
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

/* ── 보드 범위 ── */
const VISIBLE_TYPES = ['체험', '기자'];          // 인플 제외
const RECRUITERS = ['HH', 'LH', 'AN', 'FB'];

const BUCKETS = {
  visit: '섭외(방문)',
  upload: '업로드',
  cancel: '취소·노쇼',
  pend: '제출대기',
  late: '지연',
};

/* ── 건 단위 분류 ──
   detail 튜플: [0]Shoot_ID [1]담당 [2]제출상태 [3]진행상태 [4]유형
                [5]정산월 [6]방문MM.DD [7]인플 [8]dl(기한까지 남은 날) [9]recId */
function typeOf(d) {
  const t = String(d[4] || '');
  // '기자→체험' 같은 전환 유형은 마지막(현재) 유형으로 센다
  return t.includes('→') ? t.split('→').pop().trim() : t;
}
function bucketOf(d) {
  const st = String(d[3] || '');
  if (st.includes('취소') || st.includes('노쇼')) return 'cancel';
  const sub = String(d[2] || '');
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
  if (bucket === 'pend') return d[8] !== null && b !== 'upload';
  if (bucket === 'late') return d[8] !== null && d[8] < 0 && b !== 'upload';
  return true;
}

function filterDetails(cell, { type, recruiter }) {
  return (cell?.d || []).filter((d) => {
    const ty = typeOf(d);
    if (!VISIBLE_TYPES.includes(ty)) return false;
    if (type && ty !== type) return false;
    if (recruiter && d[1] !== recruiter) return false;
    return true;
  });
}
function countsOf(ds) {
  let vis = 0; let up = 0; let cx = 0; let pend = 0; let late = 0;
  ds.forEach((d) => {
    const b = bucketOf(d);
    if (b === 'cancel') cx += 1;
    else { vis += 1; if (b === 'upload') up += 1; }
    if (d[8] !== null && b !== 'upload') { pend += 1; if (d[8] < 0) late += 1; }
  });
  return { vis, up, cx, pend, late };
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
  const [typeFilter, setTypeFilter] = useState('');
  const [recruiter, setRecruiter] = useState('');
  const [lateOnly, setLateOnly] = useState(false);
  const [sort, setSort] = useState('late');       // late | pace | name
  const [expanded, setExpanded] = useState(null); // 고객사명
  const [sel, setSel] = useState(null);           // {month, type|null, bucket|null}

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
  // 월이 바뀌면 3개월 창 자체가 밀리므로 펼침을 접는다.
  // 담당자·유형 필터 변경 때는 접지 않는다 — 보던 세부리스트가 새 필터로 갱신만 된다.
  useEffect(() => { setExpanded(null); setSel(null); }, [month]);

  const focus = data?.months?.[1] || month;
  const el = data?.el?.[focus] ?? 0;
  const flt = useMemo(() => ({ type: typeFilter, recruiter }), [typeFilter, recruiter]);

  /* ── 필터·정렬된 행 ── */
  const rows = useMemo(() => {
    if (!data?.rows) return [];
    const q = search.trim().toLowerCase();
    const out = data.rows
      .filter((r) => r.m[focus])
      .filter((r) => !q || r.n.toLowerCase().includes(q))
      .map((r) => ({ ...r, agg: aggOf(r.m[focus], flt) }))
      // 표시 유형(체험·기자) 기준으로 아무것도 없는 매장(인플 전용 등)은 뺀다
      .filter((r) => r.agg && (r.agg.tg > 0 || r.agg.vis > 0 || r.agg.cx > 0))
      .filter((r) => !lateOnly || r.agg.late > 0);
    if (sort === 'name') out.sort((a, b) => a.n.localeCompare(b.n, 'ko'));
    else if (sort === 'pace') out.sort((a, b) => (a.agg.pct - el) - (b.agg.pct - el));
    else out.sort((a, b) => (b.agg.late - a.agg.late)
      || (b.agg.pend - a.agg.pend)
      || ((a.agg.pct - el) - (b.agg.pct - el)));
    return out;
  }, [data, focus, search, flt, lateOnly, sort, el]);

  /* ── KPI (필터 반영, 선택월) ── */
  const kpi = useMemo(() => {
    const sum = { n: rows.length, tg: 0, vis: 0, up: 0, pend: 0, late: 0 };
    rows.forEach((r) => {
      sum.tg += r.agg.tg; sum.vis += r.agg.vis; sum.up += r.agg.up;
      sum.pend += r.agg.pend; sum.late += r.agg.late;
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
                  onClick={() => setRecruiter(r)}
                >{r || '담당 전체'}</button>
              ))}
            </div>
            <div className="stb-seg">
              {['', ...VISIBLE_TYPES].map((t) => (
                <button
                  key={t || '전체'}
                  className={typeFilter === t ? 'on' : ''}
                  onClick={() => setTypeFilter(t)}
                >{t || '유형 전체'}</button>
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
                      {r.p && <span className="stb-chip stb-chip-p">{r.p}</span>}
                    </div>

                    <MiniCell cell={r.m[data.months[0]]} el={data.el[data.months[0]]} flt={flt} />

                    {/* 선택월 — 유형별 바 + 숫자줄 */}
                    <div className="stb-main">
                      {VISIBLE_TYPES
                        .filter((k) => !typeFilter || k === typeFilter)
                        .map((k) => {
                          const n = typeNums(cell, k, recruiter);
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
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    <MiniCell cell={r.m[data.months[2]]} el={data.el[data.months[2]]} flt={flt} />

                    <div className="stb-late">
                      {r.agg.late > 0
                        ? (
                          <button
                            className="stb-badge-late"
                            onClick={(e) => { e.stopPropagation(); openSel(r.n, { month: focus, type: typeFilter || null, bucket: 'late' }); }}
                            title="지연 목록 보기"
                          >{r.agg.late}</button>
                        )
                        : r.agg.pend > 0
                          ? (
                            <button
                              className="stb-badge-pend"
                              onClick={(e) => { e.stopPropagation(); openSel(r.n, { month: focus, type: typeFilter || null, bucket: 'pend' }); }}
                              title="제출대기 목록 보기"
                            >{r.agg.pend}</button>
                          )
                          : <span className="stb-mut">—</span>}
                    </div>
                  </div>

                  {open && (
                    <Expand
                      row={r}
                      months={data.months}
                      el={data.el}
                      flt={flt}
                      recruiter={recruiter}
                      sel={sel}
                      setSel={setSel}
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
          지연 = 방문 후 7일 초과 미제출 건
          {recruiter && ' · 담당자 필터 중에는 섭·업·취를 그 담당자 건만 다시 센다 (목표는 매장 목표)'}
        </footer>
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

/* ── 펼침 — 앞뒤월 요약 블록 먼저, 요소를 누르면 세부리스트 ── */
function Expand({ row, months, el, flt, recruiter, sel, setSel }) {
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
                .filter((k) => !flt.type || k === flt.type)
                .map((k) => {
                  const n = typeNums(cell, k, recruiter);
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
                    </div>
                  );
                })}
              <div className="stb-blk-f">
                <NumBtn label="대기" value={agg.pend} cls={agg.pend > 0 ? 'warn' : 'mut'} title="제출대기"
                  on={() => setSel({ month: m, type: flt.type || null, bucket: 'pend' })}
                  active={active && sel?.bucket === 'pend'} />
                <NumBtn label="지연" value={agg.late} cls={agg.late > 0 ? 'bad' : 'mut'} title="마감 넘긴 미제출"
                  on={() => setSel({ month: m, type: flt.type || null, bucket: 'late' })}
                  active={active && sel?.bucket === 'late'} />
                <button
                  type="button"
                  className={`stb-cnum stb-all ${active && !sel?.bucket ? 'sel' : ''}`}
                  onClick={() => setSel({ month: m, type: flt.type || null, bucket: null })}
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
          recruiter={recruiter}
          onClose={() => setSel(null)}
        />
      )}
    </div>
  );
}

function DetailList({ cell, sel, recruiter, onClose }) {
  const ds = filterDetails(cell, { type: sel.type, recruiter })
    .filter((d) => inBucket(d, sel.bucket));
  return (
    <div className="stb-dlist">
      <div className="stb-dlist-h">
        <b>{sel.month}</b>
        {sel.type && <span className="stb-chip">{sel.type}</span>}
        <span className="stb-chip stb-chip-b">{sel.bucket ? BUCKETS[sel.bucket] : '전체'}</span>
        {recruiter && <span className="stb-chip">{recruiter}</span>}
        <span className="stb-det-cnt">{ds.length}건</span>
        <button className="stb-ghost stb-x" onClick={onClose}>닫기</button>
      </div>
      {ds.length === 0
        ? <div className="stb-dlist-empty">해당하는 건이 없습니다.</div>
        : (
          <table>
            <thead>
              <tr>
                <th>#</th><th>담당</th><th>유형</th><th>진행상태</th>
                <th>방문일</th><th>인플</th><th>제출</th><th className="stb-th-dl">기한</th>
              </tr>
            </thead>
            <tbody>
              {ds.map((d) => <DetailRow key={d[9]} d={d} />)}
            </tbody>
          </table>
        )}
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
    <tr className={dl !== null && dl < 0 && !submitted ? 'stb-tr-late' : ''}>
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
