import React, { useState } from 'react';
import './App.css';
import JoinScreen from './components/JoinScreen';
import LobbyScreen from './components/LobbyScreen';
import GameScreen from './components/GameScreen';
import ClaimDialog from './components/ClaimDialog';
import { useWebSocket } from './hooks/useWebSocket';
import { soundManager } from './utils/sounds';

function App() {
  const [gameState, setGameState] = useState('join'); // join, lobby, playing
  const [playerInfo, setPlayerInfo] = useState(null);
  const [players, setPlayers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [hand, setHand] = useState([]);
  const [discardPiles, setDiscardPiles] = useState({});
  const [tilesRemaining, setTilesRemaining] = useState(144);
  const [melds, setMelds] = useState({});
  const [claimOptions, setClaimOptions] = useState(null);
  const [dealerIndex, setDealerIndex] = useState(0);
  const [playerWinds, setPlayerWinds] = useState({});
  const [revealedBonusTiles, setRevealedBonusTiles] = useState({});
  const [hasDrawn, setHasDrawn] = useState(false);
  const [playerHandSizes, setPlayerHandSizes] = useState({}); // Track hand sizes for all players

  const { sendMessage, isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage
  });

  function handleWebSocketMessage(data) {
    console.log('Received:', data);

    switch (data.type) {
      case 'joined':
        setPlayerInfo(data.payload);
        setGameState('lobby');
        soundManager.playerJoined();
        break;

      case 'player_list':
        setPlayers(data.payload.players);
        break;

      case 'game_started':
        setGameState('playing');
        setCurrentPlayer(data.payload.currentPlayer);
        if (data.payload.dealerIndex !== undefined) {
          setDealerIndex(data.payload.dealerIndex);
        }
        if (data.payload.playerWinds) {
          setPlayerWinds(data.payload.playerWinds);
        }
        soundManager.gameStart();
        break;

      case 'hand_update':
        console.log('[CLIENT] Received hand_update, new hand size:', data.payload.hand.length);
        setHand(data.payload.hand);
        setTilesRemaining(data.payload.tilesRemaining);
        if (data.payload.revealedBonusTiles && playerInfo?.playerId) {
          setRevealedBonusTiles(prev => ({
            ...prev,
            [playerInfo.playerId]: data.payload.revealedBonusTiles
          }));
        }
        break;

      case 'tile_drawn':
        setHand(data.payload.hand);
        setTilesRemaining(data.payload.tilesRemaining);
        setHasDrawn(true);
        soundManager.tileDraw();
        break;

      case 'player_drew':
        // Update tiles remaining and hand size for the player who drew
        setTilesRemaining(data.payload.tilesRemaining);
        if (data.payload.handSize !== undefined) {
          setPlayerHandSizes(prev => ({
            ...prev,
            [data.payload.playerId]: data.payload.handSize
          }));
        }
        break;

      case 'tile_discarded':
        console.log('[CLIENT] Received tile_discarded from player:', data.payload.playerId);
        setDiscardPiles(prev => ({
          ...prev,
          [data.payload.playerId]: data.payload.discardPile
        }));
        // Update hand size for the player who discarded
        if (data.payload.handSize !== undefined) {
          setPlayerHandSizes(prev => ({
            ...prev,
            [data.payload.playerId]: data.payload.handSize
          }));
        }
        soundManager.tileDiscard();
        break;

      case 'bonus_tiles_replaced':
        setHand(data.payload.hand);
        setTilesRemaining(data.payload.tilesRemaining);
        if (data.payload.revealedBonusTiles && playerInfo?.playerId) {
          setRevealedBonusTiles(prev => ({
            ...prev,
            [playerInfo.playerId]: data.payload.revealedBonusTiles
          }));
        }
        break;

      case 'player_revealed_bonus':
        setTilesRemaining(data.payload.tilesRemaining);
        if (data.payload.bonusTiles) {
          setRevealedBonusTiles(prev => ({
            ...prev,
            [data.payload.playerId]: [
              ...(prev[data.payload.playerId] || []),
              ...data.payload.bonusTiles
            ]
          }));
        }
        break;

      case 'turn_changed':
        setCurrentPlayer(data.payload.currentPlayer);
        setHasDrawn(false); // Reset draw state when turn changes
        if (data.payload.currentPlayer === playerInfo?.playerId) {
          soundManager.yourTurn();
        }
        break;

      case 'claim_options':
        setClaimOptions(data.payload);
        soundManager.yourTurn();
        break;

      case 'pong_claimed':
      case 'gang_claimed':
      case 'chow_claimed':
        setMelds(prev => ({
          ...prev,
          [data.payload.playerId]: [...(prev[data.payload.playerId] || []), data.payload.meld]
        }));
        if (data.type === 'pong_claimed') soundManager.pong();
        if (data.type === 'gang_claimed') soundManager.gang();
        if (data.type === 'chow_claimed') soundManager.chow();
        break;

      case 'game_ended':
        const winMessage = data.payload.winner
          ? `${data.payload.winnerName} wins with ${data.payload.pattern}! Score: ${data.payload.score}`
          : `Game ended: ${data.payload.reason}`;

        if (data.payload.winner) {
          soundManager.win();
        }

        setTimeout(() => {
          alert(winMessage);
          setGameState('lobby');
        }, 500);
        break;

      case 'error':
        alert(data.message);
        soundManager.error();
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  }

  const handleJoin = (name) => {
    sendMessage({ type: 'join', payload: { name } });
  };

  const handleReady = () => {
    sendMessage({ type: 'ready', payload: {} });
  };

  const handleRandomSeats = () => {
    sendMessage({ type: 'random_seats', payload: {} });
  };

  const handleStartGame = () => {
    sendMessage({ type: 'start_game', payload: {} });
  };

  const handleDraw = () => {
    sendMessage({ type: 'action', payload: { type: 'draw' } });
  };

  const handleDiscard = (tile) => {
    sendMessage({ type: 'action', payload: { type: 'discard', tile } });
    soundManager.tileClick();
  };

  const handleHu = () => {
    sendMessage({ type: 'action', payload: { type: 'hu' } });
  };

  const handlePong = (tile) => {
    sendMessage({ type: 'action', payload: { type: 'pong', tile } });
    setClaimOptions(null);
  };

  const handleGang = (tile) => {
    sendMessage({ type: 'action', payload: { type: 'gang', tile } });
    setClaimOptions(null);
  };

  const handleChow = (tiles) => {
    sendMessage({ type: 'action', payload: { type: 'chow', tiles } });
    setClaimOptions(null);
  };

  const handleSkipClaim = () => {
    setClaimOptions(null);
  };

  return (
    <div className="App">
      {!isConnected && (
        <div className="connection-status">
          <div className="spinner"></div>
          <p>Connecting to server...</p>
        </div>
      )}

      {isConnected && gameState === 'join' && (
        <JoinScreen onJoin={handleJoin} />
      )}

      {isConnected && gameState === 'lobby' && (
        <LobbyScreen
          players={players}
          playerInfo={playerInfo}
          onReady={handleReady}
          onRandomSeats={handleRandomSeats}
          onStartGame={handleStartGame}
        />
      )}

      {isConnected && gameState === 'playing' && (
        <>
          <GameScreen
            hand={hand}
            players={players}
            playerInfo={playerInfo}
            currentPlayer={currentPlayer}
            discardPiles={discardPiles}
            melds={melds}
            tilesRemaining={tilesRemaining}
            onDiscard={handleDiscard}
            onHu={handleHu}
            onDraw={handleDraw}
            dealerIndex={dealerIndex}
            playerWinds={playerWinds}
            revealedBonusTiles={revealedBonusTiles}
            hasDrawn={hasDrawn}
            playerHandSizes={playerHandSizes}
          />

          {claimOptions && (
            <ClaimDialog
              tile={claimOptions.tile}
              canPong={claimOptions.canPong}
              canGang={claimOptions.canGang}
              onPong={() => handlePong(claimOptions.tile)}
              onGang={() => handleGang(claimOptions.tile)}
              onSkip={handleSkipClaim}
              timeout={claimOptions.timeout}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;

