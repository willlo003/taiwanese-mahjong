import {GangValidator} from "../GangValidator.js";
import {PhaseTwo} from "../PhaseTwo.js";

export class PongHandler {
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

}