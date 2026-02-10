import {PhaseTwo} from "../PhaseTwo.js";

export class GangHandler {
    static handleSelfGang(game, playerId, combinations) {
        const player = game.players.find(p => p.id === playerId);
        const hand = game.playerHands.get(playerId);
        const melds = game.melds.get(playerId);

        if (combinations.length === 0) {
            return;
        }

        const combo = combinations[0];

        if (combo.type === 'concealed_gang') {
            // 暗槓: Complete immediately (cannot be robbed)
            const tilesToRemove = combo.tiles;
            tilesToRemove.forEach(t => {
                const idx = hand.findIndex(ht => ht.id === t.id);
                if (idx !== -1) hand.splice(idx, 1);
            });

            const newMeld = { type: 'concealed_gang', tiles: tilesToRemove, concealed: true };
            melds.push(newMeld);
            console.log(`[SELF-GANG] ✅ Concealed gang (暗槓): ${combo.suit}-${combo.value} x4`);

            player.ws.send(JSON.stringify({
                type: 'self_gang_claimed',
                payload: { playerId, melds, hand }
            }));

            game.broadcastToOthers(playerId, {
                type: 'self_gang_claimed',
                payload: { playerId, melds }
            });

            // Continue directly to draw replacement tile
            // PhaseTwo.continueAfterSelfGang(game, playerId);
            console.log(`[GANG_CLAIM] Drawing replacement tile (補槓)...`);
            PhaseTwo.prepareNextTurn(game, player, true);

        } else if (combo.type === 'add_to_pong') {
            // 碰上槓: Complete the gang FIRST, then check for 搶槓 before drawing
            const matchingTile = hand.find(t =>
                t.suit === combo.suit && t.value === combo.value
            );

            if (!matchingTile) {
                return;
            }

            // Step 1: Remove tile from hand
            const idx = hand.findIndex(ht => ht.id === matchingTile.id);
            if (idx !== -1) hand.splice(idx, 1);

            // Step 2: Update meld from pong to gang
            const meldIdx = melds.findIndex(m =>
                m.type === 'pong' &&
                m.tiles[0].suit === combo.suit &&
                m.tiles[0].value === combo.value
            );

            if (meldIdx !== -1) {
                melds[meldIdx].type = 'gang';
                melds[meldIdx].tiles.push(matchingTile);
                console.log(`[SELF-GANG] ✅ Add to pong (碰上槓): ${combo.suit}-${combo.value} x4`);
            }

            // Step 3: Broadcast the gang completion to all players
            player.ws.send(JSON.stringify({
                type: 'self_gang_claimed',
                payload: { playerId, melds, hand }
            }));

            game.broadcastToOthers(playerId, {
                type: 'self_gang_claimed',
                payload: { playerId, melds }
            });

            // Step 4: Check for 搶槓 BEFORE drawing replacement tile
            PhaseTwo.checkRobGangWinForSelfGang(game, matchingTile, playerId);

            console.log(`[GANG_CLAIM] Drawing replacement tile (補槓)...`);
            // TODO: check whether need if case here
            PhaseTwo.prepareNextTurn(game, player, true);
        }
    }
    static executeGangClaim(game, playerId) {
        const player = game.players.find(p => p.id === playerId);
        const tile = game.lastDiscardedTile;
        const hand = game.playerHands.get(playerId);

        const matchingTiles = hand.filter(t =>
            t.suit === tile.suit && t.value === tile.value
        ).slice(0, 3);

        if (matchingTiles.length < 3) {
            console.log(`[CLAIM] ❌ Invalid gang`);
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
            const nextPlayer = game.players[game.currentPlayerIndex];
            PhaseTwo.prepareNextTurn(game, nextPlayer, true);
            return;
        }

        console.log(`[CLAIM] ✅ ${player.name} claimed 槓: ${tile.suit}-${tile.value} x4}`);

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
        const newMeld = { type: 'gang', tiles: [tile, ...matchingTiles] };
        melds.push(newMeld);

        const discardedBy = game.lastDiscardedBy;

        game.broadcast({
            type: 'gang_claimed',
            payload: {
                playerId: playerId,
                tile: tile,
                meld: newMeld,
                discardPile: discardPile,
                discardedBy: discardedBy
            }
        });

        player.ws.send(JSON.stringify({
            type: 'hand_update',
            payload: {
                hand: hand,
                tilesRemaining: game.tileManager.getRemainingCount()
            }
        }));

        // Draw replacement tile
        // game.lastDiscardedTile = null;
        // game.lastDiscardedBy = null;
        console.log(`[GANG_CLAIM] Drawing replacement tile (補槓)...`);
        PhaseTwo.prepareNextTurn(game, player, true);

        // Check if player can win immediately after claiming
        // TODO: double check why AI added check win here, this is claim gang
        // const numRevealedSets = melds.length;
        // let winResult = WinValidator.isWinningHandWithMelds(hand, numRevealedSets, null);
        // if (winResult.isWin) {
        //   console.log(`[CLAIM] Player ${player.name} wins immediately after claiming gang!`);
        //   game.lastDiscardedTile = null;
        //   game.lastDiscardedBy = null;
        //   PhaseThree.endGame(game, 'win_by_discard', playerId, winResult, discardedBy);
        //   return;
        // }

        // 搶槓 (Robbing the Kong) - Check if other players can win with the gang tile
        // TODO: double check why AI added robGang here, this is claim gang
        // console.log(`[搶槓] Checking if other players can win with gang tile: ${tile.suit}-${tile.value}`);
        // PhaseTwo.checkRobGangWin(game, tile, playerId, discardedBy);
    }
}