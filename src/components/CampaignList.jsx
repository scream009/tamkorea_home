import React, { useState } from 'react';
import { Clock, Users, Instagram, MapPin, Youtube } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './CampaignList.css';

const CampaignList = () => {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState('all');

    // Dummy Data simulating Revu's structure
    const campaigns = [
        {
            id: 1,
            title: "숙성도 중문점 - 흑돼지 프리미엄 체험단",
            location: "제주 서귀포",
            type: "visit", // 'visit' or 'shipping'
            platform: "instagram",
            category: "food",
            dDay: 3,
            applied: 342,
            capacity: 10,
            imageUrl: "https://images.unsplash.com/photo-1543353071-87d3642e38e6?auto=format&fit=crop&q=80&w=800",
            isPremium: true
        },
        {
            id: 2,
            title: "[서울] 탬버린즈 플래그십 - 향수 리뷰",
            location: "서울 강남구",
            type: "visit",
            platform: "blog",
            category: "beauty",
            dDay: 5,
            applied: 120,
            capacity: 20,
            imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdd403348?auto=format&fit=crop&q=80&w=800",
            isPremium: false
        },
        {
            id: 3,
            title: "해운대 블루라인파크 스카이캡슐",
            location: "부산 해운대",
            type: "visit",
            platform: "instagram",
            category: "travel",
            dDay: 1,
            applied: 850,
            capacity: 5,
            imageUrl: "https://images.unsplash.com/photo-1635926744884-6351724acdc7?auto=format&fit=crop&q=80&w=800",
            isPremium: true
        },
        {
            id: 4,
            title: "제주 아르떼뮤지엄 미디어아트",
            location: "제주 제주시",
            type: "visit",
            platform: "xhs", // Xiaohongshu
            category: "culture",
            dDay: 0,
            applied: 156,
            capacity: 30,
            imageUrl: "https://images.unsplash.com/photo-1545959553-62580a8df069?auto=format&fit=crop&q=80&w=800",
            isPremium: false
        },
        {
            id: 5,
            title: "오설록 티 뮤지엄 - 프리미엄 티 세트",
            location: "배송형",
            type: "shipping",
            platform: "youtube",
            category: "food",
            dDay: 7,
            applied: 45,
            capacity: 5,
            imageUrl: "https://images.unsplash.com/photo-1563911892437-1feda9d5e54a?auto=format&fit=crop&q=80&w=800",
            isPremium: false
        },
        {
            id: 6,
            title: "그랜드 하얏트 제주 - 킹룸 숙박권",
            location: "제주 제주시",
            type: "visit",
            platform: "instagram",
            category: "travel",
            dDay: 2,
            applied: 2100,
            capacity: 2,
            imageUrl: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&q=80&w=800",
            isPremium: true
        }
    ];

    const getPlatformIcon = (p) => {
        switch (p) {
            case 'instagram': return <Instagram size={14} />;
            case 'youtube': return <Youtube size={14} />;
            case 'blog': return <span className="icon-text">B</span>;
            case 'xhs': return <span className="icon-text">RED</span>;
            default: return null;
        }
    };

    return (
        <section className="campaign-list-section">
            <div className="container">
                <div className="campaign-header">
                    <h2 className="section-title">{t('campaigns.title')}</h2>
                    <div className="campaign-tabs">
                        {['all', 'premium', 'local', 'product', 'reporter'].map(tab => (
                            <button
                                key={tab}
                                className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab)}
                            >
                                {tab === 'all' ? t('campaigns.tabAll') :
                                    tab === 'premium' ? t('campaigns.tabPremium') :
                                        tab === 'local' ? t('campaigns.tabLocal') :
                                            tab === 'product' ? t('campaigns.tabProduct') : t('campaigns.tabReporter')}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="campaign-grid">
                    {campaigns.map(item => (
                        <div key={item.id} className="campaign-card">
                            <div className="card-image-wrapper">
                                <img src={item.imageUrl} alt={item.title} className="card-img" />
                                <div className="card-badges">
                                    {item.isPremium && <span className="badge premium">PREMIER</span>}
                                    <span className={`badge d-day ${item.dDay === 0 ? 'urgent' : ''}`}>
                                        {item.dDay === 0 ? 'Today' : `D-${item.dDay}`}
                                    </span>
                                </div>
                                <div className="card-overlay">
                                    <button className="btn-apply">{t('campaigns.btnApply')}</button>
                                </div>
                            </div>

                            <div className="card-content">
                                <div className="card-meta">
                                    <span className={`platform-icon ${item.platform}`}>
                                        {getPlatformIcon(item.platform)}
                                    </span>
                                    <span className="location-text">
                                        {item.location === '배송형' ? '택배배송' : item.location}
                                    </span>
                                </div>

                                <h3 className="card-title">{item.title}</h3>
                                <p className="card-desc">제공내역: 10만원 상당 식사권 + 원고료 5만원</p>

                                <div className="card-footer">
                                    <div className="apply-status">
                                        <span className="apply-count">
                                            <Users size={12} /> {item.applied}명 지원
                                        </span>
                                        <span className="apply-ratio">
                                            {Math.round(item.applied / item.capacity)}:1
                                        </span>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className="progress-fill"
                                            style={{ width: `${Math.min((item.applied / item.capacity) * 10, 100)}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="campaign-more">
                    <button className="btn-more">캠페인 더보기</button>
                </div>
            </div>
        </section>
    );
};

export default CampaignList;
