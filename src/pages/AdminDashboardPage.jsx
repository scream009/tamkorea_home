import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList, Customized
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

// 월 선택 옵션 (추후 추가 가능)
const MONTH_OPTIONS = [
  { code: '2603', label: '3월' },
  { code: '2604', label: '4월' },
];

function getStatusGroup(status) {
  for (const [group, list] of Object.entries(STATUS_GROUPS)) {
    if (list.includes(status)) return group;
  }
  return '기타';
}

// ─── Tooltip: 담당자 차트 ────────────────────────────────────
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

// ─── Tooltip: 고객사 차트 ────────────────────────────────────
function ClientTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const totalDone = payload.reduce((s, e) => s + (e.value || 0), 0);
  const target = payload[0]?.payload?.__target || 0;
  const [name] = (label || '').split('||');
  return (
    <div className="adm-tooltip">
      <div className="adm-tooltip-label">{name}</div>
      {payload.map((e, i) => (
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

// ─── 커스텀 범례 (순서 고정) ────────────────────────────────
function CustomLegend({ items }) {
  return (
    <div className="adm-custom-legend">
      {items.map(({ label, color }) => (
        <span key={label} className="adm-legend-item">
          <span className="adm-legend-dot" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ─── 담당자 차트 오른쪽 합계 라벨 ───────────────────────────
function TotalLabel({ x, y, width, height, value }) {
  if (!value) return null;
  return (
    <text x={x + width + 8} y={y + height / 2 + 4}
      fill="#e5e7eb" fontSize={13} fontWeight={600}>
      {value}
    </text>
  );
}

// ─── Y축 커스텀 Tick: 고객사명 + 목표수량 ───────────────────
function ClientYTick({ x, y, payload }) {
  const raw = payload.value || '';
  const [name, targetStr] = raw.split('||');
  const target = Number(targetStr || 0);
  return (
    <g>
      <text x={x - 6} y={y + (target > 0 ? 1 : 4)}
        textAnchor="end" fill="#d1d5db" fontSize={11}>
        {name}
      </text>
      {target > 0 && (
        <text x={x - 6} y={y + 13}
          textAnchor="end" fill="#f59e0b" fontSize={9.5} fontWeight={600}>
          목표 {target}
        </text>
      )}
    </g>
  );
}

// ─── Main ────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState('2604'); // 기본값: 4월
  const [records, setRecords]   = useState([]);
  const [targetMap, setTargetMap] = useState({});
  const [monthText, setMonthText] = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // 월이 바뀔 때마다 API 재호출
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin-dashboard?month=${selectedMonth}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setRecords(data.records || []);
        setTargetMap(data.targetMap || {});
        setMonthText(data.monthText || '');
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  // ─── 데이터 가공 ─────────────────────────────────────────
  const { statusData, clientData } = useMemo(() => {
    if (!records.length) return { statusData: [], clientData: [] };

    // 1. 체험단 유형 필터 (유형 필드가 있는 경우에만 적용)
    const hasType = records.some(r => r.type);
    const filtered = hasType ? records.filter(r => EXP_TYPES.has(r.type)) : records;

    // 2. 담당자별 상태 집계
    const coordMap = {};
    ['HH', 'LH', 'AN'].forEach(c => {
      coordMap[c] = { __total: 0 };
      STATUS_ORDER.forEach(sg => { coordMap[c][sg] = 0; });
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
        const branch = rec.branch || '';
        const displayKey = branch ? `${client} ${branch}` : client;
        if (!clientCountMap[displayKey]) {
          clientCountMap[displayKey] = {
            clientName: client, branchName: branch,
            HH: 0, LH: 0, AN: 0, total: 0, __target: 0
          };
        }
        clientCountMap[displayKey][c]++;
        clientCountMap[displayKey].total++;
      }
    });

    // 3. 목표 수량 매핑 (API가 이미 해당 월 데이터만 반환하므로 단순 매칭)
    Object.entries(targetMap).forEach(([key, target]) => {
      if (!target) return;
      const [clientKr, branchKr] = key.split('__');

      Object.keys(clientCountMap).forEach(displayKey => {
        const d = clientCountMap[displayKey];

        const nameMatch =
          d.clientName === clientKr ||
          d.clientName?.includes(clientKr) ||
          clientKr?.includes(d.clientName);

        // 지점명: 완전 일치만 (substring 금지)
        const branchMatch =
          !branchKr || !d.branchName || d.branchName === branchKr;

        if (nameMatch && branchMatch) {
          d.__target = Math.max(d.__target, target);
        }
      });
    });

    const statusDataArray = ['HH', 'LH', 'AN'].map(coord => ({
      name: coord,
      ...Object.fromEntries(STATUS_ORDER.map(sg => [sg, coordMap[coord][sg]])),
      __total: coordMap[coord]['__total'],
    }));

    const clientDataArray = Object.entries(clientCountMap)
      .map(([displayKey, d]) => ({
        nameWithTarget: `${displayKey}||${d.__target}`,
        name: displayKey,
        HH: d.HH, LH: d.LH, AN: d.AN,
        total: d.total,
        __target: d.__target,
      }))
      .sort((a, b) => {
        // 목표수량 내림차순, 목표 없는 항목은 실적 내림차순으로 맨 뒤
        if (b.__target !== a.__target) return b.__target - a.__target;
        return b.total - a.total;
      });

    return { statusData: statusDataArray, clientData: clientDataArray };
  }, [records, targetMap]);

  // ─── Loading / Error ─────────────────────────────────────
  if (error) return (
    <div className="adm-page">
      <div className="adm-error">⚠️ {error}</div>
    </div>
  );

  const selectedLabel = MONTH_OPTIONS.find(m => m.code === selectedMonth)?.label || selectedMonth;

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
        {MONTH_OPTIONS.map(m => (
          <button
            key={m.code}
            className={`adm-filter-btn ${selectedMonth === m.code ? 'active' : ''}`}
            onClick={() => setSelectedMonth(m.code)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="adm-loading-inline">
          <div className="adm-spinner" />
          <span>{selectedLabel} 데이터 로딩 중...</span>
        </div>
      ) : (
        <>
          {/* Chart 1: 담당자별 상태 */}
          <div className="adm-section-label">
            {selectedLabel} 담당자별 상태 현황
          </div>
          <div className="adm-chart-card">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={statusData} layout="vertical"
                margin={{ top: 8, right: 80, left: 10, bottom: 8 }} barSize={30}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis dataKey="name" type="category" stroke="transparent"
                  tick={{ fill: '#e5e7eb', fontSize: 15, fontWeight: 700 }} width={38} />
                <Tooltip content={<StatusTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                {STATUS_ORDER.map(group => (
                  <Bar key={group} dataKey={group} stackId="a" fill={STATUS_COLORS[group]}>
                    <LabelList dataKey="__total" content={(props) => {
                      const { index, x, y, width, height } = props;
                      if (x == null || y == null || width == null) return null;
                      
                      const row = statusData[index];
                      if (!row) return null;
                      
                      // 숫자 강제 변환 후 마지막 유효 세그먼트 찾기
                      let lastNonZero = null;
                      for (let i = STATUS_ORDER.length - 1; i >= 0; i--) {
                        if (Number(row[STATUS_ORDER[i]]) > 0) {
                          lastNonZero = STATUS_ORDER[i];
                          break;
                        }
                      }
                      
                      // 현재 그룹이 마지막 세그먼트가 아니면 라벨 렌더링 안 함
                      if (group !== lastNonZero) return null;

                      return (
                        <text x={x + width + 8} y={y + height / 2}
                          fill="#e5e7eb" fontSize={13} fontWeight={600}
                          dominantBaseline="central">
                          {row.__total}
                        </text>
                      );
                    }} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
            <CustomLegend items={STATUS_ORDER.map(g => ({ label: g, color: STATUS_COLORS[g] }))} />
          </div>



          {/* Chart 2: 고객사별 실적 */}
          <div className="adm-section-label">
            {selectedLabel} 고객사별 실적
            <span className="adm-section-sub">취소/노쇼 제외 · 노란색 = 목표</span>
          </div>
          <div className="adm-chart-card adm-chart-card--scroll">
            <ResponsiveContainer width="100%" height={Math.max(320, clientData.length * 32 + 80)}>
              <BarChart data={clientData} layout="vertical"
                margin={{ top: 8, right: 60, left: 16, bottom: 8 }} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} allowDecimals={false} />
                <YAxis dataKey="nameWithTarget" type="category" stroke="transparent"
                  tick={<ClientYTick />} width={170} interval={0} />
                <Tooltip content={<ClientTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend iconType="square" iconSize={10}
                  wrapperStyle={{ paddingTop: 14, fontSize: 12, color: '#9ca3af' }} />
                <Bar dataKey="HH" stackId="a" fill={COORD_COLORS.HH} name="HH" />
                <Bar dataKey="LH" stackId="a" fill={COORD_COLORS.LH} name="LH" />
                <Bar dataKey="AN" stackId="a" fill={COORD_COLORS.AN} name="AN">
                  <LabelList dataKey="total" position="right"
                    style={{ fill: '#9ca3af', fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
