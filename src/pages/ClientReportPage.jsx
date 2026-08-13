import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import './ClientReportPage.css';

/* ── 상수 ──────────────────────────────────────── */
// 데이터는 /api/client-report 가 준다 (2026-08-13 서버 이관 — 이전에는 이 페이지가
// 브라우저에서 Airtable 을 직접 불렀고, 그 토큰이 번들에 실려 나갔다).
// 영상 이상 섹션 내 하위 그룹 순서 (유형 구분 표시용)
const VIDEO_ISSUE_GROUPS = ['influencer', 'experience', 'press'];

// ── 플랫폼 라벨 (2026-08-13) — 미기록·기본값은 기존 표기 유지, 인스타 등은 그 이름으로 ──
const pv1 = (v) => (Array.isArray(v) ? (v[0] || '') : (v || ''));
const xPlatOf = (it) => { const p = pv1(it.xhsPlat); return !p || p === '샤오홍슈' ? '샤오홍슈' : p; };
const dPlatOf = (it) => { const p = pv1(it.dpPlat); return !p || p === '따종디엔핑' ? '따종디엔핑' : p; };
// 컬럼 제목 — 플랫폼이 하나면 그 이름, 섞이면 '샤오홍슈·인스타그램' 병기
const platHeader = (items, pick, dflt) => {
  const u = [...new Set((items || []).map(pick))];
  return u.length ? u.join('·') : dflt;
};

/* ── 서브 컴포넌트 ──────────────────────────────── */
const TypeBadge = ({ type }) => {
  const map = { influencer: ['📣 인플루언서','infl'], experience: ['🍽️ 체험단','exp'], press: ['📰 기자단','press'] };
  const [label, cls] = map[type] || ['기타','exp'];
  return <span className={`type-badge ${cls}`}>{label}</span>;
};

const LinkBtn = ({ href, label }) =>
  href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link-btn">🔗 {label}</a>
  ) : (
    <span className="link-empty">-</span>
  );

