import React, { useState, useEffect, useCallback, useMemo, useRef, memo, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffHeaders } from '../lib/staffKey';
import DateTime30 from '../components/DateTime30';
import './StaffQueuePage.css';

/**
 * 업무·발송 큐 (/staff/queue) — Softr ②업무조회 액션 + ⑥예약 발송 + ⑦변경 발송 통합.
 *
 * 대상 = 예약입력_DB (팀 단위). 버튼 명세는 예약봇 V7 README 그대로:
 *   전송 = 자동발송체크 ON → 봇이 폴링해 카톡 발송 + 진행_DB_OLD 캐스케이드.
 *   취소·노쇼는 이 경로 하나로 통일 (F1). 삭제는 예약요청·미발송만 (F3).
 */

const RECRUITERS = ['HH', 'LH', 'AN', 'FB'];
const SENDABLE = ['예약요청', '긴급예약'];
const CANCELLED = ['취소_방문자', '취소_고객사', '노쇼'];

/* 분류 기준 = 상태가 아니라 **지금 누구 차례인가** (Owner 협의 2026-08-05).
   내 차례: 미체크 & 사람 액션 필요 (전송 안 누른 예약 + 봇이 차단·회수한 변경요청) — 실수① "까먹음"
   봇 대기: 자동발송체크 켜진 전부 (예약·변경·취소·노쇼 무관) — 실수② "봇 에러를 모름" */
const TABS = [
  { key: 'todo', label: '📤 발송대기' },
  { key: 'bot', label: '🤖 봇 대기' },
  { key: 'ok', label: '✅ 확정·진행' },
  { key: 'cancel', label: '🚫 취소·노쇼' },
  { key: 'all', label: '전체' },
];

/* 건수 라벨 — 기본 플랫폼(샤오홍슈/따종)은 기존 표기(小/大), 다른 플랫폼이면 이름 축약 */
function platTag(plat, dflt) {
  if (!plat || plat === '샤오홍슈' || plat === '따종디엔핑') return dflt;
  return ({ 인스타그램: '인스타', 틱톡: '틱톡', 유튜브: '유튜브' }[plat] || plat);
}

/* ── 인플별 결과 링크 표시 (2026-09-29, Owner 설계) ─────────────────────
   목록은 팀 단위지만 결과 링크는 인플별 건에 있다 → 아이디마다 아래에 3칸 블록:
   1칸 샤오홍슈(XHS_Result) · 2칸 따종(DP_Result) · 3칸 틱톡/더우인(DY_Result).
   블록을 누르면 행 아래에 그 팀 인플 전원의 입력칸이 펼쳐진다.
   아이디 자체는 누르게 하지 않는다 — 담당자가 아이디를 복사해 위챗·샤오홍슈에서 찾기 때문. */
const RES_KEYS = ['x', 'd', 'y'];
const RES_API = { x: 'rx', d: 'rd', y: 'ry' };
const RES_NAME = { x: '샤오홍슈', d: '따종', y: '틱톡' };

/** 블록 칸 글자 — 기본은 小·大·抖, 계약 플랫폼이 바뀌었으면 첫 글자(인·틱·유) */
function dotLabel(k, it) {
  if (k === 'y') return '抖';
  const plat = k === 'x' ? it.platX : it.platD;
  if (!plat || plat === '샤오홍슈' || plat === '따종디엔핑') return k === 'x' ? '小' : '大';
  return ({ 인스타그램: '인', 틱톡: '틱', 유튜브: '유' }[plat] || plat.slice(0, 1));
}

/** 칸 상태 — done 업로드 · need 방문 지났는데 비어 있음 · wait 방문 전 · na 해당 없음 · off 취소·노쇼 */
function dotState(m, k, it) {
  if (CANCELLED.includes(m.st)) return 'off';
  if (m[k]) return 'done';
  const need = k === 'x' ? (m.nx || Number(it.nx) || 0) > 0
    : k === 'd' ? (m.nd || Number(it.nd) || 0) > 0
      : false;   // 틱톡(더우인)은 건수 필드가 없다 — 들어오면 초록, 아니면 해당 없음
  if (!need) return 'na';
  const t = Date.parse(it.whenRaw || '');
  return Number.isFinite(t) && t > Date.now() ? 'wait' : 'need';
}
const DOT_WORD = { done: '업로드됨', need: '미업로드', wait: '방문 전', na: '해당 없음', off: '취소·노쇼' };

// 서버(api/_press.js extractLinks)와 같은 규칙 — 붙여넣은 공유 문구에서 URL 만
const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%]+/g;
function urlsIn(text) {
  const out = [];
  for (const m of String(text || '').replace(/\s/g, ' ').matchAll(URL_RE)) {
    m[0].split(/(?=https?:\/\/)/).forEach((u) => { const c = u.replace(/[.,;:!?*]+$/, ''); if (c.length > 10) out.push(c); });
  }
  return out;
}
/** 도메인으로 본 칸 — 서버 _result-links.js platformOf 와 같은 판정 */
function resKeyOf(url) {
  let h = '';
  try { h = new URL(url).hostname.toLowerCase(); } catch { return ''; }
  if (/(^|\.)xhslink\.(cn|com)$/.test(h) || /(^|\.)xiaohongshu\.com$/.test(h)) return 'x';
  if (/(^|\.)dpurl\.cn$/.test(h) || /(^|\.)dianping\.com$/.test(h) || /(^|\.)meituan\.com$/.test(h)) return 'd';
  if (/(^|\.)douyin\.com$/.test(h) || /(^|\.)iesdouyin\.com$/.test(h)) return 'y';
  return '';
}

function tabOf(it) {
  if (it.sent) return 'bot';                                       // 체크됨 = 봇 차례
  if (SENDABLE.includes(it.st) || it.st === '변경요청') return 'todo'; // 사람 차례
  if (CANCELLED.includes(it.st)) return 'cancel';
  return 'ok';   // 예약확정·변경확정·촬영완료·업로드완료·송부완료 등 진행 계열
}

