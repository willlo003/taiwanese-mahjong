import {PhaseTwo} from "../PhaseTwo.js";
import {PhaseThree} from "../PhaseThree.js";
import {ShangHandler} from "./ShangHandler.js";
import {PongHandler} from "./PongHandler.js";
import {GangHandler} from "./GangHandler.js";
import {HuHandler} from "./HuHandler.js";
import {CancelClaimHandler} from "./CancelClaimHandler.js";
import {PassHandler} from "./PassHandler.js";
import {WinValidator} from "../WinValidator.js";
import GameUtils from "../GameUtils.js";

export class PlayerClaimActionsHandler {
    static handlePlayerClaimAction(game, playerId, action) {
        const player = game.players.find(p => p.id === playerId);
        if (!player) return;

        switch (action.type) {
            case 'cancel_claim':
                CancelClaimHandler.handleCancelClaim(game, playerId);
                return;
            case 'pass':
                PassHandler.handlePass(game, playerId);
                return;
            case 'pong':
            case 'gang':
            case 'chow':
            case 'shang':
            case 'hu':
                const registered = PlayerClaimActionsHandler.registerClaim(game, playerId, action.type, action.tiles, action.combination);
                if (registered) {
                    player.ws.send(JSON.stringify({
                        type: 'claim_registered',
                        payload: { claimType: action.type }
                    }));
                }
                return;
            default:
                player.ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Unknown action'
                }));
        }
    }

    static checkClaimActions(game, tile, discardedBy) {
        const discardedByIndex = game.players.findIndex(p => p.id === discardedBy);
        const nextPlayerIndex = (discardedByIndex + 1) % 4;
        const nextPlayerId = game.players[nextPlayerIndex].id;

        // Clear turn timer - player has discarded, their turn is over
        PhaseTwo.clearTurnTimer(game);

        // Clear any existing claims and timer
        game.pendingClaims.clear();
        if (game.claimFreezeTimer) {
            clearTimeout(game.claimFreezeTimer);
        }

        // Open claim window
        game.claimWindowOpen = true;

        // Check what each player can do
        const claimOptions = [];

        game.players.forEach((player, index) => {
            if (player.id === discardedBy) return;

            const hand = game.playerHands.get(player.id);
            const melds = game.melds.get(player.id);
            const matchingTiles = hand.filter(t =>
                t.suit === tile.suit && t.value === tile.value
            );

            // Check if player is in 聽牌 mode - they can only claim 食 (hu)
            const isTing = game.tingStatus.get(player.id);

            const possibleClaims = [];

            // Check for 食 (Hu/Win)
            const numRevealedSets = melds.length;
            const winResult = WinValidator.isWinningHandWithMelds(hand, numRevealedSets, tile);
            const canHu = winResult.isWin;
            console.log(`[CLAIM] Checking win for player ${player.name} - Win result:`, winResult);

            let winCombinations = [];
            if (canHu) {
                const handWithDiscardedTile = [...hand, tile];
                const allWinCombinations = WinValidator.findWinningCombinations(handWithDiscardedTile, numRevealedSets, tile);
                winCombinations = GameUtils.deduplicateWinCombinations(allWinCombinations);
                console.log(`  Win combinations found: ${allWinCombinations.length} (${winCombinations.length} unique)`);
            }

            // Skip 碰/槓/上 claims for players in 聽牌 mode - they can only claim 食
            if (isTing) {
                console.log(`[CLAIM] 🀄 ${player.name} is in 聽牌 mode - can only claim 食 (hu)`);
                if (canHu) {
                    claimOptions.push({
                        playerId: player.id,
                        canPong: false,
                        canGang: false,
                        canChow: false,
                        canShang: false,
                        canHu: true,
                        winCombinations: winCombinations,
                        isNextPlayer: player.id === nextPlayerId,
                        possibleClaims: []
                    });
                }
                return; // Skip to next player
            }

            // Pong: 3 same tiles (2 from hand + discarded)
            if (matchingTiles.length >= 2) {
                const pongTiles = matchingTiles.slice(0, 2);
                possibleClaims.push({
                    type: 'pong',
                    tiles: [pongTiles[0], tile, pongTiles[1]],
                    handTiles: pongTiles
                });
            }

            // Gang: 4 same tiles (3 from hand + discarded)
            if (matchingTiles.length >= 3) {
                const gangTiles = matchingTiles.slice(0, 3);
                possibleClaims.push({
                    type: 'gang',
                    tiles: [gangTiles[0], gangTiles[1], tile, gangTiles[2]],
                    handTiles: gangTiles
                });
            }

            // Chow/Shang: sequence (only 下家 can chow, and only for numbered suits)
            const isNextPlayer = player.id === nextPlayerId;
            const isNumberedSuit = ['bamboo', 'character', 'dot'].includes(tile.suit);

            if (isNextPlayer && isNumberedSuit) {
                const suitTiles = hand.filter(t => t.suit === tile.suit);
                const tileValue = tile.value;

                // Check all possible sequences
                if (tileValue >= 3) {
                    const t1 = suitTiles.find(t => t.value === tileValue - 2);
                    const t2 = suitTiles.find(t => t.value === tileValue - 1);
                    if (t1 && t2) {
                        possibleClaims.push({
                            type: 'chow',
                            tiles: [t1, t2, tile],
                            displayTiles: [t1, tile, t2],
                            handTiles: [t1, t2]
                        });
                    }
                }

                if (tileValue >= 2 && tileValue <= 8) {
                    const t1 = suitTiles.find(t => t.value === tileValue - 1);
                    const t2 = suitTiles.find(t => t.value === tileValue + 1);
                    if (t1 && t2) {
                        possibleClaims.push({
                            type: 'chow',
                            tiles: [t1, tile, t2],
                            displayTiles: [t1, tile, t2],
                            handTiles: [t1, t2]
                        });
                    }
                }

                if (tileValue <= 7) {
                    const t1 = suitTiles.find(t => t.value === tileValue + 1);
                    const t2 = suitTiles.find(t => t.value === tileValue + 2);
                    if (t1 && t2) {
                        possibleClaims.push({
                            type: 'chow',
                            tiles: [tile, t1, t2],
                            displayTiles: [t1, tile, t2],
                            handTiles: [t1, t2]
                        });
                    }
                }
            }

            if (possibleClaims.length > 0 || canHu) {
                const uniquePossibleClaims = GameUtils.deduplicateClaims(possibleClaims);
                claimOptions.push({
                    playerId: player.id,
                    canPong: matchingTiles.length >= 2,
                    canGang: matchingTiles.length >= 3,
                    canChow: isNextPlayer && isNumberedSuit && uniquePossibleClaims.some(c => c.type === 'chow'),
                    canShang: isNextPlayer && isNumberedSuit && uniquePossibleClaims.some(c => c.type === 'chow'),
                    canHu: canHu,
                    winCombinations: winCombinations,
                    isNextPlayer,
                    possibleClaims: uniquePossibleClaims
                });
            }
        });

        const anyoneCanClaim = claimOptions.length > 0;

        console.log(`[CLAIM] Checked ${game.players.length} players for claims on tile ${tile.suit}-${tile.value}`);
        console.log(`[CLAIM] Claim options found: ${claimOptions.length}`);

        if (!anyoneCanClaim) {
            game.claimWindowOpen = false;
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
            const nextPlayer = game.players[game.currentPlayerIndex];
            PhaseTwo.prepareNextTurn(game, nextPlayer, true);
            return;
        }

        // Track which players have claim options
        game.playersWithClaimOptions.clear();
        game.playersPassed.clear();
        claimOptions.forEach(option => {
            game.playersWithClaimOptions.add(option.playerId);
        });

        // Calculate freezeTimeout: considerTimeout - 2, minimum 3 seconds
        const freezeTimeout = game.considerTimeout * 1000;

        // Notify all players of claim options and freeze period
        game.broadcast({
            type: 'claim_period_start',
            payload: {
                tile: tile,
                discardedBy: discardedBy,
                timeout: freezeTimeout
            }
        });

        // Send individual claim options to each player
        claimOptions.forEach(option => {
            const player = game.players.find(p => p.id === option.playerId);
            player.ws.send(JSON.stringify({
                type: 'claim_options',
                payload: {
                    tile: tile,
                    canPong: option.canPong,
                    canGang: option.canGang,
                    canChow: option.canChow,
                    canShang: option.canShang,
                    canHu: option.canHu || false,
                    winCombinations: option.winCombinations || [],
                    isNextPlayer: option.isNextPlayer,
                    possibleClaims: option.possibleClaims,
                    timeout: freezeTimeout
                }
            }));
        });

        // Start freeze timer
        game.claimFreezeTimer = setTimeout(() => {
            PlayerClaimActionsHandler.resolveClaims(game);
        }, freezeTimeout);
    }

    static registerClaim(game, playerId, claimType, tiles = null, combination = null) {
        if (!game.claimWindowOpen) {
            return false;
        }

        const player = game.players.find(p => p.id === playerId);
        if (!player) return false;

        const priorityMap = { 'hu': 4, 'gang': 3, 'pong': 2, 'chow': 1, 'shang': 1 };
        const priority = priorityMap[claimType] || 0;

        console.log(`[CLAIM] Registering ${claimType} from player ${playerId} with priority ${priority}`);

        game.pendingClaims.set(playerId, {
            type: claimType,
            priority: priority,
            tiles: tiles,
            playerId: playerId,
            combination: combination // Store winning combination for 'hu' claims
        });

        game.playersPassed.delete(playerId);
        console.log(`[CLAIM] ${claimType} claim registered from ${playerId}`);
        return true;
    }

    static checkAllPlayersPassed(game) {
        let allPassed = true;
        game.playersWithClaimOptions.forEach(playerId => {
            if (!game.playersPassed.has(playerId)) {
                allPassed = false;
            }
        });

        if (allPassed && game.playersWithClaimOptions.size > 0) {
            console.log('[CLAIM] All players passed, ending freeze period immediately');

            if (game.claimFreezeTimer) {
                clearTimeout(game.claimFreezeTimer);
                game.claimFreezeTimer = null;
            }

            // Check if this is a rob gang period
            if (game.pendingRobGang) {
                PhaseTwo.resolveRobGangClaims(game);
            } else {
                PlayerClaimActionsHandler.resolveClaims(game);
            }
        }
    }

    static resolveClaims(game) {

        if (!game.claimWindowOpen) {
            return;
        }

        game.claimWindowOpen = false;

        if (game.claimFreezeTimer) {
            clearTimeout(game.claimFreezeTimer);
            game.claimFreezeTimer = null;
        }

        if (game.pendingClaims.size === 0) {
            console.log('[CLAIM] No claims, moving to next turn');
            game.broadcast({
                type: 'claim_period_end',
                payload: { claimedBy: null, claimType: null }
            });
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
            const nextPlayer = game.players[game.currentPlayerIndex];
            PhaseTwo.prepareNextTurn(game, nextPlayer, true);
            return;
        }

        // Check for multiple Hu claims (雙嚮/三嚮)
        const huClaims = [];
        game.pendingClaims.forEach((claim) => {
            if (claim.type === 'hu') {
                huClaims.push(claim);
            }
        });

        if (huClaims.length > 1) {
            const validWinners = huClaims.map(claim => ({
                playerId: claim.playerId,
                winResult: { pattern: '出沖', score: 0 },
                winningCombination: claim.combination || null
            }));

            const winnerIds = validWinners.map(w => w.playerId);
            game.pendingClaims.clear();

            game.broadcast({
                type: 'claim_period_end',
                payload: { claimedBy: winnerIds, claimType: 'hu' }
            });

            PhaseThree.endGameMultipleWinners(game, validWinners, game.lastDiscardedBy);
            return;
        }

        // Find the highest priority claim
        let highestClaim = null;
        game.pendingClaims.forEach((claim) => {
            if (!highestClaim || claim.priority > highestClaim.priority) {
                highestClaim = claim;
            }
        });

        game.pendingClaims.clear();

        game.broadcast({
            type: 'claim_period_end',
            payload: { claimedBy: highestClaim.playerId, claimType: highestClaim.type }
        });

        switch (highestClaim.type) {
            case 'hu':
                HuHandler.executeHuClaim(game, highestClaim.playerId, highestClaim);
                break;
            case 'gang':
                GangHandler.executeGangClaim(game, highestClaim.playerId);
                break;
            case 'pong':
                PongHandler.executePongClaim(game, highestClaim.playerId);
                break;
            case 'chow':
            case 'shang':
                ShangHandler.executeChowClaim(game, highestClaim.playerId, highestClaim.tiles);
                break;
        }
    }
}