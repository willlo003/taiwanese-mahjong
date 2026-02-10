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
  onSelfHu,
  onPong,
  onGang,
  onChow,
  onShang,
  dealerIndex = 0,
  dealerId = null,
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
  canSelfDrawWin = false,
  selfDrawWinCombinations = [],
  canSelfGang = false,
  selfGangCombinations = [],
  onSelfGang = null,
  onTing = null,
  isTing = false,
  tingPlayers = {},
  mustDiscardDrawnTile = false,
  onClaimClose = null,
  onPass = null,
  onCancelClaim = null,
  onLeaveGame = null,
  revealedHands = {},
  showResultPopup = false,
  gameResult = null,
  readyPlayers = [],
  onResultReady = null,
  onResultLeave = null,
  winningTile = null,
  winningCombination = null,
  isRobGang = false,
  robGangTile = null,
  turnTimerPlayerId = null,
  turnTimerEnd = null
}) {
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showSelfDrawWinPopup, setShowSelfDrawWinPopup] = useState(false);
  const [showSelfGangPopup, setShowSelfGangPopup] = useState(false);
  const [turnTimeLeft, setTurnTimeLeft] = useState(null);
  const [isReady, setIsReady] = useState(false);

  // Reset isReady when result popup is closed (new game starting)
  useEffect(() => {
    if (!showResultPopup) {
      setIsReady(false);
    }
  }, [showResultPopup]);

  // Turn timer countdown effect
  useEffect(() => {
    // Stop timer if game is in result phase (phase 3)
    if (gamePhase === 'result' || showResultPopup) {
      setTurnTimeLeft(null);
      return;
    }

    if (!turnTimerEnd || !turnTimerPlayerId) {
      setTurnTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((turnTimerEnd - Date.now()) / 1000));
      setTurnTimeLeft(remaining);
    };

    // Update immediately
    updateTimer();

    // Update every 100ms for smooth countdown
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [turnTimerEnd, turnTimerPlayerId, gamePhase, showResultPopup]);

  // Helper to convert wind/round to Chinese
  const windToChinese = (wind) => {
    const map = { east: '東', south: '南', west: '西', north: '北' };
    return map[wind] || wind;
  };

  // Helper to convert position (0,1,2,3) to Chinese wind (東南西北)
  const positionToWind = (position) => {
    const map = { 0: '東', 1: '南', 2: '西', 3: '北' };
    return map[position] || '';
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

  // Helper to check if a tile matches the winning tile
  const isWinningTile = (tile, winTile) => {
    if (!winTile || !tile) return false;
    return tile.suit === winTile.suit && tile.value === winTile.value;
  };

  // Helper to check if a meld contains the robbed gang tile (for 搶槓)
  const isRobbedGangMeld = (meld, playerId) => {
    if (!isRobGang || !robGangTile || !showResultPopup) return false;
    // Only highlight the loser's (gang player's) meld
    const loserId = gameResult?.loser;
    if (playerId !== loserId) return false;
    // Check if this meld is a gang that contains the robbed tile
    if (meld.type !== 'gang') return false;
    return meld.tiles.some(t => t.suit === robGangTile.suit && t.value === robGangTile.value);
  };

  // Helper to render winner's hand grouped by winning combination
  // reverseGroups: true for right player (bottom to top) and top player (right to left)
  const renderGroupedWinnerHand = (handTiles, combination, rotated = false, winTile = null, reverseGroups = false) => {
    // Debug logging
    console.log('[RENDER] renderGroupedWinnerHand called with winTile:', winTile);

    // Track if we've already highlighted the winning tile (only highlight one)
    let winningTileHighlighted = false;

    const getTileClassName = (tile) => {
      if (winTile && isWinningTile(tile, winTile) && !winningTileHighlighted) {
        winningTileHighlighted = true;
        return "revealed-tile winning-tile";
      }
      return "revealed-tile";
    };

    if (!combination || (!combination.sets && !combination.pairs)) {
      // No combination info, just render tiles normally
      return handTiles.map((tile, idx) => (
        <Tile key={idx} tile={tile} className={getTileClassName(tile)} rotated={rotated} />
      ));
    }

    const groups = [];
    const usedTileIds = new Set();

    // Add sets (pong/chow)
    if (combination.sets) {
      combination.sets.forEach((set, setIdx) => {
        if (set && set.tiles) {
          // Reverse tiles within group for right player (bottom to top) and top player (right to left)
          const orderedTiles = reverseGroups ? [...set.tiles].reverse() : set.tiles;
          groups.push(
            <div key={`set-${setIdx}`} className="winner-hand-group">
              {orderedTiles.map((tile, tileIdx) => {
                usedTileIds.add(tile.id);
                return <Tile key={tileIdx} tile={tile} className={getTileClassName(tile)} rotated={rotated} />;
              })}
            </div>
          );
        }
      });
    }

    // Add pairs (for 嚦咕嚦咕 pattern)
    if (combination.pairs) {
      combination.pairs.forEach((pair, pairIdx) => {
        if (pair && pair.tiles) {
          // Reverse tiles within group for right player (bottom to top) and top player (right to left)
          const orderedTiles = reverseGroups ? [...pair.tiles].reverse() : pair.tiles;
          groups.push(
            <div key={`pair-${pairIdx}`} className="winner-hand-group">
              {orderedTiles.map((tile, tileIdx) => {
                usedTileIds.add(tile.id);
                return <Tile key={tileIdx} tile={tile} className={getTileClassName(tile)} rotated={rotated} />;
              })}
            </div>
          );
        }
      });
    }

    // Add the pair (眼) for standard pattern
    if (combination.pair && combination.pair.tiles) {
      // Reverse tiles within group for right player (bottom to top) and top player (right to left)
      const orderedTiles = reverseGroups ? [...combination.pair.tiles].reverse() : combination.pair.tiles;
      groups.push(
        <div key="pair" className="winner-hand-group winner-hand-pair">
          {orderedTiles.map((tile, tileIdx) => {
            usedTileIds.add(tile.id);
            return <Tile key={tileIdx} tile={tile} className={getTileClassName(tile)} rotated={rotated} />;
          })}
        </div>
      );
    }

    // Reverse groups for right player (bottom to top) and top player (right to left)
    return reverseGroups ? groups.reverse() : groups;
  };

  // Helper to get the winning combination for a specific player
  // winningCombination can be either:
  // - A single combination object (for single winner)
  // - A map of playerId -> combination (for multiple winners)
  const getPlayerCombination = (playerId) => {
    if (!winningCombination) return null;

    // Check if it's a map (has playerId keys) or a single combination
    if (winningCombination.sets !== undefined || winningCombination.pairs !== undefined || winningCombination.pair !== undefined) {
      // It's a single combination object
      return winningCombination;
    }

    // It's a map of playerId -> combination
    return winningCombination[playerId] || null;
  };

  const [selectedTile, setSelectedTile] = useState(null);
  const [tingEnabled, setTingEnabled] = useState(false); // Local toggle for 聽 before discard

  // Reset tingEnabled and close popups when turn changes or when it's no longer our turn
  useEffect(() => {
    if (currentPlayer !== playerInfo?.playerId) {
      setTingEnabled(false);
      // Force close popups when turn changes (e.g., after auto-discard on timeout)
      setShowSelfDrawWinPopup(false);
      setShowSelfGangPopup(false);
    }
  }, [currentPlayer, playerInfo?.playerId]);

  // Close popups when claim period starts (e.g., after auto-discard during freeze period)
  useEffect(() => {
    if (claimPeriodActive) {
      setShowSelfDrawWinPopup(false);
      setShowSelfGangPopup(false);
    }
  }, [claimPeriodActive]);

  const isMyTurn = currentPlayer === playerInfo?.playerId;

  // Get dealer player by ID (not by index, to handle reconnections correctly)
  const dealerPlayer = dealerId ? players.find(p => p.id === dealerId) : players[dealerIndex];

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

  // Debug logging - show all conditions for canSelectTiles
  console.log('[GameScreen] canSelectTiles conditions: isMyTurn=', isMyTurn, '(currentPlayer:', currentPlayer, 'vs playerInfo.playerId:', playerInfo?.playerId, '), isDrawDiscardPhase=', isDrawDiscardPhase, '(gamePhase:', gamePhase, '), isValidHandSize=', isValidHandSizeForDiscard(hand.length), '(hand.length:', hand.length, ')');
  console.log('[GameScreen] Result: canSelectTiles=', canSelectTiles, 'canDiscard=', canDiscard, 'selectedTile=', selectedTile?.id, 'isTing=', isTing, 'mustDiscardDrawnTile=', mustDiscardDrawnTile);

  const handleTileClick = (tile) => {
    // Only allow tile selection when we have 17 tiles and it's our turn in draw_discard phase
    if (!canSelectTiles) {
      console.log('[GameScreen] Tile click blocked - canSelectTiles:', canSelectTiles);
      return;
    }

    // 聽 players can only select the drawn tile
    // Check both isTing (player declared 聽) and mustDiscardDrawnTile (server confirmed)
    if (isTing || mustDiscardDrawnTile) {
      // If no drawn tile yet, block all tile selection
      if (!drawnTile) {
        console.log('[GameScreen] Tile click blocked - 聽 player has no drawn tile yet');
        return;
      }
      // If there is a drawn tile, only allow selecting that tile
      if (tile.id !== drawnTile.id) {
        console.log('[GameScreen] Tile click blocked - 聽 player can only select drawn tile');
        return;
      }
    }

    if (selectedTile?.id === tile.id) {
      setSelectedTile(null);
    } else {
      setSelectedTile(tile);
    }
  };

  const handleDiscard = () => {
    if (canDiscard) {
      if (tingEnabled && onTing && !isTing) {
        // If 聽 is enabled and player is not already in 聽 status, declare 聽 with this discard
        onTing(selectedTile);
      } else {
        // Normal discard
        onDiscard(selectedTile);
      }
      setSelectedTile(null);
      setTingEnabled(false); // Reset 聽 toggle after discard
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
    const playerRevealedHand = revealedHands[player.id] || [];
    const shouldReveal = showResultPopup && playerRevealedHand.length > 0;

    const isDoingFlowerReplacement = gamePhase === 'flower_replacement' && flowerReplacementPlayer === player.id;

    // Get winner/loser status from gameResult
    const isWinner = showResultPopup && gameResult?.playerResults?.find(r => r.playerId === player.id)?.isWinner;
    const isLoser = showResultPopup && gameResult?.playerResults?.find(r => r.playerId === player.id)?.isLoser;

    // For top player (對家), reverse the hand order so it appears left-to-right from their perspective
    const topPlayerRevealedHand = sortHand(playerRevealedHand).reverse();

    return (
      <div className={`player-hand player-hand-top ${isActive && !showResultPopup ? 'current-turn' : ''} ${isDoingFlowerReplacement ? 'flower-replacement' : ''} ${isWinner ? 'game-winner' : ''} ${isLoser ? 'game-loser' : ''}`}>
        <div className="top-player-tiles-container">
          {/* Hand tiles - show revealed if game ended, reversed for top player perspective */}
          <div className="player-tiles player-tiles-top">
            {shouldReveal ? (
              isWinner && getPlayerCombination(player.id) ? (
                renderGroupedWinnerHand(topPlayerRevealedHand, getPlayerCombination(player.id), true, winningTile, true)
              ) : (
                topPlayerRevealedHand.map((tile, idx) => (
                  <Tile key={idx} tile={tile} className="revealed-tile" rotated={true} />
                ))
              )
            ) : (
              Array.from({ length: Math.min(tileCount, 16) }).map((_, idx) => (
                <div key={idx} className="tile-back" />
              ))
            )}
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
              {/* Note: tiles don't need rotated={true} because the container is already rotated 180deg */}
              {playerMelds.map((meld, meldIdx) => {
                // When game ends (showResultPopup), reveal all melds including 暗槓
                const isConcealed = meld.concealed && !showResultPopup;
                const isRobbedGang = isRobbedGangMeld(meld, player.id);
                return (
                  <div key={`meld-${meldIdx}`} className={`meld-group ${isConcealed ? 'concealed-gang' : ''} ${isRobbedGang ? 'robbed-gang-meld' : ''}`}>
                    {meld.tiles.map((tile, tileIdx) => (
                      <Tile key={`meld-${meldIdx}-tile-${tileIdx}`} tile={tile} concealed={isConcealed} className={isRobbedGang ? 'robbed-gang-tile' : ''} />
                    ))}
                  </div>
                );
              })}
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
    const playerRevealedHand = revealedHands[player.id] || [];
    const shouldReveal = showResultPopup && playerRevealedHand.length > 0;

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
            {playerMelds.map((meld, meldIdx) => {
              // When game ends (showResultPopup), reveal all melds including 暗槓
              const isConcealed = meld.concealed && !showResultPopup;
              const isRobbedGang = isRobbedGangMeld(meld, player.id);
              return (
                <div key={`meld-${meldIdx}`} className={`meld-group ${isConcealed ? 'concealed-gang' : ''} ${isRobbedGang ? 'robbed-gang-meld' : ''}`}>
                  {meld.tiles.map((tile, tileIdx) => (
                    <Tile key={`meld-${meldIdx}-tile-${tileIdx}`} tile={tile} concealed={isConcealed} className={isRobbedGang ? 'robbed-gang-tile' : ''} />
                  ))}
                </div>
              );
            })}
          </>
        ) : (
          <>
            {/* Right player: melds reversed (bottom to top), bonus tiles at bottom (perspective left) */}
            {/* Reverse melds so first meld appears at bottom, matching the hand order */}
            {[...playerMelds].reverse().map((meld, meldIdx) => {
              // When game ends (showResultPopup), reveal all melds including 暗槓
              const isConcealed = meld.concealed && !showResultPopup;
              const isRobbedGang = isRobbedGangMeld(meld, player.id);
              return (
                <div key={`meld-${meldIdx}`} className={`meld-group ${isConcealed ? 'concealed-gang' : ''} ${isRobbedGang ? 'robbed-gang-meld' : ''}`}>
                  {meld.tiles.map((tile, tileIdx) => (
                    <Tile key={`meld-${meldIdx}-tile-${tileIdx}`} tile={tile} concealed={isConcealed} className={isRobbedGang ? 'robbed-gang-tile' : ''} />
                  ))}
                </div>
              );
            })}
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

    // Get winner/loser status from gameResult
    const isWinner = showResultPopup && gameResult?.playerResults?.find(r => r.playerId === player.id)?.isWinner;
    const isLoser = showResultPopup && gameResult?.playerResults?.find(r => r.playerId === player.id)?.isLoser;

    // Sort the hand, and reverse for right player (so first tile appears at bottom)
    const sortedRevealedHand = sortHand(playerRevealedHand);
    const orderedRevealedHand = position === 'right' ? [...sortedRevealedHand].reverse() : sortedRevealedHand;

    const handColumn = (
      <div className={`player-tiles player-tiles-${position}`}>
        {shouldReveal ? (
          isWinner && getPlayerCombination(player.id) ? (
            renderGroupedWinnerHand(orderedRevealedHand, getPlayerCombination(player.id), false, winningTile, position === 'right')
          ) : (
            orderedRevealedHand.map((tile, idx) => (
              <Tile key={idx} tile={tile} className="revealed-tile" />
            ))
          )
        ) : (
          Array.from({ length: Math.min(tileCount, 16) }).map((_, idx) => (
            <div key={idx} className="tile-back" />
          ))
        )}
      </div>
    );

    return (
      <div className={`player-area-${position} ${isActive && !showResultPopup ? 'current-turn' : ''} ${isDoingFlowerReplacement ? 'flower-replacement' : ''} ${isWinner ? 'game-winner' : ''} ${isLoser ? 'game-loser' : ''}`}>
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
          {/* Determine if we should highlight the loser's last discard (出沖, 雙嚮, 三嚮) */}
          {(() => {
            // Highlight winning discard for all win-by-discard scenarios
            const isWinByDiscard = showResultPopup && (
              gameResult?.winType === '出沖' ||
              gameResult?.winType === '雙嚮' ||
              gameResult?.winType === '三嚮'
            );
            const loserId = isWinByDiscard
              ? gameResult?.playerResults?.find(r => r.isLoser)?.playerId
              : null;

            const renderDiscardTile = (playerId, tile, idx, discardPile) => {
              const isWinningDiscard = loserId === playerId && idx === discardPile.length - 1;
              const isTingTile = tile.rotated === true;
              const classNames = [
                isWinningDiscard ? 'winning-discard-tile' : '',
                isTingTile ? 'ting-discard-tile' : ''
              ].filter(Boolean).join(' ');
              return (
                <Tile
                  key={idx}
                  tile={tile}
                  size="small"
                  className={classNames}
                />
              );
            };

            return (
              <>
                {/* Left Discard (上家) */}
                <div className="discard-area discard-area-left">
                  <span className="discard-area-label">
                    {leftPlayer?.name} ({positionToWind(leftPlayer?.position)})
                    {leftPlayer?.id === dealerPlayer?.id && ' 莊'}
                    {tingPlayers[leftPlayer?.id] !== undefined && <span className="ting-indicator"> 聽</span>}
                  </span>
                  <div className="discard-tiles-inner">
                    {(discardPiles[leftPlayer?.id] || []).map((tile, idx) =>
                      renderDiscardTile(leftPlayer?.id, tile, idx, discardPiles[leftPlayer?.id] || [])
                    )}
                  </div>
                </div>

                {/* Center Column: Top Discard, Game Info, Bottom Discard */}
                <div className="center-column">
                  {/* Top Discard (對家) */}
                  <div className="discard-area discard-area-top">
                    <span className="discard-area-label">
                      {topPlayer?.name} ({positionToWind(topPlayer?.position)})
                      {topPlayer?.id === dealerPlayer?.id && ' 莊'}
                      {tingPlayers[topPlayer?.id] !== undefined && <span className="ting-indicator"> 聽</span>}
                    </span>
                    <div className="discard-tiles-inner">
                      {(discardPiles[topPlayer?.id] || []).map((tile, idx) =>
                        renderDiscardTile(topPlayer?.id, tile, idx, discardPiles[topPlayer?.id] || [])
                      )}
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
              {/* Turn Timer Display */}
              {turnTimeLeft !== null && turnTimerPlayerId && gamePhase === 'draw_discard' && (
                <div className="game-info-item turn-timer-display">
                  <span className="game-info-label">⏱️</span>
                  <span className={`game-info-value turn-timer-value ${turnTimeLeft <= 2 ? 'timer-urgent' : ''}`}>
                    {players.find(p => p.id === turnTimerPlayerId)?.name || '?'}: {turnTimeLeft}s
                  </span>
                </div>
              )}
            </div>

                  {/* Bottom Discard (自己) */}
                  <div className="discard-area discard-area-bottom">
                    <span className="discard-area-label">
                      {playerInfo?.name} ({positionToWind(players.find(p => p.id === playerInfo?.playerId)?.position)})
                      {playerInfo?.playerId === dealerPlayer?.id && ' 莊'}
                      {isTing && <span className="ting-indicator"> 聽</span>}
                    </span>
                    {(discardPiles[playerInfo?.playerId] || []).map((tile, idx) =>
                      renderDiscardTile(playerInfo?.playerId, tile, idx, discardPiles[playerInfo?.playerId] || [])
                    )}
                  </div>
                </div>

                {/* Right Discard (下家) */}
                <div className="discard-area discard-area-right">
                  <span className="discard-area-label">
                    {rightPlayer?.name} ({positionToWind(rightPlayer?.position)})
                    {rightPlayer?.id === dealerPlayer?.id && ' 莊'}
                    {tingPlayers[rightPlayer?.id] !== undefined && <span className="ting-indicator"> 聽</span>}
                  </span>
                  <div className="discard-tiles-inner">
                    {(discardPiles[rightPlayer?.id] || []).map((tile, idx) =>
                      renderDiscardTile(rightPlayer?.id, tile, idx, discardPiles[rightPlayer?.id] || [])
                    )}
                  </div>
                </div>
              </>
            );
          })()}

          {/* Result Popup - shown when game ends, overlays center area */}
          {showResultPopup && gameResult && (
            <ResultPopup
              gameResult={gameResult}
              playerInfo={playerInfo}
              players={players}
              readyPlayers={readyPlayers}
              isReady={isReady}
              onReady={() => {
                setIsReady(true);
                onResultReady && onResultReady();
              }}
              onLeave={() => {
                onResultLeave && onResultLeave();
              }}
              windToChinese={windToChinese}
            />
          )}
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
          // Get winner/loser status from gameResult
          const isMyWinner = showResultPopup && gameResult?.playerResults?.find(r => r.playerId === playerInfo?.playerId)?.isWinner;
          const isMyLoser = showResultPopup && gameResult?.playerResults?.find(r => r.playerId === playerInfo?.playerId)?.isLoser;
          return (
            <div className={`player-hand player-hand-bottom ${isMyActive && !showResultPopup ? 'current-turn' : ''} ${isMyFlowerReplacement ? 'flower-replacement' : ''} ${isMyWinner ? 'game-winner' : ''} ${isMyLoser ? 'game-loser' : ''}`}>
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
                  {myMelds.map((meld, meldIdx) => {
                    const isRobbedGang = isRobbedGangMeld(meld, playerInfo?.playerId);
                    return (
                      <div key={`meld-${meldIdx}`} className={`meld-group ${meld.concealed ? 'concealed-gang' : ''} ${isRobbedGang ? 'robbed-gang-meld' : ''}`}>
                        {meld.tiles.map((tile, tileIdx) => (
                          <Tile key={`meld-${meldIdx}-tile-${tileIdx}`} tile={tile} size="small" className={isRobbedGang ? 'robbed-gang-tile' : ''} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="my-hand">
                {/* Show grouped hand if I am the winner, otherwise show normal hand */}
                {isMyWinner && getPlayerCombination(playerInfo?.playerId) ? (
                  renderGroupedWinnerHand(sortedHand, getPlayerCombination(playerInfo?.playerId), false, winningTile)
                ) : (
                  <>
                    {sortedHand.map((tile) => (
                      <Tile
                        key={tile.id}
                        tile={tile}
                        selected={selectedTile?.id === tile.id}
                        onClick={() => handleTileClick(tile)}
                        disabled={!canSelectTiles || ((isTing || mustDiscardDrawnTile) && (!drawnTile || tile.id !== drawnTile.id))}
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
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* Action Buttons */}
        <div className="bottom-actions">
          <div className="player-actions">
            <button className="action-btn" onClick={handleDiscard} disabled={!canDiscard}>
              {tingEnabled ? '聽牌' : '打牌'}
            </button>
            <button
              className="action-btn action-btn-gang"
              onClick={() => {
                console.log('selfGangCombinations', selfGangCombinations);
                if (selfGangCombinations && selfGangCombinations.length > 0) {
                  // Show popup to choose gang combination
                  setShowSelfGangPopup(true);
                }
              }}
              disabled={!canSelfGang}
              title='槓'
            >
              槓
            </button>
            <button
              className={`action-btn ${isTing ? 'action-btn-active' : ''} ${tingEnabled && !isTing ? 'action-btn-ting-enabled' : ''}`}
              onClick={() => {
                if (!isTing && isMyTurn && selectedTile) {
                  // Toggle 聽 on/off before discard
                  setTingEnabled(!tingEnabled);
                }
              }}
              disabled={!isMyTurn || !selectedTile || isTing}
            >
              聽{isTing ? ' ✓' : tingEnabled ? ' ON' : ''}
            </button>
            <button
              className="action-btn action-btn-hu"
              onClick={() => {
                console.log('selfDrawWinCombinations', selfDrawWinCombinations);
                if (selfDrawWinCombinations && selfDrawWinCombinations.length > 0) {
                  // Show popup to choose combination
                  setShowSelfDrawWinPopup(true);
                } else {
                  // Direct win
                  onSelfHu();
                }
              }}
              disabled={!canSelfDrawWin}
              title='自摸'
            >
              自摸
            </button>
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
          gamePhase={gamePhase}
        />
      )}

      {/* Self-Draw Win Popup - shown when player clicks 食 for self-draw */}
      {showSelfDrawWinPopup && canSelfDrawWin && (
        <SelfDrawWinPopup
          combinations={selfDrawWinCombinations}
          drawnTile={drawnTile}
          onConfirm={() => {
            setShowSelfDrawWinPopup(false);
            onSelfHu();
          }}
          onCancel={() => setShowSelfDrawWinPopup(false)}
        />
      )}

      {/* Self-Gang Popup - shown when player clicks 槓 for self-gang */}
      {showSelfGangPopup && canSelfGang && (
        <SelfGangPopup
          combinations={selfGangCombinations}
          onConfirm={(selectedCombinations) => {
            setShowSelfGangPopup(false);
            onSelfGang(selectedCombinations);
          }}
          onCancel={() => setShowSelfGangPopup(false)}
        />
      )}

    </div>
  );
}

// Result Popup Component - overlays center area when game ends
function ResultPopup({ gameResult, playerInfo, players, readyPlayers, isReady, onReady, onLeave, windToChinese }) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  if (!gameResult) return null;

  const { winType, winnerName, winnerNames, loserName, pattern, playerResults, nextRound, nextWind, gameEnded } = gameResult;

  // Handle both single winner (winnerName) and multiple winners (winnerNames)
  const displayWinnerNames = winnerNames || (winnerName ? [winnerName] : []);

  // If minimized, show only a small toggle button
  if (isMinimized) {
    return (
      <div className="result-popup-minimized">
        <button
          className="result-popup-toggle-btn"
          onClick={() => setIsMinimized(false)}
          title="顯示結果"
        >
          📊 顯示結果
        </button>
      </div>
    );
  }

  return (
    <div className="result-popup-overlay">
      <div className="result-popup">
        <div className="result-popup-header-row">
          <div className="result-popup-info-row">
            <span className="result-popup-wintype">
              {winType || '和局'}
            </span>

            {displayWinnerNames.length > 0 && (
              <span className="result-popup-winner">
                贏家: {displayWinnerNames.join(', ')}
              </span>
            )}

            {loserName && (winType === '出沖' || winType === '雙響' || winType === '三響') && (
              <span className="result-popup-loser">
                出沖: {loserName}
              </span>
            )}
          </div>

          <button
            className="result-popup-hide-btn"
            onClick={() => setIsMinimized(true)}
            title="隱藏結果"
          >
            ✕
          </button>
        </div>

        <div className="result-popup-players">
          {playerResults && playerResults.map((result) => (
            <div
              key={result.playerId}
              className={`result-popup-player ${result.isWinner ? 'winner' : ''} ${result.isLoser ? 'loser' : ''}`}
            >
              <span className="result-player-name">
                {result.playerName}
                {result.isDealer && <span className="dealer-badge">莊</span>}
              </span>
              <span className="result-player-position">{windToChinese(result.position)}</span>
              <span className="result-player-ready">
                {readyPlayers.includes(result.playerId) ? '✓ 準備' : ''}
              </span>
            </div>
          ))}
        </div>

        {!gameEnded && (
          <div className="result-popup-next">
            下一局: {windToChinese(nextRound)}圈{windToChinese(nextWind)}風
          </div>
        )}

        {gameEnded && (
          <div className="result-popup-gameover">
            遊戲結束！
          </div>
        )}

        <div className="result-popup-actions">
          <button
            className={`result-ready-btn ${isReady ? 'ready-active' : ''}`}
            onClick={onReady}
            disabled={isReady}
          >
            {isReady ? '已準備' : '準備'}
          </button>
          <button className="result-leave-btn" onClick={() => setShowLeaveConfirm(true)}>
            離開
          </button>
        </div>

        {/* Leave Confirmation Popup */}
        {showLeaveConfirm && (
          <div className="result-leave-confirm-overlay">
            <div className="result-leave-confirm-popup">
              <div className="result-leave-confirm-message">確定要離開遊戲嗎？</div>
              <div className="result-leave-confirm-warning">離開後將返回大廳。</div>
              <div className="result-leave-confirm-buttons">
                <button className="result-leave-confirm-btn result-leave-confirm-cancel" onClick={() => setShowLeaveConfirm(false)}>取消</button>
                <button className="result-leave-confirm-btn result-leave-confirm-yes" onClick={() => { setShowLeaveConfirm(false); onLeave && onLeave(); }}>確定離開</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Claim Popup Component
function ClaimPopup({ claimOptions, pendingClaim, onShang, onPong, onGang, onHu, lastDiscardedTile, onClose, onPass, onCancelClaim, gamePhase }) {
  const [timeLeft, setTimeLeft] = useState(Math.ceil((claimOptions?.timeout || 5000) / 1000));
  const [selectedClaim, setSelectedClaim] = useState(null);

  useEffect(() => {
    // Stop timer if game is in result phase (phase 3)
    if (gamePhase === 'result') {
      return;
    }

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
  }, [onClose, gamePhase]);

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
    // For hu claims with combination index, compare the index
    if (claim1.type === 'hu' && claim1.combinationIndex !== undefined && claim2.combinationIndex !== undefined) {
      return claim1.combinationIndex === claim2.combinationIndex;
    }
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

          {/* Win combinations - show each as a separate claim option */}
          {claimOptions?.canHu && lastDiscardedTile && claimOptions.winCombinations && claimOptions.winCombinations.length > 0 && (
            claimOptions.winCombinations.map((combo, idx) => {
              const huClaim = { type: 'hu', tiles: [lastDiscardedTile], combination: combo, combinationIndex: idx };
              // Use displayTiles which shows the actual set/pair that the last tile completes
              const tilesToShow = combo.displayTiles || combo.pairTiles || [];
              // Determine the role text - use 眼 for pair, 同子 for pong, 順子 for chow
              let roleText = '';
              if (combo.lastTileRole === 'pair') {
                roleText = '眼';
              } else if (combo.lastTileRole === 'pong') {
                roleText = '同子';
              } else if (combo.lastTileRole === 'chow') {
                roleText = '順子';
              } else {
                roleText = '組';
              }

              return (
                <button
                  key={`hu-${idx}`}
                  className={`claim-option-btn claim-option-hu ${isSameClaim(selectedClaim, huClaim) ? 'claim-option-selected' : ''}`}
                  onClick={() => handleClaimClick(huClaim)}
                >
                  <span className="claim-option-label">食</span>
                  <div className="claim-tiles-preview">
                    {/* Show the tiles that form the winning set/pair (including the discarded tile) */}
                    {tilesToShow.map((tile, tileIdx) => (
                      <Tile key={tileIdx} tile={tile} size="small" />
                    ))}
                    {/* Show the discarded tile if not already in displayTiles */}
                    {!tilesToShow.some(t => t.suit === lastDiscardedTile.suit && t.value === lastDiscardedTile.value) && (
                      <Tile tile={lastDiscardedTile} size="small" />
                    )}
                  </div>
                  <span className="claim-option-info">{roleText}</span>
                </button>
              );
            })
          )}

          {/* Fallback: single 食 button if no combinations but canHu is true */}
          {claimOptions?.canHu && lastDiscardedTile && (!claimOptions.winCombinations || claimOptions.winCombinations.length === 0) && (
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

// Self-Draw Win Popup Component
function SelfDrawWinPopup({ combinations, drawnTile, onConfirm, onCancel }) {
  const [selectedCombination, setSelectedCombination] = useState(null);

  const handleCombinationClick = (idx) => {
    setSelectedCombination(idx);
  };

  const handleConfirm = () => {
    // If only one combination, auto-select it
    if (combinations.length === 1 || selectedCombination !== null) {
      onConfirm();
    }
  };

  return (
    <div className="claim-popup-overlay">
      <div className="claim-popup">
        <div className="claim-popup-header">
          <span className="claim-popup-title">自摸</span>
        </div>

        <div className="claim-options-list">
          {combinations.map((combo, idx) => {
            const tilesToShow = combo.displayTiles || combo.pairTiles || [];
            // Determine the role text - use 眼 for pair, 同子 for pong, 順子 for chow
            let roleText = '';
            if (combo.lastTileRole === 'pair') {
              roleText = '眼';
            } else if (combo.lastTileRole === 'pong') {
              roleText = '同子';
            } else if (combo.lastTileRole === 'chow') {
              roleText = '順子';
            } else {
              roleText = '組';
            }

            return (
              <button
                key={idx}
                className={`claim-option-btn claim-option-hu ${selectedCombination === idx ? 'claim-option-selected' : ''}`}
                onClick={() => handleCombinationClick(idx)}
              >
                <span className="claim-option-label">自摸</span>
                <div className="claim-tiles-preview">
                  {tilesToShow.map((tile, tileIdx) => (
                    <Tile
                      key={tileIdx}
                      tile={tile}
                      size="small"
                      className={drawnTile && tile.suit === drawnTile.suit && tile.value === drawnTile.value ? 'winning-tile' : ''}
                    />
                  ))}
                </div>
                <span className="claim-option-info">{roleText}</span>
              </button>
            );
          })}
        </div>

        <div className="self-draw-popup-actions">
          <button className="self-draw-cancel-btn" onClick={onCancel}>
            取消
          </button>
          <button
            className="self-draw-confirm-btn"
            onClick={handleConfirm}
            disabled={combinations.length > 1 && selectedCombination === null}
          >
            確認胡牌
          </button>
        </div>
      </div>
    </div>
  );
}

// Self-Gang Popup Component
function SelfGangPopup({ combinations, onConfirm, onCancel }) {
  const [selectedCombinations, setSelectedCombinations] = useState([]);

  const handleCombinationClick = (idx) => {
    setSelectedCombinations(prev => {
      if (prev.includes(idx)) {
        return prev.filter(i => i !== idx);
      } else {
        return [...prev, idx];
      }
    });
  };

  const handleConfirm = () => {
    // If only one combination, auto-select it
    if (combinations.length === 1) {
      onConfirm([combinations[0]]);
    } else if (selectedCombinations.length > 0) {
      const selected = selectedCombinations.map(idx => combinations[idx]);
      onConfirm(selected);
    }
  };

  return (
    <div className="claim-popup-overlay">
      <div className="claim-popup">
        <div className="claim-popup-header">
          <span className="claim-popup-title">槓</span>
        </div>

        <div className="claim-options-list">
          {combinations.map((combo, idx) => {
            const isSelected = selectedCombinations.includes(idx);
            const gangType = combo.type === 'concealed_gang' ? '暗槓' : '碰上槓';

            return (
              <button
                key={idx}
                className={`claim-option-btn ${isSelected ? 'claim-option-selected' : ''}`}
                onClick={() => handleCombinationClick(idx)}
              >
                <span className="claim-option-label">{gangType}</span>
                <div className="claim-tiles-preview">
                  {combo.tiles.map((tile, tileIdx) => (
                    <Tile
                      key={tileIdx}
                      tile={tile}
                      size="small"
                    />
                  ))}
                </div>
                <span className="claim-option-info">
                  {combo.type === 'add_to_pong' ? '加槓' : '暗槓'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="self-draw-popup-actions">
          <button className="self-draw-cancel-btn" onClick={onCancel}>
            取消
          </button>
          <button
            className="self-draw-confirm-btn"
            onClick={handleConfirm}
            disabled={combinations.length > 1 && selectedCombinations.length === 0}
          >
            確認槓
          </button>
        </div>
      </div>
    </div>
  );
}

export default GameScreen;

