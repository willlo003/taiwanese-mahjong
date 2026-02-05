import React, { useState } from 'react';
import './App.css';
import JoinScreen from './components/JoinScreen';
import LobbyScreen from './components/LobbyScreen';
import GameScreen from './components/GameScreen';
import GameResultScreen from './components/GameResultScreen';
import { ToastContainer, showToast } from './components/Toast';
// ClaimDialog removed - claim actions are now handled via action buttons directly
import { useWebSocket } from './hooks/useWebSocket';
import { soundManager } from './utils/sounds';

function App() {
  const [gameState, setGameState] = useState('join'); // join, lobby, playing, result
  const [playerInfo, setPlayerInfo] = useState(null);
  const [players, setPlayers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [hand, setHand] = useState([]);
  const [discardPiles, setDiscardPiles] = useState({});
  const [tilesRemaining, setTilesRemaining] = useState(144);
  const [melds, setMelds] = useState({});
  const [claimOptions, setClaimOptions] = useState(null);
  const [dealerIndex, setDealerIndex] = useState(0);
  const [dealerId, setDealerId] = useState(null); // Track dealer by player ID, not index
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
  const [, setLastDiscardedBy] = useState(null); // Who discarded the last tile (setter only, value used for future features)
  const [pendingClaim, setPendingClaim] = useState(null); // The claim the player has registered
  const [canSelfDrawWin, setCanSelfDrawWin] = useState(false); // Whether player can win with self-draw
  const [selfDrawWinCombinations, setSelfDrawWinCombinations] = useState([]); // Possible winning combinations for self-draw
  const [canSelfGang, setCanSelfGang] = useState(false); // Whether player can perform self-gang
  const [selfGangCombinations, setSelfGangCombinations] = useState([]); // Possible gang combinations
  const [gameResult, setGameResult] = useState(null); // Game result data
  const [showResultPopup, setShowResultPopup] = useState(false); // Whether to show result popup overlay
  const [revealedHands, setRevealedHands] = useState({}); // All player hands revealed at game end
  const [readyPlayers, setReadyPlayers] = useState([]); // Players who are ready for next game
  const [winningTile, setWinningTile] = useState(null); // The tile that completed the win (for 出沖)
  const [winningCombination, setWinningCombination] = useState(null); // The winning combination (sets and pair)
  const [isTing, setIsTing] = useState(false); // Whether current player is in 聽 status
  const [tingPlayers, setTingPlayers] = useState({}); // Track which players are in 聽 status { playerId: tingTileIndex }
  const [mustDiscardDrawnTile, setMustDiscardDrawnTile] = useState(false); // 聽 players must discard drawn tile

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
        console.log('[CLIENT] game_started - dealer:', data.payload.dealer, 'dealerIndex:', data.payload.dealerIndex);
        setGameState('playing');
        setCurrentPlayer(data.payload.currentPlayer);
        if (data.payload.dealerIndex !== undefined) {
          setDealerIndex(data.payload.dealerIndex);
        }
        if (data.payload.dealer) {
          setDealerId(data.payload.dealer); // Store dealer by player ID
          console.log('[CLIENT] Set dealerId to:', data.payload.dealer);
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
        // Clear discard piles, melds, and bonus tiles for new game
        if (data.payload.discardPiles !== undefined) {
          setDiscardPiles(data.payload.discardPiles);
        }
        if (data.payload.melds !== undefined) {
          setMelds(data.payload.melds);
        }
        if (data.payload.revealedBonusTiles !== undefined) {
          setRevealedBonusTiles(data.payload.revealedBonusTiles);
        }
        // Reset 聽 status for new game
        setIsTing(false);
        setTingPlayers({});
        setMustDiscardDrawnTile(false);
        soundManager.gameStart();
        break;

      case 'game_state_sync':
        // Reconnection: sync all game state
        console.log('[CLIENT] game_state_sync - reconnecting to game in progress');
        setGameState('playing');
        setGamePhase(data.payload.gamePhase);
        setHand(data.payload.hand);
        setDiscardPiles(data.payload.allDiscardPiles);
        setMelds(data.payload.allMelds);
        setRevealedBonusTiles(data.payload.allRevealedBonusTiles);
        setCurrentPlayer(data.payload.currentPlayer);
        setDealerIndex(data.payload.dealerIndex);
        setDealerId(data.payload.dealer);
        setPlayerWinds(data.payload.playerWinds);
        setCurrentRound(data.payload.currentRound);
        setCurrentWind(data.payload.currentWind);
        setTilesRemaining(data.payload.tilesRemaining);
        setLastDiscardedTile(data.payload.lastDiscardedTile);
        setLastDiscardedBy(data.payload.lastDiscardedBy);
        setClaimPeriodActive(data.payload.claimWindowOpen);
        console.log('[CLIENT] ✅ Game state synced after reconnection');
        break;

      case 'hand_update':
        console.log('[CLIENT] Received hand_update, new hand size:', data.payload.hand.length);
        setHand(data.payload.hand);
        setTilesRemaining(data.payload.tilesRemaining);
        setDrawnTile(null); // Clear drawn tile on hand update
        // Update gang and win options if provided
        if (data.payload.canSelfGang !== undefined) {
          setCanSelfGang(data.payload.canSelfGang);
          setSelfGangCombinations(data.payload.selfGangCombinations || []);
        }
        if (data.payload.canSelfDrawWin !== undefined) {
          setCanSelfDrawWin(data.payload.canSelfDrawWin);
          setSelfDrawWinCombinations(data.payload.selfDrawWinCombinations || []);
        }
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
        // Handle 聽 status from hand_update (when player declares 聽)
        if (data.payload.isTing) {
          setIsTing(true);
        }
        break;

      case 'tile_drawn':
        console.log('[CLIENT] tile_drawn received:', data.payload);
        console.log('[CLIENT] canSelfGang:', data.payload.canSelfGang, 'selfGangCombinations:', data.payload.selfGangCombinations);
        console.log('[CLIENT] isTing:', data.payload.isTing, 'mustDiscardDrawnTile:', data.payload.mustDiscardDrawnTile);
        setHand(data.payload.hand);
        setTilesRemaining(data.payload.tilesRemaining);
        setHasDrawn(true);
        setDrawnTile(data.payload.tile); // Track the drawn tile
        setCanSelfDrawWin(data.payload.canSelfDrawWin || false); // Check if player can win with self-draw
        setSelfDrawWinCombinations(data.payload.selfDrawWinCombinations || []); // Store win combinations
        setCanSelfGang(data.payload.canSelfGang || false); // Check if player can perform self-gang
        setSelfGangCombinations(data.payload.selfGangCombinations || []); // Store gang combinations
        // Handle 聽 status
        if (data.payload.isTing) {
          setIsTing(true);
          setMustDiscardDrawnTile(true);
        }
        soundManager.tileDraw();
        break;

      case 'dealer_first_turn':
        // Dealer's first turn - they already have 17 tiles, check for 天胡 (Heavenly Hand)
        console.log('[CLIENT] dealer_first_turn received:', data.payload);
        console.log('[CLIENT] canSelfGang:', data.payload.canSelfGang, 'selfGangCombinations:', data.payload.selfGangCombinations);
        setHand(data.payload.hand);
        setTilesRemaining(data.payload.tilesRemaining);
        setHasDrawn(true); // Dealer can discard immediately
        // For 天胡, treat the last tile as the "drawn tile"
        if (data.payload.hand && data.payload.hand.length > 0) {
          setDrawnTile(data.payload.hand[data.payload.hand.length - 1]);
        }
        setCanSelfDrawWin(data.payload.canSelfDrawWin || false);
        setSelfDrawWinCombinations(data.payload.selfDrawWinCombinations || []);
        setCanSelfGang(data.payload.canSelfGang || false);
        setSelfGangCombinations(data.payload.selfGangCombinations || []);
        console.log('[CLIENT] After setting - canSelfGang should be:', data.payload.canSelfGang);
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
        console.log('[CLIENT] canSelfGang:', data.payload.canSelfGang, 'selfGangCombinations:', data.payload.selfGangCombinations);
        setHand(data.payload.hand);
        setTilesRemaining(data.payload.tilesRemaining);
        setHasDrawn(true);
        setDrawnTile(data.payload.finalTile || data.payload.tile); // Track the final drawn tile after replacement
        setCanSelfDrawWin(data.payload.canSelfDrawWin || false); // Check if player can win with self-draw
        setSelfDrawWinCombinations(data.payload.selfDrawWinCombinations || []); // Store win combinations
        setCanSelfGang(data.payload.canSelfGang || false); // Check if player can perform self-gang
        setSelfGangCombinations(data.payload.selfGangCombinations || []); // Store gang combinations
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

      case 'player_ting':
        // Another player declared 聽
        console.log('[CLIENT] player_ting received:', data.payload);
        console.log('[CLIENT] player_ting - current hand.length:', hand.length, 'currentPlayer:', currentPlayer, 'playerInfo.playerId:', playerInfo?.playerId);
        // Update discard pile with the rotated tile
        setDiscardPiles(prev => ({
          ...prev,
          [data.payload.playerId]: data.payload.discardPile
        }));
        // Track which players are in 聽 status
        setTingPlayers(prev => ({
          ...prev,
          [data.payload.playerId]: data.payload.tingTileIndex
        }));
        // Update hand size for the player who declared 聽
        if (data.payload.handSize !== undefined) {
          setPlayerHandSizes(prev => ({
            ...prev,
            [data.payload.playerId]: data.payload.handSize
          }));
        }
        // If this is the current player, set their 聽 status
        if (data.payload.playerId === playerInfo?.playerId) {
          setIsTing(true);
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
        // Only clear states if it's NOT our turn (turn is changing away from us)
        if (data.payload.currentPlayer !== playerInfo?.playerId) {
          setHasDrawn(false); // Reset draw state when turn changes
          setDrawnTile(null); // Clear drawn tile when turn changes
          setCanSelfGang(false); // Clear gang state when turn changes
          setSelfGangCombinations([]); // Clear gang combinations
        } else {
          // It's our turn now
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

      case 'self_gang_claimed':
        // Update melds for self-gang (暗槓 or 碰上槓)
        console.log('[CLIENT] self_gang_claimed received:', data.payload);
        setMelds(prev => ({
          ...prev,
          [data.payload.playerId]: data.payload.melds
        }));
        // If this is our own gang, update our hand (tiles removed)
        if (data.payload.hand && data.payload.playerId === playerInfo?.playerId) {
          setHand(data.payload.hand);
        }
        soundManager.gang();
        break;

      case 'game_ended': {
        console.log('[CLIENT] Game ended:', data.payload);

        // Play win sound if there's a winner
        if (data.payload.winner || data.payload.winners) {
          soundManager.win();
        }

        // Store game result and show result popup (keep game screen visible)
        setGameResult(data.payload);
        setShowResultPopup(true);
        setReadyPlayers([]); // Reset ready players

        // Store revealed hands for all players
        if (data.payload.allPlayerHands) {
          setRevealedHands(data.payload.allPlayerHands);
        }

        // Store winning tile for highlighting (出沖)
        if (data.payload.winningTile) {
          setWinningTile(data.payload.winningTile);
        } else {
          setWinningTile(null);
        }

        // Store winning combination for grouping display
        if (data.payload.winningCombination) {
          setWinningCombination(data.payload.winningCombination);
        } else {
          setWinningCombination(null);
        }

        // Update melds with revealed melds from playerResults (暗槓 now face up)
        if (data.payload.playerResults) {
          const revealedMelds = {};
          data.payload.playerResults.forEach(result => {
            revealedMelds[result.playerId] = result.melds;
          });
          setMelds(revealedMelds);
        }

        // Clear claim-related states
        setClaimPeriodActive(false);
        setLastDiscardedTile(null);
        setLastDiscardedBy(null);
        setPendingClaim(null);
        setClaimOptions(null);
        setCanSelfDrawWin(false);

        break;
      }

      case 'player_ready': {
        // A player is ready for next game
        setReadyPlayers(prev => {
          if (!prev.includes(data.payload.playerId)) {
            return [...prev, data.payload.playerId];
          }
          return prev;
        });
        break;
      }

      case 'next_game_starting': {
        // All players ready, starting next game
        setShowResultPopup(false);
        setGameResult(null);
        setRevealedHands({});
        setReadyPlayers([]);
        break;
      }

      case 'error':
        showToast(data.message, 'error');
        soundManager.error();
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  }

  const handleJoin = (name) => {
    sendMessage({ type: 'join', payload: { name } });
  };

  const handleRandomSeats = () => {
    sendMessage({ type: 'random_seats', payload: {} });
  };

  const handleSelectSeat = (position) => {
    sendMessage({ type: 'select_seat', payload: { position } });
  };

  const handleStartGame = () => {
    sendMessage({ type: 'start_game', payload: {} });
  };

  const handleDiscard = (tile) => {
    sendMessage({ type: 'action', payload: { type: 'discard', tile } });
    setDrawnTile(null); // Clear drawn tile after discarding
    setCanSelfDrawWin(false); // Clear self-draw win state when player chooses to discard
    setSelfDrawWinCombinations([]); // Clear win combinations
    setCanSelfGang(false); // Clear self-gang state when player chooses to discard
    setSelfGangCombinations([]); // Clear gang combinations
    soundManager.tileClick();
  };

  const handleHu = (combinationOrClaim = null) => {
    // combinationOrClaim can be:
    // 1. A combination object from SelfDrawWinPopup (for 自摸)
    // 2. A claim object from ClaimPopup (for 出沖) with { type: 'hu', tiles, combination }
    const combination = combinationOrClaim?.type === 'hu' ? combinationOrClaim.combination : combinationOrClaim;
    sendMessage({ type: 'action', payload: { type: 'hu', combination } });
  };

  const handleSelfGang = (combinations) => {
    console.log('[CLIENT] Sending self-gang action with combinations:', combinations);
    sendMessage({ type: 'action', payload: { type: 'self_gang', combinations } });
  };

  // Handle 聽 (ting) declaration - player declares ready hand and discards a tile
  const handleTing = (tile) => {
    console.log('[CLIENT] Sending ting action with tile:', tile);
    sendMessage({ type: 'action', payload: { type: 'ting', tile } });
    setDrawnTile(null); // Clear drawn tile after declaring 聽
    setCanSelfDrawWin(false);
    setSelfDrawWinCombinations([]);
    setCanSelfGang(false);
    setSelfGangCombinations([]);
    soundManager.tileClick();
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

  const handleLeaveGame = () => {
    sendMessage({ type: 'leave_game', payload: {} });
  };

  const handleResultReady = () => {
    // Send ready message to server
    sendMessage({ type: 'action', payload: { type: 'result_ready' } });
  };

  const handleResultLeave = () => {
    // Send leave message to server
    sendMessage({ type: 'leave_game', payload: {} });

    // Reset game state and go back to lobby
    setHand([]);
    setDrawnTile(null);
    setDiscardPiles({});
    setMelds({});
    setRevealedBonusTiles({});
    setCurrentPlayer(null);
    setDealerIndex(0);
    setDealerId(null);
    setTilesRemaining(144);
    setPlayerHandSizes({});
    setCurrentRound('east');
    setCurrentWind('east');
    setGamePhase('waiting');
    setFlowerReplacementPlayer(null);
    setPlayerWinds({});
    setHasDrawn(false);
    setGameResult(null);
    setShowResultPopup(false);
    setRevealedHands({});
    setReadyPlayers([]);
    setGameState('lobby');
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
          onRandomSeats={handleRandomSeats}
          onSelectSeat={handleSelectSeat}
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
            dealerId={dealerId}
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
            canSelfDrawWin={canSelfDrawWin}
            selfDrawWinCombinations={selfDrawWinCombinations}
            canSelfGang={canSelfGang}
            selfGangCombinations={selfGangCombinations}
            onSelfGang={handleSelfGang}
            onTing={handleTing}
            isTing={isTing}
            tingPlayers={tingPlayers}
            mustDiscardDrawnTile={mustDiscardDrawnTile}
            onClaimClose={handleSkipClaim}
            onPass={handlePass}
            onCancelClaim={handleCancelClaim}
            onLeaveGame={handleLeaveGame}
            revealedHands={revealedHands}
            showResultPopup={showResultPopup}
            gameResult={gameResult}
            readyPlayers={readyPlayers}
            onResultReady={handleResultReady}
            onResultLeave={handleResultLeave}
            winningTile={winningTile}
            winningCombination={winningCombination}
          />
        </>
      )}

      {isConnected && gameState === 'result' && (
        <GameResultScreen
          gameResult={gameResult}
          playerInfo={playerInfo}
          onReady={handleResultReady}
          onLeave={handleResultLeave}
        />
      )}

      <ToastContainer />
    </div>
  );
}

export default App;

