import { WinValidator } from './WinValidator.js';
import { PhaseThree } from './PhaseThree.js';
import GameUtils from './GameUtils.js';
import {GangValidator} from "./GangValidator.js";

/**
 * Phase Two: Draw/Discard (打牌)
 * Handles the main gameplay phase including drawing, discarding, and claiming tiles
 */
export class PhaseTwo {
  /**
   * Start turn timer for a player
   * @param {StatusManager} game - The game instance
   * @param {string} playerId - The player's ID
   */
  static startTurnTimer(game, playerId) {
    // Clear any existing turn timer
    PhaseTwo.clearTurnTimer(game);

    const player = game.players.find(p => p.id === playerId);
    if (!player) return;

    const timeoutMs = game.considerTimeout * 1000;
    game.turnTimerPlayerId = playerId;

    // console.log(`[TURN_TIMER] ⏱️  Starting ${game.considerTimeout}s (${timeoutMs}ms) timer for ${player.name} at ${new Date().toISOString()}`);

    // Broadcast timer start to all players
    game.broadcast({
      type: 'turn_timer_start',
      payload: {
        playerId: playerId,
        timeout: timeoutMs
      }
    });

    game.turnTimer = setTimeout(() => {
      // console.log(`[TURN_TIMER] ⏰ Timeout for ${player.name} at ${new Date().toISOString()}, auto-discarding...`);
      PhaseTwo.autoDiscardOnTimeout(game, playerId);
    }, timeoutMs);
  }

  static _nextTurn(game, playerId, shouldDraw = false) {
    const player = game.players.find(p => p.id === playerId);
    if (!player) return;

    const hand = game.playerHands.get(playerId);
    const melds = game.melds.get(playerId);
    const isTing = game.tingStatus.get(playerId) || false;

    let canSelfGang = false;
    let gangOptions = [];
    let canSelfDrawWin = false;
    let selfDrawWinCombinations = [];
    let bonusTilesDrawn = [];
    let tile;

    if (shouldDraw) {
      const drawResult = PhaseTwo.drawTileWithBonusCheck(game, playerId)
      if (!drawResult) {
        PhaseThree.endGame(game, 'draw');
        return;
      }
      tile = drawResult.tile;
      bonusTilesDrawn = drawResult.bonusTilesDrawn
      game.drawnTile = tile;
      console.log(`[AUTO-DRAW] Set game.drawnTile to: ${tile.suit}-${tile.value}`);
      // Check if player can win with self-draw (自摸) BEFORE adding tile to hand
      const numRevealedSets = melds.length;
      const winResult = WinValidator.isWinningHandWithMelds(hand, numRevealedSets, tile);
      const canSelfDrawWin = winResult.isWin;

      if (canSelfDrawWin) {
        const handWithDrawnTile = [...hand, tile];
        const allCombinations = WinValidator.findWinningCombinations(handWithDrawnTile, numRevealedSets, tile);
        selfDrawWinCombinations = GameUtils.deduplicateWinCombinations(allCombinations);
        console.log(`[DRAW] 🎉 ${player.name} can win by self-draw (自摸) with ${selfDrawWinCombinations.length} combinations!`);
      }
    }

    if (!isTing) {
      ({gangOptions, canGang: canSelfGang} = GangValidator.checkSelfGangOptions(game, hand, melds));
    }

    console.log(`[TURN][PLAYER_STATUS][BEFORE] handSize: ${hand.length}, sets: ${melds.length}, isTing: ${isTing}, canSelfGang: ${canSelfGang}, canSelfDrawWin: ${canSelfDrawWin}`);

    if (bonusTilesDrawn.length > 0) {
      const revealed = game.revealedBonusTiles.get(playerId);
      player.ws.send(JSON.stringify({
        type: 'draw_flower_replaced',
        payload: {
          bonusTiles: bonusTilesDrawn, finalTile: tile, hand, revealedBonusTiles: revealed,
          tilesRemaining: game.tileManager.getRemainingCount(),
          canSelfDrawWin, selfDrawWinCombinations,
          canSelfGang, selfGangCombinations: gangOptions,
          isTing,
          mustDiscardDrawnTile: isTing
        }
      }));
      game.broadcastToOthers(playerId, {
        type: 'player_draw_flower_replaced',
        payload: {
          playerId, playerName: player.name, bonusTiles: bonusTilesDrawn,
          revealedBonusTiles: revealed, tilesRemaining: game.tileManager.getRemainingCount(),
          handSize: hand.length
        }
      });
    } else {
      player.ws.send(JSON.stringify({
        type: 'tile_drawn',
        payload: {
          tile, hand, tilesRemaining: game.tileManager.getRemainingCount(),
          canSelfDrawWin, selfDrawWinCombinations,
          canSelfGang, selfGangCombinations: gangOptions,
          isTing,
          mustDiscardDrawnTile: isTing
        }
      }));
      game.broadcastToOthers(playerId, {
        type: 'player_drew',
        payload: { playerId, tilesRemaining: game.tileManager.getRemainingCount(), handSize: hand.length }
      });
    }

    PhaseTwo.startTurnTimer(game, playerId);
  }

  /**
   * Clear turn timer
   * @param {StatusManager} game - The game instance
   */
  static clearTurnTimer(game) {
    if (game.turnTimer) {
      const playerName = game.players.find(p => p.id === game.turnTimerPlayerId)?.name || 'unknown';
      // console.log(`[TURN_TIMER] 🛑 Clearing timer for ${playerName} at ${new Date().toISOString()}`);
      clearTimeout(game.turnTimer);
      game.turnTimer = null;
      game.turnTimerPlayerId = null;
    }
  }

  /**
   * Auto-discard tile when turn timer expires
   * @param {StatusManager} game - The game instance
   * @param {string} playerId - The player's ID
   */
  static autoDiscardOnTimeout(game, playerId) {
    // Don't auto-discard if game has ended (phase 3)
    if (game.gameState === 'ended') {
      // console.log(`[TURN_TIMER] Game has ended, skipping auto-discard`);
      return;
    }

    const player = game.players.find(p => p.id === playerId);
    if (!player) {
      // console.log(`[TURN_TIMER] ❌ Player not found for ID: ${playerId}`);
      return;
    }

    // Verify it's still this player's turn
    const playerIndex = game.players.indexOf(player);
    if (playerIndex !== game.currentPlayerIndex) {
      // console.log(`[TURN_TIMER] Not ${player.name}'s turn anymore, skipping auto-discard`);
      return;
    }

    const hand = game.playerHands.get(playerId);
    if (!hand || hand.length === 0) {
      // console.log(`[TURN_TIMER] ${player.name} has no tiles to discard`);
      return;
    }

    // console.log(`[TURN_TIMER] 🎯 Auto-discarding for ${player.name}, hand size: ${hand.length}, drawnTile: ${game.drawnTile ? `${game.drawnTile.suit}-${game.drawnTile.value}` : 'none'}`);

    // Determine which tile to discard:
    // 1. If player has drawn a tile (drawnTile), discard that
    // 2. Otherwise, discard the rightmost tile in hand
    let tileToDiscard = null;

    if (game.drawnTile && hand.some(t => t.id === game.drawnTile.id)) {
      tileToDiscard = game.drawnTile;
      // console.log(`[TURN_TIMER] Auto-discarding drawn tile: ${tileToDiscard.suit}-${tileToDiscard.value}`);
    } else {
      // Discard rightmost tile (last in hand array)
      tileToDiscard = hand[hand.length - 1];
      // console.log(`[TURN_TIMER] Auto-discarding rightmost tile: ${tileToDiscard.suit}-${tileToDiscard.value}`);
    }

    // Perform the discard
    PhaseTwo.handleDiscard(game, playerId, tileToDiscard);
  }

