export class CancelClaimHandler {
    static handleCancelClaim(game, playerId) {
        if (!game.claimWindowOpen) {
            console.log(`[CLAIM] Claim window closed, ignoring cancel from ${playerId}`);
            return;
        }

        console.log(`[CLAIM] Player ${playerId} cancelled their claim`);
        game.pendingClaims.delete(playerId);

        const player = game.players.find(p => p.id === playerId);
        if (player) {
            player.ws.send(JSON.stringify({
                type: 'claim_cancelled',
                payload: {}
            }));
        }
    }

}