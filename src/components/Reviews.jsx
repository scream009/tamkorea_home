import React from 'react';
import { Star, Quote, ArrowRight } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './Reviews.css';

const Reviews = () => {
    const { t } = useLanguage();
    const reviews = [
        {
            id: 1,
            brand: "오설록",
            category: "카페/디저트",
            title: "프리미엄 티 세트 런칭 캠페인",
            metric: "ROAS 450%",
            comment: "처음 진행해보는 인플루언서 마케팅이었는데, 탐코리아의 정교한 타겟팅 덕분에 2030 여성 고객층 유입이 폭발적으로 늘었습니다.",
            image: "https://images.unsplash.com/photo-1563911892437-1feda9d5e54a?auto=format&fit=crop&q=80&w=800"
        },
        {
            id: 2,
            brand: "그랜드 하얏트 제주",
            category: "호텔/숙박",
            title: "호캉스 패키지 홍보",
            metric: "예약률 +30%",
            comment: "단순 노출이 아니라 실제 예약으로 이어지는 콘텐츠 퀄리티가 만족스러웠습니다. 중국인 관광객 문의도 2배 이상 증가했습니다.",
            image: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&q=80&w=800"
        },
        {
            id: 3,
            brand: "탬버린즈",
            category: "뷰티",
            title: "신제품 핸드크림 바이럴",
            metric: "도달 120만",
            comment: "감도 높은 인플루언서 섭외가 가장 큰 고민이었는데, 탐코리아가 보유한 DB 덕분에 우리 브랜드 톤앤매너에 딱 맞는 분들과 진행할 수 있었습니다.",
            image: "https://images.unsplash.com/photo-1596462502278-27bfdd403348?auto=format&fit=crop&q=80&w=800"
        }
    ];

    return (
        <section className="reviews section">
            <div className="container">
                <div className="section-header">
                    <h2 className="section-title">{t('reviews.title')}</h2>
                    <p className="section-subtitle">{t('reviews.subtitle')}</p>
                </div>

                <div className="reviews-grid">
                    {reviews.map(review => (
                        <div key={review.id} className="review-card">
                            <div className="review-image-wrapper">
                                <img src={review.image} alt={review.brand} className="review-image" />
                                <div className="review-overlay">
                                    <span className="metric-badge">{review.metric}</span>
                                </div>
                            </div>
                            <div className="review-content">
                                <div className="review-meta">
                                    <span className="review-brand">{review.brand}</span>
                                    <span className="review-category">{review.category}</span>
                                </div>
                                <h3 className="review-title">{review.title}</h3>
                                <div className="review-quote">
                                    <Quote size={20} className="quote-icon" />
                                    <p>{review.comment}</p>
                                </div>
                                <div className="review-footer">
                                    <div className="stars">
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <Star key={i} size={14} fill="#FFD700" stroke="none" />
                                        ))}
                                    </div>
                                    <button className="btn-link">자세히 보기 <ArrowRight size={14} /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Reviews;
