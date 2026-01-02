import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import ServicesPage from './pages/ServicesPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import CampaignsPlaceholder from './pages/CampaignsPlaceholder'; // Replaced
import BizPage from './pages/BizPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import LoginPage from './pages/auth/LoginPage';
import SignupSelectionPage from './pages/auth/SignupSelectionPage';
import SignupCreatorPage from './pages/auth/SignupCreatorPage';
import SignupBusinessPage from './pages/auth/SignupBusinessPage';
import './App.css';

function App() {
  return (
    <LanguageProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/campaigns" element={<CampaignsPlaceholder />} /> {/* Changed */}
            <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="/biz" element={<BizPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupSelectionPage />} />
            <Route path="/signup/creator" element={<SignupCreatorPage />} />
            <Route path="/signup/business" element={<SignupBusinessPage />} />
          </Routes>
        </Layout>
      </Router>
    </LanguageProvider>
  );
}

export default App;
