import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminHeaders } from '../lib/adminKey';
import './AdminReviewsPage.css';

/**
 * 리뷰 승인 큐 — 리뷰서비스 매장의 답글 초안을 담당자가 확인·수정·승인한다.
 * (계획 dianping-review-service-yap Phase 3)
 *
 * 흐름: 새벽 초안(리뷰_DB '검토대기') → 데일리 리포트로 사장님께 통보 → 회신을 담당자가 여기 기록 →
 *       최종 중국어 본문을 **그대로 읽고** [승인] → PC C 의 post_replies.py 가 정기(12·14·16시) 또는 ⚡즉시 게시.
 * 승인은 "이 문장을 이 매장 이름으로 공개해도 된다"는 서명이다.
 * 답글은 수정 불가·삭제 후 재등록만 된다(AG 판정) — 오타 하나가 공개 기록이 되므로 최종본을 보여주고 확인 1회.
 *
 * 2026-09-24 화면 개편(Owner: "얍 것만 찾기 힘들다·어수선하다 — 고객사별·호평악평별·날짜별로"):
 *   · 매장 레일(대기 건수 배지) → 매장 요약 → 할 일 탭·등급·기간·검색 → **날짜별 한 줄 목록**, 누르면 펼침
 *   · 필터는 전부 클라이언트에서 — 매장을 바꿀 때마다 Airtable 을 다시 읽지 않는다(월 10만 호출 한도)
 *   · 필터 상태는 주소창(?store=&view=…)에 남는다 — 새로고침·링크 공유해도 같은 화면
 */

const KST = (iso) => {
  if (!iso) return '—';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(t).replace('T', ' ');
};
const kstDay = (iso) => (iso ? KST(iso).slice(0, 10) : '');
const kstTime = (iso) => (iso ? KST(iso).slice(11, 16) : '');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (d) => {
  if (!d) return '날짜 없음';
  const w = WD[new Date(`${d}T12:00:00+09:00`).getUTCDay()];     // KST 정오 = UTC 같은 날 03시
  const today = kstDay(new Date().toISOString());
  const yest = kstDay(new Date(Date.now() - 86400000).toISOString());
  return `${d.slice(5).replace('-', '.')} (${w})${d === today ? ' · 오늘' : d === yest ? ' · 어제' : ''}`;
};

// 담당자 관점의 '할 일' 묶음 — 상태 11개를 칩으로 늘어놓던 것을 6개로 접었다
const VIEWS = [
  { key: 'todo', label: '처리 필요', states: ['검토대기', '고객협의'] },
  { key: 'queued', label: '게시 대기', states: ['승인', '게시중'] },
  { key: 'check', label: '확인 필요', states: ['게시확인필요', '게시실패'] },
  { key: 'done', label: '게시 완료', states: ['게시완료'] },
  { key: 'parked', label: '보류·반려', states: ['보류', '반려', '신규', '초안'] },
  { key: 'all', label: '전체', states: null },
];
const GRADES = [
  { key: '', label: '전체 등급' },
  { key: 'bad', label: '악평', test: (g) => g === '낮은별점' || g === '악성' },
  { key: 'sens', label: '민감', test: (g) => g === '민감' },
  { key: 'good', label: '호평', test: (g) => g === '호평' },
];
const RANGES = [['', '전체 기간'], ['1', '오늘'], ['3', '3일'], ['7', '7일'], ['30', '30일']];
const PAGE = 80;
const BULK_MAX = 60;     // 서버 approve_bulk 상한과 같다

const gradeOf = (it) => GRADES.find((g) => g.test && g.test(it['등급']))?.key || 'etc';
const viewOf = (st) => VIEWS.find((v) => v.states && v.states.includes(st))?.key || 'parked';