  /**
   * Handle player action during their turn
   * @param {StatusManager} game - The game instance
   * @param {string} playerId - The player's ID
   * @param {object} action - The action to perform
   */
  static handlePlayerAction(game, playerId, action) {
    const player = game.players.find(p => p.id === playerId);
    if (!player) return;

    if (action.type === 'result_ready') {
      game.handleResultReady(playerId);
      return;
    }
    const playerIndex = game.players.indexOf(player);
    // Verify it's the player's turn for non-claim actions
    if (playerIndex !== game.currentPlayerIndex) {
      player.ws.send(JSON.stringify({
        type: 'error',
        message: 'Not your turn'
      }));
      return;
    }

    switch (action.type) {
      case 'discard':
        PhaseTwo.handleDiscard(game, playerId, action.tile);
        return;
      case 'ting':
        PhaseTwo.handleTing(game, playerId, action.tile);
        return;
      case 'self_gang':
        PhaseTwo.handleSelfGang(game, playerId, action.tile);
        return;
      case 'cancel_claim':
        PhaseTwo.handleCancelClaim(game, playerId);
        return;
      case 'pass':
        PhaseTwo.handlePass(game, playerId);
        return;
      case 'pong':
      case 'gang':
      case 'chow':
      case 'shang':
        const registered = PhaseTwo.registerClaim(game, playerId, action.type, action.tiles);
        if (registered) {
          player.ws.send(JSON.stringify({
            type: 'claim_registered',
            payload: { claimType: action.type }
          }));
        }
        return;
      case 'hu':
        const isSelfDraw = playerIndex === game.currentPlayerIndex && !game.claimWindowOpen;
        if (isSelfDraw) {
          // Self-draw win attempt - handle immediately
          PhaseTwo.handleHu(game, playerId, action.combination);
          return;
        } else {
          const registered = PhaseTwo.registerClaim(game, playerId, action.type, action.tiles, action.combination);
          if (registered) {
            player.ws.send(JSON.stringify({
              type: 'claim_registered',
              payload: { claimType: action.type }
            }));
          }
          return;
        }
      default:
        player.ws.send(JSON.stringify({
          type: 'error',
          message: 'Unknown action'
        }));
    }
  }

  static handlePlayerClaimAction(game, playerId, action) {
    const player = game.players.find(p => p.id === playerId);
    if (!player) return;

    switch (action.type) {
      case 'cancel_claim':
        PhaseTwo.handleCancelClaim(game, playerId);
        return;
      case 'pass':
        PhaseTwo.handlePass(game, playerId);
        return;
      case 'pong':
      case 'gang':
      case 'chow':
      case 'shang':
      case 'hu':
        const registered = PhaseTwo.registerClaim(game, playerId, action.type, action.tiles, action.combination);
        if (registered) {
          player.ws.send(JSON.stringify({
            type: 'claim_registered',
            payload: { claimType: action.type }
          }));
        }
        return;
      default:
        player.ws.send(JSON.stringify({
          type: 'error',
          message: 'Unknown action'
        }));
    }
  }

  /**
   * Handle discard action
   * @param {StatusManager} game - The game instance
   * @param {string} playerId - The player's ID
   * @param {object} tile - The tile to discard
   */
  static handleDiscard(game, playerId, tile) {
    // Clear turn timer when player discards
    PhaseTwo.clearTurnTimer(game);

    const player = game.players.find(p => p.id === playerId);
    const hand = game.playerHands.get(playerId);

    console.log(`[DISCARD] ${player?.name} is discarding ${tile.suit}-${tile.value}`);

    // Remove tile from hand
    const tileIndex = hand.findIndex(t => t.id === tile.id);
    if (tileIndex === -1) {
      console.log(`[DISCARD] Tile not found in hand`);
      return;
    }
    hand.splice(tileIndex, 1);

    // Add to discard pile
    const discardPile = game.discardPiles.get(playerId);
    discardPile.push(tile);

    // Track last discarded tile
    game.lastDiscardedTile = tile;
    game.lastDiscardedBy = playerId;

    // Reset draw state
    game.playerHasDrawn.set(playerId, false);

    // Send updated hand to the player who discarded
    player.ws.send(JSON.stringify({
      type: 'hand_update',
      payload: {
        hand: hand,
        tilesRemaining: game.tileManager.getRemainingCount()
      }
    }));

    // Broadcast the discard to all players
    game.broadcast({
      type: 'tile_discarded',
      payload: {
        playerId: playerId,
        tile: tile,
        discardPile: discardPile,
        handSize: hand.length
      }
    });

    // Check if other players can pong/gang/chow/hu
    PhaseTwo.checkClaimActions(game, tile, playerId);
  }

  /**
   * Handle Hu (win) action
   * @param {StatusManager} game - The game instance
   * @param {string} playerId - The player's ID
   * @param {Object} combination - The selected winning combination (optional)
   */
  static handleHu(game, playerId, combination = null) {
    // Win validation was already done when showing the 食 button
    // Just execute the win directly without re-validating
    const player = game.players.find(p => p.id === playerId);
    const playerIndex = game.players.indexOf(player);

    console.log(`[HU] handleHu called for player ${player?.name}, playerId: ${playerId}`);
    console.log(`[HU] game.drawnTile:`, game.drawnTile ? `${game.drawnTile.suit}-${game.drawnTile.value}` : 'null');
    if (combination) {
      console.log(`[HU] Winning combination:`, JSON.stringify(combination));
    }

    // Determine if this is self-draw (自摸) or win by discard (出沖)
    const isSelfDraw = playerIndex === game.currentPlayerIndex && !game.claimWindowOpen;
    console.log(`[HU] isSelfDraw: ${isSelfDraw}`);

    if (isSelfDraw) {
      // 自摸 - self-draw win, no loser (all others pay)
      // Check if this is 天胡 (heavenly hand) - dealer wins on first turn without drawing from wall
      // 天胡 is detected by drawnTile being null (no tile was drawn from the wall)
      const isTianHu = !game.drawnTile;

      console.log(`[HU] game.drawnTile: ${game.drawnTile ? `${game.drawnTile.suit}-${game.drawnTile.value}` : 'null'}, isTianHu: ${isTianHu}`);

      if (isTianHu) {
        console.log(`[HU] Player ${player?.name} wins by 天胡 (Heavenly Hand) - no drawn tile to highlight`);
      } else {
        console.log(`[HU] Player ${player?.name} wins by self-draw (自摸) with drawn tile: ${game.drawnTile.suit}-${game.drawnTile.value}`);
      }

      // For 天胡, drawnTile is null (no red border)
      // For normal 自摸, drawnTile is the tile that was drawn from the wall

      PhaseThree.endGame(game, 'win_self_draw', playerId, { pattern: isTianHu ? '天胡' : '自摸', score: 0, winningCombination: combination }, game.drawnTile);
    } else {
      // 出沖 - win by claiming discarded tile
      console.log(`[HU] Player ${player?.name} wins by discard (出沖)`);
      PhaseThree.endGame(game, 'win_by_discard', playerId, { pattern: '出沖', score: 0, winningCombination: combination }, game.lastDiscardedBy);
    }
  }

  /**
   * Handle ting (聽) action - player declares ready hand
   * @param {StatusManager} game - The game instance
   * @param {string} playerId - The player's ID
   * @param {Object} tile - The tile to discard when declaring 聽
   */
  static handleTing(game, playerId, tile) {
    const player = game.players.find(p => p.id === playerId);
    if (!player) return;

    console.log('============================================================');
    console.log(`[TING] ${player.name} is declaring 聽 and discarding a tile...`);

    // Check if player is already in 聽 status
    if (game.tingStatus.get(playerId)) {
      console.log(`[TING] ❌ ${player.name} is already in 聽 status`);
      player.ws.send(JSON.stringify({
        type: 'error',
        message: 'Already in 聽 status'
      }));
      return;
    }

    const hand = game.playerHands.get(playerId);

    // Check if hand size is valid for discarding: 3n + 2 where n = 0-5
    const isValidHandSize = hand.length >= 2 && hand.length <= 17 && (hand.length - 2) % 3 === 0;
    if (!isValidHandSize) {
      console.log(`[TING] ❌ ${player.name} cannot declare 聽 - invalid hand size (${hand.length} tiles)`);
      player.ws.send(JSON.stringify({
        type: 'error',
        message: `Cannot declare 聽 - invalid hand size (${hand.length} tiles)`
      }));
      return;
    }

    const tileIndex = hand.findIndex(t => t.id === tile.id);

    if (tileIndex === -1) {
      console.log(`[TING] ❌ ${player.name} tried to discard tile not in hand: ${tile.suit}-${tile.value}`);
      return;
    }

    // Remove tile from hand
    hand.splice(tileIndex, 1);

    // Add to discard pile with rotated flag
    const discardPile = game.discardPiles.get(playerId);
    const tingTile = { ...tile, rotated: true }; // Mark tile as rotated for 聽 declaration
    discardPile.push(tingTile);

    // Set 聽 status for this player
    game.tingStatus.set(playerId, true);
    game.tingTileIndices.set(playerId, discardPile.length - 1); // Store the index of the 聽 tile

    console.log(`[TING] ✅ ${player.name} declared 聽 and discarded: ${tile.suit}-${tile.value}`);
    console.log(`[TING] Hand size: ${hand.length} tiles`);

    // Store last discarded tile for pong/gang/chow/hu
    game.lastDiscardedTile = tile;
    game.lastDiscardedBy = playerId;

    // Send updated hand and discard pile to the player who declared 聽
    player.ws.send(JSON.stringify({
      type: 'hand_update',
      payload: {
        hand: hand,
        tilesRemaining: game.tileManager.getRemainingCount(),
        discardPile: discardPile,
        isTing: true // Notify client they are now in 聽 status
      }
    }));

    // Broadcast 聽 declaration to all players
    game.broadcast({
      type: 'player_ting',
      payload: {
        playerId: playerId,
        tile: tingTile,
        discardPile: discardPile,
        handSize: hand.length,
        tingTileIndex: discardPile.length - 1
      }
    });

    // Check if other players can pong/gang/chow/hu
    PhaseTwo.checkClaimActions(game, tile, playerId);
  }

