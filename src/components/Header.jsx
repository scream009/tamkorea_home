import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Globe, ChevronDown, Menu, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './Header.css';

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // Close mobile menu when route changes or screen resizes
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <header className={`header ${scrolled ? 'scrolled' : ''}`}>
      {/* Main Navigation */}
      <div className="header-main">
        <div className="container header-container">
          <div className="logo">
            <Link to="/" onClick={() => setMobileMenuOpen(false)}>
              <img src="/images/tam-korea-icon.png" alt="Tam Korea (탐코리아) 로고" className="logo-icon" />
              <span className="logo-text">TamKorea</span>
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="nav-menu desktop-only">
            <ul className="nav-list">
              <li><Link to="/about" className="nav-link">{t('nav.about')}</Link></li>
              <li><Link to="/biz" className="nav-link">{t('nav.bizCenter')}</Link></li>
              <li><Link to="/campaigns" className="nav-link">{t('nav.campaigns')}</Link></li>
            </ul>
          </nav>

          <div className="header-right-group">
            {/* Language Switcher */}
            <div className="language-dropdown-container desktop-only">
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

            {/* Mobile Menu Toggle */}
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <div className={`mobile-menu-overlay ${mobileMenuOpen ? 'active' : ''}`}>
        <nav className="mobile-nav">
          <ul className="mobile-nav-list">
            <li><Link to="/about" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>{t('nav.about')}</Link></li>
            <li><Link to="/biz" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>{t('nav.bizCenter')}</Link></li>
            <li><Link to="/campaigns" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>{t('nav.campaigns')}</Link></li>
          </ul>

          <div className="mobile-lang-switcher">
            <div className="mobile-lang-title">Language</div>
            <div className="mobile-lang-options">
              {['ko', 'en', 'cn'].map((lang) => (
                <button
                  key={lang}
                  className={`mobile-lang-btn ${language === lang ? 'active' : ''}`}
                  onClick={() => {
                    setLanguage(lang);
                    setMobileMenuOpen(false); // Optional: close menu after lang selection? keep open for now maybe
                  }}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;
