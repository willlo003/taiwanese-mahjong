import React, { useEffect, useState } from 'react';
import './ClaimDialog.css';
import Tile from './Tile';

function ClaimDialog({ tile, canPong, canGang, onPong, onGang, onSkip, timeout = 5000 }) {
  const [timeLeft, setTimeLeft] = useState(timeout / 1000);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0.1) {
          clearInterval(interval);
          onSkip();
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [onSkip]);

  return (
    <div className="claim-dialog-overlay">
      <div className="claim-dialog">
        <h2>Claim Tile?</h2>
        
        <div className="claim-tile">
          <Tile tile={tile} size="normal" />
        </div>

        <div className="claim-timer">
          <div className="timer-bar" style={{ width: `${(timeLeft / (timeout / 1000)) * 100}%` }}></div>
          <span>{timeLeft.toFixed(1)}s</span>
        </div>

        <div className="claim-actions">
          {canPong && (
            <button className="claim-button pong-button" onClick={onPong}>
              碰 Pong
            </button>
          )}
          {canGang && (
            <button className="claim-button gang-button" onClick={onGang}>
              槓 Gang
            </button>
          )}
          <button className="claim-button skip-button" onClick={onSkip}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

export default ClaimDialog;

