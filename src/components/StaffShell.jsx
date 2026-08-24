import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { clearStaffKey } from '../lib/staffKey';
import './StaffShell.css';

/**
 * 담당자 화면 공통 셸 — **상단 고정 2단 메뉴** (Owner 2026-08-24).
 *
 * 왜 만들었나: StaffNav 를 페이지마다 자기 헤더 안에 넣어 두다 보니, 진도보드에서는
 * 정렬 버튼 옆, 예약발송에서는 새로고침 옆… 화면을 옮길 때마다 메뉴 위치가 튀었다.
 * 이제 라우트를 이 셸로 감싸 **모든 화면에서 같은 자리(맨 위 고정)** 에 둔다.
 *
 * 2단 구조: 위 = 대분류(진도·예약·인플·체험단), 아래 = 그 분류의 하위 메뉴.
 * 하위가 하나뿐인 분류도 줄을 유지한다 — 줄 높이가 오락가락하면 그것도 정신없다.
 */
const SECTIONS = [
  {
    key: 'board', label: '진행관리', icon: '📊',
    items: [{ to: '/staff', label: '진도 보드', match: (p) => p === '/staff' }],
  },
  {
    key: 'resv', label: '예약관리', icon: '📤',
    items: [
      { to: '/staff/queue', label: '예약발송', match: (p) => p.startsWith('/staff/queue') },
      { to: '/staff/new', label: '＋ 예약입력', match: (p) => p.startsWith('/staff/new') },
    ],
  },
  {
    key: 'infl', label: '인플관리', icon: '👤',
    items: [
      { to: '/staff/infl', label: '인플 보드', match: (p, s) => p.startsWith('/staff/infl') && !s.includes('new=1') },
      { to: '/staff/infl?new=1', label: '＋ 신규인플', match: (p, s) => p.startsWith('/staff/infl') && s.includes('new=1') },
    ],
  },
  {
    key: 'exp', label: '체험단 모집', icon: '🍽️',
    items: [
      { to: '/staff/casting', label: '체험단 선발', match: (p) => p.startsWith('/staff/casting') },
      { to: '/staff/cards', label: '모집카드', match: (p) => p.startsWith('/staff/cards') },
    ],
  },
];

export default function StaffShell({ children }) {
  // body 에 마케팅 헤더용 padding-top:80px 이 전역으로 걸려 있다(index.css).
  // 담당자 화면엔 그 헤더가 없어 흰 띠만 남으므로, 이 셸이 떠 있는 동안만 끈다.
  useEffect(() => {
    document.body.classList.add('staff-fullbleed');
    return () => document.body.classList.remove('staff-fullbleed');
  }, []);

  const loc = useLocation();
  const path = loc.pathname;
  const search = loc.search || '';

  // 지금 어느 분류에 있는가 — 하위 항목 중 하나라도 맞으면 그 분류다.
  const active = SECTIONS.find((s) => s.items.some((it) => it.match(path, search))) || SECTIONS[0];

  return (
    <div className="sshell">
      <div className="sshell-bar">
        <div className="sshell-row sshell-main">
          {/* 좌·우를 같은 폭(flex:1)으로 잡아 대분류가 화면 정중앙에 오게 한다 (Owner 2026-08-24) */}
          <span className="sshell-side sshell-brand">STAFF</span>
          <div className="sshell-secs">
            {SECTIONS.map((s) => (
              <Link
                key={s.key}
                to={s.items[0].to}
                className={`sshell-sec ${s.key === active.key ? 'on' : ''}`}
                aria-current={s.key === active.key ? 'page' : undefined}
              >
                <span className="sshell-ic" aria-hidden="true">{s.icon}</span>{s.label}
              </Link>
            ))}
          </div>
          <span className="sshell-side sshell-side-r">
          <button
            type="button"
            className="sshell-out"
            title="키를 지우고 인증 화면으로 — 다른 키로 다시 입장할 수 있습니다"
            onClick={() => { clearStaffKey(); window.location.reload(); }}
          >로그아웃</button>
          </span>
        </div>
        <div className="sshell-row sshell-sub">
          {active.items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              className={`sshell-item ${it.match(path, search) ? 'on' : ''}`}
              aria-current={it.match(path, search) ? 'page' : undefined}
            >{it.label}</Link>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
