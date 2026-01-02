import React from 'react';
import { Mail, Phone, MapPin, Send } from 'lucide-react';

const ContactPage = () => {
    return (
        <div className="page-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
            <div className="container">
                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '1rem', color: 'var(--color-text-main)' }}>
                        문의하기
                    </h1>
                    <p style={{ fontSize: '1.25rem', color: 'var(--color-text-muted)' }}>
                        프로젝트에 대해 궁금한 점이 있으신가요? 언제든 문의해주세요.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', maxWidth: '1000px', margin: '0 auto' }}>
                    {/* Contact Info */}
                    <div>
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '2rem', color: 'var(--color-text-main)' }}>연락처 정보</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-light)', borderRadius: '50%', color: 'var(--color-primary)' }}>
                                    <Mail size={24} />
                                </div>
                                <div>
                                    <h4 style={{ fontWeight: '600', marginBottom: '0.25rem' }}>이메일</h4>
                                    <p style={{ color: 'var(--color-text-muted)' }}>contact@tamkorea.com</p>
                                    <p style={{ color: 'var(--color-text-muted)' }}>support@tamkorea.com</p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-light)', borderRadius: '50%', color: 'var(--color-primary)' }}>
                                    <Phone size={24} />
                                </div>
                                <div>
                                    <h4 style={{ fontWeight: '600', marginBottom: '0.25rem' }}>전화번호</h4>
                                    <p style={{ color: 'var(--color-text-muted)' }}>064-123-1234</p>
                                    <p style={{ color: 'var(--color-text-muted)' }}>평일 09:00 - 18:00</p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-light)', borderRadius: '50%', color: 'var(--color-primary)' }}>
                                    <MapPin size={24} />
                                </div>
                                <div>
                                    <h4 style={{ fontWeight: '600', marginBottom: '0.25rem' }}>오시는 길</h4>
                                    <p style={{ color: 'var(--color-text-muted)' }}>제주특별자치도 제주시 신대로 123</p>
                                    <p style={{ color: 'var(--color-text-muted)' }}>탐코리아 빌딩 5층</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact Form */}
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--color-border)' }}>
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: 'var(--color-text-main)' }}>메시지 보내기</h3>
                        <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>이름</label>
                                <input type="text" placeholder="홍길동" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>이메일</label>
                                <input type="email" placeholder="example@email.com" style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '1rem' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>문의 내용</label>
                                <textarea rows="4" placeholder="문의하실 내용을 입력해주세요." style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '1rem', resize: 'vertical' }}></textarea>
                            </div>
                            <button type="button" className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }}>
                                전송하기 <Send size={18} style={{ marginLeft: '0.5rem' }} />
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContactPage;
