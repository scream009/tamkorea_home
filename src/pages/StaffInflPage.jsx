import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { staffHeaders } from '../lib/staffKey';
import StaffNav from '../components/StaffNav';
import InflRegModal from '../components/InflRegModal';
import './StaffInflPage.css';

/**
 * 인플루언서 보드 (/staff/infl) — Softr ⑤의 대체.
 * 조회 중심 + 신규 등록(공용 모달). 메인 메뉴 '＋신규인플'은 ?new=1 로 진입해 바로 열린다.
 */
export default function StaffInflPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [mgr, setMgr] = useState('');
  const [reg, setReg] = useState(params.get('new') === '1');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/staff-resv?mode=infls', { headers: staffHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `서버 오류 (${res.status})`);
      setData(body);
    } catch (e) {
      setError(e.message || '불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 이미 이 페이지에 있을 때 메뉴의 '＋신규인플'(?new=1)을 눌러도 열리게
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

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (data?.infls || [])
      .filter((i) => !mgr || i.mgr === mgr)
      .filter((i) => !qq
        || i.xid.toLowerCase().includes(qq)
        || i.wc.toLowerCase().includes(qq)
        || i.nick.toLowerCase().includes(qq));
  }, [data, q, mgr]);

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
        </div>

        {error && <div className="sif-error">{error}</div>}
        {!data && !error && <div className="sif-loading">불러오는 중…</div>}

        {data && (
          <div className="sif-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>XHS_ID</th><th>유형</th><th>섭외</th><th className="num">팔로워</th>
                  <th>위챗</th><th>연락처</th><th>지역</th><th>닉네임</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 300).map((i) => (
                  <tr key={i.id}>
                    <td className="xid">
                      {i.link
                        ? <a href={i.link} target="_blank" rel="noreferrer" title={i.link}>{i.xid}</a>
                        : i.xid}
                    </td>
                    <td>{i.ty || '—'}</td>
                    <td>{i.mgr || '—'}</td>
                    <td className="num">{i.pal ? i.pal.toLocaleString() : '—'}</td>
                    <td>{i.wc || '—'}</td>
                    <td>{i.phone || '—'}</td>
                    <td>{i.region || '—'}</td>
                    <td>{i.nick || '—'}</td>
                  </tr>
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
