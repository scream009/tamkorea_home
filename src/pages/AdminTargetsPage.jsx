import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminHeaders } from '../lib/adminKey';
import './AdminTargetsPage.css';

/**
 * 관리자 메인 — 월별 고객사 목표·실적.
 *
 * 화면 규칙은 두 단계 펼침 하나뿐이다.
 *   고객사 클릭 → 위에 전월, 아래에 다음월
 *   유형(인플·체험·기자) 클릭 → 그 유형의 예약 리스트
 * 여러 달의 여러 유형을 동시에 열어 나란히 비교할 수 있어야 한다.
 *
 * ⚠️ 진도율은 **목표 대비**로 쓰고, 색만 권장진도(경과율) 대비로 준다.
 *    "모자란 수량"을 %로 쓰면 100%가 좋은 건지 나쁜 건지 헷갈린다.
 */

const TYPES = ['인플', '체험', '기자'];
const UNIT = { 인플: 330000, 체험: 50000, 기자: 50000 };
const HOST = 'https://tamkorea.com';

const nf = (n) => (Number(n) || 0).toLocaleString('ko-KR');
const mo = (v) => (String(v || '').match(/\d+월/) || [''])[0];
const keyOf = (n, m) => `${n}|${m}`;

function parseMonth(v) {
  const m = /^(\d{4})\.\s*(\d{1,2})월$/.exec(String(v || '').trim());
  return m ? { y: Number(m[1]), n: Number(m[2]) } : null;
}
function fmtMonth(y, n) {
  let yy = y; let nn = n;
  while (nn < 1) { nn += 12; yy -= 1; }
  while (nn > 12) { nn -= 12; yy += 1; }
  return `${yy}. ${nn}월`;
}
function around(m) {
  const p = parseMonth(m);
  if (!p) return ['', m, ''];
  return [fmtMonth(p.y, p.n - 1), fmtMonth(p.y, p.n), fmtMonth(p.y, p.n + 1)];
}
function elapsedOf(m) {
  const p = parseMonth(m);
  if (!p) return 1;
  const days = new Date(p.y, p.n, 0).getDate();
  const e = Math.floor((Date.now() - new Date(p.y, p.n - 1, 1).getTime()) / 864e5) + 1;
  return Math.round((Math.min(Math.max(e, 0), days) / days) * 1e4) / 1e4;
}

/** 진도율이 권장진도보다 얼마나 처졌는지로 색을 정한다. 숫자 자체는 목표 대비다. */
function tone(dev) {
  if (dev === null || dev === undefined) return '';
  if (dev >= 0) return 'ok';
  if (dev > -0.15) return 'warn';
  if (dev > -0.4) return 'orange';
  return 'bad';
}

const isOff = (st) => /취소|노쇼/.test(st || '');
/** 예약월 − 정산월. 음수면 당김, 양수면 이월. */
function gapOf(x) {
  const sm = x[5]; const dt = x[6];
  if (!sm || !dt) return 0;
  let g = Number(dt.slice(0, 2)) - Number((String(sm).match(/(\d+)월/) || [0, 0])[1]);
  if (g > 6) g -= 12;
  if (g < -6) g += 12;
  return g;
}

/**
 * ⚠️ Num·Editable 은 **반드시 컴포넌트 밖**에 있어야 한다.
 *    안에 두면 렌더마다 새 타입이 되어 React 가 매번 언마운트→마운트 하고,
 *    숫자를 한 글자 칠 때마다 입력칸이 사라진다.
 */
function Num({ label, value, cls }) {
  return (
    <span className="atg-nm">
      <span className="atg-l">{label}</span>
      <span className={`atg-n ${cls || ''}`}>{value}</span>
    </span>
  );
}

