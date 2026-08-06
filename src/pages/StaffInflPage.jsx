import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { staffHeaders } from '../lib/staffKey';
import StaffNav from '../components/StaffNav';
import InflRegModal from '../components/InflRegModal';
import './StaffInflPage.css';

/* 전달링크 복사 — 위챗에 붙여넣는 용도 */
function CopyLink({ url }) {
  const [ok, setOk] = useState(false);
  if (!url) return <span className="sif-mut">—</span>;
  return (
    <span className="sif-copywrap" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`sif-copy ${ok ? 'ok' : ''}`}
        title={`인플 전달용 제출 링크 복사\n${url}`}
        onClick={async () => {
          try { await navigator.clipboard.writeText(url); }
          catch {
            const ta = document.createElement('textarea');
            ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
          }
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        }}
      >{ok ? '✓ 복사됨' : '✂ 링크복사'}</button>
      <a className="sif-lnk" href={url} target="_blank" rel="noreferrer" title="열어보기">↗</a>
    </span>
  );
}

/**
 * 인플루언서 보드 (/staff/infl) — 조회 + 신규 등록 + **인플별 업로드 지연 추적**.
 *
 * 고객사 관점 지연은 진도 보드가, 인플 관점은 여기가 담당한다 (Owner 2026-08-06):
 * 리스트에 방문·업로드·지연이 바로 보이고, 행을 클릭하면 그 인플이 어느 매장을
 * 언제 갔고 뭘 냈고 뭐가 밀렸는지 상세가 펼쳐진다.
 */
