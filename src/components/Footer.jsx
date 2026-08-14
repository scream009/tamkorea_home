import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, ChevronDown } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './Footer.css';
import NaverIcon from '../assets/images/naver_blog_icon.png';
import KakaoIcon from '../assets/images/kakao_icon.png';
import InstagramIcon from '../assets/images/instagram_icon.png';
import YoutubeIcon from '../assets/images/youtube_icon.png';

const Footer = () => {
    const { t } = useLanguage();
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
                            {/* Family Site — 지금 자매 사이트는 캠페인 하나뿐이라 드롭다운 없이 바로 연결 */}
                            <a className="family-site-btn" href="https://campaign.tamkorea.com"
                               target="_blank" rel="noopener noreferrer">
                                体验团 캠페인 <ChevronDown size={14} />
                            </a>
                        </div>
                        <div className="footer-sns">
                            <a href="https://www.instagram.com/tamkorea8888?igsh=MzJmOXBrcW8wZDdq&utm_source=qr" target="_blank" rel="noopener noreferrer" className="sns-icon insta-icon-btn" aria-label="Instagram"><img src={InstagramIcon} alt="Instagram" /></a>
                            <a href="https://www.youtube.com/channel/UCT0SNdQIY2Oso2X5WOWfdwA" target="_blank" rel="noopener noreferrer" className="sns-icon youtube-icon-btn" aria-label="Youtube"><img src={YoutubeIcon} alt="Youtube" /></a>
                            <a href="https://blog.naver.com/tamkorea888" target="_blank" rel="noopener noreferrer" className="sns-icon naver-icon-btn" aria-label="Naver Blog"><img src={NaverIcon} alt="Naver Blog" /></a>
                            <a href="https://pf.kakao.com/_xkxhZzX" target="_blank" rel="noopener noreferrer" className="sns-icon kakao-icon-btn" aria-label="Kakao Channel"><img src={KakaoIcon} alt="Kakao Channel" /></a>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