function stClass(st) {
  if (SENDABLE.includes(st)) return 'req';
  if (st === '예약확정') return 'ok';
  if (st === '변경요청') return 'warn';
  if (CANCELLED.includes(st)) return 'bad';
  return 'etc';
}

/** ISO(UTC) → datetime-local 값(KST 벽시계) — 수정 모달 프리필용 */
function isoToLocal(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return new Date(t.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16);
}

/* ── 새로고침·렌더 부하 줄이기 (2026-09-29) ─────────────────────────────
   실측: 60초마다 전체(708건·8회 호출·553KB)를 받아 목록을 지웠다 다시 그렸다 → 화면 멈춤 332~430ms,
   보이는 탭 하나가 시간당 Airtable 480회. → 60초는 '바뀐 것만'(보통 0건·1회), 15분마다 전체.
   화면엔 150건씩만 그리고, 바뀌지 않은 행은 같은 객체를 유지해 다시 그리지 않는다. */
const FULL_EVERY = 15 * 60 * 1000;   // 전체 새로고침 주기 — 삭제·다른 테이블 값 변경은 변경분으로 안 잡혀 이걸로 맞춘다
const OVERLAP = 2 * 60 * 1000;       // 변경분 조회를 2분 겹쳐 묻는다 — 조회 사이 틈 방지
const PAGE = 150;                    // 한 번에 그리는 행 수
const NO_KIDS = [];
const nospace = (v) => String(v || '').replace(/\s/g, '');

/** 전체 조회 결과를 받되, 내용이 같은 건은 이전 객체를 그대로 — 그 행은 다시 그리지 않는다 */
function keepSame(prev, next) {
  if (!prev?.items) return next;
  const old = new Map(prev.items.map((x) => [x.id, x]));
  const items = (next.items || []).map((x) => {
    const o = old.get(x.id);
    return o && JSON.stringify(o) === JSON.stringify(x) ? o : x;
  });
  return { ...next, items };
}

/** 변경분을 합친다 — 목록 범위를 벗어난 건(inWindow=false)은 뺀다. 아무것도 안 바뀌면 prev 그대로(재렌더 없음) */
function mergeDelta(prev, delta) {
  if (!prev?.items) return prev;
  const map = new Map(prev.items.map((x) => [x.id, x]));
  let changed = false;
  delta.forEach(({ inWindow, ...it }) => {
    const o = map.get(it.id);
    if (!inWindow) { if (o) { map.delete(it.id); changed = true; } return; }
    if (o && JSON.stringify(o) === JSON.stringify(it)) return;
    map.set(it.id, it);
    changed = true;
  });
  if (!changed) return prev;
  const items = [...map.values()].sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return { ...prev, items };
}

/** 행 하나에 쓸 버튼 동작 — actions(한 번만 만든 것)에 이 행을 묶는다 */
function bindActions(actions, it) {
  const h = {};
  Object.keys(actions).forEach((k) => { h[k] = () => actions[k](it); });
  return h;
}