  /**
   * Check for self-gang possibilities (暗槓 and 碰上槓)
   * @param {StatusManager} game - The game instance
   * @param {array} hand - The player's hand
   * @param {array} melds - The player's melds
   * @returns {array} - Array of gang options
   */

  // deduplicateClaims and deduplicateWinCombinations moved to GameUtils.js

  /**
   * Check what claim actions other players can take on a discarded tile
   * @param {StatusManager} game - The game instance
   * @param {object} tile - The discarded tile
   * @param {string} discardedBy - The player who discarded
   */
  static checkClaimActions(game, tile, discardedBy) {
    const discardedByIndex = game.players.findIndex(p => p.id === discardedBy);
    const nextPlayerIndex = (discardedByIndex + 1) % 4;
    const nextPlayerId = game.players[nextPlayerIndex].id;

    // Clear turn timer - player has discarded, their turn is over
    PhaseTwo.clearTurnTimer(game);

    // Clear any existing claims and timer
    game.pendingClaims.clear();
    if (game.claimFreezeTimer) {
      clearTimeout(game.claimFreezeTimer);
    }

    // Open claim window
    game.claimWindowOpen = true;

    // Check what each player can do
    const claimOptions = [];

    game.players.forEach((player, index) => {
      if (player.id === discardedBy) return;

      const hand = game.playerHands.get(player.id);
      const melds = game.melds.get(player.id);
      const matchingTiles = hand.filter(t =>
        t.suit === tile.suit && t.value === tile.value
      );

      // Check if player is in 聽牌 mode - they can only claim 食 (hu)
      const isTing = game.tingStatus.get(player.id);

      const possibleClaims = [];

      // Check for 食 (Hu/Win)
      const numRevealedSets = melds.length;
      const winResult = WinValidator.isWinningHandWithMelds(hand, numRevealedSets, tile);
      const canHu = winResult.isWin;
      console.log(`[CLAIM] Checking win for player ${player.name} - Win result:`, winResult);

      let winCombinations = [];
      if (canHu) {
        const handWithDiscardedTile = [...hand, tile];
        const allWinCombinations = WinValidator.findWinningCombinations(handWithDiscardedTile, numRevealedSets, tile);
        winCombinations = GameUtils.deduplicateWinCombinations(allWinCombinations);
        console.log(`  Win combinations found: ${allWinCombinations.length} (${winCombinations.length} unique)`);
      }

      // Skip 碰/槓/上 claims for players in 聽牌 mode - they can only claim 食
      if (isTing) {
        console.log(`[CLAIM] 🀄 ${player.name} is in 聽牌 mode - can only claim 食 (hu)`);
        if (canHu) {
          claimOptions.push({
            playerId: player.id,
            canPong: false,
            canGang: false,
            canChow: false,
            canShang: false,
            canHu: true,
            winCombinations: winCombinations,
            isNextPlayer: player.id === nextPlayerId,
            possibleClaims: []
          });
        }
        return; // Skip to next player
      }

      // Pong: 3 same tiles (2 from hand + discarded)
      if (matchingTiles.length >= 2) {
        const pongTiles = matchingTiles.slice(0, 2);
        possibleClaims.push({
          type: 'pong',
          tiles: [pongTiles[0], tile, pongTiles[1]],
          handTiles: pongTiles
        });
      }

      // Gang: 4 same tiles (3 from hand + discarded)
      if (matchingTiles.length >= 3) {
        const gangTiles = matchingTiles.slice(0, 3);
        possibleClaims.push({
          type: 'gang',
          tiles: [gangTiles[0], gangTiles[1], tile, gangTiles[2]],
          handTiles: gangTiles
        });
      }

      // Chow/Shang: sequence (only 下家 can chow, and only for numbered suits)
      const isNextPlayer = player.id === nextPlayerId;
      const isNumberedSuit = ['bamboo', 'character', 'dot'].includes(tile.suit);

      if (isNextPlayer && isNumberedSuit) {
        const suitTiles = hand.filter(t => t.suit === tile.suit);
        const tileValue = tile.value;

        // Check all possible sequences
        if (tileValue >= 3) {
          const t1 = suitTiles.find(t => t.value === tileValue - 2);
          const t2 = suitTiles.find(t => t.value === tileValue - 1);
          if (t1 && t2) {
            possibleClaims.push({
              type: 'chow',
              tiles: [t1, t2, tile],
              displayTiles: [t1, tile, t2],
              handTiles: [t1, t2]
            });
          }
        }

        if (tileValue >= 2 && tileValue <= 8) {
          const t1 = suitTiles.find(t => t.value === tileValue - 1);
          const t2 = suitTiles.find(t => t.value === tileValue + 1);
          if (t1 && t2) {
            possibleClaims.push({
              type: 'chow',
              tiles: [t1, tile, t2],
              displayTiles: [t1, tile, t2],
              handTiles: [t1, t2]
            });
          }
        }

        if (tileValue <= 7) {
          const t1 = suitTiles.find(t => t.value === tileValue + 1);
          const t2 = suitTiles.find(t => t.value === tileValue + 2);
          if (t1 && t2) {
            possibleClaims.push({
              type: 'chow',
              tiles: [tile, t1, t2],
              displayTiles: [t1, tile, t2],
              handTiles: [t1, t2]
            });
          }
        }
      }

      if (possibleClaims.length > 0 || canHu) {
        const uniquePossibleClaims = GameUtils.deduplicateClaims(possibleClaims);
        claimOptions.push({
          playerId: player.id,
          canPong: matchingTiles.length >= 2,
          canGang: matchingTiles.length >= 3,
          canChow: isNextPlayer && isNumberedSuit && uniquePossibleClaims.some(c => c.type === 'chow'),
          canShang: isNextPlayer && isNumberedSuit && uniquePossibleClaims.some(c => c.type === 'chow'),
          canHu: canHu,
          winCombinations: winCombinations,
          isNextPlayer,
          possibleClaims: uniquePossibleClaims
        });
      }
    });

    const anyoneCanClaim = claimOptions.length > 0;

    console.log(`[CLAIM] Checked ${game.players.length} players for claims on tile ${tile.suit}-${tile.value}`);
    console.log(`[CLAIM] Claim options found: ${claimOptions.length}`);

    if (!anyoneCanClaim) {
      game.claimWindowOpen = false;
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
      const nextPlayer = game.players[game.currentPlayerIndex];
      PhaseTwo.prepareNextTurn(game, nextPlayer, true);
      return;
    }

    // Track which players have claim options
    game.playersWithClaimOptions.clear();
    game.playersPassed.clear();
    claimOptions.forEach(option => {
      game.playersWithClaimOptions.add(option.playerId);
    });

    // Calculate freezeTimeout: considerTimeout - 2, minimum 3 seconds
    const freezeTimeout = game.considerTimeout * 1000;

    // Notify all players of claim options and freeze period
    game.broadcast({
      type: 'claim_period_start',
      payload: {
        tile: tile,
        discardedBy: discardedBy,
        timeout: freezeTimeout
      }
    });

    // Send individual claim options to each player
    claimOptions.forEach(option => {
      const player = game.players.find(p => p.id === option.playerId);
      player.ws.send(JSON.stringify({
        type: 'claim_options',
        payload: {
          tile: tile,
          canPong: option.canPong,
          canGang: option.canGang,
          canChow: option.canChow,
          canShang: option.canShang,
          canHu: option.canHu || false,
          winCombinations: option.winCombinations || [],
          isNextPlayer: option.isNextPlayer,
          possibleClaims: option.possibleClaims,
          timeout: freezeTimeout
        }
      }));
    });

    // Start freeze timer
    game.claimFreezeTimer = setTimeout(() => {
      PhaseTwo.resolveClaims(game);
    }, freezeTimeout);
  }

