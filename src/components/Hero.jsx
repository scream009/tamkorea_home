import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, TrendingUp, Users, BarChart3 } from 'lucide-react';
import './Hero.css';

const Hero = () => {
    return (
        <section className="hero">
            <div className="container hero-container">
                <div className="hero-content">
                    <span className="hero-badge">Global Influencer Marketing</span>
                    <h1 className="hero-title">
                        데이터로 증명하는 <br />
                        <span className="text-gradient">중화권 No.1 마케팅</span>
                    </h1>
                    <p className="hero-desc">
                        탐코리아는 <strong>9천 건 이상의 캠페인 데이터</strong>를 기반으로 <br className="mobile-break" />
                        가장 확실한 마케팅 성과를 약속합니다.
                    </p>

                    <div className="hero-actions">
                        <Link to="/consulting" className="btn btn-hero-primary">
                            무료 상담 신청하기 <ArrowRight size={18} />
                        </Link>
                        <Link to="/services" className="btn btn-hero-secondary">
                            서비스 소개서 다운로드
                        </Link>
                    </div>

                    <div className="hero-trust-badges">
                        <span className="badge-item"><CheckCircle size={14} /> 검증된 인플루언서</span>
                        <span className="badge-item"><CheckCircle size={14} /> 1:1 전담 매니저</span>
                        <span className="badge-item"><CheckCircle size={14} /> 결과 보고서 제공</span>
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
                        <span className="stat-label">등록 인플루언서</span>
                    </div>
                    <div className="stat-divider"></div>
                    <div className="stat-item">
                        <strong className="stat-number">300+</strong>
                        <span className="stat-label">누적 파트너사</span>
                    </div>
                    <div className="stat-divider"></div>
                    <div className="stat-item">
                        <strong className="stat-number">1,200+</strong>
                        <span className="stat-label">진행 캠페인</span>
                    </div>
                    <div className="stat-divider"></div>
                    <div className="stat-item">
                        <strong className="stat-number">9,000+</strong>
                        <span className="stat-label">누적 콘텐츠</span>
                    </div>
                </div>
            </div >

            <div className="hero-bg-shape"></div>
        </section >
    );
};

export default Hero;