/** 팀 → 인플별 건. 팀키만으로는 같은 매장·날·대표인플인 다른 팀과 겹친다(3.4% 실측) → 인플 ID 로 가른다 */
function pickMembers(it, arr) {
  if (!arr || !arr.length) return null;
  const ids = it.inflIds || [];
  const mine = arr.filter((k) => ids.includes(k.infl));
  const list = mine.length ? mine : arr;
  return [...list].sort((a, b) => ids.indexOf(a.infl) - ids.indexOf(b.infl));
}
export default function StaffQueuePage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');   // 기본 = 전체 리스트 (Owner 2026-08-24 확정)
  const [mgr, setMgr] = useState('');
  const [search, setSearch] = useState('');
  const [search2, setSearch2] = useState('');   // 2차 조건 — 1차와 AND (Owner 2026-08-21: 인플+매장 동시 필터)
  const [busyId, setBusyId] = useState('');
  const [modal, setModal] = useState(null);   // {kind:'modify'|'cancel', item}
  const [toast, setToast] = useState('');
  const [refreshing, setRefreshing] = useState(false);   // 뒤에서 갱신 중 — 목록은 그대로 둔다
  const [updatedAt, setUpdatedAt] = useState('');        // 마지막으로 서버와 맞춘 시각(표시용)
  const lastAt = useRef('');    // 서버 기준 마지막 조회 시각(ISO) — 변경분 조회의 기준
  const lastFull = useRef(0);   // 마지막 전체 조회(브라우저 시각)

  /* 전체 조회 — 처음·⟳·15분마다. ⚠️ 목록을 지우지 않는다(2026-09-29): 예전엔 60초마다 목록 708행을
     '불러오는 중…'으로 지웠다가 다시 그려 화면이 멈추고, 펼쳐 둔 결과 입력칸·쓰던 링크가 날아갔다.
     바뀌지 않은 건은 이전 객체를 그대로 둬서(keepSame) 그 행은 다시 그리지 않는다. */
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/staff-queue', { headers: staffHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `서버 오류 (${res.status})`);
      setData((prev) => keepSame(prev, body));
      lastAt.current = body.at || '';
      lastFull.current = Date.now();
      setUpdatedAt(new Date().toTimeString().slice(0, 5));
      setError('');
    } catch (e) {
      setError(e.message || '불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /* 변경분 조회 — 60초마다. '그 뒤로 바뀐 것만' 1회 호출(보통 0건). 15분 지났거나 기준 시각이 없으면 전체로.
     조회 사이 틈은 2분 겹쳐 묻는다(같은 건이 또 와도 내용이 같으면 무시). 실패해도 목록은 그대로 두고 다음 회차에 다시. */
  const refresh = useCallback(async () => {
    if (!lastAt.current || Date.now() - lastFull.current > FULL_EVERY) { await load(); return; }
    setRefreshing(true);
    try {
      const since = new Date(Date.parse(lastAt.current) - OVERLAP).toISOString();
      const res = await fetch(`/api/staff-queue?since=${encodeURIComponent(since)}`, { headers: staffHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `서버 오류 (${res.status})`);
      lastAt.current = body.at || lastAt.current;
      if ((body.items || []).length) setData((prev) => mergeDelta(prev, body.items));
      setUpdatedAt(new Date().toTimeString().slice(0, 5));
      setError('');
    } catch (e) {
      setError(`자동 새로고침 실패 — 목록은 마지막 상태입니다 (${e.message || '연결 오류'})`);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => { load(); }, [load]);

  /* 인플별 결과 링크 현황 — 인플별 건(진행_DB_OLD) 3개월치라 호출이 무겁다(≈15회).
     그래서 처음 열 때·⟳·저장 후에만 부른다. 아래 60초 자동 새로고침에는 태우지 않는다. */
  const [kids, setKids] = useState(null);   // { 팀키(공백 제거): [인플별 건] } | null(불러오는 중·실패)
  const loadResults = useCallback(async (fresh) => {
    try {
      const res = await fetch(`/api/staff-queue?mode=results${fresh ? '&fresh=1' : ''}`, { headers: staffHeaders() });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setKids(body.kids || {});
    } catch { /* 실패하면 아이디만 글자로 보인다 — 발송 업무는 막지 않는다 */ }
  }, []);
  useEffect(() => { loadResults(false); }, [loadResults]);


  /** 결과 링크 저장 — 중복이면 서버가 409 로 멈춘다. 확인받고 force 로 다시 보낸다 */
  const saveResult = useCallback(async (childId, vals) => {
    const post = (extra) => fetch('/api/staff-queue', {
      method: 'POST',
      headers: staffHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'result', id: childId, ...vals, ...extra }),
    });
    let r = await post();
    let j = await r.json().catch(() => ({}));
    if (r.status === 409 && j.dup && window.confirm(`${j.error}

그래도 저장할까요?`)) {
      r = await post({ force: true });
      j = await r.json().catch(() => ({}));
    }
    if (!r.ok) throw new Error(j.error || `저장 실패 (${r.status})`);
    // 방금 쓴 값을 바로 반영 — 전체를 다시 읽지 않는다(무겁다)
    setKids((prev) => {
      if (!prev) return prev;
      for (const [key, arr] of Object.entries(prev)) {
        const i = arr.findIndex((m) => m.id === childId);
        if (i < 0) continue;
        const upd = { ...arr[i] };
        RES_KEYS.forEach((k) => { if (j.values && j.values[RES_API[k]] !== undefined) upd[k] = j.values[RES_API[k]]; });
        const na = arr.slice();
        na[i] = upd;
        return { ...prev, [key]: na };   // 이 팀 배열만 새 것 — 나머지 행은 그대로(다시 안 그림)
      }
      return prev;
    });
    return j;
  }, []);

  // 60초 자동 새로고침 — 봇 대기가 안 빠지는 걸(봇 에러) 사람이 바로 보게.
  // 탭이 백그라운드면 쉰다.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60000);
    return () => clearInterval(t);
  }, [refresh]);

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  const act = useCallback(async (payload, doneMsg) => {
    setBusyId(payload.id);
    try {
      const res = await fetch('/api/staff-queue', {
        method: 'POST',
        headers: staffHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `처리 실패 (${res.status})`);
      flash(doneMsg);
      setModal(null);
      if (payload.action === 'remove') {
        setData((prev) => (prev ? { ...prev, items: prev.items.filter((x) => x.id !== payload.id) } : prev));
      }
      await refresh();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusyId('');
    }
  }, [refresh]);

  const counts = useMemo(() => {
    const c = { todo: 0, bot: 0, ok: 0, cancel: 0, all: 0 };
    (data?.items || []).forEach((it) => {
      if (mgr && it.mgr !== mgr) return;
      c[tabOf(it)] += 1;
      c.all += 1;
    });
    return c;
  }, [data, mgr]);

  /* 기본 화면은 '전체 리스트'다 (Owner 2026-08-24). Softr 처럼 목록을 먼저 보고
     거기서 일을 찾는 흐름이 담당자에게 익숙하다는 판단.
     대신 발송대기(=지금 내 차례)가 남아 있으면 탭을 빨갛게 띄워 '까먹음'을 막는다 —
     그 안전장치가 이 화면의 존재 이유라서 숫자만 조용히 두지 않는다. */

  const dSearch = useDeferredValue(search);
  const dSearch2 = useDeferredValue(search2);
  const items = useMemo(() => {
    // 조건 두 개를 AND 로 건다 — '인플 + 매장' 같은 교차 필터가 필요하다(Owner 2026-08-21).
    // 각 조건은 매장·인플·예약ID 어디에 걸려도 통과시킨다(어느 칸에 뭘 넣을지 고민 안 하게).
    const hit = (it, q) => !q
      || it.store.toLowerCase().includes(q)
      || it.infls.toLowerCase().includes(q)
      || it.sid.toLowerCase().includes(q);
    const q1 = dSearch.trim().toLowerCase();
    const q2 = dSearch2.trim().toLowerCase();
    return (data?.items || [])
      .filter((it) => !mgr || it.mgr === mgr)
      .filter((it) => tab === 'all' || tabOf(it) === tab)
      .filter((it) => hit(it, q1) && hit(it, q2));
  }, [data, tab, mgr, dSearch, dSearch2]);

  /* 화면에는 150건씩만 그린다 — 데이터는 전부 있어서 검색·탭은 전체에서 찾는다(날짜로 자르지 않는 이유:
     결과 링크는 방문 2~6주 뒤 들어오는 게 많아 오래된 건도 찾아야 한다). 조건이 바뀌면 150으로 돌아간다. */
  const viewKey = `${tab}|${mgr}|${dSearch}|${dSearch2}`;
  const [lim, setLim] = useState({ key: '', n: PAGE });
  const limit = lim.key === viewKey ? lim.n : PAGE;
  const shown = items.slice(0, limit);

  /* 카드·행이 같은 액션을 쓴다 — 한 번만 만든다(매 렌더 새 함수면 행 memo 가 무력해져 전 행을 다시 그린다) */
  const actions = useMemo(() => ({
      // 예약 복사 — 팀 구성(매장·인플·담당·유형·인원·건수)을 신규입력 폼으로 가져간다.
      // 일시는 비워서 새로 찍게 한다. 같은 매장·날짜·인플 재접수는 서버 중복 가드가 잡는다.
      copy: (it) => {
        try {
          sessionStorage.setItem('tk_resv_copy', JSON.stringify({
            storeId: it.storeId, mgr: it.mgr, ty: it.ty,
            pax: it.pax, nx: it.nx, nd: it.nd,
            platX: it.platX || '', platD: it.platD || '',
            inflIds: it.inflIds, leadId: it.leadId,
            paxMemo: it.paxMemo, from: it.sid || it.store,
          }));
        } catch { /* 저장 실패 시 빈 폼으로 열린다 */ }
        navigate('/staff/new?copy=1');
      },
      send: (it) => {
        if (window.confirm(`[${it.store}] 예약 메시지를 발송할까요?\n예약봇이 다음 폴링에서 카톡을 보냅니다.`)) {
          act({ action: 'send', id: it.id }, '발송 대기열에 올렸습니다');
        }
      },
      edit: (it) => setModal({ kind: 'edit', item: it }),
      modify: (it) => setModal({ kind: 'modify', item: it }),
      cancel: (it) => setModal({ kind: 'cancel', item: it }),
      confirmChange: (it) => {
        // 참고: 봇은 변경 안내를 발송하면 자동으로 변경확정까지 처리한다(V6.3).
        // 이 버튼은 "안내 발송 없이" 확정만 할 때 쓴다.
        if (window.confirm(
          `[${it.store}] 변경 안내 발송 없이 확정 처리할까요?\n`
          + `예약일시는 원본 유지, 변경일시가 변경 후 시각으로 보관됩니다.`
        )) {
          act({ action: 'confirmChange', id: it.id }, '변경확정 처리했습니다 (발송 없음)');
        }
      },
      remove: (it) => {
        if (window.confirm(`[${it.store}] 이 예약을 삭제할까요?\n발송된 적 없는 예약요청 건만 삭제되며, 분할된 진행 건도 함께 지워집니다.`)) {
          act({ action: 'remove', id: it.id }, '삭제했습니다');
        }
      },
      unsend: (it) => {
        if (window.confirm(
          `[${it.store}] 발송 대기를 취소하고 되돌릴까요?\n\n`
          + `⚠️ 봇이 방금 집어간 직후라면 취소가 무시되고 발송될 수 있습니다.\n`
          + `취소 후 이 건이 '확정·진행'으로 넘어가는지 잠시 확인하세요.`
        )) {
          act({ action: 'unsend', id: it.id }, '발송 대기에서 내렸습니다 — 확정·진행 탭으로 넘어가지 않는지 확인하세요');
        }
      },
  }), [navigate, act]);

  return (
    <div className="stq-root">
      <div className="stq-wrap">
        <header className="stq-head">
          <div className="stq-title">
            <span className="stq-dot" />
            <h1>예약발송</h1>
            <span className="stq-scope">예약입력_DB → 예약봇</span>
            {data?.who && <span className="stq-who">{data.who}</span>}
          </div>
          <div className="stq-nav">
            <span className="stq-upd">{refreshing ? '갱신 중…' : updatedAt ? `${updatedAt} 갱신` : ''}</span>
            <button className="stq-ghost" onClick={() => { load(); loadResults(true); }} title="전체 새로고침 (결과 링크 현황 포함)">⟳</button>
          </div>
        </header>

        <div className="stq-tools">
          <div className="stq-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`${tab === t.key ? 'on' : ''}${t.key === 'todo' && counts.todo > 0 ? ' urgent' : ''}`}
                onClick={() => setTab(t.key)}
                title={t.key === 'todo' && counts.todo > 0 ? '아직 발송하지 않은 건이 있습니다' : undefined}
              >{t.label} <b>{counts[t.key]}</b></button>
            ))}
          </div>
          <div className="stq-seg">
            {['', ...RECRUITERS].map((r) => (
              <button key={r || '전체'} className={mgr === r ? 'on' : ''} onClick={() => setMgr(r)}>
                {r || '담당 전체'}
              </button>
            ))}
          </div>
          <div className="stq-finds">
            <input
              className="stq-search"
              placeholder="매장·인플·# 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="stq-and">＋</span>
            <input
              className="stq-search"
              placeholder="2차 조건 (예: 인플 아이디)"
              value={search2}
              onChange={(e) => setSearch2(e.target.value)}
            />
            {(search || search2) && (
              <button type="button" className="stq-ghost stq-clear"
                onClick={() => { setSearch(''); setSearch2(''); }} title="검색 초기화">✕</button>
            )}
          </div>
        </div>

        {error && <div className="stq-error">{error}<button onClick={load}>다시 시도</button></div>}
        {loading && !data && <div className="stq-loading">불러오는 중…</div>}
        {data && items.length === 0 && (
          <div className="stq-empty">이 탭에 해당하는 건이 없습니다.</div>
        )}

        {data && items.length > 0 && (
          // 내 차례·봇 대기 = 발송문 중심 카드 / 확정·진행·취소·전체 = 컴팩트 행
          (tab === 'ok' || tab === 'cancel' || tab === 'all')
            ? (
              <>
                <div className="stq-legend">
                  <span><i className="stq-d done">小</i>샤오홍슈</span>
                  <span><i className="stq-d done">大</i>따종</span>
                  <span><i className="stq-d done">抖</i>틱톡</span>
                  <span className="stq-legend-sep">—</span>
                  <span><i className="stq-d done" />업로드</span>
                  <span><i className="stq-d need" />방문 후 미업로드</span>
                  <span><i className="stq-d wait" />방문 전</span>
                  <span><i className="stq-d na" />해당 없음</span>
                  <span className="stq-legend-hint">아이디 아래 블록을 누르면 링크 입력</span>
                  {!kids && <span className="stq-legend-hint">· 결과 현황 불러오는 중…</span>}
                </div>
                <div className="stq-rows">
                  {shown.map((it) => (
                    <ListRow key={it.id} it={it} busy={busyId === it.id} actions={actions}
                      kidsArr={kids ? (kids[nospace(it.team)] || NO_KIDS) : null} onSaveResult={saveResult} />
                  ))}
                </div>
                {items.length > shown.length && (
                  <button type="button" className="stq-more" onClick={() => setLim({ key: viewKey, n: limit + PAGE })}>
                    더 보기 <b>+{Math.min(PAGE, items.length - shown.length)}</b>
                    <span>{items.length.toLocaleString()}건 중 {shown.length.toLocaleString()}건 표시</span>
                  </button>
                )}
              </>
            )
            : (
              <div className="stq-grid">
                {shown.map((it) => (
                  <QueueCard key={it.id} it={it} busy={busyId === it.id} actions={actions} />
                ))}
              </div>
            )
        )}

        <footer className="stq-foot">
          📤 발송대기 = 사람이 눌러야 할 것 (미발송 예약 + 차단·회수된 변경요청) ·
          🤖 봇 대기 = 자동발송체크 켜진 전부, 오래 머물면 예약봇 확인 ·
          취소·노쇼 안내도 발송 전엔 봇 대기에 보임 · 60초마다 바뀐 것만 새로고침(15분마다 전체) · 150건씩 표시, 검색은 전체에서 ·
          삭제 = 발송 전 예약요청만
        </footer>
      </div>

      {modal?.kind === 'edit' && (
        <EditModal
          item={modal.item}
          busy={busyId === modal.item.id}
          onClose={() => setModal(null)}
          onSubmit={(v) => act({ action: 'edit', id: modal.item.id, ...v }, '수정했습니다 (분할된 진행 건도 동기화)')}
        />
      )}
      {modal?.kind === 'modify' && (
        <ModifyModal
          item={modal.item}
          busy={busyId === modal.item.id}
          onClose={() => setModal(null)}
          onSubmit={(v) => act({ action: 'modify', id: modal.item.id, ...v }, '변경요청을 발송 대기열에 올렸습니다')}
        />
      )}
      {modal?.kind === 'cancel' && (
        <CancelModal
          item={modal.item}
          busy={busyId === modal.item.id}
          onClose={() => setModal(null)}
          onSubmit={(v) => act({ action: 'cancel', id: modal.item.id, ...v }, '취소 안내를 발송 대기열에 올렸습니다')}
        />
      )}

      {toast && <div className="stq-toast">{toast}</div>}
    </div>
  );
}

