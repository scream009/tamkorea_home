import React from 'react';
import { Link } from 'react-router-dom';
import './StaffNav.css';

/**
 * 담당자 화면 공통 메뉴 — 오른쪽 정렬, **현재 페이지가 강조**된다.
 * (특정 버튼만 튀게 하지 않는다 — Owner 피드백 2026-08-05)
 */
const ITEMS = [
  { key: 'board', to: '/staff', label: '진도 보드' },
  { key: 'new', to: '/staff/new', label: '예약입력' },
  { key: 'queue', to: '/staff/queue', label: '발송 큐' },
  { key: 'infl', to: '/staff/infl', label: '인플' },
];

export default function StaffNav({ current }) {
  return (
    <nav className="snav">
      {ITEMS.map((it) => (
        <Link
          key={it.key}
          to={it.to}
          className={`snav-it ${current === it.key ? 'on' : ''}`}
          aria-current={current === it.key ? 'page' : undefined}
        >{it.label}</Link>
      ))}
    </nav>
  );
}
