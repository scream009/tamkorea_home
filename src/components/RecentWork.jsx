import React, { useEffect, useState } from 'react';
import './RecentWork.css';

/**
 * 「실제 성과」 — 우리가 만든 샤오홍슈 콘텐츠를 고객사에게 **한국어로** 보여준다.
 *
 * 왜 여기(본사 홈)인가: 체험단 모집 사이트는 중국어 KOC 용이라 고객사가 흘러들어와도
 * 홍보 효과가 거의 없다(Owner 2026-08-14). 레뷰·蒲公英·GRIN 전부 모집면과 영업면을
 * 분리해 두는데, 이유는 두 독자의 질문이 다르기 때문이다.
 *   - KOC: "내가 될까? 뭘 받지?"      - 고객사: "얼마나 잘하나? 사례 있나?"
 *
 * 🔴 수치 표현 원칙: **"이게 전부"로 보이면 안 된다.**
 *    데이터가 잡히기 시작한 게 2026-03 이고 서울 물량은 아직 안 들어와 있어서,
 *    DB 집계는 실제 실적의 일부다. 그래서 "일부", "최근 사례" 로만 쓴다.
 */
const RecentWork = () => {
    const [items, setItems] = useState(null);

    useEffect(() => {
        let live = true;
        fetch('/api/showcase')
            .then((r) => (r.ok ? r.json() : { items: [] }))
            .then((d) => { if (live) setItems(d.items || []); })
            .catch(() => { if (live) setItems([]); });
        return () => { live = false; };
    }, []);

    // 로딩 중이거나 받아온 게 없으면 섹션을 통째로 접는다 — 빈 껍데기가 더 나쁘다
    if (!items || items.length === 0) return null;

    const fmt = (n) => {
        if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}만`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
        return String(n || '');
    };

    return (
        <section className="recent-work">
            <div className="container">
                {/* 이 홈의 관례를 따른다: 큰 영문 제목 + 작은 국문 부제
                    ("We Connect World" / "Core Technology" 와 같은 형태) */}
                <div className="rw-head">
                    <h2 className="rw-title">Recent Work</h2>
                    <p className="rw-kr">실제로 발행된 콘텐츠</p>
                    <p className="rw-sub">
                        중국 인플루언서가 직접 촬영·발행한 샤오홍슈 콘텐츠입니다.
                        <br />
                        <strong>누적 발행물 중 최근 일부만</strong> 보여드립니다 — 이미지를 누르면 원본으로 이동합니다.
                    </p>
                </div>

                <div className="rw-grid">
                    {items.map((it) => (
                        <a
                            key={it.url}
                            className="rw-card"
                            href={it.url}
                            target="_blank"
                            rel="noreferrer noopener"
                        >
                            <div className="rw-thumb">
                                <img src={it.cover} alt={it.title || it.store} loading="lazy" />
                                <span className="rw-badge">小红书</span>
                                {it.followers > 0 && (
                                    <span className="rw-fans">팔로워 {fmt(it.followers)}</span>
                                )}
                            </div>
                            <p className="rw-store">{it.store}</p>
                            <p className="rw-author">@{it.author}</p>
                        </a>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default RecentWork;
