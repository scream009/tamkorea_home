import React, { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import './CampaignsPlaceholder.css';

/**
 * /campaigns — 캠페인(체험단 모집)은 별도 사이트로 옮겨졌다.
 *
 * 헤더 메뉴는 이미 campaign.tamkorea.com 을 직접 가리키지만, 예전에 공유된
 * /campaigns 링크·북마크가 남아 있어 이 경로를 죽이지 않고 **리다이렉트**로 둔다.
 *
 * 이전 구현은 "준비 중" 안내였는데, 참조하던 번역키(subtitle·desc1·desc2·contactBtn)가
 * 사전에 없어 화면에 `campaigns.subtitle` 이 그대로 노출되고 있었다 (2026-08-13 실측).
 */

const CAMPAIGN_URL = 'https://campaign.tamkorea.com';

const CampaignsPlaceholder = () => {
    useEffect(() => {
        // 즉시 이동하면 뒤로가기가 무한루프처럼 느껴진다 — 잠깐 안내를 보여준 뒤 옮긴다
        const timer = setTimeout(() => {
            window.location.replace(CAMPAIGN_URL);
        }, 1200);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="campaigns-placeholder-container">
            <div className="placeholder-content">
                <div className="icon-wrapper">
                    <ExternalLink size={48} className="placeholder-icon" />
                </div>
                <h1>체험단 모집</h1>
                <p className="subtitle">캠페인 사이트로 이동합니다…</p>
                <div className="description-box">
                    <p>진행 중인 체험단 모집은 별도 사이트에서 운영합니다.</p>
                    <p>자동으로 이동하지 않으면 아래 버튼을 눌러주세요.</p>
                </div>
                <a
                    className="contact-btn"
                    href={CAMPAIGN_URL}
                    rel="noopener noreferrer"
                >
                    캠페인 사이트로 이동
                </a>
            </div>
        </div>
    );
};

export default CampaignsPlaceholder;
