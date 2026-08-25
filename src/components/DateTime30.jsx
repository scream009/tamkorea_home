import React, { useState } from 'react';

/**
 * 날짜 + 시간 선택 — datetime-local 대체 (Owner 2026-08-05 → 2026-08-25 개정).
 *
 * 시간은 30분 격자 드롭다운이 기본이되,
 *   - 목록은 09:00 부터 시작한다 (새벽 예약은 없다 — 00:00 부터면 한참 내려야 했다)
 *   - 새벽(00:00~08:30)은 지우지 않고 맨 아래 그룹으로 접어 둔다
 *   - 맨 위 「직접 입력…」을 고르면 분 단위 자유 입력칸으로 바뀐다 (10:15 같은 값)
 *   - 격자에 없는 값이 들어오면(기존 예약 10:15) 자동으로 직접 입력 모드로 열어 그대로 보여준다
 *     → 예전엔 목록에 없어 빈 칸으로 보이거나(전체수정) 10:00 으로 내려 보였다(변경 모달 snap30)
 *
 * value: "YYYY-MM-DDTHH:mm" 또는 ''. 초기값은 마운트 시 1회만 읽는다 —
 * 리셋이 필요하면 부모가 key 를 바꿔 리마운트한다.
 * onChange 는 날짜·시간이 둘 다 유효할 때만 합쳐 보내고, 아니면 '' 를 보낸다.
 */
const CUSTOM = '__custom';
const pad = (n) => String(n).padStart(2, '0');
const DAY = [];   // 09:00 ~ 23:30
const DAWN = [];  // 00:00 ~ 08:30
for (let h = 0; h < 24; h += 1) {
  const list = h >= 9 ? DAY : DAWN;
  list.push(`${pad(h)}:00`, `${pad(h)}:30`);
}
const GRID = new Set([...DAY, ...DAWN]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function DateTime30({ value, onChange, inputClass = '' }) {
  const initT = value ? value.slice(11, 16) : '';
  const [d, setD] = useState(value ? value.slice(0, 10) : '');
  const [t, setT] = useState(initT);
  // 격자에 없는 시각은 직접 입력 모드로 시작 — 값을 깎지 않고 그대로 보여준다
  const [custom, setCustom] = useState(Boolean(initT) && !GRID.has(initT));

  function up(nd, nt) {
    setD(nd);
    setT(nt);
    onChange(nd && TIME_RE.test(nt) ? `${nd}T${nt}` : '');
  }

  function pickGrid(v) {
    if (v === CUSTOM) { setCustom(true); return; }  // 시간은 그대로 두고 입력칸만 연다
    up(d, v);
  }

  function backToGrid() {
    setCustom(false);
    // 격자에 없는 값이면 목록에서 고르도록 비운다 (직접 입력값을 몰래 반올림하지 않는다)
    if (!GRID.has(t)) up(d, '');
  }

  return (
    <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
      <input
        type="date"
        className={inputClass}
        style={{ flex: 1, minWidth: 0 }}
        value={d}
        onChange={(e) => up(e.target.value, t)}
      />
      {custom ? (
        <>
          <input
            type="time"
            className={inputClass}
            style={{ flex: '0 0 7.2rem' }}
            value={t}
            onChange={(e) => up(d, e.target.value)}
            aria-label="시간 직접 입력 (분 단위)"
            autoFocus
          />
          <button
            type="button"
            onClick={backToGrid}
            title="30분 단위 목록으로"
            style={{
              flex: '0 0 auto', background: 'transparent', border: '1px solid currentColor',
              borderRadius: 6, color: 'inherit', opacity: .6, font: 'inherit', fontSize: '.72rem',
              padding: '.2rem .45rem', cursor: 'pointer', lineHeight: 1.2,
            }}
          >목록</button>
        </>
      ) : (
        <select
          className={inputClass}
          style={{ flex: '0 0 7.2rem' }}
          value={t}
          onChange={(e) => pickGrid(e.target.value)}
        >
          <option value="">시간 선택</option>
          <option value={CUSTOM}>직접 입력…</option>
          {DAY.map((x) => <option key={x} value={x}>{x}</option>)}
          <optgroup label="새벽">
            {DAWN.map((x) => <option key={x} value={x}>{x}</option>)}
          </optgroup>
        </select>
      )}
    </div>
  );
}
