import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { staffHeaders } from '../lib/staffKey';
import StaffNav from '../components/StaffNav';
import './StaffCastingPage.css';

/**
 * 체험단 선발 (/staff/casting) — 캠페인 모집사이트(IB_Casting) 지원자 심사.
 *
 * 왼쪽에서 캠페인(매장)을 고르면 그 캠페인의 지원자가 최신순으로 나온다.
 * 선발/탈락은 즉시 Airtable 에 반영되고, 선정 통보는 위챗 수동(STEP 1)이다 —
 * 그래서 선발된 행에만 위챗 ID 를 노출해 통보 동선을 짧게 한다.
 */

const BUCKET_LABEL = {
  new: '신규', approved: '선발', rejected: '탈락', reviewing: '심사중',
};

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function StaffCastingPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState('');            // 선택된 campaign slug
  const [filter, setFilter] = useState('all');   // all | new | approved | rejected
  const [openMsg, setOpenMsg] = useState('');    // 메시지 펼친 지원자 id
  const [busy, setBusy] = useState('');          // 처리 중인 지원자 id

  const load = useCallback(async () => {
    setError('');
    try {
      const resp = await fetch('/api/staff-casting', { headers: staffHeaders() });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
      const d = await resp.json();
      setData(d);
      // 선택 유지가 기본. 처음이거나 고르던 캠페인이 사라졌을 때만 첫 항목으로.
      setSel((prev) => (d.campaigns.some((c) => c.slug === prev)
        ? prev
        : (d.campaigns[0]?.slug || '')));
    } catch (e) {
      setError(e.message || '불러오기 실패');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const camp = useMemo(
    () => (data ? data.campaigns.find((c) => c.slug === sel) : null),
    [data, sel],
  );

  const rows = useMemo(() => {
    if (!camp) return [];
    if (filter === 'all') return camp.applicants;
    return camp.applicants.filter((a) => a.bucket === filter);
  }, [camp, filter]);

  async function act(applicant, action) {
    const label = action === 'approve' ? '선발' : action === 'reject' ? '탈락' : '신규로 되돌리기';
    if (!window.confirm(`${applicant.name || applicant.xhsName} — ${label} 처리할까요?`)) return;
    setBusy(applicant.id);
    try {
      const resp = await fetch('/api/staff-casting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...staffHeaders() },
        body: JSON.stringify({ id: applicant.id, action }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
      await load();
    } catch (e) {
      setError(e.message || '처리 실패');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="scast-root">
      <div className="scast-wrap">
      <StaffNav current="casting" />
      <header className="scast-head">
        <h1>체험단 선발</h1>
        <p className="scast-sub">
          모집사이트 지원자를 캠페인별로 심사합니다. 선정 통보는 위챗으로 직접 —
          선발된 행에 위챗 ID가 표시됩니다.
        </p>
      </header>

      {error && <div className="scast-err">{error} <button type="button" onClick={load}>다시 시도</button></div>}
      {!data && !error && <div className="scast-loading">불러오는 중…</div>}

      {data && (
        <div className="scast-body">
          <aside className="scast-camps">
            {data.campaigns.length === 0 && <div className="scast-empty">지원자가 있는 캠페인이 없습니다.</div>}
            {data.campaigns.map((c) => (
              <button
                type="button"
                key={c.slug}
                className={`scast-camp ${sel === c.slug ? 'on' : ''}`}
                onClick={() => { setSel(c.slug); setFilter('all'); }}
              >
                <span className="scast-camp-title">{c.title}</span>
                <span className="scast-camp-meta">
                  모집 {c.max || '—'}명 · 마감 {fmtDate(c.recruit_end)}
                </span>
                <span className="scast-camp-stats">
                  <b className={c.stats.new ? 'hot' : ''}>신규 {c.stats.new}</b>
                  <span>선발 {c.stats.approved}{c.max ? `/${c.max}` : ''}</span>
                  <span>전체 {c.stats.total}</span>
                </span>
              </button>
            ))}
          </aside>

          <main className="scast-main">
            {camp && (
              <>
                <div className="scast-filters">
                  {['all', 'new', 'approved', 'rejected'].map((f) => (
                    <button
                      type="button"
                      key={f}
                      className={`scast-filter ${filter === f ? 'on' : ''}`}
                      onClick={() => setFilter(f)}
                    >
                      {f === 'all' ? `전체 ${camp.stats.total}` : `${BUCKET_LABEL[f]} ${camp.stats[f]}`}
                    </button>
                  ))}
                </div>

                <table className="scast-table">
                  <thead>
                    <tr>
                      <th>지원자</th><th>XHS 계정</th><th>비자</th><th>희망방문</th>
                      <th>인원</th><th>상태</th><th>처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr><td colSpan={7} className="scast-empty">해당 상태의 지원자가 없습니다.</td></tr>
                    )}
                    {rows.map((a) => (
                      <React.Fragment key={a.id}>
                        <tr className={`scast-row st-${a.bucket}`}>
                          <td>
                            <div className="scast-name">{a.name || '—'}</div>
                            <div className="scast-mut">
                              {a.gender}{a.birth ? ` · ${a.birth}년생` : ''} · {fmtDate(a.createdAt)} 지원
                            </div>
                          </td>
                          <td>
                            {a.xhsUrl
                              ? <a href={a.xhsUrl} target="_blank" rel="noreferrer" className="scast-lnk">{a.xhsName || 'XHS ↗'}</a>
                              : (a.xhsName || '—')}
                            {a.companion && <div className="scast-mut">동행: {a.companion}</div>}
                          </td>
                          <td>{a.visa || '—'}</td>
                          <td>{fmtDate(a.visit)}</td>
                          <td>{a.pax || '—'}</td>
                          <td>
                            <span className={`scast-badge st-${a.bucket}`}>{BUCKET_LABEL[a.bucket]}</span>
                            {a.bucket === 'approved' && a.wechat && (
                              <div className="scast-wechat" title="위챗으로 선정 통보">위챗: {a.wechat}</div>
                            )}
                          </td>
                          <td className="scast-actions">
                            {a.msg && (
                              <button
                                type="button"
                                className="scast-ghost"
                                onClick={() => setOpenMsg(openMsg === a.id ? '' : a.id)}
                              >{openMsg === a.id ? '메시지 접기' : '메시지'}</button>
                            )}
                            {a.bucket !== 'approved' && (
                              <button type="button" className="scast-ok" disabled={busy === a.id} onClick={() => act(a, 'approve')}>선발</button>
                            )}
                            {a.bucket !== 'rejected' && (
                              <button type="button" className="scast-no" disabled={busy === a.id} onClick={() => act(a, 'reject')}>탈락</button>
                            )}
                            {a.bucket !== 'new' && a.bucket !== 'reviewing' && (
                              <button type="button" className="scast-ghost" disabled={busy === a.id} onClick={() => act(a, 'reset')}>되돌리기</button>
                            )}
                          </td>
                        </tr>
                        {openMsg === a.id && a.msg && (
                          <tr className="scast-msgrow">
                            <td colSpan={7}>
                              <div className="scast-msg">{a.msg}</div>
                              {a.dzdp && <div className="scast-mut">따종 계정: {a.dzdp}</div>}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </main>
        </div>
      )}
      </div>
    </div>
  );
}
