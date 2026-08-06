import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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
import InfluencerSubmitPage from './pages/InfluencerSubmitPage';
import CheckinPage from './pages/CheckinPage';
import ClientListPage from './pages/ClientListPage';
import AdminClientLinkPage from './pages/AdminClientLinkPage';
import ClientReportPage from './pages/ClientReportPage';
import ClientSchedulePage from './pages/ClientSchedulePage';
import DpReportPage from './pages/DpReportPage';
import ClientPartnerPage from './pages/ClientPartnerPage';
import RecruiterSchedulePage from './pages/RecruiterSchedulePage';
import SignupCreatorPage from './pages/auth/SignupCreatorPage';
import SignupBusinessPage from './pages/auth/SignupBusinessPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminTargetsPage from './pages/AdminTargetsPage';
import AdminBoardPage from './pages/AdminBoardPage';
import AdminGate from './components/AdminGate';
import AdminShell from './components/AdminShell';
import StaffGate from './components/StaffGate';
import StaffBoardPage from './pages/StaffBoardPage';
import StaffResvPage from './pages/StaffResvPage';
import StaffQueuePage from './pages/StaffQueuePage';
import StaffInflPage from './pages/StaffInflPage';
import AdminDianpingPage from './pages/AdminDianpingPage';
import AdminStoresPage from './pages/AdminStoresPage';
import './components/AdminShell.css';
import './App.css';

function App() {
  return (
    <LanguageProvider>
      <Router>
        <Routes>
          {/* 독립 페이지: 헤더/푸터 없음 */}
          <Route path="/submit" element={<InfluencerSubmitPage />} />
          <Route path="/checkin" element={<CheckinPage />} />
          <Route path="/clients" element={<ClientListPage />} />
          <Route path="/admin/clients-link" element={<AdminClientLinkPage />} />
          <Route path="/report" element={<ClientReportPage />} />
          <Route path="/schedule" element={<ClientSchedulePage />} />
          <Route path="/dp-report" element={<DpReportPage />} />
          <Route path="/manager" element={<RecruiterSchedulePage />} />
          <Route path="/partner" element={<ClientPartnerPage />} />
          <Route path="/staff" element={<StaffGate><StaffBoardPage /></StaffGate>} />
          <Route path="/staff/new" element={<StaffGate><StaffResvPage /></StaffGate>} />
          <Route path="/staff/queue" element={<StaffGate><StaffQueuePage /></StaffGate>} />
          <Route path="/staff/infl" element={<StaffGate><StaffInflPage /></StaffGate>} />
          {/* 정산·계약 데이터 화면은 게이트 뒤에 둔다. 서버(_admin-auth.js)가 실제로 막고,
              이 래퍼는 키 입력 UI 를 준다. /admin/clients-link 는 자체 키 폼이 이미 있다. */}
          {/* 관리자 화면은 AdminShell(왼쪽 메뉴) 안에 둔다 — 화면이 늘어도 네비는 한 곳에서만 정의된다 */}
          {/* /admin 은 대표·관리자가 먼저 보는 화면이다 — 목표·실적이 첫 화면이 된다.
              담당자별 실적(구 대시보드)은 /admin/dashboard 로 내렸다. */}
          <Route path="/admin" element={<AdminGate><AdminShell><AdminTargetsPage /></AdminShell></AdminGate>} />
          <Route path="/admin/stores" element={<AdminGate><AdminShell><AdminStoresPage /></AdminShell></AdminGate>} />
          <Route path="/admin/dashboard" element={<AdminGate><AdminShell><AdminDashboardPage /></AdminShell></AdminGate>} />
          <Route path="/admin/dianping" element={<AdminGate><AdminShell><AdminDianpingPage /></AdminShell></AdminGate>} />
          <Route path="/admin/board" element={<AdminGate><AdminShell><AdminBoardPage /></AdminShell></AdminGate>} />

          {/* 일반 페이지: Layout (헤더/푸터) 포함 */}
          <Route path="/*" element={
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
          } />
        </Routes>
      </Router>
    </LanguageProvider>
  );
}

export default App;
