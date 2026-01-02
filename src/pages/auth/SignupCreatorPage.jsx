import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './SignupForm.css'; // Reusable CSS for forms

const SignupCreatorPage = () => {
    return (
        <div className="signup-form-page">
            <div className="container">
                <div className="form-box">
                    <h2 className="form-title">크리에이터 회원가입</h2>
                    <p className="form-subtitle">나만의 콘텐츠로 새로운 수익을 만들어보세요.</p>

                    <form className="auth-form">
                        <h3 className="section-label">기본 정보</h3>
                        <div className="form-group">
                            <label>이메일 (아이디)</label>
                            <input type="email" placeholder="example@email.com" required />
                        </div>
                        <div className="form-group">
                            <label>비밀번호</label>
                            <input type="password" placeholder="영문, 숫자, 특수문자 포함 8자 이상" required />
                        </div>
                        <div className="form-group">
                            <label>비밀번호 확인</label>
                            <input type="password" placeholder="비밀번호 재입력" required />
                        </div>
                        <div className="form-group">
                            <label>이름 (실명)</label>
                            <input type="text" placeholder="홍길동" required />
                        </div>
                        <div className="form-group">
                            <label>닉네임</label>
                            <input type="text" placeholder="활동명 입력" required />
                        </div>
                        <div className="form-group">
                            <label>휴대폰 번호</label>
                            <div className="phone-input-group">
                                <input type="tel" placeholder="01012345678" />
                                <button type="button" className="btn-verify">인증요청</button>
                            </div>
                        </div>

                        <h3 className="section-label" style={{ marginTop: '30px' }}>활동 채널 정보</h3>
                        <div className="form-group">
                            <label>주력 채널 URL (인스타그램, 블로그 등)</label>
                            <input type="url" placeholder="https://instagram.com/my_id" />
                        </div>
                        <div className="form-group">
                            <label>관심 카테고리 (최대 3개)</label>
                            <div className="category-select">
                                <label><input type="checkbox" /> 맛집</label>
                                <label><input type="checkbox" /> 뷰티</label>
                                <label><input type="checkbox" /> 여행</label>
                                <label><input type="checkbox" /> 패션</label>
                                <label><input type="checkbox" /> 육아</label>
                                <label><input type="checkbox" /> IT/테크</label>
                            </div>
                        </div>

                        <button type="submit" className="btn-submit">가입완료</button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default SignupCreatorPage;
