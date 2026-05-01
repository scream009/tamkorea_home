import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import './AdminDashboardPage.css';

const STATUS_GROUPS = {
  '예약확정': ['예약확정', '改时间', '인플'],
  '촬영완료': ['촬영완료'],
  '업로드완료': ['업로드대기', '업로드완료', '송부완료', '배포완료'],
  '취소/노쇼': ['취소_방문자', '취소_고객사', '노쇼', '예약취소', '예약반려'],
};

const STATUS_COLORS = {
  '예약확정': '#3b82f6',
  '촬영완료': '#10b981',
  '업로드완료': '#8b5cf6',
  '취소/노쇼': '#ef4444',
  '기타': '#6b7280'
};

const STATUS_ORDER = ['예약확정', '촬영완료', '업로드완료', '취소/노쇼', '기타'];

const COORD_COLORS = {
  'HH': '#7c3aed',
  'LH': '#ec4899',
  'AN': '#14b8a6',
  '기타': '#6b7280'
};

function getStatusGroup(status) {
  for (const [group, statuses] of Object.entries(STATUS_GROUPS)) {
    if (statuses.includes(status)) return group;
  }
  return '기타';
}

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    let total = 0;
    payload.forEach(entry => total += entry.value);

    return (
      <div className="admin-tooltip">
        <h4>{label}</h4>
        {payload.map((entry, index) => (
          <div key={`item-${index}`} className="admin-tooltip-item">
            <span className="admin-tooltip-color" style={{ backgroundColor: entry.color }}></span>
            <span className="admin-tooltip-name">{entry.name}</span>
            <span className="admin-tooltip-value">{entry.value}</span>
          </div>
        ))}
        <div className="admin-tooltip-total">
          <span>Total:</span>
          <span>{total}</span>
        </div>
      </div>
    );
  }
  return null;
}

export default function AdminDashboardPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/admin-dashboard')
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setRecords(data.records || []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // ─── Data Processing ────────────────────────────────────────

  const { statusData, clientData, totalValid } = useMemo(() => {
    if (!records.length) return { statusData: [], clientData: [], totalValid: 0 };

    // 1. Filter records by month (e.g., '2604' for April)
    const currentMonth = '2604'; // TODO: Make this dynamic via dropdown if needed
    const filteredRecords = records.filter(r => r.month === currentMonth || r.linkedMonth === 'rec... (or we just rely on month text if available, for now checking string "2604")');
    // Actually, just checking substring or exact match.
    const monthRecords = records.filter(r => r.month === currentMonth);

    // 2. Coordinator Status Data
    const coordMap = { HH: {}, LH: {}, AN: {} };
    Object.keys(coordMap).forEach(c => {
      STATUS_ORDER.forEach(sg => coordMap[c][sg] = 0);
    });

    let validCount = 0;
    const clientCountMap = {};

    monthRecords.forEach(rec => {
      const c = rec.coordinator;
      const group = getStatusGroup(rec.status);
      
      if (coordMap[c] !== undefined) {
        coordMap[c][group] = (coordMap[c][group] || 0) + 1;
      }

      // 3. Client Data (Valid only)
      if (group !== '취소/노쇼' && group !== '기타' && (c === 'HH' || c === 'LH' || c === 'AN')) {
        validCount++;
        const client = rec.client;
        if (!clientCountMap[client]) {
          clientCountMap[client] = { name: client, HH: 0, LH: 0, AN: 0, total: 0 };
        }
        clientCountMap[client][c]++;
        clientCountMap[client].total++;
      }
    });

    const statusDataArray = Object.keys(coordMap).map(coord => ({
      name: coord,
      ...coordMap[coord]
    }));

    // Sort clients by total and take top 15
    const clientDataArray = Object.values(clientCountMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    return { statusData: statusDataArray, clientData: clientDataArray, totalValid: validCount };
  }, [records]);


  if (loading) return <div className="admin-loading">Loading Dashboard Data...</div>;
  if (error) return <div className="admin-error">Error: {error}</div>;

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <div className="admin-logo"><span className="admin-logo-dot" /> TAM KOREA</div>
        <h1>Coordinator Performance</h1>
        <p>Real-time overview of HH, LH, AN activity</p>
      </div>

      <div className="admin-stats-row">
        <div className="admin-stat-card">
          <div className="stat-label">Total Records (April)</div>
          <div className="stat-value">{statusData.reduce((sum, curr) => sum + Object.values(curr).filter(v => typeof v === 'number').reduce((a,b)=>a+b, 0), 0)}</div>
        </div>
        <div className="admin-stat-card">
          <div className="stat-label">Valid Campaigns (April)</div>
          <div className="stat-value highlight">{totalValid}</div>
        </div>
      </div>

      <div className="admin-charts-container">
        {/* Chart 1: Status by Coordinator */}
        <div className="admin-chart-card">
          <h2>Overall Status by Coordinator (April 2026)</h2>
          <div className="admin-chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} layout="vertical" margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={true} vertical={false} />
                <XAxis type="number" stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                <YAxis dataKey="name" type="category" stroke="#9ca3af" tick={{ fill: '#9ca3af' }} width={40} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                {STATUS_ORDER.map(group => (
                  <Bar key={group} dataKey={group} stackId="a" fill={STATUS_COLORS[group]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Top Clients */}
        <div className="admin-chart-card">
          <h2>Top 15 Clients by Valid Campaigns</h2>
          <div className="admin-chart-wrapper" style={{ height: '500px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={true} vertical={false} />
                <XAxis type="number" stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                <YAxis dataKey="name" type="category" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} width={120} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                <Bar dataKey="HH" stackId="a" fill={COORD_COLORS['HH']} />
                <Bar dataKey="LH" stackId="a" fill={COORD_COLORS['LH']} />
                <Bar dataKey="AN" stackId="a" fill={COORD_COLORS['AN']} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
