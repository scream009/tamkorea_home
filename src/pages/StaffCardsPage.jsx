import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { staffHeaders } from '../lib/staffKey';
import StaffNav from '../components/StaffNav';
import './StaffCardsPage.css';

/**
 * 모집카드 관리 (/staff/cards) — 카드 게시·조기마감·내리기·수정.
 *
 * 카드 1장 = 모집 라운드. 「새 라운드 게시」는 직전 라운드 값을 전부 프리필하고
 * 바뀌는 것만 고치게 한다. 제공내역 칸만 노란 배경 — 계약마다 바뀌는 자리라
 * 반드시 눈으로 확인하고 넘어가야 한다.
 */

const ST = {
  recruiting: { label: '모집 중', cls: 'r' },
  closed: { label: '조기 마감', cls: 'c' },
  uploading: { label: '방문·업로드', cls: 'u' },
  completed: { label: '완료', cls: 'd' },
  hidden: { label: '내려감', cls: 'h' },
};

function fmt(d) {
  return d ? String(d).slice(5, 10).replace('-', '.') : '—';
}

function addDays(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function StaffCardsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState('');
  const [busy, setBusy] = useState('');
  const [modal, setModal] = useState(null);   // {source: round, form: {...}}

  const load = useCallback(async () => {
    setError('');
    try {
      const resp = await fetch('/api/staff-cards', { headers: staffHeaders() });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
      const d = await resp.json();
      setData(d);
      setSel((prev) => (d.stores.some((s) => s.store_key === prev) ? prev : (d.stores[0]?.store_key || '')));
    } catch (e) {
      setError(e.message || '불러오기 실패');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const store = useMemo(
    () => (data ? data.stores.find((s) => s.store_key === sel) : null),
    [data, sel],
  );

  async function post(body, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return false;
    setBusy(body.id || 'x');
    try {
      const resp = await fetch('/api/staff-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...staffHeaders() },
        body: JSON.stringify(body),
      });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d.error || `HTTP ${resp.status}`);
      await load();
      return true;
    } catch (e) {
      setError(e.message || '처리 실패');
      return false;
    } finally {
      setBusy('');
    }
  }

  function openPublish(source) {
    const today = new Date().toISOString().slice(0, 10);
    setModal({
      source,
      form: {
        recruit_start: today,
        recruit_end: addDays(today, 7),
        announce_date: addDays(today, 8),
        upload_start: addDays(today, 8),
        upload_end: addDays(today, 22),
        applicants_max: source.max || 5,
        provisions_zh: source.provisions_zh || '',
        provisions_kr: source.provisions_kr || '',
        requirements_zh: source.requirements_zh || '',
      },
    });
  }

  async function submitPublish() {
    const ok = await post({ action: 'publish', id: modal.source.id, overrides: modal.form });
    if (ok) setModal(null);
  }

  const f = modal?.form;
  const setF = (k, v) => setModal((m) => ({ ...m, form: { ...m.form, [k]: v } }));
  const provisionsBad = f && (!f.provisions_zh.trim()
    || ['미제공', '확인필요', '실장'].some((m) => f.provisions_zh.includes(m)));

  return (
    <div className="scard-root">
      <div className="scard-wrap">
        <StaffNav current="cards" />
        <header className="scard-head">
          <h1>모집카드 관리
            <button type="button" className="scard-ghost scard-sitelink"
              title="사이트 전체 홍보 링크 (내 실적으로 기록)"
              onClick={async () => {
                const me = (data && data.who) || 'staff';
                const url = `https://campaign.tamkorea.com/?ref=${encodeURIComponent(me)}`;
                try { await navigator.clipboard.writeText(url); window.alert(`사이트 홍보링크 복사됨 (담당 ${me})`); }
                catch { window.prompt('복사:', url); }
              }}
            >🔗 사이트 홍보링크</button>
          </h1>
          <p className="scard-sub">
            카드 1장 = 모집 라운드. 새 모집은 직전 라운드를 복제해 올립니다 —
            같은 매장의 카드가 다른 기간으로 여러 장 있을 수 있습니다.
          </p>
        </header>

        {error && <div className="scard-err">{error} <button type="button" onClick={load}>다시 시도</button></div>}
        {!data && !error && <div className="scard-loading">불러오는 중…</div>}

        {data && (
          <div className="scard-body">
            <aside className="scard-stores">
              {data.stores.map((s) => (
                <button
                  type="button"
                  key={s.store_key}
                  className={`scard-store ${sel === s.store_key ? 'on' : ''}`}
                  onClick={() => setSel(s.store_key)}
                >
                  <span className="scard-store-title">{s.title}</span>
                  <span className="scard-store-meta">
                    {s.recruiting > 0
                      ? <b className="live">모집 중 {s.recruiting}</b>
                      : <span>게시 없음</span>}
                    <span> · 라운드 {s.rounds.length}</span>
                    {s.provisionsMissing && <b className="miss"> · 제공내역 없음</b>}
                  </span>
                </button>
              ))}
            </aside>

            <main className="scard-main">
              {store && (
                <>
                  <div className="scard-toolbar">
                    <h2>{store.title} <span className="scard-zh">{store.title_zh}</span></h2>
                    <button
                      type="button"
                      className="scard-new"
                      onClick={() => openPublish(store.rounds[0])}
                    >＋ 새 라운드 게시</button>
                  </div>

                  {store.rounds.map((r) => (
                    <div key={r.id} className={`scard-round st-${ST[r.status]?.cls || 'h'}`}>
                      <div className="scard-round-head">
                        <b>{r.label}</b>
                        <span className={`scard-badge st-${ST[r.status]?.cls || 'h'}`}>
                          {ST[r.status]?.label || r.status}
                        </span>
                        <span className="scard-mono">{r.slug}</span>
                      </div>
                      <div className="scard-round-body">
                        <span>모집 {fmt(r.recruit_start)}~{fmt(r.recruit_end)}</span>
                        <span>발표 {fmt(r.announce_date)}</span>
                        <span>방문 {fmt(r.upload_start)}~{fmt(r.upload_end)}</span>
                        <span className="scard-cnt">신청 <b>{r.current}</b>/{r.max}</span>
                      </div>
                      {r.provisionsMissing && (
                        <div className="scard-warn">🔴 제공내역 미확정 — 이 라운드 복제 게시는 막힙니다</div>
                      )}
                      <div className="scard-actions">
                        {r.status === 'recruiting' && (
                          <button type="button" className="scard-no" disabled={busy === r.id}
                            onClick={() => post({ action: 'close', id: r.id },
                              `${r.label} — 조기 마감할까요?\n(현재 신청 ${r.current}명 · 「모집 마감」 뱃지로 잠시 남습니다)`)}
                          >조기 마감</button>
                        )}
                        {r.status === 'closed' && (
                          <button type="button" className="scard-ok" disabled={busy === r.id}
                            onClick={() => post({ action: 'reopen', id: r.id }, `${r.label} — 모집을 다시 열까요?`)}
                          >다시 열기</button>
                        )}
                        {r.status !== 'hidden' && (
                          <button type="button" className="scard-ghost" disabled={busy === r.id}
                            onClick={() => post({ action: 'hide', id: r.id },
                              `${r.label} — 사이트에서 완전히 내릴까요?`)}
                          >내리기</button>
                        )}
                        {r.status === 'hidden' && (
                          <button type="button" className="scard-ok" disabled={busy === r.id}
                            onClick={() => post({ action: 'show', id: r.id }, `${r.label} — 모집 중으로 올릴까요?`)}
                          >올리기</button>
                        )}
                        {r.status === 'recruiting' && (
                          <button type="button" className="scard-ok"
                            title="이 카드의 홍보 링크 — 지원서에 내 실적으로 자동 기록됩니다"
                            onClick={async () => {
                              const me = (data && data.who) || 'staff';
                              const url = `https://campaign.tamkorea.com/campaign/${r.slug}?ref=${encodeURIComponent(me)}`;
                              try { await navigator.clipboard.writeText(url); window.alert(`홍보링크 복사됨 (담당 ${me})`); }
                              catch { window.prompt('복사:', url); }
                            }}
                          >홍보링크</button>
                        )}
                        <a className="scard-ghost scard-link" href={`/staff/casting`}>선발 화면</a>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </main>
          </div>
        )}

        {modal && (
          <div className="scard-modal-bg" onClick={() => setModal(null)}>
            <div className="scard-modal" onClick={(e) => e.stopPropagation()}>
              <h3>새 라운드 게시 — {store?.title}</h3>
              <p className="scard-sub">직전 라운드({modal.source.label}) 값이 채워져 있습니다. 바뀌는 것만 고치세요.</p>

              <div className="scard-grid">
                <label>모집 시작<input type="date" value={f.recruit_start} onChange={(e) => setF('recruit_start', e.target.value)} /></label>
                <label>모집 마감<input type="date" value={f.recruit_end} onChange={(e) => setF('recruit_end', e.target.value)} /></label>
                <label>발표일<input type="date" value={f.announce_date} onChange={(e) => setF('announce_date', e.target.value)} /></label>
                <label>모집 인원<input type="number" min="1" value={f.applicants_max} onChange={(e) => setF('applicants_max', Number(e.target.value))} /></label>
                <label>방문 시작<input type="date" value={f.upload_start} onChange={(e) => setF('upload_start', e.target.value)} /></label>
                <label>방문 마감<input type="date" value={f.upload_end} onChange={(e) => setF('upload_end', e.target.value)} /></label>
              </div>

              <label className="scard-prov">제공내역 (중문) — 🔴 계약마다 바뀝니다. 반드시 확인
                <textarea rows="2" value={f.provisions_zh} onChange={(e) => setF('provisions_zh', e.target.value)} />
              </label>
              <label>제공내역 (국문 병기)
                <textarea rows="2" value={f.provisions_kr} onChange={(e) => setF('provisions_kr', e.target.value)} />
              </label>
              <label>자격요건 (중문 · 줄바꿈 구분)
                <textarea rows="3" value={f.requirements_zh} onChange={(e) => setF('requirements_zh', e.target.value)} />
              </label>

              {provisionsBad && (
                <div className="scard-warn">🔴 제공내역이 비었거나 사내 표기(「실장 미제공」 등)가 남아 있어 게시할 수 없습니다.</div>
              )}

              <div className="scard-modal-actions">
                <button type="button" className="scard-ghost" onClick={() => setModal(null)}>취소</button>
                <button type="button" className="scard-ok" disabled={provisionsBad || busy}
                  onClick={submitPublish}>게시</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
