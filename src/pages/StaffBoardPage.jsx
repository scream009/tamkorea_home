import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { staffHeaders } from '../lib/staffKey';
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
/* 보드에 보이는 유형 — 배열 순서가 화면 순서다 (체험 블록 아래 인플, Owner 2026-08-24).
   데이터는 원래 전 유형이 내려오고 있었고 이 상수가 화면만 잠그고 있었다.
   ⚠️ 여기 추가하면 미니셀 합산·진도율·행 리스팅에도 그 유형이 포함된다. '기자'는 아직 제외. */
const VISIBLE_TYPES = ['체험', '인플'];
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
    // 유형을 집어 열면(기자 포함) 그 유형만, 전체 목록은 VISIBLE_TYPES 만
    // — 기자단은 줄엔 없지만 목록은 볼 수 있어야 한다 (Owner 2026-08-24)
    if (type) { if (ty !== type) return false; }
    else if (!VISIBLE_TYPES.includes(ty)) return false;
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

/* ── 섭외 상태 뱃지 — 완료/진행/지연/긴급 (Owner 2026-08-24)
   모든 줄에 같은 폭으로 붙여 줄을 맞춘다. 색 기준은 paceClass(진도 바·숫자 색)와 동일:
   ok=진행(초록) · warn/orange=지연(노랑·주황) · bad=긴급(빨강). 목표 0이면 투명 자리만. */
function PaceBadge({ n, pc, short }) {
  const size = short ? 'stb-done-s' : 'stb-done-l';
  if (!n || !n.tg) {
    return <span className={`stb-done ${size} stb-st-ph`} aria-hidden="true">진행</span>;
  }
  let cls; let txt; let title;
  if (n.vis >= n.tg) {
    // ✅ 는 뒤에 — 앞에 붙이면 완료 줄만 글자 시작 위치가 밀려 열이 어긋난다 (Owner 2026-08-24)
    cls = 'stb-st-done'; txt = short ? '완료' : '섭외완료';
    title = '이번 달 목표를 채웠습니다. 신규 예약은 다음 달 정산월로 입력하세요.';
  } else if (pc === 'ok') {
    cls = 'stb-st-go'; txt = short ? '진행' : '섭외진행'; title = '월 경과 대비 순항 중';
  } else if (pc === 'warn' || pc === 'orange') {
    cls = pc === 'warn' ? 'stb-st-slow' : 'stb-st-slow2';
    txt = short ? '지연' : '섭외지연'; title = '월 경과 대비 섭외가 뒤처져 있습니다';
  } else {
    cls = 'stb-st-urgent'; txt = short ? '긴급' : '섭외긴급';
    title = '월 경과 대비 크게 부족 — 섭외 보강이 필요합니다';
  }
  return (
    <span className={`stb-done ${size} ${cls}`} title={title}>
      {txt}
      {/* ✅ 는 별도 요소로 박스 우변에 — 텍스트에 이어 붙이면 완료 뱃지만 폭이 넘쳐
          박스 폭이 달라진다 (Owner 2026-08-24) */}
      {cls === 'stb-st-done' && <i className="stb-done-ic" aria-hidden="true">✅</i>}
    </span>
  );
}

