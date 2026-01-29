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

  // Render player hand and own disk area
  const renderPlayerArea = (player, position) => {
    if (!player) return null;

    const isActive = currentPlayer === player.id;
    const playerMelds = melds[player.id] || [];
    const playerDiscards = discardPiles[player.id] || [];
    // Get real-time tile count for this player
    const tileCount = playerHandSizes[player.id] !== undefined ? playerHandSizes[player.id] : 16;

    return (
      <div className={`${position}-discard-area`}>
        {/* Player Hand (private) */}
        <div className="player-hand-area">
          <div className="player-info-header">
            <div className="player-avatar">
              {player.name.charAt(0).toUpperCase()}
            </div>
            <div className="player-info">
              <div className={`player-name ${isActive ? 'active' : ''}`}>
                {player.name}
              </div>
              <div className="tile-count">{tileCount} tiles</div>
            </div>
          </div>

          {/* Face-down tiles for opponents */}
          <div className="player-tiles">
            {Array.from({ length: Math.min(tileCount, 16) }).map((_, idx) => (
              <div key={idx} className="tile-back" />
            ))}
          </div>

          {/* Player's melds */}
          {playerMelds.length > 0 && (
            <div className="player-melds">
              {playerMelds.map((meld, idx) => (
                <div key={idx} className={`meld meld-${meld.type}`}>
                  <span className="meld-type">
                    {meld.type === 'pong' ? '碰' : meld.type === 'gang' ? '槓' : '吃'}
                  </span>
                  {meld.tiles.map((tile, tileIdx) => (
                    <Tile key={tileIdx} tile={tile} size="small" />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Player Own Disk (public discards) */}
        {playerDiscards.length > 0 && (
          <div className="player-own-disk">
            <div className="own-disk-label">{player.name}'s Discards</div>
            {playerDiscards.map((tile, idx) => (
              <Tile key={idx} tile={tile} size="small" />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="game-screen">
      {/* Top Player - Hand and Own Disk */}
      {renderPlayerArea(topPlayer, 'top')}

      {/* Left Player - Hand and Own Disk */}
      {renderPlayerArea(leftPlayer, 'left')}

      {/* Center Area - Supply Disk (hidden tiles) */}
      <div className="center-area">
        <div className="supply-disk">
          {/* Wind Positions Display (東南西北) */}
          <div className="wind-positions">
            {players.map((player, idx) => {
              const wind = playerWinds[player.id] || '';
              const windChar = {
                'east': '東',
                'south': '南',
                'west': '西',
                'north': '北'
              }[wind] || '';
              const isDealer = dealerPlayer?.id === player.id;

              return (
                <div
                  key={player.id}
                  className={`wind-indicator ${isDealer ? 'dealer' : ''}`}
                  title={`${player.name} - ${windChar} ${isDealer ? '(莊)' : ''}`}
                >
                  <span className="wind-char">{windChar}</span>
                  {isDealer && <span className="dealer-marker">莊</span>}
                </div>
              );
            })}
          </div>

          <div className="supply-disk-icon">🀫</div>
          <div className="game-info">
            <div className="tiles-remaining">
              {tilesRemaining} tiles remaining
            </div>
            <div className="turn-indicator">
              {isMyTurn ? (
                <span className="your-turn">🎯 Your Turn!</span>
              ) : (
                <span className="waiting">{currentPlayerName}'s turn</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Player - Hand and Own Disk */}
      {renderPlayerArea(rightPlayer, 'right')}

      {/* Bottom Player (Current User) - Hand and Own Disk */}
      <div className="bottom-discard-area">
        {/* My Own Disk (my discards) */}
        {discardPiles[playerInfo?.playerId] && discardPiles[playerInfo.playerId].length > 0 && (
          <div className="player-own-disk">
            <div className="own-disk-label">Your Discards</div>
            {discardPiles[playerInfo.playerId].map((tile, idx) => (
              <Tile key={idx} tile={tile} size="small" />
            ))}
          </div>
        )}

        {/* My Hand (private) */}
        <div className="my-hand-area">
          <div className="my-hand-header">
            <div className="hand-label">Your Hand ({sortedHand.length} tiles)</div>

            {/* My Melds */}
            {melds[playerInfo?.playerId] && melds[playerInfo.playerId].length > 0 && (
              <div className="my-melds-container">
                {melds[playerInfo.playerId].map((meld, idx) => (
                  <div key={idx} className={`meld meld-${meld.type}`}>
                    <span className="meld-type">
                      {meld.type === 'pong' ? '碰' : meld.type === 'gang' ? '槓' : '吃'}
                    </span>
                    {meld.tiles.map((tile, tileIdx) => (
                      <Tile key={tileIdx} tile={tile} size="small" />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* My Hand */}
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

          {/* Actions */}
          <div className="actions">
            {/* Draw button - only show when it's player's turn and they haven't drawn */}
            {canDraw && (
              <button
                className="action-button draw-button"
                onClick={handleDraw}
              >
                摸牌 Draw
              </button>
            )}

            {/* Discard button - only enabled when a tile is selected and player has drawn */}
            {hasDrawn && (
              <button
                className="action-button discard-button"
                onClick={handleDiscard}
                disabled={!canDiscard}
              >
                打出 Discard
              </button>
            )}

            <button
              className="action-button hu-button"
              onClick={handleHu}
              disabled={!isMyTurn}
            >
              胡 Hu!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameScreen;