function msgOf(it) {
  // 변경·취소·노쇼는 변경메시지 우선 (봇과 같은 규칙), 차단 경고문이면 예약메시지 폴백
  return ((it.st === '변경요청' || CANCELLED.includes(it.st))
    && it.chgMsg && !it.chgMsg.includes('변경일시가 입력되지'))
    ? it.chgMsg : it.msg;
}

const QueueCard = memo(function QueueCard({ it, busy, actions }) {
  const h = useMemo(() => bindActions(actions, it), [actions, it]);
  const [openMsg, setOpenMsg] = useState(false);
  const t = tabOf(it);
  const msg = msgOf(it);
  return (
    <div className={`stq-card ${busy ? 'busy' : ''} ${t === 'bot' ? 'stuck' : ''}`}>
      <div className="stq-card-h">
        <b>{it.store || '—'}</b>
        <span className={`stq-st ${stClass(it.st)}`}>{it.st}</span>
      </div>
      <div className="stq-meta">
        <span>{it.mgr}</span>
        <span>{it.ty}</span>
        <span>{it.mon}</span>
        {it.sent === 1 && SENDABLE.includes(it.st) && <span className="stq-sentflag">발송체크됨</span>}
      </div>
      <div className="stq-meta2">
        <span>🗓 {it.when || '—'}</span>
        {it.chgWhen && <span className="stq-chg">변경 {it.chgWhen}</span>}
        <span>👥 {it.pax !== '' ? `${it.pax}명` : '—'}{it.chgPax !== '' && it.chgPax !== it.pax ? `→${it.chgPax}` : ''}</span>
        <span>{platTag(it.platX, '小')}{it.nx === '' ? 0 : it.nx} {platTag(it.platD, '大')}{it.nd === '' ? 0 : it.nd}</span>
      </div>
      {it.infls && <div className="stq-infls" title={it.infls}>{it.infls}</div>}
      {(it.paxMemo || it.note) && <div className="stq-note">{[it.paxMemo, it.note].filter(Boolean).join(' · ')}</div>}
      {it.clientMemo && <div className="stq-cmemo">📨 {it.clientMemo}</div>}

      {msg && (
        <button type="button" className={`stq-msg ${openMsg ? 'open' : ''}`} onClick={() => setOpenMsg((v) => !v)}>
          {msg}
        </button>
      )}

      <div className="stq-btns">
        <ActionButtons t={t} it={it} busy={busy} h={h} />
      </div>
    </div>
  );
});

