import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList, Cell
} from 'recharts';
import './AdminDashboardPage.css';

// ─── 체험단 유형 목록 ────────────────────────────────────────
const EXP_TYPES = ['체험', '체험단', '기자→체험'];

// ─── 상태 그룹 (사용자 요청 순서 기준) ──────────────────────
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

// ─── 담당자 색상 ─────────────────────────────────────────────
const COORD_COLORS = {
  'HH': '#7c3aed',
  'LH': '#ec4899',
  'AN': '#14b8a6',
};

function getStatusGroup(status) {
  for (const [group, list] of Object.entries(STATUS_GROUPS)) {
    if (list.includes(status)) return group;
  }
  return '기타';
}

// ─── 커스텀 툴팁 ─────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, e) => s + (e.value || 0), 0);
  return (
    <div className="adm-tooltip">
      <div className="adm-tooltip-label">{label}</div>
      {payload.map((entry, i) => (
        <div key={i} className="adm-tooltip-row">
          <span className="adm-tooltip-dot" style={{ background: entry.color }} />
          <span className="adm-tooltip-name">{entry.name}</span>
          <span className="adm-tooltip-val">{entry.value}</span>
        </div>
      ))}
      <div className="adm-tooltip-total"><span>합계</span><span>{total}</span></div>
    </div>
  );
}

// ─── 커스텀 라벨 (막대 오른쪽 끝에 합계 표시) ───────────────
function TotalLabel(props) {
  const { x, y, width, height, value } = props;
  if (!value) return null;
  return (
    <text
      x={x + width + 8}
      y={y + height / 2}
      dy={4}
      fill="#e5e7eb"
      fontSize={13}
      fontWeight={600}
    >
      {value}
    </text>
  );
}

