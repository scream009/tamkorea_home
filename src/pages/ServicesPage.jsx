import React from 'react';
import Services from '../components/Services';

const ServicesPage = () => {
    return (
        <div className="page-container" style={{ paddingTop: '2rem' }}>
            <div className="container">
                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '1rem', color: 'var(--color-text-main)' }}>
                        서비스 소개
                    </h1>
                    <p style={{ fontSize: '1.25rem', color: 'var(--color-text-muted)' }}>
                        탐코리아가 제공하는 전문적인 마케팅 솔루션을 만나보세요.
                    </p>
                </div>
            </div>
            <Services />
        </div>
    );
};

export default ServicesPage;
