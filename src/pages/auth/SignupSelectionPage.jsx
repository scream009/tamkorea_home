import React from 'react';
import { Link } from 'react-router-dom';
import { User, Building2, ArrowRight } from 'lucide-react';
import './SignupSelectionPage.css';

const SignupSelectionPage = () => {
    return (
        <div className="signup-selection-page">
            <div className="container">
                <div className="selection-header">
                    <h2>회원가입 유형 선택</h2>
                    <p>탐코리아와 함께할 준비가 되셨나요?<br />가입 목적에 맞는 유형을 선택해주세요.</p>
                </div>

                <div className="selection-cards">
                    <Link to="/signup/creator" className="selection-card creator">
                        <div className="card-icon">
                            <User size={48} />
                        </div>
                        <div className="card-content">
                            <h3>크리에이터 가입</h3>
                            <p>블로그, 인스타그램, 틱톡 등<br />나만의 콘텐츠로 수익을 창출하세요.</p>
                            <span className="card-cta">가입하기 <ArrowRight size={16} /></span>
                        </div>
                    </Link>

                    <Link to="/signup/business" className="selection-card business">
                        <div className="card-icon">
                            <Building2 size={48} />
                        </div>
                        <div className="card-content">
                            <h3>기업/사업자 가입</h3>
                            <p>인플루언서 마케팅으로<br />브랜드의 가치를 높이세요.</p>
                            <span className="card-cta">가입하기 <ArrowRight size={16} /></span>
                        </div>
                    </Link>
                </div>

                <div className="login-link">
                    이미 계정이 있으신가요? <Link to="/login">로그인</Link>
                </div>
            </div>
        </div>
    );
};

export default SignupSelectionPage;
