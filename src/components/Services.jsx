import React from 'react';
import { Target, ShieldCheck, BarChart2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './Services.css';

const Services = () => {
    const { t } = useLanguage();

    const services = [
        {
            title: t('services.card1Title'),
            subtitle: t('services.card1Sub'),
            description: t('services.card1Desc'),
            icon: <Target size={40} strokeWidth={1.5} />,
            color: "blue"
        },
        {
            title: t('services.card2Title'),
            subtitle: t('services.card2Sub'),
            description: t('services.card2Desc'),
            icon: <ShieldCheck size={40} strokeWidth={1.5} />,
            color: "green"
        },
        {
            title: t('services.card3Title'),
            subtitle: t('services.card3Sub'),
            description: t('services.card3Desc'),
            icon: <BarChart2 size={40} strokeWidth={1.5} />,
            color: "purple"
        }
    ];

    return (
        <section className="services section">
            <div className="container">
                <div className="section-header text-center">
                    <h2 className="section-title">{t('services.title')}</h2>
                    <p className="section-subtitle">{t('services.subtitle')}</p>
                </div>
                <div className="services-grid">
                    {services.map((service, index) => (
                        <div className="service-card" key={index}>
                            <div className={`service-icon-wrapper ${service.color}`}>
                                {service.icon}
                            </div>
                            <h3 className="service-title">{service.title}</h3>
                            <div className="service-subtitle">{service.subtitle}</div>
                            <p className="service-desc">{service.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Services;