  /**
   * Register a claim from a player
   */
  static registerClaim(game, playerId, claimType, tiles = null, combination = null) {
    if (!game.claimWindowOpen) {
      return false;
    }

    const player = game.players.find(p => p.id === playerId);
    if (!player) return false;

    const priorityMap = { 'hu': 4, 'gang': 3, 'pong': 2, 'chow': 1, 'shang': 1 };
    const priority = priorityMap[claimType] || 0;

    console.log(`[CLAIM] Registering ${claimType} from player ${playerId} with priority ${priority}`);

    game.pendingClaims.set(playerId, {
      type: claimType,
      priority: priority,
      tiles: tiles,
      playerId: playerId,
      combination: combination // Store winning combination for 'hu' claims
    });

    game.playersPassed.delete(playerId);
    console.log(`[CLAIM] ${claimType} claim registered from ${playerId}`);
    return true;
  }

  /**
   * Handle pass action - player explicitly passes on claiming
   */
  static handlePass(game, playerId) {
    if (!game.claimWindowOpen) {
      console.log(`[CLAIM] Claim window closed, ignoring pass from ${playerId}`);
      return;
    }

    if (!game.playersWithClaimOptions.has(playerId)) {
      console.log(`[CLAIM] Player ${playerId} has no claim options, ignoring pass`);
      return;
    }

    console.log(`[CLAIM] Player ${playerId} passed on claiming`);
    game.playersPassed.add(playerId);
    game.pendingClaims.delete(playerId);

    const player = game.players.find(p => p.id === playerId);
    if (player) {
      player.ws.send(JSON.stringify({
        type: 'pass_registered',
        payload: {}
      }));
    }

    PhaseTwo.checkAllPlayersPassed(game);
  }

  /**
   * Handle cancel claim action
   */
  static handleCancelClaim(game, playerId) {
    if (!game.claimWindowOpen) {
      console.log(`[CLAIM] Claim window closed, ignoring cancel from ${playerId}`);
      return;
    }

    console.log(`[CLAIM] Player ${playerId} cancelled their claim`);
    game.pendingClaims.delete(playerId);

    const player = game.players.find(p => p.id === playerId);
    if (player) {
      player.ws.send(JSON.stringify({
        type: 'claim_cancelled',
        payload: {}
      }));
    }
  }

  /**
   * Check if all players with claim options have passed
   */
  static checkAllPlayersPassed(game) {
    let allPassed = true;
    game.playersWithClaimOptions.forEach(playerId => {
      if (!game.playersPassed.has(playerId)) {
        allPassed = false;
      }
    });

    if (allPassed && game.playersWithClaimOptions.size > 0) {
      console.log('[CLAIM] All players passed, ending freeze period immediately');

      if (game.claimFreezeTimer) {
        clearTimeout(game.claimFreezeTimer);
        game.claimFreezeTimer = null;
      }

      // Check if this is a rob gang period
      if (game.pendingRobGang) {
        PhaseTwo.resolveRobGangClaims(game);
      } else {
        PhaseTwo.resolveClaims(game);
      }
    }
  }

  /**
   * Resolve claims after freeze period
   */
  static resolveClaims(game) {

    if (!game.claimWindowOpen) {
      return;
    }

    game.claimWindowOpen = false;

    if (game.claimFreezeTimer) {
      clearTimeout(game.claimFreezeTimer);
      game.claimFreezeTimer = null;
    }

    if (game.pendingClaims.size === 0) {
      console.log('[CLAIM] No claims, moving to next turn');
      game.broadcast({
        type: 'claim_period_end',
        payload: { claimedBy: null, claimType: null }
      });
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
      const nextPlayer = game.players[game.currentPlayerIndex];
      PhaseTwo.prepareNextTurn(game, nextPlayer, true);
      return;
    }

    // Check for multiple Hu claims (雙嚮/三嚮)
    const huClaims = [];
    game.pendingClaims.forEach((claim) => {
      if (claim.type === 'hu') {
        huClaims.push(claim);
      }
    });

    if (huClaims.length > 1) {
      const validWinners = huClaims.map(claim => ({
        playerId: claim.playerId,
        winResult: { pattern: '出沖', score: 0 },
        winningCombination: claim.combination || null
      }));

      const winnerIds = validWinners.map(w => w.playerId);
      game.pendingClaims.clear();

      game.broadcast({
        type: 'claim_period_end',
        payload: { claimedBy: winnerIds, claimType: 'hu' }
      });

      PhaseThree.endGameMultipleWinners(game, validWinners, game.lastDiscardedBy);
      return;
    }

    // Find the highest priority claim
    let highestClaim = null;
    game.pendingClaims.forEach((claim) => {
      if (!highestClaim || claim.priority > highestClaim.priority) {
        highestClaim = claim;
      }
    });

    game.pendingClaims.clear();

    game.broadcast({
      type: 'claim_period_end',
      payload: { claimedBy: highestClaim.playerId, claimType: highestClaim.type }
    });

    switch (highestClaim.type) {
      case 'hu':
        PhaseTwo.executeHuClaim(game, highestClaim.playerId, highestClaim);
        break;
      case 'gang':
        PhaseTwo.executeGangClaim(game, highestClaim.playerId);
        break;
      case 'pong':
        PhaseTwo.executePongClaim(game, highestClaim.playerId);
        break;
      case 'chow':
      case 'shang':
        PhaseTwo.executeChowClaim(game, highestClaim.playerId, highestClaim.tiles);
        break;
    }
  }

  /**
   * Execute pong claim
   */
  static executePongClaim(game, playerId) {
    const player = game.players.find(p => p.id === playerId);
    const tile = game.lastDiscardedTile;
    const hand = game.playerHands.get(playerId);

    const matchingTiles = hand.filter(t =>
      t.suit === tile.suit && t.value === tile.value
    ).slice(0, 2);

    if (matchingTiles.length < 2) {
      console.log(`[CLAIM] ❌ Invalid pong`);
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
      const nextPlayer = game.players[game.currentPlayerIndex];
      PhaseTwo.prepareNextTurn(game, nextPlayer, true);
      return;
    }

    console.log(`[CLAIM] ✅ ${player.name} claimed 碰: ${tile.suit}-${tile.value} x3`);

    matchingTiles.forEach(t => {
      const idx = hand.findIndex(ht => ht.id === t.id);
      if (idx !== -1) hand.splice(idx, 1);
    });

    const discardPile = game.discardPiles.get(game.lastDiscardedBy);
    const discardIdx = discardPile.findIndex(t => t.id === tile.id);
    if (discardIdx !== -1) {
      discardPile.splice(discardIdx, 1);
    }

    const melds = game.melds.get(playerId);
    const newMeld = { type: 'pong', tiles: [tile, ...matchingTiles] };
    melds.push(newMeld);

    const discardedBy = game.lastDiscardedBy;
    game.lastDiscardedTile = null;
    game.lastDiscardedBy = null;

    game.broadcast({
      type: 'pong_claimed',
      payload: {
        playerId: playerId,
        tile: tile,
        meld: newMeld,
        discardPile: discardPile,
        discardedBy: discardedBy
      }
    });

    const {gangOptions, canGang: canSelfGang} = GangValidator.checkSelfGangOptions(game, hand, melds);

    player.ws.send(JSON.stringify({
      type: 'hand_update',
      payload: {
        hand: hand,
        tilesRemaining: game.tileManager.getRemainingCount(),
        canSelfGang: canSelfGang,
        selfGangCombinations: gangOptions
      }
    }));

    game.currentPlayerIndex = game.players.findIndex(p => p.id === playerId);
    game.broadcast({
      type: 'turn_changed',
      payload: { currentPlayer: playerId, mustDiscard: true }
    });

    // Start turn timer for the player who claimed pong
    PhaseTwo.prepareNextTurn(game, player, false);
  }

