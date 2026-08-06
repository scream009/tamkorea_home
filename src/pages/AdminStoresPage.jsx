import React, { useState, useEffect, useCallback, useMemo } from 'react';
import QRCode from 'qrcode';
import { adminHeaders } from '../lib/adminKey';
import './AdminStoresPage.css';

/**
 * 고객사 등록·수정 (/admin/stores) — Softr ⑧ 대체.
 *
 * 좌: CS_DB 목록(검색·사용 필터) / 우: 등록·수정 폼 + 계약·목표 등록.
 * 신규 고객사도 저장 직후 같은 화면에서 첫 계약(업체명 링크 직결)을 만들 수 있다 —
 * 기존 /admin 의 ensureCampaign 은 기존 계약 복사 방식이라 신규 매장이 막혀 있었다.
 */

const EMPTY = {
  client: '', branch: '', cn: '', open: '', brk: '', peak: '', visitOk: '',
  give: '', script: '', warn: '', note: '', talkName: '', talkLink: '',
  rest: [], cls: '', region: '', area: '', use: 1,
};

/* 코드 → 사람 말 (Airtable 옵션은 코드만 있음 — 라벨이 틀리면 알려주세요, 여기만 고치면 됨) */
const CLS_LABELS = { FB: '요식 (F&B)', AT: '관광·액티비티', RT: '리테일·매장', HT: '숙박·호텔', ET: '엔터·체험' };
const REGION_LABELS = { J: '제주', S: '서울', B: '부산', E: '기타' };
const clsLabel = (c) => (c ? `${c} — ${CLS_LABELS[c] || ''}` : '');
const regionLabel = (r) => (r ? `${r} — ${REGION_LABELS[r] || ''}` : '');

function monthChoices() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const out = [];
  for (let d = -1; d <= 2; d += 1) {
    const t = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() + d, 1));
    out.push(`${t.getUTCFullYear()}. ${t.getUTCMonth() + 1}월`);
  }
  return out;
}

