import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Youtube, Facebook, ChevronDown } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './Footer.css';
import Toast from './Toast';

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
                            <div className="info-row">{t('footer.companyNameLocal')}</div>
                            <div className="info-row">{t('footer.ceo')}</div>
                            <div className="info-row">{t('footer.bizNum')}</div>
                            <div className="info-row">{t('footer.address')}</div>
                            <div className="info-row">{t('footer.cs')}</div>
                            <div className="info-row">{t('footer.email')}</div>
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
                            <a href="#" className="sns-icon" aria-label="Instagram" onClick={handleComingSoon}><Instagram size={20} /></a>
                            <a href="#" className="sns-icon" aria-label="Youtube" onClick={handleComingSoon}><Youtube size={20} /></a>
                            <a href="#" className="sns-icon" aria-label="Facebook" onClick={handleComingSoon}><Facebook size={20} /></a>
                            <a href="#" className="sns-icon blog" aria-label="Blog" onClick={handleComingSoon}>B</a>
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
