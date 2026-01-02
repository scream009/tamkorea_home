import React from 'react';
import { reviews } from '../data/mockData';
import './ReviewsPage.css';

const ReviewsPage = () => {
    return (
        <div className="reviews-page">
            <div className="container">
                <div className="page-header">
                    <h2>리뷰 & 사례</h2>
                    <p>탐코리아와 함께한 인플루언서들의 생생한 후기를 확인하세요.</p>
                </div>

                <div className="reviews-grid">
                    {reviews.map(review => (
                        <div key={review.id} className="review-card">
                            <div className="review-image-wrapper">
                                <img src={review.imageUrl} alt={review.campaignTitle} className="review-image" />
                                <span className={`platform-badge ${review.platform}`}>
                                    {review.platform === 'xhs' ? 'Xiaohongshu' : 'Instagram'}
                                </span>
                            </div>
                            <div className="review-content">
                                <h3 className="review-campaign">{review.campaignTitle}</h3>
                                <div className="review-meta">
                                    <span className="influencer-name">@{review.influencer}</span>
                                    <span className="likes">♥ {review.likes.toLocaleString()}</span>
                                </div>
                                <p className="review-text">{review.content}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ReviewsPage;
