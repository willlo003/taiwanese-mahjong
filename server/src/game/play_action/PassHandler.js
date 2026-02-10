import {PlayerClaimActionsHandler} from "./PlayerClaimActionsHandler.js";

export class PassHandler {
    static handlePass(game, playerId) {
        if (!game.claimWindowOpen) {
            console.log(`[CLAIM] Claim window closed, ignoring pass from ${playerId}`);
            return;
        }

        if (!game.playersWithClaimOptions.has(playerId)) {
            console.log(`[CLAIM] Player ${playerId} has no claim options, ignoring pass`);
            return;
        }

        console.log(`[CLAIM] Player ${playerId} passed on claiming`);
        game.playersPassed.add(playerId);
        game.pendingClaims.delete(playerId);

        const player = game.players.find(p => p.id === playerId);
        if (player) {
            player.ws.send(JSON.stringify({
                type: 'pass_registered',
                payload: {}
            }));
        }

        PlayerClaimActionsHandler.checkAllPlayersPassed(game);
    }
}