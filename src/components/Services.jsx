import React from 'react';
import { Target, ShieldCheck, BarChart2 } from 'lucide-react';
import './Services.css';

const Services = () => {
    const services = [
        {
            title: "Relevance Matching",
            subtitle: "정교한 타겟 매칭",
            description: "누적 300여개 가맹점 데이터와 인플루언서의 성향(푸드/뷰티/여행)을 분석하여 구매 전환율이 가장 높은 크리에이터를 매칭합니다.",
            icon: <Target size={40} strokeWidth={1.5} />,
            color: "blue"
        },
        {
            title: "Content Inspection",
            subtitle: "자동화된 검수 시스템",
            description: "샤오홍슈/인스타그램의 게시물 누락 여부, 필수 해시태그 포함 여부를 24시간 모니터링하여 마케팅 누수를 방지합니다.",
            icon: <ShieldCheck size={40} strokeWidth={1.5} />,
            color: "green"
        },
        {
            title: "Cross-Border Reporting",
            subtitle: "글로벌 성과 분석",
            description: "중국 플랫폼(Dianping, XHS)의 성과(조회수, 댓글, 저장)를 한국어 리포트로 변환하여 제공합니다. 복잡한 외국어 데이터도 한눈에 파악하세요.",
            icon: <BarChart2 size={40} strokeWidth={1.5} />,
            color: "purple"
        }
    ];

    return (
        <section className="services section">
            <div className="container">
                <div className="section-header text-center">
                    <h2 className="section-title">Core Technology</h2>
                    <p className="section-subtitle">탐코리아만의 3가지 핵심 엔진</p>
                </div>
                <div className="services-grid">
                    {services.map((service, index) => (
                        <div className="service-card" key={index}>
                            <div className={`service-icon-wrapper ${service.color}`}>
                                {service.icon}
                            </div>
                            <h3 className="service-title">{service.title}</h3>
                            <div className="service-subtitle">{service.subtitle}</div>
                            <p className="service-desc">{service.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Services;
