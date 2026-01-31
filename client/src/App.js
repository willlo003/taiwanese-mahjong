import React, { useState } from 'react';
import './App.css';
import JoinScreen from './components/JoinScreen';
import LobbyScreen from './components/LobbyScreen';
import GameScreen from './components/GameScreen';
// ClaimDialog removed - claim actions are now handled via action buttons directly
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
  const [drawnTile, setDrawnTile] = useState(null); // Track the newly drawn tile
  const [playerHandSizes, setPlayerHandSizes] = useState({}); // Track hand sizes for all players
  const [currentRound, setCurrentRound] = useState('east'); // 圈: east/south/west/north
  const [currentWind, setCurrentWind] = useState('east');   // 風: east/south/west/north
  const [gamePhase, setGamePhase] = useState('waiting');    // waiting, flower_replacement, draw_discard
  const [flowerReplacementPlayer, setFlowerReplacementPlayer] = useState(null); // Who is currently doing 補花
  const [claimPeriodActive, setClaimPeriodActive] = useState(false); // Whether claim period is active
  const [lastDiscardedTile, setLastDiscardedTile] = useState(null); // The last discarded tile
  const [lastDiscardedBy, setLastDiscardedBy] = useState(null); // Who discarded the last tile
  const [pendingClaim, setPendingClaim] = useState(null); // The claim the player has registered

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
        if (data.payload.currentRound) {
          setCurrentRound(data.payload.currentRound);
        }
        if (data.payload.currentWind) {
          setCurrentWind(data.payload.currentWind);
        }
        soundManager.gameStart();
        break;

      case 'hand_update':
        console.log('[CLIENT] Received hand_update, new hand size:', data.payload.hand.length);
        setHand(data.payload.hand);
        setTilesRemaining(data.payload.tilesRemaining);
        setDrawnTile(null); // Clear drawn tile on hand update
        if (data.payload.revealedBonusTiles && playerInfo?.playerId) {
          setRevealedBonusTiles(prev => ({
            ...prev,
            [playerInfo.playerId]: data.payload.revealedBonusTiles
          }));
        }
        // Update own discard pile if included
        if (data.payload.discardPile && playerInfo?.playerId) {
          setDiscardPiles(prev => ({
            ...prev,
            [playerInfo.playerId]: data.payload.discardPile
          }));
        }
        break;

      case 'tile_drawn':
        setHand(data.payload.hand);
        setTilesRemaining(data.payload.tilesRemaining);
        setHasDrawn(true);
        setDrawnTile(data.payload.tile); // Track the drawn tile
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

      case 'draw_flower_replaced':
        // Player drew flower/season tiles during gameplay - they were auto-replaced
        console.log('[CLIENT] draw_flower_replaced received:', data.payload);
        setHand(data.payload.hand);
        setTilesRemaining(data.payload.tilesRemaining);
        setHasDrawn(true);
        setDrawnTile(data.payload.finalTile || data.payload.tile); // Track the final drawn tile after replacement
        if (data.payload.revealedBonusTiles && playerInfo?.playerId) {
          setRevealedBonusTiles(prev => ({
            ...prev,
            [playerInfo.playerId]: data.payload.revealedBonusTiles
          }));
        }
        soundManager.tileDraw();
        break;

      case 'player_draw_flower_replaced':
        // Another player drew flower/season tiles during gameplay
        console.log('[CLIENT] player_draw_flower_replaced received:', data.payload);
        setTilesRemaining(data.payload.tilesRemaining);
        if (data.payload.handSize !== undefined) {
          setPlayerHandSizes(prev => ({
            ...prev,
            [data.payload.playerId]: data.payload.handSize
          }));
        }
        if (data.payload.revealedBonusTiles) {
          setRevealedBonusTiles(prev => ({
            ...prev,
            [data.payload.playerId]: data.payload.revealedBonusTiles
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
        console.log('[CLIENT] bonus_tiles_replaced received:', data.payload);
        console.log('[CLIENT] revealedBonusTiles in payload:', data.payload.revealedBonusTiles);
        setHand(data.payload.hand);
        setTilesRemaining(data.payload.tilesRemaining);
        if (data.payload.revealedBonusTiles && playerInfo?.playerId) {
          console.log('[CLIENT] Setting revealedBonusTiles for player:', playerInfo.playerId);
          setRevealedBonusTiles(prev => {
            const newState = {
              ...prev,
              [playerInfo.playerId]: data.payload.revealedBonusTiles
            };
            console.log('[CLIENT] New revealedBonusTiles state:', newState);
            return newState;
          });
        }
        break;

      case 'player_revealed_bonus':
        console.log('[CLIENT] player_revealed_bonus received:', data.payload);
        setTilesRemaining(data.payload.tilesRemaining);
        if (data.payload.bonusTiles) {
          console.log('[CLIENT] Setting revealedBonusTiles for other player:', data.payload.playerId);
          setRevealedBonusTiles(prev => {
            const newState = {
              ...prev,
              [data.payload.playerId]: [
                ...(prev[data.payload.playerId] || []),
                ...data.payload.bonusTiles
              ]
            };
            console.log('[CLIENT] New revealedBonusTiles state:', newState);
            return newState;
          });
        }
        break;

      case 'turn_changed':
        setCurrentPlayer(data.payload.currentPlayer);
        setHasDrawn(false); // Reset draw state when turn changes
        setDrawnTile(null); // Clear drawn tile when turn changes
        if (data.payload.currentPlayer === playerInfo?.playerId) {
          soundManager.yourTurn();
        }
        break;

      case 'phase_changed':
        setGamePhase(data.payload.phase);
        if (data.payload.phase === 'draw_discard') {
          setFlowerReplacementPlayer(null); // Clear flower replacement player
        }
        break;

      case 'flower_replacement_turn':
        setFlowerReplacementPlayer(data.payload.playerId);
        break;

      case 'claim_period_start':
        setClaimPeriodActive(true);
        setLastDiscardedTile(data.payload.tile);
        setLastDiscardedBy(data.payload.discardedBy);
        setPendingClaim(null);
        break;

      case 'claim_period_end':
        setClaimPeriodActive(false);
        setClaimOptions(null);
        setPendingClaim(null);
        if (!data.payload.claimedBy) {
          // No one claimed, tile stays in discard
          setLastDiscardedTile(null);
          setLastDiscardedBy(null);
        }
        break;

      case 'claim_registered':
        setPendingClaim(data.payload.claimType);
        break;

      case 'claim_options':
        setClaimOptions(data.payload);
        soundManager.yourTurn();
        break;

      case 'pong_claimed':
      case 'gang_claimed':
      case 'chow_claimed':
        // Update melds
        setMelds(prev => ({
          ...prev,
          [data.payload.playerId]: [...(prev[data.payload.playerId] || []), data.payload.meld]
        }));
        // Update discard pile if provided
        if (data.payload.discardPile && data.payload.discardedBy) {
          setDiscardPiles(prev => ({
            ...prev,
            [data.payload.discardedBy]: data.payload.discardPile
          }));
        }
        // Clear claim state
        setClaimPeriodActive(false);
        setClaimOptions(null);
        setPendingClaim(null);
        setLastDiscardedTile(null);
        setLastDiscardedBy(null);

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

  const handleDiscard = (tile) => {
    sendMessage({ type: 'action', payload: { type: 'discard', tile } });
    setDrawnTile(null); // Clear drawn tile after discarding
    soundManager.tileClick();
  };

  const handleHu = () => {
    sendMessage({ type: 'action', payload: { type: 'hu' } });
  };

  // Handle claim with selected claim data
  const handleClaim = (claimData) => {
    sendMessage({ type: 'action', payload: { type: claimData.type, tiles: claimData } });
  };

  const handlePong = (claimData) => {
    if (claimData) {
      handleClaim(claimData);
    } else {
      sendMessage({ type: 'action', payload: { type: 'pong' } });
    }
  };

  const handleGang = (claimData) => {
    if (claimData) {
      handleClaim(claimData);
    } else {
      sendMessage({ type: 'action', payload: { type: 'gang' } });
    }
  };

  const handleChow = (claimData) => {
    if (claimData) {
      handleClaim({ ...claimData, type: 'chow' });
    } else {
      sendMessage({ type: 'action', payload: { type: 'chow' } });
    }
  };

  const handleShang = (claimData) => {
    if (claimData) {
      handleClaim({ ...claimData, type: 'shang' });
    } else {
      sendMessage({ type: 'action', payload: { type: 'shang' } });
    }
  };

  const handleSkipClaim = () => {
    setClaimOptions(null);
  };

  const handlePass = () => {
    sendMessage({ type: 'action', payload: { type: 'pass' } });
    setClaimOptions(null);
  };

  const handleCancelClaim = () => {
    sendMessage({ type: 'action', payload: { type: 'cancel_claim' } });
    setPendingClaim(null);
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
            onPong={handlePong}
            onGang={handleGang}
            onChow={handleChow}
            onShang={handleShang}
            dealerIndex={dealerIndex}
            playerWinds={playerWinds}
            revealedBonusTiles={revealedBonusTiles}
            hasDrawn={hasDrawn}
            drawnTile={drawnTile}
            playerHandSizes={playerHandSizes}
            currentRound={currentRound}
            currentWind={currentWind}
            gamePhase={gamePhase}
            flowerReplacementPlayer={flowerReplacementPlayer}
            claimOptions={claimOptions}
            claimPeriodActive={claimPeriodActive}
            pendingClaim={pendingClaim}
            lastDiscardedTile={lastDiscardedTile}
            onClaimClose={handleSkipClaim}
            onPass={handlePass}
            onCancelClaim={handleCancelClaim}
          />


        </>
      )}
    </div>
  );
}

export default App;

