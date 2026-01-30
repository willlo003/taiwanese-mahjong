import React from 'react';
import './LobbyScreen.css';

function LobbyScreen({ players, playerInfo, onReady, onRandomSeats, onStartGame }) {
  // Find the current player's ready status from the players list
  const currentPlayer = players.find(p => p.id === playerInfo?.playerId);
  const isReady = currentPlayer?.ready || false;
  const isEastPlayer = currentPlayer?.position === 0;
  const allReady = players.length === 4 && players.every(p => p.ready);

  const handleReady = () => {
    onReady();
  };

  const handleRandomSeats = () => {
    onRandomSeats();
  };

  const handleStartGame = () => {
    onStartGame();
  };

  const positions = ['East (東)', 'South (南)', 'West (西)', 'North (北)'];

  return (
    <div className="lobby-screen">
      <div className="lobby-container">
        <h1 className="lobby-title">🀄 Game Lobby</h1>

        <div className="player-count">
          {players.length} / 4 Players
        </div>

        {/* Random Seats Button */}
        {players.length >= 2 && (
          <button className="random-button" onClick={handleRandomSeats}>
            🎲 Random Seats
          </button>
        )}

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

        {isReady && !allReady && (
          <div className="ready-message">
            ✓ You are ready! Waiting for other players...
          </div>
        )}

        {allReady && isEastPlayer && (
          <button className="start-button" onClick={handleStartGame}>
            🎮 START GAME
          </button>
        )}

        {allReady && !isEastPlayer && (
          <div className="waiting-message">
            ✓ All ready! Waiting for 東 to start the game...
          </div>
        )}
      </div>
    </div>
  );
}

export default LobbyScreen;

