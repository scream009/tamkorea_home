import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Mail } from 'lucide-react';
import './CampaignsPlaceholder.css'; // We'll create a simple CSS for this

const CampaignsPlaceholder = () => {
    const { t } = useLanguage();

    return (
        <div className="campaigns-placeholder-container">
            <div className="placeholder-content">
                <div className="icon-wrapper">
                    <Mail size={48} className="placeholder-icon" />
                </div>
                <h1>{t('campaigns.title')}</h1>
                <p className="subtitle">{t('campaigns.subtitle')}</p>
                <div className="description-box">
                    <p>{t('campaigns.desc1')}</p>
                    <p>{t('campaigns.desc2')}</p>
                </div>
                <button className="contact-btn">
                    {t('campaigns.contactBtn')}
                </button>
            </div>
        </div>
    );
};

export default CampaignsPlaceholder;
