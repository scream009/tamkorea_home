import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import './CorporateHero.css';

const CorporateHero = () => {
    const { t } = useLanguage();

    return (
        <section className="corporate-hero">
            <div className="hero-bg-animate">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>
            <div className="container">
                <div className="hero-content">
                    <h1 className="corporate-title">
                        <div className="title-line">{t('corporateHero.title')}</div>
                        <div className="title-highlight-wrapper">
                            <span className="highlight">Tam Korea</span>
                        </div>
                    </h1>
                    <p className="corporate-subtitle">
                        {t('corporateHero.subtitle')}
                    </p>
                </div>
            </div>
        </section>
    );
};

export default CorporateHero;