export default function StaffBoardPage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [recruiter, setRecruiter] = useState('');   // 지연·대기 카운트와 목록의 기본 담당자
  const [statusFilter, setStatusFilter] = useState(''); // '' | pace(섭외지연) | late(업로드지연) | done(완료)
  const [sort, setSort] = useState('name');       // name | late | pace — 기본 가나다 (Owner 2026-08-24)
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

  /* 취소·노쇼 (Owner 2026-08-21 — Softr 에 있던 버튼 복원).
     진행_DB 를 직접 고치지 않는다. 서버가 팀명생성기로 예약입력_DB 를 찾아
     진행상태+자동발송체크를 세우고, 예약봇이 매장에 안내를 보낸다. */
  const cancelRow = useCallback(async (d, kind, memo) => {
    const r = await fetch('/api/staff-board', {
      method: 'POST',
      headers: staffHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'cancel', team: d.team, kind, memo }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `처리 실패 (${r.status})`);
    return j;
  }, []);

  const cancelQuiet = useCallback(async (id, kind, memo) => {
    const r = await fetch('/api/staff-board', {
      method: 'POST',
      headers: staffHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'cancelQuiet', id, kind, memo }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `처리 실패 (${r.status})`);
    return j;
  }, []);

  /* 결과물 링크 직접 입력 — 저장 성공분은 로컬 오버레이(resEdits)로 즉시 반영한다.
     보드 전체 reload 는 무겁고, 방금 적은 링크가 안 보이면 저장이 안 된 줄 안다. */
  const [resEdits, setResEdits] = useState({});
  const saveResult = useCallback(async (id, vals) => {
    const r = await fetch('/api/staff-board', {
      method: 'POST',
      headers: staffHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'result', id, ...vals }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `저장 실패 (${r.status})`);
    setResEdits((p) => {
      const cur = { ...(p[id] || {}) };
      for (const k of ['rx', 'rd', 'ry']) {
        const v = String(vals[k] ?? '').trim();
        if (v === '') continue;
        cur[k] = v === '-' ? '' : v;
      }
      return { ...p, [id]: cur };
    });
    return j;
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
      .filter((r) => {
        // 고객사명뿐 아니라 그 달 상세의 인플(참여·대표)로도 찾는다 (Owner 2026-08-24)
        if (!q) return true;
        if (r.n.toLowerCase().includes(q)) return true;
        const cell = r.m[focus];
        return ((cell && cell.d) || []).some((d) =>
          String(d.infl || '').toLowerCase().includes(q)
          || String(d.lead || '').toLowerCase().includes(q));
      })
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
              placeholder="고객사·인플 검색"
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
              <button className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}>이름순</button>
              <button className={sort === 'late' ? 'on' : ''} onClick={() => setSort('late')}>지연순</button>
              <button className={sort === 'pace' ? 'on' : ''} onClick={() => setSort('pace')}>진도순</button>
            </div>
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
                      <div className="stb-name-t">
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
                      </div>
                      <div className="stb-name-b">
                        {/* 협력사명은 초록, 직영(빈값 포함)은 중립 칩 — 늘 표기해 양식을 맞춘다 */}
                        {r.p && r.p !== '직영'
                          ? <span className="stb-chip stb-chip-p">{r.p}</span>
                          : <span className="stb-chip">직영</span>}
                        {cell.add === 1 && <span className="stb-chip stb-chip-add" title="목표량 넘어도 추가 섭외 가능">추가OK</span>}
                        {(cell.chk === 1 || cell.notice) && (
                          <span
                            className="stb-chip stb-chip-chk"
                            title={cell.notice ? `관리자 전달사항:\n${cell.notice}` : '관리자 확인요망'}
                          >🔔{cell.notice ? ' 전달' : ' 확인'}</span>
                        )}
                      </div>
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
                              </div>
                              {/* 뱃지는 숫자줄 밖 — 별도 고정폭 그리드 열. 숫자줄 안에 두면
                                  뱃지 폭 차이가 진도바(1fr)를 먹어 바 길이가 행마다 달라진다
                                  (Owner 2026-08-24) */}
                              <PaceBadge n={n} pc={pc} />
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
                      sel={sel}
                      setSel={setSel}
                      initMgr={recruiter}
                      memoEdits={memoEdits}
                      onSaveMemo={saveMemo}
                      onCancelRow={cancelRow}
                      onCancelQuiet={cancelQuiet}
                      onSaveResult={saveResult}
                      resEdits={resEdits}
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
function Expand({ row, months, el, sel, setSel, initMgr, memoEdits, onSaveMemo, onCancelRow, onCancelQuiet, onSaveResult, resEdits }) {
  return (
    <div className="stb-det" onClick={(e) => e.stopPropagation()}>
      <div className="stb-blks">
        {months.map((m) => {
          const cell = row.m[m];
          if (!cell) return <div key={m} className="stb-blk stb-blk-none"><b>{m}</b><span className="stb-mut">계약 없음</span></div>;
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
                  // 대기·지연은 유형별로 따로 (Owner 2026-08-24 — 합산이면 어느 유형의 지연인지 모른다)
                  const tAgg = aggOf(cell, { type: k, recruiter: '' });
                  return (
                    <React.Fragment key={k}>
                      <div className="stb-blk-ty">
                        <i>{k}</i>
                        <span className="stb-cnum stb-cnum-tg"><i>목</i><b>{n.tg}</b></span>
                        <NumBtn label="섭" value={n.vis} cls={pc} title="섭외(방문)"
                          on={() => setSel({ month: m, type: k, bucket: 'visit' })} active={isSel('visit')} />
                        <NumBtn label="업" value={n.up} cls="" title="업로드 완료"
                          on={() => setSel({ month: m, type: k, bucket: 'upload' })} active={isSel('upload')} />
                        <NumBtn label="취" value={n.cx} cls={n.cx > 0 ? 'orange' : 'mut'} title="취소·노쇼"
                          on={() => setSel({ month: m, type: k, bucket: 'cancel' })} active={isSel('cancel')} />
                        <PaceBadge n={n} pc={pc} short />
                      </div>
                      <div className="stb-blk-f stb-blk-f-ty">
                        <NumBtn label="대기" value={tAgg.pend} cls={tAgg.pend > 0 ? 'warn' : 'mut'} title={`${k} 제출대기`}
                          on={() => setSel({ month: m, type: k, bucket: 'pend' })} active={isSel('pend')} />
                        <NumBtn label="지연" value={tAgg.late} cls={tAgg.late > 0 ? 'bad' : 'mut'} title={`${k} 마감 넘긴 미제출`}
                          on={() => setSel({ month: m, type: k, bucket: 'late' })} active={isSel('late')} />
                        <button
                          type="button"
                          className={`stb-cnum stb-all ${active && sel?.type === k && !sel?.bucket ? 'sel' : ''}`}
                          onClick={() => setSel({ month: m, type: k, bucket: null })}
                        >{k} 목록</button>
                      </div>
                    </React.Fragment>
                  );
                })}
              {/* 기자단 — 가끔 있으니 목표·실적·예약 중 하나라도 있을 때만 건수 한 줄
                  (대기·지연 개념 없음). 누르면 기자 목록 (Owner 2026-08-24) */}
              {(cell.t?.기자?.[0] > 0 || cell.t?.기자?.[1] > 0
                || (cell.d || []).some((x) => typeOf(x) === '기자')) && (
                <button
                  type="button"
                  className={`stb-blk-press ${active && sel?.type === '기자' ? 'sel' : ''}`}
                  onClick={() => setSel({ month: m, type: '기자', bucket: null })}
                >기자단 <b>{cell.t?.기자?.[1] || 0}</b>건{cell.t?.기자?.[0] > 0 ? ` / 목표 ${cell.t.기자[0]}` : ''} · 목록</button>
              )}
            </div>
          );
        })}
      </div>

      {sel && row.m[sel.month] && (
        <DetailList
          cell={row.m[sel.month]}
          onCancelRow={onCancelRow}
          onCancelQuiet={onCancelQuiet}
          onSaveResult={onSaveResult}
          resEdits={resEdits}
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

function DetailList({ cell, sel, initMgr, memoEdits, onSaveMemo, onCancelRow, onCancelQuiet, onSaveResult, resEdits, onClose }) {
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
                <th className="stb-th-cnt">인원<br />건수</th><th>제출링크</th><th className="stb-th-memo">메모</th>
                <th>전달</th><th className="stb-th-dl">기한</th><th className="stb-th-cx">처리</th>
              </tr>
            </thead>
            <tbody>
              {ds.map((d) => (
                <DetailRow
                  key={d.id}
                  d={d}
                  memoVal={memoEdits[d.id] !== undefined ? memoEdits[d.id] : d.memo}
                  onSaveMemo={onSaveMemo}
                  onCancelRow={onCancelRow}
                  onCancelQuiet={onCancelQuiet}
                  onSaveResult={onSaveResult}
                  resOv={resEdits[d.id]}
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
  // 없는 종류도 같은 폭의 공란을 차지한다 — 있는 것만 나오면 따종만 있는 행에서
  // 따종이 맨 앞으로 당겨져 종류별 세로 열이 어긋난다 (Owner 2026-08-24)
  if (!url) return <span className="stb-lnk stb-lnk-empty" aria-hidden="true">{label}</span>;
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

/* 상태를 의미 단위 두 줄로 — 좁은 열에서 '변경확
정' 처럼 꺾이는 것을 막는다 (Owner 2026-08-24).
   '취소_방문자'류는 '_' 에서, 4글자는 2+2 로 나눈다. 그 외(노쇼 등)는 한 줄. */
function StTwoLine({ st }) {
  const s = String(st || '');
  if (!s) return '—';
  if (s.includes('_')) {
    const [a, ...rest] = s.split('_');
    return <>{a}<br />{rest.join('_')}</>;
  }
  if (s.length === 4) return <>{s.slice(0, 2)}<br />{s.slice(2)}</>;
  return s;
}

function DetailRow({ d, memoVal, onSaveMemo, onCancelRow, onCancelQuiet, onSaveResult, resOv }) {
  const submitted = d.sub.includes('제출완료') || d.sub.includes('✅');
  const odue = overdueHours(d);
  let dlNode = <span className="stb-mut">—</span>;
  if (d.dl !== null && !submitted) {
    if (d.dl < 0) dlNode = <span className="bad">D+{-d.dl}</span>;
    else if (d.dl <= 2) dlNode = <span className="warn">D-{d.dl}</span>;
    else dlNode = <span className="stb-mut">D-{d.dl}</span>;
  }
  // 방금 저장한 링크(resOv)가 서버 값보다 우선 — 저장 즉시 화면에 보이게
  const rx = resOv && resOv.rx !== undefined ? resOv.rx : d.rx;
  const rd = resOv && resOv.rd !== undefined ? resOv.rd : d.rd;
  const ry = resOv && resOv.ry !== undefined ? resOv.ry : d.ry;
  const [resOpen, setResOpen] = useState(false);
  return (
    <tr className={d.dl !== null && d.dl < 0 && !submitted ? 'stb-tr-late' : ''}>
      <td className="stb-td-nw">{d.mgr || '—'}</td>
      <td className="stb-td-nw">{d.ty || '—'}</td>
      <td className="stb-td-st"><StTwoLine st={d.st} /></td>
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
        <span className="stb-lnks">
          <ResultLink label="小红" url={rx} />
          <ResultLink label="大众" url={rd} />
          <ResultLink label="抖音" url={ry} />
        </span>
        {/* 전달링크로 안 오고 담당자가 받아 적는 경우 — 직접 입력 (Owner 2026-08-24) */}
        <button type="button" className="stb-res-edit" title="결과물 링크 직접 입력"
          onClick={(e) => { e.stopPropagation(); setResOpen(true); }}>✏️</button>
        {resOpen && (
          <ResultModal d={d} rx={rx} rd={rd} ry={ry}
            onSave={onSaveResult} onClose={() => setResOpen(false)} />
        )}
      </td>
      <td className="stb-td-memo">
        <MemoCell value={memoVal} onSave={(t) => onSaveMemo(d.id, t)} />
      </td>
      <td className="stb-td-give">
        <CopyBtn label="🔗 링크" text={d.give} title="인플 전달용 제출 링크 복사" />
        <CopyBtn label="📋 가이드" text={d.guide} title="촬영 가이드 복사" />
      </td>
      <td className="stb-td-dl">{dlNode}</td>
      <td className="stb-td-cx"><CancelCell d={d} onCancelRow={onCancelRow} onCancelQuiet={onCancelQuiet} /></td>
    </tr>
  );
}

/* 취소·노쇼 버튼 — 이미 취소·노쇼면 상태만 보여 준다.
   누르면 사유를 받고, 서버가 예약입력_DB(팀)를 찾아 봇 발송 경로로 넘긴다. */
const CANCEL_OPTS = [
  { kind: '취소_방문자', label: '방문취소', full: '방문자 사정 취소', cls: 'v' },
  { kind: '취소_고객사', label: '고객취소', full: '고객사(매장) 사정 취소', cls: 'c' },
  { kind: '노쇼', label: '노쇼', full: '노쇼', cls: 'n' },
];

function CancelCell({ d, onCancelRow, onCancelQuiet }) {
  const [modal, setModal] = useState(null);   // CANCEL_OPTS 항목
  const [done, setDone] = useState('');
  const st = String(d.st || '');
  if (done) return <span className="stb-cx-done">✅ {done}</span>;
  if (st.includes('취소') || st.includes('노쇼')) return <span className="stb-mut">{st}</span>;

  return (
    <span className="stb-cx">
      {CANCEL_OPTS.map((o) => (
        <button
          key={o.kind}
          type="button"
          className={`stb-cx-b stb-cx-${o.cls}`}
          title={`${o.full} 처리`}
          onClick={(e) => { e.stopPropagation(); setModal(o); }}
        >{o.label}</button>
      ))}
      {modal && (
        <BoardCancelModal
          d={d} opt={modal}
          onCancelRow={onCancelRow} onCancelQuiet={onCancelQuiet}
          onDone={(label) => { setDone(label); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
    </span>
  );
}

/* 취소·노쇼 모달 — 핵심은 '매장에 안내 발송' 체크박스 (Owner 2026-08-24).
   ON  = 팀(예약입력_DB) 상태 변경 + 예약봇이 매장에 취소 안내 발송 (팀 단위!)
   OFF = 이 인플의 진행_DB 레코드만 조용히 상태 변경 — Softr 시절 방식.
         시간이 지난 건 정리용. 매장은 아무 카톡도 받지 않는다. */
function BoardCancelModal({ d, opt, onCancelRow, onCancelQuiet, onDone, onClose }) {
  const [notify, setNotify] = useState(true);
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      if (notify) await onCancelRow(d, opt.kind, memo);
      else await onCancelQuiet(d.id, opt.kind, memo);
      onDone(opt.label + (notify ? '' : '(내부)'));
    } catch (e) {
      window.alert(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="stb-cxm-ov" onClick={onClose} role="presentation">
      <div className="stb-cxm" onClick={(e) => e.stopPropagation()} role="presentation">
        <h4>{opt.full} — {d.lead || d.infl || '이 예약'}</h4>
        <label className="stb-cxm-chk">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          매장에 취소 안내 발송 (예약봇)
        </label>
        <p className="stb-cxm-sub">
          {notify
            ? '⚠ 팀 단위로 처리됩니다 — 같은 예약의 다른 인플도 함께 취소되고, 예약봇이 매장 카톡방에 안내를 보냅니다.'
            : '이 인플 건만 내부 상태를 바꿉니다. 매장에는 아무것도 보내지 않습니다 (지난 건 정리용).'}
        </p>
        <textarea
          rows={2}
          placeholder={notify ? '매장에 전달할 사유 (선택)' : '내부 기록용 사유 (선택 — 비고에 남습니다)'}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        <div className="stb-cxm-btns">
          <button type="button" className={`stb-cx-b stb-cx-${opt.cls} stb-cxm-go`} disabled={busy} onClick={run}>
            {busy ? '처리 중…' : `${opt.label} 처리`}
          </button>
          <button type="button" className="stb-ghost" disabled={busy} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

/* 결과물 링크 직접 입력 모달 — 빈 칸은 안 건드리고, '-' 는 지운다 */
function ResultModal({ d, rx, rd, ry, onSave, onClose }) {
  const [vx, setVx] = useState(rx || '');
  const [vd, setVd] = useState(rd || '');
  const [vy, setVy] = useState(ry || '');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      // 원래 값과 같은 칸은 보내지 않는다 — 안 바꾼 칸을 다시 쓰지 않게
      const vals = {};
      if (vx.trim() !== String(rx || '')) vals.rx = vx.trim() || '-';
      if (vd.trim() !== String(rd || '')) vals.rd = vd.trim() || '-';
      if (vy.trim() !== String(ry || '')) vals.ry = vy.trim() || '-';
      if (!Object.keys(vals).length) { onClose(); return; }
      await onSave(d.id, vals);
      onClose();
    } catch (e) {
      window.alert(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="stb-cxm-ov" onClick={onClose} role="presentation">
      <div className="stb-cxm" onClick={(e) => e.stopPropagation()} role="presentation">
        <h4>결과물 링크 입력 — {d.infl || d.lead || ''}</h4>
        <p className="stb-cxm-sub">빈 칸으로 저장하면 그 칸은 지워집니다. 저장하면 제출상태가 자동 갱신됩니다.</p>
        <label className="stb-cxm-lb">小红 (샤오홍슈)</label>
        <input value={vx} onChange={(e) => setVx(e.target.value)} placeholder="https://…" />
        <label className="stb-cxm-lb">大众 (따종디엔핑)</label>
        <input value={vd} onChange={(e) => setVd(e.target.value)} placeholder="https://…" />
        <label className="stb-cxm-lb">抖音 (더우인)</label>
        <input value={vy} onChange={(e) => setVy(e.target.value)} placeholder="https://…" />
        <div className="stb-cxm-btns">
          <button type="button" className="stb-cx-b stb-cxm-go" disabled={busy} onClick={run}>
            {busy ? '저장 중…' : '저장'}
          </button>
          <button type="button" className="stb-ghost" disabled={busy} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
