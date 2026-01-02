import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import './AboutSection.css';

const AboutSection = () => {
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
                        <span className="text">Years of<br />Experience</span>
                    </div>
                </div>

                <div className="about-content">
                    <span className="section-subtitle">Why Choose Us</span>
                    <h2 className="section-title">중화권 광고는 <br />탐코리아가 제일 잘합니다!</h2>
                    <p className="about-desc">
                        탐코리아는 단순한 마케팅 대행사가 아닙니다. 우리는 한국과 중국의 복잡한 디지털 환경을 항해하는 여러분의 전략적 파트너입니다.
                    </p>

                    <br />
                    <ul className="about-features" style={{ marginTop: '20px' }}>
                        <li className="feature-item">
                            <CheckCircle className="feature-icon" size={20} />
                            <div>
                                <h4 className="feature-title">현지 전문가</h4>
                                <p className="feature-text">한국과 중국 문화를 깊이 이해하는 한중언어에 능통한 전문가 팀이 함께합니다.</p>
                            </div>
                        </li>
                        <li className="feature-item">
                            <CheckCircle className="feature-icon" size={20} />
                            <div>
                                <h4 className="feature-title">데이터 기반 전략</h4>
                                <p className="feature-text">단순한 추측이 아닌, 실제 데이터와 시장 트렌드 분석에 기반한 캠페인을 진행합니다.</p>
                            </div>
                        </li>
                        <li className="feature-item">
                            <CheckCircle className="feature-icon" size={20} />
                            <div>
                                <h4 className="feature-title">검증된 성과</h4>
                                <p className="feature-text">다양한 산업 분야에서 300개 이상의 성공적인 캠페인을 수행했습니다.</p>
                            </div>
                        </li>
                    </ul>

                    {/* Partners Placeholder */}
                    {/* Partners Carousel */}
                </div>
            </div>

            {/* Partners Carousel (Full Width) */}
            {/* Partners Carousel (Aligned) */}
            <div className="partners-carousel-section">
                <div className="container">
                    <h3 className="section-subtitle" style={{ marginBottom: '40px', display: 'block', textAlign: 'center' }}>함께한 파트너</h3>
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
