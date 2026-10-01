import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import './PressBulk.css';

/**
 * 기자단 링크 대량등록 — 화면 본체. 입구 두 곳이 같은 화면을 쓴다:
 *   /admin/press (AdminPressPage — 관리자 키)  ·  /staff/press (StaffPressPage — 담당자 키)
 * 입구가 넘기는 것: apiPath(게이트가 다른 API), headers(키 헤더 함수), variant(셸 배경 차이).
 *
 * ?c=<계약ID> 로 들어오면 그 고객사·계약을 미리 고른다 — 진도 보드의 '＋링크'가 쓴다.
 * 보드에서 특정 칸(고객사×월)을 누른 것 자체가 월 선택이라 기본값 금지 원칙과 부딪히지 않는다.
 *
 * 실장님께 받은 링크 덩어리를 **그대로** 붙여넣는다. 제목 줄·빈 줄·공백·\xa0 는 서버가 걸러낸다.
 * 등록 전에 반드시 '확인'을 거친다 — 서버가 줄마다 신규 / 입력 안 중복 / DB에 이미 있음 /
 * 게시물 아님 을 판정하고, 등록 버튼은 그 판정의 '신규'만 만든다(서버가 다시 판정).
 *
 * 계약(정산월)은 기본 선택을 두지 않는다 — 월 착오(중문갈치 6월분이 8월로 들어감)가
 * 실측된 사고라, 고르는 행위 자체를 요구한다.
 */

const STATUS = {
  new: { label: '신규', cls: 'ok' },
  dupPaste: { label: '입력 중복', cls: 'warn' },
  dupDb: { label: '이미 있음', cls: 'bad' },
  bad: { label: '제외', cls: 'bad' },
};

// 서버(api/_press.js extractLinks)와 같은 규칙 — 입력 중 '몇 개 인식' 힌트용
const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%]+/g;
function countLinks(text) {
  const s = String(text || '').replace(/[\s\u200b-\u200d]/g, ' ');
  let n = 0;
  for (const m of s.matchAll(URL_RE)) n += m[0].split(/(?=https?:\/\/)/).filter((u) => u.length > 10).length;
  return n;
}

async function call(apiPath, headers, method, body) {
  const res = await fetch(apiPath, {
    method,
    headers: headers(body ? { 'Content-Type': 'application/json' } : undefined),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `서버 오류 (${res.status})`), { data });
  return data;
}

/** 본문에서 링크 하나를 지운다 — 뒤에 URL 문자가 이어지면(더 긴 다른 링크) 건드리지 않는다 */
function removeLink(text, raw) {
  const esc = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`${esc}(?![A-Za-z0-9\\-._~:/?#\\[\\]@!$&*+,;=%])`, 'g'), ' ');
}

/** "모찌롱 신라면세점 · 2026. 7월 — 08-31, 09-19, 09-24 등록 (총 3번)" — 같은 계약은 한 덩어리로 */
function whereText(list, total) {
  const g = new Map();
  list.forEach((w) => {
    const k = `${w.client}${w.branch ? ` ${w.branch}` : ''} · ${w.month || '월 없음'}`;
    if (!g.has(k)) g.set(k, []);
    if (w.at) g.get(k).push(w.at.slice(5));
  });
  const body = [...g].map(([k, ds]) => `${k}${ds.length ? ` — ${ds.join(', ')} 등록` : ''}`).join(' / ');
  return total > 1 ? `${body} (총 ${total}번)` : body;
}

const REC_RE = /^rec[A-Za-z0-9]{14}$/;
// 서버 등록 태그 `[기자 대량등록 2026-10-01 14:20 who]` → 등록된 링크 목록의 묶음 키(api/_press.js registered 와 같은 규칙)
const TAG_RE = /\[기자 대량등록 (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) ([^\]]*)\]/;
const groupOfTag = (tag) => { const m = TAG_RE.exec(String(tag || '')); return m ? `bulk:${m[1]} ${m[2]}` : ''; };

/** 새 탭으로 여는 링크 — 눌리는 링크로 보이게 밑줄·↗ (담당자가 텍스트로 알고 안 눌렀다, 2026-10-01) */
function Ext({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title="새 탭에서 열기">
      <span>{children}</span><i aria-hidden="true">↗</i>
    </a>
  );
}

