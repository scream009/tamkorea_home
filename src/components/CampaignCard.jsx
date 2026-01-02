import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './CampaignCard.css';
import dianpingLogo from '../assets/images/dianping_logo.png';
import xhsLogo from '../assets/images/xhs_logo.png';
import instagramLogo from '../assets/images/instagram_logo.png';

const CampaignCard = ({ id, title, location, platform, platforms, status, imageUrl, applicants, maxApplicants, dDay }) => {
    const [imgError, setImgError] = useState(false);

    // Normalize platforms to array
    const activePlatforms = platforms || (platform ? [platform] : []);

    const getLogo = (p) => {
        switch (p) {
            case 'dianping': return dianpingLogo;
            case 'xhs': return xhsLogo;
            case 'instagram': return instagramLogo;
            default: return null;
        }
    };

    return (
        <div className="campaign-card">
            <Link to={`/campaigns/${id}`} className="campaign-link-wrapper">
                <div className="campaign-image-wrapper">
                    <img
                        src={imgError ? 'https://via.placeholder.com/300x300/f0f0f0/cccccc?text=No+Image' : imageUrl}
                        alt={title}
                        className="campaign-image"
                        onError={() => setImgError(true)}
                    />
                    <div className="platform-badges-container">
                        {activePlatforms.map(p => (
                            <img key={p} src={getLogo(p)} alt={p} className="platform-logo-badge" />
                        ))}
                    </div>
                    <span className={`status-badge ${status}`}>
                        {status === 'recruiting' ? `D-${dDay}` : '마감'}
                    </span>
                </div>
                <div className="campaign-content">
                    <h3 className="campaign-title">{title}</h3>
                    <div className="campaign-info">
                        <span className="location">{location}</span>
                        <span className="applicants">{maxApplicants}명(모집인원)</span>
                    </div>
                </div>
            </Link>
        </div>
    );
};

export default CampaignCard;
