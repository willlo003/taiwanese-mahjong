/**
 * GameUtils.js - Shared utility functions for Mahjong game
 * These functions are used across multiple phase files and StatusManager
 */

class GameUtils {
  /**
   * Check if a tile is a bonus tile (flower or season)
   * @param {Object} tile - The tile to check
   * @returns {boolean} - True if the tile is a bonus tile
   */
  static isBonusTile(tile) {
    // Tiles have type: 'bonus' and suit: 'flower' or 'season'
    return tile.type === 'bonus' || tile.suit === 'flower' || tile.suit === 'season';
  }

  /**
   * Helper function to deduplicate claim combinations based on tile sets
   * @param {Array} claims - Array of claim objects
   * @returns {Array} - Deduplicated array of claims
   */
  static deduplicateClaims(claims) {
    const seen = new Set();
    return claims.filter(claim => {
      // Create a unique key based on claim type and sorted tiles
      const tiles = claim.tiles || claim.displayTiles || [];
      const key = claim.type + ':' + tiles.map(t => `${t.suit}-${t.value}`).sort().join(',');
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Helper function to deduplicate win combinations based on displayTiles
   * @param {Array} combinations - Array of win combination objects
   * @returns {Array} - Deduplicated array of combinations
   */
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

export default GameUtils;

