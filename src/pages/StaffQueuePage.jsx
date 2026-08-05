import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { staffHeaders } from '../lib/staffKey';
import StaffNav from '../components/StaffNav';
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
  { key: 'chgReq', label: '🔄 변경요청' },
  { key: 'ok', label: '✅ 확정·진행' },
  { key: 'cancel', label: '🚫 취소·노쇼' },
  { key: 'all', label: '전체' },
];

function tabOf(it) {
  if (SENDABLE.includes(it.st)) return it.sent ? 'sent' : 'wait';
  if (it.st === '변경요청') return 'chgReq';
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
    const c = { wait: 0, sent: 0, chgReq: 0, ok: 0, cancel: 0, all: 0 };
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

  /* 카드·행이 같은 액션을 쓴다 */
  function handlersFor(it) {
    return {
      send: () => {
        if (window.confirm(`[${it.store}] 예약 메시지를 발송할까요?\n예약봇이 다음 폴링에서 카톡을 보냅니다.`)) {
          act({ action: 'send', id: it.id }, '발송 대기열에 올렸습니다');
        }
      },
      edit: () => setModal({ kind: 'edit', item: it }),
      modify: () => setModal({ kind: 'modify', item: it }),
      cancel: () => setModal({ kind: 'cancel', item: it }),
      confirmChange: () => {
        // 참고: 봇은 변경 안내를 발송하면 자동으로 변경확정까지 처리한다(V6.3).
        // 이 버튼은 "안내 발송 없이" 확정만 할 때 쓴다.
        if (window.confirm(
          `[${it.store}] 변경 안내 발송 없이 확정 처리할까요?\n`
          + `예약일시는 원본 유지, 변경일시가 변경 후 시각으로 보관됩니다.`
        )) {
          act({ action: 'confirmChange', id: it.id }, '변경확정 처리했습니다 (발송 없음)');
        }
      },
      remove: () => {
        if (window.confirm(`[${it.store}] 이 예약을 삭제할까요?\n발송된 적 없는 예약요청 건만 삭제되며, 분할된 진행 건도 함께 지워집니다.`)) {
          act({ action: 'remove', id: it.id }, '삭제했습니다');
        }
      },
      unsend: () => {
        if (window.confirm(
          `[${it.store}] 발송 대기를 취소하고 되돌릴까요?\n\n`
          + `⚠️ 봇이 방금 집어간 직후라면 취소가 무시되고 발송될 수 있습니다.\n`
          + `취소 후 이 건이 '확정·진행'으로 넘어가는지 잠시 확인하세요.`
        )) {
          act({ action: 'unsend', id: it.id }, '발송 대기에서 내렸습니다 — 확정·진행 탭으로 넘어가지 않는지 확인하세요');
        }
      },
    };
  }

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
            <StaffNav current="queue" />
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
          // 발송·처리 대기 탭 = 발송문 중심 카드 / 확정·진행·취소·전체 = 컴팩트 행
          (tab === 'ok' || tab === 'cancel' || tab === 'all')
            ? (
              <div className="stq-rows">
                {items.map((it) => (
                  <ListRow key={it.id} it={it} busy={busyId === it.id} h={handlersFor(it)} />
                ))}
              </div>
            )
            : (
              <div className="stq-grid">
                {items.map((it) => (
                  <QueueCard key={it.id} it={it} busy={busyId === it.id} h={handlersFor(it)} />
                ))}
              </div>
            )
        )}

        <footer className="stq-foot">
          전송 = 자동발송체크 ON → 예약봇이 카톡 발송 + 진행 건 캐스케이드 · 변경 = 변경일시 필수(없으면 봇이 차단) ·
          취소·노쇼는 여기서만 (고객 안내 발송 포함) · 삭제 = 발송 전 예약요청만
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

function QueueCard({ it, busy, h }) {
  const [openMsg, setOpenMsg] = useState(false);
  const t = tabOf(it);
  const msg = ((t === 'chgReq' || t === 'cancel') && it.chgMsg && !it.chgMsg.includes('변경일시가 입력되지'))
    ? it.chgMsg : it.msg;
  return (
    <div className={`stq-card ${busy ? 'busy' : ''} ${t === 'sent' ? 'stuck' : ''}`}>
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
        <ActionButtons t={t} it={it} busy={busy} h={h} />
      </div>
    </div>
  );
}

/* 상태별 액션 — 발송 전(wait)엔 변경·취소가 아니라 **전체 수정·삭제**가 맞다:
   고객에게 나간 적 없으므로 안내 발송이 필요 없다 (Owner 확정 2026-08-05) */
