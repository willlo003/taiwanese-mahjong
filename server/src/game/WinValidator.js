export class WinValidator {
  /**
   * Check if a hand is a winning hand
   * A winning hand consists of:
   * - 4 sets (Pong/Gang/Chow) + 1 pair, OR
   * - Special hands (Seven Pairs, Thirteen Orphans, etc.)
   */
  static isWinningHand(tiles, lastTile = null) {
    // Must have 14 or 17 tiles (14 normal, 17 with a gang)
    if (tiles.length !== 14 && tiles.length !== 17) {
      return { isWin: false, pattern: null };
    }

    // Check for special hands first
    const specialHand = this.checkSpecialHands(tiles);
    if (specialHand.isWin) {
      return specialHand;
    }

    // Check for standard winning pattern (4 sets + 1 pair)
    const standardWin = this.checkStandardWin(tiles);
    if (standardWin.isWin) {
      return standardWin;
    }

    return { isWin: false, pattern: null };
  }

  /**
   * Check for special winning hands
   */
  static checkSpecialHands(tiles) {
    // Seven Pairs (七對子)
    if (this.isSevenPairs(tiles)) {
      return { isWin: true, pattern: 'seven_pairs', score: 4 };
    }

    // Thirteen Orphans (十三么)
    if (this.isThirteenOrphans(tiles)) {
      return { isWin: true, pattern: 'thirteen_orphans', score: 8 };
    }

    return { isWin: false, pattern: null };
  }

  /**
   * Check for standard win (4 sets + 1 pair)
   */
  static checkStandardWin(tiles) {
    const tileCounts = this.countTiles(tiles);
    
    // Try to find a pair and check if remaining tiles form 4 sets
    for (const [tileKey, count] of Object.entries(tileCounts)) {
      if (count >= 2) {
        // Try this as the pair
        const remainingCounts = { ...tileCounts };
        remainingCounts[tileKey] -= 2;
        
        if (this.canFormSets(remainingCounts, 4)) {
          return { isWin: true, pattern: 'standard', score: 1 };
        }
      }
    }

    return { isWin: false, pattern: null };
  }

  /**
   * Check if tiles can form N sets (Pong/Gang/Chow)
   */
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
}

