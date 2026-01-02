import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Globe, ChevronDown } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './Header.css';

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);
  const { t, language, setLanguage } = useLanguage();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 0);
    };

    const handleClickOutside = (event) => {
      if (!event.target.closest('.language-dropdown-container')) {
        setLanguageDropdownOpen(false);
      }
    };

    document.addEventListener('scroll', handleScroll);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <header className={`header ${scrolled ? 'scrolled' : ''}`}>
      {/* Main Navigation */}
      <div className="header-main">
        <div className="container header-container">
          <div className="logo">
            <Link to="/">
              <img src="/images/tam-korea-icon.png" alt="Tam Korea" className="logo-icon" />
              <span className="logo-text">TamKorea</span>
            </Link>
          </div>

          <nav className="nav-menu">
            <ul className="nav-list">
              <li><Link to="/about" className="nav-link">회사소개</Link></li>
              <li><Link to="/biz" className="nav-link">{t('nav.bizCenter')}</Link></li>
              <li><Link to="/campaigns" className="nav-link">{t('nav.campaigns')}</Link></li>
            </ul>
          </nav>

          {/* Language Switcher - Revu Style Dropdown */}
          <div className="language-dropdown-container">
            <button
              className="language-btn"
              onClick={() => setLanguageDropdownOpen(!languageDropdownOpen)}
            >
              <span className="lang-text">{language.toUpperCase()}</span>
              <ChevronDown size={14} className={`lang-arrow ${languageDropdownOpen ? 'open' : ''}`} />
            </button>

            {languageDropdownOpen && (
              <div className="language-dropdown-menu">
                {['ko', 'en', 'cn'].map((lang) => (
                  <button
                    key={lang}
                    className={`lang-option ${language === lang ? 'active' : ''}`}
                    onClick={() => {
                      setLanguage(lang);
                      setLanguageDropdownOpen(false);
                    }}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
