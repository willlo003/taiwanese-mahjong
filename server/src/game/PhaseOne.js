import { PhaseTwo } from './PhaseTwo.js';
import GameUtils from './GameUtils.js';

/**
 * Phase One: Flower Replacement (補花)
 * Handles the initial flower replacement phase before the main game starts
 */
export class PhaseOne {
  /**
   * Start the flower replacement phase (補花)
   * @param {StatusManager} game - The game instance
   */
  static startFlowerReplacementPhase(game) {
    console.log('=== Starting flower replacement phase (補花) ===');
    console.log('Dealer index:', game.dealerIndex);
    console.log('Players:', game.players.map(p => p.name));

    // Broadcast that we're in flower replacement phase
    console.log('Broadcasting phase_changed: flower_replacement');
    game.broadcast({
      type: 'phase_changed',
      payload: {
        phase: 'flower_replacement',
        message: '補花中'
      }
    });

    // Start processing from dealer (莊), anti-clockwise
    game.flowerReplacementPlayerIndex = 0; // Offset from dealer
    game.flowerReplacementRound = 0; // Track rounds to detect completion

    // Start the sequential flower replacement process
    console.log('Calling processNextPlayerFlowerReplacement...');
    PhaseOne.processNextPlayerFlowerReplacement(game);
  }

  /**
   * Process flower replacement for one player at a time
   * @param {StatusManager} game - The game instance
   */
  static processNextPlayerFlowerReplacement(game) {
    console.log('=== processNextPlayerFlowerReplacement ===');
    console.log('flowerReplacementPlayerIndex:', game.flowerReplacementPlayerIndex);
    console.log('flowerReplacementRound:', game.flowerReplacementRound);

    const playerIndex = (game.dealerIndex + game.flowerReplacementPlayerIndex) % game.players.length;
    const player = game.players[playerIndex];
    const hand = game.playerHands.get(player.id);

    console.log(`Checking player ${player.name} (index ${playerIndex}), hand size: ${hand.length}`);

    // Find all bonus tiles in hand
    const bonusTiles = hand.filter(tile => GameUtils.isBonusTile(tile));
    console.log(`Found ${bonusTiles.length} bonus tiles:`, bonusTiles.map(t => `${t.type}-${t.value}`));

    if (bonusTiles.length > 0) {
      // Reset round counter since we found flowers
      game.flowerReplacementRound = 0;

      // Notify all players who is currently doing 補花
      game.broadcast({
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
      const revealed = game.revealedBonusTiles.get(player.id);
      revealed.push(...bonusTiles);

      // Draw replacement tiles (same number as removed)
      // Keep drawing if we get more bonus tiles
      const newTiles = [];
      for (let j = 0; j < bonusTiles.length; j++) {
        let newTile = game.tileManager.drawTile();

        // Keep drawing if we get bonus tiles
        while (newTile && GameUtils.isBonusTile(newTile)) {
          console.log(`[FLOWER_REPLACEMENT] ${player.name} drew another bonus tile: ${newTile.suit}-${newTile.value}, replacing...`);
          revealed.push(newTile);
          newTile = game.tileManager.drawTile();
        }

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
          tilesRemaining: game.tileManager.getRemainingCount()
        }
      }));

      // Notify others about the revealed bonus tiles
      game.broadcastToOthers(player.id, {
        type: 'player_revealed_bonus',
        payload: {
          playerId: player.id,
          playerName: player.name,
          bonusTiles: bonusTiles,
          bonusTileCount: bonusTiles.length,
          tilesRemaining: game.tileManager.getRemainingCount()
        }
      });

      // After a delay, check this same player again (they might have drawn more flowers)
      setTimeout(() => {
        PhaseOne.processNextPlayerFlowerReplacement(game);
      }, 800); // 800ms delay for animation

    } else {
      // No flowers for this player, move to next player
      game.flowerReplacementPlayerIndex = (game.flowerReplacementPlayerIndex + 1) % game.players.length;
      game.flowerReplacementRound++;

      // If we've gone through all 4 players without finding any flowers, phase is complete
      if (game.flowerReplacementRound >= 4) {
        PhaseOne.completeFlowerReplacementPhase(game);
      } else {
        // Continue to next player after a short delay
        setTimeout(() => {
          PhaseOne.processNextPlayerFlowerReplacement(game);
        }, 200);
      }
    }
  }

  /**
   * Complete the flower replacement phase and start the main game
   * @param {StatusManager} game - The game instance
   */
  static completeFlowerReplacementPhase(game) {
    console.log('=== Flower replacement phase complete ===');

    // Set game phase to draw_discard
    game.gamePhase = 'draw_discard';

    // Broadcast that flower replacement is done
    game.broadcast({
      type: 'phase_changed',
      payload: {
        phase: 'draw_discard',
        message: '開始打牌'
      }
    });

    // Dealer (莊) goes first - they already have 17 tiles
    game.currentPlayerIndex = game.dealerIndex;
    const dealer = game.players[game.dealerIndex];
    const dealerHand = game.playerHands.get(dealer.id);

    console.log(`[START] Dealer ${dealer.name} starts with ${dealerHand.length} tiles`);

    // For 天胡 (heavenly hand), don't set drawnTile since there's no "drawn" tile
    // The dealer starts with 17 tiles, so no specific tile should be highlighted
    game.drawnTile = null;
    console.log(`[START] drawnTile set to null for dealer's first turn (天胡 has no drawn tile)`);

    // Use standardized function to check for 自摸 (天胡) and 槓 options
    const options = PhaseTwo.checkSelfDrawOptions(game, dealer.id);

    if (options.canSelfDrawWin) {
      console.log(`[START] 🎉 Dealer ${dealer.name} has 天胡 (Heavenly Hand)!`);
    }
    if (options.canSelfGang) {
      console.log(`[START] 🎴 Dealer ${dealer.name} can self-gang with ${options.selfGangCombinations.length} options`);
    }

    // Send dealer_first_turn notification to the dealer
    dealer.ws.send(JSON.stringify({
      type: 'dealer_first_turn',
      payload: {
        hand: dealerHand,
        canSelfDrawWin: options.canSelfDrawWin,
        selfDrawWinCombinations: options.selfDrawWinCombinations,
        canSelfGang: options.canSelfGang,
        selfGangCombinations: options.selfGangCombinations,
        tilesRemaining: game.tileManager.getRemainingCount()
      }
    }));

    // Notify all players about turn change
    game.broadcast({
      type: 'turn_changed',
      payload: {
        currentPlayer: dealer.id,
        mustDiscard: true // Dealer must discard one of their 17 tiles
      }
    });

    // Start turn timer for dealer's first turn
    PhaseTwo.startTurnTimer(game, dealer.id);
  }
}