// ─── Main ────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('all');

  useEffect(() => {
    fetch('/api/admin-dashboard')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setRecords(data.records || []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // 사용 가능한 월 목록 자동 생성
  const availableMonths = useMemo(() => {
    const monthSet = new Set();
    records.forEach(r => {
      const m = r.month || r.linkedMonth;
      if (m) monthSet.add(m);
    });
    return ['all', ...Array.from(monthSet).sort()];
  }, [records]);

  // ─── 데이터 처리 ─────────────────────────────────────────
  const { statusData, clientData } = useMemo(() => {
    if (!records.length) return { statusData: [], clientData: [] };

    // 1. 체험단 유형만 필터
    let filtered = records.filter(r => EXP_TYPES.includes(r.type) || r.type === '');
    // 유형 필드가 빈 경우를 대비해: 유형 데이터가 전혀 없으면 전체 사용
    const hasType = records.some(r => r.type);
    if (hasType) {
      filtered = records.filter(r => EXP_TYPES.includes(r.type));
    }

    // 2. 월 필터
    if (selectedMonth !== 'all') {
      filtered = filtered.filter(r =>
        String(r.month).includes(selectedMonth) ||
        String(r.linkedMonth).includes(selectedMonth)
      );
    }

    // 3. 담당자별 상태 집계
    const coordMap = {};
    ['HH', 'LH', 'AN'].forEach(c => {
      coordMap[c] = {};
      STATUS_ORDER.forEach(sg => coordMap[c][sg] = 0);
      coordMap[c]['__total'] = 0;
    });

    const clientCountMap = {};

    filtered.forEach(rec => {
      const c = rec.coordinator;
      const group = getStatusGroup(rec.status);
      if (!coordMap[c]) return;

      coordMap[c][group]++;
      coordMap[c]['__total']++;

      // 고객사 집계 (취소/노쇼 제외)
      if (group !== '취소/노쇼' && group !== '기타') {
        const client = rec.client || 'Unknown';
        if (!clientCountMap[client]) {
          clientCountMap[client] = { name: client, HH: 0, LH: 0, AN: 0, total: 0 };
        }
        clientCountMap[client][c] = (clientCountMap[client][c] || 0) + 1;
        clientCountMap[client].total++;
      }
    });

    const statusDataArray = ['HH', 'LH', 'AN'].map(coord => ({
      name: coord,
      ...Object.fromEntries(STATUS_ORDER.map(sg => [sg, coordMap[coord][sg]])),
      __total: coordMap[coord]['__total'],
    }));

    // 전체 고객사, 총합 내림차순 정렬
    const clientDataArray = Object.values(clientCountMap)
      .sort((a, b) => b.total - a.total);

    return { statusData: statusDataArray, clientData: clientDataArray };
  }, [records, selectedMonth]);

  if (loading) return (
    <div className="adm-page">
      <div className="adm-loading">
        <div className="adm-spinner" />
        <p>데이터 로딩 중...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="adm-page">
      <div className="adm-error">⚠️ {error}</div>
    </div>
  );

  const monthLabel = selectedMonth === 'all' ? '전체' : selectedMonth;

  return (
    <div className="adm-page">
      {/* 헤더 */}
      <header className="adm-header">
        <div className="adm-logo"><span className="adm-logo-dot" /> TAM KOREA</div>
        <h1>담당자별 실적 현황</h1>
        <p>체험단 기준 · HH / LH / AN</p>
      </header>

      {/* 월 선택 필터 */}
      <div className="adm-filter-bar">
        {availableMonths.map(m => (
          <button
            key={m}
            className={`adm-filter-btn ${selectedMonth === m ? 'active' : ''}`}
            onClick={() => setSelectedMonth(m)}
          >
            {m === 'all' ? '전체' : m}
          </button>
        ))}
      </div>

      <div className="adm-section-label">📊 담당자별 상태 현황 ({monthLabel})</div>

      {/* Chart 1: 담당자별 상태 (가로 누적 막대) */}
      <div className="adm-chart-card">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={statusData}
            layout="vertical"
            margin={{ top: 8, right: 80, left: 10, bottom: 8 }}
            barSize={32}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <XAxis type="number" stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis
              dataKey="name"
              type="category"
              stroke="transparent"
              tick={{ fill: '#e5e7eb', fontSize: 14, fontWeight: 600 }}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend
              wrapperStyle={{ paddingTop: 16, fontSize: 12, color: '#9ca3af' }}
            />
            {STATUS_ORDER.map((group, idx) => (
              <Bar key={group} dataKey={group} stackId="a" fill={STATUS_COLORS[group]}>
                {/* 마지막 세그먼트에만 합계 라벨 */}
                {group === STATUS_ORDER[STATUS_ORDER.length - 1] && (
                  <LabelList dataKey="__total" content={<TotalLabel />} />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="adm-section-label">🏢 고객사별 실적 ({monthLabel} · 취소/노쇼 제외)</div>

      {/* Chart 2: 고객사별 실적 (전체, 가로 누적) */}
      <div className="adm-chart-card">
        <ResponsiveContainer width="100%" height={Math.max(300, clientData.length * 28 + 60)}>
          <BarChart
            data={clientData}
            layout="vertical"
            margin={{ top: 8, right: 60, left: 16, bottom: 8 }}
            barSize={16}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <XAxis type="number" stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis
              dataKey="name"
              type="category"
              stroke="transparent"
              tick={{ fill: '#d1d5db', fontSize: 11 }}
              width={160}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend wrapperStyle={{ paddingTop: 16, fontSize: 12, color: '#9ca3af' }} />
            <Bar dataKey="HH" stackId="a" fill={COORD_COLORS['HH']} name="HH" />
            <Bar dataKey="LH" stackId="a" fill={COORD_COLORS['LH']} name="LH" />
            <Bar dataKey="AN" stackId="a" fill={COORD_COLORS['AN']} name="AN">
              <LabelList dataKey="total" position="right" style={{ fill: '#9ca3af', fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
