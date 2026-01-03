import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Globe, Users, Building2, MapPin, BarChart3, CheckCircle, ArrowRight } from 'lucide-react';
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
                            <div className="service-icon-wrapper local">
                                <MapPin size={32} />
                            </div>
                            <h3>브랜드(제품) 마케팅</h3>
                            <p>신제품 런칭이나<br />메뉴 홍보가 필요할 때?</p>
                            <a href="#brand-section" className="service-link">바로가기 <ArrowRight size={14} /></a>
                        </div>
                        <div className="service-card">
                            <div className="service-icon-wrapper global">
                                <Globe size={32} />
                            </div>
                            <h3>글로벌 마케팅</h3>
                            <p>해외 관광객 유치나<br />현지 진출이 필요할 때?</p>
                            <a href="#global-section" className="service-link">자세히 보기 <ArrowRight size={14} /></a>
                        </div>
                        <div className="service-card">
                            <div className="service-icon-wrapper casting">
                                <Users size={32} />
                            </div>
                            <h3>맞춤형 섭외 (캐스팅)</h3>
                            <p>특정 타겟/컨셉의<br />인플루언서가 필요할 때?</p>
                            <a href="#casting-section" className="service-link">문의하기 <ArrowRight size={14} /></a>
                        </div>
                        <div className="service-card">
                            <div className="service-icon-wrapper agency">
                                <Building2 size={32} />
                            </div>
                            <h3>에이전시 제휴</h3>
                            <p>성과를 높이고 싶은<br />마케팅 대행사라면?</p>
                            <a href="#agency-section" className="service-link">제휴 문의 <ArrowRight size={14} /></a>
                        </div>
                    </div>
                </div>
            </section>

            {/* 1. Brand Marketing Section */}
            <section id="brand-section" className="biz-section brand-bg">
                <div className="container">
                    <div className="biz-content-row">
                        <div className="biz-text">
                            <span className="section-tag text-blue">BRAND MARKETING</span>
                            <h2>소비자의 지갑을 여는<br />매력적인 브랜드 스토리</h2>
                            <p className="main-desc">
                                단순 배포형 리뷰가 아닙니다. <br />
                                <strong>구매 전환</strong>을 유도하는 기획형 콘텐츠로 브랜드 가치를 높입니다.
                            </p>
                            <ul className="biz-features-list">
                                <li>
                                    <CheckCircle size={20} className="check-icon text-blue" />
                                    <span><strong>네이버 스마트블록 상위노출</strong> 최적화 원고 작성</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-blue" />
                                    <span><strong>숏폼(릴스/틱톡) 챌린지</strong> 기획 및 배포</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-blue" />
                                    <span>제품 촬영 및 상세페이지 기획/제작 지원</span>
                                </li>
                            </ul>
                        </div>
                        <div className="biz-image-placeholder brand-img">
                            <div className="placeholder-text">Brand & Product</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2. Global Marketing Deep Dive */}
            <section id="global-section" className="biz-section global-bg">
                <div className="container">
                    <div className="biz-content-row reverse">
                        <div className="biz-text">
                            <span className="section-tag text-purple">GLOBAL MARKETING</span>
                            <h2>국경 없는 비즈니스,<br />탐코리아 글로벌 마케팅</h2>
                            <p className="main-desc">
                                <strong>인바운드(방한 관광객)</strong>부터 <strong>아웃바운드(해외 수출)</strong>까지.<br />
                                미국, 일본, 중국, 동남아 현지 메가 인플루언서와 직접 연결합니다.
                            </p>

                            <ul className="biz-features-list">
                                <li>
                                    <CheckCircle size={20} className="check-icon text-purple" />
                                    <span><strong>샤오홍슈(중국) / 인스타그램(글로벌)</strong> 체험단 운영</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-purple" />
                                    <span><strong>정부 지원 바우처(수출바우처)</strong> 공식 수행기관</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-purple" />
                                    <span>현지 언어 번역 및 글로벌 결제 시스템 완비</span>
                                </li>
                            </ul>
                        </div>
                        <div className="biz-image-placeholder global-img">
                            <div className="globe-graphic">
                                <div className="map-point us" title="USA"></div>
                                <div className="map-point jp" title="Japan"></div>
                                <div className="map-point cn" title="China"></div>
                                <div className="map-point vn" title="Vietnam"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 3. Casting Section */}
            <section id="casting-section" className="biz-section casting-bg">
                <div className="container">
                    <div className="biz-content-row">
                        <div className="biz-text">
                            <span className="section-tag text-teal">PREMIUM CASTING</span>
                            <h2>원하는 인플루언서를<br />콕 집어 섭외하세요</h2>
                            <p className="main-desc">
                                팔로워 수만 많은 계정은 거릅니다.<br />
                                <strong>진짜 영향력(Engagement)</strong>이 있는 프리미엄 크리에이터를 섭외합니다.
                            </p>
                            <ul className="biz-features-list">
                                <li>
                                    <CheckCircle size={20} className="check-icon text-teal" />
                                    <span><strong>유튜버/방송인/셀럽</strong> 섭외 및 PPL 진행</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-teal" />
                                    <span>뷰티/IT/푸드 등 <strong>전문 카테고리별 탑티어</strong> 매칭</span>
                                </li>
                                <li>
                                    <CheckCircle size={20} className="check-icon text-teal" />
                                    <span>모델 라이선스 및 초상권 계약 대행</span>
                                </li>
                            </ul>
                        </div>
                        <div className="biz-image-placeholder casting-img">
                            <div className="placeholder-text">Premium Creator</div>
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
                                    <span><strong>대항사 전용 단가(B2B)</strong> 적용 및 세금계산서 발행</span>
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
                            <div className="placeholder-text">B2B Partnership</div>
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

            {/* Bottom CTA */}
            <section className="biz-bottom-cta">
                <div className="container">
                    <div className="cta-box">
                        <h2>믿을 수 있는 마케팅<br />탐코리아와 함께 지금 바로 시작하세요.</h2>
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
