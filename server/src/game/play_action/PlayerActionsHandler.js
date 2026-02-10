import {PhaseTwo} from "../PhaseTwo.js";
import {DiscardHandler} from "./DiscardHandler.js";
import {TingHandler} from "./TingHandler.js";
import {GangHandler} from "./GangHandler.js";
import {CancelClaimHandler} from "./CancelClaimHandler.js";
import {PassHandler} from "./PassHandler.js";
import {PlayerClaimActionsHandler} from "./PlayerClaimActionsHandler.js";
import {HuHandler} from "./HuHandler.js";

export class PlayerActionsHandler {
    static handlePlayerAction(game, playerId, action) {
        const player = game.players.find(p => p.id === playerId);
        if (!player) return;

        if (action.type === 'result_ready') {
            game.handleResultReady(playerId);
            return;
        }
        const playerIndex = game.players.indexOf(player);
        // Verify it's the player's turn for non-claim actions
        if (playerIndex !== game.currentPlayerIndex) {
            player.ws.send(JSON.stringify({
                type: 'error',
                message: 'Not your turn'
            }));
            return;
        }

        switch (action.type) {
            case 'discard':
                DiscardHandler.handleDiscard(game, playerId, action.tile);
                return;
            case 'ting':
                TingHandler.handleTing(game, playerId, action.tile);
                return;
            case 'self_gang':
                GangHandler.handleSelfGang(game, playerId, action.combinations);
                return;
            case 'cancel_claim':
                CancelClaimHandler.handleCancelClaim(game, playerId);
                return;
            case 'pass':
                PassHandler.handlePass(game, playerId);
                return;
            case 'hu':
                HuHandler.handleHu(game, playerId, action.combination);
                return;

            default:
                player.ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Unknown action'
                }));
        }
    }
}