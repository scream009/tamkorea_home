import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Globe, Users, Building2, MapPin, BarChart3, CheckCircle, ArrowRight } from 'lucide-react';
import PremiumPartners from '../components/PremiumPartners';
import './BizPage.css';

const BizPage = () => {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="biz-page">
            {/* Hero Section */}
            <section className="biz-hero">
                <div className="container">
                    <div className="biz-hero-content">
                        <span className="biz-label">중화권 유치로 로컬 매장 활성화에서부터, 글로벌 진출까지</span>
                        <h1>성공한 지역 랜드마크 매장,<br />탐코리아와 함께 완성되었습니다.</h1>
                        <p>단순한 노출이 아닌, 실제 매출로 이어지는 마케팅 솔루션.<br />탐코리아가 귀사의 든든한 성장 파트너가 되어드리겠습니다.</p>
                        <div className="biz-hero-actions">
                            <Link to="/contact" className="btn btn-primary btn-lg">무료 맞춤 컨설팅 신청</Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="biz-stats">
                <div className="container">
                    <div className="stats-grid">
                        <div className="stat-item">
                            <h3>95%</h3>
                            <p>캠페인 연장률</p>
                        </div>
                        <div className="stat-item">
                            <h3>1,200+</h3>
                            <p>누적 마케팅 진행</p>
                        </div>
                        <div className="stat-item">
                            <h3>10,000+</h3>
                            <p>검증된 인플루언서</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Service Categories */}
            <section className="biz-services">
                <div className="container">
                    <div className="section-header text-center">
                        <h2>탐코리아의 세분화된 마케팅 서비스</h2>
                        <p>비즈니스 상황에 딱 맞는 최적의 솔루션을 선택하세요.</p>
                    </div>

                    <div className="service-cards-grid">
                        <div className="service-card">
                            <div className="service-icon-wrapper global">
                                <Globe size={32} />
                            </div>
                            <h3>글로벌 마케팅</h3>
                            <p>해외 관광객 유치나<br />현지 진출이 필요할 때?</p>
                            <Link to="/contact" className="service-link">문의하기 <ArrowRight size={14} /></Link>
                        </div>
                        <div className="service-card">
                            <div className="service-icon-wrapper casting">
                                <Users size={32} />
                            </div>
                            <h3>샤오홍슈 체험단</h3>
                            <p>구매력 높은 중국 트렌드 리더에게<br />우리 브랜드를 알리고 싶다면?</p>
                            <Link to="/contact" className="service-link">문의하기 <ArrowRight size={14} /></Link>
                        </div>
                        <div className="service-card">
                            <div className="service-icon-wrapper local">
                                <MapPin size={32} />
                            </div>
                            <h3>따종디엔핑 입점/관리</h3>
                            <p>중국판 네이버 지도<br />매장 등록이 필요할 때?</p>
                            <Link to="/contact" className="service-link">문의하기 <ArrowRight size={14} /></Link>
                        </div>
                        <div className="service-card">
                            <div className="service-icon-wrapper agency">
                                <Building2 size={32} />
                            </div>
                            <h3>에이전시 제휴</h3>
                            <p>성과를 높이고 싶은<br />마케팅 대행사라면?</p>
                            <Link to="/contact" className="service-link">제휴 문의 <ArrowRight size={14} /></Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* 1. Global Marketing Deep Dive */}
            <section id="global-section" className="biz-section global-bg">
                <div className="container">
                    <div className="biz-content-row">
                        <div className="biz-text">
                            <span className="section-tag text-purple">GLOBAL MARKETING</span>
                            <h2>국경 없는 비즈니스,<br />탐코리아 글로벌 마케팅</h2>
                            <p className="main-desc">
                                <strong>인바운드(방한 관광객)</strong>부터 <strong>아웃바운드(해외 수출)</strong>까지.<br />
                                중국 및 아시아 중화권 메가 인플루언서와 직접 연결합니다.
                            </p>

                            <ul className="biz-features-list">
                                <li>
                                    <CheckCircle size={20} className="check-icon text-purple" />
                                    <span><strong>샤오홍슈 / 도우인(중국 틱톡) / 인스타그램(글로벌)</strong> 체험단 운영</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-purple" />
                                    <span><strong>현지 트렌드</strong>를 반영한 네이티브 콘텐츠 기획</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-purple" />
                                    <span>현지 언어 번역 및 글로벌 결제 시스템 완비</span>
                                </li>
                            </ul>
                        </div>
                        <div className="biz-image-placeholder global-img">
                            <div className="globe-graphic">
                                {/* Base map background (CSS stylized) */}
                                <div className="world-map-bg"></div>
                                
                                {/* Floating Data Nodes */}
                                <div className="data-node us"><div className="pulse"></div></div>
                                <div className="data-node jp"><div className="pulse"></div></div>
                                <div className="data-node cn"><div className="pulse"></div></div>
                                <div className="data-node vn"><div className="pulse"></div></div>
                                <div className="data-node kr"><div className="pulse"></div></div>
                                
                                {/* Glassmorphic Overlay Card */}
                                <div className="glass-stats-card">
                                    <div className="glass-header">
                                        <div className="dot red"></div>
                                        <div className="dot yellow"></div>
                                        <div className="dot green"></div>
                                        <span className="glass-title">LIVE TRAFFIC</span>
                                    </div>
                                    <div className="glass-body">
                                        <div className="stat-row">
                                            <span className="stat-label">Global Reach</span>
                                            <span className="stat-value">45M+</span>
                                        </div>
                                        <div className="stat-row">
                                            <span className="stat-label">Active Campaigns</span>
                                            <span className="stat-value text-purple">1,240</span>
                                        </div>
                                        <div className="trend-bar">
                                            <div className="trend-fill"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2. Xiaohongshu Influencer Section */}
            <section id="casting-section" className="biz-section xiaohongshu-bg">
                <div className="container">
                    <div className="biz-content-row reverse">
                        <div className="biz-text">
                            <span className="section-tag text-red">XIAOHONGSHU INFLUENCER</span>
                            <h2 style={{ wordBreak: 'keep-all' }}>소셜과 커머스가 결합된 중국 No.1<br />플랫폼, 샤오홍슈 인플루언서 마케팅</h2>
                            <p className="main-desc">
                                단순 노출이 아닌, <strong>'심고(Seeding) 퍼트리는'</strong> 바이럴 마케팅.<br />
                                구매 결정에 강력한 영향을 미치는 <strong>리얼 후기 콘텐츠</strong>를 생산합니다.
                            </p>
                            <ul className="biz-features-list">
                                <li>
                                    <CheckCircle size={20} className="check-icon text-red" />
                                    <span><strong>K-뷰티/미식/여행</strong>에 관심 많은 구매력 높은 유저 타겟</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-red" />
                                    <span>구매 전환율이 높은 <strong>진정성 있는 '내돈내산' 스타일</strong> 리뷰</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-red" />
                                    <span>인기 검색어/해시태그 상위 노출을 통한 <strong>자연스러운 유입</strong></span>
                                </li>
                            </ul>
                        </div>
                        <div className="biz-image-placeholder xiaohongshu-img">
                            <div className="xhs-gallery">
                                <div className="xhs-frame xhs-pos-1">
                                    <img src="/images/xhs-new-1.png" alt="XHS 1" />
                                </div>
                                <div className="xhs-frame xhs-pos-2">
                                    <img src="/images/xhs-new-2.png" alt="XHS 2" />
                                </div>
                                <div className="xhs-frame xhs-pos-3">
                                    <img src="/images/xhs-new-3.png" alt="XHS 3" />
                                </div>
                                <div className="xhs-premium-badge">
                                    <span className="emoji">🔥</span>
                                    <div>
                                        <strong>리얼 찐후기 확산</strong>
                                        <p>시각적 썸네일과 폭발적 반응</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 3. Dazhong Dianping Section */}
            <section id="dianping-section" className="biz-section brand-bg">
                <div className="container">
                    <div className="biz-content-row">
                        <div className="biz-text">
                            <span className="section-tag text-blue">DAZHONG DIANPING</span>
                            <h2>중국인 관광객이 검색할 때,<br />따종디엔핑 상단에 노출됩니다.</h2>
                            <p className="main-desc">
                                중국판 네이버 스마트플레이스, 선택이 아닌 필수입니다.<br />
                                <strong>매장 등록</strong>부터 <strong>리뷰 관리</strong>까지 한 번에 해결해 드립니다.
                            </p>
                            <ul className="biz-features-list">
                                <li>
                                    <CheckCircle size={20} className="check-icon text-blue" />
                                    <span><strong>무료 매장 등록</strong> 및 공식 계정(V마크) 인증 지원</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-blue" />
                                    <span><strong>고퀄리티 리뷰어(왕홍)</strong> 체험단 파견 및 콘텐츠 배포</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-blue" />
                                    <span>단기간 내 <strong>리뷰 수 증가</strong> 및 실질적 방문 유도</span>
                                </li>
                            </ul>
                        </div>
                        <div className="biz-image-placeholder dianping-img">
                            <div className="dp-gallery">
                                <div className="phone-mockup dp-phone pos-left">
                                    <div className="notch"></div>
                                    <div className="screen-content">
                                        <img src="/images/dp-full-1.png" alt="Dianping 1" />
                                    </div>
                                </div>
                                <div className="phone-mockup dp-phone pos-center">
                                    <div className="notch"></div>
                                    <div className="screen-content">
                                        <img src="/images/dp-full-2.png" alt="Dianping 2" />
                                    </div>
                                </div>
                                <div className="phone-mockup dp-phone pos-right">
                                    <div className="notch"></div>
                                    <div className="screen-content">
                                        <img src="/images/dp-full-3.png" alt="Dianping 3" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 4. Agency Section */}
            <section id="agency-section" className="biz-section agency-bg">
                <div className="container">
                    <div className="biz-content-row reverse">
                        <div className="biz-text">
                            <span className="section-tag text-orange">FOR AGENCY</span>
                            <h2>대행사를 위한 대행사,<br />최고의 B2B 파트너</h2>
                            <p className="main-desc">
                                마케팅 대행사님, 실행은 탐코리아에 맡기세요.<br />
                                <strong>안정적인 인플루언서 풀</strong>과 <strong>화이트라벨 리포트</strong>를 제공합니다.
                            </p>
                            <ul className="biz-features-list">
                                <li>
                                    <CheckCircle size={20} className="check-icon text-orange" />
                                    <span><strong>대행사 전용 단가(B2B)</strong> 적용 및 세금계산서 발행</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-orange" />
                                    <span>탐코리아 로고 없는 <strong>화이트라벨 결과보고서</strong> 제공</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-orange" />
                                    <span>대량 캠페인 운영을 위한 <strong>전담매니저 배정</strong></span>
                                </li>
                            </ul>
                        </div>
                        <div className="biz-image-placeholder agency-img">
                            <div className="dashboard-visual">
                                <div className="db-sidebar">
                                    <div className="db-logo"></div>
                                    <div className="db-menu-item active"></div>
                                    <div className="db-menu-item"></div>
                                    <div className="db-menu-item"></div>
                                </div>
                                <div className="db-main">
                                    <div className="db-topbar">
                                        <h4>White-Label Report</h4>
                                        <div className="db-user"></div>
                                    </div>
                                    <div className="db-cards">
                                        <div className="db-card">
                                            <span>Total ROI</span>
                                            <strong>+324%</strong>
                                            <div className="db-chart-mini green"></div>
                                        </div>
                                        <div className="db-card">
                                            <span>Reach</span>
                                            <strong>1.2M</strong>
                                            <div className="db-chart-mini blue"></div>
                                        </div>
                                    </div>
                                    <div className="db-chart-main">
                                        <div className="db-bar b1"></div>
                                        <div className="db-bar b2"></div>
                                        <div className="db-bar b3"></div>
                                        <div className="db-bar b4"></div>
                                        <div className="db-bar b5"></div>
                                        <div className="db-bar b6"></div>
                                    </div>
                                </div>
                                <div className="agency-badge">💼 B2B Partner</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Process Section */}
            <section className="biz-process">
                <div className="container">
                    <div className="section-header text-center">
                        <h2>체계적인 마케팅 진행 절차</h2>
                        <p>상담부터 결과 보고까지 전담 매니저가 꼼꼼하게 케어합니다.</p>
                    </div>
                    <div className="process-steps">
                        <div className="step">
                            <span className="step-num">01</span>
                            <h4>상담 및 분석</h4>
                            <p>브랜드/매장 현황 진단</p>
                        </div>
                        <div className="step">
                            <span className="step-num">02</span>
                            <h4>전략 수립</h4>
                            <p>최적의 채널 & 키워드 선정</p>
                        </div>
                        <div className="step">
                            <span className="step-num">03</span>
                            <h4>인플루언서 매칭</h4>
                            <p>AI 기반 최적의 리뷰어 추천</p>
                        </div>
                        <div className="step">
                            <span className="step-num">04</span>
                            <h4>콘텐츠 확산</h4>
                            <p>가이드 기반 고퀄리티 포스팅</p>
                        </div>
                        <div className="step">
                            <span className="step-num">05</span>
                            <h4>성과 보고</h4>
                            <p>데이터 기반 리포트 제공</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Trusted Partners (Premium Marquee) */}
            <PremiumPartners />

            {/* Bottom CTA */}
            <section className="biz-bottom-cta">
                <div className="container">
                    <div className="cta-box">
                        <h2>믿을 수 있는 중화권 마케팅<br />탐코리아와 함께 지금 바로 시작하세요.</h2>
                        <div className="cta-form-preview">
                            <Link to="/contact" className="btn btn-white btn-xl">무료 상담 신청하기</Link>
                            <p className="cta-sub">상담만 받아도 마케팅 인사이트 리포트를 드립니다.</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default BizPage;
