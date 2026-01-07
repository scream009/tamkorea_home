import React, { useState, useEffect } from 'react';
import { Mail, Phone, MapPin, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './ContactPage.css';
import './ContactForm.css'; // New styles

const ContactPage = () => {
    const { t } = useLanguage();

    // Form State
    const [formData, setFormData] = useState({
        companyName: '',
        isAgency: false,
        industry: '',
        location: '',
        phone: '',
        website: '',
        budget: '',
        message: '',
        privacyAgreement: false,
        // UTM Fields (Hidden)
        utm_source: '',
        utm_medium: '',
        utm_campaign: '',
        utm_term: '',
        utm_content: ''
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState(null); // 'success' | 'error' | null

    // Capture UTM Parameters on Mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setFormData(prev => ({
            ...prev,
            utm_source: params.get('utm_source') || '',
            utm_medium: params.get('utm_medium') || '',
            utm_campaign: params.get('utm_campaign') || '',
            utm_term: params.get('utm_term') || '',
            utm_content: params.get('utm_content') || ''
        }));
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Basic Validation
        if (!formData.companyName || !formData.phone || !formData.industry || !formData.location || !formData.privacyAgreement) {
            alert('필수 항목을 모두 입력해주세요.');
            return;
        }

        setIsSubmitting(true);
        setSubmitStatus(null);

        try {
            // Call Vercel Serverless Function
            const response = await fetch('/api/submit-contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok) {
                setSubmitStatus('success');
                // Reset form (keep UTMs)
                setFormData(prev => ({
                    ...prev,
                    companyName: '',
                    isAgency: false,
                    industry: '',
                    location: '',
                    phone: '',
                    website: '',
                    budget: '',
                    message: '',
                    privacyAgreement: false
                }));
                window.scrollTo(0, 0);
            } else {
                throw new Error(result.message || 'Submission failed');
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            setSubmitStatus('error');
            alert('문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (submitStatus === 'success') {
        return (
            <div className="page-container" style={{ paddingTop: '6rem', paddingBottom: '6rem', textAlign: 'center' }}>
                <div className="container">
                    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '3rem', backgroundColor: 'white', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                        <div style={{ color: '#10B981', marginBottom: '1.5rem' }}>
                            <CheckCircle size={80} style={{ margin: '0 auto' }} />
                        </div>
                        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>문의가 접수되었습니다!</h2>
                        <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '2rem' }}>
                            담당자가 검토 후 빠른 시일 내에 연락드리겠습니다.<br />
                            보통 영업일 기준 1일 이내에 답변 드립니다.
                        </p>
                        <button
                            onClick={() => setSubmitStatus(null)}
                            className="btn btn-primary"
                        >
                            다른 문의 남기기
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
            <div className="container">
                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '1rem', color: 'var(--color-text-main)' }}>
                        문의하기
                    </h1>
                    <p style={{ fontSize: '1.25rem', color: 'var(--color-text-muted)' }}>
                        성공적인 비즈니스를 위한 첫걸음, 탐코리아와 함께하세요.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '4rem', maxWidth: '1200px', margin: '0 auto' }}>
                    {/* Contact Info Side */}
                    <div className="contact-info-side">
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '2rem', color: 'var(--color-text-main)' }}>연락처 정보</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className="info-item">
                                <div className="icon-box">
                                    <Phone size={24} />
                                </div>
                                <div>
                                    <h4 style={{ fontWeight: '600', marginBottom: '0.25rem' }}>전화번호</h4>
                                    <p style={{ color: 'var(--color-text-muted)' }}>010-9430-5567</p>
                                    <p style={{ color: 'var(--color-text-muted)' }}>평일 09:00 - 18:00</p>
                                </div>
                            </div>

                            <div className="info-item">
                                <div className="icon-box">
                                    <Mail size={24} />
                                </div>
                                <div>
                                    <h4 style={{ fontWeight: '600', marginBottom: '0.25rem' }}>이메일</h4>
                                    <p style={{ color: 'var(--color-text-muted)' }}>contact@tamkorea.com</p>
                                </div>
                            </div>

                            <div className="info-item">
                                <div className="icon-box">
                                    <MapPin size={24} />
                                </div>
                                <div>
                                    <h4 style={{ fontWeight: '600', marginBottom: '0.25rem' }}>오시는 길</h4>
                                    <p style={{ color: 'var(--color-text-muted)' }}>제주특별자치도 제주시 신대로 123</p>
                                    <p style={{ color: 'var(--color-text-muted)' }}>탐코리아 빌딩 508호</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* New Contact Form */}
                    <div className="contact-form-container">
                        <h3 className="contact-form-title">광고/마케팅 상담 신청</h3>
                        <form onSubmit={handleSubmit} className="form-grid">

                            {/* Row 1: Company Name & Phone */}
                            <div className="form-group">
                                <label className="form-label">업체명 <span className="required-mark">*</span></label>
                                <input
                                    type="text"
                                    name="companyName"
                                    value={formData.companyName}
                                    onChange={handleChange}
                                    placeholder="업체명을 입력해주세요"
                                    className="form-input"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">전화번호 <span className="required-mark">*</span></label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    placeholder="010-0000-0000"
                                    className="form-input"
                                    required
                                />
                            </div>

                            {/* Row 2: Industry & Location */}
                            <div className="form-group">
                                <label className="form-label">업종 <span className="required-mark">*</span></label>
                                <select
                                    name="industry"
                                    value={formData.industry}
                                    onChange={handleChange}
                                    className="form-select"
                                    required
                                >
                                    <option value="">선택해주세요</option>
                                    <option value="뷰티/코스메틱">뷰티/코스메틱</option>
                                    <option value="패션/잡화">패션/잡화</option>
                                    <option value="식품/음료">식품/음료</option>
                                    <option value="숙박/여행">숙박/여행</option>
                                    <option value="병원/의료">병원/의료</option>
                                    <option value="가전/디지털">가전/디지털</option>
                                    <option value="생활/건강">생활/건강</option>
                                    <option value="유아동">유아동</option>
                                    <option value="반려동물">반려동물</option>
                                    <option value="기타">기타</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">지역 <span className="required-mark">*</span></label>
                                <select
                                    name="location"
                                    value={formData.location}
                                    onChange={handleChange}
                                    className="form-select"
                                    required
                                >
                                    <option value="">선택해주세요</option>
                                    <option value="서울">서울</option>
                                    <option value="경기/인천">경기/인천</option>
                                    <option value="제주">제주</option>
                                    <option value="부산/경남">부산/경남</option>
                                    <option value="대구/경북">대구/경북</option>
                                    <option value="광주/전라">광주/전라</option>
                                    <option value="대전/충청">대전/충청</option>
                                    <option value="강원">강원</option>
                                    <option value="기타">기타</option>
                                </select>
                            </div>

                            {/* Row 3: Website & Budget */}
                            <div className="form-group">
                                <label className="form-label">웹사이트/SNS</label>
                                <input
                                    type="text"
                                    name="website"
                                    value={formData.website}
                                    onChange={handleChange}
                                    placeholder="https://..."
                                    className="form-input"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">예산 범위</label>
                                <input
                                    type="text"
                                    name="budget"
                                    value={formData.budget}
                                    onChange={handleChange}
                                    placeholder="예: 월 100만원, 미정 등"
                                    className="form-input"
                                />
                            </div>

                            {/* Full Width: Message */}
                            <div className="form-group form-full-width">
                                <label className="form-label">문의 내용</label>
                                <textarea
                                    name="message"
                                    value={formData.message}
                                    onChange={handleChange}
                                    placeholder="구체적인 문의 내용을 자유롭게 적어주세요."
                                    className="form-textarea"
                                ></textarea>
                            </div>

                            {/* Agency Check */}
                            <div className="form-group form-full-width">
                                <label className="checkbox-group" style={{ display: 'flex' }}>
                                    <input
                                        type="checkbox"
                                        name="isAgency"
                                        checked={formData.isAgency}
                                        onChange={handleChange}
                                        className="checkbox-input"
                                    />
                                    <span className="checkbox-label">대행사(Partner)라면 체크해주세요.</span>
                                </label>
                            </div>

                            {/* Privacy Agreement */}
                            <div className="form-group form-full-width">
                                <div className="privacy-text">
                                    [개인정보 수집 및 이용 동의]<br />
                                    1. 수집항목: 업체명, 연락처, 이메일, 문의내용<br />
                                    2. 목적: 상담 문의 처리 및 결과 회신<br />
                                    3. 보유기간: 문의 처리 후 1년간 보관<br />
                                </div>
                                <label className="checkbox-group" style={{ display: 'flex' }}>
                                    <input
                                        type="checkbox"
                                        name="privacyAgreement"
                                        checked={formData.privacyAgreement}
                                        onChange={handleChange}
                                        className="checkbox-input"
                                        required
                                    />
                                    <span className="checkbox-label">개인정보 수집 및 이용에 동의합니다. <span className="required-mark">*</span></span>
                                </label>
                            </div>

                            {/* Submit Button */}
                            <div className="form-group form-full-width">
                                <button type="submit" className="btn btn-primary btn-submit" disabled={isSubmitting}>
                                    {isSubmitting ? '전송 중...' : (
                                        <>
                                            무료 상담 신청하기 <Send size={20} />
                                        </>
                                    )}
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .info-item {
                    display: flex;
                    gap: 1rem;
                    align-items: flex-start;
                }
                .icon-box {
                    padding: 1rem;
                    background-color: var(--color-bg-light);
                    border-radius: 50%;
                    color: var(--color-primary);
                }
                @media (max-width: 900px) {
                    div[style*="grid-template-columns"] {
                        grid-template-columns: 1fr !important;
                    }
                    .contact-info-side {
                        order: 2;
                        margin-top: 2rem;
                    }
                }
            `}</style>
        </div>
    );
};

export default ContactPage;