export default function StaffInflPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);          // 마스터 (INFL_DB)
  const [stats, setStats] = useState(null);        // 진행_DB_OLD 집계
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [mgr, setMgr] = useState('');
  const [lateOnly, setLateOnly] = useState(false);
  const [sort, setSort] = useState('late');        // late | visits | pal
  const [open, setOpen] = useState(null);          // 펼친 인플 id
  const [reg, setReg] = useState(params.get('new') === '1');

  const load = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/staff-resv?mode=infls', { headers: staffHeaders() }),
        fetch('/api/staff-infl', { headers: staffHeaders() }),
      ]);
      const b1 = await r1.json().catch(() => ({}));
      const b2 = await r2.json().catch(() => ({}));
      if (!r1.ok) throw new Error(b1.error || `서버 오류 (${r1.status})`);
      if (!r2.ok) throw new Error(b2.error || `통계 오류 (${r2.status})`);
      setData(b1);
      setStats(b2);
    } catch (e) {
      setError(e.message || '불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (params.get('new') === '1') setReg(true);
  }, [params]);

  function closeReg() {
    setReg(false);
    if (params.get('new')) {
      params.delete('new');
      setParams(params, { replace: true });
    }
  }

  const statMap = useMemo(() => {
    const m = new Map();
    (stats?.rows || []).forEach((r) => m.set(r.id, r));
    return m;
  }, [stats]);

  const kpi = useMemo(() => {
    const rows = stats?.rows || [];
    return {
      lateInfl: rows.filter((r) => r.late > 0).length,
      lateCnt: rows.reduce((s, r) => s + r.late, 0),
      pendCnt: rows.reduce((s, r) => s + r.pend, 0),
    };
  }, [stats]);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const merged = (data?.infls || []).map((i) => {
      const s = statMap.get(i.id);
      return {
        ...i,
        visits: s?.visits || 0,
        uploads: s?.uploads || 0,
        pend: s?.pend || 0,
        late: s?.late || 0,
        maxLate: s?.maxLate || 0,
        d: s?.d || [],
      };
    })
      .filter((i) => !mgr || i.mgr === mgr)
      .filter((i) => !lateOnly || i.late > 0)
      .filter((i) => !qq
        || i.xid.toLowerCase().includes(qq)
        || i.wc.toLowerCase().includes(qq)
        || i.nick.toLowerCase().includes(qq));
    if (sort === 'pal') merged.sort((a, b) => b.pal - a.pal);
    else if (sort === 'visits') merged.sort((a, b) => (b.visits - a.visits) || (b.pal - a.pal));
    else merged.sort((a, b) => (b.late - a.late) || (b.maxLate - a.maxLate) || (b.pend - a.pend) || (b.visits - a.visits));
    return merged;
  }, [data, statMap, q, mgr, lateOnly, sort]);

  return (
    <div className="sif-root">
      <div className="sif-wrap">
        <header className="sif-head">
          <div className="sif-title">
            <span className="sif-dot" />
            <h1>인플루언서 보드</h1>
            {data && <span className="sif-cnt">{list.length} / {data.infls.length}명</span>}
            <button type="button" className="sif-newbtn" onClick={() => setReg(true)}>＋ 신규 등록</button>
          </div>
          <StaffNav current="infl" />
        </header>

        {stats && (
          <div className="sif-kpis">
            <span>🔴 지연 인플 <b>{kpi.lateInfl}</b>명</span>
            <span>지연 <b className="bad2">{kpi.lateCnt}</b>건</span>
            <span>제출대기 <b>{kpi.pendCnt}</b>건</span>
            <span className="sif-kpi-hint">최근 3개월 + 과거 미제출 전부 · 지연 = 방문 후 7일 초과</span>
          </div>
        )}

        <div className="sif-tools">
          <input
            className="sif-search"
            placeholder="XHS_ID·위챗·닉네임 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="sif-seg">
            {['', 'HH', 'LH', 'AN', 'FB'].map((r) => (
              <button key={r || '전체'} className={mgr === r ? 'on' : ''} onClick={() => setMgr(r)}>
                {r || '섭외 전체'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`sif-latebtn ${lateOnly ? 'on' : ''}`}
            onClick={() => setLateOnly((v) => !v)}
          >🔴 지연만</button>
          <div className="sif-seg">
            {[['late', '지연순'], ['visits', '방문순'], ['pal', '팔로워순']].map(([v, l]) => (
              <button key={v} className={sort === v ? 'on' : ''} onClick={() => setSort(v)}>{l}</button>
            ))}
          </div>
        </div>

        {error && <div className="sif-error">{error}</div>}
        {!data && !error && <div className="sif-loading">불러오는 중…</div>}

        {data && (
          <div className="sif-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>XHS_ID</th><th>섭외</th><th className="num">팔로워</th>
                  <th className="num">방문</th><th className="num">업로드</th><th>지연</th>
                  <th>전달링크</th><th>위챗</th><th>지역</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 300).map((i) => (
                  <React.Fragment key={i.id}>
                    <tr
                      className={`sif-r ${open === i.id ? 'on' : ''} ${i.late > 0 ? 'haslate' : ''}`}
                      onClick={() => setOpen(open === i.id ? null : i.id)}
                    >
                      <td className="xid">
                        {i.link
                          ? (
                            <a href={i.link} target="_blank" rel="noreferrer" title={i.link}
                              onClick={(e) => e.stopPropagation()}>{i.xid}</a>
                          )
                          : i.xid}
                      </td>
                      <td>{i.mgr || '—'}</td>
                      <td className="num">{i.pal ? i.pal.toLocaleString() : '—'}</td>
                      <td className="num">{i.visits || '—'}</td>
                      <td className="num">
                        {i.visits
                          ? <span className={i.uploads >= i.visits ? 'ok2' : ''}>{i.uploads}<s>/{i.visits}</s></span>
                          : '—'}
                      </td>
                      <td>
                        {i.late > 0
                          ? <span className="sif-late-badge">{i.late}건 · 최장 D+{i.maxLate}</span>
                          : i.pend > 0
                            ? <span className="sif-pend-badge">대기 {i.pend}</span>
                            : i.visits ? <span className="ok2">✓</span> : '—'}
                      </td>
                      <td><CopyLink url={i.give} /></td>
                      <td>{i.wc || '—'}</td>
                      <td>{i.region || '—'}</td>
                    </tr>
                    {open === i.id && (
                      <tr className="sif-detail-tr">
                        <td colSpan={9}>
                          {i.d.length === 0
                            ? <div className="sif-det-empty">최근 3개월 내 방문 기록이 없습니다.</div>
                            : (
                              <table className="sif-det">
                                <thead>
                                  <tr>
                                    <th>매장</th><th>정산월</th><th>담당</th><th>유형</th>
                                    <th>방문일</th><th>상태</th><th>제출</th><th className="num">기한</th><th>결과링크</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {i.d.map((d, idx) => (
                                    <tr key={idx} className={d.dl !== null && d.dl < 0 ? 'late' : ''}>
                                      <td>{d.store || '—'}</td>
                                      <td>{d.mon || '—'}</td>
                                      <td>{d.mgr || '—'}</td>
                                      <td>{d.ty || '—'}</td>
                                      <td>{d.visit || '—'}</td>
                                      <td>{d.st || '—'}</td>
                                      <td>{d.submitted ? <span className="ok2">완료</span> : '미제출'}</td>
                                      <td className="num">
                                        {d.dl === null ? '—'
                                          : d.dl < 0 ? <span className="bad2">D+{-d.dl}</span>
                                            : <span>D-{d.dl}</span>}
                                      </td>
                                      <td>
                                        {[['小红', d.rx], ['大众', d.rd], ['抖音', d.ry]]
                                          .filter(([, u]) => u)
                                          .map(([l, u]) => (
                                            <a key={l} className="sif-lnk" href={u} target="_blank" rel="noreferrer"
                                              title={u} onClick={(e) => e.stopPropagation()}>{l}</a>
                                          ))}
                                        {!d.rx && !d.rd && !d.ry && '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {list.length > 300 && (
              <div className="sif-more">상위 300명만 표시 — 검색으로 좁혀 주세요</div>
            )}
          </div>
        )}

        {reg && (
          <InflRegModal
            mgrs={['HH', 'LH', 'AN', 'FB']}
            defaultMgr=""
            onClose={closeReg}
            onCreated={(infl) => { closeReg(); setQ(infl.xid); load(); }}
            onPickExisting={() => closeReg()}
          />
        )}
      </div>
    </div>
  );
}