  /**
   * Execute gang claim
   */
  static executeGangClaim(game, playerId) {
    const player = game.players.find(p => p.id === playerId);
    const tile = game.lastDiscardedTile;
    const hand = game.playerHands.get(playerId);

    const matchingTiles = hand.filter(t =>
      t.suit === tile.suit && t.value === tile.value
    ).slice(0, 3);

    if (matchingTiles.length < 3) {
      console.log(`[CLAIM] ❌ Invalid gang`);
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
      const nextPlayer = game.players[game.currentPlayerIndex];
      PhaseTwo.prepareNextTurn(game, nextPlayer, true);
      return;
    }

    console.log(`[CLAIM] ✅ ${player.name} claimed 槓: ${tile.suit}-${tile.value} x4}`);

    matchingTiles.forEach(t => {
      const idx = hand.findIndex(ht => ht.id === t.id);
      if (idx !== -1) hand.splice(idx, 1);
    });

    const discardPile = game.discardPiles.get(game.lastDiscardedBy);
    const discardIdx = discardPile.findIndex(t => t.id === tile.id);
    if (discardIdx !== -1) {
      discardPile.splice(discardIdx, 1);
    }

    const melds = game.melds.get(playerId);
    const newMeld = { type: 'gang', tiles: [tile, ...matchingTiles] };
    melds.push(newMeld);

    const discardedBy = game.lastDiscardedBy;

    game.broadcast({
      type: 'gang_claimed',
      payload: {
        playerId: playerId,
        tile: tile,
        meld: newMeld,
        discardPile: discardPile,
        discardedBy: discardedBy
      }
    });

    player.ws.send(JSON.stringify({
      type: 'hand_update',
      payload: {
        hand: hand,
        tilesRemaining: game.tileManager.getRemainingCount()
      }
    }));

    // Draw replacement tile
    // game.lastDiscardedTile = null;
    // game.lastDiscardedBy = null;
    console.log(`[GANG_CLAIM] Drawing replacement tile (補槓)...`);
    PhaseTwo.prepareNextTurn(game, player, true);

    // Check if player can win immediately after claiming
    // TODO: double check why AI added check win here, this is claim gang
    // const numRevealedSets = melds.length;
    // let winResult = WinValidator.isWinningHandWithMelds(hand, numRevealedSets, null);
    // if (winResult.isWin) {
    //   console.log(`[CLAIM] Player ${player.name} wins immediately after claiming gang!`);
    //   game.lastDiscardedTile = null;
    //   game.lastDiscardedBy = null;
    //   PhaseThree.endGame(game, 'win_by_discard', playerId, winResult, discardedBy);
    //   return;
    // }

    // 搶槓 (Robbing the Kong) - Check if other players can win with the gang tile
    // TODO: double check why AI added robGang here, this is claim gang
    // console.log(`[搶槓] Checking if other players can win with gang tile: ${tile.suit}-${tile.value}`);
    // PhaseTwo.checkRobGangWin(game, tile, playerId, discardedBy);
  }

  /**
   * 搶槓 (Robbing the Kong) - Check if other players can win with the gang tile
   * @param {StatusManager} game - The game instance
   * @param {object} tile - The gang tile
   * @param {string} gangPlayerId - The player who claimed gang
   * @param {string} originalDiscardedBy - The player who originally discarded the tile
   */
  // static checkRobGangWin(game, tile, gangPlayerId, originalDiscardedBy) {
  //   const robGangOptions = [];
  //
  //   game.players.forEach((player) => {
  //     if (player.id === gangPlayerId) return;
  //
  //     const hand = game.playerHands.get(player.id);
  //     const melds = game.melds.get(player.id);
  //     const numRevealedSets = melds.length;
  //
  //     // Check if this player can win with the gang tile
  //     const winResult = WinValidator.isWinningHandWithMelds(hand, numRevealedSets, tile);
  //     if (winResult.isWin) {
  //       const handWithTile = [...hand, tile];
  //       const allWinCombinations = WinValidator.findWinningCombinations(handWithTile, numRevealedSets, tile);
  //       const winCombinations = GameUtils.deduplicateWinCombinations(allWinCombinations);
  //
  //       console.log(`[搶槓] 🎉 ${player.name} can win by robbing the kong!`);
  //       robGangOptions.push({
  //         playerId: player.id,
  //         canHu: true,
  //         winCombinations: winCombinations
  //       });
  //     }
  //   });
  //
  //   if (robGangOptions.length === 0) {
  //     // No one can rob the kong, continue with 補牌
  //     console.log(`[搶槓] No one can rob the kong, continuing with 補牌...`);
  //     PhaseTwo.continueAfterGangClaim(game, gangPlayerId);
  //     return;
  //   }
  //
  //   // Store pending rob gang state
  //   game.pendingRobGang = {
  //     tile: tile,
  //     gangPlayerId: gangPlayerId,
  //     originalDiscardedBy: originalDiscardedBy,
  //     options: robGangOptions
  //   };
  //
  //   // Clear any existing claims
  //   game.pendingClaims.clear();
  //   game.claimWindowOpen = true;
  //   game.playersWithClaimOptions.clear();
  //   game.playersPassed.clear();
  //
  //   robGangOptions.forEach(option => {
  //     game.playersWithClaimOptions.add(option.playerId);
  //   });
  //
  //   // Calculate freezeTimeout: considerTimeout - 2, minimum 3 seconds
  //   const freezeTimeout = game.considerTimeout * 1000;
  //
  //   // Notify all players of rob gang period
  //   game.broadcast({
  //     type: 'rob_gang_period_start',
  //     payload: {
  //       tile: tile,
  //       gangPlayerId: gangPlayerId,
  //       timeout: freezeTimeout
  //     }
  //   });
  //
  //   // Send claim options to players who can rob the kong
  //   robGangOptions.forEach(option => {
  //     const player = game.players.find(p => p.id === option.playerId);
  //     player.ws.send(JSON.stringify({
  //       type: 'claim_options',
  //       payload: {
  //         tile: tile,
  //         canPong: false,
  //         canGang: false,
  //         canChow: false,
  //         canShang: false,
  //         canHu: true,
  //         winCombinations: option.winCombinations,
  //         isRobGang: true
  //       }
  //     }));
  //   });
  //
  //   // Set timeout for rob gang period
  //   game.claimFreezeTimer = setTimeout(() => {
  //     console.log(`[搶槓] Timeout expired, checking claims...`);
  //     PhaseTwo.resolveRobGangClaims(game);
  //   }, freezeTimeout);
  // }

  /**
   * Resolve rob gang claims after timeout or all players responded
   */
  static resolveRobGangClaims(game) {
    if (game.claimFreezeTimer) {
      clearTimeout(game.claimFreezeTimer);
      game.claimFreezeTimer = null;
    }

    game.claimWindowOpen = false;

    const pendingRobGang = game.pendingRobGang;
    if (!pendingRobGang) {
      console.log(`[搶槓] No pending rob gang state`);
      return;
    }

    // Check if anyone claimed hu
    const huClaims = [];
    game.pendingClaims.forEach((claim, claimPlayerId) => {
      if (claim.type === 'hu') {
        huClaims.push({ playerId: claimPlayerId, ...claim });
      }
    });

    if (huClaims.length === 0) {
      // No one claimed hu, continue with 補牌 (gang already completed)
      console.log(`[搶槓] No one claimed 食, continuing with 補牌...`);
      const isSelfGang = pendingRobGang.isSelfGang;
      const gangPlayerId = pendingRobGang.gangPlayerId;
      game.pendingRobGang = null;
      game.pendingClaims.clear();

      // if (isSelfGang) {
      //   // Gang already completed, just draw replacement tile
      //   PhaseTwo.continueAfterSelfGang(game, gangPlayerId);
      // } else {
      //   PhaseTwo.continueAfterGangClaim(game, gangPlayerId);
      // }
      return;
    }

    // Someone claimed hu - they win by robbing the kong (搶槓)
    const tile = pendingRobGang.tile;
    const gangPlayerId = pendingRobGang.gangPlayerId;

    if (huClaims.length === 1) {
      // Single winner
      const winner = huClaims[0];
      console.log(`[搶槓] 🎉 Player ${winner.playerId} wins by robbing the kong!`);

      game.lastDiscardedTile = tile;
      game.lastDiscardedBy = gangPlayerId;
      game.pendingRobGang = null;
      game.pendingClaims.clear();

      PhaseThree.endGame(game, 'win_by_discard', winner.playerId,
        { pattern: '搶槓', score: 0, winningCombination: winner.combination },
        gangPlayerId);
    } else {
      // Multiple winners (雙嚮 or 三嚮)
      console.log(`[搶槓] 🎉 Multiple players (${huClaims.length}) win by robbing the kong!`);

      const validWinners = huClaims.map(claim => ({
        playerId: claim.playerId,
        winResult: { pattern: '搶槓', score: 0 },
        winningCombination: claim.combination || null
      }));

      game.lastDiscardedTile = tile;
      game.lastDiscardedBy = gangPlayerId;
      game.pendingRobGang = null;
      game.pendingClaims.clear();

      PhaseThree.endGameMultipleWinners(game, validWinners, gangPlayerId);
    }
  }

