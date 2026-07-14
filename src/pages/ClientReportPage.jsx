import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import './ClientReportPage.css';

/* ── 에어테이블 직접 연동 설정 ───────────────────── */
const TOKEN   = import.meta.env.VITE_AT_TOKEN;
const BASE_ID = 'appdsAV2ewZWCkyIa';
const AT_BASE = `https://api.airtable.com/v0/${BASE_ID}`;
const CAMP_TB = encodeURIComponent('Campaign_DB');
const PROG_TB = encodeURIComponent('진행_DB_OLD');

async function atGet(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  return res.json();
}

async function fetchLinkedRecords(ids) {
  if (!ids || ids.length === 0) return [];
  const fields = ['유형','XHS_ID','WC_ID','INFL_ID','XHS_Result','DP_Result','DY_Result','진행상태','Shoot_ID'];
  const fieldQ = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  let all = [];
  const chunkSize = 30;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const orExpr = chunk.map(id => `RECORD_ID()='${id}'`).join(',');
    const formula = encodeURIComponent(`OR(${orExpr})`);
    const url = `${AT_BASE}/${PROG_TB}?filterByFormula=${formula}&${fieldQ}`;
    let offset = null;
    do {
      const data = await atGet(offset ? `${url}&offset=${offset}` : url);
      all = all.concat(data.records || []);
      offset = data.offset || null;
    } while (offset);
  }
  return all;
}

/* ── 상수 ──────────────────────────────────────── */
// 영상 이상 섹션 내 하위 그룹 순서 (유형 구분 표시용)
const VIDEO_ISSUE_GROUPS = ['influencer', 'experience', 'press'];
// 상태값 정규화(공백 제거) 후 '영상이상' 포함 여부 — '영상 이상' 표기도 함께 인식
const isVideoIssue = (status) => (status || '').replace(/\s/g, '').includes('영상이상');

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

        // ── 1. Campaign 기본 정보 ──────────────────────
        const camp = await atGet(`${AT_BASE}/${CAMP_TB}/${recordId}`);
        const cf = camp.fields;
        const brandName   = Array.isArray(cf['고객사명']) ? cf['고객사명'][0] : (cf['고객사명'] || '');
        const branchName  = Array.isArray(cf['지점명'])   ? cf['지점명'][0]   : (cf['지점명'] || '');
        const month       = cf['계약월'] || '';
        const campaignName= cf['계약명'] || '';
        
        const partnerField = cf['협력사명'] || cf['협력사'] || '';
        const partnerRaw   = Array.isArray(partnerField) ? partnerField[0] : partnerField;
        let partnerName  = (partnerRaw && partnerRaw !== '직영' && partnerRaw !== '탐코리아' && partnerRaw.toUpperCase() !== 'TAMKOREA') ? partnerRaw : 'TAMKOREA';
        if (partnerName && partnerName.includes('에코')) {
          partnerName = '에코';
        }

        const linkedIds   = cf['진행_DB_OLD'] || [];

        // 실적 수량: 인플/체험 = '_방문' rollup, 기자 = '기자_실적' rollup (스키마 리네임 반영)
        const stats = {
          infl_target:  cf['인플_목표'] || cf['인플_요청']  || 0, infl_done:  cf['인플_방문'] || cf['인플_실적'] || 0,
          exp_target:   cf['체험_목표'] || cf['체험단_요청'] || 0, exp_done:   cf['체험_방문'] || cf['체험_실적'] || 0,
          press_target: cf['기자_목표'] || cf['기자단_요청'] || 0, press_done: cf['기자_실적'] || 0,
        };

        // ── 2. 진행_DB_OLD 실적 레코드 ───────────────
        const rawRecs = await fetchLinkedRecords(linkedIds);

        const influencer = [], experience = [], press = [], videoIssue = [];
        rawRecs.forEach(rec => {
          const f = rec.fields;
          const type = f['유형'] || '';
          const status = f['진행상태'] || '';
          const xhsId   = Array.isArray(f['XHS_ID'])  ? f['XHS_ID'][0]  : (f['XHS_ID']  || '');
          const wcId    = Array.isArray(f['WC_ID'])    ? f['WC_ID'][0]   : (f['WC_ID']   || '');
          const inflId  = Array.isArray(f['INFL_ID']) ? f['INFL_ID'][0] : (f['INFL_ID'] || '');

          // 취소·노쇼 레코드는 보고서에서 제외
          if (status.includes('취소') || status.includes('노쇼')) return;

          // 유형 → 카테고리 판정
          let category;
          if (type.includes('인플') || type.includes('체험→인플') || type.includes('기자→인플')) category = 'influencer';
          else if (type.includes('기자')) category = 'press';
          else category = 'experience'; // fallback

          const item = {
            id: rec.id, seq: 0,
            category,
            displayId:  xhsId || wcId || inflId || '',
            xhsResult:  (f['XHS_Result'] || '').trim(),
            dpResult:   (f['DP_Result']  || '').trim(),
            dyResult:   (f['DY_Result']  || '').trim(),
            status,
          };

          // 영상 이상(삭제/비공개) → 유형 표에서 빼내어 하단 별도 리스트로
          if (isVideoIssue(status)) { videoIssue.push(item); return; }

          if (category === 'influencer') influencer.push(item);
          else if (category === 'press')  press.push(item);
          else experience.push(item);
        });
        [influencer, experience, press, videoIssue].forEach(arr => arr.forEach((r,i) => r.seq = i+1));

        setReportData({ campaignName, brandName, branchName, month, partnerName, stats, records:{ influencer, experience, press, videoIssue } });

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
    
    const headers = ['구분', 'No.', '닉네임(ID)', '샤오홍슈 링크', '따종디엔핑 링크', '틱톡(DY) 링크'];
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
                  <th style={{width:'25%', textAlign:'center'}}>샤오홍슈</th>
                  <th style={{width:'25%', textAlign:'center'}}>따종디엔핑</th>
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
                  <th style={{width:'25%', textAlign:'center'}}>샤오홍슈</th>
                  <th style={{width:'25%', textAlign:'center'}}>따종디엔핑</th>
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
                        <th style={{width:'25%', textAlign:'center'}}>샤오홍슈</th>
                        <th style={{width:'25%', textAlign:'center'}}>따종디엔핑</th>
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
