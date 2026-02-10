import React, { useState, useEffect } from 'react';
import './JoinScreen.css';

function JoinScreen({ onJoin }) {
  const [name, setName] = useState('');
  const [countdown, setCountdown] = useState(3);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setIsReady(true);
    }
  }, [countdown]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim() && isReady) {
      onJoin(name.trim());
    }
  };

  return (
    <div className="join-screen">
      <div className="join-container">
        <h1 className="title">🀄 台灣麻將</h1>
        <h2 className="subtitle">Taiwanese Mahjong</h2>

        {!isReady && (
          <div className="connection-timer">
            <div className="timer-circle">
              <div className="timer-number">{countdown}</div>
            </div>
            <p className="timer-text">Establishing connection...</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`join-form ${!isReady ? 'disabled' : ''}`}>
          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="name-input"
            maxLength={20}
            autoFocus
            disabled={!isReady}
          />
          <button type="submit" className="join-button" disabled={!name.trim() || !isReady}>
            Join Game
          </button>
        </form>

        <div className="info">
          <p>🎮 4 players needed to start</p>
          <p>📱 Play on your phone via WiFi</p>
        </div>
      </div>
    </div>
  );
}

export default JoinScreen;