  /**
   * Continue after gang claim (補牌) - called when no one robs the kong
   */
  static continueAfterGangClaim(game, playerId) {
    const player = game.players.find(p => p.id === playerId);
    const hand = game.playerHands.get(playerId);

    game.lastDiscardedTile = null;
    game.lastDiscardedBy = null;

    // Draw replacement tile
    console.log(`[GANG_CLAIM] Drawing replacement tile (補牌)...`);
    const drawResult = PhaseTwo.drawTileWithBonusCheck(game, playerId);

    if (!drawResult) {
      return;
    }

    const { tile: newTile, bonusTilesDrawn, canSelfDrawWin, selfDrawWinCombinations, canSelfGang, selfGangCombinations } = drawResult;

    if (bonusTilesDrawn.length > 0) {
      const revealed = game.revealedBonusTiles.get(playerId);
      player.ws.send(JSON.stringify({
        type: 'draw_flower_replaced',
        payload: {
          bonusTiles: bonusTilesDrawn,
          finalTile: newTile,
          hand: hand,
          revealedBonusTiles: revealed,
          tilesRemaining: game.tileManager.getRemainingCount(),
          canSelfDrawWin, selfDrawWinCombinations, canSelfGang, selfGangCombinations
        }
      }));
      game.broadcastToOthers(playerId, {
        type: 'player_draw_flower_replaced',
        payload: {
          playerId, playerName: player.name, bonusTiles: bonusTilesDrawn,
          revealedBonusTiles: revealed, tilesRemaining: game.tileManager.getRemainingCount(),
          handSize: hand.length
        }
      });
    } else {
      player.ws.send(JSON.stringify({
        type: 'tile_drawn',
        payload: {
          tile: newTile, hand: hand, tilesRemaining: game.tileManager.getRemainingCount(),
          canSelfDrawWin, selfDrawWinCombinations, canSelfGang, selfGangCombinations
        }
      }));
      game.broadcastToOthers(playerId, {
        type: 'player_drew',
        payload: { playerId, tilesRemaining: game.tileManager.getRemainingCount(), handSize: hand.length }
      });
    }

    game.currentPlayerIndex = game.players.findIndex(p => p.id === playerId);
    game.broadcast({
      type: 'turn_changed',
      payload: { currentPlayer: playerId, mustDiscard: true }
    });

    // Start turn timer for the player who claimed gang (after drawing replacement tile)
    // PhaseTwo.startTurnTimer(game, playerId);
    // TODO: 補牌should implement here
    PhaseTwo.prepareNextTurn(game, player, false);
  }

  /**
   * Handle self-gang (暗槓 and 碰上槓)
   */
  static handleSelfGang(game, playerId, combinations) {
    const player = game.players.find(p => p.id === playerId);
    const hand = game.playerHands.get(playerId);
    const melds = game.melds.get(playerId);

    if (combinations.length === 0) {
      return;
    }

    const combo = combinations[0];

    if (combo.type === 'concealed_gang') {
      // 暗槓: Complete immediately (cannot be robbed)
      const tilesToRemove = combo.tiles;
      tilesToRemove.forEach(t => {
        const idx = hand.findIndex(ht => ht.id === t.id);
        if (idx !== -1) hand.splice(idx, 1);
      });

      const newMeld = { type: 'concealed_gang', tiles: tilesToRemove, concealed: true };
      melds.push(newMeld);
      console.log(`[SELF-GANG] ✅ Concealed gang (暗槓): ${combo.suit}-${combo.value} x4`);

      player.ws.send(JSON.stringify({
        type: 'self_gang_claimed',
        payload: { playerId, melds, hand }
      }));

      game.broadcastToOthers(playerId, {
        type: 'self_gang_claimed',
        payload: { playerId, melds }
      });

      // Continue directly to draw replacement tile
      // PhaseTwo.continueAfterSelfGang(game, playerId);
      console.log(`[GANG_CLAIM] Drawing replacement tile (補槓)...`);
      PhaseTwo.prepareNextTurn(game, player, true);

    } else if (combo.type === 'add_to_pong') {
      // 碰上槓: Complete the gang FIRST, then check for 搶槓 before drawing
      const matchingTile = hand.find(t =>
        t.suit === combo.suit && t.value === combo.value
      );

      if (!matchingTile) {
        return;
      }

      // Step 1: Remove tile from hand
      const idx = hand.findIndex(ht => ht.id === matchingTile.id);
      if (idx !== -1) hand.splice(idx, 1);

      // Step 2: Update meld from pong to gang
      const meldIdx = melds.findIndex(m =>
        m.type === 'pong' &&
        m.tiles[0].suit === combo.suit &&
        m.tiles[0].value === combo.value
      );

      if (meldIdx !== -1) {
        melds[meldIdx].type = 'gang';
        melds[meldIdx].tiles.push(matchingTile);
        console.log(`[SELF-GANG] ✅ Add to pong (碰上槓): ${combo.suit}-${combo.value} x4`);
      }

      // Step 3: Broadcast the gang completion to all players
      player.ws.send(JSON.stringify({
        type: 'self_gang_claimed',
        payload: { playerId, melds, hand }
      }));

      game.broadcastToOthers(playerId, {
        type: 'self_gang_claimed',
        payload: { playerId, melds }
      });

      // Step 4: Check for 搶槓 BEFORE drawing replacement tile
      PhaseTwo.checkRobGangWinForSelfGang(game, matchingTile, playerId);

      console.log(`[GANG_CLAIM] Drawing replacement tile (補槓)...`);
      // TODO: check whether need if case here
      PhaseTwo.prepareNextTurn(game, player, true);
    }
  }

  /**
   * 搶槓 for self-gang (碰上槓) - Check if other players can win with the gang tile
   */
  static checkRobGangWinForSelfGang(game, tile, gangPlayerId) {
    const robGangOptions = [];

    game.players.forEach((player) => {
      if (player.id === gangPlayerId) return;

      const hand = game.playerHands.get(player.id);
      const melds = game.melds.get(player.id);
      const numRevealedSets = melds.length;

      // Check if this player can win with the gang tile
      const winResult = WinValidator.isWinningHandWithMelds(hand, numRevealedSets, tile);
      if (winResult.isWin) {
        const handWithTile = [...hand, tile];
        const allWinCombinations = WinValidator.findWinningCombinations(handWithTile, numRevealedSets, tile);
        const winCombinations = GameUtils.deduplicateWinCombinations(allWinCombinations);

        console.log(`[搶槓] 🎉 ${player.name} can win by robbing the self-gang!`);
        robGangOptions.push({
          playerId: player.id,
          canHu: true,
          winCombinations: winCombinations
        });
      }
    });

    if (robGangOptions.length === 0) {
      console.log(`[搶槓] No one can rob the self-gang, continuing with 補牌...`);
      return;
    }

    // Store pending rob gang state
    game.pendingRobGang = {
      tile: tile,
      gangPlayerId: gangPlayerId,
      originalDiscardedBy: null, // Self-gang has no original discarder
      isSelfGang: true,
      options: robGangOptions
    };

    // Clear any existing claims
    game.pendingClaims.clear();
    game.claimWindowOpen = true;
    game.playersWithClaimOptions.clear();
    game.playersPassed.clear();

    robGangOptions.forEach(option => {
      game.playersWithClaimOptions.add(option.playerId);
    });

    // Calculate freezeTimeout: considerTimeout - 2, minimum 3 seconds
    const freezeTimeout = game.considerTimeout * 1000;

    // Notify all players of rob gang period
    game.broadcast({
      type: 'rob_gang_period_start',
      payload: {
        tile: tile,
        gangPlayerId: gangPlayerId,
        timeout: freezeTimeout
      }
    });

    // Send claim options to players who can rob the kong
    robGangOptions.forEach(option => {
      const player = game.players.find(p => p.id === option.playerId);
      player.ws.send(JSON.stringify({
        type: 'claim_options',
        payload: {
          tile: tile,
          canPong: false,
          canGang: false,
          canChow: false,
          canShang: false,
          canHu: true,
          winCombinations: option.winCombinations,
          isRobGang: true
        }
      }));
    });

    // Set timeout for rob gang period
    game.claimFreezeTimer = setTimeout(() => {
      console.log(`[搶槓] Timeout expired, checking claims...`);
      PhaseTwo.resolveRobGangClaims(game);
    }, freezeTimeout);
  }

