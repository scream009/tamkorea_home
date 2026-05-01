import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList, ReferenceLine
} from 'recharts';
import './AdminDashboardPage.css';

// ─── 체험단 유형 ─────────────────────────────────────────────
const EXP_TYPES = new Set(['체험', '체험단', '기자→체험', '체험단(XHS)']);

// ─── 상태 그룹 ───────────────────────────────────────────────
const STATUS_ORDER = ['예약확정', '촬영완료', '업로드완료', '취소/노쇼', '기타'];
const STATUS_GROUPS = {
  '예약확정':   ['예약확정', '改时间', '인플', '예약요청', '변경요청', '긴급예약'],
  '촬영완료':   ['촬영완료'],
  '업로드완료': ['업로드대기', '업로드완료', '송부완료', '배포완료'],
  '취소/노쇼':  ['취소_방문자', '취소_고객사', '노쇼', '예약취소', '예약반려'],
};
const STATUS_COLORS = {
  '예약확정':   '#3b82f6',
  '촬영완료':   '#10b981',
  '업로드완료': '#7c3aed',
  '취소/노쇼':  '#ef4444',
  '기타':       '#4b5563',
};
const COORD_COLORS = { HH: '#7c3aed', LH: '#ec4899', AN: '#14b8a6' };

// "2026. 4월" → "2604"처럼 매핑하거나, 반대로
// 정산월(2604) vs 계약월(2026. 4월) 매핑 테이블
const MONTH_MAP = {
  '2601': '2026. 1월', '2602': '2026. 2월', '2603': '2026. 3월',
  '2604': '2026. 4월', '2605': '2026. 5월', '2606': '2026. 6월',
  '2607': '2026. 7월', '2608': '2026. 8월', '2609': '2026. 9월',
  '2610': '2026. 10월','2611': '2026. 11월','2612': '2026. 12월',
};

function getStatusGroup(status) {
  for (const [group, list] of Object.entries(STATUS_GROUPS)) {
    if (list.includes(status)) return group;
  }
  return '기타';
}

// ─── Custom Tooltip (담당자 상태 차트) ───────────────────────
function StatusTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, e) => s + (e.value || 0), 0);
  return (
    <div className="adm-tooltip">
      <div className="adm-tooltip-label">{label}</div>
      {payload.map((e, i) => (
        <div key={i} className="adm-tooltip-row">
          <span className="adm-tooltip-dot" style={{ background: e.color }} />
          <span className="adm-tooltip-name">{e.name}</span>
          <span className="adm-tooltip-val">{e.value}</span>
        </div>
      ))}
      <div className="adm-tooltip-total"><span>합계</span><span>{total}</span></div>
    </div>
  );
}

// ─── Custom Tooltip (고객사 차트) ────────────────────────────
function ClientTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const totalDone = payload.filter(e => ['HH','LH','AN'].includes(e.dataKey))
    .reduce((s, e) => s + (e.value || 0), 0);
  const target = payload.find(e => e.dataKey === '__target')?.payload?.__target || 0;
  return (
    <div className="adm-tooltip">
      <div className="adm-tooltip-label">{label}</div>
      {payload.filter(e => e.dataKey !== '__target').map((e, i) => (
        <div key={i} className="adm-tooltip-row">
          <span className="adm-tooltip-dot" style={{ background: e.color }} />
          <span className="adm-tooltip-name">{e.name}</span>
          <span className="adm-tooltip-val">{e.value}</span>
        </div>
      ))}
      <div className="adm-tooltip-divider" />
      <div className="adm-tooltip-row">
        <span className="adm-tooltip-name">실적 합계</span>
        <span className="adm-tooltip-val">{totalDone}</span>
      </div>
      {target > 0 && (
        <div className="adm-tooltip-row">
          <span className="adm-tooltip-name">목표</span>
          <span className="adm-tooltip-val adm-target-val">{target}</span>
        </div>
      )}
    </div>
  );
}

