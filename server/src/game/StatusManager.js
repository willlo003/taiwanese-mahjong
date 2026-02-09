import { TileManager } from './TileManager.js';
import { WinValidator } from './WinValidator.js';
import { PhaseOne } from './PhaseOne.js';
import { PhaseTwo } from './PhaseTwo.js';
import { PhaseThree } from './PhaseThree.js';

/**
 * StatusManager - Manages game state and status
 * Handles game initialization, state tracking, and coordinates between phases
 */
export class StatusManager {
  constructor(players, broadcastFn, considerTimeout = 5, debugMode = false) {
    this.players = players;
    this.broadcast = broadcastFn;
    this.tileManager = new TileManager();
    this.dealerIndex = 0; // 莊 (dealer) - starts at East (東)
    this.currentPlayerIndex = 0; // Current turn

    // 圈/風 system for Taiwanese Mahjong
    // 圈 (round): east, south, west, north (東圈, 南圈, 西圈, 北圈)
    // 風 (wind): corresponds to dealer position (東風, 南風, 西風, 北風)
    this.currentRound = 'east'; // 圈: east/south/west/north (東圈/南圈/西圈/北圈)
    this.currentWind = 'east';  // 風: east/south/west/north (東風/南風/西風/北風)
    this.roundWinds = ['east', 'south', 'west', 'north']; // Progression order

    this.playerHands = new Map();
    this.discardPiles = new Map();
    this.melds = new Map(); // Store pong/gang/chow for each player
    this.revealedBonusTiles = new Map(); // Store revealed flower/season tiles
    this.playerWinds = ['east', 'south', 'west', 'north']; // 東南西北
    this.gameState = 'waiting'; // waiting, flower_replacement, playing, ended
    this.gamePhase = 'waiting'; // waiting, flower_replacement, draw_discard
    this.lastDiscardedTile = null;
    this.lastDiscardedBy = null;
    this.pendingClaims = new Map(); // Store pending claims during freeze period
    this.claimFreezeTimer = null; // Timer for 3-second freeze period
    this.claimWindowOpen = false; // Whether claims are still allowed
    this.pendingRobGang = null; // Store pending rob gang state (搶槓)
    this.flowerReplacementQueue = []; // Queue for flower replacement phase
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
    this.startFlowerReplacementPhase();
  }

