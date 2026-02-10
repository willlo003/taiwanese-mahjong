import {PhaseTwo} from "../PhaseTwo.js";
import {PlayerClaimActionsHandler} from "./PlayerClaimActionsHandler.js";

export class TingHandler {
    static handleTing(game, playerId, tile) {
        const player = game.players.find(p => p.id === playerId);
        if (!player) return;

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
        PlayerClaimActionsHandler.checkClaimActions(game, tile, playerId);
    }
}