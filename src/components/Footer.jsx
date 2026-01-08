import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Youtube, Facebook, ChevronDown } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './Footer.css';
import Toast from './Toast';
import NaverIcon from '../assets/images/naver_blog_icon.png';
import KakaoIcon from '../assets/images/kakao_icon.png';

const Footer = () => {
    const { t } = useLanguage();
    const [showToast, setShowToast] = useState(false);

    const handleComingSoon = (e) => {
        e.preventDefault();
        setShowToast(true);
    };
    return (
        <footer className="footer">
            <div className="container">
                <div className="footer-main">
                    <div className="footer-info">
                        <div className="logo-area">
                            <span className="footer-logo">{t('footer.companyName')}</span>
                        </div>
                        <address className="company-info">
                            <div className="info-group">
                                <span className="info-item">{t('footer.companyNameLocal')}</span>
                                <span className="info-item">{t('footer.ceo')}</span>
                                <span className="info-item">{t('footer.bizNum')}</span>
                            </div>
                            <div className="info-group">
                                <span className="info-item">{t('footer.address')}</span>
                            </div>
                            <div className="info-group">
                                <span className="info-item">{t('footer.cs')}</span>
                                <span className="info-item">{t('footer.email')}</span>
                            </div>
                            <p className="copyright">
                                {t('footer.copyright')}
                            </p>
                        </address>
                    </div>

                    <div className="footer-right">
                        <div className="footer-family-site">
                            <button className="family-site-btn" onClick={handleComingSoon}>
                                {t('footer.familySite')} <ChevronDown size={14} />
                            </button>
                        </div>
                        <div className="footer-sns">
                            <a href="https://www.instagram.com/tamkorea8888?igsh=MzJmOXBrcW8wZDdq&utm_source=qr" target="_blank" rel="noopener noreferrer" className="sns-icon" aria-label="Instagram"><Instagram size={20} /></a>
                            <a href="https://www.youtube.com/channel/UCT0SNdQIY2Oso2X5WOWfdwA" target="_blank" rel="noopener noreferrer" className="sns-icon" aria-label="Youtube"><Youtube size={20} /></a>
                            <a href="https://blog.naver.com/tamkorea888" target="_blank" rel="noopener noreferrer" className="sns-icon naver-icon-btn" aria-label="Naver Blog"><img src={NaverIcon} alt="Naver Blog" /></a>
                            <a href="https://www.kakaocorp.com/page/service/service/KakaoTalkChannel" target="_blank" rel="noopener noreferrer" className="sns-icon kakao-icon-btn" aria-label="Kakao Channel"><img src={KakaoIcon} alt="Kakao Channel" /></a>
                        </div>
                    </div>
                </div>
            </div>
            <Toast
                message={t('footer.comingSoon')}
                isVisible={showToast}
                onClose={() => setShowToast(false)}
            />
        </footer>
    );
};

export default Footer;
