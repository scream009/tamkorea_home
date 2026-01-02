import React, { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext'; // If you want to localize labels
import './KeyMetrics.css';

const KeyMetrics = () => {
    const { t } = useLanguage();

    const metrics = [
        { id: 1, label: t('stats.influencers'), value: '10,000+', subLabel: 'Active Creators' },
        { id: 2, label: t('stats.partners'), value: '300+', subLabel: 'Partner Clients' },
        { id: 3, label: t('stats.campaigns'), value: '1,200+', subLabel: 'Total Campaigns' },
        { id: 4, label: t('stats.contents'), value: '9,000+', subLabel: 'Total Content' }
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
