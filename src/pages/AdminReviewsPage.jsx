import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminHeaders } from '../lib/adminKey';
import './AdminReviewsPage.css';

/**
 * 리뷰 승인 큐 — 리뷰서비스 매장의 답글 초안을 담당자가 확인·수정·승인한다.
 * (계획 dianping-review-service-yap Phase 3)
 *
 * 흐름: 새벽 초안(리뷰_DB '검토대기') → 데일리 리포트로 사장님께 통보 → 회신을 담당자가 여기 기록 →
 *       최종 중국어 본문을 **그대로 읽고** [승인] → PC C 의 post_replies.py 가 낮에 게시.
 * 여기서는 절대 게시하지 않는다. 승인은 "이 문장을 이 매장 이름으로 공개해도 된다"는 서명이다.
 * 답글은 수정 불가·삭제 후 재등록만 된다(AG 판정) — 오타 하나가 공개 기록이 되므로 최종본을 보여주고 확인 1회.
 * 등급 '민감' 은 승인해도 봇이 게시하지 않는다(자동게시 영구 금지) — 담당자가 손으로 올린다.
 */

const KST = (iso) => {
  if (!iso) return '—';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(t).replace('T', ' ');
};
const QUEUE = ['검토대기', '고객협의', '승인'];
const ALL_STATES = ['검토대기', '고객협의', '승인', '게시중', '게시확인필요', '게시실패', '신규', '초안', '보류', '반려', '게시완료'];

