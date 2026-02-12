import { TileManager } from './TileManager.js';
import { WinValidator } from './WinValidator.js';
import { PhaseOne } from './PhaseOne.js';
import { PhaseTwo } from './PhaseTwo.js';
import { PhaseThree } from './PhaseThree.js';
import {PlayerActionsHandler} from "./play_action/PlayerActionsHandler.js";
import {PlayerClaimActionsHandler} from "./play_action/PlayerClaimActionsHandler.js";

/**
 * StatusManager - Manages game state and status
 * Handles game initialization, state tracking, and coordinates between phases
 */
export class StatusManager {
  constructor(players, broadcastFn, considerTimeout = 5, debugMode = false, startRound = 'east', startWind = 'east', winds) {
    this.players = players;
    this.broadcast = broadcastFn;
    this.tileManager = new TileManager();
    this.dealerIndex = winds.indexOf(startWind); // 莊 (dealer) - starts at East (東)
    this.currentPlayerIndex = winds.indexOf(startWind); // Current turn

    // 圈/風 system for Taiwanese Mahjong
    // 圈 (round): east, south, west, north (東圈, 南圈, 西圈, 北圈)
    // 風 (wind): corresponds to dealer position (東風, 南風, 西風, 北風)
    this.currentRound = startRound; // 圈: east/south/west/north (東圈/南圈/西圈/北圈)
    this.currentWind = startWind;  // 風: east/south/west/north (東風/南風/西風/北風)
    this.roundWinds = winds; // Progression order

    this.playerHands = new Map();
    this.discardPiles = new Map();
    this.melds = new Map(); // Store pong/gang/chow for each player
    this.revealedBonusTiles = new Map(); // Store revealed flower/season tiles
    this.playerWinds = winds; // 東南西北
    this.gameState = 'waiting'; // waiting, flower_replacement, playing, ended
    this.gamePhase = 'waiting'; // waiting, flower_replacement, draw_discard
    this.lastDiscardedTile = null;
    this.lastDiscardedBy = null;
    this.drawnTile = null; // Store the last drawn tile for 自摸 win highlighting
    this.pendingClaims = new Map(); // Store pending claims during freeze period
    this.claimFreezeTimer = null; // Timer for 3-second freeze period
    this.claimWindowOpen = false; // Whether claims are still allowed
    this.pendingRobGang = null; // Store pending rob gang state (搶槓)
    // this.flowerReplacementQueue = []; // Queue for flower replacement phase
    this.playerHasDrawn = new Map(); // Track if each player has drawn this turn
    this.playersWithClaimOptions = new Set(); // Track which players have claim options
    this.playersPassed = new Set(); // Track which players have passed on claiming
    this.readyPlayers = new Set(); // Track which players are ready for next game
    this.tingStatus = new Map(); // Track which players are in 聽 status
    this.tingTileIndices = new Map(); // Track which tile index in discard pile was the 聽 declaration tile

    // Turn timer settings
    this.considerTimeout = considerTimeout; // Seconds for turn timer (configurable 3-8)
    this.turnTimer = null; // Timer for current player's turn
    this.turnTimerPlayerId = null; // Track which player the timer is for

    // Debug mode for specific tile dealing
    this.debugMode = debugMode;
  }

  /**
   * Cleanup method to clear all timers and stop game activity
   * Called when a player leaves or disconnects
   */
  cleanup() {
    console.log('[CLEANUP] Cleaning up game - clearing all timers');

    // Clear turn timer
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
      this.turnTimerPlayerId = null;
      console.log('[CLEANUP] Turn timer cleared');
    }

    // Clear claim freeze timer
    if (this.claimFreezeTimer) {
      clearTimeout(this.claimFreezeTimer);
      this.claimFreezeTimer = null;
      console.log('[CLEANUP] Claim freeze timer cleared');
    }

    // Mark game as ended to prevent any further actions
    this.gameState = 'ended';
    this.claimWindowOpen = false;
    this.pendingClaims.clear();