export default function AdminStoresPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [useFilter, setUseFilter] = useState('use');   // use | off | all
  const [sel, setSel] = useState(null);                // 선택된 store id ('' = 신규)
  const [tab, setTab] = useState('info');              // info | contract
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const [contracts, setContracts] = useState(null);
  const [cBusy, setCBusy] = useState(false);
  const [cForm, setCForm] = useState({ month: monthChoices()[1], infl: 0, exp: 0, rep: 0, budget: 0, by: '', memo: '' });

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/admin-stores', { headers: adminHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `서버 오류 (${res.status})`);
      setData(body);
    } catch (e) {
      setError(e.message || '불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDownloadQr = async (e, store) => {
    e.stopPropagation();
    if (!store.storeSignature) return;
    const url = `https://tamkorea.com/checkin?s=${store.id}&t=${store.storeSignature}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 800,
        margin: 4,
        color: { dark: '#000000', light: '#ffffff' }
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      const safeName = (store.client + '_' + store.branch).replace(/\s+/g, '_');
      a.download = `QR_${safeName}.png`;
      a.click();
    } catch (err) {
      console.error(err);
      flash('QR 다운로드에 실패했습니다.');
    }
  };

  const loadContracts = useCallback(async (storeId) => {
    setContracts(null);
    if (!storeId) return;
    try {
      const res = await fetch(`/api/admin-stores?store=${storeId}`, { headers: adminHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `계약 조회 실패 (${res.status})`);
      setContracts(body.contracts || []);
    } catch (e) {
      setContracts([]);
      setError(`계약 목록: ${e.message}`);   // 조용히 삼키면 "계약등록이 없다"로 보인다
    }
  }, []);

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2500); }

  function pick(s) {
    setSel(s.id);
    setForm({ ...EMPTY, ...s });
    setTab('contract');   // 월초 목표 등록이 주 업무 — 계약 탭을 먼저 보여준다
    loadContracts(s.id);
  }
  function pickNew() {
    setSel('');
    setForm(EMPTY);
    setContracts(null);
    setTab('info');
  }

  const list = useMemo(() => {
    if (!data) return [];
    const qq = q.trim().toLowerCase();
    return data.stores
      .filter((s) => (useFilter === 'all' ? true : useFilter === 'use' ? s.use : !s.use))
      .filter((s) => !qq
        || `${s.client} ${s.branch}`.toLowerCase().includes(qq)
        || s.cn.toLowerCase().includes(qq));
  }, [data, q, useFilter]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function saveStore() {
    setBusy(true);
    setError('');
    try {
      const payload = sel
        ? { action: 'update', id: sel, ...form }
        : { action: 'create', ...form };
      const res = await fetch('/api/admin-stores', {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `저장 실패 (${res.status})`);
      flash(sel ? '고객사 정보를 저장했습니다' : '고객사를 등록했습니다 — 계약·목표 탭에서 첫 계약을 등록하세요');
      if (!sel && body.id) {
        setSel(body.id);
        setTab('contract');
        loadContracts(body.id);
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveContract() {
    if (!sel) return;
    setCBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin-stores', {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'contract', storeId: sel, ...cForm }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `계약 저장 실패 (${res.status})`);
      flash(body.mode === 'created' ? `${cForm.month} 계약을 생성했습니다`
        : body.mode === 'updated' ? `${cForm.month} 목표를 수정했습니다`
          : '변경 사항이 없습니다');
      loadContracts(sel);
    } catch (e) {
      setError(e.message);
    } finally {
      setCBusy(false);
    }
  }

  const opts = data?.options;

  return (
    <div className="cst-root">
      <header className="cst-head">
        <h1>🏪 고객사 등록 <span className="cst-sub">CS_DB · 계약·목표</span></h1>
        <button className="cst-primary" onClick={pickNew}>＋ 신규 고객사</button>
      </header>

      {error && <div className="cst-error">{error}</div>}

      <div className="cst-grid">
        {/* ── 좌: 목록 ── */}
        <aside className="cst-list">
          <div className="cst-tools">
            <input placeholder="고객사·중문명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="cst-seg">
              {[['use', '사용'], ['off', '미사용'], ['all', '전체']].map(([v, l]) => (
                <button key={v} className={useFilter === v ? 'on' : ''} onClick={() => setUseFilter(v)}>{l}</button>
              ))}
            </div>
            <span className="cst-cnt">{list.length}곳</span>
          </div>
          <div className="cst-rows">
            {!data && !error && <div className="cst-empty">불러오는 중…</div>}
            {list.map((s) => (
              <div
                key={s.id}
                className={`cst-row ${sel === s.id ? 'on' : ''} ${s.use ? '' : 'off'}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => pick(s)}
              >
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <b>{s.client} {s.branch}</b>
                  <span>
                    {s.cn || '—'}
                    {s.region && ` · ${REGION_LABELS[s.region] || s.region}`}
                    {s.cls && ` · ${CLS_LABELS[s.cls] || s.cls}`}
                  </span>
                  {!s.use && <em>미사용</em>}
                </div>
                {s.use ? (
                  <button 
                    onClick={(e) => handleDownloadQr(e, s)}
                    style={{
                      background: 'none', border: '1px solid #d1d5db', borderRadius: '4px',
                      padding: '4px 8px', fontSize: '0.8rem', cursor: 'pointer',
                      flexShrink: 0, marginLeft: '8px'
                    }}
                    title="입장 체크인 QR 다운로드"
                  >
                    📷 QR 다운
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </aside>

        {/* ── 우: 폼 ── */}
        <section className="cst-form">
          <h2>
            {sel === null ? '왼쪽에서 고객사를 선택하거나 신규 등록'
              : sel === '' ? '신규 고객사 등록'
                : `${form.client} ${form.branch}`}
          </h2>

          {sel !== null && (
            <div className="cst-tabs">
              <button className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}>
                🏪 고객사 정보
              </button>
              <button
                className={tab === 'contract' ? 'on' : ''}
                disabled={!sel}
                title={sel ? '' : '고객사를 먼저 저장하세요'}
                onClick={() => setTab('contract')}
              >
                🎯 계약·목표 등록
              </button>
            </div>
          )}

          {sel !== null && tab === 'info' && (
            <>
              <div className="cst-sec">기본 정보</div>
              <div className="cst-r2">
                <label>고객사명 <b className="rq">*</b><input value={form.client} onChange={set('client')} /></label>
                <label>지점명 <b className="rq">*</b><input value={form.branch} onChange={set('branch')} /></label>
              </div>
              <div className="cst-r2">
                <label>중문명<input value={form.cn} onChange={set('cn')} placeholder="샤오홍슈 노출명" /></label>
                <label className="cst-check">
                  <input type="checkbox" checked={!!form.use}
                    onChange={(e) => setForm((f) => ({ ...f, use: e.target.checked ? 1 : 0 }))} />
                  사용 (해제 시 담당자 매장 목록 하단으로)
                </label>
              </div>
              <div className="cst-r3">
                <label>분류
                  <select value={form.cls} onChange={set('cls')}>
                    <option value="">—</option>
                    {opts?.cls.map((c) => <option key={c} value={c}>{clsLabel(c)}</option>)}
                  </select>
                </label>
                <label>지역
                  <select value={form.region} onChange={set('region')}>
                    <option value="">—</option>
                    {opts?.regions.map((c) => <option key={c} value={c}>{regionLabel(c)}</option>)}
                  </select>
                </label>
                <label>권역
                  <select value={form.area} onChange={set('area')}>
                    <option value="">—</option>
                    {opts?.areas.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>

              <div className="cst-sec">운영 정보 <span className="cst-hint">— 담당자 예약폼·ⓘ카드에 그대로 뜹니다</span></div>
              <div className="cst-r2">
                <label>영업시간 <b className="rq">*</b><input value={form.open} onChange={set('open')} placeholder="10:00 - 21:00" /></label>
                <label>브레이크타임 <b className="rq">*</b><input value={form.brk} onChange={set('brk')} placeholder="없으면 '-'" /></label>
              </div>
              <div className="cst-r2">
                <label>피크타임<input value={form.peak} onChange={set('peak')} /></label>
                <label>방문가능시간<input value={form.visitOk} onChange={set('visitOk')} /></label>
              </div>
              <label className="cst-block">정기휴무
                <div className="cst-days">
                  {opts?.rest.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={form.rest.includes(d) ? 'on' : ''}
                      onClick={() => setForm((f) => ({
                        ...f,
                        rest: f.rest.includes(d) ? f.rest.filter((x) => x !== d) : [...f.rest, d],
                      }))}
                    >{d}</button>
                  ))}
                </div>
              </label>

              <div className="cst-sec">섭외 정보</div>
              <label className="cst-block">제공내역<textarea rows={2} value={form.give} onChange={set('give')} /></label>
              <label className="cst-block">촬영대본 (拍摄剧本)<textarea rows={4} value={form.script} onChange={set('script')} /></label>
              <label className="cst-block">섭외주의사항<textarea rows={2} value={form.warn} onChange={set('warn')} /></label>
              <div className="cst-r2">
                <label>톡방명<input value={form.talkName} onChange={set('talkName')} /></label>
                <label>톡방링크<input value={form.talkLink} onChange={set('talkLink')} placeholder="https://…" /></label>
              </div>
              <label className="cst-block">비고<input value={form.note} onChange={set('note')} /></label>

              <button className="cst-primary cst-save" disabled={busy} onClick={saveStore}>
                {busy ? '저장 중…' : sel ? '고객사 정보 저장' : '고객사 등록'}
              </button>
            </>
          )}

          {/* ── 계약·목표 탭 ── */}
          {sel !== null && tab === 'contract' && (
            <>
              {sel && (
                <>
                  <div className="cst-sec">계약·목표 <span className="cst-hint">— Campaign_DB. 있으면 수정(원본·이력 보존), 없으면 생성</span></div>
                  {contracts === null && <div className="cst-empty">계약 불러오는 중…</div>}
                  {contracts && contracts.length > 0 && (
                    <table className="cst-ctable">
                      <thead>
                        <tr><th>계약월</th><th>인플</th><th>체험</th><th>기자</th><th className="num">총예산</th><th>최근 수정</th></tr>
                      </thead>
                      <tbody>
                        {contracts.map((c) => (
                          <tr
                            key={c.id}
                            className={c.month === cForm.month ? 'on' : ''}
                            onClick={() => setCForm((f) => ({
                              ...f, month: c.month, infl: c.infl, exp: c.exp, rep: c.rep, budget: c.budget,
                            }))}
                            title="클릭하면 아래 폼에 불러옵니다"
                          >
                            <td>{c.month}{!c.ct && <em className="cst-ghost-tag">유형없음</em>}</td>
                            <td>{c.infl} <s>/{c.inflVis}</s></td>
                            <td>{c.exp} <s>/{c.expVis}</s></td>
                            <td>{c.rep} <s>/{c.repDone}</s></td>
                            <td className="num">{c.budget.toLocaleString()}</td>
                            <td className="hist">{c.hist || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {contracts && contracts.length === 0 && (
                    <div className="cst-empty">계약이 없습니다 — 아래에서 첫 계약을 등록하세요.</div>
                  )}

                  <div className="cst-r3">
                    <label>계약월 <b className="rq">*</b>
                      <select value={cForm.month} onChange={(e) => setCForm((f) => ({ ...f, month: e.target.value }))}>
                        {monthChoices().map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                    <label>수정자 <b className="rq">*</b>
                      <select value={cForm.by} onChange={(e) => setCForm((f) => ({ ...f, by: e.target.value }))}>
                        <option value="">선택</option>
                        {opts?.editors.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </label>
                    <label>총예산 (원)
                      <input type="number" min="0" step="10000" value={cForm.budget}
                        onChange={(e) => setCForm((f) => ({ ...f, budget: e.target.value }))} />
                    </label>
                  </div>
                  <div className="cst-r3">
                    {[['infl', '인플 목표'], ['exp', '체험 목표'], ['rep', '기자 목표']].map(([k, l]) => (
                      <label key={k}>{l}
                        <input type="number" min="0" value={cForm[k]}
                          onChange={(e) => setCForm((f) => ({ ...f, [k]: e.target.value }))} />
                      </label>
                    ))}
                  </div>
                  <label className="cst-block">메모 (이력에 남음)
                    <input value={cForm.memo} onChange={(e) => setCForm((f) => ({ ...f, memo: e.target.value }))} />
                  </label>
                  <button className="cst-primary" disabled={cBusy || !cForm.by} onClick={saveContract}>
                    {cBusy ? '저장 중…' : '계약·목표 저장'}
                  </button>
                  {!cForm.by && <span className="cst-hint"> 수정자를 선택해야 저장됩니다</span>}
                </>
              )}
            </>
          )}
        </section>
      </div>

      {toast && <div className="cst-toast">{toast}</div>}
    </div>
  );
}
