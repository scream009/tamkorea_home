import React, { useState } from 'react';

/**
 * 날짜 + 30분 단위 시간 선택 — datetime-local 대체 (Owner 2026-08-05).
 *
 * 네이티브 datetime-local 은 분 단위가 자유롭고 확인 버튼이 없어 불편하다는 피드백.
 * 날짜는 네이티브 date, 시간은 30분 간격 드롭다운 — 드롭다운 선택이 곧 확정이라
 * 별도 확인 버튼이 필요 없다.
 *
 * value: "YYYY-MM-DDTHH:mm" 또는 ''. 초기값은 마운트 시 1회만 읽는다 —
 * 리셋이 필요하면 부모가 key 를 바꿔 리마운트한다.
 */
const TIMES = [];
for (let h = 0; h < 24; h += 1) {
  TIMES.push(`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`);
}

export default function DateTime30({ value, onChange, inputClass = '' }) {
  const [d, setD] = useState(value ? value.slice(0, 10) : '');
  const [t, setT] = useState(value ? value.slice(11, 16) : '');

  function up(nd, nt) {
    setD(nd);
    setT(nt);
    onChange(nd && nt ? `${nd}T${nt}` : '');
  }

  return (
    <div style={{ display: 'flex', gap: '.4rem' }}>
      <input
        type="date"
        className={inputClass}
        style={{ flex: 1 }}
        value={d}
        onChange={(e) => up(e.target.value, t)}
      />
      <select
        className={inputClass}
        style={{ flex: '0 0 7rem' }}
        value={t}
        onChange={(e) => up(d, e.target.value)}
      >
        <option value="">시간 선택</option>
        {TIMES.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
}
