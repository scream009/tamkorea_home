import React from 'react';
import CorporateHero from '../components/CorporateHero';
import KeyMetrics from '../components/KeyMetrics';
import AboutContent from '../components/AboutContent';
import GlobalMap from '../components/GlobalMap';
import Services from '../components/Services';
import ContactSection from '../components/ContactSection';

const Home = () => {
    return (
        <div className="home-page">
            <CorporateHero />
            <KeyMetrics />
            <GlobalMap />
            <AboutContent />
            <Services />
            <ContactSection />
        </div>
    );
};

export default Home;