export default function PressBulk({ apiPath, headers, variant = 'admin' }) {
  const [params] = useSearchParams();
  const want = REC_RE.test(params.get('c') || '') ? params.get('c') : '';
  const picked = useRef(false);                      // ?c= 는 처음 한 번만 — 등록 후 새로 읽을 때 되돌리지 않는다
  const api = useCallback((method, body) => call(apiPath, headers, method, body), [apiPath, headers]);

  const [stores, setStores] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [q, setQ] = useState('');
  const [storeId, setStoreId] = useState('');
  const [campId, setCampId] = useState('');
  const [text, setText] = useState('');
  const [excluded, setExcluded] = useState([]);    // 사용자가 × 로 뺀 원문 링크
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');             // '' | 'preview' | 'create'
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const [reg, setReg] = useState(null);             // 이 계약에 이미 등록된 링크 { campaignId, items }
  const [regErr, setRegErr] = useState('');
  const regWant = useRef('');                        // 계약을 빨리 바꿔 누르면 늦게 온 옛 응답을 버린다

  const load = useCallback(async () => {
    setLoadErr('');
    try {
      const list = (await api('GET')).stores || [];
      setStores(list);
      if (want && !picked.current) {
        picked.current = true;
        const s = list.find((x) => x.contracts.some((c) => c.id === want));
        if (s) { setStoreId(s.id); setCampId(want); setQ(s.client); }
      }
    } catch (e) { setLoadErr(e.message); }
  }, [api, want]);
  useEffect(() => { load(); }, [load]);
  // 진도 보드에서 '＋링크'로 넘어오면 보드의 스크롤 위치가 남아 제목·안내가 가려진다 — 맨 위에서 시작
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const store = useMemo(() => (stores || []).find((s) => s.id === storeId) || null, [stores, storeId]);
  const camp = useMemo(() => (store?.contracts || []).find((c) => c.id === campId) || null, [store, campId]);

  // 담당자 요청(2026-10-01): "누구까지 업로드했는지 몰라 다시 돌아가서 찾아봐야 한다"
  // → 정산월을 고르면 그 계약에 이미 걸린 기자 링크를 바로 보여준다. 등록 직후에도 다시 읽는다.
  const loadReg = useCallback(async (id) => {
    regWant.current = id;
    setRegErr('');
    if (!id) { setReg(null); return; }
    try {
      const d = await api('POST', { action: 'registered', campaignId: id });
      if (regWant.current === id) setReg(d);
    } catch (e) {
      if (regWant.current === id) { setReg(null); setRegErr(e.message); }
    }
  }, [api]);
  useEffect(() => { loadReg(campId); }, [campId, loadReg]);

  // 최신 묶음이 위 — 서버가 등록순으로 번호를 매겨 보내므로 묶음 순서만 뒤집는다
  const regGroups = useMemo(() => {
    if (!reg || reg.campaignId !== campId) return null;
    const g = new Map();
    reg.items.forEach((x) => { if (!g.has(x.group)) g.set(x.group, []); g.get(x.group).push(x); });
    return [...g].map(([key, items]) => ({ key, items })).reverse();
  }, [reg, campId]);
  const justGroup = done && done.camp.id === campId ? groupOfTag(done.tag) : '';

  const shown = useMemo(() => {
    const k = q.replace(/\s/g, '').toLowerCase();
    const list = stores || [];
    return k ? list.filter((s) => `${s.client}${s.branch}`.replace(/\s/g, '').toLowerCase().includes(k)) : list;
  }, [stores, q]);

  const linkCount = useMemo(() => countLinks(text), [text]);

  // 입력이 바뀌면 이전 판정은 무효 — 판정과 등록 대상이 어긋나면 안 된다
  function resetCheck() { setPreview(null); setExcluded([]); setErr(''); }

  function pickStore(id) {
    setStoreId(id); setCampId(''); resetCheck(); setDone(null);
  }

  async function runPreview(ex = excluded) {
    if (!camp) return setErr('정산월(계약)을 먼저 고르세요.');
    if (!linkCount) return setErr('링크를 붙여넣으세요.');
    setBusy('preview'); setErr(''); setDone(null);
    try {
      // × 로 뺀 링크를 지운 본문을 보낸다 — 서버 판정이 곧 등록 대상이 되도록
      const body = ex.reduce(removeLink, text);
      const d = await api('POST', { action: 'preview', campaignId: camp.id, text: body });
      setPreview({ ...d, sentText: body });
    } catch (e) {
      setErr(e.message); setPreview(null);
    } finally {
      setBusy('');
    }
  }

  function dropRow(raw) {
    const next = [...excluded, raw];
    setExcluded(next);
    runPreview(next);
  }

  async function runCreate() {
    if (!preview || !camp) return;
    const n = preview.counts.fresh;
    const after = preview.camp.done + n;
    const over = preview.camp.goal > 0 && after > preview.camp.goal;
    const msg = [
      `${preview.camp.client} ${preview.camp.branch} · ${preview.camp.month}`,
      `기자단 링크 ${n}건을 등록합니다.`,
      over ? `\n⚠️ 목표 ${preview.camp.goal}건을 넘습니다 (등록 후 ${after}건).` : '',
    ].join('\n');
    if (!window.confirm(msg)) return;

    setBusy('create'); setErr('');
    try {
      const d = await api('POST', { action: 'create', campaignId: camp.id, text: preview.sentText, expect: n });
      setDone(d);
      setText(''); resetCheck();
      load();   // 실적(rollup) 새로 읽기
      loadReg(camp.id);   // 방금 넣은 묶음이 '등록된 링크' 맨 위에 보이게
    } catch (e) {
      setErr(e.message);
      if (e.data?.created) { setPreview(null); load(); loadReg(camp.id); }
    } finally {
      setBusy('');
    }
  }

  const c = preview?.counts;
  const after = preview ? preview.camp.done + c.fresh : 0;

  return (
    <div className={`apr${variant === 'staff' ? ' apr-staff' : ''}`}>
      <div className="apr-grid">
        {/* ── 고객사 ── */}
        <aside className="apr-side">
          <div className="apr-search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="고객사 검색" aria-label="고객사 검색" />
            <span className="apr-cnt">{shown.length}</span>
          </div>
          <div className="apr-rows">
            {loadErr && <div className="apr-error">{loadErr}</div>}
            {!stores && !loadErr && <div className="apr-empty">불러오는 중…</div>}
            {shown.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`apr-row${s.id === storeId ? ' on' : ''}${s.use ? '' : ' off'}`}
                onClick={() => pickStore(s.id)}
              >
                <b>{s.client}</b>
                <span>{s.branch}{s.press ? <em>기자</em> : null}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* ── 본문 ── */}
        <section className="apr-main">
          <header className="apr-head">
            <h1>기자단 링크 등록</h1>
            <p>받은 링크 덩어리를 그대로 붙여넣으세요. 제목·빈 줄·공백은 알아서 빠지고, 이미 올린 영상은 등록되지 않습니다.</p>
          </header>

          {done && (
            <div className="apr-done" role="status">
              <b>✓ {done.camp.client} {done.camp.branch} · {done.camp.month} — {done.created}건 등록</b>
              <span>비고에 <code>{done.tag}</code> 가 남았습니다.</span>
              <a href={`/schedule?campaignId=${done.camp.id}`} target="_blank" rel="noreferrer">고객 화면 열기 ↗</a>
            </div>
          )}

          {!store ? (
            <div className="apr-card apr-placeholder">왼쪽에서 고객사를 고르세요.</div>
          ) : (
            <>
              <div className="apr-card">
                <h2><i>1</i> 정산월 (계약)</h2>
                <div className="apr-chips">
                  {store.contracts.map((ct) => (
                    <button
                      key={ct.id}
                      type="button"
                      className={`apr-chip${ct.id === campId ? ' on' : ''}${ct.twin ? ' twin' : ''}`}
                      onClick={() => { setCampId(ct.id); resetCheck(); setDone(null); }}
                    >
                      <b>{ct.month}</b>
                      <span>기자 {ct.done}/{ct.goal || '–'}</span>
                    </button>
                  ))}
                </div>
                {camp?.twin && (
                  <p className="apr-warn">⚠️ 이 달에 계약이 2개 있습니다 (Campaign_DB 중복). 목표가 걸린 쪽을 골랐는지 확인하세요.</p>
                )}
              </div>

              {camp && (
                <div className="apr-card">
                  <h2>
                    이 달 등록된 링크
                    {regGroups && <span className="apr-reg-n">{reg.items.length}건</span>}
                  </h2>
                  {regErr && <div className="apr-error">{regErr}</div>}
                  {!regGroups && !regErr && <div className="apr-empty">불러오는 중…</div>}
                  {regGroups && !regGroups.length && <div className="apr-empty">아직 등록된 링크가 없습니다.</div>}
                  {regGroups && regGroups.length > 0 && (
                    <>
                      <div className="apr-reg">
                        {regGroups.map((g) => {
                          const h = g.items[0];
                          const just = g.key === justGroup;
                          const range = g.items.length > 1 ? `${g.items[0].n}~${g.items[g.items.length - 1].n}번` : `${h.n}번`;
                          return (
                            <div key={g.key}>
                              <div className={`apr-reg-gh${just ? ' just' : ''}`}>
                                <span>
                                  {just && <b>방금 등록 · </b>}
                                  {h.bulkAt ? `${h.bulkAt.slice(5)} 등록${h.by ? ` · ${h.by}` : ''}` : `${(h.at || '').slice(5, 10) || '날짜 없음'} 직접 입력`}
                                </span>
                                <span>{range} · {g.items.length}건</span>
                              </div>
                              {g.items.map((x) => (
                                <div key={x.id} className={`apr-reg-tr${just ? ' just' : ''}`}>
                                  <span className="apr-no">{x.n}</span>
                                  <span className="apr-link">
                                    {x.url ? <Ext href={x.url}>{x.url.replace(/^https?:\/\//, '')}</Ext> : <small>링크 없음</small>}
                                  </span>
                                  <span className="apr-reg-meta">
                                    {x.posted && `게시 ${x.posted.slice(5)}`}
                                    {x.status && x.status !== '촬영완료' && <em>{x.status}</em>}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                      <p className="apr-hint apr-reg-tip">
                        받은 목록을 통째로 다시 붙여넣어도 됩니다 — 여기 있는 링크는 확인 단계에서 '이미 있음'으로 빠집니다.
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="apr-card">
                <h2><i>2</i> 링크 붙여넣기</h2>
                <textarea
                  value={text}
                  onChange={(e) => { setText(e.target.value); resetCheck(); }}
                  placeholder={'모찌롱 7월 기자단\n\nhttp://xhslink.cn/o/2pxYlCMGkSb\nhttp://xhslink.cn/o/6J6mkA8Mgfy\n…'}
                  rows={9}
                  spellCheck={false}
                />
                <div className="apr-bar">
                  <span className="apr-hint">{linkCount ? `링크 ${linkCount}개 인식` : '위챗·카톡에서 받은 그대로 붙여넣어도 됩니다'}</span>
                  <button type="button" className="apr-btn" disabled={!camp || !linkCount || !!busy} onClick={() => runPreview()}>
                    {busy === 'preview' ? '확인 중…' : '확인하기'}
                  </button>
                </div>
              </div>

              {err && <div className="apr-error">{err}</div>}

              {preview && (
                <div className="apr-card">
                  <h2><i>3</i> 확인</h2>
                  <div className="apr-sum">
                    <span className="ok">신규 {c.fresh}</span>
                    {c.dupDb > 0 && <span className="bad">이미 있음 {c.dupDb}</span>}
                    {c.dupPaste > 0 && <span className="warn">입력 중복 {c.dupPaste}</span>}
                    {c.bad > 0 && <span className="bad">제외 {c.bad}</span>}
                    <span className="apr-sum-t">총 {c.total}개 인식</span>
                  </div>
                  <p className={`apr-goal${preview.camp.goal > 0 && after > preview.camp.goal ? ' over' : ''}`}>
                    기자 목표 <b>{preview.camp.goal || '미설정'}</b> · 현재 <b>{preview.camp.done}</b> → 등록 후 <b>{after}</b>
                    {preview.camp.goal > 0 && after > preview.camp.goal && ' — 목표 초과'}
                    {!preview.camp.goal && ' — 목표가 없어도 등록되고 실적에 잡힙니다'}
                  </p>
                  {preview.note && <p className="apr-warn">{preview.note}</p>}

                  <div className="apr-table" role="table">
                    {preview.items.map((x) => (
                      <div key={x.i} className={`apr-tr ${x.status}`} role="row">
                        <span className="apr-no">{x.i}</span>
                        <span className={`apr-st ${STATUS[x.status].cls}`}>{STATUS[x.status].label}</span>
                        <span className="apr-link">
                          <Ext href={x.url}>{x.url}</Ext>
                          <small>
                            {x.status === 'dupDb' && whereText(x.where, x.whereN)}
                            {x.status === 'dupPaste' && `${x.firstAt}번 줄과 같은 영상`}
                            {x.status === 'bad' && x.reason}
                            {x.status === 'new' && (x.posted ? `게시 ${x.posted}` : x.check === 'fail' ? '게시물 확인 못 함 — 열어서 확인' : '')}
                          </small>
                        </span>
                        {x.status === 'new' ? (
                          <button type="button" className="apr-x" title="이 링크 빼기" aria-label={`${x.i}번 빼기`} disabled={!!busy} onClick={() => dropRow(x.raw)}>×</button>
                        ) : <span />}
                      </div>
                    ))}
                  </div>

                  <div className="apr-bar">
                    <span className="apr-hint">{excluded.length ? `직접 뺀 링크 ${excluded.length}개` : '신규만 등록됩니다. 나머지는 자동으로 빠집니다.'}</span>
                    <button type="button" className="apr-btn primary" disabled={!c.fresh || !!busy} onClick={runCreate}>
                      {busy === 'create' ? '등록 중…' : `신규 ${c.fresh}건 등록`}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
