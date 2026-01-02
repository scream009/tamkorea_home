import React, { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './GlobalMap.css';

const GlobalMap = () => {
    const { t } = useLanguage();
    const [animated, setAnimated] = useState(false);

    useEffect(() => {
        setAnimated(true);
    }, []);

    // Adjusted positions (900w x 700h)
    // Korea: center adjusted (450, 266)
    // China: upper left (180, 126)
    // Taiwan: lower center-right (522, 406)
    // Hong Kong: left of Taiwan (342, 364)
    // Malaysia: lower left (198, 420)
    // Singapore: bottom center (450, 504)

    return (
        <section className="global-map-section section">
            <div className="container">
                <div className="section-header text-center">
                    <h2 className="section-title">{t('globalMap.title')}</h2>
                    <p className="section-subtitle">{t('globalMap.subtitle')}</p>
                </div>

                <div className={`map-container ${animated ? 'animate' : ''}`}>
                    {/* Central Hub: Korea (LARGE with ripple effect) */}
                    <div className="map-node node-korea">
                        <div className="flag-circle flag-kr"></div>
                        <span className="node-label">KOREA</span>
                        <div className="ripple"></div>
                    </div>

                    {/* Target Nodes */}
                    <div className="map-node node-china">
                        <div className="flag-circle flag-cn"></div>
                        <span className="node-label">China</span>
                    </div>

                    <div className="map-node node-tw">
                        <div className="flag-circle flag-tw"></div>
                        <span className="node-label">Taiwan</span>
                    </div>

                    <div className="map-node node-hk">
                        <div className="flag-circle flag-hk"></div>
                        <span className="node-label">Hong Kong</span>
                    </div>

                    <div className="map-node node-my">
                        <div className="flag-circle flag-my"></div>
                        <span className="node-label">Malaysia</span>
                    </div>

                    <div className="map-node node-sg">
                        <div className="flag-circle flag-sg"></div>
                        <span className="node-label">Singapore</span>
                    </div>



                    {/* Connection Lines - Curved arrows like in reference */}
                    <svg className="map-connections" viewBox="0 0 900 700">
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" className="connection-arrow">
                                <path d="M 0 0 L 10 5 L 0 10 z" />
                            </marker>
                        </defs>

                        {/* Korea (396, 56) to China (144, 126) - curved */}
                        <path className="connection-line"
                            d="M 396 56 Q 320 170 144 126"
                            markerEnd="url(#arrowhead)" />

                        {/* Korea to Taiwan (522, 406) - curved */}
                        <path className="connection-line"
                            d="M 396 56 Q 500 320 522 406"
                            markerEnd="url(#arrowhead)" />

                        {/* Korea to Hong Kong (342, 364) - curved */}
                        <path className="connection-line"
                            d="M 396 56 Q 380 300 342 364"
                            markerEnd="url(#arrowhead)" />

                        {/* Korea to Malaysia (198, 420) - curved */}
                        <path className="connection-line"
                            d="M 396 56 Q 300 330 198 420"
                            markerEnd="url(#arrowhead)" />

                        {/* Korea to Singapore (450, 504) - straight down */}
                        <path className="connection-line"
                            d="M 396 56 L 450 504"
                            markerEnd="url(#arrowhead)" />

                    </svg>
                </div>
            </div>
        </section>
    );
};

export default GlobalMap;