/* 상태별 액션 — 분류는 "누구 차례"(todo/bot), 버튼은 진행상태로 세분한다.
   발송 전 예약엔 변경·취소가 아니라 전체 수정·삭제 (고객에게 나간 적 없음 — Owner 확정) */
function ActionButtons({ t, it, busy, h }) {
  if (t === 'todo' && SENDABLE.includes(it.st)) {
    return (
      <>
        <button className="stq-primary" disabled={busy} onClick={h.send}>📤 전송</button>
        <button className="stq-b" disabled={busy} onClick={h.edit}>✏️ 수정</button>
        <button className="stq-b" disabled={busy} onClick={h.copy} title="이 팀 구성으로 새 예약 입력">📋 복사</button>
        <button className="stq-b bad" disabled={busy} onClick={h.remove}>🗑 삭제</button>
      </>
    );
  }
  if (t === 'todo' && it.st === '변경요청') {
    return (
      <>
        <span className="stq-stuck-hint">
          봇이 차단(변경일시 없음)했거나 발송취소된 변경요청 — 확인이 필요합니다
        </span>
        <button className="stq-b" disabled={busy} onClick={h.modify}>✏️ 변경 다시 요청</button>
        <button className="stq-b" disabled={busy} onClick={h.confirmChange}>✅ 발송 없이 확정</button>
        <button className="stq-b warn" disabled={busy} onClick={h.cancel}>🚫 취소·노쇼</button>
      </>
    );
  }
  if (t === 'bot') {
    const canUnsend = SENDABLE.includes(it.st) || it.st === '변경요청';
    return (
      <>
        <span className="stq-stuck-hint">
          {it.st === '변경요청'
            ? <>봇이 변경 안내를 발송하면 <b>자동으로 변경확정</b>까지 처리합니다.</>
            : CANCELLED.includes(it.st)
              ? <>봇이 취소·노쇼 안내를 발송합니다.</>
              : <>봇이 처리하면 <b>예약확정</b>으로 바뀝니다.</>}
          {' '}여기 오래 머물면 예약봇(PC 앱) 실행 여부를 확인하세요.
        </span>
        {canUnsend && (
          <button className="stq-b" disabled={busy} onClick={h.unsend}>↩ 발송취소 (대기로)</button>
        )}
      </>
    );
  }
  if (t === 'ok') {
    return (
      <>
        <button className="stq-b" disabled={busy} onClick={h.modify}>✏️ 변경</button>
        <button className="stq-b warn" disabled={busy} onClick={h.cancel}>🚫 취소·노쇼</button>
        <button className="stq-b" disabled={busy} onClick={h.copy} title="이 팀 구성으로 새 예약 입력 (다른 매장·다른 날짜)">📋 복사</button>
      </>
    );
  }
  return null;   // cancel(취소·노쇼 완료) — 액션 없음
}

