import React from 'react';

export default function CheckinGuidePage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      backgroundColor: '#f8f9fa',
      color: '#333',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{
        background: 'white',
        padding: '40px 20px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        maxWidth: '400px',
        width: '100%'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
          체크인은 전달받은 제출 링크에서 해주세요
        </h2>
        <h2 style={{ fontSize: '1.2rem', color: '#666', fontWeight: 'normal' }}>
          请通过收到的提交链接签到
        </h2>
        <p style={{ marginTop: '30px', fontSize: '0.9rem', color: '#888' }}>
          T A M K O R E A
        </p>
      </div>
    </div>
  );
}
