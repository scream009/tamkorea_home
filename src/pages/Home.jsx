import React from 'react';
import CorporateHero from '../components/CorporateHero';
import KeyMetrics from '../components/KeyMetrics';
import AboutContent from '../components/AboutContent';
import GlobalMap from '../components/GlobalMap';
import Services from '../components/Services';
import RecentWork from '../components/RecentWork';
import ContactSection from '../components/ContactSection';

const Home = () => {
    return (
        <div className="home-page">
            <CorporateHero />
            <KeyMetrics />
            <GlobalMap />
            <AboutContent />
            <Services />
            {/* 실제 발행 콘텐츠 — 고객사 설득은 모집사이트가 아니라 여기서 한다 */}
            <RecentWork />
            <ContactSection />
        </div>
    );
};

export default Home;
