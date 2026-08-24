import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { staffHeaders } from '../lib/staffKey';
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
  const [refSel, setRefSel] = useState('all');   // 담당자 필터 — 개인키 로그인이면 본인이 기본

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
      // 원칙: 링크 뿌린 담당자가 선발한다 — 개인키로 들어왔고 내 지원자가 있으면 나부터 보인다
      const mine = d.who && d.who !== 'staff' && d.who !== 'admin'
        && d.campaigns.some((c) => c.applicants.some((a) => a.referrer === d.who));
      setRefSel((prev) => (prev === 'all' && mine ? d.who : prev));
    } catch (e) {
      setError(e.message || '불러오기 실패');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const camp = useMemo(
    () => (data ? data.campaigns.find((c) => c.slug === sel) : null),
    [data, sel],
  );

  // 담당자별 집계 (전 캠페인) — 지원·선발 수. referrer 빈 값은 「직접 유입」
  const refStats = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    data.campaigns.forEach((c) => c.applicants.forEach((a) => {
      const k = a.referrer || '직접';
      if (!m.has(k)) m.set(k, { total: 0, approved: 0 });
      const v = m.get(k);
      v.total += 1;
      if (a.bucket === 'approved') v.approved += 1;
    }));
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [data]);

  /**
   * 🔴 담당자 필터를 **모든 숫자에 똑같이** 적용한다.
   * 예전에는 목록만 필터를 타고 탭·좌측 개수는 서버가 준 캠페인 전체 수를 그대로 썼다.
   * 그래서 담당자를 고르면 "전체 6" 이라고 쓰여 있는데 목록은 비는 일이 생겼고,
   * 왜 안 보이는지 화면에서 알 방법이 없었다 (Owner 2026-08-15).
   */
  const byRef = useCallback(
    (list) => (refSel === 'all' ? list : list.filter((a) => (a.referrer || '직접') === refSel)),
    [refSel],
  );

  const statsOf = useCallback((c) => {
    const list = byRef(c.applicants || []);
    return {
      total: list.length,
      new: list.filter((a) => a.bucket === 'new').length,
      approved: list.filter((a) => a.bucket === 'approved').length,
      rejected: list.filter((a) => a.bucket === 'rejected').length,
    };
  }, [byRef]);

  const rows = useMemo(() => {
    if (!camp) return [];
    const list = byRef(camp.applicants);
    if (filter === 'all') return list;
    return list.filter((a) => a.bucket === filter);
  }, [camp, filter, byRef]);

  // 담당자 필터 때문에 비었는지 — 그렇다면 그렇다고 말해 준다
  const hiddenByRef = camp && refSel !== 'all' && rows.length === 0
    && (camp.applicants || []).length > 0;
  const campStats = camp ? statsOf(camp) : null;

  async function act(applicant, action, force, cancelKind) {
    const who = applicant.name || applicant.xhsName;
    if (!force) {
      // 취소(이미 나간 예약)는 결과가 고객사에 나가므로 전용 문구로 확인받는다
      if (cancelKind) {
        const shoot = (applicant.resv && applicant.resv.shoot) || '';
        const ok = window.confirm(
          `${who} — 선발을 취소합니다.\n\n`
          + `예약(${shoot})은 이미 나간 건이라 「${cancelKind}」로 처리되고,\n`
          + '고객사에 취소 안내가 자동 발송됩니다.\n\n계속할까요?',
        );
        if (!ok) return;
        // 확인을 받았으므로 서버 재확인 없이 바로 진행
        return act(applicant, action, true, cancelKind);
      }
      const label = action === 'approve' ? '선발' : action === 'reject' ? '탈락'
        : (applicant.bucket === 'approved' ? '선발 되돌리기' : '신규로 되돌리기');
      if (!window.confirm(`${who} — ${label} 처리할까요?`)) return;
    }
    setBusy(applicant.id);
    try {
      const resp = await fetch('/api/staff-casting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...staffHeaders() },
        body: JSON.stringify({ id: applicant.id, action, ...(force ? { force: 1 } : {}), ...(cancelKind ? { cancelKind } : {}) }),
      });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d.error || `HTTP ${resp.status}`);

      // 되돌리기인데 예약이 이미 나간 건 — 경고 후 확인받아 선발만 취소한다
      if (d.needConfirm) {
        const rv = d.resv || {};
        const go = window.confirm(
          `⚠️ 이 건은 예약이 이미 나갔습니다 (${rv.reason || '확인 필요'} · ${rv.shoot || ''}).\n\n`
          + '[확인] 선발을 취소하고, 예약도 「취소_방문자」로 처리합니다.\n'
          + '        → 고객사에 취소 안내가 자동 발송됩니다.\n\n'
          + '[취소] 아무것도 하지 않습니다.',
        );
        if (!go) return;
        await act(applicant, 'reset', true, '취소_방문자');
        return;
      }
      if (d.resv && ['deleted', 'cancelled', 'manual'].includes(d.resv.code)) {
        window.alert(d.resv.code === 'manual' ? `⚠️ ${d.resv.msg}` : `✅ ${d.resv.msg}`);
      }
      if (d.resv && d.resv.status === 'ok' && d.resv.submitUrl) {
        try { await navigator.clipboard.writeText(d.resv.submitUrl); } catch { /* 무시 */ }
        window.alert(`✅ ${d.resv.msg}\n\n📋 인플 전달 링크가 복사되었습니다.\n위챗 선발 통보에 붙여넣으세요 — 일정 확인·링크 제출·QR 체크인이 전부 이 링크에서 됩니다.\n${d.resv.submitUrl}`);
      } else if (d.resv && d.resv.status === 'ok' && !d.resv.submitUrl && d.resv.code !== 'no_mgr') {
        window.alert(`✅ ${d.resv.msg}\n발송은 예약발송 큐에서 따로 누르세요.`);
      }
      if (d.resv && d.resv.code === 'no_mgr') {
        // admin·공용키로 선발하면 담당자를 알 수 없다 → 물어보고 예약 연계만 재시도
        const pick = window.prompt('담당자를 입력하세요 (HH / LH / AN / FB)\n— 예약입력_DB의 담당(예약_ID)으로 들어갑니다', 'AN');
        const mgr = String(pick || '').trim().toUpperCase();
        if (['HH', 'LH', 'AN', 'FB'].includes(mgr)) {
          const r2 = await fetch('/api/staff-casting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...staffHeaders() },
            body: JSON.stringify({ id: applicant.id, action: 'approve', mgr }),
          });
          const d2 = await r2.json().catch(() => ({}));
          window.alert(d2.resv && d2.resv.status === 'ok'
            ? `✅ ${d2.resv.msg}\n발송은 예약발송 큐에서 따로 누르세요.`
            : `⚠️ 선발은 완료. ${(d2.resv && d2.resv.msg) || '예약 연계 실패 — /staff/new 수동 입력'}`);
        } else {
          window.alert('⚠️ 선발은 완료. 담당자 미지정 — 예약입력은 /staff/new 에서 수동으로.');
        }
      } else if (d.resv && d.resv.status === 'warn'
        && !['deleted', 'cancelled', 'manual'].includes(d.resv.code)) {
        // ok 계열은 위(전달링크 복사 블록)에서 이미 알렸다 — 여기서 또 띄우면 이중 알림
        window.alert(`⚠️ 선발은 완료. ${d.resv.msg}`);
      }
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
      <header className="scast-head">
        <h1>체험단 선발</h1>
        <p className="scast-sub">
          모집사이트 지원자를 캠페인별로 심사합니다. 원칙: 링크를 뿌린 담당자가 자기 지원자를 선발합니다 —
          아래 담당자 칩으로 조회를 좁힐 수 있습니다. 조율·통보는 위챗으로.
        </p>
        {/* 🔴 개시 전 필수 — 교육 중 만든 연습 지원자는 실지원자와 섞이면 안 된다.
            「모집카드 관리」의 '연습 지원자'로 만든 것과 옛 测试· 계정을 함께 걷는다. */}
        <button
          type="button"
          className="scast-purge"
          onClick={async () => {
            if (!window.confirm(
              '연습(测试·) 지원자를 전부 삭제합니다.\n\n'
              + '선발까지 연습한 건은 예약입력_DB 레코드도 함께 지웁니다.\n'
              + '실제 지원자는 건드리지 않습니다. 계속할까요?',
            )) return;
            try {
              const resp = await fetch('/api/staff-casting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...staffHeaders() },
                body: JSON.stringify({ action: 'purge_test' }),
              });
              const d = await resp.json().catch(() => ({}));
              if (!resp.ok) throw new Error(d.error || `HTTP ${resp.status}`);
              window.alert(`연습 지원자 ${d.deleted}건 삭제 (예약 되돌림 ${d.reverted}건)`);
              await load();
            } catch (e) { setError(e.message || '삭제 실패'); }
          }}
        >연습 데이터 삭제</button>
      </header>

      {error && <div className="scast-err">{error} <button type="button" onClick={load}>다시 시도</button></div>}
      {!data && !error && <div className="scast-loading">불러오는 중…</div>}

      {data && (
        <div className="scast-body">
          <aside className="scast-camps">
            {data.campaigns.length === 0 && <div className="scast-empty">지원자가 있는 캠페인이 없습니다.</div>}
            {data.campaigns.map((c) => {
              const st = statsOf(c);
              return (
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
                    <b className={st.new ? 'hot' : ''}>신규 {st.new}</b>
                    <span>선발 {st.approved}{c.max ? `/${c.max}` : ''}</span>
                    <span>전체 {st.total}</span>
                  </span>
                </button>
              );
            })}
          </aside>

          <main className="scast-main">
            {camp && (
              <>
                {refStats.length > 0 && (
                  <div className="scast-refbar">
                    <button
                      type="button"
                      className={`scast-refchip ${refSel === 'all' ? 'on' : ''}`}
                      onClick={() => setRefSel('all')}
                    >전체 담당</button>
                    {refStats.map(([k, v]) => (
                      <button
                        type="button"
                        key={k}
                        className={`scast-refchip ${refSel === k ? 'on' : ''} ${data.who === k ? 'me' : ''}`}
                        title={`${k} — 유입 지원 ${v.total} · 선발 ${v.approved}`}
                        onClick={() => setRefSel(refSel === k ? 'all' : k)}
                      >
                        {k}{data.who === k ? ' (나)' : ''} <b>{v.total}</b><span>/{v.approved}선발</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="scast-filters">
                  {['all', 'new', 'approved', 'rejected'].map((f) => (
                    <button
                      type="button"
                      key={f}
                      className={`scast-filter ${filter === f ? 'on' : ''}`}
                      onClick={() => setFilter(f)}
                    >
                      {f === 'all' ? `전체 ${campStats.total}` : `${BUCKET_LABEL[f]} ${campStats[f]}`}
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
                      <tr><td colSpan={7} className="scast-empty">
                        {hiddenByRef ? (
                          <>
                            「{refSel}」 담당 지원자가 없습니다. 이 캠페인에는 지원자 {camp.applicants.length}명이 있습니다.
                            {' '}
                            <button type="button" className="scast-linkbtn" onClick={() => setRefSel('all')}>
                              전체 담당으로 보기
                            </button>
                          </>
                        ) : '해당 상태의 지원자가 없습니다.'}
                      </td></tr>
                    )}
                    {rows.map((a) => (
                      <React.Fragment key={a.id}>
                        <tr className={`scast-row st-${a.bucket}`}>
                          <td>
                            <div className="scast-name">{a.name || '—'}</div>
                            <div className="scast-mut">
                              {a.gender}{a.birth ? ` · ${a.birth}년생` : ''} · {fmtDate(a.createdAt)} 지원
                              {a.referrer && <span className="scast-ref"> · 담당 {a.referrer}</span>}
                              {a.teamRole === 'leader' && a.id && camp.applicants.some((x) => x.teamKey === a.id) && (
                                <span className="scast-team"> · 팀 대표</span>
                              )}
                              {a.teamRole === 'member' && <span className="scast-team"> · 동행</span>}
                            </div>
                          </td>
                          <td>
                            {a.xhsUrl
                              ? <a href={a.xhsUrl} target="_blank" rel="noreferrer" className="scast-lnk">{a.xhsName || 'XHS ↗'}</a>
                              : (a.xhsName || '—')}
                            {a.followers > 0 && (
                              <div className="scast-mut">팔로워 {Number(a.followers).toLocaleString()}</div>
                            )}
                            {a.companion && <div className="scast-mut">동행: {a.companion}</div>}
                          </td>
                          <td>{a.visa || '—'}</td>
                          <td>{fmtDate(a.visit)}</td>
                          <td>{a.pax || '—'}</td>
                          <td>
                            <span className={`scast-badge st-${a.bucket}`}>{BUCKET_LABEL[a.bucket]}</span>
                            {a.wechat && (
                              <div className="scast-wechat" title="선발 전 일정·동행 조율도 위챗으로">위챗: {a.wechat}</div>
                            )}
                            {a.resv && (
                              <div className={`scast-resv ${a.resv.removable ? "" : "sent"}`}
                                title={a.resv.removable ? "미발송 — 되돌리면 예약도 삭제됩니다" : "이미 발송됨 — 취소 처리만 가능"}>
                                예약 {a.resv.status}{a.resv.sent ? " · 발송됨" : ""}
                              </div>
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
                            {/* 상태별로 할 수 있는 일만 보인다 (Owner 확정 2026-08-12)
                                신규   : 선발 · 탈락
                                선발됨 : 예약이 안 나갔으면 되돌리기 / 이미 나갔으면 취소만
                                탈락   : 되돌리기
                                → 선발된 건에 「탈락」이 같이 떠서 예약이 고아로 남는 사고가 있었다 */}
                            {a.bucket === 'approved' && (
                              a.resv && !a.resv.removable ? (
                                <button
                                  type="button"
                                  className="scast-no"
                                  disabled={busy === a.id}
                                  title={`예약(${a.resv.shoot || ''})이 이미 나갔습니다 — 취소 안내가 고객사에 발송됩니다`}
                                  onClick={() => act(a, 'reset', false, '취소_방문자')}
                                >취소</button>
                              ) : (
                                <button
                                  type="button"
                                  className="scast-ghost"
                                  disabled={busy === a.id}
                                  title="선발을 되돌립니다 — 연결된 예약(미발송)도 함께 삭제합니다"
                                  onClick={() => act(a, 'reset')}
                                >되돌리기</button>
                              )
                            )}
                            {(a.bucket === 'new' || a.bucket === 'reviewing') && (
                              <>
                                <button type="button" className="scast-ok" disabled={busy === a.id} onClick={() => act(a, 'approve')}>선발</button>
                                <button type="button" className="scast-no" disabled={busy === a.id} onClick={() => act(a, 'reject')}>탈락</button>
                              </>
                            )}
                            {a.bucket === 'rejected' && (
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
