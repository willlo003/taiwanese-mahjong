export class WinValidator {
  /**
   * Check if a hand is a winning hand WITH revealed melds
   * @param {Array} handTiles - Tiles in hand (including the last drawn/claimed tile)
   * @param {number} numRevealedMelds - Number of revealed melds (碰/上/槓)
   * @param {Object} lastTile - The last tile drawn or claimed
   * @param player
   * @returns {Object} { isWin: boolean, pattern: string|null, score: number }
   */
  static isWinningHandWithMelds(handTiles, numRevealedMelds, lastTile, player) {
    let nonBonusTiles = handTiles.filter(t => t.suit !== 'flower' && t.suit !== 'season');
    nonBonusTiles.push(lastTile);

    if (numRevealedMelds <= 1) {
      const thirteenOrphansCombos = this.findThirteenOrphansCombinations(nonBonusTiles, numRevealedMelds, lastTile);
      if (thirteenOrphansCombos.length > 0) {
        console.log(`[WIN_VALIDATOR] 🎉 WIN! Thirteen Orphans pattern for ${player.name}`);
        return { isWin: true, pattern: 'thirteen_orphans', combinations: this.deduplicateWinCombinations(thirteenOrphansCombos) };
      }
    }

    if (numRevealedMelds === 0) {
      const liguLiguCombos = this.findLiguLiguCombinations(nonBonusTiles, numRevealedMelds, lastTile);
      if (liguLiguCombos.length > 0) {
        console.log(`[WIN_VALIDATOR] 🎉 WIN! Ligu Ligu pattern for ${player.name}`);
        return { isWin: true, pattern: 'ligu_ligu', combinations: this.deduplicateWinCombinations(liguLiguCombos) };
      }
    }

    const normalCombos = this.findNormalWinCombinations(nonBonusTiles, numRevealedMelds, lastTile);
    if (normalCombos.length > 0) {
      console.log(`[WIN_VALIDATOR] 🎉 WIN! Normal pattern ${player.name}`);
      return { isWin: true, pattern: 'standard', combinations: this.deduplicateWinCombinations(normalCombos) };
    }

    console.log(`[WIN_VALIDATOR] No valid winning combination found for ${player.name}`);
    return { isWin: false, pattern: null };
  }

  static canFormSets(tileCounts, numSets) {
    if (numSets === 0) {
      // All tiles should be used
      return Object.values(tileCounts).every(count => count === 0);
    }

    // Try to form a Pong/Gang
    for (const [tileKey, count] of Object.entries(tileCounts)) {
      if (count >= 3) {
        const newCounts = { ...tileCounts };
        newCounts[tileKey] -= 3;
        if (this.canFormSets(newCounts, numSets - 1)) {
          return true;
        }
      }
    }

    // Try to form a Chow (only for suit tiles)
    for (const [tileKey, count] of Object.entries(tileCounts)) {
      if (count > 0) {
        const tile = this.parseTileKey(tileKey);
        if (tile.type === 'suit' && typeof tile.value === 'number') {
          // Try to form a sequence
          const key1 = this.makeTileKey(tile.suit, tile.value);
          const key2 = this.makeTileKey(tile.suit, tile.value + 1);
          const key3 = this.makeTileKey(tile.suit, tile.value + 2);
          
          if (tileCounts[key1] > 0 && tileCounts[key2] > 0 && tileCounts[key3] > 0) {
            const newCounts = { ...tileCounts };
            newCounts[key1] -= 1;
            newCounts[key2] -= 1;
            newCounts[key3] -= 1;
            if (this.canFormSets(newCounts, numSets - 1)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Extract all sets from tile counts (returns array of sets, each set is { type: 'pong'|'chow', tiles: [...] })
   * @param {Object} tileCounts - Tile counts object
   * @param {number} numSets - Number of sets to extract
   * @param {Array} handTiles - Original hand tiles to get actual tile objects
   * @param {Array} usedTileIds - Array of tile IDs already used (to avoid reusing)
   * @returns {Array|null} Array of sets or null if cannot form sets
   */
  static extractSets(tileCounts, numSets, handTiles, usedTileIds = []) {
    if (numSets === 0) {
      // All tiles should be used
      if (Object.values(tileCounts).every(count => count === 0)) {
        return [];
      }
      return null;
    }

    // Try to form a Pong first
    for (const [tileKey, count] of Object.entries(tileCounts)) {
      if (count >= 3) {
        const newCounts = { ...tileCounts };
        newCounts[tileKey] -= 3;

        const result = this.extractSets(newCounts, numSets - 1, handTiles, usedTileIds);
        if (result !== null) {
          // Get 3 tiles of this type from hand (not already used)
          const parsed = this.parseTileKey(tileKey);
          const pongTiles = handTiles.filter(t =>
            t.suit === parsed.suit && t.value === parsed.value && !usedTileIds.includes(t.id)
          ).slice(0, 3);

          if (pongTiles.length === 3) {
            return [{ type: 'pong', tiles: pongTiles }, ...result];
          }
        }
      }
    }

    // Try to form a Chow (only for suit tiles)
    for (const [tileKey, count] of Object.entries(tileCounts)) {
      if (count > 0) {
        const tile = this.parseTileKey(tileKey);
        if (tile.type === 'suit' && typeof tile.value === 'number') {
          // Try to form a sequence
          const key1 = this.makeTileKey(tile.suit, tile.value);
          const key2 = this.makeTileKey(tile.suit, tile.value + 1);
          const key3 = this.makeTileKey(tile.suit, tile.value + 2);

          if (tileCounts[key1] > 0 && tileCounts[key2] > 0 && tileCounts[key3] > 0) {
            const newCounts = { ...tileCounts };
            newCounts[key1] -= 1;
            newCounts[key2] -= 1;
            newCounts[key3] -= 1;

            const result = this.extractSets(newCounts, numSets - 1, handTiles, usedTileIds);
            if (result !== null) {
              // Get the 3 tiles for this chow from hand
              const parsed1 = this.parseTileKey(key1);
              const parsed2 = this.parseTileKey(key2);
              const parsed3 = this.parseTileKey(key3);

              const chowTiles = [
                handTiles.find(t => t.suit === parsed1.suit && t.value === parsed1.value && !usedTileIds.includes(t.id)),
                handTiles.find(t => t.suit === parsed2.suit && t.value === parsed2.value && !usedTileIds.includes(t.id)),
                handTiles.find(t => t.suit === parsed3.suit && t.value === parsed3.value && !usedTileIds.includes(t.id))
              ].filter(Boolean);

              if (chowTiles.length === 3) {
                return [{ type: 'chow', tiles: chowTiles }, ...result];
              }
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Count tiles by type
   */
  static countTiles(tiles) {
    const counts = {};
    tiles.forEach(tile => {
      const key = this.makeTileKey(tile.suit, tile.value);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  static makeTileKey(suit, value) {
    return `${suit}-${value}`;
  }

  static parseTileKey(key) {
    const [suit, value] = key.split('-');
    const numValue = parseInt(value);
    return {
      suit,
      value: isNaN(numValue) ? value : numValue,
      type: ['bamboo', 'character', 'dot'].includes(suit) ? 'suit' : 'honor'
    };
  }

  /**
   * Find all normal win combinations (5 sets + 1 pair)
   */
  static findNormalWinCombinations(handTiles, numRevealedMelds, lastTile) {
    const combinations = [];
    const neededSets = 5 - numRevealedMelds;
    const tileCounts = this.countTiles(handTiles);

    // Special case: need 0 sets, only need a pair
    if (neededSets === 0) {
      if (handTiles.length === 2) {
        const [tile1, tile2] = handTiles;
        if (tile1.suit === tile2.suit && tile1.value === tile2.value) {
          combinations.push({
            pattern: 'standard',
            lastTileRole: 'pair',
            displayTiles: [tile1, tile2],
            sets: [],
            pair: { tiles: [tile1, tile2] }
          });
        }
      }
      return combinations;
    }

    // Try each possible pair
    for (const [tileKey, count] of Object.entries(tileCounts)) {
      if (count >= 2) {
        const remainingCounts = { ...tileCounts };
        remainingCounts[tileKey] -= 2;

        if (this.canFormSets(remainingCounts, neededSets)) {
          // This is a valid winning combination
          // Determine if lastTile is part of the pair or a set
          const pairTile = this.parseTileKey(tileKey);
          const isLastTileInPair = lastTile &&
            lastTile.suit === pairTile.suit &&
            lastTile.value === pairTile.value;

          // Get the tiles that form the pair
          const pairTiles = handTiles.filter(t =>
            t.suit === pairTile.suit && t.value === pairTile.value
          ).slice(0, 2);

          let displayTiles = pairTiles;
          let lastTileSetType = null;

          // If lastTile is part of a set (not pair), find which set it belongs to
          if (!isLastTileInPair && lastTile) {
            const setInfo = this.findSetContainingTile(remainingCounts, lastTile, handTiles);
            if (setInfo) {
              displayTiles = setInfo.tiles;
              lastTileSetType = setInfo.type; // 'pong' or 'chow'
            }
          }

          // Extract all sets from the remaining tiles
          const usedTileIds = pairTiles.map(t => t.id);
          const sets = this.extractSets(remainingCounts, neededSets, handTiles, usedTileIds);

          combinations.push({
            pattern: 'standard',
            lastTileRole: isLastTileInPair ? 'pair' : (lastTileSetType || 'set'),
            displayTiles: displayTiles,
            pairTiles: pairTiles,
            pairKey: tileKey,
            sets: sets || [],
            pair: { tiles: pairTiles }
          });
        }
      }
    }

    return combinations;
  }

  /**
   * Find the set (pong or chow) that contains the given tile
   */
  static findSetContainingTile(tileCounts, targetTile, handTiles) {
    const targetKey = this.makeTileKey(targetTile.suit, targetTile.value);

    // Check if it can be part of a pong (3 of the same)
    if (tileCounts[targetKey] >= 3) {
      // Get 3 tiles of this type from hand
      const pongTiles = handTiles.filter(t =>
        t.suit === targetTile.suit && t.value === targetTile.value
      ).slice(0, 3);
      return { type: 'pong', tiles: pongTiles };
    }

    // Check if it can be part of a chow (sequence)
    const tile = this.parseTileKey(targetKey);
    if (tile.type === 'suit' && typeof tile.value === 'number') {
      // Check all possible sequences containing this tile
      // Sequence 1: [v-2, v-1, v]
      const seq1Keys = [
        this.makeTileKey(tile.suit, tile.value - 2),
        this.makeTileKey(tile.suit, tile.value - 1),
        targetKey
      ];
      if (tile.value >= 3 &&
          tileCounts[seq1Keys[0]] > 0 &&
          tileCounts[seq1Keys[1]] > 0 &&
          tileCounts[seq1Keys[2]] > 0) {
        const chowTiles = seq1Keys.map(key => {
          const parsed = this.parseTileKey(key);
          return handTiles.find(t => t.suit === parsed.suit && t.value === parsed.value);
        }).filter(Boolean);
        if (chowTiles.length === 3) {
          return { type: 'chow', tiles: chowTiles };
        }
      }

      // Sequence 2: [v-1, v, v+1]
      const seq2Keys = [
        this.makeTileKey(tile.suit, tile.value - 1),
        targetKey,
        this.makeTileKey(tile.suit, tile.value + 1)
      ];
      if (tile.value >= 2 && tile.value <= 8 &&
          tileCounts[seq2Keys[0]] > 0 &&
          tileCounts[seq2Keys[1]] > 0 &&
          tileCounts[seq2Keys[2]] > 0) {
        const chowTiles = seq2Keys.map(key => {
          const parsed = this.parseTileKey(key);
          return handTiles.find(t => t.suit === parsed.suit && t.value === parsed.value);
        }).filter(Boolean);
        if (chowTiles.length === 3) {
          return { type: 'chow', tiles: chowTiles };
        }
      }

      // Sequence 3: [v, v+1, v+2]
      const seq3Keys = [
        targetKey,
        this.makeTileKey(tile.suit, tile.value + 1),
        this.makeTileKey(tile.suit, tile.value + 2)
      ];
      if (tile.value <= 7 &&
          tileCounts[seq3Keys[0]] > 0 &&
          tileCounts[seq3Keys[1]] > 0 &&
          tileCounts[seq3Keys[2]] > 0) {
        const chowTiles = seq3Keys.map(key => {
          const parsed = this.parseTileKey(key);
          return handTiles.find(t => t.suit === parsed.suit && t.value === parsed.value);
        }).filter(Boolean);
        if (chowTiles.length === 3) {
          return { type: 'chow', tiles: chowTiles };
        }
      }
    }

    return null;
  }

  /**
   * Find all 嚦咕嚦咕 combinations (1 pong/kong + 7 pairs)
   */
  static findLiguLiguCombinations(handTiles, numRevealedMelds, lastTile) {
    const combinations = [];
    const tileCounts = this.countTiles(handTiles);

    // Need 1 pong from hand + 7 pairs total
    for (const [tileKey, count] of Object.entries(tileCounts)) {
      if (count >= 3) {
        const remainingCounts = { ...tileCounts };
        remainingCounts[tileKey] -= 3;

        const remainingPairs = Object.values(remainingCounts).filter(c => c === 2).length;
        const allPairs = Object.values(remainingCounts).every(c => c === 0 || c === 2);

        if (allPairs && remainingPairs === 7) {
          const pongTile = this.parseTileKey(tileKey);
          const isLastTileInPong = lastTile &&
            lastTile.suit === pongTile.suit &&
            lastTile.value === pongTile.value;

          // Get display tiles based on what the last tile completes
          let displayTiles = [];
          const pongTiles = handTiles.filter(t =>
            t.suit === pongTile.suit && t.value === pongTile.value
          ).slice(0, 3);

          if (isLastTileInPong) {
            displayTiles = pongTiles;
          } else if (lastTile) {
            displayTiles = handTiles.filter(t =>
              t.suit === lastTile.suit && t.value === lastTile.value
            ).slice(0, 2);
          }

          // Extract all pairs
          const pairs = [];
          const usedIds = new Set(pongTiles.map(t => t.id));
          for (const [key, pairCount] of Object.entries(remainingCounts)) {
            if (pairCount === 2) {
              const parsed = this.parseTileKey(key);
              const pairTiles = handTiles.filter(t =>
                t.suit === parsed.suit && t.value === parsed.value && !usedIds.has(t.id)
              ).slice(0, 2);
              pairTiles.forEach(t => usedIds.add(t.id));
              pairs.push({ type: 'pair', tiles: pairTiles });
            }
          }

          combinations.push({
            pattern: 'ligu_ligu',
            lastTileRole: isLastTileInPong ? 'pong' : 'pair',
            displayTiles: displayTiles,
            pongKey: tileKey,
            sets: [{ type: 'pong', tiles: pongTiles }],
            pairs: pairs
          });
        }
      }
    }

    return combinations;
  }

  /**
   * Find all Thirteen Orphans (十三么) combinations
   * Requirements:
   * a) Must include all 13 terminal/honor tiles: 1/9 of each suit + all winds + all dragons
   * b) One of these 13 tiles appears as a pair (eyes)
   * c) Can have one revealed meld (pong/chow/gang) of other tiles
   */
  static findThirteenOrphansCombinations(handTiles, numRevealedMelds, lastTile) {
    const combinations = [];

    // Define the 13 required orphan tiles
    const orphanTiles = [
      { suit: 'dot', value: 1 },
      { suit: 'dot', value: 9 },
      { suit: 'character', value: 1 },
      { suit: 'character', value: 9 },
      { suit: 'bamboo', value: 1 },
      { suit: 'bamboo', value: 9 },
      { suit: 'wind', value: 'east' },
      { suit: 'wind', value: 'south' },
      { suit: 'wind', value: 'west' },
      { suit: 'wind', value: 'north' },
      { suit: 'dragon', value: 'red' },
      { suit: 'dragon', value: 'green' },
      { suit: 'dragon', value: 'white' }
    ];

    const tileCounts = this.countTiles(handTiles);
    const orphanKeys = orphanTiles.map(t => this.makeTileKey(t.suit, t.value));

    if (numRevealedMelds === 1) {
      // Case 1: One set already revealed, just check for 13 orphans + 1 pair
      const orphanCounts = {};
      let hasAllOrphans = true;

      for (const orphan of orphanTiles) {
        const key = this.makeTileKey(orphan.suit, orphan.value);
        const count = tileCounts[key] || 0;
        orphanCounts[key] = count;

        if (count === 0) {
          hasAllOrphans = false;
          break;
        }
      }

      if (!hasAllOrphans) {
        return combinations;
      }

      // Find which orphan tile forms the pair
      for (const key of orphanKeys) {
        if (orphanCounts[key] === 2) {
          // This orphan tile is the pair
          const pairTile = this.parseTileKey(key);
          const isLastTileInPair = lastTile &&
            lastTile.suit === pairTile.suit &&
            lastTile.value === pairTile.value;

          // Get the pair tiles
          const pairTiles = handTiles.filter(t =>
            t.suit === pairTile.suit && t.value === pairTile.value
          ).slice(0, 2);

          // Get all orphan tiles for display
          const orphanTilesInHand = [];
          const usedIds = new Set();

          for (const orphan of orphanTiles) {
            const orphanKey = this.makeTileKey(orphan.suit, orphan.value);
            const count = orphanCounts[orphanKey];
            const tiles = handTiles.filter(t =>
              t.suit === orphan.suit && t.value === orphan.value && !usedIds.has(t.id)
            ).slice(0, count);
            tiles.forEach(t => {
              usedIds.add(t.id);
              orphanTilesInHand.push(t);
            });
          }

          combinations.push({
            pattern: 'thirteen_orphans',
            lastTileRole: isLastTileInPair ? 'pair' : 'orphan',
            displayTiles: isLastTileInPair ? pairTiles : orphanTilesInHand,
            pairTiles: pairTiles,
            pairKey: key,
            orphanTiles: orphanTilesInHand,
            sets: [],
            pair: { tiles: pairTiles }
          });
        }
      }
    } else {
      // Case 2: No revealed melds, need to find 1 set + 13 orphans + 1 pair
      // Try to extract one set from non-orphan tiles or extra orphan tiles

      // First, check if we have at least one of each orphan tile
      const orphanCounts = {};
      for (const orphan of orphanTiles) {
        const key = this.makeTileKey(orphan.suit, orphan.value);
        orphanCounts[key] = tileCounts[key] || 0;
      }

      // Try each possible pair from orphan tiles
      for (const pairKey of orphanKeys) {
        if (orphanCounts[pairKey] >= 2) {
          // Try to form a set from the remaining tiles
          const remainingCounts = { ...tileCounts };

          // Reserve 2 tiles for the pair
          remainingCounts[pairKey] -= 2;

          // Reserve 1 of each other orphan tile
          for (const key of orphanKeys) {
            if (key !== pairKey) {
              remainingCounts[key] -= 1;
              if (remainingCounts[key] < 0) {
                // Missing an orphan tile
                remainingCounts[key] = -999; // Mark as invalid
              }
            }
          }

          // Check if any orphan count is negative (missing orphan)
          let hasAllOrphans = true;
          for (const key of orphanKeys) {
            if (remainingCounts[key] < 0) {
              hasAllOrphans = false;
              break;
            }
          }

          if (!hasAllOrphans) {
            continue; // Skip this pair option
          }

          // Now check if remaining tiles can form exactly 1 set
          if (this.canFormSets(remainingCounts, 1)) {
            // Valid thirteen orphans combination!
            const pairTile = this.parseTileKey(pairKey);
            const isLastTileInPair = lastTile &&
              lastTile.suit === pairTile.suit &&
              lastTile.value === pairTile.value;

            // Get the pair tiles
            const pairTiles = handTiles.filter(t =>
              t.suit === pairTile.suit && t.value === pairTile.value
            ).slice(0, 2);

            // Get all orphan tiles for display
            const orphanTilesInHand = [];
            const usedIds = new Set(pairTiles.map(t => t.id));

            for (const orphan of orphanTiles) {
              const orphanKey = this.makeTileKey(orphan.suit, orphan.value);
              const count = orphanKey === pairKey ? 0 : 1; // Already used pair
              const tiles = handTiles.filter(t =>
                t.suit === orphan.suit && t.value === orphan.value && !usedIds.has(t.id)
              ).slice(0, count);
              tiles.forEach(t => {
                usedIds.add(t.id);
                orphanTilesInHand.push(t);
              });
            }

            // Extract the set from remaining tiles
            const sets = this.extractSets(remainingCounts, 1, handTiles, Array.from(usedIds));

            // Determine if the last tile is part of the set
            let lastTileRole = 'orphan';
            let displayTiles = orphanTilesInHand;

            if (isLastTileInPair) {
              lastTileRole = 'pair';
              displayTiles = pairTiles;
            } else if (sets && sets.length > 0 && lastTile) {
              // Check if the last tile is in any of the sets
              const isInSet = sets.some(set =>
                set.tiles && set.tiles.some(t =>
                  t.suit === lastTile.suit && t.value === lastTile.value
                )
              );
              if (isInSet) {
                lastTileRole = 'set';
                // Find the set that contains the last tile
                const setWithLastTile = sets.find(set =>
                  set.tiles && set.tiles.some(t =>
                    t.suit === lastTile.suit && t.value === lastTile.value
                  )
                );
                displayTiles = setWithLastTile ? setWithLastTile.tiles : [lastTile];
              }
            }

            combinations.push({
              pattern: 'thirteen_orphans',
              lastTileRole: lastTileRole,
              displayTiles: displayTiles,
              pairTiles: pairTiles,
              pairKey: pairKey,
              orphanTiles: orphanTilesInHand,
              sets: sets || [],
              pair: { tiles: pairTiles }
            });
          }
        }
      }
    }

    return combinations;
  }
  
  static deduplicateWinCombinations(combinations) {
    const seen = new Set();
    return combinations.filter(combo => {
      // Create a unique key based on lastTileRole and displayTiles
      const tiles = combo.displayTiles || combo.pairTiles || [];
      const key = combo.lastTileRole + ':' + tiles.map(t => `${t.suit}-${t.value}`).sort().join(',');
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

