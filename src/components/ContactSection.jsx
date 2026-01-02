import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import './ContactSection.css';

const ContactSection = () => {
    return (
        <section className="contact-section section-padding">
            <div className="container">
                <div className="contact-card">
                    <div className="contact-content">
                        <h2 className="contact-title">브랜드를 성장시킬 준비가 되셨나요?</h2>
                        <p className="contact-desc">
                            한국과 중국의 타겟 고객에게 도달하는 방법을 논의해보세요.<br />
                            지금 바로 무료 상담을 받아보세요.
                        </p>
                    </div>
                    <div className="contact-actions">
                        <Link to="/contact" className="btn btn-primary btn-lg">
                            시작하기 <ArrowRight size={20} style={{ marginLeft: '0.5rem' }} />
                        </Link>
                        <Link to="/contact" className="btn btn-outline btn-lg contact-btn-outline">
                            <Mail size={20} style={{ marginRight: '0.5rem' }} /> 문의하기
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ContactSection;
