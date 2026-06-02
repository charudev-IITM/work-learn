import React from 'react'

export const SimpleTest: React.FC = () => {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e1b4b, #581c87, #312e81)',
      color: 'white',
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1>✨ Simple Ticker Test</h1>
      <p>This is a basic test to confirm the routing is working.</p>
      <p>If you can see this, the hash routing (#ticker) is functional!</p>
      
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '12px',
        padding: '20px',
        marginTop: '20px'
      }}>
        <h2>🎯 Test Glassmorphism Card</h2>
        <p>This card demonstrates basic glassmorphism effects.</p>
      </div>
    </div>
  )
}