/* 컴팩트 행 — 확정·진행처럼 "볼 일 많고 액션 적은" 상태용. 클릭하면 발송문 펼침 */
const ListRow = memo(function ListRow({ it, busy, actions, kidsArr, onSaveResult }) {
  const h = useMemo(() => bindActions(actions, it), [actions, it]);
  const members = useMemo(() => pickMembers(it, kidsArr), [it, kidsArr]);
  const [open, setOpen] = useState(false);
  const [resFocus, setResFocus] = useState('');   // 결과 입력칸 — 연 경우 처음 누른 인플별 건 ID
  const t = tabOf(it);
  const msg = msgOf(it);
  return (
    <div className={`stq-row-wrap ${busy ? 'busy' : ''}`}>
      <div className="stq-row" onClick={() => setOpen((v) => !v)}>
        <span className={`stq-st ${stClass(it.st)}`}>{it.st}</span>
        <b className="stq-row-store">{it.store || '—'}</b>
        <span className="stq-row-meta">{it.mgr} · {it.ty} · {it.mon}</span>
        <span className="stq-row-when">
          🗓 {it.when || '—'}
          {it.chgWhen && <i className="stq-chg"> 변경 {it.chgWhen}</i>}
        </span>
        <span className="stq-row-cnt">
          {it.pax !== '' ? `${it.pax}명` : '—'} · {platTag(it.platX, '小')}{it.nx === '' ? 0 : it.nx} {platTag(it.platD, '大')}{it.nd === '' ? 0 : it.nd}
        </span>
        {/* 인플 아이디를 접기 전에도 보여 준다 — 취소·변경 대상을 여기서 바로 고른다.
            결과 현황을 불러왔으면 아이디마다 아래에 3칸 블록(小·大·抖)을 붙인다 */}
        {members ? (
          <span className="stq-row-infl stq-mems">
            {members.map((m) => (
              <span key={m.id} className={`stq-mem ${CANCELLED.includes(m.st) ? 'off' : ''}`}>
                <span className="stq-mem-id" title={m.name}>{m.name || '—'}</span>
                <button
                  type="button"
                  className="stq-dots"
                  title={RES_KEYS.map((k) => `${RES_NAME[k]}: ${DOT_WORD[dotState(m, k, it)]}`).join(' · ') + ' — 눌러서 링크 입력'}
                  onClick={(e) => { e.stopPropagation(); setResFocus(m.id); }}
                >
                  {RES_KEYS.map((k) => (
                    <i key={k} className={`stq-d ${dotState(m, k, it)}`}>{dotLabel(k, it)}</i>
                  ))}
                </button>
              </span>
            ))}
          </span>
        ) : (
          <span className="stq-row-infl" title={it.infls}>{it.infls || '—'}</span>
        )}
        <span className="stq-row-btns" onClick={(e) => e.stopPropagation()}>
          <ActionButtons t={t} it={it} busy={busy} h={h} />
        </span>
      </div>
      {resFocus && members && (
        <ResultPanel it={it} members={members} focusId={resFocus} onSave={onSaveResult}
          onClose={() => setResFocus('')} />
      )}
      {open && (
        <div className="stq-row-detail">
          {it.infls && <div className="stq-infls">{it.infls}</div>}
          {it.clientMemo && <div className="stq-cmemo">📨 {it.clientMemo}</div>}
          {msg && <pre className="stq-row-msg">{msg}</pre>}
        </div>
      )}
    </div>
  );
});

/* ── 결과 링크 입력칸 — 행 아래에 펼친다(모달이 아니라서 여러 팀을 연달아 넣어도 목록 위치를 안 잃는다) ──
   칸에 이미 있는 링크를 채워 보여주고, 바뀐 칸만 보낸다. 비우면 지움(확인 후).
   공유 문구를 통째로 붙여넣으면 URL 만 뽑아 도메인대로 샤오홍슈·따종·틱톡 칸에 나눠 넣는다. */
