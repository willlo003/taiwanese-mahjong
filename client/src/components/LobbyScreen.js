import React from 'react';
import './LobbyScreen.css';

function LobbyScreen({ players, playerInfo, onReady }) {
  // Find the current player's ready status from the players list
  const currentPlayer = players.find(p => p.id === playerInfo?.playerId);
  const isReady = currentPlayer?.ready || false;

  const handleReady = () => {
    onReady();
  };

  const positions = ['East (東)', 'South (南)', 'West (西)', 'North (北)'];

  return (
    <div className="lobby-screen">
      <div className="lobby-container">
        <h1 className="lobby-title">🀄 Game Lobby</h1>

        <div className="player-count">
          {players.length} / 4 Players
        </div>

        <div className="players-grid">
          {[0, 1, 2, 3].map((position) => {
            const player = players.find(p => p.position === position);
            return (
              <div
                key={position}
                className={`player-slot ${player ? 'filled' : 'empty'} ${player?.id === playerInfo?.playerId ? 'you' : ''}`}
              >
                <div className="position-label">{positions[position]}</div>
                {player ? (
                  <>
                    <div className="player-name">{player.name}</div>
                    <div className={`ready-status ${player.ready ? 'ready' : 'not-ready'}`}>
                      {player.ready ? '✓ Ready' : 'Waiting...'}
                    </div>
                  </>
                ) : (
                  <div className="waiting-text">Waiting for player...</div>
                )}
              </div>
            );
          })}
        </div>

        {playerInfo && !isReady && (
          <button className="ready-button" onClick={handleReady}>
            I'm Ready!
          </button>
        )}

        {isReady && (
          <div className="ready-message">
            ✓ You are ready! Waiting for other players...
          </div>
        )}

        {players.length === 4 && players.every(p => p.ready) && (
          <div className="starting-message">
            🎮 Starting game...
          </div>
        )}
      </div>
    </div>
  );
}

export default LobbyScreen;

