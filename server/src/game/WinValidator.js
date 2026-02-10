export class WinValidator {
  /**
   * Check if a hand is a winning hand WITH revealed melds
   * @param {Array} handTiles - Tiles in hand (including the last drawn/claimed tile)
   * @param {number} numRevealedMelds - Number of revealed melds (碰/上/槓)
   * @param {Object} lastTile - The last tile drawn or claimed
   * @returns {Object} { isWin: boolean, pattern: string|null, score: number }
   */
  static isWinningHandWithMelds(handTiles, numRevealedMelds, lastTile = null) {
    // Taiwanese Mahjong has 2 winning patterns (bonus tiles don't count):
    // 1. Normal: 5 sets + 1 pair (revealed melds reduce needed sets from 5)
    // 2. 嚦咕嚦咕: 1 pong/kong + 7 pairs (revealed melds reduce needed sets from 1)

    // console.log(`[WIN_VALIDATOR] Checking hand with ${handTiles.length} tiles, ${numRevealedMelds} revealed melds`);
    // console.log(`[WIN_VALIDATOR] Hand tiles:`, handTiles.map(t => `${t.suit}-${t.value}`).join(', '));

    // Filter out bonus tiles (they don't count towards winning patterns)
    const nonBonusTiles = handTiles.filter(t => t.suit !== 'flower' && t.suit !== 'season');
    if (lastTile) {
      // console.log(`[WIN_VALIDATOR] Last tiles:`, `${lastTile.suit}-${lastTile.value}`);
      nonBonusTiles.push(lastTile)
    }
    // console.log(`[WIN_VALIDATOR] Non-bonus tiles: ${nonBonusTiles.length}`);

    // Check Pattern 1: Normal win (5 sets + 1 pair)
    const normalWin = this.checkNormalWinWithMelds(nonBonusTiles, numRevealedMelds);
    if (normalWin.isWin) {
      console.log(`[WIN_VALIDATOR] WIN! Normal pattern`);
      return normalWin;
    }

    if (numRevealedMelds === 0) {
      // Check Pattern 2: 嚦咕嚦咕 (1 pong/kong + 7 pairs)
      const liguligu = this.checkLiguLiguWithMelds(nonBonusTiles, numRevealedMelds);
      if (liguligu.isWin) {
        console.log(`[WIN_VALIDATOR] WIN! Ligu Ligu pattern`);
        return liguligu;
      }
    }

    console.log(`[WIN_VALIDATOR] No valid winning combination found`);
    return { isWin: false, pattern: null };
  }

  /**
   * Check for normal win pattern: 5 sets + 1 pair
   * With revealed melds, we need (5 - numRevealedMelds) sets + 1 pair from hand
   */
  static checkNormalWinWithMelds(handTiles, numRevealedMelds) {
    const neededSets = 5 - numRevealedMelds;
    // console.log(`[WIN_VALIDATOR] Normal pattern: need ${neededSets} sets + 1 pair from hand`);

    // Special case: if we need 0 sets (all 5 sets revealed), we only need a pair
    if (neededSets === 0) {
      if (handTiles.length !== 2) {
        // console.log(`[WIN_VALIDATOR] Need 0 sets but have ${handTiles.length} tiles (expected 2 for a pair)`);
        return { isWin: false, pattern: null };
      }
      const [tile1, tile2] = handTiles;
      const isPair = tile1.suit === tile2.suit && tile1.value === tile2.value;
      // console.log(`[WIN_VALIDATOR] Only need pair, checking if pair: ${isPair}`);
      return { isWin: isPair, pattern: 'standard', score: isPair ? 1 : 0 };
    }

    const tileCounts = this.countTiles(handTiles);
    // console.log(`[WIN_VALIDATOR] Tile counts:`, tileCounts);

    // Try to find a pair and check if remaining tiles form neededSets sets
    for (const [tileKey, count] of Object.entries(tileCounts)) {
      if (count >= 2) {
        // console.log(`[WIN_VALIDATOR] Trying ${tileKey} as pair...`);
        const remainingCounts = { ...tileCounts };
        remainingCounts[tileKey] -= 2;

        if (this.canFormSets(remainingCounts, neededSets)) {
          // console.log(`[WIN_VALIDATOR] WIN! Normal pattern with pair: ${tileKey}`);
          return { isWin: true, pattern: 'standard', score: 1 };
        }
      }
    }

    return { isWin: false, pattern: null };
  }

  /**
   * Check for 嚦咕嚦咕 pattern: 1 pong/kong + 7 pairs
   * With revealed melds, we need (1 - numRevealedMelds) pong/kong + 7 pairs total
   */
  static checkLiguLiguWithMelds(handTiles, numRevealedMelds) {
    // console.log(`[WIN_VALIDATOR] 嚦咕嚦咕 pattern: ${numRevealedMelds} revealed melds`);

    // We need at least 1 revealed or concealed pong/kong
    // If numRevealedMelds >= 1, we already have the required pong/kong
    // If numRevealedMelds === 0, we need 1 pong/kong from hand

    const tileCounts = this.countTiles(handTiles);
    const pairs = [];
    let hasPongInHand = false;

    // Count pairs and check for pong/kong in hand
    for (const [tileKey, count] of Object.entries(tileCounts)) {
      if (count >= 3) {
        hasPongInHand = true;
      }
      if (count === 2) {
        pairs.push(tileKey);
      } else if (count === 4) {
        // 4 of a kind can be treated as pong + pair OR 2 pairs
        pairs.push(tileKey);
        pairs.push(tileKey);
      }
    }

    // Calculate total pairs needed
    // Total tiles in a winning hand = 17 (5 sets * 3 + 1 pair + 1 drawn)
    // For 嚦咕嚦咕: 1 pong (3 tiles) + 7 pairs (14 tiles) = 17 tiles
    // With revealed melds: each revealed meld = 3 tiles
    // Remaining tiles should form pairs

    if (numRevealedMelds >= 1) {
      // Need 1 pong from hand + remaining tiles form pairs
      if (hasPongInHand) {
        // Check if we can form 1 pong + 7 pairs total
        // Try each possible pong
        for (const [tileKey, count] of Object.entries(tileCounts)) {
          if (count >= 3) {
            const remainingCounts = { ...tileCounts };
            remainingCounts[tileKey] -= 3;

            // Check if remaining tiles form exactly 7 pairs
            const remainingPairs = Object.values(remainingCounts).filter(c => c === 2).length;
            const allPairs = Object.values(remainingCounts).every(c => c === 0 || c === 2);

            if (allPairs && remainingPairs === 7) {
              return { isWin: true, pattern: 'ligu_ligu', score: 4 };
            }
          }
        }
      }
    }

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
   * Check for Seven Pairs
   */
  static isSevenPairs(tiles) {
    if (tiles.length !== 14) return false;

    const tileCounts = this.countTiles(tiles);
    const pairs = Object.values(tileCounts).filter(count => count === 2);
    
    return pairs.length === 7;
  }

  /**
   * Check for Thirteen Orphans
   */
  static isThirteenOrphans(tiles) {
    if (tiles.length !== 14) return false;
    
    const orphans = [
      'bamboo-1', 'bamboo-9',
      'character-1', 'character-9',
      'dot-1', 'dot-9',
      'wind-east', 'wind-south', 'wind-west', 'wind-north',
      'dragon-red', 'dragon-green', 'dragon-white'
    ];
    
    const tileCounts = this.countTiles(tiles);
    const orphanCounts = orphans.map(key => tileCounts[key] || 0);
    
    // Must have all 13 orphans, with one as a pair
    const hasAllOrphans = orphanCounts.every(count => count >= 1);
    const totalOrphans = orphanCounts.reduce((sum, count) => sum + count, 0);
    
    return hasAllOrphans && totalOrphans === 14;
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
   * Find all possible winning combinations for a hand
   * Returns an array of combinations, each showing which tiles form the winning pattern with the last tile
   * @param {Array} handTiles - All tiles in hand (including last drawn/claimed tile)
   * @param {number} numRevealedMelds - Number of revealed melds
   * @param {Object} lastTile - The last tile drawn or claimed
   * @returns {Array} Array of winning combinations, each with { pattern, tiles, lastTileRole }
   */
  static findWinningCombinations(handTiles, numRevealedMelds, lastTile) {
    const combinations = [];

    // Filter out bonus tiles
    const nonBonusTiles = handTiles.filter(t => t.suit !== 'flower' && t.suit !== 'season');

    // Check normal win pattern
    const normalCombos = this.findNormalWinCombinations(nonBonusTiles, numRevealedMelds, lastTile);
    combinations.push(...normalCombos);

    // Check 嚦咕嚦咕 pattern
    const liguCombos = this.findLiguLiguCombinations(nonBonusTiles, numRevealedMelds, lastTile);
    combinations.push(...liguCombos);

    return combinations;
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

    if (numRevealedMelds >= 1) {
      // Already have pong/kong from revealed melds
      // Check if all hand tiles form pairs
      const allPairs = Object.values(tileCounts).every(c => c === 0 || c === 2);
      const pairCount = Object.values(tileCounts).filter(c => c === 2).length;

      if (allPairs && pairCount === 7) {
        // Find which pair contains the last tile
        let displayTiles = [];
        if (lastTile) {
          const lastKey = this.makeTileKey(lastTile.suit, lastTile.value);
          if (tileCounts[lastKey] === 2) {
            displayTiles = handTiles.filter(t =>
              t.suit === lastTile.suit && t.value === lastTile.value
            ).slice(0, 2);
          }
        }

        // Extract all pairs as sets
        const pairs = [];
        const usedIds = new Set();
        for (const [key, count] of Object.entries(tileCounts)) {
          if (count === 2) {
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
          lastTileRole: 'pair',
          displayTiles: displayTiles,
          sets: [],
          pairs: pairs
        });
      }
    } else {
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
    }

    return combinations;
  }
}