  /**
   * Continue after self-gang (補牌) - called when no one robs the kong or for 暗槓
   */
  static continueAfterSelfGang(game, playerId) {
    const player = game.players.find(p => p.id === playerId);
    const hand = game.playerHands.get(playerId);

    // Draw replacement tile
    console.log(`[SELF-GANG] Drawing replacement tile (補牌)...`);
    const drawResult = PhaseTwo.drawTileWithBonusCheck(game, playerId);

    if (!drawResult) {
      return;
    }

    const { tile, bonusTilesDrawn, canSelfDrawWin, selfDrawWinCombinations, canSelfGang, selfGangCombinations } = drawResult;
    game.drawnTile = tile;
    console.log(`[SELF-GANG] Set game.drawnTile to: ${tile.suit}-${tile.value}`);

    if (bonusTilesDrawn.length > 0) {
      const revealed = game.revealedBonusTiles.get(playerId);
      player.ws.send(JSON.stringify({
        type: 'draw_flower_replaced',
        payload: {
          bonusTiles: bonusTilesDrawn, finalTile: tile, hand, revealedBonusTiles: revealed,
          tilesRemaining: game.tileManager.getRemainingCount(),
          canSelfDrawWin, selfDrawWinCombinations, canSelfGang, selfGangCombinations
        }
      }));
      game.broadcastToOthers(playerId, {
        type: 'player_draw_flower_replaced',
        payload: {
          playerId, playerName: player.name, bonusTiles: bonusTilesDrawn,
          revealedBonusTiles: revealed, tilesRemaining: game.tileManager.getRemainingCount(),
          handSize: hand.length
        }
      });
    } else {
      player.ws.send(JSON.stringify({
        type: 'tile_drawn',
        payload: {
          tile, hand, tilesRemaining: game.tileManager.getRemainingCount(),
          canSelfDrawWin, selfDrawWinCombinations, canSelfGang, selfGangCombinations
        }
      }));
      game.broadcastToOthers(playerId, {
        type: 'player_drew',
        payload: { playerId, tilesRemaining: game.tileManager.getRemainingCount(), handSize: hand.length }
      });
    }

    // Start turn timer for the player after self-gang (they need to discard)
    // PhaseTwo.startTurnTimer(game, playerId);
    PhaseTwo.prepareNextTurn(game, player, true);
  }

  /**
   * Execute chow claim
   */
  static executeChowClaim(game, playerId, claimData) {
    const player = game.players.find(p => p.id === playerId);
    const tile = game.lastDiscardedTile;
    const hand = game.playerHands.get(playerId);

    console.log(`[CLAIM] ${player.name} is claiming 上/食 (chow)...`);

    let handTiles = null;
    let displayTiles = null;

    if (claimData && claimData.handTiles && claimData.displayTiles) {
      handTiles = claimData.handTiles;
      displayTiles = claimData.displayTiles;
    } else if (claimData && Array.isArray(claimData) && claimData.length === 2) {
      handTiles = claimData;
    }

    if (!handTiles || handTiles.length !== 2) {
      const tileValue = tile.value;
      const tileSuit = tile.suit;

      if (!['bamboo', 'character', 'dot'].includes(tileSuit)) {
        console.log('[CLAIM] Invalid chow - cannot chow honor tiles');
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
        const nextPlayer = game.players[game.currentPlayerIndex];
        PhaseTwo.prepareNextTurn(game, nextPlayer, true);
        return;
      }

      const possibleSequences = [
        [tileValue - 2, tileValue - 1],
        [tileValue - 1, tileValue + 1],
        [tileValue + 1, tileValue + 2]
      ];

      for (const [v1, v2] of possibleSequences) {
        if (v1 < 1 || v2 > 9) continue;
        const t1 = hand.find(t => t.suit === tileSuit && t.value === v1);
        const t2 = hand.find(t => t.suit === tileSuit && t.value === v2 && t.id !== t1?.id);
        if (t1 && t2) {
          handTiles = [t1, t2];
          const sorted = [t1, t2].sort((a, b) => a.value - b.value);
          displayTiles = [sorted[0], tile, sorted[1]];
          break;
        }
      }

      if (!handTiles) {
        console.log('[CLAIM] Invalid chow - no matching tiles found');
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
        const nextPlayer = game.players[game.currentPlayerIndex];
        PhaseTwo.prepareNextTurn(game, nextPlayer, true);
        return;
      }
    }

    const allTiles = [tile, ...handTiles].sort((a, b) => a.value - b.value);
    const isValidSequence =
      allTiles[0].suit === allTiles[1].suit &&
      allTiles[1].suit === allTiles[2].suit &&
      allTiles[1].value === allTiles[0].value + 1 &&
      allTiles[2].value === allTiles[1].value + 1;

    if (!isValidSequence) {
      console.log('[CLAIM] Invalid chow - tiles do not form a sequence');
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
      const nextPlayer = game.players[game.currentPlayerIndex];
      PhaseTwo.prepareNextTurn(game, nextPlayer, true);
      return;
    }

    handTiles.forEach(t => {
      const idx = hand.findIndex(ht => ht.id === t.id);
      if (idx !== -1) hand.splice(idx, 1);
    });

    const discardPile = game.discardPiles.get(game.lastDiscardedBy);
    const discardIdx = discardPile.findIndex(t => t.id === tile.id);
    if (discardIdx !== -1) {
      discardPile.splice(discardIdx, 1);
    }

    const meldTiles = displayTiles || allTiles;
    const melds = game.melds.get(playerId);
    const newMeld = { type: 'chow', tiles: meldTiles };
    melds.push(newMeld);

    console.log(`[CLAIM] ✅ ${player.name} claimed 上/食: ${meldTiles.map(t => `${t.suit}-${t.value}`).join(', ')}`);

    const discardedBy = game.lastDiscardedBy;
    game.lastDiscardedTile = null;
    game.lastDiscardedBy = null;

    game.broadcast({
      type: 'chow_claimed',
      payload: { playerId, tile, meld: newMeld, discardPile, discardedBy }
    });

    const {gangOptions, canGang: canSelfGang} = GangValidator.checkSelfGangOptions(game, hand, melds);

    player.ws.send(JSON.stringify({
      type: 'hand_update',
      payload: {
        hand, tilesRemaining: game.tileManager.getRemainingCount(),
        canSelfGang, selfGangCombinations: gangOptions
      }
    }));

    game.currentPlayerIndex = game.players.findIndex(p => p.id === playerId);
    game.broadcast({
      type: 'turn_changed',
      payload: { currentPlayer: playerId, mustDiscard: true }
    });

    // Start turn timer for the player who claimed chow
    // PhaseTwo.startTurnTimer(game, playerId);
    PhaseTwo.prepareNextTurn(game, player, false);
  }