const StatBar = ({ label, done, target }) => {
  if (!target) return null;
  const pct = Math.min(Math.round((done / target) * 100), 100);
  return (
    <div className="stat-bar-item">
      <div className="stat-bar-label">
        <span>{label}</span>
        <span className="stat-nums">{done} / {target}건 ({pct}%)</span>
      </div>
      <div className="stat-bar-track">
        <div className="stat-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

/* ── 메인 컴포넌트 ─────────────────────────────── */
const ClientReportPage = () => {
  const [searchParams] = useSearchParams();
  const recordId = searchParams.get('recordId');
  const [loading, setLoading]       = useState(true);
  const [reportData, setReportData] = useState(null);
  const [error, setError]           = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!recordId) {
          // ── 프리뷰 Mock ─────────────────────────────
          await new Promise(r => setTimeout(r, 500));
          setReportData({
            campaignName: 'M1971본점 [2026. 3월]',
            brandName: 'M1971', branchName: '본점', month: '2026. 3월',
            stats: { infl_target:5, infl_done:4, exp_target:20, exp_done:18, press_target:0, press_done:0 },
            records: {
              influencer: Array.from({length:4}).map((_,i) => ({
                id:`i${i}`, seq:i+1, displayId:`influencer_id_${i+1}`,
                xhsResult:'https://xhslink.com/sample', dpResult:'', dyResult:'', status:'송부완료',
              })),
              experience: Array.from({length:18}).map((_,i) => ({
                id:`e${i}`, seq:i+1, displayId:`user_${i+1}`,
                xhsResult: i%3!==0 ? 'https://xhslink.com/sample' : '',
                dpResult:  i%2===0 ? 'https://dpurl.cn/sample' : '',
                dyResult:  i%4===0 ? 'https://v.douyin.com/sample' : '',
                status: i%3!==0 ? '송부완료' : '예약확정',
              })),
              press: [],
              videoIssue: [
                { id:'v0', seq:1, category:'experience', displayId:'user_deleted_1', xhsResult:'https://xhslink.com/sample', dpResult:'', dyResult:'', status:'영상이상' },
                { id:'v1', seq:2, category:'influencer', displayId:'influencer_id_99', xhsResult:'', dpResult:'', dyResult:'https://v.douyin.com/sample', status:'영상이상' },
              ],
            },
          });
          return;
        }

        // ── 서버 API 호출 (조립·분류·플랫폼 매칭은 전부 서버가 한다) ──
        const r = await fetch(`/api/client-report?recordId=${encodeURIComponent(recordId)}`);
        if (!r.ok) {
          let msg = `보고서를 불러오지 못했습니다 (${r.status})`;
          try { const j = await r.json(); if (j.error) msg = j.error; } catch { /* 본문 없음 */ }
          throw new Error(msg);
        }
        const data = await r.json();
        // 구 응답(videoIssue 없던 시절) 방어 — 빈 배열로 정규화
        if (data.records && !data.records.videoIssue) data.records.videoIssue = [];
        setReportData(data);

      } catch(e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [recordId]);

  // 파트너사에 따른 브라우저 탭 및 파비콘 동적 변경 (화이트라벨링)
  useEffect(() => {
    if (reportData) {
      const { brandName, branchName, partnerName } = reportData;
      const displayName = brandName && branchName ? `${brandName} ${branchName}` : (brandName || '캠페인');
      
      if (partnerName && partnerName !== 'TAMKOREA') {
        document.title = `${displayName} 실적 보고서 - ${partnerName}`;
        // 탐코리아 파비콘 숨기기 (투명 이미지로 대체)
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      } else {
        document.title = `${displayName} 실적 보고서 - 탐코리아`;
      }
    }
  }, [reportData]);

  if (loading) return (
    <div className="cr-wrap cr-center">
      <div className="cr-spinner" />
      <p style={{ color:'#9ca3af', marginTop:12 }}>보고서 데이터를 불러오는 중…</p>
    </div>
  );
  if (error) return (
    <div className="cr-wrap cr-center">
      <p style={{ color:'#ef4444' }}>오류: {error}</p>
    </div>
  );
  if (!reportData) return null;

  let { brandName, branchName, month, partnerName = 'TAMKOREA', records } = reportData;
  if (partnerName && partnerName.includes('에코')) {
    partnerName = '에코';
  }
  const hasInfl  = records.influencer?.length > 0;
  const hasExp   = records.experience?.length > 0;
  const hasPress = records.press?.length > 0;
  const hasVideoIssue = records.videoIssue?.length > 0;

  const handleDownloadCSV = () => {
    if (!records) return;
    
    const allItems = [
      ...(records.influencer || []), ...(records.experience || []),
      ...(records.press || []), ...(records.videoIssue || []),
    ];
    const headers = ['구분', 'No.', '닉네임(ID)',
      `${platHeader(allItems, xPlatOf, '샤오홍슈')} 링크`,
      `${platHeader(allItems, dPlatOf, '따종디엔핑')} 링크`, '틱톡(DY) 링크'];
    const rows = [];
    
    const escape = (text) => `"${(text || '').toString().replace(/"/g, '""')}"`;
    
    const addRows = (categoryName, items) => {
      if (!items) return;
      items.forEach(item => {
        const row = [
          escape(categoryName),
          item.seq,
          escape(item.displayId),
          escape(item.xhsResult),
          escape(item.dpResult),
          escape(item.dyResult)
        ];
        rows.push(row.join(','));
      });
    };

    addRows('인플루언서', records.influencer);
    addRows('체험단', records.experience);
    addRows('기자단', records.press);
    const vi = records.videoIssue || [];
    addRows('영상이상·인플루언서', vi.filter(i => i.category === 'influencer'));
    addRows('영상이상·체험단', vi.filter(i => i.category === 'experience'));
    addRows('영상이상·기자단', vi.filter(i => i.category === 'press'));

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const safeBrand = (brandName || '캠페인').replace(/\s+/g, '_');
    const safeBranch = branchName ? branchName.replace(/\s+/g, '_') + '_' : '';
    const safeMonth = (month || '').replace(/\s+/g, '');
    const filename = `${safeBrand}_${safeBranch}${safeMonth}_실적보고서.csv`;
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="cr-wrap">
      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
      <div className="report-paper">

        {/* ── 헤더 ─────────────────────────────────── */}
        <header className="report-header">
          <div>
            <h1 className="report-title">
              {brandName}{branchName ? ` ${branchName}` : ''}
            </h1>
            <p className="report-sub">{month} 실적 보고서</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
            <div className="gravity-logo-accent" style={{ margin: 0 }}>
              {partnerName}<br />
              <span style={{ fontSize:'0.65rem', color:'#9ca3af' }}>PERFORMANCE REPORT</span>
            </div>
            <button 
              onClick={handleDownloadCSV}
              style={{
                background: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                color: '#d8b4fe',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
                boxShadow: '0 0 10px rgba(168, 85, 247, 0.1)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.2)'; e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)'; e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)'; }}
            >
              📥 CSV 다운로드
            </button>
          </div>
        </header>

        {/* ── 인플루언서 ───────────────────────────── */}
        {hasInfl && (
          <section className="category-section">
            <h2 className="category-title">
              <TypeBadge type="influencer" />
            </h2>
            <div className="premium-table-wrapper">
              <table className="premium-table">
                <thead><tr>
                  <th style={{width:'6%'}}>No.</th>
                  <th style={{width:'19%'}}>ID (닉네임)</th>
                  <th style={{width:'25%', textAlign:'center'}}>{platHeader(records.influencer, xPlatOf, '샤오홍슈')}</th>
                  <th style={{width:'25%', textAlign:'center'}}>{platHeader(records.influencer, dPlatOf, '따종디엔핑')}</th>
                  <th style={{width:'25%', textAlign:'center'}}>틱톡(DY)</th>
                </tr></thead>
                <tbody>
                  {records.influencer.map(item => (
                    <tr key={item.id} className={!item.xhsResult && !item.dpResult && !item.dyResult ? 'row-pending' : ''}>
                      <td>{item.seq}</td>
                      <td><span className="id-tag">{item.displayId||'-'}</span></td>
                      <td style={{textAlign:'center'}}><LinkBtn href={item.xhsResult} label="확인" /></td>
                      <td style={{textAlign:'center'}}><LinkBtn href={item.dpResult} label="확인" /></td>
                      <td style={{textAlign:'center'}}><LinkBtn href={item.dyResult} label="확인" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── 체험단 ───────────────────────────────── */}
        {hasExp && (
          <section className="category-section">
            <h2 className="category-title">
              <TypeBadge type="experience" />
            </h2>
            <div className="premium-table-wrapper">
              <table className="premium-table">
                <thead><tr>
                  <th style={{width:'6%'}}>No.</th>
                  <th style={{width:'19%'}}>ID (닉네임)</th>
                  <th style={{width:'25%', textAlign:'center'}}>{platHeader(records.experience, xPlatOf, '샤오홍슈')}</th>
                  <th style={{width:'25%', textAlign:'center'}}>{platHeader(records.experience, dPlatOf, '따종디엔핑')}</th>
                  <th style={{width:'25%', textAlign:'center'}}>틱톡(DY)</th>
                </tr></thead>
                <tbody>
                  {records.experience.map(item => (
                    <tr key={item.id} className={!item.xhsResult && !item.dpResult && !item.dyResult ? 'row-pending' : ''}>
                      <td>{item.seq}</td>
                      <td><span className="id-tag">{item.displayId||'-'}</span></td>
                      <td style={{textAlign:'center'}}><LinkBtn href={item.xhsResult} label="확인" /></td>
                      <td style={{textAlign:'center'}}><LinkBtn href={item.dpResult} label="확인" /></td>
                      <td style={{textAlign:'center'}}><LinkBtn href={item.dyResult} label="확인" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── 기자단 (컴팩트 그리드) ─────────────── */}
        {hasPress && (
          <section className="category-section">
            <h2 className="category-title">
              <TypeBadge type="press" />
            </h2>
            <div className="press-grid">
              {records.press.map(item => (
                <div key={item.id} className={`press-card ${!item.xhsResult ? 'press-pending' : ''}`}>
                  <span className="press-seq">{item.seq}</span>
                  {item.xhsResult ? (
                    <a href={item.xhsResult} target="_blank" rel="noopener noreferrer" className="press-link">
                      포스팅 확인 →
                    </a>
                  ) : (
                    <span className="press-wait">진행 중</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 영상 이상 (하단 별도 표시) ─────────────── */}
        {hasVideoIssue && (
          <section className="category-section video-issue-section">
            <h2 className="category-title">
              <span className="type-badge vissue">⚠️ 영상 이상</span>
              <span className="cat-count">{records.videoIssue.length}건 · 삭제 또는 비공개 처리됨</span>
            </h2>
            <p className="video-issue-note">
              아래 항목은 게시 후 플랫폼 광고 제한 정책에 따라 영상이 삭제·비공개 처리된 건입니다.
            </p>
            {VIDEO_ISSUE_GROUPS.map(cat => {
              const items = records.videoIssue.filter(i => i.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat} className="vissue-group">
                  <h3 className="vissue-group-title">
                    <TypeBadge type={cat} />
                    <span className="cat-count">{items.length}건</span>
                  </h3>
                  <div className="premium-table-wrapper">
                    <table className="premium-table">
                      <thead><tr>
                        <th style={{width:'6%'}}>No.</th>
                        <th style={{width:'19%'}}>ID (닉네임)</th>
                        <th style={{width:'25%', textAlign:'center'}}>{platHeader(items, xPlatOf, '샤오홍슈')}</th>
                        <th style={{width:'25%', textAlign:'center'}}>{platHeader(items, dPlatOf, '따종디엔핑')}</th>
                        <th style={{width:'25%', textAlign:'center'}}>틱톡(DY)</th>
                      </tr></thead>
                      <tbody>
                        {items.map((item, i) => (
                          <tr key={item.id} className="row-vissue">
                            <td>{i + 1}</td>
                            <td><span className="id-tag">{item.displayId||'-'}</span></td>
                            <td style={{textAlign:'center'}}><LinkBtn href={item.xhsResult} label="확인" /></td>
                            <td style={{textAlign:'center'}}><LinkBtn href={item.dpResult} label="확인" /></td>
                            <td style={{textAlign:'center'}}><LinkBtn href={item.dyResult} label="확인" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {!hasInfl && !hasExp && !hasPress && !hasVideoIssue && (
          <div className="cr-center" style={{ padding:'60px 0', color:'#6b7280' }}>
            아직 등록된 실적이 없습니다.
          </div>
        )}

        <footer className="report-footer">
          <p>본 보고서는 {partnerName}에서 제공하는 실시간 데이터 기반 자동 생성 보고서입니다.</p>
        </footer>
      </div>
    </div>
  );
};

export default ClientReportPage;