function ResultPanel({ it, members, focusId, onSave, onClose }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(
    members.map((m) => [m.id, { x: m.x || '', d: m.d || '', y: m.y || '' }]),
  ));
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const refs = useRef({});

  // 누른 인플의 첫 빈 칸으로 커서 — 이미 열려 있을 때 다른 인플 블록을 눌러도 그쪽으로 옮긴다
  useEffect(() => {
    const d = drafts[focusId] || {};
    const k = RES_KEYS.find((x) => !d[x]) || 'x';
    refs.current[`${focusId}:${k}`]?.focus();
    // drafts 는 일부러 뺀다 — 입력할 때마다 커서가 튀면 안 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const setVal = (mid, k, v) => setDrafts((p) => ({ ...p, [mid]: { ...p[mid], [k]: v } }));

  function onPaste(e, mid, k) {
    const urls = urlsIn(e.clipboardData?.getData('text') || '');
    if (!urls.length) return;              // 링크가 아니면 브라우저 기본 붙여넣기
    e.preventDefault();
    const routed = {};
    urls.forEach((u) => { const p = resKeyOf(u); if (p && !routed[p]) routed[p] = u; });
    const next = { ...drafts[mid] };
    if (Object.keys(routed).length) Object.assign(next, routed);
    else next[k] = urls[0];                 // 모르는 도메인(인스타 등) = 누른 칸에
    setDrafts((p) => ({ ...p, [mid]: next }));
    const moved = Object.keys(routed).filter((x) => x !== k);
    setMsg(moved.length ? `${moved.map((x) => RES_NAME[x]).join('·')} 칸으로 나눠 넣었습니다 — 확인 후 저장` : '');
  }

  async function save(m) {
    const d = drafts[m.id];
    const vals = {};
    const cleared = [];
    RES_KEYS.forEach((k) => {
      const now = String(d[k] || '').trim();
      if (now === String(m[k] || '')) return;
      if (now === '') { vals[RES_API[k]] = '-'; cleared.push(RES_NAME[k]); } else vals[RES_API[k]] = now;
    });
    if (!Object.keys(vals).length) return;
    if (cleared.length && !window.confirm(`${m.name} — ${cleared.join('·')} 링크를 지웁니다.`)) return;
    setBusy(m.id); setMsg('');
    try {
      const j = await onSave(m.id, vals);
      // 서버가 정리한 값(공유 문구에서 뽑은 URL)으로 칸을 맞춘다
      setDrafts((p) => {
        const cur = { ...p[m.id] };
        RES_KEYS.forEach((k) => { if (j.values && j.values[RES_API[k]] !== undefined) cur[k] = j.values[RES_API[k]]; });
        return { ...p, [m.id]: cur };
      });
      setMsg(`${m.name || '저장'} ✓ 저장했습니다`);
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="stq-res" onClick={(e) => e.stopPropagation()}>
      <div className="stq-res-h">
        <b>결과 링크</b>
        <span>{it.store} · {it.when || '—'}</span>
        <span className="stq-res-hint">공유 문구를 통째로 붙여넣어도 됩니다 — 링크만 뽑아 칸을 나눠 넣습니다</span>
        <button type="button" className="stq-ghost stq-res-x" onClick={onClose} title="닫기">✕</button>
      </div>
      {members.map((m) => {
        const d = drafts[m.id] || {};
        const changed = RES_KEYS.some((k) => String(d[k] || '').trim() !== String(m[k] || ''));
        const off = CANCELLED.includes(m.st);
        return (
          <div key={m.id} className={`stq-res-row ${m.id === focusId ? 'focus' : ''} ${off ? 'off' : ''}`}>
            <span className="stq-res-name" title={m.name}>{m.name || '—'}{off && <em>{m.st}</em>}</span>
            {RES_KEYS.map((k) => (
              <label key={k} className={`stq-res-f ${dotState(m, k, it)}`}>
                <i className={`stq-d ${dotState(m, k, it)}`}>{dotLabel(k, it)}</i>
                <input
                  ref={(el) => { refs.current[`${m.id}:${k}`] = el; }}
                  value={d[k] || ''}
                  placeholder={`${RES_NAME[k]} 링크`}
                  onChange={(e) => setVal(m.id, k, e.target.value)}
                  onPaste={(e) => onPaste(e, m.id, k)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(m); }}
                  spellCheck={false}
                />
              </label>
            ))}
            <button type="button" className="stq-primary stq-res-save" disabled={!changed || busy === m.id} onClick={() => save(m)}>
              {busy === m.id ? '저장 중…' : '저장'}
            </button>
          </div>
        );
      })}
      {msg && <div className="stq-res-msg">{msg}</div>}
    </div>
  );
}

/* ── 전체 수정 모달 — 발송 전 예약요청 전용 ── */
function EditModal({ item, busy, onClose, onSubmit }) {
  const [when, setWhen] = useState(isoToLocal(item.whenRaw));
  const [pax, setPax] = useState(item.pax === '' ? 1 : item.pax);
  const [nx, setNx] = useState(item.nx === '' ? 0 : item.nx);
  const [nd, setNd] = useState(item.nd === '' ? 0 : item.nd);
  const [mgr, setMgr] = useState(RECRUITERS.includes(item.mgr) ? item.mgr : '');
  const [type, setType] = useState(['체험', '인플', '기자'].includes(item.ty) ? item.ty : '');
  const [paxMemo, setPaxMemo] = useState(item.paxMemo || '');
  const [clientMemo, setClientMemo] = useState(item.clientMemo || '');
  return (
    <div className="stq-overlay" onClick={onClose}>
      <div className="stq-modal" onClick={(e) => e.stopPropagation()}>
        <h3>✏️ 전체 수정 — {item.store}</h3>
        <p className="stq-modal-sub">
          발송 전이라 모든 항목을 자유롭게 고칠 수 있습니다. 예약일시·담당·유형은
          분할된 진행 건에도 함께 반영됩니다.
        </p>
        <label>예약일시 (한국시각) <span className="stq-opt">30분 단위 · 직접 입력 가능</span></label>
        <DateTime30 value={when} onChange={setWhen} />
        <div className="stq-modal-row3">
          <div>
            <label>총인원</label>
            <input type="number" min="1" value={pax} onChange={(e) => setPax(e.target.value)} />
          </div>
          <div>
            <label>小红 건수</label>
            <input type="number" min="0" value={nx} onChange={(e) => setNx(e.target.value)} />
          </div>
          <div>
            <label>大众 건수</label>
            <input type="number" min="0" value={nd} onChange={(e) => setNd(e.target.value)} />
          </div>
        </div>
        <label>담당자</label>
        <div className="stq-cancel-opts stq-hseg">
          {RECRUITERS.map((m) => (
            <button key={m} type="button" className={mgr === m ? 'on' : ''} onClick={() => setMgr(m)}>{m}</button>
          ))}
        </div>
        <label>유형</label>
        <div className="stq-cancel-opts stq-hseg">
          {['체험', '인플', '기자'].map((tt) => (
            <button key={tt} type="button" className={type === tt ? 'on' : ''} onClick={() => setType(tt)}>{tt}</button>
          ))}
        </div>
        <label>인원 메모 <span className="stq-opt">(선택)</span></label>
        <input value={paxMemo} onChange={(e) => setPaxMemo(e.target.value)} />
        <label>고객 전달 메모 <span className="stq-opt">(선택)</span></label>
        <textarea rows={2} value={clientMemo} onChange={(e) => setClientMemo(e.target.value)} />
        <p className="stq-modal-sub" style={{ marginTop: '.6rem' }}>
          ※ 정산월·매장·인플 변경은 여기서 하지 않습니다 — 정산월은 월 이동 기능(예정),
          매장·인플이 틀렸으면 삭제 후 다시 입력하세요 (유령 방지).
        </p>
        <div className="stq-modal-btns">
          <button
            className="stq-primary"
            disabled={busy}
            onClick={() => onSubmit({ when, pax, nx, nd, mgr, type, paxMemo, clientMemo })}
          >{busy ? '저장 중…' : '저장'}</button>
          <button className="stq-b" disabled={busy} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

/* ── 변경 모달 ── */
function ModifyModal({ item, busy, onClose, onSubmit }) {
  // 기존 값을 채워 놓고 고치게 한다 (Owner 지적 2026-08-13: 빈 칸이라 처음부터 다시 입력해야 했다).
  // 이미 변경요청이 걸린 건은 변경일시가 현재 유효 시각이므로 그것을 기준으로 다시 고친다.
  // 30분 격자로 깎지 않는다 — DateTime30 이 10:15 같은 값을 직접입력 모드로 그대로 보여준다 (2026-08-25)
  const baseWhen = isoToLocal(item.chgWhenRaw || item.whenRaw);
  const basePax = item.chgPax !== '' && item.chgPax != null ? item.chgPax : (item.pax ?? '');
  const baseMemo = item.clientMemo || '';
  const [when, setWhen] = useState(baseWhen);
  const [pax, setPax] = useState(basePax);
  const [memo, setMemo] = useState(baseMemo);
  // 아무것도 안 바꿨는데 '변경 요청'을 누르면 같은 내용의 변경 안내가 매장에 나간다 — 막는다
  const dirty = when !== baseWhen || String(pax) !== String(basePax) || memo.trim() !== baseMemo.trim();
  return (
    <div className="stq-overlay" onClick={onClose}>
      <div className="stq-modal" onClick={(e) => e.stopPropagation()}>
        <h3>✏️ 예약 변경 — {item.store}</h3>
        <p className="stq-modal-sub">
          변경요청 상태로 바뀌고 변경 안내가 발송 대기열에 오릅니다.
          {' '}기존 <b>{item.chgWhen || item.when || '—'}</b>{basePax !== '' ? ` · ${basePax}명` : ''} — 바꿀 항목만 고치세요.
        </p>
        <label>변경일시 (한국시각) <b className="rq">*</b> <span className="stq-opt">30분 단위 · 직접 입력 가능</span></label>
        <DateTime30 value={when} onChange={setWhen} />
        <label>변경인원 <span className="stq-opt">(그대로면 손대지 않기)</span></label>
        <input type="number" min="1" value={pax} onChange={(e) => setPax(e.target.value)} />
        <label>고객 전달 메모 <span className="stq-opt">(선택)</span></label>
        <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        <div className="stq-modal-btns">
          <button
            className="stq-primary"
            disabled={busy || !when || !dirty}
            title={!dirty ? '바뀐 내용이 없습니다' : undefined}
            onClick={() => onSubmit({ when, pax, memo })}
          >{busy ? '처리 중…' : '변경 요청'}</button>
          <button className="stq-b" disabled={busy} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

/* ── 취소·노쇼 모달 ── */
const CANCEL_OPTS = [
  { v: '취소_방문자', t: '취소 — 방문자(인플) 사유' },
  { v: '취소_고객사', t: '취소 — 고객사 사유' },
  { v: '노쇼', t: '노쇼' },
];

function CancelModal({ item, busy, onClose, onSubmit }) {
  const [kind, setKind] = useState('취소_방문자');
  const [memo, setMemo] = useState('');
  return (
    <div className="stq-overlay" onClick={onClose}>
      <div className="stq-modal" onClick={(e) => e.stopPropagation()}>
        <h3>🚫 취소·노쇼 — {item.store}</h3>
        <p className="stq-modal-sub">고객사에 취소 안내가 카톡으로 발송됩니다 (봇 경로 단일화).</p>
        <label>유형 <b className="rq">*</b></label>
        <div className="stq-cancel-opts">
          {CANCEL_OPTS.map((o) => (
            <button
              key={o.v}
              type="button"
              className={kind === o.v ? 'on' : ''}
              onClick={() => setKind(o.v)}
            >{o.t}</button>
          ))}
        </div>
        <label>고객 전달 메모 <span className="stq-opt">(선택 — 안내문에 붙습니다)</span></label>
        <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        <div className="stq-modal-btns">
          <button
            className="stq-primary bad"
            disabled={busy}
            onClick={() => onSubmit({ kind, memo })}
          >{busy ? '처리 중…' : '취소 처리 + 안내 발송'}</button>
          <button className="stq-b" disabled={busy} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
