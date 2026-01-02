import React, { useState } from 'react';
import CampaignCard from '../components/CampaignCard';
import { campaigns } from '../data/mockData';
import '../components/CampaignList.css'; // Reusing CampaignList styles for consistency

const CampaignsPage = () => {
    const [activeTab, setActiveTab] = useState('전체');
    const categories = ['전체', '맛집/카페', '뷰티/패션', '숙박/여행'];

    const filteredCampaigns = activeTab === '전체'
        ? campaigns
        : campaigns.filter(c => c.category === activeTab);

    return (
        <div className="campaigns-page" style={{ paddingTop: '40px', paddingBottom: '80px' }}>
            <div className="container">
                <div className="page-header" style={{ marginBottom: '40px', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '32px', marginBottom: '16px', fontWeight: '800' }}>진행 중인 캠페인</h2>
                    <p style={{ color: '#666' }}>탐코리아의 프리미엄 인플루언서 캠페인을 만나보세요.</p>
                </div>

                <div className="section-tabs" style={{ justifyContent: 'center', marginBottom: '40px' }}>
                    {categories.map(category => (
                        <button
                            key={category}
                            className={`tab ${activeTab === category ? 'active' : ''}`}
                            onClick={() => setActiveTab(category)}
                        >
                            {category}
                        </button>
                    ))}
                </div>

                <div className="campaign-grid">
                    {filteredCampaigns.map(campaign => (
                        <CampaignCard key={campaign.id} {...campaign} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default CampaignsPage;
