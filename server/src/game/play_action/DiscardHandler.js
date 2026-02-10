import {PhaseTwo} from "../PhaseTwo.js";
import {PlayerClaimActionsHandler} from "./PlayerClaimActionsHandler.js";

export class DiscardHandler {
    static handleDiscard(game, playerId, tile) {
        // Clear turn timer when player discards
        PhaseTwo.clearTurnTimer(game);

        const player = game.players.find(p => p.id === playerId);
        const hand = game.playerHands.get(playerId);

        console.log(`[DISCARD] ${player?.name} is discarding ${tile.suit}-${tile.value}`);

        // Remove tile from hand
        const tileIndex = hand.findIndex(t => t.id === tile.id);
        if (tileIndex === -1) {
            console.log(`[DISCARD] Tile not found in hand`);
            return;
        }
        hand.splice(tileIndex, 1);

        // Add to discard pile
        const discardPile = game.discardPiles.get(playerId);
        discardPile.push(tile);

        // Track last discarded tile
        game.lastDiscardedTile = tile;
        game.lastDiscardedBy = playerId;

        // Reset draw state
        game.playerHasDrawn.set(playerId, false);

        // Send updated hand to the player who discarded
        player.ws.send(JSON.stringify({
            type: 'hand_update',
            payload: {
                hand: hand,
                tilesRemaining: game.tileManager.getRemainingCount()
            }
        }));

        // Broadcast the discard to all players
        game.broadcast({
            type: 'tile_discarded',
            payload: {
                playerId: playerId,
                tile: tile,
                discardPile: discardPile,
                handSize: hand.length
            }
        });

        // Check if other players can pong/gang/chow/hu
        PlayerClaimActionsHandler.checkClaimActions(game, tile, playerId);
    }
}