function ActionButtons({ t, it, busy, h }) {
  if (t === 'wait') {
    return (
      <>
        <button className="stq-primary" disabled={busy} onClick={h.send}>📤 전송</button>
        <button className="stq-b" disabled={busy} onClick={h.edit}>✏️ 수정</button>
        <button className="stq-b bad" disabled={busy} onClick={h.remove}>🗑 삭제</button>
      </>
    );
  }
  if (t === 'sent') {
    return (
      <>
        <span className="stq-stuck-hint">
          봇이 처리하면 <b>예약확정</b>으로 바뀝니다. 여기 오래 머물면
          예약봇(PC 앱) 실행 여부를 확인하세요.
        </span>
        <button className="stq-b" disabled={busy} onClick={h.unsend}>↩ 발송취소 (대기로)</button>
      </>
    );
  }
  if (t === 'ok') {
    return (
      <>
        <button className="stq-b" disabled={busy} onClick={h.modify}>✏️ 변경</button>
        <button className="stq-b warn" disabled={busy} onClick={h.cancel}>🚫 취소·노쇼</button>
      </>
    );
  }
  if (t === 'chgReq' && it.sent === 0) {
    return (
      <>
        <button className="stq-primary" disabled={busy} onClick={h.confirmChange}>✅ 변경확정</button>
        <button className="stq-b warn" disabled={busy} onClick={h.cancel}>🚫 취소·노쇼</button>
      </>
    );
  }
  if (t === 'chgReq' && it.sent === 1) {
    return (
      <>
        <span className="stq-stuck-hint">
          변경 안내 발송 대기 — 봇이 발송하면 <b>자동으로 변경확정</b>까지 처리합니다
        </span>
        <button className="stq-b" disabled={busy} onClick={h.unsend}>↩ 발송취소</button>
      </>
    );
  }
  return null;   // cancel(취소·노쇼) — 액션 없음
}

/* 컴팩트 행 — 확정·진행처럼 "볼 일 많고 액션 적은" 상태용. 클릭하면 발송문 펼침 */
function ListRow({ it, busy, h }) {
  const [open, setOpen] = useState(false);
  const t = tabOf(it);
  const msg = ((t === 'chgReq' || t === 'cancel') && it.chgMsg && !it.chgMsg.includes('변경일시가 입력되지'))
    ? it.chgMsg : it.msg;
  return (
    <div className={`stq-row-wrap ${busy ? 'busy' : ''}`}>
      <div className="stq-row" onClick={() => setOpen((v) => !v)}>
        <span className={`stq-st ${stClass(it.st)}`}>{it.st}</span>
        <b className="stq-row-store">{it.store || '—'}</b>
        <span className="stq-row-id">{it.sid}</span>
        <span className="stq-row-meta">{it.mgr} · {it.ty} · {it.mon}</span>
        <span className="stq-row-when">
          🗓 {it.when || '—'}
          {it.chgWhen && <i className="stq-chg"> 변경 {it.chgWhen}</i>}
        </span>
        <span className="stq-row-cnt">
          {it.pax !== '' ? `${it.pax}명` : '—'} · 小{it.nx === '' ? 0 : it.nx} 大{it.nd === '' ? 0 : it.nd}
        </span>
        <span className="stq-row-btns" onClick={(e) => e.stopPropagation()}>
          <ActionButtons t={t} it={it} busy={busy} h={h} />
        </span>
      </div>
      {open && (
        <div className="stq-row-detail">
          {it.infls && <div className="stq-infls">{it.infls}</div>}
          {it.clientMemo && <div className="stq-cmemo">📨 {it.clientMemo}</div>}
          {msg && <pre className="stq-row-msg">{msg}</pre>}
        </div>
      )}
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
        <label>예약일시 (한국시각)</label>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
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
  const [when, setWhen] = useState('');
  const [pax, setPax] = useState(item.pax || '');
  const [memo, setMemo] = useState('');
  return (
    <div className="stq-overlay" onClick={onClose}>
      <div className="stq-modal" onClick={(e) => e.stopPropagation()}>
        <h3>✏️ 예약 변경 — {item.store}</h3>
        <p className="stq-modal-sub">변경요청 상태로 바뀌고 변경 안내가 발송 대기열에 오릅니다.</p>
        <label>변경일시 (한국시각) <b className="rq">*</b></label>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <label>변경인원 <span className="stq-opt">(선택 — 그대로면 비워두기)</span></label>
        <input type="number" min="1" value={pax} onChange={(e) => setPax(e.target.value)} />
        <label>고객 전달 메모 <span className="stq-opt">(선택)</span></label>
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
