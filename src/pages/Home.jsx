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
            {/*
              실제 발행 콘텐츠 — 고객사 설득은 중국어 모집사이트가 아니라 여기서 한다.
              위치를 서비스 뒤에서 여기로 올렸다: 문서가 5,300px 인데 서비스 뒤는 69% 지점이라
              대부분 도달하지 못한다(실측). 글로벌맵이 "이런 인플루언서 네트워크가 있다"고
              말한 직후가 실물을 대기 가장 좋은 자리이고, 핵심지표(50,000+ 콘텐츠)와도 가까워진다.
              에이전시 홈의 통례도 hero → 지표 → work → about → services 순이다.
            */}
            <RecentWork />
            <AboutContent />
            <Services />
            <ContactSection />
        </div>
    );
};

export default Home;
