import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import './AboutContent.css';

const AboutContent = () => {
    const { t } = useLanguage();

    return (
        <section className="about-section section">
            <div className="container">
                <div className="about-header">
                    <h2 className="about-title">
                        {t('about.title')}
                    </h2>
                    <p className="about-subtitle">
                        {t('about.subtitle')}
                    </p>
                </div>

                <div className="about-grid">
                    {/* Mission Card */}
                    <div className="about-card bg-mission">
                        <h3 className="card-title">{t('about.missionTitle')}</h3>
                        <p className="card-text">
                            {t('about.missionText')}<br /><br />
                            {t('about.missionSub')}
                        </p>
                    </div>

                    {/* Values Card */}
                    <div className="about-card bg-values">
                        <h3 className="card-title">{t('about.valuesTitle')}</h3>
                        <ul className="values-list">
                            <li className="values-item">
                                <div className="check-icon">✓</div>
                                <div>
                                    <span className="value-title">{t('about.value1Title')}</span>
                                    <span className="card-text">{t('about.value1Text')}</span>
                                </div>
                            </li>
                            <li className="values-item">
                                <div className="check-icon">✓</div>
                                <div>
                                    <span className="value-title">{t('about.value2Title')}</span>
                                    <span className="card-text">{t('about.value2Text')}</span>
                                </div>
                            </li>
                            <li className="values-item">
                                <div className="check-icon">✓</div>
                                <div>
                                    <span className="value-title">{t('about.value3Title')}</span>
                                    <span className="card-text">{t('about.value3Text')}</span>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default AboutContent;