function StoreSwitches({ stores, onToggle, busy }) {
  if (!stores?.length) return null;
  const flags = [['review', '리뷰서비스', '리뷰서비스'], ['paused', '리뷰서비스_일시중지', '일시중지'],
    ['autoGood', '선플자동게시', '선플 자동게시'], ['daily', '일일리포트', '데일리 발송']];
  return (
    <div className="rq-stores">
      {stores.map((s) => (
        <div className="rq-store" key={s.id}>
          <b>{s.name} <span className="rq-meta">{s.slug}{s.room ? '' : ' · 톡방 없음'}{s.review && s.start ? ` · 시작 ${s.start}` : ''}</span></b>
          {flags.map(([k, field, label]) => (
            <label key={k} className={s[k] ? 'on' : ''}>
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
function Card({ it, onAct, busy }) {
  const [finalCn, setFinalCn] = useState(it['최종_중문'] || it['초안_중문'] || '');
  const [reply, setReply] = useState(it['고객회신'] || '');
  const st = it['상태'] || '';
  const sens = it['등급'] === '민감';
  const editable = ['검토대기', '고객협의', '승인', '보류', '초안', '신규', '게시실패', '게시확인필요'].includes(st);
  const dirty = finalCn !== (it['최종_중문'] || it['초안_중문'] || '') || reply !== (it['고객회신'] || '');
  const approve = () => {
    if (!finalCn.trim()) { window.alert('게시할 중국어 답글이 비어 있습니다'); return; }
    const msg = `${it.store} · ★${it['별점'] ?? '-'} ${it['작성자'] || ''}\n\n아래 중국어가 매장 이름으로 공개 게시됩니다(수정 불가·삭제 후 재등록만 가능).\n\n${finalCn}\n\n승인할까요?`;
    if (window.confirm(msg)) onAct(it.id, 'approve', { finalCn, reply });
  };
  return (
    <div className={`rq-card${sens ? ' sens' : ''}`}>
      <div className="rq-top">
        <b>{it.store}</b>
        <span className="rq-star">★{it['별점'] != null ? Number(it['별점']).toFixed(1) : '-'}</span>
        <span>{it['작성자'] || '(익명)'}</span>
        <span>{KST(it['리뷰일시'])}</span>
        <span className={`rq-grade g-${it['등급'] || ''}`}>{it['등급'] || '미분류'}{it['대응유형'] ? ` · ${it['대응유형']}` : ''}</span>
        <span className={`rq-state s-${st}`}>● {st || '?'}</span>
        {it['통보시각'] && <span className="rq-meta">통보 {KST(it['통보시각'])}</span>}
        {it['승인자'] && <span className="rq-meta">승인 {it['승인자']} {KST(it['승인시각'])}</span>}
        {it['답변여부_포털'] && <span className="rq-meta">포털에 답글 있음</span>}
      </div>
      {sens && (
        <div className="rq-warnbox">🚫 민감 등급(보상·환불·차별·위생·법적 언급) — 승인해도 자동 게시되지 않습니다. 사장님과 협의 후 담당자가 직접 올립니다.</div>
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
              <button className="rq-btn ok" disabled={busy === it.id} onClick={approve}>✅ 승인 (게시 대상화)</button>
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
        <div className="rq-note rq-meta">게시 {KST(it['게시시각'])} · {it['게시결과'] || ''}</div>
      )}
    </div>
  );
}

export default function AdminReviewsPage() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [states, setStates] = useState(new Set(QUEUE));
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin-reviews${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`, { headers: adminHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setD(j); setErr('');
    } catch (e) { setErr(String(e.message || e)); }
  }, [slug]);
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
      setNote(`✅ ${action} → ${j.state || '저장됨'}`);
      await load();
    } catch (e) { setNote(`❌ ${action} 실패: ${e.message}`); }
    setBusy('');
  }
  async function toggleStore(s, field, on) {
    setBusy(s.id); setNote('');
    try {
      const body = { action: 'store', id: s.id, set: { [field]: on } };
      if (field === '리뷰서비스' && on) {
        const start = window.prompt('리뷰서비스 시작일 (이 날 이후 리뷰만 다룹니다, YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
        if (!start) { setBusy(''); return; }
        body.start = start;
      }
      if (field === '일일리포트' && on && !s.room) { window.alert('톡방명이 없는 매장은 발송할 곳이 없습니다 (CS_DB 톡방명 먼저)'); setBusy(''); return; }
      await post(body);
      await load();
    } catch (e) { setNote(`❌ 스위치 실패: ${e.message}`); }
    setBusy('');
  }

  const items = useMemo(() => (d?.items || []).filter((it) => states.size === 0 || states.has(it['상태'])), [d, states]);
  const counts = useMemo(() => {
    const c = {};
    (d?.items || []).forEach((it) => { c[it['상태']] = (c[it['상태']] || 0) + 1; });
    return c;
  }, [d]);
  const toggleState = (s) => setStates((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });

  if (err) return <div className="rq"><div className="rq-panel">❌ {err}</div></div>;
  if (!d) return <div className="rq"><div className="rq-panel rq-empty">불러오는 중…</div></div>;

  return (
    <div className="rq">
      <div className="rq-panel">
        <div className="rq-head">
          <b>💬 리뷰 승인 큐</b>
          <span className="rq-count">대기 {(counts['검토대기'] || 0) + (counts['고객협의'] || 0)}건 · 승인 {counts['승인'] || 0}건 · 전체 {d.items.length}건</span>
          <select className="rq-in" style={{ width: 'auto' }} value={slug} onChange={(e) => setSlug(e.target.value)}>
            <option value="">전 매장</option>
            {d.stores.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
          </select>
          <button className="rq-btn" onClick={load}>새로고침</button>
        </div>
        <div className="rq-filters">
          {ALL_STATES.map((s) => (
            <button key={s} className={`rq-chip${states.has(s) ? ' on' : ''}`} onClick={() => toggleState(s)}>{s} {counts[s] || 0}</button>
          ))}
        </div>
        <div className="rq-note rq-meta" style={{ marginTop: 8 }}>
          승인은 "이 문장을 매장 이름으로 공개해도 된다"는 서명입니다. PC C 봇이 낮 10~17시에 승인 건만 게시하고, 여기서는 게시하지 않습니다.
        </div>
        {note && <div className="rq-note" style={{ marginTop: 6 }}>{note}</div>}
      </div>

      <div className="rq-panel">
        <div className="rq-head"><b>🏪 매장 스위치</b><span className="rq-count">리뷰서비스 대상·일시중지·선플 자동게시·데일리 발송 (CS_DB)</span></div>
        <StoreSwitches stores={d.stores} onToggle={toggleStore} busy={busy} />
      </div>

      {items.length === 0 ? (
        <div className="rq-panel rq-empty">표시할 항목이 없습니다 (상태 칩으로 범위를 넓혀 보세요)</div>
      ) : items.map((it) => (
        <Card key={`${it.id}|${it['상태'] || ''}|${it['최종_중문'] || ''}|${it['고객회신'] || ''}`} it={it} onAct={act} busy={busy} />
      ))}
    </div>
  );
}
