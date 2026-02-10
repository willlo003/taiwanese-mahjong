export class GangValidator {
    static checkSelfGangOptions(game, hand, melds) {
        const gangOptions = [];
        // Check for concealed gang (暗槓): 4 same tiles in hand
        const tileCounts = new Map();
        hand.forEach(tile => {
            const key = `${tile.suit}-${tile.value}`;
            if (!tileCounts.has(key)) {
                tileCounts.set(key, []);
            }
            tileCounts.get(key).push(tile);
        });

        tileCounts.forEach((tiles, key) => {
            if (tiles.length === 4) {
                gangOptions.push({
                    type: 'concealed_gang',
                    tiles: tiles,
                    suit: tiles[0].suit,
                    value: tiles[0].value
                });
            }
        });

        melds.forEach((meld, meldIdx) => {
            if (meld.type === 'pong') {
                const matchingTile = hand.find(t =>
                    t.suit === meld.tiles[0].suit && t.value === meld.tiles[0].value
                );
                if (matchingTile) {
                    gangOptions.push({
                        type: 'add_to_pong',
                        tiles: [...meld.tiles, matchingTile],
                        meldIndex: meldIdx,
                        suit: matchingTile.suit,
                        value: matchingTile.value
                    });
                }
            }
        });

        console.log(`[CHECK_GANG] Total gang options found: ${gangOptions.length}`);
        return {
            gangOptions,
            canGang: gangOptions.length > 0
        };
    }

}