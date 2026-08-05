import React from 'react';
import { Link } from 'react-router-dom';
import './StaffNav.css';

/**
 * 담당자 화면 공통 메뉴 — 오른쪽 정렬, **현재 페이지가 강조**된다.
 *
 * 구성 (Owner 확정 2026-08-05):
 *   조회 3분류: 진도 보드 · 발송 큐 · 인플 보드  (안에서 수정도 되지만 성격은 조회)
 *   입력 2개:   ＋예약입력 · ＋신규인플          (조회와 시각적으로 구분)
 */
const VIEW_ITEMS = [
  { key: 'board', to: '/staff', label: '진도 보드' },
  { key: 'queue', to: '/staff/queue', label: '발송 큐' },
  { key: 'infl', to: '/staff/infl', label: '인플 보드' },
];
const INPUT_ITEMS = [
  { key: 'new', to: '/staff/new', label: '＋ 예약입력' },
  { key: 'inflNew', to: '/staff/infl?new=1', label: '＋ 신규인플' },
];

export default function StaffNav({ current }) {
  return (
    <nav className="snav-wrap">
      <div className="snav">
        {VIEW_ITEMS.map((it) => (
          <Link
            key={it.key}
            to={it.to}
            className={`snav-it ${current === it.key ? 'on' : ''}`}
            aria-current={current === it.key ? 'page' : undefined}
          >{it.label}</Link>
        ))}
      </div>
      <div className="snav snav-input">
        {INPUT_ITEMS.map((it) => (
          <Link
            key={it.key}
            to={it.to}
            className={`snav-it ${current === it.key ? 'on' : ''}`}
            aria-current={current === it.key ? 'page' : undefined}
          >{it.label}</Link>
        ))}
      </div>
    </nav>
  );
}