    console.log('[CLEANUP] Game cleanup complete');
  }

  start() {
    console.log('Initializing Taiwanese Mahjong game...');
    this.gameState = 'playing';
    this.gamePhase = 'flower_replacement';

    // Initialize tiles
    this.tileManager.shuffle();

    // Deal tiles to players
    this.dealInitialTiles();

    // Initialize revealed bonus tiles storage
    this.players.forEach(player => {
      this.revealedBonusTiles.set(player.id, []);
    });

    // Notify all players that game has started
    this.broadcast({
      type: 'game_started',
      payload: {
        currentRound: this.currentRound, // 圈 (east/south/west/north)
        currentWind: this.currentWind,   // 風 (east/south/west/north)
        dealer: this.players[this.dealerIndex].id,
        dealerIndex: this.dealerIndex,
        playerWinds: this.getPlayerWinds(),
        currentPlayer: this.players[this.currentPlayerIndex].id,
        phase: this.gamePhase,
        discardPiles: {}, // Clear discard piles for new game
        melds: {}, // Clear melds for new game
        revealedBonusTiles: {} // Clear bonus tiles for new game
      }
    });

    // Send initial hands to each player
    this.sendHandsToPlayers();

    // Start flower replacement phase (補花)
    console.log('=============== Starting flower replacement phase (補花) ===============');

    PhaseOne.startFlowerReplacementPhase(this);

    // Set callback to be called when flower replacement completes
    this.onFlowerReplacementComplete = () => {
      console.log('=============== Starting discard phase ===============');
      PhaseTwo.prepareNextTurn(this, this.players[this.dealerIndex], false);
    };
  }

  // Reset game state for next game
  resetForNextGame() {
    console.log('[RESET] Resetting game state for next game...');
    console.log(`[RESET] Next dealer: ${this.players[this.dealerIndex].name} (position ${this.dealerIndex})`);
    console.log(`[RESET] Next round: ${this.currentRound}, Next wind: ${this.currentWind}`);

    // Reset turn to dealer
    this.currentPlayerIndex = this.dealerIndex;

    // Clear all game state
    this.playerHands.clear();
    this.discardPiles.clear();
    this.melds.clear();
    this.revealedBonusTiles.clear();

    // Reset game phase
    this.gameState = 'waiting';
    this.gamePhase = 'waiting';

    // Clear last discard and drawn tile
    this.lastDiscardedTile = null;
    this.lastDiscardedBy = null;
    this.drawnTile = null;

    // Clear claim state
    this.pendingClaims.clear();
    if (this.claimFreezeTimer) {
      clearTimeout(this.claimFreezeTimer);
      this.claimFreezeTimer = null;
    }
    this.claimWindowOpen = false;
    this.pendingRobGang = null;

    // Clear flower replacement state
    // this.flowerReplacementQueue = [];
    this.flowerReplacementPlayerIndex = 0;
    this.flowerReplacementRound = 0;

    // Clear player state
    this.playerHasDrawn.clear();
    this.playersWithClaimOptions.clear();
    this.playersPassed.clear();
    this.readyPlayers.clear();
    this.tingStatus.clear();
    this.tingTileIndices.clear();

    // Reset tile manager
    this.tileManager = new TileManager();

    console.log('[RESET] ✅ Game state reset complete. Ready to start next game.');
  }

  getPlayerWinds() {
    // Return wind assignment for each player based on dealer position
    const winds = {};
    this.players.forEach((player, index) => {
      const windIndex = (index - this.dealerIndex + 4) % 4;
      winds[player.id] = this.playerWinds[windIndex];
    });
    return winds;
  }

  getPlayerWind(playerId) {
    // Return wind for a specific player based on dealer position
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return null;
    const windIndex = (playerIndex - this.dealerIndex + 4) % 4;
    return this.playerWinds[windIndex];
  }

  dealInitialTiles() {
    // DEBUG: Valid 天胡 winning hand (17 tiles)
    // Pattern: 5 sets + 1 pair = 東x3 + 南x3 + 西x3 + 北x3 + 中x3 + 發x2
    // This is a valid winning hand (大四喜 + 字一色)
    const DEBUG_SOUTH_TILES = [
      // { suit: 'wind', value: 'east' },    // 東 (set 1: pong)
      // { suit: 'wind', value: 'east' },    // 東
      // { suit: 'wind', value: 'east' },    // 東
      // { suit: 'wind', value: 'south' },   // 南 (set 2: pong)
      // { suit: 'wind', value: 'south' },   // 南
      // { suit: 'wind', value: 'south' },   // 南
      // { suit: 'wind', value: 'north' },    // 西 (set 3: pong)
      // { suit: 'wind', value: 'north' },    // 西
      // { suit: 'wind', value: 'west' },    // 西
      // { suit: 'wind', value: 'north' },   // 北 (set 4: pong)
      // { suit: 'wind', value: 'north' },   // 北
      // { suit: 'wind', value: 'north' },   // 北
      // { suit: 'dragon', value: 'red' },   // 中 (set 5: pong)
      // { suit: 'dragon', value: 'red' },   // 中
      // { suit: 'dragon', value: 'red' },   // 中
      // { suit: 'dot', value: 6 },
      // { suit: 'dot', value: 5 },  // 五筒


      { suit: 'dot', value: 1 },  // 一筒 (set 1: pong)
      { suit: 'dot', value: 1 },  // 一筒
      { suit: 'dot', value: 3 },  // 一筒
      { suit: 'dot', value: 2 },  // 二筒 (set 2: pong)
      { suit: 'dot', value: 2 },  // 二筒
      { suit: 'dot', value: 3 },  // 二筒
      { suit: 'dot', value: 9 },  // 三筒 (set 3: pong)
      { suit: 'dot', value: 9 },  // 三筒
      { suit: 'dot', value: 4 },  // 三筒
      { suit: 'dot', value: 8 },  // 四筒 (set 4: pong)
      { suit: 'dot', value: 8 },  // 四筒
      { suit: 'dot', value: 4 },  // 四筒
      { suit: 'dot', value: 7 },  // 五筒 (set 5: pong)
      { suit: 'dot', value: 4 },  // 五筒
      { suit: 'dot', value: 5 },  // 五筒
      { suit: 'dot', value: 6 },  // 六筒
      { suit: 'dot', value: 7 },  // 六筒
    ];

    // DEBUG: Set to true to give 南 player specific tiles for testing
    // DEBUG: Valid winning hand for 西 player (16 tiles when dealer, 15 when not dealer)
    // Pattern: 5 sets + 1 single = 一筒x3 + 二筒x3 + 三筒x3 + 四筒x3 + 五筒x3 + 六筒x1
    // Waiting for 六筒 to complete the pair
    const DEBUG_DEALER_TILES = [
      { suit: 'dot', value: 1 },
      { suit: 'dot', value: 1 },  // 五筒
      { suit: 'dot', value: 2 },
      { suit: 'dot', value: 3 },  // 五筒
      { suit: 'dot', value: 3 },
      { suit: 'dot', value: 4 },  // 五筒
      { suit: 'dot', value: 5 },  // 五筒
      { suit: 'dot', value: 6 },
      { suit: 'dot', value: 7 },  // 五筒
      { suit: 'dot', value: 8 },
      { suit: 'character', value: 3 },  // 五筒
      { suit: 'character', value: 3 },
      { suit: 'character', value: 4 },
      { suit: 'character', value: 5 },
      { suit: 'character', value: 6 },
      { suit: 'character', value: 7 },
      { suit: 'character', value: 7 },
    ];

    // Dealer (莊) gets 17 tiles, others get 16 (Taiwanese Mahjong)
    this.players.forEach((player, index) => {
      const hand = [];
      const tileCount = index === this.dealerIndex ? 17 : 16;

      // Check player's fixed position (0=東, 1=南, 2=西, 3=北)
      const isEastPosition = player.position === 0;
      const isSouthPosition = player.position === 1;

      if (this.debugMode && isEastPosition) {
        // DEBUG: Give 東 position player specific tiles for testing
        const isDealer = index === this.dealerIndex;
        console.log(`[DEBUG] Dealing specific tiles to 東 position player ${player.name} (dealer: ${isDealer})`);

        DEBUG_DEALER_TILES.forEach(targetTile => {
          const tileIndex = this.tileManager.tiles.findIndex(
            t => t.suit === targetTile.suit && t.value === targetTile.value
          );
          if (tileIndex !== -1) {
            hand.push(this.tileManager.tiles[tileIndex]);
            this.tileManager.tiles.splice(tileIndex, 1);
          } else {
            console.warn(`[DEBUG] Could not find tile: ${targetTile.suit}-${targetTile.value}`);
          }
        });

        // If 東 position is NOT dealer, remove last 發 (to have 16 tiles instead of 17)
        if (!isDealer) {
          hand.pop(); // Remove last tile (發)
          console.log(`[DEBUG] 東 position is not dealer, removed last 發`);
        }

        console.log(`[DEBUG] 東 position player hand (${hand.length} tiles):`, hand.map(t => `${t.suit}-${t.value}`).join(', '));
      } else if (this.debugMode && isSouthPosition) {
        // DEBUG: Give 西 position player specific tiles for testing
        const isDealer = index === this.dealerIndex;
        console.log(`[DEBUG] Dealing specific tiles to 南 position player ${player.name} (dealer: ${isDealer})`);

        DEBUG_SOUTH_TILES.forEach(targetTile => {
          const tileIndex = this.tileManager.tiles.findIndex(
            t => t.suit === targetTile.suit && t.value === targetTile.value
          );
          if (tileIndex !== -1) {
            hand.push(this.tileManager.tiles[tileIndex]);
            this.tileManager.tiles.splice(tileIndex, 1);
          } else {
            console.warn(`[DEBUG] Could not find tile: ${targetTile.suit}-${targetTile.value}`);
          }
        });

        // If 西 position is NOT dealer, remove last 六筒 (to have 15 tiles instead of 16)
        if (!isDealer) {
          hand.pop(); // Remove last tile (六筒)
          console.log(`[DEBUG] 南 position is not dealer, removed last 六筒`);
        }

        console.log(`[DEBUG] 南 position player hand (${hand.length} tiles):`, hand.map(t => `${t.suit}-${t.value}`).join(', '));
      } else {
        // Normal dealing
        for (let i = 0; i < tileCount; i++) {
          hand.push(this.tileManager.drawTile());
        }
      }

      this.playerHands.set(player.id, hand);
      this.discardPiles.set(player.id, []);
      this.melds.set(player.id, []); // Initialize melds

      // Initialize draw state - dealer starts with 17 tiles so mark as "drawn"
      this.playerHasDrawn.set(player.id, index === this.dealerIndex);
    });
  }


  // Start the flower replacement phase (補花) - delegates to PhaseOne
  startPhaseOne() {
    PhaseOne.startFlowerReplacementPhase(this);
  }


  sendHandsToPlayers() {
    this.players.forEach((player) => {
      const hand = this.playerHands.get(player.id);
      const revealedBonusTiles = this.revealedBonusTiles.get(player.id) || [];
      player.ws.send(JSON.stringify({
        type: 'hand_update',
        payload: {
          hand: hand,
          revealedBonusTiles: revealedBonusTiles,
          tilesRemaining: this.tileManager.getRemainingCount()
        }
      }));
    });
  }


  // Delegate player actions to PhaseTwo
  handlePlayerAction(playerId, action) {
    PlayerActionsHandler.handlePlayerAction(this, playerId, action);
  }

  handlePlayerClaimAction(playerId, action) {
    PlayerClaimActionsHandler.handlePlayerClaimAction(this, playerId, action);
  }


  // Handle player ready for next game
  handleResultReady(playerId) {
    if (this.gameState !== 'ended') {
      console.log(`[RESULT_READY] Game not ended, ignoring ready from ${playerId}`);
      return;
    }

    // Add player to ready set
    this.readyPlayers.add(playerId);

    // Count only players with active WebSocket connections
    const activePlayers = this.players.filter(p => p.ws && p.ws.readyState === 1);
    console.log(`[RESULT_READY] Player ${playerId} is ready. Total ready: ${this.readyPlayers.size}/${activePlayers.length}`);

    // Broadcast to all players that this player is ready
    this.broadcast({
      type: 'player_ready',
      payload: {
        playerId: playerId
      }
    });

    // Check if all active players are ready
    if (this.readyPlayers.size >= activePlayers.length) {
      console.log('[RESULT_READY] All players ready, starting next game');

      // Broadcast that next game is starting
      this.broadcast({
        type: 'next_game_starting',
        payload: {}
      });

      // Reset ready players
      this.readyPlayers.clear();

      // Start next game
      this.startNextGame();
    }
  }

  // Start the next game with current dealer/round/wind settings
  startNextGame() {
    console.log('[START_NEXT_GAME] Starting next game...');

    // Reset all game state and prepare for new game
    this.resetForNextGame();

    // Now start the game (same as initial start)
    this.start();
  }

  broadcastToOthers(excludePlayerId, message) {
    const messageStr = JSON.stringify(message);
    this.players.forEach((player) => {
      if (player.id !== excludePlayerId && player.ws && player.ws.readyState === 1) {
        player.ws.send(messageStr);
      }
    });
  }

}

