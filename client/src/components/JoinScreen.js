import React, { useState } from 'react';
import './JoinScreen.css';

function JoinScreen({ onJoin }) {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onJoin(name.trim());
    }
  };

  return (
    <div className="join-screen">
      <div className="join-container">
        <h1 className="title">🀄 台灣麻將</h1>
        <h2 className="subtitle">Taiwanese Mahjong</h2>
        
        <form onSubmit={handleSubmit} className="join-form">
          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="name-input"
            maxLength={20}
            autoFocus
          />
          <button type="submit" className="join-button" disabled={!name.trim()}>
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

