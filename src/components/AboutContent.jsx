import React from 'react';
import './AboutContent.css';

const AboutContent = () => {
    return (
        <section className="about-section section">
            <div className="container">
                <div className="about-header">
                    <h2 className="about-title">
                        We Connect World
                    </h2>
                    <p className="about-subtitle">
                        한국과 세계를 잇는 글로벌 마케팅 파트너, 탐코리아입니다.
                    </p>
                </div>

                <div className="about-grid">
                    {/* Mission Card */}
                    <div className="about-card bg-mission">
                        <h3 className="card-title">우리의 미션</h3>
                        <p className="card-text">
                            탐코리아는 단순한 광고 대행사가 아닙니다. 우리는 브랜드의 가치를 발견하고,
                            그것을 가장 효과적인 방법으로 글로벌 타겟에게 전달하는 스토리텔러입니다.<br /><br />
                            변화하는 디지털 환경 속에서 끊임없이 혁신하며 고객의 성공을 이끕니다.
                        </p>
                    </div>

                    {/* Values Card */}
                    <div className="about-card bg-values">
                        <h3 className="card-title">핵심 가치</h3>
                        <ul className="values-list">
                            <li className="values-item">
                                <div className="check-icon">✓</div>
                                <div>
                                    <span className="value-title">전문성 (Expertise):</span>
                                    <span className="card-text">각 분야 최고의 전문가들이 함께합니다.</span>
                                </div>
                            </li>
                            <li className="values-item">
                                <div className="check-icon">✓</div>
                                <div>
                                    <span className="value-title">신뢰 (Trust):</span>
                                    <span className="card-text">투명한 데이터와 성과로 증명합니다.</span>
                                </div>
                            </li>
                            <li className="values-item">
                                <div className="check-icon">✓</div>
                                <div>
                                    <span className="value-title">연결 (Connection):</span>
                                    <span className="card-text">브랜드와 소비자를 진정성 있게 연결합니다.</span>
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
