/**
 * Phase Three: End Game (結束遊戲)
 * Handles game ending, scoring, and starting the next game
 */
export class PhaseThree {
  /**
   * End the game
   * @param {StatusManager} game - The game instance
   * @param {string} reason - The reason for ending ('win_by_discard', 'win_self_draw', 'draw')
   * @param {string} winnerId - The winner's ID (null for draw)
   * @param {object} winResult - The win result object
   * @param {string} loserId - The loser's ID (null for self-draw or draw)
   */
  static endGame(game, reason, winnerId = null, winResult = null, loserId = null) {
    try {
      console.log(`[END_GAME] Called with reason: ${reason}, winnerId: ${winnerId}, loserId: ${loserId}`);
      game.gameState = 'ended';

      const winner = winnerId ? game.players.find(p => p.id === winnerId) : null;
      const loser = loserId ? game.players.find(p => p.id === loserId) : null;
      const dealerPlayer = game.players[game.dealerIndex];
      console.log(`[END_GAME] winner: ${winner?.name}, loser: ${loser?.name}, dealer: ${dealerPlayer?.name}`);

      // Determine win type
      let winType = null;
      if (reason === 'win_by_discard') {
        winType = '出沖';
      } else if (reason === 'win_self_draw') {
        winType = '自摸';
      } else if (reason === 'draw') {
        winType = '和局';
      }

      // Determine next dealer based on Taiwanese Mahjong rules
      let nextDealerIndex = game.dealerIndex;
      let dealerRotated = false;
      let gameEnded = false;

      if ((reason === 'win_by_discard' || reason === 'win_self_draw') && winnerId !== dealerPlayer.id) {
        nextDealerIndex = (game.dealerIndex + 1) % game.players.length;
        dealerRotated = true;
      }

      // Update 圈/風 based on dealer rotation
      let nextRound = game.currentRound;
      let nextWind = game.currentWind;

      if (dealerRotated) {
        nextWind = game.roundWinds[nextDealerIndex];

        if (nextDealerIndex === 0) {
          const currentRoundIndex = game.roundWinds.indexOf(game.currentRound);
          const nextRoundIndex = currentRoundIndex + 1;

          if (nextRoundIndex >= 4) {
            gameEnded = true;
          } else {
            nextRound = game.roundWinds[nextRoundIndex];
          }
        }
      }

      // For 出沖 (win by discard), add the discarded tile to the winner's hand
      // and remove it from the loser's discard pile
      if (reason === 'win_by_discard' && winnerId && game.lastDiscardedTile) {
        const winnerHand = game.playerHands.get(winnerId);
        if (winnerHand) {
          winnerHand.push(game.lastDiscardedTile);
          console.log(`[END_GAME] Added discarded tile ${game.lastDiscardedTile.suit}-${game.lastDiscardedTile.value} to winner's hand`);
        }
        // Remove the winning tile from the loser's discard pile
        if (loserId) {
          const loserDiscardPile = game.discardPiles.get(loserId);
          if (loserDiscardPile) {
            const tileIdx = loserDiscardPile.findIndex(t => t.id === game.lastDiscardedTile.id);
            if (tileIdx !== -1) {
              loserDiscardPile.splice(tileIdx, 1);
              console.log(`[END_GAME] Removed winning tile from loser's discard pile`);
            }
          }
        }
      }

      // Build player results with revealed hands
      const playerResults = game.players.map(player => {
        const isWinner = player.id === winnerId;
        const isLoser = reason === 'win_self_draw'
          ? (player.id !== winnerId)
          : (player.id === loserId);
        const isDealer = game.players[game.dealerIndex].id === player.id;
        const hand = game.playerHands.get(player.id) || [];
        const playerMelds = game.melds.get(player.id) || [];

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
          position: game.getPlayerWind(player.id),
          isWinner, isLoser, isDealer,
          score: 0,
          totalScore: 0,
          hand,
          melds: revealedMelds
        };
      });

      // Build all player hands map
      const allPlayerHands = {};
      game.players.forEach(player => {
        allPlayerHands[player.id] = game.playerHands.get(player.id) || [];
      });

      // Check if this is a 搶槓 (rob gang) win
      const isRobGang = winResult?.pattern === '搶槓';

      game.broadcast({
        type: 'game_ended',
        payload: {
          reason, winType,
          winner: winnerId,
          winnerName: winner?.name,
          loser: loserId,
          loserName: loser?.name,
          pattern: winResult?.pattern,
          score: winResult?.score,
          winningCombination: winResult?.winningCombination || null,
          winningTile: reason === 'win_by_discard' ? game.lastDiscardedTile : null,
          isRobGang,
          robGangTile: isRobGang ? game.lastDiscardedTile : null,
          currentDealer: dealerPlayer.id,
          nextDealer: game.players[nextDealerIndex].id,
          dealerRotated,
          currentRound: game.currentRound,
          currentWind: game.currentWind,
          nextRound, nextWind, gameEnded,
          playerResults,
          allPlayerHands
        }
      });

      if (!gameEnded) {
        game.dealerIndex = nextDealerIndex;
        game.currentRound = nextRound;
        game.currentWind = nextWind;
        console.log(`[END_GAME] Next game will start from dealer: ${game.players[game.dealerIndex].name}`);
      } else {
        console.log(`[END_GAME] Game series completed! No more games.`);
      }
      console.log(`[END_GAME] Completed successfully`);
    } catch (error) {
      console.error('[END_GAME] Error in endGame:', error);
      console.error('[END_GAME] Stack:', error.stack);
    }
  }

  /**
   * Handle multiple winners (雙嚮/三嚮)
   */
  static endGameMultipleWinners(game, winners, loserId) {
    game.gameState = 'ended';

    const loser = loserId ? game.players.find(p => p.id === loserId) : null;
    const dealerPlayer = game.players[game.dealerIndex];
    const winnerIds = winners.map(w => w.playerId);

    let winType = '出沖';
    if (winners.length === 2) {
      winType = '雙嚮';
    } else if (winners.length === 3) {
      winType = '三嚮';
    }

    // For 雙嚮/三嚮, dealer NEVER rotates
    let nextDealerIndex = game.dealerIndex;
    let dealerRotated = false;
    let gameEnded = false;
    let nextRound = game.currentRound;
    let nextWind = game.currentWind;

    console.log(`[END_GAME_MULTI] ${winType}: Dealer stays at ${dealerPlayer.name}`);

    // For 雙嚮/三嚮 (win by discard), add the discarded tile to each winner's hand
    // and remove it from the loser's discard pile
    const winningTile = game.lastDiscardedTile;
    if (winningTile) {
      // Add the winning tile to each winner's hand
      winnerIds.forEach(winnerId => {
        const winnerHand = game.playerHands.get(winnerId);
        if (winnerHand) {
          winnerHand.push(winningTile);
          console.log(`[END_GAME_MULTI] Added winning tile ${winningTile.suit}-${winningTile.value} to winner ${winnerId}'s hand`);
        }
      });

      // Remove the winning tile from the loser's discard pile
      if (loserId) {
        const loserDiscardPile = game.discardPiles.get(loserId);
        if (loserDiscardPile) {
          const tileIdx = loserDiscardPile.findIndex(t => t.id === winningTile.id);
          if (tileIdx !== -1) {
            loserDiscardPile.splice(tileIdx, 1);
            console.log(`[END_GAME_MULTI] Removed winning tile from loser's discard pile`);
          }
        }
      }
    }

    // Build winner combinations map
    const winnerCombinations = {};
    winners.forEach(w => {
      winnerCombinations[w.playerId] = w.winningCombination || null;
    });

    // Build player results with revealed hands
    const playerResults = game.players.map(player => {
      const isWinner = winnerIds.includes(player.id);
      const isLoser = player.id === loserId;
      const isDealer = game.players[game.dealerIndex].id === player.id;
      const hand = game.playerHands.get(player.id) || [];
      const playerMelds = game.melds.get(player.id) || [];

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
        position: game.getPlayerWind(player.id),
        isWinner, isLoser, isDealer,
        score: 0,
        totalScore: 0,
        hand,
        melds: revealedMelds
      };
    });

    // Build all player hands map
    const allPlayerHands = {};
    game.players.forEach(player => {
      allPlayerHands[player.id] = game.playerHands.get(player.id) || [];
    });

    // Check if this is a 搶槓 (rob gang) win - check first winner's pattern
    const isRobGang = winners.length > 0 && winners[0].winResult?.pattern === '搶槓';

    game.broadcast({
      type: 'game_ended',
      payload: {
        reason: 'multiple_winners',
        winType,
        winners: winnerIds,
        winnerNames: winners.map(w => game.players.find(p => p.id === w.playerId)?.name),
        loser: loserId,
        loserName: loser?.name,
        winningTile,
        winnerCombinations,
        isRobGang,
        robGangTile: isRobGang ? winningTile : null,
        currentDealer: dealerPlayer.id,
        nextDealer: game.players[nextDealerIndex].id,
        dealerRotated,
        currentRound: game.currentRound,
        currentWind: game.currentWind,
        nextRound, nextWind, gameEnded,
        playerResults,
        allPlayerHands
      }
    });

    if (!gameEnded) {
      game.dealerIndex = nextDealerIndex;
      game.currentRound = nextRound;
      game.currentWind = nextWind;
      console.log(`[END_GAME_MULTI] Next game will start from dealer: ${game.players[game.dealerIndex].name}`);
    } else {
      console.log(`[END_GAME_MULTI] Game series completed! No more games.`);
    }
  }

  /**
   * Handle player ready for next game
   */
  static handleResultReady(game, playerId) {
    if (game.gameState !== 'ended') {
      console.log(`[RESULT_READY] Game not ended, ignoring ready from ${playerId}`);
      return;
    }

    game.readyPlayers.add(playerId);

    const activePlayers = game.players.filter(p => p.ws && p.ws.readyState === 1);
    console.log(`[RESULT_READY] Player ${playerId} is ready. Total ready: ${game.readyPlayers.size}/${activePlayers.length}`);

    game.broadcast({
      type: 'player_ready',
      payload: { playerId }
    });

    if (game.readyPlayers.size >= activePlayers.length) {
      console.log('[RESULT_READY] All players ready, starting next game');

      game.broadcast({
        type: 'next_game_starting',
        payload: {}
      });

      game.readyPlayers.clear();
      PhaseThree.startNextGame(game);
    }
  }

  /**
   * Start the next game with current dealer/round/wind settings
   */
  static startNextGame(game) {
    console.log('[START_NEXT_GAME] Starting next game...');

    // Reset all game state and prepare for new game
    game.resetForNextGame();

    // Now start the game (same as initial start)
    game.start();
  }
}
