import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { staffHeaders } from '../lib/staffKey';
import StaffNav from '../components/StaffNav';
import InflRegModal from '../components/InflRegModal';
import './StaffResvPage.css';

/**
 * 예약입력 (/staff/new) — Phase 2.
 *
 * 예약입력_DB 에 팀 단위 1건을 만든다. 이후는 기존 Airtable 자동화 그대로 —
 * 참여 인플 수만큼 진행_DB_OLD 로 쪼개지고, 예약봇이 카톡을 보낸다.
 *
 * 오입력 방지 3중 가드:
 *   1) 매장을 고르면 전월·당월·익월 목표·실적 카드가 뜨고, 목표 미달인
 *      가장 이른 달이 정산월 기본값이 된다
 *   2) 앞 달이 미달인데 뒷 달을 고르면 / 이미 목표를 채운 달에 넣으면 confirm
 *   3) 서버가 그 매장×정산월 계약 존재를 검증 — 없으면 거부 (유령 예약 차단)
 */

/* ── 클립보드 ── */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
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

function CopyBtn({ label, text, title }) {
  const [ok, setOk] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      className={`srv-copy ${ok ? 'ok2' : ''}`}
      title={title}
      onClick={async () => {
        await copyText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >{ok ? '✓ 복사됨' : label}</button>
  );
}

/* ── 검색 드롭다운 (매장 단일 선택) ── */
function StorePicker({ stores, value, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const picked = stores.find((s) => s.id === value);
  const qq = q.trim().toLowerCase();
  const list = (qq
    ? stores.filter((s) => s.name.toLowerCase().includes(qq) || s.cn.toLowerCase().includes(qq))
    : stores
  ).slice(0, 60);

  return (
    <div className="srv-picker">
      <input
        value={open ? q : (picked ? `${picked.name}${picked.cn ? ` (${picked.cn})` : ''}` : q)}
        placeholder="매장명·중문명 검색"
        onFocus={() => { setOpen(true); setQ(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && (
        <div className="srv-dd">
          {list.length === 0 && <div className="srv-dd-empty">검색 결과 없음</div>}
          {list.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`srv-dd-it ${s.use ? '' : 'off'} ${s.id === value ? 'sel' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); onPick(s.id); setOpen(false); setQ(''); }}
            >
              {s.name}
              {s.cn && <i>{s.cn}</i>}
              {!s.use && <em>미사용</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 검색 드롭다운 (인플 다중 선택 + 칩) ── */
function InflPicker({ infls, sel, onChange }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const qq = q.trim().toLowerCase();
  const selSet = new Set(sel);
  const list = (qq
    ? infls.filter((i) => i.xid.toLowerCase().includes(qq) || i.wc.toLowerCase().includes(qq))
    : infls
  ).slice(0, 60);

  return (
    <div className="srv-picker">
      <input
        value={q}
        placeholder="XHS_ID·위챗ID 검색 후 선택 (여러 명 가능)"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && (
        <div className="srv-dd">
          {list.length === 0 && <div className="srv-dd-empty">검색 결과 없음</div>}
          {list.map((i) => (
            <button
              key={i.id}
              type="button"
              className={`srv-dd-it ${selSet.has(i.id) ? 'sel' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(selSet.has(i.id) ? sel.filter((x) => x !== i.id) : [...sel, i.id]);
              }}
            >
              {i.xid}
              {i.wc && <i>{i.wc}</i>}
              {selSet.has(i.id) && <em>✓</em>}
            </button>
          ))}
        </div>
      )}
      {sel.length > 0 && (
        <div className="srv-chips">
          {sel.map((id) => {
            const i = infls.find((x) => x.id === id);
            return (
              <span key={id} className="srv-chip">
                {i ? i.xid : id}
                <button type="button" onClick={() => onChange(sel.filter((x) => x !== id))}>×</button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── 월 카드 라벨 — 섭(체험_방문 rollup)은 취소·노쇼 제외 실적, 취소는 별도 표기 ── */
function monthState(c) {
  if (!c?.exists) return { cls: 'none', txt: '계약 없음' };
  if (c.tg > 0 && c.vis >= c.tg) return { cls: 'done', txt: `✅ 섭외완료 ${c.vis}/${c.tg}` };
  if (c.tg > 0) return { cls: 'todo', txt: `${c.tg - c.vis}건 남음` };
  return { cls: 'zero', txt: '목표 미설정' };
}

export default function StaffResvPage() {
  const [params] = useSearchParams();
  const preStore = params.get('store') || '';

  const [meta, setMeta] = useState(null);
  const [metaErr, setMetaErr] = useState('');
  const [guard, setGuard] = useState(null);
  const [guardBusy, setGuardBusy] = useState(false);

  const [store, setStore] = useState('');
  const [mgr, setMgr] = useState('');
  const [type, setType] = useState('체험');
  const [status, setStatus] = useState('예약요청');
  const [month, setMonth] = useState('');
  const [when, setWhen] = useState('');
  const [pax, setPax] = useState(1);
  const [nx, setNx] = useState(1);
  const [nxTouched, setNxTouched] = useState(false);
  const [nd, setNd] = useState(0);
  const [inflSel, setInflSel] = useState([]);
  const [lead, setLead] = useState('');
  const [paxMemo, setPaxMemo] = useState('');
  const [clientMemo, setClientMemo] = useState('');
  const [engNames, setEngNames] = useState('');
  const [note, setNote] = useState('');
  const [inflModal, setInflModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  /* meta 로드 */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/staff-resv?mode=meta', { headers: staffHeaders() });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `서버 오류 (${res.status})`);
        setMeta(body);
      } catch (e) {
        setMetaErr(e.message || '목록을 불러오지 못했습니다.');
      }
    })();
  }, []);

  /* 매장 선택 → 가드 로드 + 정산월 기본값 */
  const selectStore = useCallback(async (id) => {
    setStore(id);
    setGuard(null);
    setErr('');
    if (!id) return;
    setGuardBusy(true);
    try {
      const res = await fetch(`/api/staff-resv?store=${id}`, { headers: staffHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `서버 오류 (${res.status})`);
      setGuard(body);
      setMonth(body.suggest);
    } catch (e) {
      setErr(e.message || '매장 정보를 불러오지 못했습니다.');
    } finally {
      setGuardBusy(false);
    }
  }, []);

  /* ?store= 프리셀렉트 (진도 보드에서 진입) */
  useEffect(() => {
    if (meta && preStore && !store) selectStore(preStore);
  }, [meta, preStore, store, selectStore]);

  /* 총인원 바꾸면 小红 건수가 따라간다 (직접 만지기 전까지) */
  function changePax(v) {
    const p = Math.max(1, Math.round(Number(v) || 1));
    setPax(p);
    if (!nxTouched) setNx(p);
  }

  /* 참여 인플이 바뀌면 대표인플 정합 유지 */
  function changeInfls(next) {
    setInflSel(next);
    if (!next.includes(lead)) setLead(next[0] || '');
  }

  const chosen = guard?.byMonth?.[month];
  const canSubmit = !busy && store && mgr && month && chosen?.exists
    && when && pax >= 1 && inflSel.length >= 1;

  async function submit() {
    setErr('');
    if (!canSubmit) return;

    // 가드 2 — 앞 달 미달인데 뒷 달로 넣는가
    for (const m of guard.months) {
      if (m === month) break;
      const c = guard.byMonth[m];
      if (c?.exists && c.tg > 0 && c.vis < c.tg) {
        const ok = window.confirm(
          `${m} 목표가 ${c.tg - c.vis}건 미달인데 ${month} 정산월로 입력합니다.\n계속할까요?`
        );
        if (!ok) return;
        break;
      }
    }
    // 가드 2' — 이미 목표를 채운 달인가
    if (chosen.tg > 0 && chosen.vis >= chosen.tg) {
      const ok = window.confirm(
        `${month} 목표를 이미 채웠습니다 (섭외 ${chosen.vis}/${chosen.tg}).`
        + (chosen.add ? '\n이 매장은 추가OK(목표 초과 가능)입니다.' : '\n추가 가능 여부를 확인하세요.')
        + '\n계속할까요?'
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/staff-resv', {
        method: 'POST',
        headers: staffHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'create',
          store, mgr, type, status, month, when, pax, nx, nd,
          lead, infls: inflSel, paxMemo, clientMemo, engNames, note,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `저장 실패 (${res.status})`);
      setDone({ ...body, when, pax, infls: inflSel.length, status, sent: false });
    } catch (e) {
      setErr(e.message || '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  /* 접수 직후 바로 발송 — 방금 만든 레코드에 자동발송체크를 켠다 (발송 큐의 전송과 동일) */
  async function sendNow() {
    if (!done?.id) return;
    if (!window.confirm(`[${done.store}] 예약 메시지를 바로 발송할까요?\n예약봇이 다음 폴링(약 1분)에서 카톡을 보냅니다.`)) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/staff-queue', {
        method: 'POST',
        headers: staffHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'send', id: done.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `발송 요청 실패 (${res.status})`);
      setDone((d) => ({ ...d, sent: true }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  /* 같은 팀 · 다른 매장 — 같은 인플팀이 하루에 여러 매장을 도는 흐름 (Owner 2026-08-05).
     팀 구성(참여인플·대표·담당·유형·인원·건수·인원메모)과 일시는 유지, 매장만 새로 고른다. */
  function resetSameTeamNewStore() {
    setDone(null);
    setStore('');
    setGuard(null);
    setMonth('');
    setClientMemo('');
    setEngNames('');
    setNote('');
    setErr('');
  }

  function resetForNext() {
    setDone(null);
    setWhen('');
    setPax(1);
    setNx(1);
    setNxTouched(false);
    setNd(0);
    setInflSel([]);
    setLead('');
    setPaxMemo('');
    setClientMemo('');
    setEngNames('');
    setNote('');
    if (store) selectStore(store);   // 실적 카드 갱신
  }

  /* 신규 인플 등록 완료 → 목록에 넣고 바로 선택 */
  function onInflCreated(infl) {
    setMeta((prev) => ({ ...prev, infls: [infl, ...prev.infls] }));
    changeInfls([...inflSel, infl.id]);
    setInflModal(false);
  }

  const selInfls = (meta?.infls || []).filter((i) => inflSel.includes(i.id));

  return (
    <div className="srv-root">
      <div className="srv-wrap">
        <header className="srv-head">
          <div className="srv-title">
            <span className="srv-dot" />
            <h1>예약입력</h1>
            <span className="srv-scope">예약입력_DB → 자동 분할</span>
          </div>
          <div className="srv-nav">
            <StaffNav current="new" />
          </div>
        </header>

        {metaErr && <div className="srv-error">{metaErr}</div>}
        {!meta && !metaErr && <div className="srv-loading">목록 불러오는 중…</div>}

        {meta && done && (
          <div className="srv-done">
            <h2>✅ 예약이 접수되었습니다</h2>
            <p>
              <b>{done.store}</b> · {done.month} · {done.when.replace('T', ' ')} ·
              인원 {done.pax}명 · 인플 {done.infls}명
            </p>
            <p className="srv-done-sub">
              Airtable 자동화가 인플 수만큼 진행 건을 만듭니다. 발송은 아래 버튼 또는 예약발송 화면에서.
            </p>
            {err && <div className="srv-error">{err}</div>}
            <div className="srv-done-btns">
              {['예약요청', '긴급예약'].includes(done.status) && (
                done.sent
                  ? <span className="srv-sent-ok">✅ 발송 대기열에 올렸습니다 — 예약봇이 카톡을 보냅니다</span>
                  : (
                    <button type="button" className="srv-primary" disabled={busy} onClick={sendNow}>
                      {busy ? '처리 중…' : '📤 바로 발송'}
                    </button>
                  )
              )}
              <Link className="srv-ghost" to="/staff/queue">예약발송으로</Link>
              <button type="button" className="srv-ghost srv-team" onClick={resetSameTeamNewStore} title="인플·담당·인원은 그대로, 매장만 새로 선택">
                👥 같은 팀 · 다른 매장
              </button>
              <button type="button" className="srv-ghost" onClick={resetForNext}>같은 매장 하나 더</button>
              <button type="button" className="srv-ghost" onClick={() => { setDone(null); setStore(''); setGuard(null); resetForNext(); }}>다른 매장 입력</button>
              <Link className="srv-ghost" to="/staff">진도 보드로</Link>
            </div>
          </div>
        )}

        {meta && !done && (
          <div className="srv-grid">
            {/* ── 좌: 입력 폼 ── */}
            <div className="srv-form">
              <label className="srv-lb">매장 <b className="rq">*</b></label>
              <StorePicker stores={meta.stores} value={store} onPick={selectStore} />

              <label className="srv-lb">담당자 (예약_ID) <b className="rq">*</b></label>
              <div className="srv-seg">
                {meta.options.mgrs.map((m) => (
                  <button key={m} type="button" className={mgr === m ? 'on' : ''} onClick={() => setMgr(m)}>{m}</button>
                ))}
              </div>

              <div className="srv-row2">
                <div>
                  <label className="srv-lb">유형 <b className="rq">*</b></label>
                  <div className="srv-seg">
                    {meta.options.types.map((t) => (
                      <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="srv-lb">진행상태 <b className="rq">*</b></label>
                  <div className="srv-seg">
                    {meta.options.statuses.map((s) => (
                      <button key={s} type="button" className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="srv-lb">정산월 <b className="rq">*</b> <span className="srv-hint">오른쪽 월 카드를 눌러도 바뀝니다</span></label>
              <div className="srv-seg">
                {(guard?.months || []).map((m) => {
                  const st = monthState(guard.byMonth[m]);
                  return (
                    <button
                      key={m}
                      type="button"
                      className={`${month === m ? 'on' : ''} ${st.cls === 'none' ? 'dis' : ''}`}
                      onClick={() => setMonth(m)}
                    >{m}</button>
                  );
                })}
                {!guard && <span className="srv-hint">매장을 먼저 선택하세요</span>}
              </div>
              {month && chosen && !chosen.exists && (
                <div className="srv-warn">⚠️ {month} 계약이 없습니다 — 관리자 화면에서 계약을 먼저 만들어야 합니다.</div>
              )}

              <label className="srv-lb">예약일시 (한국시각) <b className="rq">*</b></label>
              <input
                type="datetime-local"
                className="srv-input"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />

              <div className="srv-row3">
                <div>
                  <label className="srv-lb">총인원 <b className="rq">*</b></label>
                  <input type="number" min="1" className="srv-input" value={pax}
                    onChange={(e) => changePax(e.target.value)} />
                </div>
                <div>
                  <label className="srv-lb">小红 건수</label>
                  <input type="number" min="0" className="srv-input" value={nx}
                    onChange={(e) => { setNxTouched(true); setNx(Math.max(0, Math.round(Number(e.target.value) || 0))); }} />
                </div>
                <div>
                  <label className="srv-lb">大众 건수</label>
                  <input type="number" min="0" className="srv-input" value={nd}
                    onChange={(e) => setNd(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
                </div>
              </div>

              <label className="srv-lb">
                참여 인플루언서 <b className="rq">*</b> <span className="srv-hint">선택한 수만큼 진행 건이 만들어집니다</span>
                <button type="button" className="srv-newinfl" onClick={() => setInflModal(true)}>＋ 신규 인플 등록</button>
              </label>
              <InflPicker infls={meta.infls} sel={inflSel} onChange={changeInfls} />

              {inflSel.length > 1 && (
                <>
                  <label className="srv-lb">대표인플 (예약 메시지 기준)</label>
                  <select className="srv-input" value={lead} onChange={(e) => setLead(e.target.value)}>
                    {selInfls.map((i) => <option key={i.id} value={i.id}>{i.xid}</option>)}
                  </select>
                </>
              )}

              <label className="srv-lb">인원 메모 <span className="srv-hint">(선택)</span></label>
              <input className="srv-input" value={paxMemo} placeholder="예) 성인 3 + 아동 1"
                onChange={(e) => setPaxMemo(e.target.value)} />

              <label className="srv-lb">고객 전달 메모 <span className="srv-hint">(선택 — 예약 메시지에 함께 전달)</span></label>
              <textarea className="srv-input" rows={2} value={clientMemo}
                placeholder="예약 메시지에 함께 전달할 내용"
                onChange={(e) => setClientMemo(e.target.value)} />

              <label className="srv-lb">예약 메모 <span className="srv-hint">(선택 — 내부 비고)</span></label>
              <input className="srv-input" value={note} placeholder="내부 메모 (비고)"
                onChange={(e) => setNote(e.target.value)} />

              {/* 지금은 안 쓰는 특수 요청 — 비슷한 비정형 요청 대비로 구석에 남겨둔다 */}
              <details className="srv-extra">
                <summary>특수 요청 항목 (영문이름 등)</summary>
                <label className="srv-lb">영문이름 <span className="srv-hint">과거 잠수함 여권 요건 — 양식: Abc + Def + Ghi</span></label>
                <input className="srv-input" value={engNames} placeholder="Abc + Def + Ghi"
                  onChange={(e) => setEngNames(e.target.value)} />
              </details>

              {err && <div className="srv-error">{err}</div>}

              <button type="button" className="srv-primary srv-submit" disabled={!canSubmit} onClick={submit}>
                {busy ? '저장 중…' : '예약 접수'}
              </button>
              {!canSubmit && !busy && (
                <div className="srv-hint srv-why">
                  {!store ? '매장을 선택하세요' : !mgr ? '담당자를 선택하세요'
                    : !chosen?.exists ? '선택한 정산월에 계약이 없습니다'
                      : !when ? '예약일시를 입력하세요'
                        : inflSel.length < 1 ? '참여 인플루언서를 선택하세요' : ''}
                </div>
              )}
            </div>

            {/* ── 우: 고객 정보 + 월별 목표·실적 ── */}
            <div className="srv-side">
              {!store && <div className="srv-side-empty">매장을 선택하면<br />운영 정보와 목표·실적이 여기 나옵니다.</div>}
              {guardBusy && <div className="srv-side-empty">불러오는 중…</div>}

              {guard && !guardBusy && (
                <>
                  <div className="srv-sinfo">
                    <div className="srv-sinfo-h">
                      <b>📍 {guard.info.name}</b>
                      {guard.info.cn && <span>({guard.info.cn})</span>}
                    </div>
                    <div className="srv-sinfo-grid">
                      <div><i>🕒 영업</i><span>{guard.info.open || '—'}</span></div>
                      <div><i>☕ 브레이크</i><span>{guard.info.brk || '—'}</span></div>
                      <div><i>🚫 휴무</i><span>{guard.info.rest || '무휴'}</span></div>
                      <div><i>⚡ 피크</i><span>{guard.info.peak || '—'}</span></div>
                      {guard.info.visitOk && <div><i>✅ 방문가능</i><span>{guard.info.visitOk}</span></div>}
                    </div>
                    {/* 항상 표시 — 값이 비어도 행이 보여야 "정보가 안 나온다"는 오해가 없다.
                        빈 값 = CS_DB 에 미입력 (제공내역은 119곳 중 51곳만 입력돼 있음) */}
                    <div className="srv-sinfo-blk">
                      <i>🎁 제공내역</i>
                      <span>{guard.info.give || <em className="srv-miss">— CS_DB 미입력</em>}</span>
                    </div>
                    <div className={`srv-sinfo-blk ${guard.info.warn ? 'warn' : ''}`}>
                      <i>⚠️ 섭외주의</i>
                      <span>{guard.info.warn || <em className="srv-miss">—</em>}</span>
                    </div>
                    {guard.info.note && (
                      <div className="srv-sinfo-blk"><i>비고</i><span>{guard.info.note}</span></div>
                    )}
                    {guard.info.script && (
                      <div className="srv-sinfo-blk script">
                        <i>📋 촬영대본 <CopyBtn label="복사" text={guard.info.script} title="촬영대본 복사" /></i>
                        <span>{guard.info.script}</span>
                      </div>
                    )}
                  </div>

                  <div className="srv-months">
                    {guard.months.map((m) => {
                      const c = guard.byMonth[m];
                      const st = monthState(c);
                      return (
                        <button
                          key={m}
                          type="button"
                          className={`srv-mcard ${st.cls} ${month === m ? 'on' : ''}`}
                          onClick={() => setMonth(m)}
                        >
                          <b>{m}</b>
                          {c?.exists
                            ? (
                              <>
                                <span className="srv-mnums">목 {c.tg} · 섭 {c.vis} · 업 {c.up}{c.cx > 0 ? ` · 취 ${c.cx}` : ''}</span>
                                <em>{st.txt}</em>
                                {c.add === 1 && <i className="srv-addok">추가OK</i>}
                              </>
                            )
                            : <em>계약 없음</em>}
                          {m === guard.suggest && <i className="srv-sug">권장</i>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {inflModal && meta && (
          <InflRegModal
            mgrs={meta.options.mgrs}
            defaultMgr={mgr}
            onClose={() => setInflModal(false)}
            onCreated={onInflCreated}
            onPickExisting={(dupId) => {
              if (!inflSel.includes(dupId)) changeInfls([...inflSel, dupId]);
              setInflModal(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* 신규 인플 등록 모달은 공용 컴포넌트 — src/components/InflRegModal.jsx
   (예약폼 원래 자리 + 인플 보드 + 메인 메뉴에서 같은 모달을 연다) */
