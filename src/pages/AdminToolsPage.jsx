import React from 'react';
import { Link } from 'react-router-dom';
import './AdminToolsPage.css';

/**
 * 도구 허브 — 직원이 쓰는 생성기 모음.
 *
 * 견적·계약 생성기는 여기서 만들지 않는다. 외근 중 폰 홈화면 아이콘으로 쓰는
 * 단일 HTML(`/q/...`)이 이미 돌고 있고, 그쪽 인쇄 레이아웃은 실측으로 맞춰 둔 것이라
 * React 로 옮기면 깨질 위험이 크다. 여기서는 **입구만** 제공한다.
 */

const QUOTE_URL = '/q/34336786d08b937a138e5917.html';

export default function AdminToolsPage() {
  return (
    <div className="atl">
      <div className="atl-grid">

        <Link to="/admin/tools/flyer" className="atl-card">
          <span className="atl-ic">🏮</span>
          <b>리뷰이벤트 전단 생성기</b>
          <p>
            따종디엔핑 리뷰 이벤트 A4 전단. 매장 정보를 치고 사은품 사진과 QR 을 올리면
            바로 인쇄·PDF 로 나온다.
          </p>
          <em>매장별로 바꾸는 것 — 정보 · 사은품 사진 · QR</em>
        </Link>

        <a className="atl-card" href={QUOTE_URL} target="_blank" rel="noreferrer">
          <span className="atl-ic">📄</span>
          <b>견적 · 계약 생성기 <i>↗</i></b>
          <p>
            가견적 → 확정견적 → 계약서 3단계를 PDF 로. 새 탭에서 열린다.
            외근 중에는 이 주소를 폰 홈화면에 아이콘으로 깔아 쓴다.
          </p>
          <em>
            <b>협력직원이 키 없이 쓰도록 일부러 열어 둔 주소다</b> — admin 로그인이 필요 없다.
            링크만 전달하면 된다.
          </em>
          <em className="warn">
            단가·직인이 보인다. 공개 채널·단톡방에는 올리지 않는다.
          </em>
        </a>

      </div>

      <p className="atl-note">
        두 생성기 모두 <b>서버에 아무것도 저장하지 않는다.</b> 입력값은 쓰는 사람의 브라우저에만
        남고, 출력은 브라우저 인쇄로 만든다.
      </p>
    </div>
  );
}
