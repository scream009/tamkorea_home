import React from 'react';
import './PremiumPartners.css';

const PremiumPartners = () => {
    return (
        <section className="premium-partners-section">
            <div className="container">
                <div className="pp-header">
                    <h2 className="pp-title">TRUSTED PARTNERS</h2>
                    <p className="pp-subtitle">제주의 랜드마크부터 로컬 핫플레이스까지, 서울&middot;부산 전역 <span style={{color: '#8b5cf6', fontWeight: 700}}>100여 개 탑 브랜드</span>가 탐코리아와 함께 성장하고 있습니다.</p>
                </div>
            </div>

            <div className="pp-marquee-wrapper" style={{marginBottom: '20px'}}>
                <div className="pp-marquee-track">
                    <div className="pp-pill">M1971</div>
                    <div className="pp-pill">서귀포잠수함</div>
                    <div className="pp-pill">9.81파크</div>
                    <div className="pp-pill">에코랜드</div>
                    <div className="pp-pill">제주제트</div>
                    <div className="pp-pill">드르쿰다</div>
                    <div className="pp-pill">메종글래드</div>
                    <div className="pp-pill">박물관은살아있다</div>
                    <div className="pp-pill">벨룸리조트</div>
                    <div className="pp-pill">더클리프</div>
                    <div className="pp-pill">홀릭뮤지엄</div>
                    <div className="pp-pill">감귤카드</div>
                    <div className="pp-pill">피닉스아일랜드</div>
                    {/* Duplicate for infinite scroll */}
                    <div className="pp-pill">M1971</div>
                    <div className="pp-pill">서귀포잠수함</div>
                    <div className="pp-pill">9.81파크</div>
                    <div className="pp-pill">에코랜드</div>
                    <div className="pp-pill">제주제트</div>
                    <div className="pp-pill">드르쿰다</div>
                    <div className="pp-pill">메종글래드</div>
                    <div className="pp-pill">박물관은살아있다</div>
                    <div className="pp-pill">벨룸리조트</div>
                    <div className="pp-pill">더클리프</div>
                    <div className="pp-pill">홀릭뮤지엄</div>
                    <div className="pp-pill">감귤카드</div>
                    <div className="pp-pill">피닉스아일랜드</div>
                </div>
            </div>

            <div className="pp-marquee-wrapper">
                <div className="pp-marquee-track reverse">
                    <div className="pp-pill">갈치관</div>
                    <div className="pp-pill">곱들락</div>
                    <div className="pp-pill">만다린아일랜드</div>
                    <div className="pp-pill">모찌롱</div>
                    <div className="pp-pill">어우름</div>
                    <div className="pp-pill">연족발</div>
                    <div className="pp-pill">우대</div>
                    <div className="pp-pill">우아연</div>
                    <div className="pp-pill">포크80</div>
                    <div className="pp-pill">함덕찜</div>
                    <div className="pp-pill">바른갈치</div>
                    <div className="pp-pill">먹돌</div>
                    <div className="pp-pill">연동대게회타운</div>
                    <div className="pp-pill">몽그레</div>
                    {/* Duplicate for infinite scroll */}
                    <div className="pp-pill">갈치관</div>
                    <div className="pp-pill">곱들락</div>
                    <div className="pp-pill">만다린아일랜드</div>
                    <div className="pp-pill">모찌롱</div>
                    <div className="pp-pill">어우름</div>
                    <div className="pp-pill">연족발</div>
                    <div className="pp-pill">우대</div>
                    <div className="pp-pill">우아연</div>
                    <div className="pp-pill">포크80</div>
                    <div className="pp-pill">함덕찜</div>
                    <div className="pp-pill">바른갈치</div>
                    <div className="pp-pill">먹돌</div>
                    <div className="pp-pill">연동대게회타운</div>
                    <div className="pp-pill">몽그레</div>
                </div>
            </div>
        </section>
    );
};

export default PremiumPartners;
