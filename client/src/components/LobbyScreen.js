import React from 'react';
import './LobbyScreen.css';

function LobbyScreen({ players, playerInfo, onRandomSeats, onSelectSeat, onStartGame, considerTimeout = 5, onSetConsiderTime, debugMode = false, onSetDebugMode, startRound = 'east', onSetStartRound, startWind = 'east', onSetStartWind }) {
  // Find the current player from the players list
  const currentPlayer = players.find(p => p.id === playerInfo?.playerId);
  const hasSeat = currentPlayer?.position !== null && currentPlayer?.position !== undefined;
  const isEastPlayer = currentPlayer?.position === 0;
  // Count players who have seats (selecting seat = ready)
  const seatedPlayers = players.filter(p => p.position !== null && p.position !== undefined);
  const allSeated = seatedPlayers.length === 4;

  const handleConsiderTimeChange = (e) => {
    const time = parseInt(e.target.value, 10);
    if (onSetConsiderTime && time >= 3 && time <= 8) {
      onSetConsiderTime(time);
    }
  };

  const handleStartRoundChange = (e) => {
    const round = e.target.value;
    if (onSetStartRound) {
      onSetStartRound(round);
    }
  };

  const handleStartWindChange = (e) => {
    const wind = e.target.value;
    if (onSetStartWind) {
      onSetStartWind(wind);
    }
  };

  const handleSeatClick = (seatPosition) => {
    const seatPlayer = players.find(p => p.position === seatPosition);

    // If clicking on own seat, leave it
    if (seatPlayer?.id === playerInfo?.playerId) {
      onSelectSeat(null);
    }
    // If seat is empty, take it
    else if (!seatPlayer) {
      onSelectSeat(seatPosition);
    }
    // If seat is taken by someone else, do nothing
  };

  const positions = ['East (東)', 'South (南)', 'West (西)', 'North (北)'];

  return (
    <div className="lobby-screen">
      <div className="lobby-container">
        <h1 className="lobby-title">🀄 Game Lobby</h1>

        <div className="player-count">
          {players.length} Players ({seatedPlayers.length}/4 seated)
        </div>

        {/* Current player info if not seated */}
        {playerInfo && !hasSeat && (
          <div className="unseated-info">
            👤 {currentPlayer?.name || playerInfo.name} - Click a seat to join
          </div>
        )}

        {/* Random Seats Button */}
        {players.length >= 2 && (
          <button className="random-button" onClick={onRandomSeats}>
            🎲 Random Seats
          </button>
        )}

        <div className="players-grid">
          {[0, 1, 2, 3].map((seatPosition) => {
            const player = players.find(p => p.position === seatPosition);
            const isMyPosition = player?.id === playerInfo?.playerId;
            const canClick = !player || isMyPosition; // Can click if empty or own seat

            return (
              <div
                key={seatPosition}
                className={`player-slot ${player ? 'filled' : 'empty'} ${isMyPosition ? 'you' : ''} ${canClick ? 'clickable' : ''}`}
                onClick={() => handleSeatClick(seatPosition)}
              >
                <div className="position-label">{positions[seatPosition]}</div>
                {player ? (
                  <>
                    <div className="player-name">{player.name}</div>
                    <div className="ready-status ready">✓ Ready</div>
                    {isMyPosition && (
                      <div className="leave-seat-hint">Click to leave seat</div>
                    )}
                  </>
                ) : (
                  <div className="waiting-text">Click to sit here</div>
                )}
              </div>
            );
          })}
        </div>

        {hasSeat && !allSeated && (
          <div className="ready-message">
            ✓ You are seated! Waiting for other players...
          </div>
        )}

        {/* Game Settings - Turn Timer, Starting Round, Starting Wind, Debug Mode */}
        <div className="game-settings-row">
          <div className="game-setting">
            <label htmlFor="consider-time">⏱️ Turn Timer:</label>
            <select
              id="consider-time"
              value={considerTimeout}
              onChange={handleConsiderTimeChange}
              className="game-setting-select"
            >
              {[3, 4, 5, 6, 7, 8].map(time => (
                <option key={time} value={time}>{time}s</option>
              ))}
            </select>
          </div>
          <div className="game-setting">
            <label htmlFor="start-round">🎲 Starting 圈:</label>
            <select
              id="start-round"
              value={startRound}
              onChange={handleStartRoundChange}
              className="game-setting-select"
            >
              <option value="east">東圈</option>
              <option value="south">南圈</option>
              <option value="west">西圈</option>
              <option value="north">北圈</option>
            </select>
          </div>
          <div className="game-setting">
            <label htmlFor="start-wind">🀀 Starting 風:</label>
            <select
              id="start-wind"
              value={startWind}
              onChange={handleStartWindChange}
              className="game-setting-select"
            >
              <option value="east">東風</option>
              <option value="south">南風</option>
              <option value="west">西風</option>
              <option value="north">北風</option>
            </select>
          </div>
          <div className="game-setting game-setting-checkbox">
            <label htmlFor="debug-mode">
              <input
                type="checkbox"
                id="debug-mode"
                checked={debugMode}
                onChange={(e) => onSetDebugMode && onSetDebugMode(e.target.checked)}
                className="debug-mode-checkbox"
              />
              🐛 Debug Mode
            </label>
          </div>
        </div>

        {allSeated && isEastPlayer && (
          <button className="start-button" onClick={() => onStartGame(startRound, startWind)}>
            🎮 START GAME
          </button>
        )}

        {allSeated && !isEastPlayer && (
          <div className="waiting-message">
            ✓ All seated! Waiting for 東 to start the game...
          </div>
        )}
      </div>
    </div>
  );
}

export default LobbyScreen;