  /**
   * Execute hu claim (出沖 - win by discard)
   */
  static executeHuClaim(game, playerId, claimData = null) {
    const player = game.players.find(p => p.id === playerId);
    const discardedTile = game.lastDiscardedTile;
    const discardedByPlayer = game.players.find(p => p.id === game.lastDiscardedBy);

    console.log(`[WIN] 🎉 ${player?.name} is claiming 食 (hu) to win!`);
    console.log(`[WIN] Winning tile: ${discardedTile?.suit}-${discardedTile?.value} (discarded by ${discardedByPlayer?.name})`);
    console.log(`[WIN] claimData:`, JSON.stringify(claimData));

    // Extract the winning combination from claim data
    const winningCombination = claimData?.combination || null;
    if (winningCombination) {
      console.log(`[WIN] Winning combination:`, JSON.stringify(winningCombination));
    } else {
      console.log(`[WIN] No winning combination found in claimData`);
    }

    const loserId = game.lastDiscardedBy;
    PhaseThree.endGame(game, 'win_by_discard', playerId, { pattern: '出沖', score: 0, winningCombination }, loserId);
  }

  /**
   * Move to next turn
   */
  static prepareNextTurn(game, nextPlayer, shouldDraw) {
    console.log(`=======================================================================================`);

    console.log(`[TURN] player: ${nextPlayer.name}'s turn, shouldDraw: ${shouldDraw}`);

    const nextPlayerIndex = game.players.indexOf(nextPlayer);
    if (nextPlayerIndex !== game.currentPlayerIndex) {
      game.currentPlayerIndex = nextPlayerIndex;
    }

    if (shouldDraw) {
      game.playerHasDrawn.set(nextPlayer.id, false);
    }

    game.broadcast({
      type: 'turn_changed',
      payload: { currentPlayer: nextPlayer.id }
    });

    PhaseTwo._nextTurn(game, nextPlayer.id, shouldDraw);
  }

  /**
   * Auto-draw a tile for a player (used when turn changes)
   */
  // static autoDrawForPlayer(game, playerId) {
  //   const player = game.players.find(p => p.id === playerId);
  //   if (!player) {
  //     console.log(`[DRAW] autoDrawForPlayer: player not found for ${playerId}`);
  //     return;
  //   }
  //
  //   const hand = game.playerHands.get(playerId);
  //   const melds = game.melds.get(playerId) || [];
  //
  //   const gangMelds = melds.filter(m => m.type === 'gang').length;
  //   const otherMelds = melds.length - gangMelds;
  //   const expectedHandSize = 16 - (otherMelds * 3) - (gangMelds * 3);
  //
  //   const isReadyToDraw = hand.length === expectedHandSize && (hand.length - 1) % 3 === 0;
  //
  //   if (!isReadyToDraw) {
  //     console.log(`[DRAW] autoDrawForPlayer: player ${player.name} has ${hand.length} tiles (expected ${expectedHandSize}), skipping draw`);
  //     return;
  //   }
  //
  //   console.log(`[DRAW] autoDrawForPlayer: drawing tile for ${player.name}`);
  //
  //   game.lastDiscardedTile = null;
  //   game.lastDiscardedBy = null;
  //
  //   // Use standardized draw function that checks both win and gang
  //   const drawResult = PhaseTwo.drawTileWithBonusCheck(game, playerId);
  //
  //   if (!drawResult) {
  //     // Game ended in draw (no more tiles)
  //     return;
  //   }
  //
  //   const { tile, bonusTilesDrawn, canSelfDrawWin, selfDrawWinCombinations, canSelfGang, selfGangCombinations } = drawResult;
  //
  //   // Store the drawn tile for reference
  //   game.drawnTile = tile;
  //   console.log(`[AUTO-DRAW] Set game.drawnTile to: ${tile.suit}-${tile.value}`);
  //
  //   // Check if player is in 聽 status
  //   const isTing = game.tingStatus.get(playerId) || false;
  //
  //   if (bonusTilesDrawn.length > 0) {
  //     const revealed = game.revealedBonusTiles.get(playerId);
  //     player.ws.send(JSON.stringify({
  //       type: 'draw_flower_replaced',
  //       payload: {
  //         bonusTiles: bonusTilesDrawn, finalTile: tile, hand, revealedBonusTiles: revealed,
  //         tilesRemaining: game.tileManager.getRemainingCount(),
  //         canSelfDrawWin, selfDrawWinCombinations,
  //         canSelfGang, selfGangCombinations,
  //         isTing,
  //         mustDiscardDrawnTile: isTing
  //       }
  //     }));
  //     game.broadcastToOthers(playerId, {
  //       type: 'player_draw_flower_replaced',
  //       payload: {
  //         playerId, playerName: player.name, bonusTiles: bonusTilesDrawn,
  //         revealedBonusTiles: revealed, tilesRemaining: game.tileManager.getRemainingCount(),
  //         handSize: hand.length
  //       }
  //     });
  //   } else {
  //     player.ws.send(JSON.stringify({
  //       type: 'tile_drawn',
  //       payload: {
  //         tile, hand, tilesRemaining: game.tileManager.getRemainingCount(),
  //         canSelfDrawWin, selfDrawWinCombinations,
  //         canSelfGang, selfGangCombinations,
  //         isTing,
  //         mustDiscardDrawnTile: isTing
  //       }
  //     }));
  //     game.broadcastToOthers(playerId, {
  //       type: 'player_drew',
  //       payload: { playerId, tilesRemaining: game.tileManager.getRemainingCount(), handSize: hand.length }
  //     });
  //   }
  //
  //   // Start turn timer after player draws
  //   // PhaseTwo.startTurnTimer(game, playerId);
  //   PhaseTwo.prepareNextTurn(game, player, true);
  // }

  /**
   * Standardized draw function that handles bonus tiles, win validation, and gang validation
   */
  static drawTileWithBonusCheck(game, playerId) {
    const hand = game.playerHands.get(playerId);

    let tile = game.tileManager.drawTile();
    const bonusTilesDrawn = [];

    if (!tile) {
      return null;
    }

    while (tile && GameUtils.isBonusTile(tile)) {
      bonusTilesDrawn.push(tile);
      const revealed = game.revealedBonusTiles.get(playerId);
      revealed.push(tile);
      tile = game.tileManager.drawTile();

      if (!tile) {
        return null;
      }
    }

    hand.push(tile);

    return {
      tile,
      bonusTilesDrawn,
    };
  }


  /**
   * Check self-draw win (自摸) and gang options for an existing hand
   * Used for dealer's first turn (天胡) and other scenarios where we need to check without drawing
   * @param {StatusManager} game - The game instance
   * @param {string} playerId - The player's ID
   * @returns {object} - { canSelfDrawWin, selfDrawWinCombinations, canSelfGang, selfGangCombinations }
   */
  static checkSelfDrawOptions(game, playerId) {
    const hand = game.playerHands.get(playerId);
    const melds = game.melds.get(playerId) || [];
    const numRevealedSets = melds.length;

    console.log(`[CHECK_OPTIONS] Checking self-draw options for player ${playerId}`);
    console.log(`[CHECK_OPTIONS] Hand size: ${hand.length}, Melds: ${melds.length}`);

    // Check for 自摸 (self-draw win)
    // For a 17-tile hand, try each tile as the potential "last tile"
    let canSelfDrawWin = false;
    let selfDrawWinCombinations = [];

    for (let i = 0; i < hand.length; i++) {
      const testHand = [...hand];
      const lastTile = testHand.splice(i, 1)[0];
      const winResult = WinValidator.isWinningHandWithMelds(testHand, numRevealedSets, lastTile);
      if (winResult.isWin) {
        canSelfDrawWin = true;
        const combinations = WinValidator.findWinningCombinations(hand, numRevealedSets, lastTile);
        selfDrawWinCombinations.push(...combinations);
      }
    }

    // Deduplicate win combinations
    if (selfDrawWinCombinations.length > 0) {
      selfDrawWinCombinations = GameUtils.deduplicateWinCombinations(selfDrawWinCombinations);
      console.log(`[CHECK_OPTIONS] 🎉 Player can 自摸 with ${selfDrawWinCombinations.length} combinations`);
    }

    // Check for 槓 options (暗槓 and 碰上槓)
    // Skip self-gang check for players in 聽牌 mode - they can only win or discard
    const isTing = game.tingStatus.get(playerId);
    let gangOptions = [];
    let canSelfGang = false;

    if (!isTing) {
      ({gangOptions, canGang: canSelfGang}= GangValidator.checkSelfGangOptions(game, hand, melds))
    } else {
      console.log(`[CHECK_OPTIONS] 🀄 Player is in 聽牌 mode - skipping self-gang check`);
    }

    return {
      canSelfDrawWin,
      selfDrawWinCombinations,
      canSelfGang,
      selfGangCombinations: gangOptions
    };
  }
}