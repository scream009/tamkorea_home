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
  const fields = ['유형','XHS_ID','WC_ID','INFL_ID','XHS_Result','DP_Result','진행상태','Shoot_ID'];
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
    <span className="link-pending">진행 중</span>
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
                xhsResult:'https://xhslink.com/sample', dpResult:'', status:'송부완료',
              })),
              experience: Array.from({length:18}).map((_,i) => ({
                id:`e${i}`, seq:i+1, displayId:`user_${i+1}`,
                xhsResult: i%3!==0 ? 'https://xhslink.com/sample' : '',
                dpResult:  i%2===0 ? 'https://dpurl.cn/sample' : '',
                status: i%3!==0 ? '송부완료' : '예약확정',
              })),
              press: [],
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
        const partnerName  = (partnerRaw && partnerRaw !== '직영' && partnerRaw !== '탐코리아' && partnerRaw.toUpperCase() !== 'TAMKOREA') ? partnerRaw : 'TAMKOREA';

        const linkedIds   = cf['진행_DB_OLD'] || [];

        const stats = {
          infl_target:  cf['인플_요청']  || 0, infl_done:  cf['인플_실적']  || 0,
          exp_target:   cf['체험단_요청'] || 0, exp_done:   cf['체험_실적']  || 0,
          press_target: cf['기자단_요청'] || 0, press_done: cf['기자_실적']  || 0,
        };

        // ── 2. 진행_DB_OLD 실적 레코드 ───────────────
        const rawRecs = await fetchLinkedRecords(linkedIds);

        const influencer = [], experience = [], press = [];
        rawRecs.forEach(rec => {
          const f = rec.fields;
          const type = f['유형'] || '';
          const xhsId   = Array.isArray(f['XHS_ID'])  ? f['XHS_ID'][0]  : (f['XHS_ID']  || '');
          const wcId    = Array.isArray(f['WC_ID'])    ? f['WC_ID'][0]   : (f['WC_ID']   || '');
          const inflId  = Array.isArray(f['INFL_ID']) ? f['INFL_ID'][0] : (f['INFL_ID'] || '');
          const item = {
            id: rec.id, seq: 0,
            displayId:  xhsId || wcId || inflId || '',
            xhsResult:  (f['XHS_Result'] || '').trim(),
            dpResult:   (f['DP_Result']  || '').trim(),
            status:     f['진행상태']   || '',
          };
          if (type==='인플' || type==='인플루언서' || type==='체험→인플' || type==='기자→인플') influencer.push(item);
          else if (type==='체험' || type==='체험단' || type==='기자→체험')  experience.push(item);
          else if (type==='기자' || type==='기자단')  press.push(item);
          else experience.push(item); // fallback
        });
        influencer.forEach((r,i) => r.seq = i+1);
        experience.forEach((r,i) => r.seq = i+1);
        press.forEach((r,i)      => r.seq = i+1);

        setReportData({ campaignName, brandName, branchName, month, partnerName, stats, records:{ influencer, experience, press } });

      } catch(e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [recordId]);

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

  const { campaignName, brandName, branchName, month, partnerName = 'TAMKOREA', stats, records } = reportData;
  const hasInfl  = records.influencer?.length > 0;
  const hasExp   = records.experience?.length > 0;
  const hasPress = records.press?.length > 0;

  const handleDownloadCSV = () => {
    if (!records) return;
    
    const headers = ['구분', 'No.', '닉네임(ID)', '샤오홍슈 링크', '따종디엔핑 링크', '진행상태'];
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
          escape(item.status)
        ];
        rows.push(row.join(','));
      });
    };

    addRows('인플루언서', records.influencer);
    addRows('체험단', records.experience);
    addRows('기자단', records.press);

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const safeBrand = (brandName || '캠페인').replace(/\s+/g, '_');
    const safeMonth = (month || '').replace(/\s+/g, '');
    const filename = `${safeBrand}_${safeMonth}_실적보고서.csv`;
    
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
            <h1 className="report-title">{brandName}</h1>
            <p className="report-sub">{branchName} · {month} 실적 보고서</p>
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
                  <th style={{width:'38%'}}>샤오홍슈 ID</th>
                  <th style={{width:'56%'}}>샤오홍슈 결과물</th>
                </tr></thead>
                <tbody>
                  {records.influencer.map(item => (
                    <tr key={item.id} className={!item.xhsResult ? 'row-pending' : ''}>
                      <td>{item.seq}</td>
                      <td><span className="id-tag">{item.displayId||'-'}</span></td>
                      <td><LinkBtn href={item.xhsResult} label="포스팅 확인" /></td>
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
                  <th style={{width:'28%'}}>샤오홍슈 ID</th>
                  <th style={{width:'33%'}}>샤오홍슈 결과물</th>
                  <th style={{width:'33%'}}>따종디엔핑</th>
                </tr></thead>
                <tbody>
                  {records.experience.map(item => (
                    <tr key={item.id} className={!item.xhsResult && !item.dpResult ? 'row-pending' : ''}>
                      <td>{item.seq}</td>
                      <td><span className="id-tag">{item.displayId||'-'}</span></td>
                      <td><LinkBtn href={item.xhsResult} label="샤오홍슈" /></td>
                      <td><LinkBtn href={item.dpResult}  label="따종디엔핑" /></td>
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

        {!hasInfl && !hasExp && !hasPress && (
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
