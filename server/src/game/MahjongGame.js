import { TileManager } from './TileManager.js';
import { WinValidator } from './WinValidator.js';

export class MahjongGame {
  constructor(players, broadcastFn) {
    this.players = players;
    this.broadcast = broadcastFn;
    this.tileManager = new TileManager();
    this.dealerIndex = 0; // 莊 (dealer) - starts at East
    this.currentPlayerIndex = 0; // Current turn
    this.round = 1;
    this.playerHands = new Map();
    this.discardPiles = new Map();
    this.melds = new Map(); // Store pong/gang/chow for each player
    this.revealedBonusTiles = new Map(); // Store revealed flower/season tiles
    this.playerWinds = ['east', 'south', 'west', 'north']; // 東南西北
    this.gameState = 'waiting'; // waiting, flower_replacement, playing, ended
    this.gamePhase = 'waiting'; // waiting, flower_replacement, draw_discard
    this.lastDiscardedTile = null;
    this.lastDiscardedBy = null;
    this.pendingActions = []; // Store pending pong/gang/chow/hu actions
    this.flowerReplacementQueue = []; // Queue for flower replacement phase
    this.playerHasDrawn = new Map(); // Track if each player has drawn this turn
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
        round: this.round,
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
    return tile.type === 'flower' || tile.type === 'season';
  }

  // Start the flower replacement phase (補花)
  startFlowerReplacementPhase() {
    console.log('Starting flower replacement phase (補花)...');

    // Process each player starting from dealer, counter-clockwise
    this.processFlowerReplacementForAllPlayers();
  }