  // Reset game state for next game
  resetForNextGame() {
    console.log('====================');
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

    // Clear last discard
    this.lastDiscardedTile = null;
    this.lastDiscardedBy = null;

    // Clear claim state
    this.pendingClaims.clear();
    if (this.claimFreezeTimer) {
      clearTimeout(this.claimFreezeTimer);
      this.claimFreezeTimer = null;
    }
    this.claimWindowOpen = false;
    this.pendingRobGang = null;

    // Clear flower replacement state
    this.flowerReplacementQueue = [];
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
    const DEBUG_DEALER_TILES = [
      { suit: 'wind', value: 'east' },    // 東 (set 1: pong)
      { suit: 'wind', value: 'east' },    // 東
      // { suit: 'wind', value: 'east' },    // 東
      { suit: 'wind', value: 'south' },   // 南 (set 2: pong)
      { suit: 'wind', value: 'south' },   // 南
      // { suit: 'wind', value: 'south' },   // 南
      { suit: 'wind', value: 'west' },    // 西 (set 3: pong)
      { suit: 'wind', value: 'west' },    // 西
      // { suit: 'wind', value: 'west' },    // 西
      { suit: 'wind', value: 'north' },   // 北 (set 4: pong)
      { suit: 'wind', value: 'north' },   // 北
      // { suit: 'wind', value: 'north' },   // 北
      { suit: 'dragon', value: 'red' },   // 中 (set 5: pong)
      { suit: 'dragon', value: 'red' },   // 中
      // { suit: 'dragon', value: 'red' },   // 中
      // { suit: 'dragon', value: 'red' },   // 中
      // { suit: 'dot', value: 6 },
      // { suit: 'dot', value: 5 },  // 五筒
      { suit: 'dot', value: 7 },
      { suit: 'dot', value: 7 },  // 五筒
      { suit: 'dot', value: 3 },
      { suit: 'dot', value: 3 },  // 五筒
      { suit: 'dot', value: 4 },
      { suit: 'dot', value: 4 },  // 五筒
      { suit: 'dot', value: 4 },  // 五筒
    ];

    // DEBUG: Set to true to give 南 player specific tiles for testing
    // DEBUG: Valid winning hand for 西 player (16 tiles when dealer, 15 when not dealer)
    // Pattern: 5 sets + 1 single = 一筒x3 + 二筒x3 + 三筒x3 + 四筒x3 + 五筒x3 + 六筒x1
    // Waiting for 六筒 to complete the pair
    const DEBUG_SOUTH_TILES = [
      { suit: 'dot', value: 1 },  // 一筒 (set 1: pong)
      { suit: 'dot', value: 1 },  // 一筒
      { suit: 'dot', value: 1 },  // 一筒
      { suit: 'dot', value: 2 },  // 二筒 (set 2: pong)
      { suit: 'dot', value: 2 },  // 二筒
      { suit: 'dot', value: 2 },  // 二筒
      { suit: 'dot', value: 9 },  // 三筒 (set 3: pong)
      { suit: 'dot', value: 9 },  // 三筒
      { suit: 'dot', value: 9 },  // 三筒
      { suit: 'dot', value: 8 },  // 四筒 (set 4: pong)
      { suit: 'dot', value: 8 },  // 四筒
      { suit: 'dot', value: 8 },  // 四筒
      { suit: 'dot', value: 5 },  // 五筒 (set 5: pong)
      { suit: 'dot', value: 5 },  // 五筒
      { suit: 'dot', value: 5 },  // 五筒
      { suit: 'dot', value: 6 },  // 六筒
      { suit: 'dot', value: 6 },  // 六筒
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

  // isBonusTile moved to PhaseTwo.js

  // Start the flower replacement phase (補花) - delegates to PhaseOne
  startFlowerReplacementPhase() {
    PhaseOne.startFlowerReplacementPhase(this);
  }
  //
  // notifyCurrentPlayer() {
  //   const currentPlayer = this.players[this.currentPlayerIndex];
  //   this.broadcast({
  //     type: 'turn_changed',
  //     payload: {
  //       currentPlayer: currentPlayer.id,
  //       phase: this.gamePhase
  //     }
  //   });
  // }


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

  // drawTile(playerIndex) {
  //   const player = this.players[playerIndex];
  //   const tile = this.tileManager.drawTile();
  //
  //   if (!tile) {
  //     this.endGame('draw'); // No more tiles
  //     return;
  //   }
  //
  //   const hand = this.playerHands.get(player.id);
  //   hand.push(tile);
  //
  //   // Send updated hand to the player
  //   player.ws.send(JSON.stringify({
  //     type: 'tile_drawn',
  //     payload: {
  //       tile: tile,
  //       hand: hand,
  //       tilesRemaining: this.tileManager.getRemainingCount()
  //     }
  //   }));
  //
  //   // Notify others that a tile was drawn
  //   this.broadcastToOthers(player.id, {
  //     type: 'player_drew',
  //     payload: {
  //       playerId: player.id,
  //       tilesRemaining: this.tileManager.getRemainingCount()
  //     }
  //   });
  // }

  // Delegate player actions to PhaseTwo
  handlePlayerAction(playerId, action) {
    PhaseTwo.handlePlayerAction(this, playerId, action);
  }

  // handleDraw(playerId) {
  //   const player = this.players.find(p => p.id === playerId);
  //   if (!player) return;
  //
  //   console.log('============================================================');
  //   console.log(`[DRAW] ${player.name} is drawing a tile...`);
  //
  //   const hand = this.playerHands.get(playerId);
  //
  //   // Check if player has 16 tiles (should draw)
  //   if (hand.length !== 16) {
  //     console.log(`[DRAW] ❌ ${player.name} cannot draw - already has ${hand.length} tiles (expected 16)`);
  //     player.ws.send(JSON.stringify({
  //       type: 'error',
  //       message: 'You already have 17 tiles - please discard'
  //     }));
  //     return;
  //   }
  //
  //   // Close claim window when player draws
  //   if (this.claimWindowOpen) {
  //     this.claimWindowOpen = false;
  //     if (this.claimFreezeTimer) {
  //       clearTimeout(this.claimFreezeTimer);
  //       this.claimFreezeTimer = null;
  //     }
  //     this.pendingClaims.clear();
  //
  //     // Broadcast that claim window is closed
  //     this.broadcast({
  //       type: 'claim_period_end',
  //       payload: {
  //         claimedBy: null,
  //         claimType: null,
  //         reason: 'player_drew'
  //       }
  //     });
  //   }
  //
  //   // Clear last discarded tile since player is drawing
  //   this.lastDiscardedTile = null;
  //   this.lastDiscardedBy = null;
  //
  //   // Use standardized draw function to handle bonus tiles, win check, and gang check
  //   const drawResult = this.drawTileWithBonusCheck(playerId, 'DRAW');
  //
  //   if (!drawResult) {
  //     // Game ended in draw (no more tiles)
  //     return;
  //   }
  //
  //   const { tile, bonusTilesDrawn, canSelfDrawWin, selfDrawWinCombinations, canSelfGang, selfGangCombinations } = drawResult;
  //
  //   // Store the drawn tile for reference (used for 自摸 win)
  //   this.drawnTile = tile;
  //
  //   // If we drew bonus tiles, notify everyone
  //   if (bonusTilesDrawn.length > 0) {
  //     const revealed = this.revealedBonusTiles.get(playerId);
  //
  //     // Notify the player about the flower replacement
  //     player.ws.send(JSON.stringify({
  //       type: 'draw_flower_replaced',
  //       payload: {
  //         bonusTiles: bonusTilesDrawn,
  //         finalTile: tile,
  //         hand: hand,
  //         revealedBonusTiles: revealed,
  //         tilesRemaining: this.tileManager.getRemainingCount(),
  //         canSelfDrawWin: canSelfDrawWin,
  //         selfDrawWinCombinations: selfDrawWinCombinations,
  //         canSelfGang: canSelfGang,
  //         selfGangCombinations: selfGangCombinations
  //       }
  //     }));
  //
  //     // Notify others about the flower replacement
  //     this.broadcastToOthers(playerId, {
  //       type: 'player_draw_flower_replaced',
  //       payload: {
  //         playerId: playerId,
  //         playerName: player.name,
  //         bonusTiles: bonusTilesDrawn,
  //         revealedBonusTiles: revealed,
  //         tilesRemaining: this.tileManager.getRemainingCount(),
  //         handSize: hand.length
  //       }
  //     });
  //   } else {
  //     // Check if player is in 聽 status - they cannot gang
  //     const isPlayerTing = this.tingStatus.get(playerId);
  //
  //     // Normal draw - send updated hand to the player
  //     player.ws.send(JSON.stringify({
  //       type: 'tile_drawn',
  //       payload: {
  //         tile: tile,
  //         hand: hand,
  //         tilesRemaining: this.tileManager.getRemainingCount(),
  //         canSelfDrawWin: canSelfDrawWin,
  //         selfDrawWinCombinations: selfDrawWinCombinations,
  //         canSelfGang: isPlayerTing ? false : canSelfGang, // 聽 players cannot gang
  //         selfGangCombinations: isPlayerTing ? [] : selfGangCombinations,
  //         isTing: isPlayerTing || false,
  //         mustDiscardDrawnTile: isPlayerTing || false // 聽 players must discard the drawn tile
  //       }
  //     }));
  //
  //     // Notify others that a tile was drawn (without showing the tile)
  //     this.broadcastToOthers(playerId, {
  //       type: 'player_drew',
  //       payload: {
  //         playerId: playerId,
  //         tilesRemaining: this.tileManager.getRemainingCount(),
  //         handSize: hand.length
  //       }
  //     });
  //   }
  // }
  //
  // handleDiscard(playerId, tile) {
  //   const player = this.players.find(p => p.id === playerId);
  //   if (!player) return;
  //
  //   console.log('============================================================');
  //   console.log(`[DISCARD] ${player.name} is discarding a tile...`);
  //
  //   const hand = this.playerHands.get(playerId);
  //
  //   // Check if hand size is valid for discarding: 3n + 2 where n = 0-5
  //   // After drawing or claiming, hand should be: 17, 14, 11, 8, 5, or 2 tiles
  //   const isValidHandSize = hand.length >= 2 && hand.length <= 17 && (hand.length - 2) % 3 === 0;
  //   if (!isValidHandSize) {
  //     console.log(`[DISCARD] ❌ ${player.name} cannot discard - invalid hand size (${hand.length} tiles)`);
  //     player.ws.send(JSON.stringify({
  //       type: 'error',
  //       message: `Cannot discard - invalid hand size (${hand.length} tiles)`
  //     }));
  //     return;
  //   }
  //
  //   const tileIndex = hand.findIndex(t => t.id === tile.id);
  //
  //   if (tileIndex === -1) {
  //     console.log(`[DISCARD] ❌ ${player.name} tried to discard tile not in hand: ${tile.suit}-${tile.value}`);
  //     return; // Invalid tile
  //   }
  //
  //   // Remove tile from hand
  //   hand.splice(tileIndex, 1);
  //
  //   // Add to discard pile
  //   const discardPile = this.discardPiles.get(playerId);
  //   discardPile.push(tile);
  //
  //   console.log(`[DISCARD] ✅ ${player.name} discarded: ${tile.suit}-${tile.value}`);
  //   console.log(`[DISCARD] Hand size: ${hand.length} tiles`);
  //
  //   // Store last discarded tile for pong/gang/chow/hu
  //   this.lastDiscardedTile = tile;
  //   this.lastDiscardedBy = playerId;
  //
  //   // Send updated hand and discard pile to the player who discarded
  //   player.ws.send(JSON.stringify({
  //     type: 'hand_update',
  //     payload: {
  //       hand: hand,
  //       tilesRemaining: this.tileManager.getRemainingCount(),
  //       discardPile: discardPile
  //     }
  //   }));
  //
  //   // Broadcast discard to OTHER players (not the one who discarded)
  //   // The player who discarded already got their hand update above
  //   this.broadcastToOthers(playerId, {
  //     type: 'tile_discarded',
  //     payload: {
  //       playerId: playerId,
  //       tile: tile,
  //       discardPile: discardPile,
  //       handSize: hand.length
  //     }
  //   });
  //
  //   // Check if other players can pong/gang/chow/hu
  //   this.checkClaimActions(tile, playerId);
  // }
  //
  // // Handle 聽 (ting) action - player declares ready hand and discards
  // handleTing(playerId, tile) {
  //   const player = this.players.find(p => p.id === playerId);
  //   if (!player) return;
  //
  //   console.log('============================================================');
  //   console.log(`[TING] ${player.name} is declaring 聽 and discarding a tile...`);
  //
  //   // Check if player is already in 聽 status
  //   if (this.tingStatus.get(playerId)) {
  //     console.log(`[TING] ❌ ${player.name} is already in 聽 status`);
  //     player.ws.send(JSON.stringify({
  //       type: 'error',
  //       message: 'Already in 聽 status'
  //     }));
  //     return;
  //   }
  //
  //   const hand = this.playerHands.get(playerId);
  //
  //   // Check if hand size is valid for discarding: 3n + 2 where n = 0-5
  //   const isValidHandSize = hand.length >= 2 && hand.length <= 17 && (hand.length - 2) % 3 === 0;
  //   if (!isValidHandSize) {
  //     console.log(`[TING] ❌ ${player.name} cannot declare 聽 - invalid hand size (${hand.length} tiles)`);
  //     player.ws.send(JSON.stringify({
  //       type: 'error',
  //       message: `Cannot declare 聽 - invalid hand size (${hand.length} tiles)`
  //     }));
  //     return;
  //   }
  //
  //   const tileIndex = hand.findIndex(t => t.id === tile.id);
  //
  //   if (tileIndex === -1) {
  //     console.log(`[TING] ❌ ${player.name} tried to discard tile not in hand: ${tile.suit}-${tile.value}`);
  //     return;
  //   }
  //
  //   // Remove tile from hand
  //   hand.splice(tileIndex, 1);
  //
  //   // Add to discard pile with rotated flag
  //   const discardPile = this.discardPiles.get(playerId);
  //   const tingTile = { ...tile, rotated: true }; // Mark tile as rotated for 聽 declaration
  //   discardPile.push(tingTile);
  //
  //   // Set 聽 status for this player
  //   this.tingStatus.set(playerId, true);
  //   this.tingTileIndices.set(playerId, discardPile.length - 1); // Store the index of the 聽 tile
  //
  //   console.log(`[TING] ✅ ${player.name} declared 聽 and discarded: ${tile.suit}-${tile.value}`);
  //   console.log(`[TING] Hand size: ${hand.length} tiles`);
  //
  //   // Store last discarded tile for pong/gang/chow/hu
  //   this.lastDiscardedTile = tile;
  //   this.lastDiscardedBy = playerId;
  //
  //   // Send updated hand and discard pile to the player who declared 聽
  //   player.ws.send(JSON.stringify({
  //     type: 'hand_update',
  //     payload: {
  //       hand: hand,
  //       tilesRemaining: this.tileManager.getRemainingCount(),
  //       discardPile: discardPile,
  //       isTing: true // Notify client they are now in 聽 status
  //     }
  //   }));
  //
  //   // Broadcast 聽 declaration to all players
  //   this.broadcast({
  //     type: 'player_ting',
  //     payload: {
  //       playerId: playerId,
  //       tile: tingTile,
  //       discardPile: discardPile,
  //       handSize: hand.length,
  //       tingTileIndex: discardPile.length - 1
  //     }
  //   });
  //
  //   // Check if other players can pong/gang/chow/hu
  //   this.checkClaimActions(tile, playerId);
  // }
  //
  // handleHu(playerId, combination = null) {
  //   // Win validation was already done when showing the 食 button
  //   // Just execute the win directly without re-validating
  //   const player = this.players.find(p => p.id === playerId);
  //   const playerIndex = this.players.indexOf(player);
  //
  //   console.log(`[HU] handleHu called for player ${player?.name}, playerId: ${playerId}`);
  //   if (combination) {
  //     console.log(`[HU] Winning combination:`, JSON.stringify(combination));
  //   }
  //
  //   // Determine if this is self-draw (自摸) or win by discard (出沖)
  //   const isSelfDraw = playerIndex === this.currentPlayerIndex && !this.claimWindowOpen;
  //   console.log(`[HU] isSelfDraw: ${isSelfDraw}`);
  //
  //   if (isSelfDraw) {
  //     // 自摸 - self-draw win, no loser (all others pay)
  //     console.log(`[HU] Player ${player?.name} wins by self-draw (自摸)`);
  //     this.endGame('win_self_draw', playerId, { pattern: '自摸', score: 0, winningCombination: combination }, null);
  //   } else {
  //     // 出沖 - win by claiming discarded tile
  //     console.log(`[HU] Player ${player?.name} wins by discard (出沖)`);
  //     this.endGame('win_by_discard', playerId, { pattern: '出沖', score: 0, winningCombination: combination }, this.lastDiscardedBy);
  //   }
  // }

  // deduplicateClaims, deduplicateWinCombinations, checkClaimActions, checkAllPlayersPassed, resolveClaims, executePongClaim, executeGangClaim, handleSelfGang, executeChowClaim, executeHuClaim, nextTurn and autoDrawForPlayer moved to PhaseTwo.js

  endGame(reason, winnerId = null, winResult = null, loserId = null) {
    try {
      console.log(`[END_GAME] Called with reason: ${reason}, winnerId: ${winnerId}, loserId: ${loserId}`);
      this.gameState = 'ended';

      const winner = winnerId ? this.players.find(p => p.id === winnerId) : null;
      const loser = loserId ? this.players.find(p => p.id === loserId) : null;
      const dealerPlayer = this.players[this.dealerIndex];
      console.log(`[END_GAME] winner: ${winner?.name}, loser: ${loser?.name}, dealer: ${dealerPlayer?.name}`);

    // Determine win type
    let winType = null;
    if (reason === 'win_by_discard') {
      winType = '出沖'; // Win by claiming discarded tile
    } else if (reason === 'win_self_draw') {
      winType = '自摸'; // Win by self-draw
    } else if (reason === 'draw') {
      winType = '和局'; // Draw game
    }

    // Determine next dealer based on Taiwanese Mahjong rules:
    // - If dealer (莊) wins or draw, dealer stays the same
    // - If others win, dealer rotates counter-clockwise (next player)
    let nextDealerIndex = this.dealerIndex;
    let dealerRotated = false;
    let gameEnded = false;

    if ((reason === 'win_by_discard' || reason === 'win_self_draw') && winnerId !== dealerPlayer.id) {
      // Non-dealer won, rotate dealer counter-clockwise
      nextDealerIndex = (this.dealerIndex + 1) % this.players.length;
      dealerRotated = true;
    }
    // If dealer won or draw, dealer stays the same (nextDealerIndex unchanged)

    // Update 圈/風 based on dealer rotation
    let nextRound = this.currentRound;
    let nextWind = this.currentWind;

    if (dealerRotated) {
      // Wind follows dealer position: 東(0) → 南(1) → 西(2) → 北(3)
      nextWind = this.roundWinds[nextDealerIndex];

      // Check if we completed a full rotation (dealer moved back to 東/position 0)
      if (nextDealerIndex === 0) {
        // Move to next 圈
        const currentRoundIndex = this.roundWinds.indexOf(this.currentRound);
        const nextRoundIndex = currentRoundIndex + 1;

        if (nextRoundIndex >= 4) {
          // We've completed 北圈 and dealer moved to 東 again - game over!
          gameEnded = true;
        } else {
          nextRound = this.roundWinds[nextRoundIndex];
        }
      }
    }

    // For 出沖 (win by discard), add the discarded tile to the winner's hand
    if (reason === 'win_by_discard' && winnerId && this.lastDiscardedTile) {
      const winnerHand = this.playerHands.get(winnerId);
      if (winnerHand) {
        winnerHand.push(this.lastDiscardedTile);
        console.log(`[END_GAME] Added discarded tile ${this.lastDiscardedTile.suit}-${this.lastDiscardedTile.value} to winner's hand`);
      }
    }

    // Build player results with revealed hands
    const playerResults = this.players.map(player => {
      const isWinner = player.id === winnerId;
      // For 自摸 (self-draw), all other players are losers
      // For 出沖 (win by discard), only the discarder is the loser
      const isLoser = reason === 'win_self_draw'
        ? (player.id !== winnerId)
        : (player.id === loserId);
      const isDealer = this.players[this.dealerIndex].id === player.id;
      const hand = this.playerHands.get(player.id) || [];
      const playerMelds = this.melds.get(player.id) || [];

      // Reveal all concealed gangs (暗槓) when game ends
      const revealedMelds = playerMelds.map(meld => {
        if (meld.type === 'gang' && meld.concealed) {
          return { ...meld, concealed: false };
        }
        return meld;
      });

      return {
        playerId: player.id,
        playerName: player.name,
        position: this.getPlayerWind(player.id),
        isWinner: isWinner,
        isLoser: isLoser,
        isDealer: isDealer,
        score: 0, // TODO: Implement scoring system
        totalScore: 0, // TODO: Track total scores across games
        hand: hand, // Reveal hand tiles
        melds: revealedMelds // Include melds with revealed gangs
      };
    });

    // Build all player hands map for easy access
    const allPlayerHands = {};
    this.players.forEach(player => {
      allPlayerHands[player.id] = this.playerHands.get(player.id) || [];
    });

    this.broadcast({
      type: 'game_ended',
      payload: {
        reason: reason,
        winType: winType,
        winner: winnerId,
        winnerName: winner?.name,
        loser: loserId,
        loserName: loser?.name,
        pattern: winResult?.pattern,
        score: winResult?.score,
        winningCombination: winResult?.winningCombination || null,
        winningTile: reason === 'win_by_discard' ? this.lastDiscardedTile : null, // The tile that completed the win
        currentDealer: dealerPlayer.id,
        nextDealer: this.players[nextDealerIndex].id,
        dealerRotated: dealerRotated,
        currentRound: this.currentRound,
        currentWind: this.currentWind,
        nextRound: nextRound,
        nextWind: nextWind,
        gameEnded: gameEnded, // True if whole game is over (after 北圈北風)
        playerResults: playerResults,
        allPlayerHands: allPlayerHands // Reveal all hands
      }
    });

    // Update state for next game (if not ended)
    if (!gameEnded) {
      this.dealerIndex = nextDealerIndex;
      this.currentRound = nextRound;
      this.currentWind = nextWind;
      console.log(`[END_GAME] Next game will start from dealer: ${this.players[this.dealerIndex].name}`);
    } else {
      console.log(`[END_GAME] Game series completed! No more games.`);
    }
    console.log(`[END_GAME] Completed successfully`);
    } catch (error) {
      console.error('[END_GAME] Error in endGame:', error);
      console.error('[END_GAME] Stack:', error.stack);
    }
  }

  // Handle multiple winners (雙嚮/三嚮)
  endGameMultipleWinners(winners, loserId) {
    this.gameState = 'ended';

    const loser = loserId ? this.players.find(p => p.id === loserId) : null;
    const dealerPlayer = this.players[this.dealerIndex];
    const winnerIds = winners.map(w => w.playerId);

    // Determine win type based on number of winners
    let winType = '出沖';
    if (winners.length === 2) {
      winType = '雙嚮';
    } else if (winners.length === 3) {
      winType = '三嚮';
    }

    // Determine next dealer
    // For 雙嚮/三嚮 (multiple winners), dealer NEVER rotates regardless of who won
    // Also, 圈 and 風 stay the same - the game state is completely frozen
    let nextDealerIndex = this.dealerIndex;
    let dealerRotated = false;
    let gameEnded = false;

    // Dealer stays the same for multiple winners (雙嚮/三嚮)
    // 圈 and 風 also stay the same
    let nextRound = this.currentRound;
    let nextWind = this.currentWind;

    console.log(`[END_GAME_MULTI] ${winType}: Dealer stays at ${dealerPlayer.name}, 圈=${nextRound}, 風=${nextWind}`);

    // Build player results with revealed hands
    const playerResults = this.players.map(player => {
      const isWinner = winnerIds.includes(player.id);
      const isLoser = player.id === loserId;
      const isDealer = this.players[this.dealerIndex].id === player.id;
      const hand = this.playerHands.get(player.id) || [];
      const playerMelds = this.melds.get(player.id) || [];

      return {
        playerId: player.id,
        playerName: player.name,
        position: this.getPlayerWind(player.id),
        isWinner: isWinner,
        isLoser: isLoser,
        isDealer: isDealer,
        score: 0, // TODO: Implement scoring system
        totalScore: 0,
        hand: hand, // Reveal hand tiles
        melds: playerMelds // Include melds
      };
    });

    // Build all player hands map for easy access
    const allPlayerHands = {};
    this.players.forEach(player => {
      allPlayerHands[player.id] = this.playerHands.get(player.id) || [];
    });

    this.broadcast({
      type: 'game_ended',
      payload: {
        reason: 'multiple_winners',
        winType: winType,
        winners: winnerIds,
        winnerNames: winners.map(w => this.players.find(p => p.id === w.playerId)?.name),
        loser: loserId,
        loserName: loser?.name,
        currentDealer: dealerPlayer.id,
        nextDealer: this.players[nextDealerIndex].id,
        dealerRotated: dealerRotated,
        currentRound: this.currentRound,
        currentWind: this.currentWind,
        nextRound: nextRound,
        nextWind: nextWind,
        gameEnded: gameEnded,
        playerResults: playerResults,
        allPlayerHands: allPlayerHands // Reveal all hands
      }
    });

    // Update state for next game (if not ended)
    if (!gameEnded) {
      this.dealerIndex = nextDealerIndex;
      this.currentRound = nextRound;
      this.currentWind = nextWind;
      console.log(`[END_GAME_MULTI] Next game will start from dealer: ${this.players[this.dealerIndex].name}`);
    } else {
      console.log(`[END_GAME_MULTI] Game series completed! No more games.`);
    }
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

