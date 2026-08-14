import React from 'react';
import Hero from '../components/Hero';
import AboutSection from '../components/AboutSection';

const AboutPage = () => {

    return (
        <div className="page-container">
            {/* The previous Home Page "Hero" is now here as the Service Marketing Intro */}
            <Hero />

            {/* "Why Choose Us" section */}
            <AboutSection />
        </div>
    );
};

export default AboutPage;