  processFlowerReplacementForAllPlayers() {
    let hasAnyBonusTiles = false;

    // Check all players starting from dealer, counter-clockwise
    for (let i = 0; i < this.players.length; i++) {
      const playerIndex = (this.dealerIndex + i) % this.players.length;
      const player = this.players[playerIndex];
      const hand = this.playerHands.get(player.id);

      // Find all bonus tiles in hand
      const bonusTiles = hand.filter(tile => this.isBonusTile(tile));

      if (bonusTiles.length > 0) {
        hasAnyBonusTiles = true;

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

        // Draw replacement tiles
        for (let j = 0; j < bonusTiles.length; j++) {
          const newTile = this.tileManager.drawTile();
          if (newTile) {
            hand.push(newTile);
          }
        }

        // Notify player
        player.ws.send(JSON.stringify({
          type: 'bonus_tiles_replaced',
          payload: {
            bonusTiles: bonusTiles,
            hand: hand,
            revealedBonusTiles: revealed,
            tilesRemaining: this.tileManager.getRemainingCount()
          }
        }));

        // Notify others
        this.broadcastToOthers(player.id, {
          type: 'player_revealed_bonus',
          payload: {
            playerId: player.id,
            bonusTiles: bonusTiles,
            tilesRemaining: this.tileManager.getRemainingCount()
          }
        });
      }
    }

    // If no bonus tiles found, move to draw_discard phase
    if (!hasAnyBonusTiles) {
      this.gamePhase = 'draw_discard';
      this.broadcast({
        type: 'phase_changed',
        payload: {
          phase: this.gamePhase
        }
      });

      // Dealer starts first turn (already has 17 tiles, so just notify)
      this.notifyCurrentPlayer();
    } else {
      // Check again for newly drawn bonus tiles (but they wait for next turn)
      // For now, move to draw_discard phase
      this.gamePhase = 'draw_discard';
      this.broadcast({
        type: 'phase_changed',
        payload: {
          phase: this.gamePhase
        }
      });

      this.notifyCurrentPlayer();
    }
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

    // Verify it's the player's turn
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
      case 'hu':
        this.handleHu(playerId);
        break;
      case 'pong':
        this.handlePong(playerId, action.tile);
        break;
      case 'gang':
        this.handleGang(playerId, action.tile);
        break;
      case 'chow':
        this.handleChow(playerId, action.tiles);
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

    // Check if player has already drawn this turn
    if (this.playerHasDrawn.get(playerId)) {
      player.ws.send(JSON.stringify({
        type: 'error',
        message: 'You have already drawn this turn'
      }));
      return;
    }

    const hand = this.playerHands.get(playerId);

    // Check if player has 16 tiles (should draw)
    if (hand.length !== 16) {
      player.ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid hand size for drawing'
      }));
      return;
    }

    const tile = this.tileManager.drawTile();

    if (!tile) {
      this.endGame('draw'); // No more tiles
      return;
    }

    hand.push(tile);
    this.playerHasDrawn.set(playerId, true);

    // Send updated hand to the player
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

  handleDiscard(playerId, tile) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    // Check if player has drawn this turn
    if (!this.playerHasDrawn.get(playerId)) {
      player.ws.send(JSON.stringify({
        type: 'error',
        message: 'You must draw a tile first'
      }));
      return;
    }

    const hand = this.playerHands.get(playerId);
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

    // Send updated hand to the player who discarded
    console.log(`[DISCARD] Sending hand_update to player ${playerId}, hand size: ${hand.length}`);
    player.ws.send(JSON.stringify({
      type: 'hand_update',
      payload: {
        hand: hand,
        tilesRemaining: this.tileManager.getRemainingCount()
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

  handlePong(playerId, tile) {
    const hand = this.playerHands.get(playerId);

    // Check if player has 2 matching tiles
    const matchingTiles = hand.filter(t =>
      t.suit === tile.suit && t.value === tile.value
    );

    if (matchingTiles.length >= 2 && this.lastDiscardedTile &&
        this.lastDiscardedTile.id === tile.id && this.lastDiscardedBy !== playerId) {

      // Remove 2 matching tiles from hand
      matchingTiles.slice(0, 2).forEach(t => {
        const idx = hand.findIndex(ht => ht.id === t.id);
        hand.splice(idx, 1);
      });

      // Add pong to melds
      const melds = this.melds.get(playerId);
      melds.push({
        type: 'pong',
        tiles: [tile, ...matchingTiles.slice(0, 2)]
      });

      // Remove tile from discard pile
      const discardPile = this.discardPiles.get(this.lastDiscardedBy);
      const discardIdx = discardPile.findIndex(t => t.id === tile.id);
      if (discardIdx !== -1) {
        discardPile.splice(discardIdx, 1);
      }

      // Broadcast pong action
      this.broadcast({
        type: 'pong_claimed',
        payload: {
          playerId: playerId,
          tile: tile,
          meld: melds[melds.length - 1]
        }
      });

      // Player must discard after pong
      this.currentPlayerIndex = this.players.findIndex(p => p.id === playerId);
      this.broadcast({
        type: 'turn_changed',
        payload: {
          currentPlayer: playerId,
          mustDiscard: true
        }
      });
    }
  }

  handleGang(playerId, tile) {
    const hand = this.playerHands.get(playerId);

    // Check if player has 3 matching tiles (for claiming discard)
    const matchingTiles = hand.filter(t =>
      t.suit === tile.suit && t.value === tile.value
    );

    if (matchingTiles.length >= 3 && this.lastDiscardedTile &&
        this.lastDiscardedTile.id === tile.id && this.lastDiscardedBy !== playerId) {

      // Remove 3 matching tiles from hand
      matchingTiles.slice(0, 3).forEach(t => {
        const idx = hand.findIndex(ht => ht.id === t.id);
        hand.splice(idx, 1);
      });

      // Add gang to melds
      const melds = this.melds.get(playerId);
      melds.push({
        type: 'gang',
        tiles: [tile, ...matchingTiles.slice(0, 3)]
      });

      // Remove tile from discard pile
      const discardPile = this.discardPiles.get(this.lastDiscardedBy);
      const discardIdx = discardPile.findIndex(t => t.id === tile.id);
      if (discardIdx !== -1) {
        discardPile.splice(discardIdx, 1);
      }

      // Broadcast gang action
      this.broadcast({
        type: 'gang_claimed',
        payload: {
          playerId: playerId,
          tile: tile,
          meld: melds[melds.length - 1]
        }
      });

      // Draw a replacement tile
      this.drawTile(this.players.findIndex(p => p.id === playerId));
    }
  }

  handleChow(playerId, tiles) {
    // Chow can only be claimed from the previous player
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    const prevPlayerIndex = (this.currentPlayerIndex + 3) % 4;

    if (playerIndex !== (this.currentPlayerIndex + 1) % 4) {
      return; // Can only chow from previous player
    }

    const hand = this.playerHands.get(playerId);

    // Validate chow tiles form a sequence
    if (tiles.length !== 3) return;

    const sortedTiles = [...tiles].sort((a, b) => a.value - b.value);
    const isSequence = sortedTiles[0].suit === sortedTiles[1].suit &&
                       sortedTiles[1].suit === sortedTiles[2].suit &&
                       sortedTiles[1].value === sortedTiles[0].value + 1 &&
                       sortedTiles[2].value === sortedTiles[1].value + 1;

    if (!isSequence) return;

    // Check if one tile is the last discarded
    const hasDiscarded = tiles.some(t => t.id === this.lastDiscardedTile?.id);
    if (!hasDiscarded) return;

    // Remove tiles from hand (except the discarded one)
    tiles.forEach(t => {
      if (t.id !== this.lastDiscardedTile.id) {
        const idx = hand.findIndex(ht => ht.id === t.id);
        if (idx !== -1) hand.splice(idx, 1);
      }
    });

    // Add chow to melds
    const melds = this.melds.get(playerId);
    melds.push({
      type: 'chow',
      tiles: tiles
    });

    // Remove tile from discard pile
    const discardPile = this.discardPiles.get(this.lastDiscardedBy);
    const discardIdx = discardPile.findIndex(t => t.id === this.lastDiscardedTile.id);
    if (discardIdx !== -1) {
      discardPile.splice(discardIdx, 1);
    }

    // Broadcast chow action
    this.broadcast({
      type: 'chow_claimed',
      payload: {
        playerId: playerId,
        tiles: tiles,
        meld: melds[melds.length - 1]
      }
    });

    // Player must discard after chow
    this.currentPlayerIndex = playerIndex;
    this.broadcast({
      type: 'turn_changed',
      payload: {
        currentPlayer: playerId,
        mustDiscard: true
      }
    });
  }

  checkClaimActions(tile, discardedBy) {
    // Give other players a chance to claim the tile
    // Priority: Hu > Pong/Gang > Chow

    const claimOptions = [];

    this.players.forEach((player, index) => {
      if (player.id === discardedBy) return;

      const hand = this.playerHands.get(player.id);
      const matchingTiles = hand.filter(t =>
        t.suit === tile.suit && t.value === tile.value
      );

      // Check for possible claims
      const canPong = matchingTiles.length >= 2;
      const canGang = matchingTiles.length >= 3;

      if (canPong || canGang) {
        claimOptions.push({
          playerId: player.id,
          canPong,
          canGang
        });
      }
    });

    if (claimOptions.length > 0) {
      // Notify players of claim options
      claimOptions.forEach(option => {
        const player = this.players.find(p => p.id === option.playerId);
        player.ws.send(JSON.stringify({
          type: 'claim_options',
          payload: {
            tile: tile,
            canPong: option.canPong,
            canGang: option.canGang,
            timeout: 5000 // 5 seconds to decide
          }
        }));
      });

      // Wait for claims (simplified - in production use timeout)
      setTimeout(() => {
        if (this.pendingActions.length === 0) {
          this.nextTurn();
        }
      }, 5000);
    } else {
      this.nextTurn();
    }
  }

  nextTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 4;
    const nextPlayer = this.players[this.currentPlayerIndex];

    // Reset draw state for the new turn
    this.playerHasDrawn.set(nextPlayer.id, false);

    this.broadcast({
      type: 'turn_changed',
      payload: {
        currentPlayer: nextPlayer.id
      }
    });

    // Don't auto-draw anymore - player must click the draw button
    // this.drawTile(this.currentPlayerIndex);
  }

  endGame(reason, winnerId = null, winResult = null) {
    this.gameState = 'ended';

    const winner = winnerId ? this.players.find(p => p.id === winnerId) : null;
    const dealerPlayer = this.players[this.dealerIndex];

    // Determine next dealer based on Taiwanese Mahjong rules:
    // - If dealer (莊) wins or draw, dealer stays the same
    // - If others win, dealer rotates counter-clockwise (next player)
    let nextDealerIndex = this.dealerIndex;

    if (reason === 'win' && winnerId !== dealerPlayer.id) {
      // Non-dealer won, rotate dealer counter-clockwise
      nextDealerIndex = (this.dealerIndex + 1) % this.players.length;
    }
    // If dealer won or draw, dealer stays the same (nextDealerIndex unchanged)

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
        dealerRotated: nextDealerIndex !== this.dealerIndex
      }
    });

    // Update dealer for next game
    this.dealerIndex = nextDealerIndex;
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

