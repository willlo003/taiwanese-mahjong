import { v4 as uuidv4 } from 'uuid';

export class TileManager {
  constructor() {
    this.tiles = [];
    this.initializeTiles();
  }

  initializeTiles() {
    // Taiwanese Mahjong uses 144 tiles
    
    // Bamboo (條) 1-9, 4 of each
    for (let i = 1; i <= 9; i++) {
      for (let j = 0; j < 4; j++) {
        this.tiles.push({ id: uuidv4(), suit: 'bamboo', value: i, type: 'suit' });
      }
    }

    // Characters (萬) 1-9, 4 of each
    for (let i = 1; i <= 9; i++) {
      for (let j = 0; j < 4; j++) {
        this.tiles.push({ id: uuidv4(), suit: 'character', value: i, type: 'suit' });
      }
    }

    // Dots (筒) 1-9, 4 of each
    for (let i = 1; i <= 9; i++) {
      for (let j = 0; j < 4; j++) {
        this.tiles.push({ id: uuidv4(), suit: 'dot', value: i, type: 'suit' });
      }
    }

    // Winds (風) - East, South, West, North, 4 of each
    const winds = ['east', 'south', 'west', 'north'];
    winds.forEach((wind) => {
      for (let j = 0; j < 4; j++) {
        this.tiles.push({ id: uuidv4(), suit: 'wind', value: wind, type: 'honor' });
      }
    });

    // Dragons (箭) - Red, Green, White, 4 of each
    const dragons = ['red', 'green', 'white'];
    dragons.forEach((dragon) => {
      for (let j = 0; j < 4; j++) {
        this.tiles.push({ id: uuidv4(), suit: 'dragon', value: dragon, type: 'honor' });
      }
    });

    // Flowers (花) - 1-4
    for (let i = 1; i <= 4; i++) {
      this.tiles.push({ id: uuidv4(), suit: 'flower', value: i, type: 'bonus' });
    }

    // Seasons (季) - 1-4
    for (let i = 1; i <= 4; i++) {
      this.tiles.push({ id: uuidv4(), suit: 'season', value: i, type: 'bonus' });
    }
  }

  shuffle() {
    // Fisher-Yates shuffle
    for (let i = this.tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tiles[i], this.tiles[j]] = [this.tiles[j], this.tiles[i]];
    }
  }

  drawTile() {
    return this.tiles.pop();
  }

  getRemainingCount() {
    return this.tiles.length;
  }

  reset() {
    this.tiles = [];
    this.initializeTiles();
  }
}

