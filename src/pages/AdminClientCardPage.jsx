import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminHeaders } from '../lib/adminKey';
import './AdminClientCardPage.css';

/**
 * 고객카드 (/admin/clients, /admin/clients/:id)
 *
 * 배치는 HubSpot·Salesforce 레코드 화면의 3열 뼈대를 따른다 —
 * ① 누구인가(신원) ② 무슨 일이 있었나(거래) ③ 딸린 것(서류·계열).
 * 탭으로 안 나눈 이유: 이 화면을 여는 순간은 대개 "이 집 이번 달 어떻게 되고 있지"인데
 * 그건 ①과 ②를 동시에 봐야 답이 나온다 (NN/g — 탭은 서로 배타적인 내용에 쓴다).
 *
 * /admin/stores 와 역할이 다르다. 거긴 편집 폼, 여긴 조회 카드다.
 * 카드에서 고칠 수 있는 건 영업시간·주의사항 같은 가벼운 것뿐이고,
 * 계약·목표처럼 파급이 큰 값은 stores 로 보낸다.
 */

const CLS_LABELS = { FB: '요식', AT: '관광·액티비티', RT: '리테일', HT: '숙박', ET: '엔터·체험' };
const REGION_LABELS = { J: '제주', S: '서울', B: '부산', E: '기타' };

/* 어느 고객사든 갖춰야 하는 것. 없으면 없는 대로 칸을 남긴다 —
   항목을 감추면 "원래 그런가 보다"가 되고, 비워 두면 "받아야 하는구나"가 된다. */
const REQUIRED_DOCS = ['사업자등록증', '통장사본'];
const OPTIONAL_DOCS = ['신분증', '영업신고증', '계약서', '위임장', '등기부등본', '인감증명', '기타'];

const won = (n) => (n ? Number(n).toLocaleString('ko-KR') : '0');
const man = (n) => Math.round(Number(n || 0) / 10000);

