import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, TrendingUp, Users, BarChart3 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './Hero.css';

const Hero = () => {
    const { t } = useLanguage();
    const [titleLine1, titleLine2] = t('hero.title').split('\n');
    const [subLine1, subLine2] = t('hero.subtitle').split('\n');

    return (
        <section className="hero">
            <div className="container hero-container">
                <div className="hero-content">
                    <span className="hero-badge">{t('hero.badge')}</span>
                    <h1 className="hero-title">
                        {titleLine1} <br />
                        <span className="text-gradient">{titleLine2}</span>
                    </h1>
                    <p className="hero-desc">
                        {subLine1} <br className="mobile-break" />
                        {subLine2}
                    </p>

                    <div className="hero-actions">
                        <Link to="/consulting" className="btn btn-hero-primary">
                            {t('hero.btnPrimary')} <ArrowRight size={18} />
                        </Link>
                        <Link to="/services" className="btn btn-hero-secondary">
                            {t('hero.btnSecondary')}
                        </Link>
                    </div>

                    <div className="hero-trust-badges">
                        <span className="badge-item"><CheckCircle size={14} /> {t('hero.badge1')}</span>
                        <span className="badge-item"><CheckCircle size={14} /> {t('hero.badge2')}</span>
                        <span className="badge-item"><CheckCircle size={14} /> {t('hero.badge3')}</span>
                    </div>
                </div>

                <div className="hero-visual">
                    {/* Dashboard Abstract Representation */}
                    <div className="dashboard-card card-main">
                        <div className="card-header">
                            <div className="dot red"></div>
                            <div className="dot yellow"></div>
                            <div className="dot green"></div>
                        </div>
                        <div className="card-body">
                            <div className="chart-area">
                                <TrendingUp size={40} className="chart-icon-floating" />
                                <div className="graph-bars">
                                    <div className="bar bar-1"></div>
                                    <div className="bar bar-2"></div>
                                    <div className="bar bar-3"></div>
                                    <div className="bar bar-4"></div>
                                    <div className="bar bar-5"></div>
                                    <div className="bar bar-6"></div>
                                    <div className="bar bar-7"></div>
                                </div>
                            </div>
                            <div className="stats-row">
                                <div className="mini-stat">
                                    <span className="label">Total Reach</span>
                                    <span className="value">9,000+</span>
                                </div>
                                <div className="mini-stat">
                                    <span className="label">Engagement</span>
                                    <span className="value">4.8%</span>
                                </div>
                            </div>
                        </div>

                        {/* Floating Elements */}
                        <div className="floating-card float-1">
                            <Users size={20} className="float-icon" />
                            <div className="float-text">
                                <span className="float-label">Active Creators</span>
                                <span className="float-value">10,000+</span>
                            </div>
                        </div>

                        <div className="floating-card float-2">
                            <BarChart3 size={20} className="float-icon" />
                            <div className="float-text">
                                <span className="float-label">Campaign ROI</span>
                                <span className="float-value">+350%</span>
                            </div>
                        </div>
                    </div >
                </div>
            </div>

            {/* Stats Bar */}
            < div className="stats-bar" >
                <div className="container stats-container">
                    <div className="stat-item">
                        <strong className="stat-number">10,000+</strong>
                        <span className="stat-label">{t('stats.influencers')}</span>
                    </div>
                    <div className="stat-divider"></div>
                    <div className="stat-item">
                        <strong className="stat-number">300+</strong>
                        <span className="stat-label">{t('stats.partners')}</span>
                    </div>
                    <div className="stat-divider"></div>
                    <div className="stat-item">
                        <strong className="stat-number">1,200+</strong>
                        <span className="stat-label">{t('stats.campaigns')}</span>
                    </div>
                    <div className="stat-divider"></div>
                    <div className="stat-item">
                        <strong className="stat-number">9,000+</strong>
                        <span className="stat-label">{t('stats.contents')}</span>
                    </div>
                </div>
            </div >

            <div className="hero-bg-shape"></div>
        </section >
    );
};

export default Hero;
