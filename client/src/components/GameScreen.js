import React, { useState, useEffect } from 'react';
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
  onPong,
  onGang,
  onChow,
  onShang,
  dealerIndex = 0,
  playerWinds = {},
  revealedBonusTiles = {},
  hasDrawn = false,
  drawnTile = null,
  playerHandSizes = {},
  currentRound = 'east',
  currentWind = 'east',
  gamePhase = 'waiting',
  flowerReplacementPlayer = null,
  claimOptions = null,
  claimPeriodActive = false,
  pendingClaim = null,
  lastDiscardedTile = null,
  onClaimClose = null,
  onPass = null,
  onCancelClaim = null,
  onLeaveGame = null
}) {
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // Helper to convert wind/round to Chinese
  const windToChinese = (wind) => {
    const map = { east: '東', south: '南', west: '西', north: '北' };
    return map[wind] || wind;
  };

  // Helper to get phase display text
  const getPhaseDisplay = () => {
    if (gamePhase === 'flower_replacement') {
      return '補花中';
    } else if (gamePhase === 'draw_discard') {
      return '打牌';
    }
    return '';
  };

  const [selectedTile, setSelectedTile] = useState(null);

  const isMyTurn = currentPlayer === playerInfo?.playerId;

  // Get dealer player
  const dealerPlayer = players[dealerIndex];

  // Check if we're in the draw/discard phase
  const isDrawDiscardPhase = gamePhase === 'draw_discard';

  // Check if hand size is valid for discarding: 3n + 2 where n = 0-5
  // After drawing or claiming, hand should be: 17, 14, 11, 8, 5, or 2 tiles
  // (corresponding to 0, 1, 2, 3, 4, or 5 melds)
  const isValidHandSizeForDiscard = (handSize) => {
    return handSize >= 2 && handSize <= 17 && (handSize - 2) % 3 === 0;
  };

  // Player can discard when:
  // - It's their turn
  // - In draw_discard phase
  // - A tile is selected
  // - Hand size follows 3n + 2 pattern (ready to discard)
  const canDiscard = isMyTurn && isDrawDiscardPhase && selectedTile !== null && isValidHandSizeForDiscard(hand.length);

  // Can select tiles when it's my turn, in draw_discard phase, and hand size is valid
  const canSelectTiles = isMyTurn && isDrawDiscardPhase && isValidHandSizeForDiscard(hand.length);

  // Debug logging
  console.log('[GameScreen] isMyTurn:', isMyTurn, 'gamePhase:', gamePhase, 'hand.length:', hand.length, 'isValidHandSize:', isValidHandSizeForDiscard(hand.length), 'selectedTile:', selectedTile?.id, 'canDiscard:', canDiscard, 'canSelectTiles:', canSelectTiles);

  const handleTileClick = (tile) => {
    // Only allow tile selection when we have 17 tiles and it's our turn in draw_discard phase
    if (!canSelectTiles) {
      console.log('[GameScreen] Tile click blocked - canSelectTiles:', canSelectTiles);
      return;
    }

    if (selectedTile?.id === tile.id) {
      setSelectedTile(null);
    } else {
      setSelectedTile(tile);
    }
  };

  const handleDiscard = () => {
    if (canDiscard) {
      onDiscard(selectedTile);
      setSelectedTile(null);
    }
  };

  // Sort hand by suit and value, excluding the drawn tile
  // Order: 1-9 sou (bamboo) > 1-9 man (character) > 1-9 pin (dot) > 東南西北 (wind) > 中發白 (dragon)
  const sortHand = (tiles) => {
    return [...tiles].sort((a, b) => {
      const suitOrder = { bamboo: 0, character: 1, dot: 2, wind: 3, dragon: 4, flower: 5, season: 6 };
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      // For numbered tiles (bamboo, character, dot), sort by value 1-9
      if (typeof a.value === 'number' && typeof b.value === 'number') {
        return a.value - b.value;
      }
      // For wind tiles, sort by 東南西北 order
      if (a.suit === 'wind' && b.suit === 'wind') {
        const windOrder = { east: 0, south: 1, west: 2, north: 3 };
        return (windOrder[a.value] ?? 99) - (windOrder[b.value] ?? 99);
      }
      // For dragon tiles, sort by 中發白 order
      if (a.suit === 'dragon' && b.suit === 'dragon') {
        const dragonOrder = { red: 0, green: 1, white: 2 };
        return (dragonOrder[a.value] ?? 99) - (dragonOrder[b.value] ?? 99);
      }
      return 0;
    });
  };

  // Separate the drawn tile from the rest of the hand
  // Only show drawn tile separately if it exists in the hand
  const drawnTileInHand = drawnTile ? hand.find(tile => tile.id === drawnTile.id) : null;
  const handWithoutDrawn = drawnTileInHand
    ? hand.filter(tile => tile.id !== drawnTile.id)
    : hand;
  const sortedHand = sortHand(handWithoutDrawn);

  // Get my position (seat)
  const myPosition = players.find(p => p.id === playerInfo?.playerId)?.position ?? 0;

  // Calculate relative positions (anti-clockwise order: 東→南→西→北)
  // From my perspective:
  // - Right (下家): next in anti-clockwise = (myPosition + 1) % 4
  // - Opposite (對家): across = (myPosition + 2) % 4
  // - Left (上家): previous in anti-clockwise = (myPosition + 3) % 4
  const rightPosition = (myPosition + 1) % 4;
  const topPosition = (myPosition + 2) % 4;
  const leftPosition = (myPosition + 3) % 4;

  const rightPlayer = players.find(p => p.position === rightPosition);
  const topPlayer = players.find(p => p.position === topPosition);
  const leftPlayer = players.find(p => p.position === leftPosition);

  // Determine if a player is currently active (their turn or doing flower replacement)
  const isPlayerActive = (playerId) => {
    if (gamePhase === 'flower_replacement') {
      return flowerReplacementPlayer === playerId;
    }
    return currentPlayer === playerId;
  };

  // Render top player area
  const renderTopPlayerArea = (player) => {
    if (!player) return null;
    const isActive = isPlayerActive(player.id);
    const tileCount = playerHandSizes[player.id] !== undefined ? playerHandSizes[player.id] : 16;
    const playerBonusTiles = revealedBonusTiles[player.id] || [];
    const playerMelds = melds[player.id] || [];

    const isDoingFlowerReplacement = gamePhase === 'flower_replacement' && flowerReplacementPlayer === player.id;
    return (
      <div className={`player-hand player-hand-top ${isActive ? 'current-turn' : ''} ${isDoingFlowerReplacement ? 'flower-replacement' : ''}`}>
        <div className="top-player-tiles-container">
          {/* Hand tiles */}
          <div className="player-tiles player-tiles-top">
            {Array.from({ length: Math.min(tileCount, 16) }).map((_, idx) => (
              <div key={idx} className="tile-back" />
            ))}
          </div>
          {/* Player Disk - bonus tiles first (left), then melds (right) */}
          {(playerBonusTiles.length > 0 || playerMelds.length > 0) && (
            <div className="player-disk player-disk-top">
              {/* Bonus tiles (flowers/seasons) - always first on left */}
              {playerBonusTiles.length > 0 && (
                <div className="bonus-tiles-group">
                  {playerBonusTiles.map((tile, idx) => (
                    <Tile key={`bonus-${idx}`} tile={tile} />
                  ))}
                </div>
              )}
              {/* Melds - added to right in order claimed */}
              {playerMelds.map((meld, meldIdx) => (
                <div key={`meld-${meldIdx}`} className="meld-group">
                  {meld.tiles.map((tile, tileIdx) => (
                    <Tile key={`meld-${meldIdx}-tile-${tileIdx}`} tile={tile} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render side player area (left or right) - hand and disk in two columns
  const renderSidePlayerArea = (player, position) => {
    if (!player) return null;
    const isActive = isPlayerActive(player.id);
    const tileCount = playerHandSizes[player.id] !== undefined ? playerHandSizes[player.id] : 16;
    const playerBonusTiles = revealedBonusTiles[player.id] || [];
    const playerMelds = melds[player.id] || [];

    const isDoingFlowerReplacement = gamePhase === 'flower_replacement' && flowerReplacementPlayer === player.id;

    const hasDiskContent = playerBonusTiles.length > 0 || playerMelds.length > 0;

    // For left player: disk on right (closer to center), hand on left (closer to edge)
    // For right player: disk on left (closer to center), hand on right (closer to edge)
    // Disk order: bonus tiles (flowers/seasons) at perspective left, then melds at perspective right
    // Left player: perspective left = top, so bonus tiles first (top), melds after (bottom)
    // Right player: perspective left = bottom, so melds first (top), bonus tiles after (bottom)
    const diskColumn = (
      <div className={`player-disk player-disk-${position}`}>
        {position === 'left' ? (
          <>
            {/* Left player: bonus tiles at top (perspective left), melds at bottom */}
            {playerBonusTiles.length > 0 && (
              <div className="bonus-tiles-group">
                {playerBonusTiles.map((tile, idx) => (
                  <Tile key={`bonus-${idx}`} tile={tile} />
                ))}
              </div>
            )}
            {playerMelds.map((meld, meldIdx) => (
              <div key={`meld-${meldIdx}`} className="meld-group">
                {meld.tiles.map((tile, tileIdx) => (
                  <Tile key={`meld-${meldIdx}-tile-${tileIdx}`} tile={tile} />
                ))}
              </div>
            ))}
          </>
        ) : (
          <>
            {/* Right player: melds at top, bonus tiles at bottom (perspective left) */}
            {playerMelds.map((meld, meldIdx) => (
              <div key={`meld-${meldIdx}`} className="meld-group">
                {meld.tiles.map((tile, tileIdx) => (
                  <Tile key={`meld-${meldIdx}-tile-${tileIdx}`} tile={tile} />
                ))}
              </div>
            ))}
            {playerBonusTiles.length > 0 && (
              <div className="bonus-tiles-group">
                {playerBonusTiles.map((tile, idx) => (
                  <Tile key={`bonus-${idx}`} tile={tile} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );

    const handColumn = (
      <div className={`player-tiles player-tiles-${position}`}>
        {Array.from({ length: Math.min(tileCount, 16) }).map((_, idx) => (
          <div key={idx} className="tile-back" />
        ))}
      </div>
    );

    return (
      <div className={`player-area-${position} ${isActive ? 'current-turn' : ''} ${isDoingFlowerReplacement ? 'flower-replacement' : ''}`}>
        <div className={`side-player-tiles-container side-player-tiles-container-${position}`}>
          {position === 'left' ? (
            <>
              {handColumn}
              {hasDiskContent && diskColumn}
            </>
          ) : (
            <>
              {hasDiskContent && diskColumn}
              {handColumn}
            </>
          )}
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
            <span className="discard-area-label">{leftPlayer?.name} ({windToChinese(playerWinds[leftPlayer?.id])}){leftPlayer?.id === dealerPlayer?.id && ' 莊'}</span>
            <div className="discard-tiles-inner">
              {(discardPiles[leftPlayer?.id] || []).map((tile, idx) => (
                <Tile key={idx} tile={tile} size="small" />
              ))}
            </div>
          </div>

          {/* Center Column: Top Discard, Game Info, Bottom Discard */}
          <div className="center-column">
            {/* Top Discard (對家) */}
            <div className="discard-area discard-area-top">
              <span className="discard-area-label">{topPlayer?.name} ({windToChinese(playerWinds[topPlayer?.id])}){topPlayer?.id === dealerPlayer?.id && ' 莊'}</span>
              <div className="discard-tiles-inner">
                {(discardPiles[topPlayer?.id] || []).map((tile, idx) => (
                  <Tile key={idx} tile={tile} size="small" />
                ))}
              </div>
            </div>

            {/* Game Info */}
            <div className="game-info">
              <div className="game-info-item">
                <span className="game-info-label">圈風:</span>
                <span className="game-info-value">{windToChinese(currentRound)}圈{windToChinese(currentWind)}風</span>
              </div>
              <div className="game-info-item">
                <span className="game-info-label">牌:</span>
                <span className="game-info-value">{tilesRemaining}</span>
              </div>
              <div className="game-info-item">
                <span className="game-info-label">莊:</span>
                <span className="game-info-value">{dealerPlayer?.name || '-'}</span>
              </div>
              <div className="game-info-item">
                {gamePhase === 'flower_replacement' ? (
                  <span className="game-info-value phase-flower-replacement">
                    補花中<span className="loading-dots"></span>
                  </span>
                ) : (
                  <span className="game-info-value phase-normal">{getPhaseDisplay()}</span>
                )}
              </div>
            </div>

            {/* Bottom Discard (自己) */}
            <div className="discard-area discard-area-bottom">
              <span className="discard-area-label">{playerInfo?.name} ({windToChinese(playerWinds[playerInfo?.playerId])}){playerInfo?.playerId === dealerPlayer?.id && ' 莊'}</span>
              {(discardPiles[playerInfo?.playerId] || []).map((tile, idx) => (
                <Tile key={idx} tile={tile} size="small" />
              ))}
            </div>
          </div>

          {/* Right Discard (下家) */}
          <div className="discard-area discard-area-right">
            <span className="discard-area-label">{rightPlayer?.name} ({windToChinese(playerWinds[rightPlayer?.id])}){rightPlayer?.id === dealerPlayer?.id && ' 莊'}</span>
            <div className="discard-tiles-inner">
              {(discardPiles[rightPlayer?.id] || []).map((tile, idx) => (
                <Tile key={idx} tile={tile} size="small" />
              ))}
            </div>
          </div>
        </div>

        {renderSidePlayerArea(rightPlayer, 'right')}
      </div>

      {/* Bottom Bar - My Hand + Action Buttons (independent of grid above) */}
      <div className="game-screen-bottom">
        {(() => {
          const isMyActive = isPlayerActive(playerInfo?.playerId);
          const isMyFlowerReplacement = gamePhase === 'flower_replacement' && flowerReplacementPlayer === playerInfo?.playerId;
          const myBonusTiles = revealedBonusTiles[playerInfo?.playerId] || [];
          const myMelds = melds[playerInfo?.playerId] || [];
          return (
            <div className={`player-hand player-hand-bottom ${isMyActive ? 'current-turn' : ''} ${isMyFlowerReplacement ? 'flower-replacement' : ''}`}>
              {/* Revealed Bonus Tiles and Melds - bonus tiles first (left), then melds (right) */}
              {(myBonusTiles.length > 0 || myMelds.length > 0) && (
                <div className="revealed-bonus-tiles">
                  {/* Bonus tiles (flowers/seasons) - always first on left */}
                  {myBonusTiles.length > 0 && (
                    <div className="bonus-tiles-group">
                      {myBonusTiles.map((tile, idx) => (
                        <Tile key={`bonus-${idx}`} tile={tile} size="small" />
                      ))}
                    </div>
                  )}
                  {/* Melds - added to right in order claimed */}
                  {myMelds.map((meld, meldIdx) => (
                    <div key={`meld-${meldIdx}`} className="meld-group">
                      {meld.tiles.map((tile, tileIdx) => (
                        <Tile key={`meld-${meldIdx}-tile-${tileIdx}`} tile={tile} size="small" />
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <div className="my-hand">
                {sortedHand.map((tile) => (
                  <Tile
                    key={tile.id}
                    tile={tile}
                    selected={selectedTile?.id === tile.id}
                    onClick={() => handleTileClick(tile)}
                    disabled={!canSelectTiles}
                  />
                ))}
                {/* Drawn tile shown separately with a gap */}
                {drawnTileInHand && (
                  <div className="drawn-tile-separator">
                    <Tile
                      key={drawnTileInHand.id}
                      tile={drawnTileInHand}
                      selected={selectedTile?.id === drawnTileInHand.id}
                      onClick={() => handleTileClick(drawnTileInHand)}
                      disabled={!canSelectTiles}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Action Buttons */}
        <div className="bottom-actions">
          <div className="player-actions">
            <button className="action-btn" onClick={handleDiscard} disabled={!canDiscard}>打牌</button>
            <button className="action-btn" disabled>聽</button>
            <button className="action-btn action-btn-hu" onClick={onHu} disabled>食</button>
            <button className="action-btn action-btn-leave" onClick={() => setShowLeaveConfirm(true)}>離開</button>
          </div>
        </div>
      </div>

      {/* Leave Confirmation Popup */}
      {showLeaveConfirm && (
        <div className="leave-confirm-overlay">
          <div className="leave-confirm-popup">
            <div className="leave-confirm-message">確定要離開遊戲嗎？</div>
            <div className="leave-confirm-warning">離開後遊戲將結束，所有玩家將返回大廳。</div>
            <div className="leave-confirm-buttons">
              <button className="leave-confirm-btn leave-confirm-cancel" onClick={() => setShowLeaveConfirm(false)}>取消</button>
              <button className="leave-confirm-btn leave-confirm-yes" onClick={() => { setShowLeaveConfirm(false); onLeaveGame && onLeaveGame(); }}>確定離開</button>
            </div>
          </div>
        </div>
      )}

      {/* Claim Popup - shown during freeze period when player has claim options */}
      {claimPeriodActive && claimOptions && (
        <ClaimPopup
          claimOptions={claimOptions}
          pendingClaim={pendingClaim}
          onShang={onShang}
          onPong={onPong}
          onGang={onGang}
          onHu={onHu}
          lastDiscardedTile={lastDiscardedTile}
          onClose={onClaimClose}
          onPass={onPass}
          onCancelClaim={onCancelClaim}
        />
      )}
    </div>
  );
}

// Claim Popup Component
function ClaimPopup({ claimOptions, pendingClaim, onShang, onPong, onGang, onHu, lastDiscardedTile, onClose, onPass, onCancelClaim }) {
  const [timeLeft, setTimeLeft] = useState(Math.ceil((claimOptions?.timeout || 5000) / 1000));
  const [selectedClaim, setSelectedClaim] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto-close when timer reaches 0
          if (onClose) {
            onClose();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onClose]);

  const possibleClaims = claimOptions?.possibleClaims || [];
  const hasAnyClaim = possibleClaims.length > 0 || claimOptions?.canHu;

  if (!hasAnyClaim) return null;

  // Get claim type label
  const getClaimLabel = (type) => {
    switch (type) {
      case 'chow': return '上';
      case 'pong': return '碰';
      case 'gang': return '槓';
      case 'hu': return '食';
      default: return type;
    }
  };

  // Check if two claims are the same (for toggle comparison)
  const isSameClaim = (claim1, claim2) => {
    if (!claim1 || !claim2) return false;
    if (claim1.type !== claim2.type) return false;
    // Compare tiles if available
    if (claim1.tiles && claim2.tiles) {
      if (claim1.tiles.length !== claim2.tiles.length) return false;
      return claim1.tiles.every((t, i) =>
        t.suit === claim2.tiles[i]?.suit && t.value === claim2.tiles[i]?.value
      );
    }
    return claim1 === claim2;
  };

  // Handle claim selection - toggle if clicking same claim
  const handleClaimClick = (claim) => {
    // If clicking the same claim, cancel it
    if (isSameClaim(selectedClaim, claim)) {
      setSelectedClaim(null);
      if (onCancelClaim) {
        onCancelClaim();
      }
      return;
    }

    setSelectedClaim(claim);

    // Call the appropriate handler with the claim data
    switch (claim.type) {
      case 'chow':
        onShang(claim);
        break;
      case 'pong':
        onPong(claim);
        break;
      case 'gang':
        onGang(claim);
        break;
      case 'hu':
        onHu(claim);
        break;
      default:
        break;
    }
  };

  // Handle pass button click
  const handlePassClick = () => {
    setSelectedClaim(null);
    if (onPass) {
      onPass();
    }
    if (onClose) {
      onClose();
    }
  };

  // Render tiles for a claim set - show displayTiles if available, otherwise tiles
  const renderClaimTiles = (claim) => {
    const tilesToShow = claim.displayTiles || claim.tiles || [];
    return (
      <div className="claim-tiles-preview">
        {tilesToShow.map((tile, idx) => (
          <Tile key={idx} tile={tile} size="small" />
        ))}
      </div>
    );
  };

  return (
    <div className="claim-popup-overlay">
      <div className="claim-popup">
        <div className="claim-popup-header">
          <span className="claim-popup-timer">{timeLeft}s</span>
        </div>

        <div className="claim-options-list">
          {possibleClaims.map((claim, idx) => (
            <button
              key={idx}
              className={`claim-option-btn ${isSameClaim(selectedClaim, claim) ? 'claim-option-selected' : ''} ${claim.type === 'hu' ? 'claim-option-hu' : ''}`}
              onClick={() => handleClaimClick(claim)}
            >
              <span className="claim-option-label">{getClaimLabel(claim.type)}</span>
              {renderClaimTiles(claim)}
            </button>
          ))}

          {claimOptions?.canHu && lastDiscardedTile && (
            <button
              className={`claim-option-btn claim-option-hu ${selectedClaim?.type === 'hu' ? 'claim-option-selected' : ''}`}
              onClick={() => handleClaimClick({ type: 'hu', tiles: [lastDiscardedTile] })}
            >
              <span className="claim-option-label">食</span>
              <div className="claim-tiles-preview">
                <Tile tile={lastDiscardedTile} size="small" />
              </div>
            </button>
          )}
        </div>

        {/* Pass button */}
        <button className="claim-pass-btn" onClick={handlePassClick}>
          唔要
        </button>

        {(pendingClaim || selectedClaim) && (
          <div className="claim-popup-status">
            已選擇: {getClaimLabel(selectedClaim?.type || pendingClaim)}
          </div>
        )}
      </div>
    </div>
  );
}

export default GameScreen;

