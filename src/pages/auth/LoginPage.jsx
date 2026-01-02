import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './LoginPage.css';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        alert(`로그인 시도: ${email}`);
        // Login logic will go here
    };

    return (
        <div className="login-page">
            <div className="container">
                <div className="login-box">
                    <h2 className="login-title">로그인</h2>

                    <form onSubmit={handleLogin} className="login-form">
                        <div className="form-group">
                            <input
                                type="email"
                                placeholder="이메일 아이디"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <input
                                type="password"
                                placeholder="비밀번호"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        <button type="submit" className="btn-login-submit">로그인</button>
                    </form>

                    <div className="login-options">
                        <Link to="/find-password">비밀번호 찾기</Link>
                        <span className="divider">|</span>
                        <Link to="/signup">회원가입</Link>
                    </div>

                    <div className="social-login">
                        <p>SNS 계정으로 간편 로그인</p>
                        <div className="social-buttons">
                            <button className="social-btn kakao">K</button>
                            <button className="social-btn naver">N</button>
                            <button className="social-btn google">G</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
