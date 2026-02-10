import {PhaseThree} from "../PhaseThree.js";

export class HuHandler {
    static handleHu(game, playerId, combination = null) {
        // Win validation was already done when showing the 食 button
        // Just execute the win directly without re-validating
        const player = game.players.find(p => p.id === playerId);
        const playerIndex = game.players.indexOf(player);

        console.log(`[HU] handleHu called for player ${player?.name}, playerId: ${playerId}`);
        // Determine if this is self-draw (自摸) or win by discard (出沖)
        const isSelfDraw = playerIndex === game.currentPlayerIndex && !game.claimWindowOpen;

        if (isSelfDraw) {
            // 自摸 - self-draw win, no loser (all others pay)
            // Check if this is 天胡 (heavenly hand) - dealer wins on first turn without drawing from wall
            // 天胡 is detected by drawnTile being null (no tile was drawn from the wall)
            const isTianHu = !game.drawnTile;
            if (isTianHu) {
                console.log(`[HU] Player ${player?.name} wins by 天胡 (Heavenly Hand) - no drawn tile to highlight`);
            } else {
                console.log(`[HU] Player ${player?.name} wins by self-draw (自摸) with drawn tile: ${game.drawnTile.suit}-${game.drawnTile.value}`);
            }

            // For 天胡, drawnTile is null (no red border)
            // For normal 自摸, drawnTile is the tile that was drawn from the wall

            PhaseThree.endGame(game, 'win_self_draw', playerId, { pattern: isTianHu ? '天胡' : '自摸', score: 0, winningCombination: combination }, game.drawnTile);
        } else {
            // 出沖 - win by claiming discarded tile
            console.log(`[HU] Player ${player?.name} wins by discard (出沖)`);
            PhaseThree.endGame(game, 'win_by_discard', playerId, { pattern: '出沖', score: 0, winningCombination: combination }, game.lastDiscardedBy);
        }
    }

    static executeHuClaim(game, playerId, claimData = null) {
        const player = game.players.find(p => p.id === playerId);
        const discardedTile = game.lastDiscardedTile;
        const discardedByPlayer = game.players.find(p => p.id === game.lastDiscardedBy);

        console.log(`[WIN] 🎉 ${player?.name} is claiming 食 (hu) to win! discardedByPlayer: ${discardedByPlayer?.name}`);

        // Extract the winning combination from claim data
        const winningCombination = claimData?.combination || null;
        if (winningCombination) {
            console.log(`[WIN] Winning combination:`, JSON.stringify(winningCombination));
        } else {
            console.log(`[WIN] No winning combination found in claimData`);
        }

        const loserId = game.lastDiscardedBy;
        PhaseThree.endGame(game, 'win_by_discard', playerId, { pattern: '出沖', score: 0, winningCombination }, loserId);
    }
}