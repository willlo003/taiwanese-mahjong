import React, { useState } from 'react';
import './GameResultScreen.css';

function GameResultScreen({ 
  gameResult, 
  playerInfo, 
  onReady,
  onLeave 
}) {
  const [isReady, setIsReady] = useState(false);

  const handleReady = () => {
    setIsReady(true);
    onReady();
  };

  const windToChinese = (wind) => {
    const map = { east: '東', south: '南', west: '西', north: '北' };
    return map[wind] || wind;
  };

  const getWinTypeDisplay = () => {
    if (!gameResult) return '';
    
    const { winType, reason } = gameResult;
    
    if (winType) {
      return winType;
    }
    
    if (reason === 'draw') {
      return '和局';
    }
    
    return '';
  };

  if (!gameResult) return null;

  const { playerResults } = gameResult;

  return (
    <div className="game-result-overlay">
      <div className="game-result-container">
        <h1 className="game-result-title">結果</h1>
        
        <div className="game-result-type">
          {getWinTypeDisplay()}
        </div>

        <div className="game-result-table">
          <div className="game-result-header">
            <div className="result-col-name">玩家</div>
            <div className="result-col-position">位置</div>
            <div className="result-col-score">番數</div>
            <div className="result-col-total">總分</div>
          </div>

          {playerResults && playerResults.map((result, index) => (
            <div 
              key={result.playerId}
              className={`game-result-row ${result.isWinner ? 'winner-row' : ''} ${result.isLoser ? 'loser-row' : ''}`}
            >
              <div className="result-col-name">
                {result.playerName}
                {result.isDealer && <span className="dealer-badge">莊</span>}
                {result.isTing && <span className="ting-badge">（聽）</span>}
              </div>
              <div className="result-col-position">
                {windToChinese(result.position)}
              </div>
              <div className="result-col-score">
                {result.isWinner ? '+' : result.isLoser ? '-' : ''}
                {result.score || 0}
              </div>
              <div className="result-col-total">
                {result.totalScore || 0}
              </div>
            </div>
          ))}
        </div>

        <div className="game-result-actions">
          <button 
            className={`ready-button ${isReady ? 'ready-active' : ''}`}
            onClick={handleReady}
            disabled={isReady}
          >
            {isReady ? '已準備' : '準備'}
          </button>
          
          <button 
            className="leave-button"
            onClick={onLeave}
          >
            離開
          </button>
        </div>

        <div className="game-result-info">
          下一局: {windToChinese(gameResult.nextRound)}圈{windToChinese(gameResult.nextWind)}風
        </div>
      </div>
    </div>
  );
}

export default GameResultScreen;

