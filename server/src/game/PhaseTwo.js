import { WinValidator } from './WinValidator.js';
import { PhaseThree } from './PhaseThree.js';
import GameUtils from './GameUtils.js';
import {GangValidator} from "./GangValidator.js";
import {DiscardHandler} from "./play_action/DiscardHandler.js";

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
      console.log(`[TURN] Set game.drawnTile to: ${tile.suit}-${tile.value}`);
      // Check if player can win with self-draw (自摸) BEFORE adding tile to hand
      const numRevealedSets = melds.length;
      const handWithoutLast = hand.slice(0, hand.length - 1);
      const winResult = WinValidator.isWinningHandWithMelds(handWithoutLast, numRevealedSets, tile, player);
      canSelfDrawWin = winResult.isWin;

      if (winResult.isWin) {
        selfDrawWinCombinations = winResult.combinations;
        console.log(`[TURN] 🎉 ${player.name} can win by self-draw (自摸) with ${selfDrawWinCombinations.length} combinations!`);
      }
    } else if (hand.length === 17 && !shouldDraw) {
      const lastTile = hand[hand.length - 1];
      const handWithoutLast = hand.slice(0, hand.length - 1);
      const winResult = WinValidator.isWinningHandWithMelds(handWithoutLast, 0, lastTile, player);
      canSelfDrawWin = winResult.isWin;

      if (winResult.isWin) {
        selfDrawWinCombinations = winResult.combinations;
        console.log(`[TURN] 🎉 ${player.name} can win by self-draw (天胡) with ${selfDrawWinCombinations.length} combinations!`);
      }
    }

    if (!isTing) {
      ({gangOptions, canGang: canSelfGang} = GangValidator.checkSelfGangOptions(game, hand, melds));
    }

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
    DiscardHandler.handleDiscard(game, playerId, tileToDiscard);
  }
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
      const winResult = WinValidator.isWinningHandWithMelds(hand, numRevealedSets, tile, player);
      if (winResult.isWin) {
        console.log(`[搶槓] 🎉 ${player.name} can win by robbing the self-gang!`);
        robGangOptions.push({
          playerId: player.id,
          canHu: true,
          winCombinations: winResult.combinations
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
   * Move to next turn
   */
  static prepareNextTurn(game, nextPlayer, shouldDraw) {
    console.log(`=============== New Turn ===============`);

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
}