import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './ContactSection.css';

const ContactSection = () => {
    const { t } = useLanguage();

    return (
        <section className="contact-section section-padding">
            <div className="container">
                <div className="contact-card">
                    <div className="contact-content">
                        <h2 className="contact-title">{t('contact.title')}</h2>
                        <p className="contact-desc">
                            {t('contact.desc').split('\n').map((line, i) => (
                                <React.Fragment key={i}>
                                    {line}
                                    {i < t('contact.desc').split('\n').length - 1 && <br />}
                                </React.Fragment>
                            ))}
                        </p>
                    </div>
                    <div className="contact-actions">
                        <Link to="/contact" className="btn btn-primary btn-lg">
                            {t('contact.btnStart')} <ArrowRight size={20} style={{ marginLeft: '0.5rem' }} />
                        </Link>
                        <Link to="/contact" className="btn btn-outline btn-lg contact-btn-outline">
                            <Mail size={20} style={{ marginRight: '0.5rem' }} /> {t('contact.btnContact')}
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ContactSection;
