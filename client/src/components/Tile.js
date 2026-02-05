import React from 'react';
import './Tile.css';

function Tile({ tile, selected, onClick, disabled, size = 'normal', className = '', concealed = false, rotated = false }) {
  // Return null if tile is undefined or null
  if (!tile) return null;

  // If concealed, render as tile-back
  if (concealed) {
    return <div className={`tile-back ${rotated ? 'rotated' : ''}`} />;
  }

  const getTileImagePath = () => {
    // Map our tile format to the image filenames
    if (tile.suit === 'bamboo') {
      return `/tiles/Sou${tile.value}.png`;
    } else if (tile.suit === 'character') {
      return `/tiles/Man${tile.value}.png`;
    } else if (tile.suit === 'dot') {
      return `/tiles/Pin${tile.value}.png`;
    } else if (tile.suit === 'wind') {
      const windMap = {
        east: 'Ton',    // 東
        south: 'Nan',   // 南
        west: 'Shaa',   // 西
        north: 'Pei'    // 北
      };
      return `/tiles/${windMap[tile.value]}.png`;
    } else if (tile.suit === 'dragon') {
      const dragonMap = {
        red: 'Chun',    // 中
        green: 'Hatsu', // 發
        white: 'Haku'   // 白
      };
      return `/tiles/${dragonMap[tile.value]}.png`;
    } else if (tile.suit === 'flower') {
      // Flower tiles: 梅(1), 蘭(2), 菊(3), 竹(4)
      return `/tiles/Flower${tile.value}.png`;
    } else if (tile.suit === 'season') {
      // Season tiles: 春(1), 夏(2), 秋(3), 冬(4)
      return `/tiles/Season${tile.value}.png`;
    }
    return `/tiles/Blank.png`;
  };

  const getTileName = () => {
    if (tile.suit === 'bamboo') {
      return `${tile.value}條`;
    } else if (tile.suit === 'character') {
      return `${tile.value}萬`;
    } else if (tile.suit === 'dot') {
      return `${tile.value}筒`;
    } else if (tile.suit === 'wind') {
      const windMap = { east: '東', south: '南', west: '西', north: '北' };
      return windMap[tile.value];
    } else if (tile.suit === 'dragon') {
      const dragonMap = { red: '中', green: '發', white: '白' };
      return dragonMap[tile.value];
    } else if (tile.suit === 'flower') {
      return `花${tile.value}`;
    } else if (tile.suit === 'season') {
      return `季${tile.value}`;
    }
    return '?';
  };

  return (
    <div
      className={`tile ${size} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${rotated ? 'rotated' : ''} ${className}`}
      onClick={!disabled ? onClick : undefined}
    >
      <img
        src={getTileImagePath()}
        alt={getTileName()}
        className="tile-image"
        draggable="false"
      />
    </div>
  );
}

export default Tile;

