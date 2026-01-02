import React from 'react';
import './CorporateHero.css';

const CorporateHero = () => {
    return (
        <section className="corporate-hero">
            <div className="container">
                <div className="hero-content">
                    <h1 className="corporate-title">
                        <div className="title-line">Global Marketing Partner</div>
                        <div className="title-highlight-wrapper">
                            <span className="highlight">Tam Korea</span>
                        </div>
                    </h1>
                    <p className="corporate-subtitle">
                        모든 비즈니스를 중화권과 연결합니다
                    </p>
                </div>
            </div>
        </section>
    );
};

export default CorporateHero;
