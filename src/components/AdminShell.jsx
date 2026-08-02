import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/**
 * 관리자 화면 공통 껍데기 — 왼쪽 메뉴 + 본문.
 *
 * 화면이 늘어날 때마다 각 페이지가 자기 네비를 그리면 금방 어긋난다.
 * 메뉴는 여기 한 곳에서만 정의한다.
 *
 * ⚠️ 이 컴포넌트는 **보안 장치가 아니다.** 실제 차단은 서버(_admin-auth.js)가 하고,
 *    AdminGate 는 키 입력 UI 다. 메뉴를 숨겨도 API 는 열려 있지 않다.
 */

const MENU = [
  { to: '/admin', label: '담당자별 실적', desc: '월실적 조정', icon: '📊', end: true },
  { to: '/admin/dianping', label: '따종 고객 현황', desc: '광고·리뷰 상태', icon: '🏮' },
  { to: '/admin/board', label: '예약 보드', desc: '순서 조정', icon: '🗂️' },
];

export default function AdminShell({ children }) {
  const loc = useLocation();
  const cur = MENU.find((m) => (m.end ? loc.pathname === m.to : loc.pathname.startsWith(m.to)));

  return (
    <div className="ash">
      <aside className="ash-side">
        <div className="ash-logo">
          <span className="ash-dot" />
          <span>TAM KOREA</span>
          <b>ADMIN</b>
        </div>
        <nav className="ash-nav">
          {MENU.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.end}
              className={({ isActive }) => `ash-item${isActive ? ' on' : ''}`}
            >
              <span className="ash-ic" aria-hidden="true">{m.icon}</span>
              <span className="ash-tx">
                <span className="ash-l">{m.label}</span>
                <span className="ash-d">{m.desc}</span>
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="ash-foot">
          정산·계약 데이터입니다.<br />공유 전에 한 번 더 확인해 주세요.
        </div>
      </aside>

      <main className="ash-main">
        {cur && (
          <div className="ash-crumb">
            <span>{cur.icon}</span>
            <b>{cur.label}</b>
            <span className="ash-crumb-d">{cur.desc}</span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
