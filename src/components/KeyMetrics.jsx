import React, { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext'; // If you want to localize labels
import './KeyMetrics.css';

const KeyMetrics = () => {
    // Labels could be pulled from translations if needed
    const metrics = [
        { id: 1, label: '등록 인플루언서', value: '10,000+', subLabel: 'Active Creators' },
        { id: 2, label: '누적 파트너사', value: '300+', subLabel: 'Partner Clients' },
        { id: 3, label: '진행 캠페인', value: '1,200+', subLabel: 'Total Campaigns' },
        { id: 4, label: '누적 콘텐츠', value: '9,000+', subLabel: 'Total Content' }
    ];

    return (
        <section className="key-metrics-section">
            <div className="container">
                <div className="metrics-grid">
                    {metrics.map((metric) => (
                        <div key={metric.id} className="metric-item">
                            <h3 className="metric-value">{metric.value}</h3>
                            <p className="metric-label">{metric.label}</p>
                            <span className="metric-sub">{metric.subLabel}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default KeyMetrics;
