import {PhaseThree} from "../PhaseThree.js";
import {PhaseTwo} from "../PhaseTwo.js";
import {GangValidator} from "../GangValidator.js";

export class ShangHandler {
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

}