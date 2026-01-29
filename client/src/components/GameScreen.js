import React, { useState } from 'react';
import './GameScreen.css';
import Tile from './Tile';

function GameScreen({
  hand,
  players,
  playerInfo,
  currentPlayer,
  discardPiles,
  melds = {},
  tilesRemaining,
  onDiscard,
  onHu,
  onDraw,
  dealerIndex = 0,
  playerWinds = {},
  revealedBonusTiles = {},
  hasDrawn = false,
  playerHandSizes = {}
}) {
  const [selectedTile, setSelectedTile] = useState(null);

  const isMyTurn = currentPlayer === playerInfo?.playerId;
  const currentPlayerName = players.find(p => p.id === currentPlayer)?.name || '';

  // Get dealer player
  const dealerPlayer = players[dealerIndex];

  // Determine if player can draw (it's their turn and they haven't drawn yet)
  const canDraw = isMyTurn && !hasDrawn && hand.length === 16;

  // Determine if player can discard (it's their turn, they have drawn, and a tile is selected)
  const canDiscard = isMyTurn && hasDrawn && selectedTile && hand.length === 17;

  const handleTileClick = (tile) => {
    // Only allow tile selection after drawing (when hand has 17 tiles)
    if (!isMyTurn || !hasDrawn || hand.length !== 17) return;

    if (selectedTile?.id === tile.id) {
      setSelectedTile(null);
    } else {
      setSelectedTile(tile);
    }
  };

  const handleDraw = () => {
    if (canDraw && onDraw) {
      onDraw();
    }
  };

  const handleDiscard = () => {
    if (canDiscard) {
      onDiscard(selectedTile);
      setSelectedTile(null);
    }
  };

  const handleHu = () => {
    if (isMyTurn) {
      onHu();
    }
  };

  // Sort hand by suit and value
  const sortedHand = [...hand].sort((a, b) => {
    const suitOrder = { bamboo: 0, character: 1, dot: 2, wind: 3, dragon: 4, flower: 5, season: 6 };
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    if (typeof a.value === 'number' && typeof b.value === 'number') {
      return a.value - b.value;
    }
    return 0;
  });

  // Get other players in position order (top, left, right)
  const otherPlayers = players.filter(p => p.id !== playerInfo?.playerId);
  const topPlayer = otherPlayers[0];
  const leftPlayer = otherPlayers[1];
  const rightPlayer = otherPlayers[2];

  // Render top player area
  const renderTopPlayerArea = (player) => {
    if (!player) return null;
    const isActive = currentPlayer === player.id;
    const tileCount = playerHandSizes[player.id] !== undefined ? playerHandSizes[player.id] : 16;

    return (
      <div className="player-hand player-hand-top">
        <div className="player-info-compact">
          <span className={`player-name-compact ${isActive ? 'active' : ''}`}>{player.name}</span>
        </div>
        <div className="player-tiles player-tiles-top">
          {Array.from({ length: Math.min(tileCount, 16) }).map((_, idx) => (
            <div key={idx} className="tile-back" />
          ))}
        </div>
      </div>
    );
  };

  // Render side player area (left or right) - hand only
  const renderSidePlayerArea = (player, position) => {
    if (!player) return null;
    const isActive = currentPlayer === player.id;
    const tileCount = playerHandSizes[player.id] !== undefined ? playerHandSizes[player.id] : 16;

    return (
      <div className={`player-area-${position}`}>
        <div className={`side-player-info side-player-info-${position}`}>
          <span className={`player-name-compact ${isActive ? 'active' : ''}`}>{player.name}</span>
        </div>
        <div className={`player-tiles player-tiles-${position}`}>
          {Array.from({ length: Math.min(tileCount, 16) }).map((_, idx) => (
            <div key={idx} className="tile-back" />
          ))}
        </div>
      </div>
    );
  };



  return (
    <div className="game-screen">
      {/* Top Area - Left, Center, Right players (uses grid) */}
      <div className="game-screen-top">
        {/* Left Area - 上家 (spans from top to middle) */}
        {renderSidePlayerArea(leftPlayer, 'left')}

        {/* Top Center - 對家 Hand */}
        {renderTopPlayerArea(topPlayer)}

        {/* Center - Game Info and All 4 Discard Areas */}
        <div className="center-area">
          {/* Left Discard (上家) */}
          <div className="discard-area discard-area-left">
            {(discardPiles[leftPlayer?.id] || []).map((tile, idx) => (
              <Tile key={idx} tile={tile} size="small" />
            ))}
          </div>

          {/* Center Column: Top Discard, Game Info, Bottom Discard */}
          <div className="center-column">
            {/* Top Discard (對家) */}
            <div className="discard-area discard-area-top">
              {(discardPiles[topPlayer?.id] || []).map((tile, idx) => (
                <Tile key={idx} tile={tile} size="small" />
              ))}
            </div>

            {/* Game Info */}
            <div className="game-info">
              <div className="game-info-item">
                <span className="game-info-label">牌:</span>
                <span className="game-info-value">{tilesRemaining}</span>
              </div>
              <div className="game-info-item">
                <span className="game-info-label">莊:</span>
                <span className="game-info-value">{dealerPlayer?.name || '-'}</span>
              </div>
              <div className="game-info-item">
                {isMyTurn ? (
                  <span className="game-info-value highlight">🎯 輪到你</span>
                ) : (
                  <span className="game-info-value">{currentPlayerName}</span>
                )}
              </div>
            </div>

            {/* Bottom Discard (自己) */}
            <div className="discard-area discard-area-bottom">
              {(discardPiles[playerInfo?.playerId] || []).map((tile, idx) => (
                <Tile key={idx} tile={tile} size="small" />
              ))}
            </div>
          </div>

          {/* Right Discard (下家) */}
          <div className="discard-area discard-area-right">
            {(discardPiles[rightPlayer?.id] || []).map((tile, idx) => (
              <Tile key={idx} tile={tile} size="small" />
            ))}
          </div>
        </div>

        {renderSidePlayerArea(rightPlayer, 'right')}
      </div>

      {/* Bottom Bar - My Hand + Action Buttons (independent of grid above) */}
      <div className="game-screen-bottom">
        <div className="player-hand player-hand-bottom">
          <div className="my-hand">
            {sortedHand.map((tile) => (
              <Tile
                key={tile.id}
                tile={tile}
                selected={selectedTile?.id === tile.id}
                onClick={() => handleTileClick(tile)}
                disabled={!isMyTurn}
              />
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bottom-actions">
          <div className="player-actions">
            <button className="action-btn" onClick={handleDraw} disabled={!canDraw}>摸牌</button>
            <button className="action-btn" onClick={handleDiscard} disabled={!selectedTile || !isMyTurn}>打牌</button>
            <button className="action-btn" disabled>吃</button>
            <button className="action-btn" disabled>碰</button>
            <button className="action-btn" disabled>槓</button>
            <button className="action-btn" disabled>聽</button>
            <button className="action-btn action-btn-hu" onClick={handleHu} disabled={!isMyTurn}>胡</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameScreen;