// ─── Total label on bar right end ────────────────────────────
function TotalLabel({ x, y, width, height, value }) {
  if (!value) return null;
  return (
    <text x={x + width + 8} y={y + height / 2 + 4}
      fill="#e5e7eb" fontSize={13} fontWeight={600}>
      {value}
    </text>
  );
}

// ─── Main ────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const [records, setRecords]         = useState([]);
  const [targetMap, setTargetMap]     = useState({});
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('all');

  useEffect(() => {
    fetch('/api/admin-dashboard')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setRecords(data.records || []);
        setTargetMap(data.targetMap || {});
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // 가능한 월 목록 (정산월 코드 기준)
  const availableMonths = useMemo(() => {
    const s = new Set();
    records.forEach(r => {
      const m = r.month || r.linkedMonth;
      if (m && MONTH_MAP[m]) s.add(m);
    });
    return ['all', ...Array.from(s).sort()];
  }, [records]);

  // ─── 데이터 가공 ─────────────────────────────────────────
  const { statusData, clientData } = useMemo(() => {
    if (!records.length) return { statusData: [], clientData: [] };

    // 1. 체험단 필터
    const hasType = records.some(r => r.type);
    let filtered = hasType
      ? records.filter(r => EXP_TYPES.has(r.type))
      : records;

    // 2. 월 필터
    if (selectedMonth !== 'all') {
      filtered = filtered.filter(r =>
        r.month === selectedMonth || r.linkedMonth === selectedMonth
      );
    }

    // 3. 담당자별 상태 집계
    const coordMap = {};
    ['HH', 'LH', 'AN'].forEach(c => {
      coordMap[c] = {};
      STATUS_ORDER.forEach(sg => { coordMap[c][sg] = 0; });
      coordMap[c]['__total'] = 0;
    });

    const clientCountMap = {};

    filtered.forEach(rec => {
      const c = rec.coordinator;
      const group = getStatusGroup(rec.status);
      if (!coordMap[c]) return;

      coordMap[c][group]++;
      coordMap[c]['__total']++;

      if (group !== '취소/노쇼' && group !== '기타') {
        const client = rec.client || 'Unknown';
        if (!clientCountMap[client]) {
          clientCountMap[client] = { name: client, HH: 0, LH: 0, AN: 0, total: 0, __target: 0 };
        }
        clientCountMap[client][c]++;
        clientCountMap[client].total++;
      }
    });

    // 4. 목표 수량 매핑 (계약월 → 정산월 코드로 변환)
    const campaignMonth = MONTH_MAP[selectedMonth] || null; // e.g. "2026. 4월"
    Object.entries(targetMap).forEach(([key, entries]) => {
      // key: "고객사명__지점명"
      const relevant = campaignMonth
        ? entries.filter(e => e.month === campaignMonth)
        : entries;
      if (!relevant.length) return;
      const totalTarget = relevant.reduce((s, e) => s + (e.target || 0), 0);
      // 클라이언트 차트 데이터에서 matching
      // 진행_DB_OLD는 중문명을 쓰고, Campaign_DB는 한국명을 쓰므로
      // 중문명 기반 매칭이 어려워 한국명 일부 텍스트 매칭 시도
      const [clientName] = key.split('__');
      Object.keys(clientCountMap).forEach(mapKey => {
        if (mapKey.includes(clientName) || clientName.includes(mapKey)) {
          clientCountMap[mapKey].__target = Math.max(
            clientCountMap[mapKey].__target, totalTarget
          );
        }
      });
    });

    const statusDataArray = ['HH', 'LH', 'AN'].map(coord => ({
      name: coord,
      ...Object.fromEntries(STATUS_ORDER.map(sg => [sg, coordMap[coord][sg]])),
      __total: coordMap[coord]['__total'],
    }));

    const clientDataArray = Object.values(clientCountMap)
      .sort((a, b) => b.total - a.total);

    return { statusData: statusDataArray, clientData: clientDataArray };
  }, [records, targetMap, selectedMonth]);

  // ─── Loading / Error ─────────────────────────────────────
  if (loading) return (
    <div className="adm-page">
      <div className="adm-loading">
        <div className="adm-spinner" />
        <p>데이터 불러오는 중...</p>
      </div>
    </div>
  );
  if (error) return (
    <div className="adm-page">
      <div className="adm-error">⚠️ {error}</div>
    </div>
  );

  const monthLabel = selectedMonth === 'all' ? '전체' : (MONTH_MAP[selectedMonth] || selectedMonth);

  return (
    <div className="adm-page">
      {/* 헤더 */}
      <header className="adm-header">
        <div className="adm-logo"><span className="adm-logo-dot" /> TAM KOREA</div>
        <h1>담당자별 실적 현황</h1>
        <p>체험단 기준 &nbsp;·&nbsp; HH / LH / AN</p>
      </header>

      {/* 월 선택 */}
      <div className="adm-filter-bar">
        {availableMonths.map(m => (
          <button
            key={m}
            className={`adm-filter-btn ${selectedMonth === m ? 'active' : ''}`}
            onClick={() => setSelectedMonth(m)}
          >
            {m === 'all' ? '전체' : (MONTH_MAP[m] || m)}
          </button>
        ))}
      </div>

      {/* Chart 1: 담당자별 상태 */}
      <div className="adm-section-label">담당자별 상태 현황 — {monthLabel}</div>
      <div className="adm-chart-card">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={statusData} layout="vertical"
            margin={{ top: 8, right: 80, left: 10, bottom: 8 }} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis type="number" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
            <YAxis dataKey="name" type="category" stroke="transparent"
              tick={{ fill: '#e5e7eb', fontSize: 15, fontWeight: 700 }} width={38} />
            <Tooltip content={<StatusTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend iconType="square" iconSize={10}
              wrapperStyle={{ paddingTop: 14, fontSize: 12, color: '#9ca3af' }} />
            {STATUS_ORDER.map(group => (
              <Bar key={group} dataKey={group} stackId="a" fill={STATUS_COLORS[group]}>
                {group === '기타' && (
                  <LabelList dataKey="__total" content={<TotalLabel />} />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2: 고객사별 실적 + 목표 */}
      <div className="adm-section-label">
        고객사별 실적 — {monthLabel}
        <span className="adm-section-sub">취소/노쇼 제외 · 목표 마커 표시</span>
      </div>
      <div className="adm-chart-card adm-chart-card--scroll">
        <ResponsiveContainer
          width="100%"
          height={Math.max(320, clientData.length * 26 + 80)}
        >
          <BarChart data={clientData} layout="vertical"
            margin={{ top: 8, right: 70, left: 16, bottom: 8 }} barSize={14}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis type="number" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} allowDecimals={false} />
            <YAxis dataKey="name" type="category" stroke="transparent"
              tick={{ fill: '#d1d5db', fontSize: 11 }} width={150} />
            <Tooltip content={<ClientTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend iconType="square" iconSize={10}
              wrapperStyle={{ paddingTop: 14, fontSize: 12, color: '#9ca3af' }} />
            <Bar dataKey="HH" stackId="a" fill={COORD_COLORS.HH} name="HH" />
            <Bar dataKey="LH" stackId="a" fill={COORD_COLORS.LH} name="LH" />
            <Bar dataKey="AN" stackId="a" fill={COORD_COLORS.AN} name="AN">
              <LabelList dataKey="total" position="right"
                style={{ fill: '#9ca3af', fontSize: 11 }} />
            </Bar>
            {/* 목표 수량 마커 (세로 점선) */}
            {clientData.map((d, i) =>
              d.__target > 0
                ? <ReferenceLine key={i} x={d.__target} stroke="#f59e0b"
                    strokeDasharray="4 3" strokeWidth={1.5}
                    label={{ value: `목표 ${d.__target}`, fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }}
                  />
                : null
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
