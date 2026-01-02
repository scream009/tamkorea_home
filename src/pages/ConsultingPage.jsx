import React from 'react';
import './ConsultingPage.css';

const ConsultingPage = () => {
    return (
        <div className="consulting-page">
            <div className="container">
                <div className="consulting-header">
                    <h2>무료 상담 신청</h2>
                    <p>
                        탐코리아의 전문가가 귀사의 브랜드를 심층 분석하여<br />
                        가장 효과적인 글로벌 마케팅 전략을 제안해 드립니다.
                    </p>
                </div>

                <div className="form-container">
                    <div className="form-placeholder">
                        <div className="placeholder-content">
                            <h3>체험단 지원 신청</h3>
                            <p>
                                아래 버튼을 클릭하여 <strong>지원 양식</strong>을 작성해주세요.<br />
                                <span style={{ fontSize: '14px', color: '#888' }}>(외부 설문 페이지로 이동합니다)</span>
                            </p>
                            <a
                                href="https://docs.google.com/forms/d/e/1FAIpQLSdq9w5tHw5qw1ivOnLYBIKyGhgzLgBesXCDToh2vrOxCZTsXg/viewform?usp=header"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-primary btn-pill"
                            >
                                체험단 지원하기
                            </a>
                        </div>
                    </div>
                </div>

                <div className="process-guide">
                    <h3>상담 진행 프로세스</h3>
                    <div className="steps-grid">
                        <div className="step-item">
                            <span className="step-number">01</span>
                            <h4>신청서 접수</h4>
                            <p>브랜드 정보와 마케팅 목표를<br />간단히 작성해주세요.</p>
                        </div>
                        <div className="step-item">
                            <span className="step-number">02</span>
                            <h4>1:1 담당자 배정</h4>
                            <p>업종별 전문 매니저가<br />즉시 배정됩니다.</p>
                        </div>
                        <div className="step-item">
                            <span className="step-number">03</span>
                            <h4>맞춤 전략 제안</h4>
                            <p>3일 이내에 데이터 기반의<br />전략 제안서를 보내드립니다.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConsultingPage;
