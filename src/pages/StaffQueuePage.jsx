import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { staffHeaders } from '../lib/staffKey';
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

const TABS = [
  { key: 'wait', label: '📤 발송대기' },
  { key: 'sent', label: '⏳ 봇 처리중' },
  { key: 'ok', label: '✅ 예약확정' },
  { key: 'chg', label: '🔄 변경·취소' },
  { key: 'all', label: '전체' },
];

function tabOf(it) {
  if (SENDABLE.includes(it.st)) return it.sent ? 'sent' : 'wait';
  if (it.st === '예약확정') return 'ok';
  return 'chg';   // 변경요청·변경확정·취소·노쇼·기타
}

function stClass(st) {
  if (SENDABLE.includes(st)) return 'req';
  if (st === '예약확정') return 'ok';
  if (st === '변경요청') return 'warn';
  if (CANCELLED.includes(st)) return 'bad';
  return 'etc';
}

export default function StaffQueuePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('wait');
  const [mgr, setMgr] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [modal, setModal] = useState(null);   // {kind:'modify'|'cancel', item}
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/staff-queue', { headers: staffHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `서버 오류 (${res.status})`);
      setData(body);
    } catch (e) {
      setError(e.message || '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      await load();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusyId('');
    }
  }, [load]);

  const counts = useMemo(() => {
    const c = { wait: 0, sent: 0, ok: 0, chg: 0, all: 0 };
    (data?.items || []).forEach((it) => {
      if (mgr && it.mgr !== mgr) return;
      c[tabOf(it)] += 1;
      c.all += 1;
    });
    return c;
  }, [data, mgr]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.items || [])
      .filter((it) => !mgr || it.mgr === mgr)
      .filter((it) => tab === 'all' || tabOf(it) === tab)
      .filter((it) => !q
        || it.store.toLowerCase().includes(q)
        || it.infls.toLowerCase().includes(q)
        || it.sid.toLowerCase().includes(q));
  }, [data, tab, mgr, search]);

  return (
    <div className="stq-root">
      <div className="stq-wrap">
        <header className="stq-head">
          <div className="stq-title">
            <span className="stq-dot" />
            <h1>업무·발송 큐</h1>
            <span className="stq-scope">예약입력_DB → 예약봇</span>
            {data?.who && <span className="stq-who">{data.who}</span>}
          </div>
          <div className="stq-nav">
            <Link className="stq-ghost" to="/staff">진도 보드</Link>
            <Link className="stq-ghost" to="/staff/new">＋ 예약입력</Link>
            <button className="stq-ghost" onClick={load} title="새로고침">⟳</button>
          </div>
        </header>

        <div className="stq-tools">
          <div className="stq-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? 'on' : ''}
                onClick={() => setTab(t.key)}
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
          <input
            className="stq-search"
            placeholder="매장·인플·# 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error && <div className="stq-error">{error}<button onClick={load}>다시 시도</button></div>}
        {loading && <div className="stq-loading">불러오는 중…</div>}
        {!loading && !error && items.length === 0 && (
          <div className="stq-empty">이 탭에 해당하는 건이 없습니다.</div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="stq-grid">
            {items.map((it) => (
              <QueueCard
                key={it.id}
                it={it}
                busy={busyId === it.id}
                onSend={() => {
                  if (window.confirm(`[${it.store}] 예약 메시지를 발송할까요?\n예약봇이 다음 폴링에서 카톡을 보냅니다.`)) {
                    act({ action: 'send', id: it.id }, '발송 대기열에 올렸습니다');
                  }
                }}
                onModify={() => setModal({ kind: 'modify', item: it })}
                onCancel={() => setModal({ kind: 'cancel', item: it })}
                onConfirmChange={() => {
                  if (window.confirm(`[${it.store}] 변경을 확정할까요?\n예약일시가 변경일시로 이관되고 카톡 발송은 없습니다.`)) {
                    act({ action: 'confirmChange', id: it.id }, '변경확정 처리했습니다');
                  }
                }}
                onRemove={() => {
                  if (window.confirm(`[${it.store}] 이 예약을 삭제할까요?\n발송된 적 없는 예약요청 건만 삭제되며, 분할된 진행 건도 함께 지워집니다.`)) {
                    act({ action: 'remove', id: it.id }, '삭제했습니다');
                  }
                }}
              />
            ))}
          </div>
        )}

        <footer className="stq-foot">
          전송 = 자동발송체크 ON → 예약봇이 카톡 발송 + 진행 건 캐스케이드 · 변경 = 변경일시 필수(없으면 봇이 차단) ·
          취소·노쇼는 여기서만 (고객 안내 발송 포함) · 삭제 = 발송 전 예약요청만
        </footer>
      </div>

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

function QueueCard({ it, busy, onSend, onModify, onCancel, onConfirmChange, onRemove }) {
  const [openMsg, setOpenMsg] = useState(false);
  const t = tabOf(it);
  const msg = (t === 'chg' && it.chgMsg && !it.chgMsg.includes('변경일시가 입력되지'))
    ? it.chgMsg : it.msg;
  return (
    <div className={`stq-card ${busy ? 'busy' : ''}`}>
      <div className="stq-card-h">
        <b>{it.store || '—'}</b>
        <span className={`stq-st ${stClass(it.st)}`}>{it.st}</span>
      </div>
      <div className="stq-meta">
        <span className="stq-id">{it.sid || '—'}</span>
        <span>{it.mgr}</span>
        <span>{it.ty}</span>
        <span>{it.mon}</span>
        {it.sent === 1 && SENDABLE.includes(it.st) && <span className="stq-sentflag">발송체크됨</span>}
      </div>
      <div className="stq-meta2">
        <span>🗓 {it.when || '—'}</span>
        {it.chgWhen && <span className="stq-chg">변경 {it.chgWhen}</span>}
        <span>👥 {it.pax !== '' ? `${it.pax}명` : '—'}{it.chgPax !== '' && it.chgPax !== it.pax ? `→${it.chgPax}` : ''}</span>
        <span>小{it.nx === '' ? 0 : it.nx} 大{it.nd === '' ? 0 : it.nd}</span>
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
        {t === 'wait' && (
          <>
            <button className="stq-primary" disabled={busy} onClick={onSend}>📤 전송</button>
            <button className="stq-b" disabled={busy} onClick={onModify}>✏️ 변경</button>
            <button className="stq-b warn" disabled={busy} onClick={onCancel}>🚫 취소·노쇼</button>
            <button className="stq-b bad" disabled={busy} onClick={onRemove}>🗑 삭제</button>
          </>
        )}
        {t === 'sent' && <span className="stq-hint">예약봇이 다음 폴링에서 처리합니다</span>}
        {t === 'ok' && (
          <>
            <button className="stq-b" disabled={busy} onClick={onModify}>✏️ 변경</button>
            <button className="stq-b warn" disabled={busy} onClick={onCancel}>🚫 취소·노쇼</button>
          </>
        )}
        {t === 'chg' && it.st === '변경요청' && it.sent === 0 && (
          <>
            <button className="stq-primary" disabled={busy} onClick={onConfirmChange}>✅ 변경확정</button>
            <button className="stq-b warn" disabled={busy} onClick={onCancel}>🚫 취소·노쇼</button>
          </>
        )}
        {t === 'chg' && it.st === '변경요청' && it.sent === 1 && (
          <span className="stq-hint">변경 안내 발송 대기 — 봇 처리 후 변경확정 하세요</span>
        )}
      </div>
    </div>
  );
}

/* ── 변경 모달 ── */
function ModifyModal({ item, busy, onClose, onSubmit }) {
  const [when, setWhen] = useState('');
  const [pax, setPax] = useState(item.pax || '');
  const [memo, setMemo] = useState('');
  return (
    <div className="stq-overlay" onClick={onClose}>
      <div className="stq-modal" onClick={(e) => e.stopPropagation()}>
        <h3>✏️ 예약 변경 — {item.store}</h3>
        <p className="stq-modal-sub">변경요청 상태로 바뀌고 변경 안내가 발송 대기열에 오릅니다.</p>
        <label>변경일시 (한국시각) *</label>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <label>변경인원 (그대로면 비워두기)</label>
        <input type="number" min="1" value={pax} onChange={(e) => setPax(e.target.value)} />
        <label>고객 전달 메모</label>
        <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        <div className="stq-modal-btns">
          <button
            className="stq-primary"
            disabled={busy || !when}
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
        <label>유형 *</label>
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
        <label>고객 전달 메모 (안내문에 붙습니다)</label>
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