function StoreSwitches({ stores, onToggle, busy }) {
  if (!stores?.length) return null;
  // 🔴 선플자동게시 = **호평 답글을 우리가 달아도 된다는 협의가 끝났나**(2026-09-23 Owner 정의).
  //    켜야 비로소 ① 톡방에 "오늘 중 달아 드립니다" 가 나가고 ② 봇이 호평을 승인 없이 게시한다.
  //    끈 매장은 시범 상태 — 초안을 보여 주고 "게시를 원하시면 말씀해 주세요" 로만 나간다.
  const flags = [['review', '리뷰서비스', '리뷰서비스'], ['paused', '리뷰서비스_일시중지', '일시중지'],
    ['autoGood', '선플자동게시', '호평 자동게시'], ['daily', '일일리포트', '데일리 발송']];
  return (
    <div className="rq-stores">
      {stores.map((s) => (
        <div className="rq-store" key={s.id}>
          <b>{s.name} <span className="rq-meta">{s.slug}{s.room ? '' : ' · 톡방 없음'}{s.review && s.start ? ` · 시작 ${s.start}` : ''}</span></b>
          {flags.map(([k, field, label]) => (
            <label key={k} className={s[k] ? 'on' : ''}
                   title={k === 'autoGood' ? '사장님과 호평 답글 대행 협의가 끝난 매장만 켭니다 — 켜면 호평은 승인 없이 게시됩니다' : undefined}>
              <input type="checkbox" checked={!!s[k]} disabled={busy === s.id}
                     onChange={(e) => onToggle(s, field, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

// 서버 값이 바뀌면 부모가 key 를 바꿔 다시 마운트한다(effect 로 state 를 덮지 않는다 — lint 규칙).
function Card({ it, onAct, busy, autoOk = true }) {
  const [finalCn, setFinalCn] = useState(it['최종_중문'] || it['초안_중문'] || '');
  const [reply, setReply] = useState(it['고객회신'] || '');
  const st = it['상태'] || '';
  const sens = it['등급'] === '민감';
  const editable = ['검토대기', '고객협의', '승인', '보류', '초안', '신규', '게시실패', '게시확인필요'].includes(st);
  const dirty = finalCn !== (it['최종_중문'] || it['초안_중문'] || '') || reply !== (it['고객회신'] || '');
  // 🔴 2026-09-24: "협의 전 매장은 승인해도 봇이 게시하지 않습니다" 경고는 뺐다 — 09-23 밤 정책 개정으로
  //    **승인한 건은 등급·선플자동게시와 무관하게 게시된다.** 옛 문구가 남으면 담당자가 가볍게 승인한다.
  const confirmMsg = (when) => `${it.store} · ★${it['별점'] ?? '-'} ${it['작성자'] || ''}\n\n`
    + `아래 중국어가 매장 이름으로 공개 게시됩니다(수정 불가·삭제 후 재등록만 가능).\n\n${finalCn}\n\n${when}`;
  const approve = () => {
    if (!finalCn.trim()) { window.alert('게시할 중국어 답글이 비어 있습니다'); return; }
    if (window.confirm(confirmMsg('승인하면 다음 정기 게시(12·14·16시)에 올라갑니다. 승인할까요?'))) {
      onAct(it.id, 'approve', { finalCn, reply });
    }
  };
  // ⚡ 즉시게시(Owner 2026-09-24) — 악플을 사장님과 협의해 고친 뒤 그 한 건만 바로 올린다. 시간 제한 없음.
  const approveNow = () => {
    if (!finalCn.trim()) { window.alert('게시할 중국어 답글이 비어 있습니다'); return; }
    if (window.confirm(confirmMsg('⚡ 지금 바로 게시합니다 — PC C 가 1~2분 안에 올립니다. 진행할까요?'))) {
      onAct(it.id, 'approve_now', { finalCn, reply });
    }
  };
  const waitingNow = !!it['즉시게시요청'];
  return (
    <div className={`rq-card${sens ? ' sens' : ''}`}>
      <div className="rq-top">
        {it['통보시각'] && <span className="rq-meta">통보 {KST(it['통보시각'])}</span>}
        {it['승인자'] && <span className="rq-meta">승인 {it['승인자']} {KST(it['승인시각'])}</span>}
        {it['답변여부_포털'] && <span className="rq-meta">포털에 답글 있음</span>}
        {it['대응유형'] && <span className="rq-meta">대응 {it['대응유형']}</span>}
        {waitingNow && <span className="rq-meta rq-now">⚡ 즉시게시 대기 {KST(it['즉시게시요청시각'])}</span>}
      </div>
      {sens && (
        // 🔴 2026-09-24 문구 정정: 민감도 악플과 같은 선이 됐다(Owner 09-23) — **승인하면 공개 게시된다.**
        <div className="rq-warnbox">🚫 민감 등급(보상·환불·차별·위생·법적 언급) — <b>승인하면 그대로 공개 게시됩니다.</b> 반드시 사장님 협의가 끝난 뒤에 승인하세요.</div>
      )}
      {!sens && autoOk && it['등급'] === '호평' && st === '검토대기' && (
        <div className="rq-note rq-meta">호평 자동게시 매장 — 승인하지 않아도 다음 정기 게시(12·14·16시)에 이 초안이 올라갑니다. 고치려면 고친 뒤 승인, 막으려면 반려하세요.</div>
      )}
      <div className="rq-cols">
        <div className="rq-box"><span className="lab">중국어 원문</span><pre>{it['원문'] || ''}</pre></div>
        <div className="rq-box"><span className="lab">한글 번역</span><pre>{it['번역'] || '(번역 없음)'}</pre></div>
      </div>
      <div className="rq-cols">
        <div className="rq-box"><span className="lab">AI 초안 (중문)</span><pre>{it['초안_중문'] || '(초안 없음)'}</pre></div>
        <div className="rq-box"><span className="lab">초안 한글 대역 · 메모</span><pre>{it['초안_한글'] || ''}</pre></div>
      </div>
      {editable && (
        <>
          <div>
            <span className="rq-meta">게시될 최종 중국어 — 이 칸이 그대로 올라갑니다</span>
            <textarea className="rq-ta" value={finalCn} onChange={(e) => setFinalCn(e.target.value)} />
          </div>
          <input className="rq-in" placeholder="사장님 회신 요지 (톡방에서 읽은 것)" value={reply} onChange={(e) => setReply(e.target.value)} />
          <div className="rq-btns">
            {st !== '승인' && (
              <button className="rq-btn ok" disabled={busy === it.id} onClick={approve}>✅ 승인 (정기 게시)</button>
            )}
            {!waitingNow && (
              <button className="rq-btn now" disabled={busy === it.id} onClick={approveNow}>
                {st === '승인' ? '⚡ 지금 바로 게시' : '⚡ 승인하고 바로 게시'}
              </button>
            )}
            {st === '승인' && (
              <button className="rq-btn" disabled={busy === it.id} onClick={() => onAct(it.id, 'unapprove')}>⏸ 승인 취소</button>
            )}
            <button className="rq-btn" disabled={busy === it.id || !dirty} onClick={() => onAct(it.id, 'edit', { finalCn, reply })}>💾 저장만</button>
            {st !== '고객협의' && (
              <button className="rq-btn warn" disabled={busy === it.id} onClick={() => onAct(it.id, 'consult', { reply })}>🗣 고객 협의중</button>
            )}
            <button className="rq-btn" disabled={busy === it.id} onClick={() => onAct(it.id, 'hold', { reply })}>⏳ 보류</button>
            <button className="rq-btn" disabled={busy === it.id} onClick={() => onAct(it.id, 'redraft')}>🔁 초안 다시</button>
            <button className="rq-btn bad" disabled={busy === it.id}
                    onClick={() => { if (window.confirm('반려하면 이 리뷰에는 답글을 달지 않습니다. 진행할까요?')) onAct(it.id, 'reject'); }}>✖ 반려</button>
          </div>
        </>
      )}
      {(it['게시결과'] || it['게시시각']) && (
        <div className="rq-note rq-meta">
          게시 {KST(it['게시시각'])} · {it['게시결과'] || ''}
          {/* 포털답글ID = 우리 답글을 나중에 찾거나 지울 때의 열쇠(followNoteId) */}
          {it['포털답글ID'] && <> · 답글ID <b>{it['포털답글ID']}</b></>}
          {it['게시시도'] ? <> · 시도 {it['게시시도']}회</> : null}
        </div>
      )}
      {it['게시이력'] && (
        // 최신이 맨 위. 못 찾음·입력창 실패처럼 예전엔 흔적이 안 남던 결과도 여기 남는다.
        <details className="rq-log">
          <summary>게시 이력 {String(it['게시이력']).split('\n').length}줄</summary>
          <pre>{it['게시이력']}</pre>
        </details>
      )}
    </div>
  );
}

// 한 줄 요약 — 누르면 아래에 Card 가 펼쳐진다. 수백 건을 다 펼쳐 두던 것이 어수선함의 원인이었다.
function Row({ it, open, onToggle, showStore, auto, selectable, selected, onSelect }) {
  const g = gradeOf(it);
  const st = it['상태'] || '';
  const autoPending = auto && it['등급'] === '호평' && st === '검토대기';
  const star = it['별점'] != null ? Number(it['별점']) : null;
  return (
    <div className={`rq-row g-${g}${open ? ' open' : ''}`}>
      <div className="rq-row-sel">
        {selectable ? (
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(it.id, e.target.checked)}
                 aria-label="선택" />
        ) : <span className="rq-row-dot" />}
      </div>
      <button type="button" className="rq-row-main" onClick={() => onToggle(it.id)} aria-expanded={open}>
        <span className="rq-row-line1">
          <span className={`rq-star${star != null && star <= 3 ? ' low' : ''}`}>★{star != null ? star.toFixed(1) : '-'}</span>
          <span className={`rq-grade g-${it['등급'] || ''}`}>{it['등급'] || '미분류'}</span>
          {showStore && <b className="rq-row-store">{it.store}</b>}
          <span className="rq-row-who">{it['작성자'] || '(익명)'}</span>
          <span className="rq-meta">{kstTime(it['리뷰일시'])}</span>
          {Number(it['사진수']) > 0 && <span className="rq-meta">📷{it['사진수']}</span>}
          <span className="rq-row-flags">
            {it['즉시게시요청'] && <span className="rq-pill now">⚡ 즉시게시 대기</span>}
            {autoPending && <span className="rq-pill auto">자동게시 예정</span>}
            {st !== '검토대기' && <span className={`rq-pill s-${st}`}>{st}</span>}
          </span>
        </span>
        <span className="rq-row-text">{it['번역'] || it['원문'] || ''}</span>
      </button>
      <span className="rq-row-chev" aria-hidden>{open ? '▴' : '▾'}</span>
    </div>
  );
}

export default function AdminReviewsPage() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [openId, setOpenId] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [limit, setLimit] = useState(PAGE);
  const [sp, setSp] = useSearchParams();
  const store = sp.get('store') || '';
  const view = sp.get('view') || 'todo';
  const grade = sp.get('grade') || '';
  const range = sp.get('range') || '';
  const sort = sp.get('sort') || 'new';
  const q = sp.get('q') || '';
  const setParam = (k, v) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v); else n.delete(k);
    setSp(n, { replace: true });
    setSel(new Set()); setLimit(PAGE); setOpenId('');
  };

  // 전 매장을 한 번에 읽는다 — 매장 선택은 클라이언트 필터. 완료분은 서버가 최근 14일만 준다.
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin-reviews', { headers: adminHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setD(j); setErr('');
      return j;
    } catch (e) { setErr(String(e.message || e)); return null; }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function post(body) {
    const r = await fetch('/api/admin-reviews', {
      method: 'POST', headers: { ...adminHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  async function act(id, action, extra = {}) {
    setBusy(id); setNote('');
    try {
      const j = await post({ action, id, ...extra });
      // 즉시게시는 신호(CS_DB 리뷰즉시게시)를 켜야 워커가 본다. 신호가 실패해도 승인은 저장됐으니
      // 다음 정기 게시에 올라간다 — '즉시'만 안 된 것이라 그대로 알린다.
      const now = j.signal === 'sent' ? ' · ⚡ PC C 가 1~2분 안에 올립니다 (결과는 자동으로 갱신)'
        : (j.signal ? ` · ⚠️ 즉시게시 신호 실패 — 다음 정기 게시에 올라갑니다 (${j.signal})` : '');
      setNote(`✅ ${action} → ${j.state || '저장됨'}${now}`);
      await load();
      if (action === 'approve_now' && j.signal === 'sent') watchNow(id);
    } catch (e) { setNote(`❌ ${action} 실패: ${e.message}`); }
    setBusy('');
  }
  // ⚡ 뒤 자동 새로고침. 🔴 09-24 첫 시도에 결과는 1분 안에 나와 있었는데 화면이 안 바뀌어 "반응 없음" 으로 보였다.
  //    15초마다 다시 읽고, 그 건의 즉시게시 요청이 풀리면(게시완료·실패 사유 기록) 멈춘다. 최대 3분.
  function watchNow(id) {
    let n = 0;
    const tick = async () => {
      n += 1;
      const j = await load();
      const it = (j?.items || []).find((x) => x.id === id);
      if (it && !it['즉시게시요청']) {
        setNote(`⚡ 처리됨 → ${it['상태'] || ''} · ${it['게시결과'] || ''}`);
        return;
      }
      if (n < 12) setTimeout(tick, 15000);
      else setNote('⚡ 3분 동안 결과가 안 나왔습니다 — PC C 워커가 꺼져 있거나 포털이 다른 작업 중일 수 있습니다. 새로고침으로 확인하세요.');
    };
    setTimeout(tick, 15000);
  }
  async function toggleStore(s, field, on) {
    setBusy(s.id); setNote('');
    try {
      const body = { action: 'store', id: s.id, set: { [field]: on } };
      if (field === '리뷰서비스' && on) {
        // 🔴 기본값은 **기존 시작일**이다. 오늘 날짜를 기본값으로 두면, 껐다 다시 켤 때
        //    엔터 한 번에 시작일이 오늘로 덮이고 그 이전 리뷰가 수집에서 영구히 빠진다
        //    (2026-09-09 실사고: 얍 스위치 테스트로 09-03 → 09-09 로 밀렸다).
        const dflt = s.start || new Date().toISOString().slice(0, 10);
        const start = window.prompt(
          s.start
            ? `리뷰서비스 시작일 — 이 매장은 이미 ${s.start} 로 설정돼 있습니다.\n`
              + '그대로 두려면 확인만 누르세요. 바꾸면 그 이전 리뷰는 수집에서 빠집니다.'
            : '리뷰서비스 시작일 (이 날 이후 리뷰만 다룹니다, YYYY-MM-DD)',
          dflt);
        if (!start) { setBusy(''); return; }
        body.start = start;
      }
      if (field === '일일리포트' && on && !s.room) { window.alert('톡방명이 없는 매장은 발송할 곳이 없습니다 (CS_DB 톡방명 먼저)'); setBusy(''); return; }
      if (field === '선플자동게시' && on && !window.confirm(
        `${s.name} — 호평 자동게시를 켭니다.\n\n켜면 이 매장의 호평은 담당자 승인 없이 AI 초안 그대로 `
        + '다음 정기 게시(12·14·16시)부터 매장 이름으로 공개 게시됩니다(하루 최대 10건).\n사장님과 협의가 끝났나요?')) { setBusy(''); return; }
      await post(body);
      await load();
    } catch (e) { setNote(`❌ 스위치 실패: ${e.message}`); }
    setBusy('');
  }

  const all = useMemo(() => d?.items || [], [d]);
  const autoSet = useMemo(() => new Set((d?.stores || []).filter((s) => s.autoGood).map((s) => s.slug)), [d]);
  const storeBy = useMemo(() => Object.fromEntries((d?.stores || []).map((s) => [s.slug, s])), [d]);
  const statBy = useMemo(() => Object.fromEntries((d?.stats?.rows || []).map((s) => [s.slug, s])), [d]);

  // 매장 레일 — 처리 필요 건수(그중 악평·민감), 게시 대기, 확인 필요
  const rail = useMemo(() => {
    const by = {};
    const bump = (slug, name) => (by[slug] || (by[slug] = { slug, name, todo: 0, hot: 0, queued: 0, check: 0 }));
    (d?.stores || []).filter((s) => s.review).forEach((s) => bump(s.slug, s.name));
    all.forEach((it) => {
      const r = bump(it['매장코드'], it.store);
      const v = viewOf(it['상태']);
      if (v === 'todo') { r.todo += 1; if (gradeOf(it) !== 'good') r.hot += 1; }
      if (v === 'queued') r.queued += 1;
      if (v === 'check') r.check += 1;
    });
    return Object.values(by).sort((a, b) => (b.hot - a.hot) || (b.todo - a.todo) || (b.check - a.check)
      || String(a.name).localeCompare(String(b.name), 'ko'));
  }, [d, all]);
  const tot = useMemo(() => rail.reduce((a, r) => ({ todo: a.todo + r.todo, hot: a.hot + r.hot, check: a.check + r.check }),
    { todo: 0, hot: 0, check: 0 }), [rail]);

  // 필터 단계: 매장 → (탭 건수) → 탭 → (등급 건수) → 등급·기간·검색
  const inStore = useMemo(() => all.filter((it) => !store || it['매장코드'] === store), [all, store]);
  const viewCounts = useMemo(() => {
    const c = { all: inStore.length };
    inStore.forEach((it) => { const v = viewOf(it['상태']); c[v] = (c[v] || 0) + 1; });
    return c;
  }, [inStore]);
  const inView = useMemo(() => {
    const vs = VIEWS.find((v) => v.key === view)?.states;
    return inStore.filter((it) => !vs || vs.includes(it['상태']));
  }, [inStore, view]);
  const gradeCounts = useMemo(() => {
    const c = {};
    inView.forEach((it) => { const g = gradeOf(it); c[g] = (c[g] || 0) + 1; });
    return c;
  }, [inView]);
  const items = useMemo(() => {
    const since = range ? kstDay(new Date(Date.now() - (Number(range) - 1) * 86400000).toISOString()) : '';
    const needle = q.trim().toLowerCase();
    const out = inView.filter((it) => (!grade || gradeOf(it) === grade)
      && (!since || kstDay(it['리뷰일시']) >= since)
      && (!needle || [it['작성자'], it['원문'], it['번역'], it['초안_중문'], it['최종_중문'], it['키'], it.store]
        .some((x) => String(x || '').toLowerCase().includes(needle))));
    out.sort((a, b) => (sort === 'old' ? 1 : -1) * String(a['리뷰일시'] || '').localeCompare(String(b['리뷰일시'] || '')));
    return out;
  }, [inView, grade, range, q, sort]);
  const groups = useMemo(() => {
    const gs = [];
    items.slice(0, limit).forEach((it) => {
      const day = kstDay(it['리뷰일시']);
      const last = gs[gs.length - 1];
      if (last && last.day === day) last.rows.push(it); else gs.push({ day, rows: [it] });
    });
    return gs;
  }, [items, limit]);
  const dayTotals = useMemo(() => {
    const c = {};
    items.forEach((it) => { const k = kstDay(it['리뷰일시']); c[k] = (c[k] || 0) + 1; });
    return c;
  }, [items]);

  // 선택 승인 — 선플자동게시 **미체크** 매장의 검토대기 호평만(체크 매장은 승인 없이 나간다). 서버가 건마다 다시 검사한다.
  const isSelectable = useCallback((it) => it['상태'] === '검토대기' && it['등급'] === '호평'
    && !autoSet.has(it['매장코드']) && !!String(it['최종_중문'] || it['초안_중문'] || '').trim(), [autoSet]);
  const selectableShown = useMemo(() => items.filter(isSelectable), [items, isSelectable]);
  const selItems = useMemo(() => all.filter((it) => sel.has(it.id)), [all, sel]);
  const onSelect = (id, on) => setSel((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });
  const selectAllShown = () => setSel(new Set(selectableShown.slice(0, BULK_MAX).map((it) => it.id)));
  async function approveSelected() {
    if (!selItems.length) return;
    const byStore = {};
    selItems.forEach((it) => { byStore[it.store] = (byStore[it.store] || 0) + 1; });
    const lines = Object.entries(byStore).map(([s, n]) => `  · ${s} ${n}건`).join('\n');
    const msg = `호평 ${selItems.length}건을 한 번에 승인합니다.\n${lines}\n\n`
      + '각 건의 AI 초안이 그대로 "게시될 최종 중국어"가 되고, 다음 정기 게시(12·14·16시)에 '
      + 'PC C 봇이 매장 이름으로 공개 게시합니다(수정 불가·삭제 후 재등록만).\n\n진행할까요?';
    if (!window.confirm(msg)) return;
    setBusy('bulk'); setNote('');
    try {
      const j = await post({ action: 'approve_bulk', ids: selItems.map((it) => it.id).slice(0, BULK_MAX) });
      const sk = (j.skipped || []).length ? ` · 건너뜀 ${j.skipped.length}건 (${j.skipped.slice(0, 3).map((x) => x.join(':')).join(', ')}${j.skipped.length > 3 ? '…' : ''})` : '';
      setNote(`✅ 선택 승인 ${j.approved}건${sk}`);
      setSel(new Set());
      await load();
    } catch (e) { setNote(`❌ 선택 승인 실패: ${e.message}`); }
    setBusy('');
  }

  if (err) return <div className="rq"><div className="rq-panel">❌ {err}</div></div>;
  if (!d) return <div className="rq"><div className="rq-panel rq-empty">불러오는 중…</div></div>;

  const cur = store ? storeBy[store] : null;
  const curStat = store ? statBy[store] : null;
  const curAuto = store && autoSet.has(store);

  return (
    <div className="rq">
      <div className="rq-panel rq-bar">
        <div className="rq-head">
          <b>오늘 할 일</b>
          <span className="rq-count">처리 필요 <b>{tot.todo}</b>건 (악평·민감 <b className="hot">{tot.hot}</b>) · 확인 필요 {tot.check}건</span>
          <span className="rq-spacer" />
          <button className="rq-btn" onClick={load}>↻ 새로고침</button>
        </div>
        {note && <div className="rq-note rq-flash">{note}</div>}
      </div>

      <div className="rq-layout">
        {/* ── 매장 레일 ── */}
        <nav className="rq-rail" aria-label="매장">
          <button className={`rq-rail-item${!store ? ' on' : ''}`} onClick={() => setParam('store', '')}>
            <span className="nm">전체 매장</span>
            <span className="bd">{tot.todo > 0 && <i className="todo">{tot.todo}</i>}</span>
          </button>
          {rail.map((r) => (
            <button key={r.slug} className={`rq-rail-item${store === r.slug ? ' on' : ''}`} onClick={() => setParam('store', r.slug)}
                    title={`처리 필요 ${r.todo}(악평·민감 ${r.hot}) · 게시 대기 ${r.queued} · 확인 필요 ${r.check}`}>
              <span className="nm">{r.name}{autoSet.has(r.slug) && <em className="auto" title="호평 자동게시">자동</em>}</span>
              <span className="bd">
                {r.hot > 0 && <i className="hot">{r.hot}</i>}
                {r.todo - r.hot > 0 && <i className="todo">{r.todo - r.hot}</i>}
                {r.check > 0 && <i className="chk">!{r.check}</i>}
              </span>
            </button>
          ))}
          <div className="rq-rail-legend"><i className="hot">n</i> 악평·민감 <i className="todo">n</i> 호평 <i className="chk">!n</i> 확인</div>
        </nav>

        <main className="rq-main">
          {/* ── 선택한 매장 요약 ── */}
          {cur && (
            <div className="rq-panel rq-storehead">
              <div className="rq-head">
                <b className="rq-store-title">{cur.name}</b>
                <span className="rq-meta">{cur.slug}{cur.start ? ` · 시작 ${cur.start}` : ''}</span>
                {cur.paused && <span className="rq-pill bad">일시중지</span>}
                {curAuto
                  ? <span className="rq-pill auto" title="호평은 승인 없이 정기 게시로 올라갑니다">호평 자동게시 ON</span>
                  : <span className="rq-pill" title="호평도 승인해야 올라갑니다">호평도 승인 필요</span>}
              </div>
              {curStat && (
                <div className="rq-kpis">
                  <div><span>이번 주 게시</span><b>{curStat.week}</b></div>
                  <div><span>누적 게시</span><b>{curStat.total}</b></div>
                  <div><span>게시 대기</span><b>{curStat.approved}</b></div>
                  <div><span>검토 대기</span><b>{curStat.waiting}</b></div>
                  <div className={curStat.check ? 'bad' : ''}><span>확인 필요</span><b>{curStat.check}</b></div>
                  <div><span>응답 중앙값</span><b>{curStat.lagH != null ? `${curStat.lagH}h` : '—'}</b></div>
                </div>
              )}
              <details className="rq-fold">
                <summary>매장 스위치</summary>
                <StoreSwitches stores={[cur]} onToggle={toggleStore} busy={busy} />
              </details>
            </div>
          )}

          {/* ── 필터 ── */}
          <div className="rq-panel rq-filterbar">
            <div className="rq-tabs" role="tablist">
              {VIEWS.map((v) => (
                <button key={v.key} role="tab" aria-selected={view === v.key}
                        className={`rq-tab${view === v.key ? ' on' : ''}${v.key === 'check' && viewCounts.check ? ' warn' : ''}`}
                        onClick={() => setParam('view', v.key === 'todo' ? '' : v.key)}>
                  {v.label} <span>{viewCounts[v.key] || 0}</span>
                </button>
              ))}
            </div>
            <div className="rq-filters">
              {GRADES.map((g) => (
                <button key={g.key} className={`rq-chip${grade === g.key ? ' on' : ''} gc-${g.key || 'all'}`} onClick={() => setParam('grade', g.key)}>
                  {g.label} {g.key ? (gradeCounts[g.key] || 0) : inView.length}
                </button>
              ))}
              <span className="rq-sep" />
              <select className="rq-in rq-sel" value={range} onChange={(e) => setParam('range', e.target.value)} aria-label="기간">
                {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button className="rq-chip" onClick={() => setParam('sort', sort === 'old' ? '' : 'old')}
                      title="오래된 리뷰부터 답하면 응답 시간이 줄어듭니다">
                {sort === 'old' ? '↑ 오래된순' : '↓ 최신순'}
              </button>
              <input className="rq-in rq-search" type="search" placeholder="작성자·내용 검색" value={q}
                     onChange={(e) => setParam('q', e.target.value)} />
            </div>
            {view === 'done' && <div className="rq-meta">게시 완료·반려는 최근 14일 리뷰만 불러옵니다.</div>}
            {(selectableShown.length > 0 || sel.size > 0) && (
              <div className="rq-bulk">
                <span className="rq-meta">호평 자동게시가 꺼진 매장의 호평은 체크해서 한 번에 승인할 수 있습니다.</span>
                <span className="rq-spacer" />
                <button className="rq-btn" onClick={selectAllShown} disabled={!selectableShown.length}>
                  보이는 호평 전체 선택 ({Math.min(selectableShown.length, BULK_MAX)})
                </button>
                {sel.size > 0 && <button className="rq-btn" onClick={() => setSel(new Set())}>선택 해제</button>}
                <button className="rq-btn ok" disabled={!sel.size || busy === 'bulk'} onClick={approveSelected}>
                  ✅ 선택 승인 ({sel.size})
                </button>
              </div>
            )}
          </div>

          {/* ── 날짜별 목록 ── */}
          {items.length === 0 ? (
            <div className="rq-panel rq-empty">
              {view === 'todo' && !grade && !q ? '🎉 처리할 리뷰가 없습니다' : '조건에 맞는 리뷰가 없습니다 — 탭·등급·기간을 바꿔 보세요'}
            </div>
          ) : (
            <div className="rq-list">
              {groups.map((g) => (
                <section key={g.day} className="rq-day">
                  <h3 className="rq-day-h">{dayLabel(g.day)} <span>{dayTotals[g.day]}건</span></h3>
                  {g.rows.map((it) => (
                    <div key={it.id} className="rq-item">
                      <Row it={it} open={openId === it.id} onToggle={(id) => setOpenId((p) => (p === id ? '' : id))}
                           showStore={!store} auto={autoSet.has(it['매장코드'])}
                           selectable={isSelectable(it)} selected={sel.has(it.id)} onSelect={onSelect} />
                      {openId === it.id && (
                        <Card key={`${it.id}|${it['상태'] || ''}|${it['최종_중문'] || ''}|${it['고객회신'] || ''}`}
                              it={it} onAct={act} busy={busy} autoOk={autoSet.has(it['매장코드'])} />
                      )}
                    </div>
                  ))}
                </section>
              ))}
              {items.length > limit && (
                <button className="rq-btn rq-more" onClick={() => setLimit((n) => n + PAGE)}>더 보기 ({items.length - limit}건 남음)</button>
              )}
            </div>
          )}

          {/* ── 접어 둔 것들: 전체 실적·전 매장 스위치·규칙 ── */}
          {!store && d.stats?.rows?.length > 0 && (
            <details className="rq-panel rq-fold">
              <summary>📊 매장별 답글 실적 <span className="rq-meta">이번 주 = {d.stats.weekStart}(월)부터 · 게시시각 기준 · 응답은 최근 30일 중앙값</span></summary>
              <div className="rq-stats-wrap">
                <table className="rq-stats">
                  <thead>
                    <tr><th>매장</th><th>이번 주 게시</th><th>누적 게시</th><th>승인·게시 대기</th><th>검토 대기</th><th>확인필요</th><th>응답(중앙)</th></tr>
                  </thead>
                  <tbody>
                    {d.stats.rows.map((s) => (
                      <tr key={s.slug} className="rq-link" onClick={() => setParam('store', s.slug)}>
                        <td>{s.name}</td>
                        <td><b>{s.week}</b></td>
                        <td>{s.total}</td>
                        <td>{s.approved}</td>
                        <td>{s.waiting}</td>
                        <td className={s.check ? 'bad' : ''}>{s.check}</td>
                        <td>{s.lagH != null ? `${s.lagH}시간` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {!store && (
            <details className="rq-panel rq-fold">
              <summary>🏪 전 매장 스위치 <span className="rq-meta">리뷰서비스·일시중지·호평 자동게시·데일리 발송 (CS_DB)</span></summary>
              <StoreSwitches stores={d.stores} onToggle={toggleStore} busy={busy} />
            </details>
          )}
          <details className="rq-panel rq-fold">
            <summary>ⓘ 게시 규칙</summary>
            <div className="rq-note rq-meta">
              승인은 "이 문장을 매장 이름으로 공개해도 된다"는 서명입니다.
              <b> ✅ 승인</b>은 다음 정기 게시(12·14·16시)에, <b>⚡ 바로 게시</b>는 PC C 가 1~2분 안에 올립니다(시간 제한 없음).
              <b> 호평 자동게시</b> 매장의 호평은 승인 없이 정기 게시로 올라가고(하루 최대 10건), 그 매장에만 톡방에 "오늘 중 달아 드립니다"가 나갑니다.
              자동게시가 꺼진 매장은 호평도 승인해야 올라갑니다. 낮은별점·악성·민감은 매장과 무관하게 <b>사장님 협의 후 승인</b>해야 올라갑니다.
            </div>
          </details>
        </main>
      </div>
    </div>
  );
}
