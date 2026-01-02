import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Youtube, Facebook, ChevronDown } from 'lucide-react';
import './Footer.css';
import Toast from './Toast';

const Footer = () => {
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
                            <span className="footer-logo">TamKorea</span>
                        </div>
                        <address className="company-info">
                            <p>
                                <span>탐코리아</span>
                                <span>대표이사: 김은련</span>
                                <span>사업자등록번호: 675-21-02142</span>
                            </p>
                            <p>
                                <span>주소: 제주특별자치도 제주시 연동 272-33 514호</span>
                            </p>
                            <p className="contact-row">
                                <span>고객센터: 010-9345-5567</span>
                                <span>이메일: tamkorea888@gmail.com</span>
                            </p>
                            <p className="copyright">
                                Copyright © TamKorea. All rights reserved.
                            </p>
                        </address>
                    </div>

                    <div className="footer-right">
                        <div className="footer-family-site">
                            <button className="family-site-btn" onClick={handleComingSoon}>
                                Family Site <ChevronDown size={14} />
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
                message="현재 서비스 준비 중입니다."
                isVisible={showToast}
                onClose={() => setShowToast(false)}
            />
        </footer>
    );
};

export default Footer;