function Editable({ value, changed, onSet, wide }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);

  if (!editing) {
    return (
      <span
        className={`atg-ed${changed ? ' atg-chg' : ''}`}
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setEditing(true); } }}
      >{wide ? nf(value) : value}</span>
    );
  }
  const done = () => { setEditing(false); onSet(Math.max(0, Number(v) || 0)); };
  return (
    <input
      className={`atg-inl${wide ? ' atg-wide' : ''}`}
      type="number"
      min={0}
      value={v}
      autoFocus
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') done();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

export default function AdminTargetsPage() {
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [openCust, setOpenCust] = useState(null);
  const [openTy, setOpenTy] = useState(() => new Set());
  const [edits, setEdits] = useState({});
  const [sel, setSel] = useState(() => new Set());
  const [smEdits, setSmEdits] = useState({});
  const [smMemo, setSmMemo] = useState('');
  const [bulkTo, setBulkTo] = useState({});   // 일괄 지정 대상 월 — 리스트마다 따로 기억한다
  const [user, setUser] = useState(() => {
    // 기본값은 서버가 알려주는 로그인 키 아이디(who)로 잡는다 — load() 에서 채움
    try { return sessionStorage.getItem('tk_editor') || ''; } catch { return ''; }
  });
  const [toast, setToast] = useState('');
  const toastT = useRef(null);
  // 고객사 펼침 상단의 월별 이력 요약 — 고객사별 1회 로드 후 캐시
  const [sums, setSums] = useState({});
  const sumsRef = useRef({});

  const say = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 2200);
  }, []);

  const load = useCallback(async (m) => {
    setLoading(true);
    setErr('');
    try {
      const q = m ? `?month=${encodeURIComponent(m)}` : '';
      const r = await fetch(`/api/admin-targets${q}`, { headers: adminHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `불러오지 못했습니다 (${r.status})`);
      setData(j);
      if (!m) setMonth(j.months[1] || j.months[0]);
      // 수정자 기본값 = 로그인한 키의 아이디. 세션에서 고른 값이 지금 선택지에 있으면 존중,
      // 없으면(옛 직함 저장값 등) who 로 교체한다.
      const eds = j.editors || [];
      setUser((cur) => {
        if (cur && eds.includes(cur)) return cur;
        return (j.who && eds.includes(j.who) ? j.who : '') || j.who || eds[0] || cur || '';
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  const loadSummary = useCallback(async (name) => {
    if (sumsRef.current[name]) return;
    sumsRef.current[name] = 1;
    try {
      const r = await fetch(`/api/admin-targets?store=${encodeURIComponent(name)}`, { headers: adminHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `실패 (${r.status})`);
      setSums((p) => ({ ...p, [name]: j.months || [] }));
    } catch (e) {
      sumsRef.current[name] = 0;   // 다음 펼침에서 재시도
      setSums((p) => ({ ...p, [name]: { err: e.message || '월별 이력을 불러오지 못했습니다' } }));
    }
  }, []);

  const changeMonth = (m) => {
    setMonth(m);
    setOpenCust(null);
    setOpenTy(new Set());
    setSel(new Set());
    setSmEdits({});
    load(m);
  };

  const pickUser = (u) => {
    setUser(u);
    try { sessionStorage.setItem('tk_editor', u); } catch { /* noop */ }
  };

  /* ── 편집 중 값 우선 ─────────────────────────────────── */
  const goalOf = useCallback((r, m, k) => {
    const e = edits[keyOf(r.n, m)]?.g?.[k];
    return e !== undefined ? e : (r.m[m]?.t?.[k]?.[0] || 0);
  }, [edits]);
  const budOf = useCallback((r, m) => {
    const e = edits[keyOf(r.n, m)]?.bud;
    return e !== undefined ? e : (r.m[m]?.bud || 0);
  }, [edits]);
  const sumGoal = useCallback(
    (r, m) => TYPES.reduce((s, k) => s + Math.round(goalOf(r, m, k) * UNIT[k]), 0),
    [goalOf],
  );

  const liveOf = (r, m, k) => (r.m[m]?.d || []).filter((x) => x[4] === k && !isOff(x[3]));
  const offOf = (r, m, k) => (r.m[m]?.d || []).filter((x) => x[4] === k && isOff(x[3])).length;

  const rows = useMemo(() => {
    if (!data) return [];
    const el = data.el?.[month] ?? 1;
    const worst = (r) => Math.min(...TYPES.map((k) => {
      const g = goalOf(r, month, k);
      if (!g) return 9;
      return (r.m[month].t[k][1] / g) - el;
    }));
    return data.rows.filter((r) => r.m[month]).sort((a, b) => worst(a) - worst(b));
  }, [data, month, goalOf]);

  if (loading && !data) return <div className="atg atg-root"><div className="atg-load">불러오는 중…</div></div>;
  if (err && !data) return <div className="atg atg-root"><div className="atg-err">{err}</div></div>;
  if (!data) return null;

  const [prevM, , nextM] = around(month);
  const el = data.el?.[month] ?? elapsedOf(month);

  /* ── 저장 ────────────────────────────────────────────── */
  const post = async (body) => {
    const r = await fetch('/api/admin-targets', {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...body, by: user }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `실패 (${r.status})`);
    return j;
  };

  const saveTargets = async (r, m) => {
    const ed = edits[keyOf(r.n, m)];
    const rid = r.m[m]?.rid;
    if (!ed || !rid) return;
    setBusy(true);
    try {
      const goals = {};
      TYPES.forEach((k) => { if (ed.g?.[k] !== undefined) goals[k] = ed.g[k]; });
      await post({ action: 'targets', rid, goals, budget: ed.bud, memo: ed.memo || '' });
      setEdits((p) => { const q = { ...p }; delete q[keyOf(r.n, m)]; return q; });
      say('저장했습니다');
      await load(month);
    } catch (e) { say(e.message); } finally { setBusy(false); }
  };

  const makeContract = async (r, m) => {
    setBusy(true);
    try {
      const j = await post({ action: 'ensure', name: r.n, month: m });
      say(j.mode === 'created' ? `${mo(m)} 계약을 만들었습니다`
        : j.mode === 'revived' ? `${mo(m)} 빈 계약을 되살렸습니다` : '이미 계약이 있습니다');
      await load(month);
    } catch (e) { say(e.message); } finally { setBusy(false); }
  };

  const commitMove = async (detRows) => {
    const jobs = detRows
      .map((x) => ({ id: x[9], from: x[5], to: smEdits[x[9]] }))
      .filter((j) => j.to && j.to !== j.from);
    if (!jobs.length) return;
    const lines = jobs.map((j) => `  ${mo(j.from)} → ${mo(j.to)}`).join('\n');
    const ok = window.confirm(
      [`정산월을 바꿉니다 (${jobs.length}건)`, '', lines, '',
        '정산월이 바뀌면 그 건의 실적이 다른 달 계약으로 옮겨갑니다.',
        `기록: ${user}${smMemo ? ` · ${smMemo}` : ''}`, '', '진행할까요?'].join('\n'),
    );
    if (!ok) return;
    setBusy(true);
    try {
      // 목적지가 다른 건이 섞여 있어도 되도록 달별로 묶어 던진다
      const byTo = {};
      jobs.forEach((j) => { (byTo[j.to] = byTo[j.to] || []).push(j.id); });
      for (const [to, ids] of Object.entries(byTo)) {
         
        await post({ action: 'settle', ids, to, memo: smMemo });
      }
      setSmEdits({});
      setSel(new Set());
      setSmMemo('');
      say(`${jobs.length}건 옮겼습니다`);
      await load(month);
    } catch (e) { say(e.message); } finally { setBusy(false); }
  };

  /* ── 조각 ────────────────────────────────────────────── */
  const links = (r, m, mm) => {
    if (!mm.rid) return null;
    const L = [['달력', '📅', `${HOST}/schedule?campaignId=${mm.rid}`]];
    if (mm.ptk) L.push(['협력사', '🤝', `${HOST}/partner?t=${mm.ptk}`]);
    return (
      <span className="atg-lks" onClick={(e) => e.stopPropagation()} role="presentation">
        {L.map(([n, ic, u]) => (
          <a
            key={n}
            className={`atg-lk atg-lk-${n}`}
            href={u}
            target="_blank"
            rel="noopener noreferrer"
            title={`클릭하면 링크가 복사됩니다 — ${u}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              navigator.clipboard.writeText(u).then(() => say(`링크 복사됨 — ${n}`))
                .catch(() => window.open(u, '_blank', 'noopener'));
            }}
          ><i>{ic}</i>{n}</a>
        ))}
        {mm.ptk && !mm.inc && (
          <span className="atg-lk atg-warnx" title="협력사포함 체크가 꺼져 있어 이 달은 묶음에서 빠집니다">묶음 제외</span>
        )}
      </span>
    );
  };

  const detail = (r, m, k) => {
    const tkey = `${keyOf(r.n, m)}|${k}`;
    const off = offOf(r, m, k);
    const list = liveOf(r, m, k).slice().sort((a, b) => {
      const sa = a[2] === '✅' ? 0 : 1; const sb = b[2] === '✅' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return String(a[6] || '').localeCompare(String(b[6] || ''));
    });
    if (!list.length) {
      return <div className="atg-det atg-empty">{k} 예약이 없습니다.{off ? ` (취소·노쇼 ${off}건은 제외)` : ''}</div>;
    }
    const ids = list.map((x) => x[9]);   // 레코드 ID — Shoot_ID 는 비거나 겹칠 수 있다
    const pend = list.filter((x) => smEdits[x[9]] && smEdits[x[9]] !== x[5]);
    const picked = ids.filter((i) => sel.has(i));
    const opts = around(m);
    const before = list.filter((x) => gapOf(x) < 0).length;
    const after = list.filter((x) => gapOf(x) > 0).length;

    const setOne = (id, from, to) => setSmEdits((p) => {
      const q = { ...p };
      if (to === from) delete q[id]; else q[id] = to;
      return q;
    });

    return (
      <div className="atg-det" onClick={(e) => e.stopPropagation()} role="presentation">
        <div className="atg-det-sc">
          <table className="atg-fix">
            <colgroup>
              <col className="atg-c1" /><col className="atg-c2" /><col className="atg-c3" /><col className="atg-c4" />
              <col className="atg-c5" /><col className="atg-c6" /><col className="atg-c7" /><col className="atg-c8" />
              <col className="atg-c9" /><col className="atg-c0" />
            </colgroup>
            <thead>
              <tr>
                <th className="atg-ck">
                  <input
                    type="checkbox"
                    checked={picked.length === ids.length && ids.length > 0}
                    onChange={(e) => setSel((p) => {
                      const q = new Set(p);
                      ids.forEach((i) => (e.target.checked ? q.add(i) : q.delete(i)));
                      return q;
                    })}
                  />
                </th>
                <th className="atg-no">#</th><th>담당</th><th>제출</th><th>진행상태</th>
                <th>정산월</th><th>예약일</th><th>XHS ID</th><th className="atg-lead">대표인플</th><th aria-label="여백" />
              </tr>
            </thead>
            <tbody>
              {list.map((x, i) => {
                const [, who, sub, st, , sm, dt, xhs, lead, id] = x;
                const g = gapOf(x);
                const to = smEdits[id];
                return (
                  <tr key={id || i} className={`${g < 0 ? 'atg-mism atg-mism-b ' : (g > 0 ? 'atg-mism atg-mism-a ' : '')}${(i + 1) % 10 === 0 ? 'atg-tenth' : ''}`}>
                    <td className="atg-ck">
                      <input
                        type="checkbox"
                        checked={sel.has(id)}
                        onChange={(e) => setSel((p) => {
                          const q = new Set(p);
                          if (e.target.checked) q.add(id); else q.delete(id);
                          return q;
                        })}
                      />
                    </td>
                    <td className="atg-no">{i + 1}</td>
                    <td className="atg-mono">{who}</td>
                    <td>{sub || '—'}</td>
                    <td><span className={`atg-pill ${st.includes('변경') ? 'atg-p-chg' : 'atg-p-conf'}`}>{st}</span></td>
                    <td className="atg-mono atg-smc">
                      <select
                        className={`atg-smx${to && to !== sm ? ' atg-pend' : ''}`}
                        value={to || sm}
                        title={to && to !== sm ? `${mo(sm)} → ${mo(to)}` : sm}
                        onChange={(e) => setOne(id, sm, e.target.value)}
                      >
                        {around(sm).map((o) => <option key={o} value={o}>{mo(o)}</option>)}
                      </select>
                    </td>
                    <td className="atg-mono">{dt}</td>
                    <td className="atg-xh">{xhs || '—'}</td>
                    <td className={`atg-xh atg-lead${lead && lead === xhs ? ' atg-self' : ''}`}>{lead || '—'}</td>
                    <td />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(picked.length > 0 || pend.length > 0) && (
          <div className="atg-det-bulk">
            {picked.length > 0 && (
              <>
                <span className="atg-bk">선택 <b>{picked.length}</b>건</span>
                <span className="atg-bk">
                  정산월{' '}
                  <select
                    className="atg-bsel"
                    value={bulkTo[tkey] || m}
                    onChange={(e) => setBulkTo((p) => ({ ...p, [tkey]: e.target.value }))}
                  >
                    {opts.map((o) => <option key={o} value={o}>{mo(o)}</option>)}
                  </select>{' '}로
                </span>
                <button
                  className="atg-ghost"
                  type="button"
                  onClick={() => {
                    const v = bulkTo[tkey] || m;
                    setSmEdits((p) => {
                      const q = { ...p };
                      list.forEach((x) => {
                        if (!sel.has(x[9])) return;
                        if (v === x[5]) delete q[x[9]]; else q[x[9]] = v;
                      });
                      return q;
                    });
                    setSel(new Set());
                  }}
                >일괄 지정</button>
                <button className="atg-ghost" type="button" onClick={() => setSel((p) => {
                  const q = new Set(p); ids.forEach((i) => q.delete(i)); return q;
                })}>선택 해제</button>
              </>
            )}
            {pend.length > 0 && (
              <>
                <span className="atg-bk atg-pend">대기 <b>{pend.length}</b>건</span>
                <select className="atg-usr" value={user} onChange={(e) => pickUser(e.target.value)}>
                  {(data.editors || []).map((u) => <option key={u}>{u}</option>)}
                </select>
                <input
                  className="atg-memo"
                  placeholder="변경 사유 (이력에 남습니다)"
                  value={smMemo}
                  onChange={(e) => setSmMemo(e.target.value)}
                />
                <button className="atg-ghost" type="button" onClick={() => setSmEdits((p) => {
                  const q = { ...p }; ids.forEach((i) => delete q[i]); return q;
                })}>되돌리기</button>
                <button className="atg-act" type="button" disabled={busy} onClick={() => commitMove(list)}>변경 확정</button>
              </>
            )}
          </div>
        )}

        <div className="atg-det-f">
          유효 {list.length}건{off ? ` · 취소·노쇼 ${off}건 제외` : ''} · 제출 완료 {list.filter((x) => x[2] === '✅').length}건
          {(before || after) ? (
            <> · <span className="atg-lg-b">당김 {before}</span> <span className="atg-lg-a">이월 {after}</span></>
          ) : null}
        </div>
      </div>
    );
  };

  const tyLine = (r, m, k, clickable) => {
    const a = r.m[m]?.t?.[k];
    if (!a) {
      return (
        <div className="atg-ty atg-empty2" key={k}>
          <span className="atg-ty-l">{k}</span>
          <span className="atg-nums atg-none">계약 없음</span><span />
        </div>
      );
    }
    const mel = data.el?.[m] ?? elapsedOf(m);
    const g = goalOf(r, m, k);
    const [, v, u, cx] = a;
    const left = Math.max(g - v, 0);
    const chg = edits[keyOf(r.n, m)]?.g?.[k] !== undefined;
    const rate = g ? v / g : null;
    const tn = tone(g ? rate - mel : null);
    const pct = g ? (Math.min(rate, 1.4) / 1.4) * 100 : 0;
    const mk = (Math.min(mel, 1) / 1.4) * 100;
    const tk = `${keyOf(r.n, m)}|${k}`;
    const open = openTy.has(tk);
    const cnt = liveOf(r, m, k).length;

    return (
      <React.Fragment key={k}>
        <div
          className={`atg-ty${clickable ? ' atg-clk' : ''}${open ? ' atg-open' : ''}`}
          role={clickable ? 'button' : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? (e) => {
            if (e.target.closest('.atg-ed') || e.target.tagName === 'INPUT') return;
            e.stopPropagation();
            setOpenTy((p) => { const q = new Set(p); if (q.has(tk)) q.delete(tk); else q.add(tk); return q; });
          } : undefined}
          onKeyDown={clickable ? (e) => {
            if (e.key !== 'Enter') return;
            e.stopPropagation();
            setOpenTy((p) => { const q = new Set(p); if (q.has(tk)) q.delete(tk); else q.add(tk); return q; });
          } : undefined}
        >
          <span className="atg-ty-l">{clickable && <span className="atg-cv">{open ? '▾' : '▸'}</span>}{k}</span>
          <span className="atg-nums">
            <span className="atg-nm">
              <span className="atg-l">목표</span>
              <span className="atg-n">
                <Editable
                  value={g}
                  changed={chg}
                  onSet={(nv) => setEdits((p) => {
                    const kk = keyOf(r.n, m);
                    const cur = p[kk] || { g: {}, memo: '' };
                    return { ...p, [kk]: { ...cur, g: { ...cur.g, [k]: nv } } };
                  })}
                />
              </span>
            </span>
            <Num label="섭외" value={v} />
            <Num label="업완" value={u} />
            <Num label="취소" value={cx} cls={cx ? 'atg-bad' : ''} />
            <Num label="잔여" value={left} cls={left > 0 ? 'atg-warn' : 'atg-ok'} />
            {clickable && cnt > 0 && <span className="atg-nm atg-cnt2">리스트 {cnt}건</span>}
          </span>
          <span className={`atg-ty-p atg-${tn}`}>{g ? `${Math.round(rate * 100)}%` : '—'}</span>
          <span className="atg-bar">
            <i className={`atg-bg-${tn || 'warn'}`} style={{ width: `${pct}%` }} />
            {g ? <span className="atg-mk" style={{ left: `${mk}%` }} /> : null}
          </span>
        </div>
        {open && detail(r, m, k)}
      </React.Fragment>
    );
  };

  const money = (r, m) => {
    const bud = budOf(r, m); const tg = sumGoal(r, m); const ac = r.m[m]?.ac || 0;
    const bc = edits[keyOf(r.n, m)]?.bud !== undefined;
    return (
      <div className="atg-money">
        <div className="atg-ml"><span className="atg-k">예산</span><span className="atg-v">
          <Editable
            value={bud}
            changed={bc}
            wide
            onSet={(nv) => setEdits((p) => {
              const kk = keyOf(r.n, m);
              return { ...p, [kk]: { ...(p[kk] || { g: {}, memo: '' }), bud: nv } };
            })}
          />
        </span></div>
        <div className="atg-ml"><span className="atg-k">목표</span><span className="atg-v">{nf(tg)}</span></div>
        <div className="atg-ml"><span className="atg-k">실적</span><span className="atg-v">{nf(ac)}</span></div>
        <div className="atg-ml"><span className="atg-k">차액</span><span className={`atg-v atg-sm ${bud - tg >= 0 ? '' : 'atg-bad'}`}>{nf(bud - tg)}</span></div>
      </div>
    );
  };

  const rowBox = (r, m, sub) => {
    const mm = r.m[m];
    if (!mm) {
      return (
        <div className="atg-r atg-sub atg-ghostrow" key={m}>
          <div className="atg-grid">
            <div>
              <div className="atg-r-n"><span className="atg-mo">{m}</span><span className="atg-chip atg-c-n">계약 없음</span></div>
              <span className="atg-r-memo">이 달 계약을 만들면 목표를 넣고 다른 달 예약을 이 달로 옮길 수 있습니다.</span>
            </div>
            <div>
              <button className="atg-ghost atg-mk2" type="button" disabled={busy} onClick={() => makeContract(r, m)}>
                ＋ {mo(m)} 계약 만들기
              </button>
            </div>
          </div>
        </div>
      );
    }
    const noGoal = !TYPES.some((k) => goalOf(r, m, k));
    const ed = edits[keyOf(r.n, m)];
    const chips = (
      <>
        {mm.jong ? <span className="atg-chip atg-c-j">종합</span> : null}
        {mm.add ? <span className="atg-chip atg-c-a">추가</span> : null}
        {!sub && r.p && r.p !== '직영' ? <span className="atg-chip atg-c-p">{r.p}</span> : null}
      </>
    );
    return (
      <div
        className={`atg-r${sub ? ' atg-sub' : ''}`}
        key={m}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if (e.target.closest('.atg-det') || e.target.closest('.atg-savebar')
            || e.target.closest('.atg-ed') || e.target.closest('.atg-lks')
            || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT'
            || e.target.tagName === 'BUTTON') return;
          if (sub) return;
          if (openCust !== r.n) loadSummary(r.n);
          setOpenCust((p) => (p === r.n ? null : r.n));
          setOpenTy(new Set());
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || sub) return;
          if (openCust !== r.n) loadSummary(r.n);
          setOpenCust((p) => (p === r.n ? null : r.n));
        }}
      >
        <div className="atg-grid">
          <div>
            <div className="atg-r-n">
              {!sub && <span className="atg-cv">{openCust === r.n ? '▾' : '▸'}</span>}
              {sub ? <span className="atg-mo">{m}</span> : r.n}
              {chips}
              {links(r, m, mm)}
              <span className="atg-cnt">예약 {mm.n}건</span>
            </div>
            {money(r, m)}
            {noGoal && <span className="atg-r-memo atg-bad">⚠ 목표 없이 실적만 — 계약월 확인</span>}
            {mm.memo && <span className="atg-r-memo">{mm.memo}</span>}
            {mm.hist && <span className="atg-r-memo">📝 {mm.hist}</span>}
          </div>
          <div className="atg-tys">{TYPES.map((k) => tyLine(r, m, k, sub || openCust === r.n))}</div>
        </div>
        {ed && (
          <div className="atg-savebar" onClick={(e) => e.stopPropagation()} role="presentation">
            <span className="atg-calc">
              합산_목표 <b>{nf(TYPES.reduce((s, k) => s + Math.round((mm.t?.[k]?.[0] || 0) * UNIT[k]), 0))}</b>
              {' → '}<b>{nf(sumGoal(r, m))}</b>
            </span>
            <input
              className="atg-memo"
              placeholder="수정 사유 (이력에 남습니다)"
              value={ed.memo || ''}
              onChange={(e) => setEdits((p) => ({ ...p, [keyOf(r.n, m)]: { ...p[keyOf(r.n, m)], memo: e.target.value } }))}
            />
            <select className="atg-usr" value={user} onChange={(e) => pickUser(e.target.value)}>
              {(data.editors || []).map((u) => <option key={u}>{u}</option>)}
            </select>
            <button className="atg-ghost" type="button" onClick={() => setEdits((p) => {
              const q = { ...p }; delete q[keyOf(r.n, m)]; return q;
            })}>되돌리기</button>
            <button className="atg-act" type="button" disabled={busy} onClick={() => saveTargets(r, m)}>확정 · 저장</button>
          </div>
        )}
      </div>
    );
  };

  /* ── 월별 이력 요약 스트립 (고객사 펼침 상단) ─────────── */
  const summaryStrip = (r) => {
    const s = sums[r.n];
    if (!s) return <div className="atg-mss-empty">월별 이력 불러오는 중…</div>;
    if (s.err) return <div className="atg-mss-empty atg-bad">{s.err}</div>;
    if (!s.length) return <div className="atg-mss-empty">월별 기록이 없습니다</div>;
    // 아래 실적 리스트와 같은 달을 중심으로 앞뒤 2개월만 (Owner 지정 — 7월이면 5~9월)
    const sp = parseMonth(month);
    const selIdx = sp ? sp.y * 12 + sp.n : null;
    const win = selIdx === null ? s : s.filter((x) => {
      const p = parseMonth(x.mon);
      return p && Math.abs((p.y * 12 + p.n) - selIdx) <= 2;
    });
    if (!win.length) return <div className="atg-mss-empty">{month} 앞뒤 2개월 기록이 없습니다</div>;
    return (
      <div className="atg-mss">
        {win.map((x) => {
          const cur = x.mon === month;
          const rate = x.tg ? Math.round((x.ac / x.tg) * 100) : null;
          return (
            <button
              key={x.mon}
              type="button"
              className={`atg-msc${cur ? ' atg-on' : ''}`}
              title={cur ? '지금 보는 달' : `${x.mon}로 이동`}
              onClick={(e) => {
                e.stopPropagation();
                if (cur) return;
                changeMonth(x.mon);
                setOpenCust(r.n);   // 달을 옮겨도 이 고객사는 펼친 채 유지
              }}
            >
              <span className="atg-msc-m">{x.mon}<span className="atg-msc-p">{rate !== null ? `${rate}%` : '—'}</span></span>
              {(() => {
                const tys = TYPES.filter((k) => {
                  const a = x.t?.[k];
                  return a && (a[0] || a[1] || a[2]);
                });
                if (!tys.length) return null;
                return (
                  <span className="atg-msc-tb">
                    <span className="atg-msc-c atg-msc-h" aria-hidden="true" />
                    <span className="atg-msc-c atg-msc-h">목</span>
                    <span className="atg-msc-c atg-msc-h">섭</span>
                    <span className="atg-msc-c atg-msc-h">업</span>
                    <span className="atg-msc-c atg-msc-h">취</span>
                    {tys.map((k) => {
                      const [g, v, u, cx] = x.t[k];
                      const dv = g ? v - g : 0;   // 섭외 부족량 (음수 = 모자람)
                      const du = g ? u - g : 0;   // 업완 부족량
                      return (
                        <React.Fragment key={k}>
                          <span className="atg-msc-c atg-msc-k">{k}</span>
                          <span className="atg-msc-c">{g || '—'}</span>
                          <span className="atg-msc-c"><b>{v}</b>{dv < 0 ? <i className="atg-msc-d">({dv})</i> : null}</span>
                          <span className="atg-msc-c"><b>{u}</b>{du < 0 ? <i className="atg-msc-d">({du})</i> : null}</span>
                          <span className={`atg-msc-c${cx ? ' atg-c' : ''}`}>{cx || 0}</span>
                        </React.Fragment>
                      );
                    })}
                  </span>
                );
              })()}
              <span className="atg-msc-f">실적 {nf(x.ac)}{x.bud ? ` · 예산 ${nf(x.bud)}` : ''}</span>
            </button>
          );
        })}
      </div>
    );
  };

  /* ── 상단 합계 ───────────────────────────────────────── */
  const T = {}; TYPES.forEach((k) => { T[k] = { g: 0, v: 0, u: 0, c: 0 }; });
  let bud = 0; let tg = 0; let ac = 0;
  rows.forEach((r) => {
    const mm = r.m[month];
    bud += budOf(r, month); tg += sumGoal(r, month); ac += mm.ac || 0;
    TYPES.forEach((k) => {
      const a = mm.t?.[k]; if (!a) return;
      T[k].g += goalOf(r, month, k); T[k].v += a[1]; T[k].u += a[2]; T[k].c += a[3] || 0;
    });
  });

  return (
    <div className="atg atg-root">
      <div className="atg-ui">
        <div className="atg-ui-top">
          {(data.months || []).map((m) => (
            <button key={m} type="button" className={`atg-sel${m === month ? ' atg-on' : ''}`} onClick={() => changeMonth(m)}>{m}</button>
          ))}
          <span className="atg-sum">권장 진도 <b>{Math.round(el * 100)}%</b></span>
          <div className="atg-right">
            {loading && <span className="atg-sum">불러오는 중…</span>}
            {err && <span className="atg-sum atg-bad">{err}</span>}
            <span className="atg-sum">수정자</span>
            <select className="atg-usr" value={user} onChange={(e) => pickUser(e.target.value)}>
              {(data.editors || []).map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div className="atg-head">
          <div className="atg-grid">
            <div className="atg-money">
              <div className="atg-ml"><span className="atg-k">예산</span><span className="atg-v">{nf(bud)}</span></div>
              <div className="atg-ml"><span className="atg-k">목표</span><span className="atg-v">{nf(tg)}</span></div>
              <div className="atg-ml"><span className="atg-k">실적</span><span className="atg-v">{nf(ac)}</span></div>
              <div className="atg-ml"><span className="atg-k">차액</span><span className={`atg-v atg-sm ${bud - tg >= 0 ? '' : 'atg-bad'}`}>{nf(bud - tg)}</span></div>
            </div>
            <div className="atg-tys">
              {TYPES.map((k) => {
                const left = Math.max(T[k].g - T[k].v, 0);
                return (
                  <div className="atg-ty" key={k}>
                    <span className="atg-ty-l">{k}</span>
                    <span className="atg-nums">
                      <Num label="목표" value={T[k].g} />
                      <Num label="섭외" value={T[k].v} />
                      <Num label="업완" value={T[k].u} />
                      <Num label="취소" value={T[k].c} cls={T[k].c ? 'atg-bad' : ''} />
                      <Num label="잔여" value={left} cls={left > 0 ? 'atg-warn' : 'atg-ok'} />
                    </span>
                    <span className="atg-ty-p">{T[k].g ? `${Math.round((T[k].v / T[k].g) * 100)}%` : '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="atg-list">
          {rows.map((r) => (openCust === r.n
            ? (
              <div className="atg-expand" key={r.n}>
                {summaryStrip(r)}
                {rowBox(r, prevM, true)}
                {rowBox(r, month, false)}
                {rowBox(r, nextM, true)}
              </div>
            )
            : <React.Fragment key={r.n}>{rowBox(r, month, false)}</React.Fragment>))}
          {!rows.length && <div className="atg-load">{month} 계약이 없습니다.</div>}
        </div>
      </div>

      <div className={`atg-toast${toast ? ' atg-on' : ''}`}>{toast}</div>
    </div>
  );
}
