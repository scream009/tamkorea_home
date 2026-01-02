import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { campaigns } from '../data/mockData';
import './CampaignDetailPage.css';

const CampaignDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const campaign = campaigns.find(c => c.id === parseInt(id));

    if (!campaign) {
        return (
            <div className="container" style={{ padding: '100px 0', textAlign: 'center' }}>
                <h2>캠페인을 찾을 수 없습니다.</h2>
                <Link to="/campaigns" className="btn btn-outline">목록으로 돌아가기</Link>
            </div>
        );
    }

    return (
        <div className="campaign-detail-page">
            <div className="container">
                {/* Navigation Breadcrumb */}
                <div className="breadcrumb">
                    <Link to="/campaigns">캠페인 목록</Link> &gt; <span>{campaign.category}</span>
                </div>

                <div className="detail-header">
                    <div className="detail-image-wrapper">
                        <img src={campaign.imageUrl} alt={campaign.title} className="detail-image" />
                        <span className={`platform-badge ${campaign.platform}`}>
                            {campaign.platform === 'xhs' ? 'Xiaohongshu' : 'Instagram'}
                        </span>
                    </div>

                    <div className="detail-info">
                        <h1 className="detail-title">{campaign.title}</h1>
                        <div className="detail-meta-grid">
                            <div className="meta-item">
                                <span className="label">위치</span>
                                <span className="value">{campaign.location}</span>
                            </div>
                            <div className="meta-item">
                                <span className="label">모집 인원</span>
                                <span className="value">{campaign.maxApplicants}명</span>
                            </div>
                            <div className="meta-item">
                                <span className="label">남은 기간</span>
                                <span className="value d-day">D-{campaign.dDay}</span>
                            </div>
                            {campaign.offer && (
                                <div className="meta-item full-width">
                                    <span className="label">제공 내역</span>
                                    <span className="value highlight">{campaign.offer}</span>
                                </div>
                            )}
                        </div>

                        <div className="detail-description">
                            <h3>캠페인 소개</h3>
                            <p>{campaign.description}</p>
                            <p style={{ marginTop: '10px', color: '#666', fontSize: '14px' }}>
                                * 본 캠페인은 인플루언서의 창의적인 콘텐츠 제작을 지원합니다.<br />
                                * 선발되신 분들께는 개별적으로 가이드라인이 전달됩니다.
                            </p>
                        </div>

                        <div className="detail-actions">
                            <a
                                href="https://docs.google.com/forms/d/e/1FAIpQLSdq9w5tHw5qw1ivOnLYBIKyGhgzLgBesXCDToh2vrOxCZTsXg/viewform?usp=header"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-primary btn-pill btn-large"
                            >
                                캠페인 신청하기
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CampaignDetailPage;