function daysLeft(iso) {
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00+09:00`);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86400000);
}

/* ── 인라인 편집 한 칸 ─────────────────────────────── */
function EditCell({ label, value, name, multiline, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDraft(value || ''); }, [value]);

  const commit = async () => {
    if (draft === (value || '')) { setEditing(false); return; }
    setBusy(true);
    try { await onSave(name, draft); setEditing(false); } finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <>
        <dt>{label}</dt>
        <dd>
          <button type="button" className={`acc-edit${value ? '' : ' empty'}`}
                  onClick={() => setEditing(true)}
                  title="눌러서 수정">
            {value || '비어 있음'}
          </button>
        </dd>
      </>
    );
  }
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {multiline ? (
          <textarea className="acc-in" rows={3} value={draft} autoFocus disabled={busy}
                    onChange={(e) => setDraft(e.target.value)} />
        ) : (
          <input className="acc-in" value={draft} autoFocus disabled={busy}
                 onChange={(e) => setDraft(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }} />
        )}
        <span className="acc-btns">
          <button type="button" className="acc-mini go" onClick={commit} disabled={busy}>저장</button>
          <button type="button" className="acc-mini" onClick={() => { setDraft(value || ''); setEditing(false); }}>취소</button>
        </span>
      </dd>
    </>
  );
}

/* ── 월별 목표·실적 막대 ───────────────────────────── */
function CampaignChart({ camps, dupMonths }) {
  const byMonth = useMemo(() => {
    const m = new Map();
    camps.forEach((c) => {
      if (!c.m) return;
      const k = `${c.y}-${c.m}`;
      const cur = m.get(k) || { y: c.y, m: c.m, goal: 0, done: 0, budget: 0, rows: 0, month: c.month };
      cur.goal += c.goal; cur.done += c.done; cur.budget += c.budget; cur.rows += 1;
      m.set(k, cur);
    });
    return [...m.values()].sort((a, b) => a.y - b.y || a.m - b.m);
  }, [camps]);

  if (!byMonth.length) return <p className="acc-empty">계약 기록이 없습니다.</p>;

  const max = Math.max(...byMonth.map((d) => Math.max(d.goal, d.done)), 1);
  const W = 420, H = 128, PADL = 32, PADB = 22, PADT = 8;
  const plotH = H - PADB - PADT;
  const step = (W - PADL - 6) / byMonth.length;
  const bw = Math.max(6, Math.min(14, step / 2.6));
  const y = (v) => PADT + plotH - (v / max) * plotH;
  const ticks = [0, 0.5, 1].map((r) => ({ v: max * r, yy: y(max * r) }));

  return (
    <div className="acc-chart">
      <div className="acc-legend">
        <span><i className="lg goal" />목표</span>
        <span><i className="lg done" />실적</span>
        {dupMonths.length ? <span><i className="lg dup" />중복행</span> : null}
        <span className="acc-unit">단위 만원</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label={`월별 목표 대비 실적. 최고 ${man(max)}만원.`}>
        {ticks.map((t) => (
          <g key={t.v}>
            <line x1={PADL} y1={t.yy} x2={W - 6} y2={t.yy} stroke="var(--acc-line)" strokeWidth="1" />
            <text x={PADL - 5} y={t.yy + 3} textAnchor="end" className="acc-tick">{man(t.v)}</text>
          </g>
        ))}
        {byMonth.map((d, i) => {
          const x0 = PADL + i * step + (step - bw * 2 - 2) / 2;
          const dup = d.rows > 1;
          return (
            <g key={`${d.y}-${d.m}`}>
              {d.goal > 0 && (
                <rect x={x0} y={y(d.goal)} width={bw} height={PADT + plotH - y(d.goal)}
                      fill="var(--acc-bar-goal)" rx="1" />
              )}
              {d.done > 0 && (
                <rect x={x0 + bw + 2} y={y(d.done)} width={bw} height={PADT + plotH - y(d.done)}
                      fill={dup ? 'var(--acc-warn)' : 'var(--acc-accent)'} rx="1">
                  <title>{`${d.month} 실적 ${won(d.done)}원${dup ? ` · 계약 ${d.rows}줄` : ''}`}</title>
                </rect>
              )}
              <text x={PADL + i * step + step / 2} y={H - 8} textAnchor="middle" className="acc-xlab">{d.m}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── 카드 ─────────────────────────────────────────── */
function Card({ data, onSave, onOpenDoc, opening }) {
  const [showAll, setShowAll] = useState(false);
  const { store: s, biz, people, campaigns, dupMonths, docs, kin } = data;

  const totals = useMemo(() => {
    const goal = campaigns.reduce((a, c) => a + c.goal, 0);
    const done = campaigns.reduce((a, c) => a + c.done, 0);
    const last = campaigns[campaigns.length - 1];
    return { goal, done, rate: goal ? Math.round((done / goal) * 100) : null, last };
  }, [campaigns]);

  /* 서류 구비 — 종류별로 현행본이 있나 */
  const docByKind = useMemo(() => {
    const m = new Map();
    docs.forEach((d) => {
      const cur = m.get(d.kind) || [];
      cur.push(d);
      m.set(d.kind, cur);
    });
    return m;
  }, [docs]);

  const extraKinds = [...docByKind.keys()].filter((k) => !REQUIRED_DOCS.includes(k));
  const haveCount = REQUIRED_DOCS.filter((k) => docByKind.has(k)).length;
  const cpt = daysLeft(s.cptDue);

  return (
    <div className="acc-card">
      <header className="acc-head">
        <h2>{s.client}</h2>
        <span className="acc-branch">{[s.branch, REGION_LABELS[s.region], s.area].filter(Boolean).join(' · ')}</span>
        <span className="acc-sp" />
        {(kin.length > 0 || biz?.owner) && (
          <span className="acc-chip acc">
            계열 {kin.length + 1}곳{biz?.owner ? ` · 총괄 ${biz.owner}` : ''}
          </span>
        )}
        <span className={`acc-chip ${haveCount === REQUIRED_DOCS.length ? 'ok' : 'warn'}`}>
          필수서류 {haveCount}/{REQUIRED_DOCS.length}
        </span>
        {biz?.state === '확인필요' && <span className="acc-chip warn">확인필요</span>}
        <span className={`acc-chip ${s.use ? 'ok' : ''}`}>{s.use ? '거래중' : '미사용'}</span>
      </header>

      <div className="acc-cols">

        {/* ① 신원 */}
        <section className="acc-zone acc-z1">
          <div className="acc-zt">신원</div>

          {biz ? (
            <div className="acc-box">
              <dl className="acc-kv">
                <dt>상호</dt><dd>{biz.name || '—'}</dd>
                <dt>사업자번호</dt><dd className="mono">{biz.no || '—'}</dd>
                {biz.kind && <><dt>구분</dt><dd>{biz.kind}</dd></>}
                <dt>업태·종목</dt>
                <dd className={biz.biz1 || biz.biz2 ? '' : 'miss'}>
                  {[biz.biz1, biz.biz2].filter(Boolean).join(' · ') || '판독 실패 — 등록증 재판독 필요'}
                </dd>
                <dt>개업일</dt><dd className="mono">{biz.opened || '—'}</dd>
                <dt>주소</dt><dd>{biz.addr || '—'}</dd>
                {(biz.tel || biz.mail) && (
                  <>
                    <dt>연락</dt>
                    <dd>{[biz.tel, biz.mail].filter(Boolean).join(' · ')}</dd>
                  </>
                )}
              </dl>
            </div>
          ) : (
            <div className="acc-box acc-none-box">
              <b>사업자 정보 없음</b>
              <p>사업자등록증을 받아 <code>고객정보/00_INBOX/</code> 에 넣으면 채워집니다.</p>
            </div>
          )}

          {biz && (biz.bank || biz.acct) && (
            <div className="acc-box acc-sensitive">
              <div className="acc-sens-lab">정산계좌</div>
              <dl className="acc-kv">
                <dt>은행</dt><dd>{biz.bank || '—'}</dd>
                <dt>계좌</dt><dd className="mono">{biz.acct || '—'}</dd>
                <dt>예금주</dt><dd>{biz.holder || '—'}</dd>
              </dl>
            </div>
          )}

          <div className="acc-box">
            <dl className="acc-kv">
              <EditCell label="영업시간" name="영업시간" value={s.open} onSave={onSave} />
              <EditCell label="브레이크" name="브레이크타임" value={s.brk} onSave={onSave} />
              <EditCell label="피크" name="피크타임" value={s.peak} onSave={onSave} />
              <dt>정기휴무</dt><dd>{s.rest.length ? s.rest.join(', ') : '—'}</dd>
              <dt>분류</dt><dd>{CLS_LABELS[s.cls] || s.cls || '—'}</dd>
            </dl>
          </div>

          {people.length > 0 && (
            <div className="acc-box acc-people">
              {people.map((p) => (
                <div className="acc-person" key={p.id}>
                  <span className="acc-av">{(p.name || '?').slice(0, 1)}</span>
                  <span className="acc-pg">
                    <b>{p.name}</b>
                    <span className="acc-prole">
                      {[p.on, p.title, p.tel].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {p.idCard > 0 && <span className="acc-vbadge">신분증</span>}
                </div>
              ))}
            </div>
          )}

          <div className="acc-box">
            <dl className="acc-kv">
              <EditCell label="섭외주의" name="섭외주의사항" value={s.warn} multiline onSave={onSave} />
              <EditCell label="제공내역" name="제공내역" value={s.give} multiline onSave={onSave} />
              <EditCell label="비고" name="비고" value={s.note} multiline onSave={onSave} />
            </dl>
          </div>
        </section>

        {/* ② 거래 */}
        <section className="acc-zone acc-z2">
          <div className="acc-zt">거래 · 계약 {campaigns.length}건</div>

          <CampaignChart camps={campaigns} dupMonths={dupMonths} />

          <div className="acc-stats">
            <div className="acc-stat">
              <div className="l">누적 실적</div>
              <div className="v">{man(totals.done).toLocaleString('ko-KR')}<small>만</small></div>
            </div>
            <div className="acc-stat">
              <div className="l">달성률</div>
              <div className={`v${totals.rate != null && totals.rate >= 100 ? ' up' : ''}`}>
                {totals.rate == null ? '—' : `${totals.rate}`}<small>%</small>
              </div>
            </div>
            <div className="acc-stat">
              <div className="l">최근 계약</div>
              <div className="v sm">{totals.last?.month || '—'}</div>
            </div>
          </div>

          {dupMonths.length > 0 && (
            <div className="acc-flag">
              <span aria-hidden="true">⚠</span>
              <span>
                <b>{dupMonths.join(', ')} 계약이 두 줄입니다.</b> 목표·실적이 나뉘어 달성률이 흔들릴 수 있습니다.
                Campaign_DB 중복은 <code>/admin</code> 목표·실적 화면에서 정리합니다.
              </span>
            </div>
          )}

          <button type="button" className="acc-more" onClick={() => setShowAll((v) => !v)}>
            {showAll ? '계약 표 접기' : `계약 ${campaigns.length}건 표로 보기`}
          </button>

          {showAll && (
            <div className="acc-tw">
              <table className="acc-table">
                <thead>
                  <tr>
                    <th>월</th><th>유형</th><th className="n">예산</th><th className="n">목표</th>
                    <th className="n">실적</th><th className="n">인플</th><th className="n">체험</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className={c.flag ? 'flagged' : ''}>
                      <td className="mono">{c.month}</td>
                      <td>{c.type || '—'}</td>
                      <td className="n">{won(c.budget)}</td>
                      <td className="n">{won(c.goal)}</td>
                      <td className="n">{won(c.done)}</td>
                      <td className="n">{c.infl.goal ? `${c.infl.fin}/${c.infl.goal}` : '—'}</td>
                      <td className="n">{c.exp.goal ? `${c.exp.fin}/${c.exp.goal}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ③ 서류·관계 */}
        <section className="acc-zone acc-z3">
          <div className="acc-zt">서류</div>
          <div className="acc-docs">
            {REQUIRED_DOCS.map((kind) => {
              const list = docByKind.get(kind) || [];
              return <DocRow key={kind} kind={kind} list={list} required onOpen={onOpenDoc} opening={opening} />;
            })}
            {extraKinds.map((kind) => (
              <DocRow key={kind} kind={kind} list={docByKind.get(kind)} onOpen={onOpenDoc} opening={opening} />
            ))}
            {OPTIONAL_DOCS.filter((k) => k === '신분증' && !docByKind.has(k)).map((k) => (
              <DocRow key={k} kind={k} list={[]} onOpen={onOpenDoc} opening={opening} />
            ))}
          </div>

          {cpt != null && (
            <>
              <div className="acc-zt">만료</div>
              <div className={`acc-expiry${cpt < 0 ? ' over' : (cpt < 30 ? ' soon' : '')}`}>
                <b>따종 商户通</b>
                <span>{s.cptDue} · {cpt < 0 ? `${-cpt}일 지남` : `${cpt}일 남음`}</span>
              </div>
            </>
          )}

          {kin.length > 0 && (
            <>
              <div className="acc-zt">계열</div>
              <div className="acc-kin">
                {kin.map((k) => (
                  <div className="acc-kin-row" key={k.id}>
                    <span>{k.name}</span>
                    <span className="c">{k.no || `매장 ${k.stores}`}</span>
                  </div>
                ))}
              </div>
              <p className="acc-hint">
                같은 사람이 대표·실질오너인 곳입니다. 바지사장이 있으면 안 잡히니
                <code>인물_DB.실질오너</code> 를 채워 주세요.
              </p>
            </>
          )}

          <div className="acc-zt">바로가기</div>
          <div className="acc-kin">
            <a className="acc-kin-row" href={`/admin/stores?store=${s.id}`}>
              <span>정보 수정</span><span className="c">/admin/stores</span>
            </a>
            {s.dpCode && (
              <a className="acc-kin-row" href={`/admin/dianping?store=${encodeURIComponent(s.dpCode)}`}>
                <span>따종 현황</span><span className="c">{s.adState || s.dpCode}</span>
              </a>
            )}
            {s.talkLink && (
              <a className="acc-kin-row" href={s.talkLink} target="_blank" rel="noreferrer">
                <span>카톡방</span><span className="c">{s.talkName || '열기'}</span>
              </a>
            )}
          </div>

          {biz?.ocr && (
            <details className="acc-det">
              <summary>판독 요약</summary>
              <pre>{biz.ocr}</pre>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}

/* ── 서류 한 줄 ───────────────────────────────────── */
function DocRow({ kind, list, required, onOpen, opening }) {
  const items = list || [];
  const cur = items.find((d) => d.state === '현행') || items[0];
  const olds = items.filter((d) => d !== cur);
  const sensitive = kind === '신분증' || kind === '통장사본';

  if (!cur) {
    return (
      <div className={`acc-doc none${required ? ' req' : ''}`}>
        <span className="acc-thumb" aria-hidden="true" />
        <span className="acc-dg">
          <b>{kind}</b>
          <span>{required ? '없음 — 정산 전 필요' : '없음'}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="acc-doc">
      <span className="acc-thumb" aria-hidden="true" />
      <span className="acc-dg">
        <b>{kind}{sensitive && <i className="acc-lock" title="열람 기록이 남습니다">🔒</i>}</b>
        <span>{cur.issued || cur.received || '날짜 미상'}{olds.length ? ` · 구판 ${olds.length}` : ''}</span>
      </span>
      <span className="acc-vbadge">v{cur.ver}</span>
      <button type="button" className="acc-mini" disabled={opening === cur.id}
              onClick={() => onOpen(cur)}>
        {opening === cur.id ? '…' : '열기'}
      </button>
    </div>
  );
}

/* ── 페이지 ───────────────────────────────────────── */
export default function AdminClientCardPage() {
  const { id } = useParams();
  const nav = useNavigate();

  const [list, setList] = useState(null);
  const [card, setCard] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('use');   // use | needDoc | needCheck | all
  const [byGroup, setByGroup] = useState(false); // 계열별(총괄대표) 묶기
  const [opening, setOpening] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch('/api/admin-clients', { headers: adminHeaders() });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error || `서버 오류 (${r.status})`);
        if (!dead) setList(b);
      } catch (e) { if (!dead) setErr(e.message); }
    })();
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    if (!id) { setCard(null); return undefined; }
    let dead = false;
    setCard(null);
    (async () => {
      try {
        const r = await fetch(`/api/admin-clients?id=${encodeURIComponent(id)}`, { headers: adminHeaders() });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error || `서버 오류 (${r.status})`);
        if (!dead) setCard(b);
      } catch (e) { if (!dead) setErr(e.message); }
    })();
    return () => { dead = true; };
  }, [id]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const rows = useMemo(() => {
    if (!list) return [];
    const kw = q.trim().toLowerCase();
    return list.rows.filter((r) => {
      if (filter === 'use' && !r.use) return false;
      if (filter === 'needDoc' && !(r.hasBiz && !r.docsOk)) return false;
      if (filter === 'needCheck' && r.bizState !== '확인필요') return false;
      if (!kw) return true;
      return `${r.client} ${r.branch} ${r.bizNo}`.toLowerCase().includes(kw);
    });
  }, [list, q, filter]);

  /* 계열별: 총괄대표(실질오너)가 있는 매장을 그 사람 아래로 묶는다. 없는 곳은 맨 뒤 '계열 없음'. */
  const groups = useMemo(() => {
    if (!byGroup) return null;
    const m = new Map();
    rows.forEach((r) => {
      const k = r.owner || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    const named = [...m.entries()].filter(([k]) => k).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ko'));
    const rest = m.get('') || [];
    return rest.length ? [...named, ['', rest]] : named;
  }, [rows, byGroup]);

  const save = useCallback(async (name, value) => {
    const r = await fetch('/api/admin-clients', {
      method: 'PATCH',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fields: { [name]: value } }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { setToast(b.error || '저장 실패'); throw new Error(b.error); }
    setCard((c) => (c ? { ...c, store: { ...c.store, [({
      영업시간: 'open', 브레이크타임: 'brk', 피크타임: 'peak', 방문가능시간: 'visitOk',
      섭외주의사항: 'warn', 비고: 'note', 제공내역: 'give', 톡방명: 'talkName', 톡방링크: 'talkLink',
    })[name]]: value } } : c));
    setToast('저장했습니다.');
  }, [id]);

  /* 새 탭(window.open)은 fetch 를 기다린 뒤에 부르면 브라우저가 팝업으로 막는다 —
     사용자 클릭과 같은 틱이 아니라서. 그래서 화면 안 뷰어로 띄운다. */
  const [viewer, setViewer] = useState(null);
  const openDoc = useCallback(async (doc) => {
    setOpening(doc.id);
    try {
      const r = await fetch(`/api/admin-clients?doc=${encodeURIComponent(doc.id)}`, { headers: adminHeaders() });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || '열 수 없습니다.');
      setViewer({ kind: b.kind || doc.kind, files: b.files || [] });
    } catch (e) { setToast(e.message); } finally { setOpening(''); }
  }, []);

  useEffect(() => {
    if (!viewer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setViewer(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer]);

  return (
    <div className="acc-wrap">
      <aside className="acc-rail">
        <input className="acc-search" placeholder="고객사·사업자번호 검색"
               value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="acc-filters">
          {[
            ['use', '거래중', list?.counts.use],
            ['needDoc', '서류미비', list?.counts.needDoc],
            ['needCheck', '확인필요', list?.counts.needCheck],
            ['all', '전체', list?.counts.total],
          ].map(([k, lab, n]) => (
            <button key={k} type="button"
                    className={`acc-fbtn${filter === k ? ' on' : ''}`}
                    onClick={() => setFilter(k)}>
              {lab}{n != null && <i>{n}</i>}
            </button>
          ))}
        </div>

        {!list && !err && <p className="acc-empty">불러오는 중…</p>}
        {err && <p className="acc-err">{err}</p>}

        <div className="acc-vtoggle" role="group" aria-label="보기">
          <button type="button" className={`acc-fbtn${!byGroup ? ' on' : ''}`} onClick={() => setByGroup(false)}>매장별</button>
          <button type="button" className={`acc-fbtn${byGroup ? ' on' : ''}`} onClick={() => setByGroup(true)}>계열별</button>
        </div>

        <ul className="acc-list">
          {groups && groups.map(([owner, items]) => (
            <li key={owner || '_none'} className="acc-grp">
              <div className="acc-grp-h">
                <b>{owner || '계열 없음'}</b><i>{items.length}</i>
              </div>
              <ul>
                {items.map((r) => (
                  <li key={r.id}>
                    <button type="button" className={`acc-item${r.id === id ? ' on' : ''}`}
                            onClick={() => nav(`/admin/clients/${r.id}`)}>
                      <span className="acc-i-nm">{r.client}{r.branch && <i>{r.branch}</i>}</span>
                      <span className="acc-i-meta"><i>{r.campaigns || 0}</i></span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {!groups && rows.map((r) => (
            <li key={r.id}>
              <button type="button" className={`acc-item${r.id === id ? ' on' : ''}`}
                      onClick={() => nav(`/admin/clients/${r.id}`)}>
                <span className="acc-i-nm">
                  {r.client}
                  {r.branch && <i>{r.branch}</i>}
                </span>
                <span className="acc-i-meta">
                  {r.hasBiz
                    ? <span className={`acc-dotmark${r.docsOk ? ' ok' : ' warn'}`} title={r.docsOk ? '필수서류 완비' : '서류 미비'} />
                    : <span className="acc-dotmark none" title="사업자 정보 없음" />}
                  <i>{r.campaigns || 0}</i>
                </span>
              </button>
            </li>
          ))}
          {list && !rows.length && <li><p className="acc-empty">해당하는 고객사가 없습니다.</p></li>}
        </ul>
      </aside>

      <main className="acc-main">
        {!id && (
          <div className="acc-blank">
            <h3>고객사를 고르세요</h3>
            <p>왼쪽 목록에서 고르면 CS 기본정보·월별 계약·인물·사업자·서류를 한 화면에 폅니다.</p>
            {list && (
              <dl className="acc-blank-kv">
                <dt>전체 매장</dt><dd>{list.counts.total}</dd>
                <dt>사업자 정보 있음</dt><dd>{list.counts.withBiz}</dd>
                <dt>필수서류 미비</dt><dd className="warn">{list.counts.needDoc}</dd>
                <dt>확인필요</dt><dd className="warn">{list.counts.needCheck}</dd>
              </dl>
            )}
          </div>
        )}
        {id && !card && !err && <p className="acc-empty">카드를 불러오는 중…</p>}
        {id && card && (
          <Card data={card} onSave={save} onOpenDoc={openDoc} opening={opening} />
        )}
      </main>

      {viewer && (
        <div className="acc-viewer" role="dialog" aria-modal="true" aria-label={`${viewer.kind} 보기`}
             onClick={() => setViewer(null)}>
          <div className="acc-viewer-box" onClick={(e) => e.stopPropagation()}>
            <div className="acc-viewer-head">
              <b>{viewer.kind}</b>
              <span>{viewer.files.length}장 · 열람 기록이 남습니다</span>
              <button type="button" className="acc-mini" onClick={() => setViewer(null)}>닫기 (Esc)</button>
            </div>
            <div className="acc-viewer-body">
              {viewer.files.map((f) => (
                String(f.type || '').startsWith('image/')
                  ? <img key={f.url} src={f.url} alt={f.name} />
                  : <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="acc-kin-row">
                      <span>{f.name}</span><span className="c">새 탭에서 열기</span>
                    </a>
              ))}
            </div>
          </div>
        </div>
      )}
      {toast && <div className="acc-toast" role="status">{toast}</div>}
    </div>
  );
}
