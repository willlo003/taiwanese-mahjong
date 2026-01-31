import { TileManager } from './TileManager.js';
import { WinValidator } from './WinValidator.js';

export class MahjongGame {
  constructor(players, broadcastFn) {
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
    this.flowerReplacementQueue = []; // Queue for flower replacement phase
    this.playerHasDrawn = new Map(); // Track if each player has drawn this turn
    this.playersWithClaimOptions = new Set(); // Track which players have claim options
    this.playersPassed = new Set(); // Track which players have passed on claiming
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
        phase: this.gamePhase
      }
    });

    // Send initial hands to each player
    this.sendHandsToPlayers();

    // Start flower replacement phase (補花)
    this.startFlowerReplacementPhase();
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

  dealInitialTiles() {
    // Dealer (莊) gets 17 tiles, others get 16
    this.players.forEach((player, index) => {
      const hand = [];
      const tileCount = index === this.dealerIndex ? 17 : 16;
      for (let i = 0; i < tileCount; i++) {
        hand.push(this.tileManager.drawTile());
      }
      this.playerHands.set(player.id, hand);
      this.discardPiles.set(player.id, []);
      this.melds.set(player.id, []); // Initialize melds

      // Initialize draw state - dealer starts with 17 tiles so mark as "drawn"
      this.playerHasDrawn.set(player.id, index === this.dealerIndex);
    });
  }

  // Check if a tile is a bonus tile (flower or season)
  isBonusTile(tile) {
    // Tiles have type: 'bonus' and suit: 'flower' or 'season'
    return tile.type === 'bonus' || tile.suit === 'flower' || tile.suit === 'season';
  }

  // Start the flower replacement phase (補花)
  startFlowerReplacementPhase() {
    console.log('=== Starting flower replacement phase (補花) ===');
    console.log('Dealer index:', this.dealerIndex);
    console.log('Players:', this.players.map(p => p.name));

    // Broadcast that we're in flower replacement phase
    console.log('Broadcasting phase_changed: flower_replacement');
    this.broadcast({
      type: 'phase_changed',
      payload: {
        phase: 'flower_replacement',
        message: '補花中'
      }
    });

    // Start processing from dealer (莊), anti-clockwise
    this.flowerReplacementPlayerIndex = 0; // Offset from dealer
    this.flowerReplacementRound = 0; // Track rounds to detect completion

    // Start the sequential flower replacement process
    console.log('Calling processNextPlayerFlowerReplacement...');
    this.processNextPlayerFlowerReplacement();
  }

  // Process flower replacement for one player at a time
  processNextPlayerFlowerReplacement() {
    console.log('=== processNextPlayerFlowerReplacement ===');
    console.log('flowerReplacementPlayerIndex:', this.flowerReplacementPlayerIndex);
    console.log('flowerReplacementRound:', this.flowerReplacementRound);

    const playerIndex = (this.dealerIndex + this.flowerReplacementPlayerIndex) % this.players.length;
    const player = this.players[playerIndex];
    const hand = this.playerHands.get(player.id);

    console.log(`Checking player ${player.name} (index ${playerIndex}), hand size: ${hand.length}`);

    // Find all bonus tiles in hand
    const bonusTiles = hand.filter(tile => this.isBonusTile(tile));
    console.log(`Found ${bonusTiles.length} bonus tiles:`, bonusTiles.map(t => `${t.type}-${t.value}`));

    if (bonusTiles.length > 0) {
      // Reset round counter since we found flowers
      this.flowerReplacementRound = 0;

      // Notify all players who is currently doing 補花
      this.broadcast({
        type: 'flower_replacement_turn',
        payload: {
          playerId: player.id,
          playerName: player.name
        }
      });

      // Remove bonus tiles from hand
      bonusTiles.forEach(bonusTile => {
        const index = hand.findIndex(t =>
          t.type === bonusTile.type && t.value === bonusTile.value
        );
        if (index !== -1) {
          hand.splice(index, 1);
        }
      });

      // Add to revealed bonus tiles
      const revealed = this.revealedBonusTiles.get(player.id);
      revealed.push(...bonusTiles);

      // Draw replacement tiles (same number as removed)
      const newTiles = [];
      for (let j = 0; j < bonusTiles.length; j++) {
        const newTile = this.tileManager.drawTile();
        if (newTile) {
          hand.push(newTile);
          newTiles.push(newTile);
        }
      }

      // Notify the player who replaced flowers
      player.ws.send(JSON.stringify({
        type: 'bonus_tiles_replaced',
        payload: {
          bonusTiles: bonusTiles,
          newTiles: newTiles,
          hand: hand,
          revealedBonusTiles: revealed,
          tilesRemaining: this.tileManager.getRemainingCount()
        }
      }));

      // Notify others about the revealed bonus tiles
      this.broadcastToOthers(player.id, {
        type: 'player_revealed_bonus',
        payload: {
          playerId: player.id,
          playerName: player.name,
          bonusTiles: bonusTiles,
          bonusTileCount: bonusTiles.length,
          tilesRemaining: this.tileManager.getRemainingCount()
        }
      });

      // After a delay, check this same player again (they might have drawn more flowers)
      setTimeout(() => {
        this.processNextPlayerFlowerReplacement();
      }, 800); // 800ms delay for animation

    } else {
      // No flowers for this player, move to next player
      this.flowerReplacementPlayerIndex = (this.flowerReplacementPlayerIndex + 1) % this.players.length;
      this.flowerReplacementRound++;

      // If we've gone through all 4 players without finding any flowers, phase is complete
      if (this.flowerReplacementRound >= 4) {
        this.completeFlowerReplacementPhase();
      } else {
        // Continue to next player after a short delay
        setTimeout(() => {
          this.processNextPlayerFlowerReplacement();
        }, 200);
      }
    }
  }

  // Complete the flower replacement phase and move to 打牌
  completeFlowerReplacementPhase() {
    console.log('Flower replacement phase complete. Moving to 打牌 phase.');

    // Verify tile counts (for debugging)
    this.players.forEach((player, index) => {
      const hand = this.playerHands.get(player.id);
      const expectedCount = index === this.dealerIndex ? 17 : 16;
      console.log(`Player ${player.name}: ${hand.length} tiles (expected ${expectedCount})`);
    });

    this.gamePhase = 'draw_discard';
    this.broadcast({
      type: 'phase_changed',
      payload: {
        phase: 'draw_discard',
        message: '打牌'
      }
    });

    // Dealer starts first turn (already has 17 tiles, so just notify)
    this.notifyCurrentPlayer();
  }

  notifyCurrentPlayer() {
    const currentPlayer = this.players[this.currentPlayerIndex];
    this.broadcast({
      type: 'turn_changed',
      payload: {
        currentPlayer: currentPlayer.id,
        phase: this.gamePhase
      }
    });
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

  drawTile(playerIndex) {
    const player = this.players[playerIndex];
    const tile = this.tileManager.drawTile();

    if (!tile) {
      this.endGame('draw'); // No more tiles
      return;
    }

    const hand = this.playerHands.get(player.id);
    hand.push(tile);

    // Send updated hand to the player
    player.ws.send(JSON.stringify({
      type: 'tile_drawn',
      payload: {
        tile: tile,
        hand: hand,
        tilesRemaining: this.tileManager.getRemainingCount()
      }
    }));

    // Notify others that a tile was drawn
    this.broadcastToOthers(player.id, {
      type: 'player_drew',
      payload: {
        playerId: player.id,
        tilesRemaining: this.tileManager.getRemainingCount()
      }
    });
  }

  handlePlayerAction(playerId, action) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    const playerIndex = this.players.indexOf(player);

    // Claim actions can be done by any player during claim window (before turn check)
    const claimActions = ['pong', 'gang', 'chow', 'shang', 'hu'];

    if (claimActions.includes(action.type)) {
      // Register the claim (will be resolved after freeze period)
      const registered = this.registerClaim(playerId, action.type, action.tiles);
      if (registered) {
        player.ws.send(JSON.stringify({
          type: 'claim_registered',
          payload: { claimType: action.type }
        }));
      }
      return;
    }

    // Handle pass action - player explicitly passes on claiming
    if (action.type === 'pass') {
      this.handlePass(playerId);
      return;
    }

    // Handle cancel claim action - player cancels their previous claim
    if (action.type === 'cancel_claim') {
      this.handleCancelClaim(playerId);
      return;
    }

    // Verify it's the player's turn for non-claim actions
    if (playerIndex !== this.currentPlayerIndex) {
      player.ws.send(JSON.stringify({
        type: 'error',
        message: 'Not your turn'
      }));
      return;
    }

    switch (action.type) {
      case 'draw':
        this.handleDraw(playerId);
        break;
      case 'discard':
        this.handleDiscard(playerId, action.tile);
        break;
      default:
        player.ws.send(JSON.stringify({
          type: 'error',
          message: 'Unknown action'
        }));
    }
  }

  handleDraw(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    const hand = this.playerHands.get(playerId);

    // Check if player has 16 tiles (should draw)
    if (hand.length !== 16) {
      player.ws.send(JSON.stringify({
        type: 'error',
        message: 'You already have 17 tiles - please discard'
      }));
      return;
    }

    // Close claim window when player draws
    if (this.claimWindowOpen) {
      this.claimWindowOpen = false;
      if (this.claimFreezeTimer) {
        clearTimeout(this.claimFreezeTimer);
        this.claimFreezeTimer = null;
      }
      this.pendingClaims.clear();

      // Broadcast that claim window is closed
      this.broadcast({
        type: 'claim_period_end',
        payload: {
          claimedBy: null,
          claimType: null,
          reason: 'player_drew'
        }
      });
    }

    // Clear last discarded tile since player is drawing
    this.lastDiscardedTile = null;
    this.lastDiscardedBy = null;

    // Draw tiles, handling flower/season tiles (補花)
    let tile = this.tileManager.drawTile();
    const bonusTilesDrawn = [];

    if (!tile) {
      this.endGame('draw'); // No more tiles
      return;
    }

    // Keep drawing if we get bonus tiles (flower/season)
    while (tile && this.isBonusTile(tile)) {
      bonusTilesDrawn.push(tile);

      // Add to revealed bonus tiles
      const revealed = this.revealedBonusTiles.get(playerId);
      revealed.push(tile);

      // Draw another tile
      tile = this.tileManager.drawTile();

      if (!tile) {
        this.endGame('draw'); // No more tiles
        return;
      }
    }

    // Add the non-bonus tile to hand
    hand.push(tile);

    // If we drew bonus tiles, notify everyone
    if (bonusTilesDrawn.length > 0) {
      const revealed = this.revealedBonusTiles.get(playerId);

      // Notify the player about the flower replacement
      player.ws.send(JSON.stringify({
        type: 'draw_flower_replaced',
        payload: {
          bonusTiles: bonusTilesDrawn,
          finalTile: tile,
          hand: hand,
          revealedBonusTiles: revealed,
          tilesRemaining: this.tileManager.getRemainingCount()
        }
      }));

      // Notify others about the flower replacement
      this.broadcastToOthers(playerId, {
        type: 'player_draw_flower_replaced',
        payload: {
          playerId: playerId,
          playerName: player.name,
          bonusTiles: bonusTilesDrawn,
          revealedBonusTiles: revealed,
          tilesRemaining: this.tileManager.getRemainingCount(),
          handSize: hand.length
        }
      });
    } else {
      // Normal draw - send updated hand to the player
      player.ws.send(JSON.stringify({
        type: 'tile_drawn',
        payload: {
          tile: tile,
          hand: hand,
          tilesRemaining: this.tileManager.getRemainingCount()
        }
      }));

      // Notify others that a tile was drawn (without showing the tile)
      this.broadcastToOthers(playerId, {
        type: 'player_drew',
        payload: {
          playerId: playerId,
          tilesRemaining: this.tileManager.getRemainingCount(),
          handSize: hand.length
        }
      });
    }
  }

  handleDiscard(playerId, tile) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    const hand = this.playerHands.get(playerId);

    // Check if hand size is valid for discarding: 3n + 2 where n = 0-5
    // After drawing or claiming, hand should be: 17, 14, 11, 8, 5, or 2 tiles
    const isValidHandSize = hand.length >= 2 && hand.length <= 17 && (hand.length - 2) % 3 === 0;
    if (!isValidHandSize) {
      player.ws.send(JSON.stringify({
        type: 'error',
        message: `Cannot discard - invalid hand size (${hand.length} tiles)`
      }));
      return;
    }

    const tileIndex = hand.findIndex(t => t.id === tile.id);

    if (tileIndex === -1) {
      return; // Invalid tile
    }

    // Remove tile from hand
    hand.splice(tileIndex, 1);

    // Add to discard pile
    const discardPile = this.discardPiles.get(playerId);
    discardPile.push(tile);

    // Store last discarded tile for pong/gang/chow/hu
    this.lastDiscardedTile = tile;
    this.lastDiscardedBy = playerId;

    // Send updated hand and discard pile to the player who discarded
    console.log(`[DISCARD] Sending hand_update to player ${playerId}, hand size: ${hand.length}`);
    player.ws.send(JSON.stringify({
      type: 'hand_update',
      payload: {
        hand: hand,
        tilesRemaining: this.tileManager.getRemainingCount(),
        discardPile: discardPile
      }
    }));

    // Broadcast discard to OTHER players (not the one who discarded)
    // The player who discarded already got their hand update above
    console.log(`[DISCARD] Broadcasting tile_discarded to others (excluding ${playerId})`);
    this.broadcastToOthers(playerId, {
      type: 'tile_discarded',
      payload: {
        playerId: playerId,
        tile: tile,
        discardPile: discardPile,
        handSize: hand.length
      }
    });

    // Check if other players can pong/gang/chow/hu
    this.checkClaimActions(tile, playerId);
  }

  handleHu(playerId) {
    const hand = this.playerHands.get(playerId);
    const melds = this.melds.get(playerId);

    // Combine hand tiles with melds for validation
    const allTiles = [...hand];
    melds.forEach(meld => {
      allTiles.push(...meld.tiles);
    });

    const winResult = WinValidator.isWinningHand(allTiles, this.lastDiscardedTile);

    if (winResult.isWin) {
      const player = this.players.find(p => p.id === playerId);
      console.log(`Player ${player.name} wins with pattern: ${winResult.pattern}`);
      this.endGame('win', playerId, winResult);
    } else {
      // Invalid win claim
      const player = this.players.find(p => p.id === playerId);
      player.ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid win - hand does not meet winning conditions'
      }));
    }
  }

  checkClaimActions(tile, discardedBy) {
    // Give other players a chance to claim the tile
    // Priority order (highest to lowest): 食(hu) -> 槓(gang) -> 碰(pong) -> 上(chow)

    const discardedByIndex = this.players.findIndex(p => p.id === discardedBy);
    const nextPlayerIndex = (discardedByIndex + 1) % 4; // 下家
    const nextPlayerId = this.players[nextPlayerIndex].id;

    // Clear any existing claims and timer
    this.pendingClaims.clear();
    if (this.claimFreezeTimer) {
      clearTimeout(this.claimFreezeTimer);
    }

    // Open claim window
    this.claimWindowOpen = true;

    // Check what each player can do
    const claimOptions = [];

    this.players.forEach((player, index) => {
      if (player.id === discardedBy) return;

      const hand = this.playerHands.get(player.id);
      const matchingTiles = hand.filter(t =>
        t.suit === tile.suit && t.value === tile.value
      );

      // Build possible claim sets
      const possibleClaims = [];

      // Pong: 3 same tiles (2 from hand + discarded)
      if (matchingTiles.length >= 2) {
        const pongTiles = matchingTiles.slice(0, 2);
        possibleClaims.push({
          type: 'pong',
          tiles: [pongTiles[0], tile, pongTiles[1]], // hand, discarded, hand
          handTiles: pongTiles
        });
      }

      // Gang: 4 same tiles (3 from hand + discarded)
      if (matchingTiles.length >= 3) {
        const gangTiles = matchingTiles.slice(0, 3);
        possibleClaims.push({
          type: 'gang',
          tiles: [gangTiles[0], gangTiles[1], tile, gangTiles[2]], // hand, hand, discarded, hand
          handTiles: gangTiles
        });
      }

      // Chow/Shang: sequence (only 下家 can chow, and only for numbered suits)
      const isNextPlayer = player.id === nextPlayerId;
      const isNumberedSuit = ['bamboo', 'character', 'dot'].includes(tile.suit);

      if (isNextPlayer && isNumberedSuit) {
        const suitTiles = hand.filter(t => t.suit === tile.suit);
        const tileValue = tile.value;

        // Check all possible sequences: [v-2,v-1,v], [v-1,v,v+1], [v,v+1,v+2]
        // Display order should be: (hand tile)(discarded tile)(hand tile)

        // Sequence 1: discarded is highest (v-2, v-1, v)
        // e.g., discarded=8, hand has 6,7 → display: 6-8-7
        if (tileValue >= 3) {
          const t1 = suitTiles.find(t => t.value === tileValue - 2); // lowest (e.g., 6)
          const t2 = suitTiles.find(t => t.value === tileValue - 1); // middle (e.g., 7)
          if (t1 && t2) {
            possibleClaims.push({
              type: 'chow',
              tiles: [t1, t2, tile], // sorted order for validation: 6, 7, 8
              displayTiles: [t1, tile, t2], // display order: hand(6), discarded(8), hand(7)
              handTiles: [t1, t2]
            });
          }
        }

        // Sequence 2: discarded is middle (v-1, v, v+1)
        // e.g., discarded=7, hand has 6,8 → display: 6-7-8
        if (tileValue >= 2 && tileValue <= 8) {
          const t1 = suitTiles.find(t => t.value === tileValue - 1); // lower (e.g., 6)
          const t2 = suitTiles.find(t => t.value === tileValue + 1); // higher (e.g., 8)
          if (t1 && t2) {
            possibleClaims.push({
              type: 'chow',
              tiles: [t1, tile, t2], // sorted order for validation: 6, 7, 8
              displayTiles: [t1, tile, t2], // display order: hand(6), discarded(7), hand(8)
              handTiles: [t1, t2]
            });
          }
        }

        // Sequence 3: discarded is lowest (v, v+1, v+2)
        // e.g., discarded=6, hand has 7,8 → display: 7-6-8
        if (tileValue <= 7) {
          const t1 = suitTiles.find(t => t.value === tileValue + 1); // middle (e.g., 7)
          const t2 = suitTiles.find(t => t.value === tileValue + 2); // highest (e.g., 8)
          if (t1 && t2) {
            possibleClaims.push({
              type: 'chow',
              tiles: [tile, t1, t2], // sorted order for validation: 6, 7, 8
              displayTiles: [t1, tile, t2], // display order: hand(7), discarded(6), hand(8)
              handTiles: [t1, t2]
            });
          }
        }
      }

      if (possibleClaims.length > 0) {
        claimOptions.push({
          playerId: player.id,
          canPong: matchingTiles.length >= 2,
          canGang: matchingTiles.length >= 3,
          canChow: isNextPlayer && isNumberedSuit && possibleClaims.some(c => c.type === 'chow'),
          canShang: isNextPlayer && isNumberedSuit && possibleClaims.some(c => c.type === 'chow'),
          isNextPlayer,
          possibleClaims
        });
      }
    });

    // Check if anyone has any claim options
    const anyoneCanClaim = claimOptions.length > 0;

    // If no one can claim, skip freeze period entirely
    if (!anyoneCanClaim) {
      console.log('[CLAIM] No one can claim, skipping freeze period');
      this.claimWindowOpen = false;
      this.nextTurn();
      return;
    }

    // Track which players have claim options and reset passed set
    this.playersWithClaimOptions.clear();
    this.playersPassed.clear();
    claimOptions.forEach(option => {
      this.playersWithClaimOptions.add(option.playerId);
    });

    // Use 5 seconds freeze period when someone can claim
    const freezeTimeout = 5000;

    // Notify all players of claim options and freeze period
    this.broadcast({
      type: 'claim_period_start',
      payload: {
        tile: tile,
        discardedBy: discardedBy,
        timeout: freezeTimeout
      }
    });

    // Send individual claim options to each player
    claimOptions.forEach(option => {
      const player = this.players.find(p => p.id === option.playerId);
      player.ws.send(JSON.stringify({
        type: 'claim_options',
        payload: {
          tile: tile,
          canPong: option.canPong,
          canGang: option.canGang,
          canChow: option.canChow,
          canShang: option.canShang,
          canHu: option.canHu || false,
          isNextPlayer: option.isNextPlayer,
          possibleClaims: option.possibleClaims,
          timeout: freezeTimeout
        }
      }));
    });

    // Start freeze timer
    console.log(`[CLAIM] Starting freeze timer for ${freezeTimeout}ms, claimWindowOpen=${this.claimWindowOpen}`);
    console.log(`[CLAIM] Players with claim options: ${Array.from(this.playersWithClaimOptions).join(', ')}`);
    this.claimFreezeTimer = setTimeout(() => {
      console.log(`[CLAIM] Freeze timer expired, claimWindowOpen=${this.claimWindowOpen}, calling resolveClaims`);
      this.resolveClaims();
    }, freezeTimeout);
  }

  // Register a claim from a player
  registerClaim(playerId, claimType, tiles = null) {
    if (!this.claimWindowOpen) {
      console.log(`[CLAIM] Claim window closed, ignoring ${claimType} from ${playerId}`);
      return false;
    }

    // Validate the claim
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    // Priority values: 食(hu)=4, 槓(gang)=3, 碰(pong)=2, 上(shang/chow)=1
    const priorityMap = { 'hu': 4, 'gang': 3, 'pong': 2, 'chow': 1, 'shang': 1 };
    const priority = priorityMap[claimType] || 0;

    console.log(`[CLAIM] Registering ${claimType} from player ${playerId} with priority ${priority}`);

    this.pendingClaims.set(playerId, {
      type: claimType,
      priority: priority,
      tiles: tiles,
      playerId: playerId
    });

    // Remove from passed set if they had passed before
    this.playersPassed.delete(playerId);

    return true;
  }

  // Handle pass action - player explicitly passes on claiming
  handlePass(playerId) {
    if (!this.claimWindowOpen) {
      console.log(`[CLAIM] Claim window closed, ignoring pass from ${playerId}`);
      return;
    }

    // Only track pass if player has claim options
    if (!this.playersWithClaimOptions.has(playerId)) {
      console.log(`[CLAIM] Player ${playerId} has no claim options, ignoring pass`);
      return;
    }

    console.log(`[CLAIM] Player ${playerId} passed on claiming`);
    this.playersPassed.add(playerId);

    // Remove any pending claim from this player
    this.pendingClaims.delete(playerId);

    // Notify the player that their pass was registered
    const player = this.players.find(p => p.id === playerId);
    if (player) {
      player.ws.send(JSON.stringify({
        type: 'pass_registered',
        payload: {}
      }));
    }

    // Check if all players with claim options have passed
    this.checkAllPlayersPassed();
  }

  // Handle cancel claim action - player cancels their previous claim
  handleCancelClaim(playerId) {
    if (!this.claimWindowOpen) {
      console.log(`[CLAIM] Claim window closed, ignoring cancel from ${playerId}`);
      return;
    }

    console.log(`[CLAIM] Player ${playerId} cancelled their claim`);
    this.pendingClaims.delete(playerId);

    // Notify the player that their claim was cancelled
    const player = this.players.find(p => p.id === playerId);
    if (player) {
      player.ws.send(JSON.stringify({
        type: 'claim_cancelled',
        payload: {}
      }));
    }
  }

  // Check if all players with claim options have passed
  checkAllPlayersPassed() {
    // If all players with claim options have passed, end freeze period immediately
    let allPassed = true;
    this.playersWithClaimOptions.forEach(playerId => {
      if (!this.playersPassed.has(playerId)) {
        allPassed = false;
      }
    });

    if (allPassed && this.playersWithClaimOptions.size > 0) {
      console.log('[CLAIM] All players passed, ending freeze period immediately');

      // Clear the freeze timer
      if (this.claimFreezeTimer) {
        clearTimeout(this.claimFreezeTimer);
        this.claimFreezeTimer = null;
      }

      // Resolve claims immediately (will call nextTurn since no claims)
      this.resolveClaims();
    }
  }

  // Resolve claims after freeze period
  resolveClaims() {
    // Guard against double execution
    if (!this.claimWindowOpen) {
      console.log('[CLAIM] resolveClaims called but claim window already closed, ignoring');
      return;
    }

    this.claimWindowOpen = false;

    // Clear the freeze timer if it's still running
    if (this.claimFreezeTimer) {
      clearTimeout(this.claimFreezeTimer);
      this.claimFreezeTimer = null;
    }

    if (this.pendingClaims.size === 0) {
      // No claims, move to next turn
      console.log('[CLAIM] No claims, moving to next turn');

      // Broadcast that claim period ended with no claim
      this.broadcast({
        type: 'claim_period_end',
        payload: {
          claimedBy: null,
          claimType: null
        }
      });

      this.nextTurn();
      return;
    }

    // Find the highest priority claim
    let highestClaim = null;
    this.pendingClaims.forEach((claim) => {
      if (!highestClaim || claim.priority > highestClaim.priority) {
        highestClaim = claim;
      }
    });

    console.log(`[CLAIM] Resolving claim: ${highestClaim.type} from ${highestClaim.playerId}`);

    // Clear pending claims
    this.pendingClaims.clear();

    // Broadcast that claim period ended with the winning claim
    this.broadcast({
      type: 'claim_period_end',
      payload: {
        claimedBy: highestClaim.playerId,
        claimType: highestClaim.type
      }
    });

    // Execute the claim
    switch (highestClaim.type) {
      case 'hu':
        this.executeHuClaim(highestClaim.playerId);
        break;
      case 'gang':
        this.executeGangClaim(highestClaim.playerId);
        break;
      case 'pong':
        this.executePongClaim(highestClaim.playerId);
        break;
      case 'chow':
      case 'shang':
        // 上 (shang) is the same as chow - execute chow claim
        this.executeChowClaim(highestClaim.playerId, highestClaim.tiles);
        break;
    }
  }

  // Execute pong claim
  executePongClaim(playerId) {
    const tile = this.lastDiscardedTile;
    const hand = this.playerHands.get(playerId);

    // Find 2 matching tiles in hand
    const matchingTiles = hand.filter(t =>
      t.suit === tile.suit && t.value === tile.value
    ).slice(0, 2);

    if (matchingTiles.length < 2) {
      console.log('[CLAIM] Invalid pong - not enough matching tiles');
      this.nextTurn();
      return;
    }

    // Remove tiles from hand
    matchingTiles.forEach(t => {
      const idx = hand.findIndex(ht => ht.id === t.id);
      if (idx !== -1) hand.splice(idx, 1);
    });

    // Remove tile from discard pile
    const discardPile = this.discardPiles.get(this.lastDiscardedBy);
    const discardIdx = discardPile.findIndex(t => t.id === tile.id);
    if (discardIdx !== -1) {
      discardPile.splice(discardIdx, 1);
    }

    // Add meld to player's melds
    const melds = this.melds.get(playerId);
    const newMeld = {
      type: 'pong',
      tiles: [tile, ...matchingTiles]
    };
    melds.push(newMeld);

    // Save discardedBy before clearing
    const discardedBy = this.lastDiscardedBy;

    // Clear last discarded tile
    this.lastDiscardedTile = null;
    this.lastDiscardedBy = null;

    // Broadcast the pong
    this.broadcast({
      type: 'pong_claimed',
      payload: {
        playerId: playerId,
        tile: tile,
        meld: newMeld,
        discardPile: discardPile,
        discardedBy: discardedBy
      }
    });

    // Update the player's hand
    const player = this.players.find(p => p.id === playerId);
    player.ws.send(JSON.stringify({
      type: 'hand_update',
      payload: {
        hand: hand,
        tilesRemaining: this.tileManager.getRemainingCount()
      }
    }));

    // Player who claimed must discard (they now have 17 tiles equivalent with meld)
    this.currentPlayerIndex = this.players.findIndex(p => p.id === playerId);
    this.broadcast({
      type: 'turn_changed',
      payload: {
        currentPlayer: playerId,
        mustDiscard: true
      }
    });
  }

  // Execute gang claim
  executeGangClaim(playerId) {
    const tile = this.lastDiscardedTile;
    const hand = this.playerHands.get(playerId);

    // Find 3 matching tiles in hand
    const matchingTiles = hand.filter(t =>
      t.suit === tile.suit && t.value === tile.value
    ).slice(0, 3);

    if (matchingTiles.length < 3) {
      console.log('[CLAIM] Invalid gang - not enough matching tiles');
      this.nextTurn();
      return;
    }

    // Remove tiles from hand
    matchingTiles.forEach(t => {
      const idx = hand.findIndex(ht => ht.id === t.id);
      if (idx !== -1) hand.splice(idx, 1);
    });

    // Remove tile from discard pile
    const discardPile = this.discardPiles.get(this.lastDiscardedBy);
    const discardIdx = discardPile.findIndex(t => t.id === tile.id);
    if (discardIdx !== -1) {
      discardPile.splice(discardIdx, 1);
    }

    // Add meld to player's melds
    const melds = this.melds.get(playerId);
    const newMeld = {
      type: 'gang',
      tiles: [tile, ...matchingTiles]
    };
    melds.push(newMeld);

    // Save discardedBy before clearing
    const discardedBy = this.lastDiscardedBy;

    // Clear last discarded tile
    this.lastDiscardedTile = null;
    this.lastDiscardedBy = null;

    // Broadcast the gang
    this.broadcast({
      type: 'gang_claimed',
      payload: {
        playerId: playerId,
        tile: tile,
        meld: newMeld,
        discardPile: discardPile,
        discardedBy: discardedBy
      }
    });

    // Update the player's hand
    const player = this.players.find(p => p.id === playerId);
    player.ws.send(JSON.stringify({
      type: 'hand_update',
      payload: {
        hand: hand,
        tilesRemaining: this.tileManager.getRemainingCount()
      }
    }));

    // Player who claimed gang must draw a replacement tile from the back
    // For now, just draw normally
    const newTile = this.tileManager.drawTile();
    if (newTile) {
      hand.push(newTile);
      player.ws.send(JSON.stringify({
        type: 'tile_drawn',
        payload: {
          tile: newTile,
          hand: hand,
          tilesRemaining: this.tileManager.getRemainingCount()
        }
      }));
    }

    // Player must discard after gang
    this.currentPlayerIndex = this.players.findIndex(p => p.id === playerId);
    this.broadcast({
      type: 'turn_changed',
      payload: {
        currentPlayer: playerId,
        mustDiscard: true
      }
    });
  }

  // Execute chow claim
  executeChowClaim(playerId, claimData) {
    const tile = this.lastDiscardedTile;
    const hand = this.playerHands.get(playerId);

    let handTiles = null;
    let displayTiles = null;

    // Check if claimData contains the full claim object with handTiles and displayTiles
    if (claimData && claimData.handTiles && claimData.displayTiles) {
      handTiles = claimData.handTiles;
      displayTiles = claimData.displayTiles;
    } else if (claimData && Array.isArray(claimData) && claimData.length === 2) {
      // Legacy: claimData is just the hand tiles array
      handTiles = claimData;
    }

    // If handTiles not provided, auto-detect from hand
    if (!handTiles || handTiles.length !== 2) {
      const tileValue = tile.value;
      const tileSuit = tile.suit;

      if (!['bamboo', 'character', 'dot'].includes(tileSuit)) {
        console.log('[CLAIM] Invalid chow - cannot chow honor tiles');
        this.nextTurn();
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
          // Display order: hand tile, discarded, hand tile (sorted by value)
          const sorted = [t1, t2].sort((a, b) => a.value - b.value);
          if (tile.value < sorted[0].value) {
            displayTiles = [sorted[0], tile, sorted[1]];
          } else if (tile.value > sorted[1].value) {
            displayTiles = [sorted[0], tile, sorted[1]];
          } else {
            displayTiles = [sorted[0], tile, sorted[1]];
          }
          break;
        }
      }

      if (!handTiles) {
        console.log('[CLAIM] Invalid chow - no matching tiles found in hand');
        this.nextTurn();
        return;
      }
    }

    // Validate the chow forms a sequence
    const allTiles = [tile, ...handTiles].sort((a, b) => a.value - b.value);
    const isValidSequence =
      allTiles[0].suit === allTiles[1].suit &&
      allTiles[1].suit === allTiles[2].suit &&
      allTiles[1].value === allTiles[0].value + 1 &&
      allTiles[2].value === allTiles[1].value + 1;

    if (!isValidSequence) {
      console.log('[CLAIM] Invalid chow - tiles do not form a sequence');
      this.nextTurn();
      return;
    }

    // Remove tiles from hand (find by id)
    handTiles.forEach(t => {
      const idx = hand.findIndex(ht => ht.id === t.id);
      if (idx !== -1) hand.splice(idx, 1);
    });

    // Remove tile from discard pile
    const discardPile = this.discardPiles.get(this.lastDiscardedBy);
    const discardIdx = discardPile.findIndex(t => t.id === tile.id);
    if (discardIdx !== -1) {
      discardPile.splice(discardIdx, 1);
    }

    // Use displayTiles for meld display order, fallback to sorted tiles
    const meldTiles = displayTiles || allTiles;

    // Add meld to player's melds
    const melds = this.melds.get(playerId);
    const newMeld = {
      type: 'chow',
      tiles: meldTiles
    };
    melds.push(newMeld);

    // Save discardedBy before clearing
    const discardedBy = this.lastDiscardedBy;

    // Clear last discarded tile
    this.lastDiscardedTile = null;
    this.lastDiscardedBy = null;

    // Broadcast the chow
    this.broadcast({
      type: 'chow_claimed',
      payload: {
        playerId: playerId,
        tile: tile,
        meld: newMeld,
        discardPile: discardPile,
        discardedBy: discardedBy
      }
    });

    // Update the player's hand
    const player = this.players.find(p => p.id === playerId);
    player.ws.send(JSON.stringify({
      type: 'hand_update',
      payload: {
        hand: hand,
        tilesRemaining: this.tileManager.getRemainingCount()
      }
    }));

    // Player who claimed must discard
    this.currentPlayerIndex = this.players.findIndex(p => p.id === playerId);
    this.broadcast({
      type: 'turn_changed',
      payload: {
        currentPlayer: playerId,
        mustDiscard: true
      }
    });
  }

  // Execute hu claim
  executeHuClaim(playerId) {
    // For now, just validate and end game
    const hand = this.playerHands.get(playerId);
    const melds = this.melds.get(playerId);

    const allTiles = [...hand];
    melds.forEach(meld => {
      allTiles.push(...meld.tiles);
    });

    const winResult = WinValidator.isWinningHand(allTiles, this.lastDiscardedTile);

    if (winResult.isWin) {
      this.endGame('win', playerId, winResult);
    } else {
      // Invalid hu claim
      const player = this.players.find(p => p.id === playerId);
      player.ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid win - hand does not meet winning conditions'
      }));
      this.nextTurn();
    }
  }

  nextTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 4;
    const nextPlayer = this.players[this.currentPlayerIndex];

    console.log(`[TURN] nextTurn called, next player: ${nextPlayer.name} (index: ${this.currentPlayerIndex})`);

    // Reset draw state for the new turn
    this.playerHasDrawn.set(nextPlayer.id, false);

    this.broadcast({
      type: 'turn_changed',
      payload: {
        currentPlayer: nextPlayer.id
      }
    });

    // Auto-draw for the next player
    console.log(`[TURN] Calling autoDrawForPlayer for ${nextPlayer.name}`);
    this.autoDrawForPlayer(nextPlayer.id);
  }

  // Auto-draw a tile for a player (used when turn changes)
  autoDrawForPlayer(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      console.log(`[DRAW] autoDrawForPlayer: player not found for ${playerId}`);
      return;
    }

    const hand = this.playerHands.get(playerId);
    const melds = this.melds.get(playerId) || [];

    // Calculate expected hand size before drawing based on number of melds
    // Each meld removes 3 tiles from hand (2 from hand + 1 discarded for pong/chow, 3 from hand + 1 discarded for gang)
    // Starting hand: 16 tiles, after each meld: 16 - 3*numMelds
    // But gang removes 3 tiles from hand, so we need to count gang melds separately
    const gangMelds = melds.filter(m => m.type === 'gang').length;
    const otherMelds = melds.length - gangMelds;
    // For pong/chow: removes 2 tiles from hand (3 tile meld - 1 discarded)
    // For gang: removes 3 tiles from hand (4 tile meld - 1 discarded)
    const expectedHandSize = 16 - (otherMelds * 3) - (gangMelds * 3);

    // Only draw if player has the expected hand size (ready to draw)
    // Hand size should be 3n+1 where n depends on melds: 16, 13, 10, 7, 4, 1
    const isReadyToDraw = hand.length === expectedHandSize && (hand.length - 1) % 3 === 0;

    if (!isReadyToDraw) {
      console.log(`[DRAW] autoDrawForPlayer: player ${player.name} has ${hand.length} tiles (expected ${expectedHandSize} with ${melds.length} melds), skipping draw`);
      return;
    }

    console.log(`[DRAW] autoDrawForPlayer: drawing tile for ${player.name} (hand: ${hand.length}, melds: ${melds.length})`);

    // Clear last discarded tile
    this.lastDiscardedTile = null;
    this.lastDiscardedBy = null;

    // Draw tiles, handling flower/season tiles (補花)
    let tile = this.tileManager.drawTile();
    const bonusTilesDrawn = [];

    if (!tile) {
      this.endGame('draw'); // No more tiles
      return;
    }

    // Keep drawing if we get bonus tiles (flower/season)
    while (tile && this.isBonusTile(tile)) {
      bonusTilesDrawn.push(tile);

      // Add to revealed bonus tiles
      const revealed = this.revealedBonusTiles.get(playerId);
      revealed.push(tile);

      // Draw another tile
      tile = this.tileManager.drawTile();

      if (!tile) {
        this.endGame('draw'); // No more tiles
        return;
      }
    }

    // Add the non-bonus tile to hand
    hand.push(tile);

    // If we drew bonus tiles, notify everyone
    if (bonusTilesDrawn.length > 0) {
      const revealed = this.revealedBonusTiles.get(playerId);

      // Notify the player about the flower replacement
      player.ws.send(JSON.stringify({
        type: 'draw_flower_replaced',
        payload: {
          bonusTiles: bonusTilesDrawn,
          finalTile: tile,
          hand: hand,
          revealedBonusTiles: revealed,
          tilesRemaining: this.tileManager.getRemainingCount()
        }
      }));

      // Notify others about the flower replacement
      this.broadcastToOthers(playerId, {
        type: 'player_draw_flower_replaced',
        payload: {
          playerId: playerId,
          playerName: player.name,
          bonusTiles: bonusTilesDrawn,
          revealedBonusTiles: revealed,
          tilesRemaining: this.tileManager.getRemainingCount(),
          handSize: hand.length
        }
      });
    } else {
      // Normal draw - send updated hand to the player
      player.ws.send(JSON.stringify({
        type: 'tile_drawn',
        payload: {
          tile: tile,
          hand: hand,
          tilesRemaining: this.tileManager.getRemainingCount()
        }
      }));

      // Notify others that a tile was drawn (without showing the tile)
      this.broadcastToOthers(playerId, {
        type: 'player_drew',
        payload: {
          playerId: playerId,
          tilesRemaining: this.tileManager.getRemainingCount(),
          handSize: hand.length
        }
      });
    }
  }

  endGame(reason, winnerId = null, winResult = null) {
    this.gameState = 'ended';

    const winner = winnerId ? this.players.find(p => p.id === winnerId) : null;
    const dealerPlayer = this.players[this.dealerIndex];

    // Determine next dealer based on Taiwanese Mahjong rules:
    // - If dealer (莊) wins or draw, dealer stays the same
    // - If others win, dealer rotates counter-clockwise (next player)
    let nextDealerIndex = this.dealerIndex;
    let dealerRotated = false;
    let gameEnded = false;

    if (reason === 'win' && winnerId !== dealerPlayer.id) {
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

    this.broadcast({
      type: 'game_ended',
      payload: {
        reason: reason,
        winner: winnerId,
        winnerName: winner?.name,
        pattern: winResult?.pattern,
        score: winResult?.score,
        currentDealer: dealerPlayer.id,
        nextDealer: this.players[nextDealerIndex].id,
        dealerRotated: dealerRotated,
        currentRound: this.currentRound,
        currentWind: this.currentWind,
        nextRound: nextRound,
        nextWind: nextWind,
        gameEnded: gameEnded // True if whole game is over (after 北圈北風)
      }
    });

    // Update state for next game (if not ended)
    if (!gameEnded) {
      this.dealerIndex = nextDealerIndex;
      this.currentRound = nextRound;
      this.currentWind = nextWind;
    }
  }

  broadcastToOthers(excludePlayerId, message) {
    const messageStr = JSON.stringify(message);
    this.players.forEach((player) => {
      if (player.id !== excludePlayerId && player.ws.readyState === 1) {
        player.ws.send(messageStr);
      }
    });
  }
}

