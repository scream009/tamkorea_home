import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './AboutSection.css';

const AboutSection = () => {
    const { t } = useLanguage();

    return (
        <section className="about-section section-padding">
            <div className="container about-container">
                <div className="about-image-wrapper">
                    <img
                        src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80"
                        alt="Tam Korea Team"
                        className="about-image"
                    />
                    <div className="experience-badge">
                        <span className="years">20+</span>
                        <span className="text">
                            {t('aboutSection.badgeText').split('\n').map((line, i) => (
                                <React.Fragment key={i}>
                                    {line}
                                    {i < t('aboutSection.badgeText').split('\n').length - 1 && <br />}
                                </React.Fragment>
                            ))}
                        </span>
                    </div>
                </div>

                <div className="about-content">
                    <span className="section-subtitle">{t('aboutSection.subtitle')}</span>
                    <h2 className="section-title">
                        {t('aboutSection.title').split('\n').map((line, i) => (
                            <React.Fragment key={i}>
                                {line}
                                {i < t('aboutSection.title').split('\n').length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </h2>
                    <p className="about-desc">
                        {t('aboutSection.desc')}
                    </p>

                    <br />
                    <ul className="about-features" style={{ marginTop: '20px' }}>
                        <li className="feature-item">
                            <CheckCircle className="feature-icon" size={20} />
                            <div>
                                <h4 className="feature-title">{t('aboutSection.feature1Title')}</h4>
                                <p className="feature-text">{t('aboutSection.feature1Text')}</p>
                            </div>
                        </li>
                        <li className="feature-item">
                            <CheckCircle className="feature-icon" size={20} />
                            <div>
                                <h4 className="feature-title">{t('aboutSection.feature2Title')}</h4>
                                <p className="feature-text">{t('aboutSection.feature2Text')}</p>
                            </div>
                        </li>
                        <li className="feature-item">
                            <CheckCircle className="feature-icon" size={20} />
                            <div>
                                <h4 className="feature-title">{t('aboutSection.feature3Title')}</h4>
                                <p className="feature-text">{t('aboutSection.feature3Text')}</p>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            {/* Partners Carousel (Full Width) */}
            {/* Partners Carousel (Aligned) */}
            <div className="partners-carousel-section">
                <div className="container">
                    <h3 className="section-subtitle" style={{ marginBottom: '40px', display: 'block', textAlign: 'center' }}>
                        {t('aboutSection.partnersTitle')}
                    </h3>
                    <div className="carousel-container">
                        <div className="carousel-track">
                            {/* 2 Sets of 10 images for infinite scroll */}
                            {[...Array(2)].map((_, setIndex) => (
                                <React.Fragment key={setIndex}>
                                    <div className="partner-logo-item"><img src="/partners/partner_1.png" alt="Partner 1" /></div>
                                    <div className="partner-logo-item"><img src="/partners/partner_2.png" alt="Partner 2" /></div>
                                    <div className="partner-logo-item"><img src="/partners/partner_3.png" alt="Partner 3" /></div>
                                    <div className="partner-logo-item"><img src="/partners/partner_4.png" alt="Partner 4" /></div>
                                    <div className="partner-logo-item"><img src="/partners/partner_5.png" alt="Partner 5" /></div>
                                    <div className="partner-logo-item"><img src="/partners/partner_6.png" alt="Partner 6" /></div>
                                    <div className="partner-logo-item"><img src="/partners/partner_7.png" alt="Partner 7" /></div>
                                    <div className="partner-logo-item"><img src="/partners/partner_8.png" alt="Partner 8" /></div>
                                    <div className="partner-logo-item"><img src="/partners/partner_9.png" alt="Partner 9" /></div>
                                    <div className="partner-logo-item"><img src="/partners/partner_10.jpg" alt="Partner 10" /></div>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default AboutSection;
