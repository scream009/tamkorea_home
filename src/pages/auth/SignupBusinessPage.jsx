import React from 'react';
import './SignupForm.css';

const SignupBusinessPage = () => {
    return (
        <div className="signup-form-page">
            <div className="container">
                <div className="form-box">
                    <h2 className="form-title">기업/사업자 회원가입</h2>
                    <p className="form-subtitle">탐코리아와 함께 비즈니스를 성장시키세요.</p>

                    <form className="auth-form">
                        <h3 className="section-label">로그인 정보</h3>
                        <div className="form-group">
                            <label>이메일 (아이디)</label>
                            <input type="email" placeholder="business@company.com" required />
                        </div>
                        <div className="form-group">
                            <label>비밀번호</label>
                            <input type="password" placeholder="영문, 숫자, 특수문자 포함 8자 이상" required />
                        </div>
                        <div className="form-group">
                            <label>비밀번호 확인</label>
                            <input type="password" placeholder="비밀번호 재입력" required />
                        </div>

                        <h3 className="section-label" style={{ marginTop: '30px' }}>기업 정보</h3>
                        <div className="form-group">
                            <label>회사명 (상호)</label>
                            <input type="text" placeholder="(주)탐코리아" required />
                        </div>
                        <div className="form-group">
                            <label>대표자명</label>
                            <input type="text" placeholder="홍길동" required />
                        </div>
                        <div className="form-group">
                            <label>사업자등록번호</label>
                            <input type="text" placeholder="000-00-00000" required />
                        </div>

                        <h3 className="section-label" style={{ marginTop: '30px' }}>담당자 정보</h3>
                        <div className="form-group">
                            <label>담당자 이름</label>
                            <input type="text" placeholder="김철수 팀장" required />
                        </div>
                        <div className="form-group">
                            <label>연락처</label>
                            <input type="tel" placeholder="010-0000-0000" required />
                        </div>

                        <button type="submit" className="btn-submit">가입완료</button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default SignupBusinessPage;
