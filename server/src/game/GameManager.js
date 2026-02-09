import { v4 as uuidv4 } from 'uuid';
import { StatusManager } from './StatusManager.js';

export class GameManager {
  constructor() {
    this.players = new Map(); // ws -> player data
    this.game = null;
    this.maxPlayers = 4;
    this.considerTimeout = 5; // Default 5 seconds for turn timer (configurable 3-8)
    this.debugMode = false; // Debug mode for specific tile dealing
  }

  handleMessage(ws, data) {
    const { type, payload } = data;

    switch (type) {
      case 'join':
        this.handleJoin(ws, payload);
        break;
      case 'random_seats':
        this.handleRandomSeats(ws);
        break;
      case 'start_game':
        this.handleStartGame(ws);
        break;
      case 'leave_game':
        this.handleLeaveGame(ws);
        break;
      case 'select_seat':
        this.handleSelectSeat(ws, payload);
        break;
      case 'action':
        this.handleAction(ws, payload);
        break;
      case 'set_consider_time':
        this.handleSetConsiderTime(ws, payload);
        break;
      case 'set_debug_mode':
        this.handleSetDebugMode(ws, payload);
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  }

  // Find the first available position (0-3)
  getAvailablePosition() {
    const takenPositions = new Set(Array.from(this.players.values()).map(p => p.position));
    for (let i = 0; i < 4; i++) {
      if (!takenPositions.has(i)) {
        return i;
      }
    }
    return -1; // No position available
  }

  handleJoin(ws, payload) {
    const { name, isDebugMode } = payload;

    // Validate name
    if (!name || name.trim().length === 0) {
      ws.send(JSON.stringify({ type: 'error', message: 'Name is required' }));
      return;
    }

    const trimmedName = name.trim();

    // Check if name is already taken
    const nameTaken = Array.from(this.players.values()).some(p => p.name === trimmedName);
    if (nameTaken) {
      ws.send(JSON.stringify({ type: 'error', message: 'Name is already taken' }));
      return;
    }

    // Check if game is full
    if (this.players.size >= this.maxPlayers) {
      ws.send(JSON.stringify({ type: 'error', message: 'Game is full' }));
      return;
    }

    // Create new player
    const playerId = uuidv4();
    const player = {
      id: playerId,
      name: trimmedName,
      ws,
      ready: false,
      position: null
    };

    this.players.set(ws, player);

    // Send success to the joining player
    console.log(`[JOIN] Player ${trimmedName} joined with ID: ${playerId}, position: ${player.position}`);
    ws.send(JSON.stringify({
      type: 'joined',
      payload: {
        playerId,
        position: player.position,
        name: player.name
      }
    }));

    // Broadcast updated player list to all players
    this.broadcastPlayerList();

    console.log(`Player joined: ${trimmedName} (${this.players.size}/${this.maxPlayers})`);

    // If debug mode, auto-start the game after a short delay
    if (isDebugMode) {
      console.log('[DEBUG MODE] Auto-starting game in 1 second...');
      setTimeout(() => {
        this.handleStartGame(ws);
      }, 1000);
    }
  }

  handleSelectSeat(ws, payload) {
    const player = this.players.get(ws);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'Player not found. Please refresh the page.' }));
      return;
    }

    // Only allow if game hasn't started
    if (this.game) {
      ws.send(JSON.stringify({ type: 'error', message: 'Game already started' }));
      return;
    }

    // Handle missing payload
    if (!payload) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid request' }));
      return;
    }

    const position = payload.position;

    // If position is null, player is leaving their seat
    if (position === null || position === undefined) {
      player.position = null;
      player.ready = false; // Reset ready status when leaving seat
      this.broadcastPlayerList();
      console.log(`Player ${player.name} left their seat`);
      return;
    }

    // Validate position
    if (position < 0 || position > 3) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid seat position' }));
      return;
    }

    // Check if seat is already taken by another player
    const seatTaken = Array.from(this.players.values()).some(p => p.position === position && p.id !== player.id);
    if (seatTaken) {
      ws.send(JSON.stringify({ type: 'error', message: 'Seat is already taken' }));
      return;
    }

    // Assign the seat - selecting a seat means ready
    player.position = position;
    player.ready = true; // Auto-ready when selecting seat
    this.broadcastPlayerList();
    console.log(`Player ${player.name} selected seat ${position} and is ready`);
  }

  handleRandomSeats(ws) {
    const player = this.players.get(ws);
    if (!player) return;

    // Only allow if game hasn't started
    if (this.game) {
      ws.send(JSON.stringify({ type: 'error', message: 'Game already started' }));
      return;
    }

    // Shuffle player positions randomly
    const playerList = Array.from(this.players.values());
    const positions = [0, 1, 2, 3]; // 東, 南, 西, 北

    // Fisher-Yates shuffle
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    // Assign new positions and set ready (selecting seat = ready)
    playerList.forEach((p, index) => {
      p.position = positions[index];
      p.ready = true;
    });

    this.broadcastPlayerList();
    console.log('Seats shuffled randomly');
  }

  handleStartGame(ws) {
    const player = this.players.get(ws);
    if (!player) return;

    // Only 東 (position 0) can start the game
    if (player.position !== 0) {
      ws.send(JSON.stringify({ type: 'error', message: 'Only 東 player can start the game' }));
      return;
    }

    // Check if all 4 seats are filled and ready
    if (!this.allPlayersReady()) {
      ws.send(JSON.stringify({ type: 'error', message: 'Need 4 seated players to start' }));
      return;
    }

    this.startGame();
  }

  handleAction(ws, payload) {
    const player = this.players.get(ws);
    if (!player || !this.game) return;

    this.game.handlePlayerAction(player.id, payload);
  }

  handleSetConsiderTime(ws, payload) {
    const player = this.players.get(ws);
    if (!player) return;

    // Only allow if game hasn't started
    if (this.game) {
      ws.send(JSON.stringify({ type: 'error', message: 'Cannot change settings during game' }));
      return;
    }

    const time = payload?.time;
    if (typeof time !== 'number' || time < 3 || time > 8) {
      ws.send(JSON.stringify({ type: 'error', message: 'Consider time must be between 3 and 8 seconds' }));
      return;
    }

    this.considerTimeout = time;
    console.log(`[LOBBY] Consider time set to ${time} seconds by ${player.name}`);

    // Broadcast the new setting to all players
    this.broadcast({
      type: 'consider_time_updated',
      payload: { considerTimeout: this.considerTimeout }
    });
  }

  handleSetDebugMode(ws, payload) {
    const player = this.players.get(ws);
    if (!player) return;

    // Only allow if game hasn't started
    if (this.game) {
      ws.send(JSON.stringify({ type: 'error', message: 'Cannot change debug mode during game' }));
      return;
    }

    const { enabled } = payload;
    if (typeof enabled !== 'boolean') {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid debug mode value' }));
      return;
    }

    this.debugMode = enabled;
    console.log(`[LOBBY] Debug mode ${enabled ? 'enabled' : 'disabled'} by ${player.name}`);

    // Broadcast the new setting to all players
    this.broadcastPlayerList();
  }

  handleDisconnect(ws) {
    const player = this.players.get(ws);
    if (player) {
      console.log(`Player disconnected: ${player.name}`);
      this.players.delete(ws);

      // If game is in progress, end it
      if (this.game) {
        // Clear all timers before destroying the game
        this.game.cleanup();
        this.game = null;

        // Reset all players' positions and ready status
        this.players.forEach((p) => {
          p.position = null;
          p.ready = false;
        });

        // Broadcast game ended
        this.broadcast({
          type: 'game_ended',
          payload: {
            reason: `${player.name} disconnected`,
            resetToLobby: true
          }
        });
      }

      this.broadcastPlayerList();
    }
  }

  handleLeaveGame(ws) {
    const player = this.players.get(ws);
    if (player) {
      console.log(`Player left game: ${player.name}`);
      const leavingPlayerName = player.name;

      // Clear all timers before destroying the game
      if (this.game) {
        this.game.cleanup();
      }
      this.game = null;

      // Reset ALL players' seats and ready status (including the leaving player)
      this.players.forEach((p) => {
        p.position = null;
        p.ready = false;
      });

      // Notify all players (including the leaving player) that game ended
      this.broadcast({
        type: 'game_ended',
        payload: {
          reason: `${leavingPlayerName} left the game`,
          resetToLobby: true
        }
      });

      // Broadcast updated player list (with reset seats)
      this.broadcastPlayerList();
    }
  }



  allPlayersReady() {
    const realPlayers = Array.from(this.players.values());

    // Need exactly 4 players, all with seats (position 0-3), all ready
    const seatedPlayers = realPlayers.filter(p => p.position !== null && p.position !== undefined);
    return seatedPlayers.length === 4 && seatedPlayers.every(p => p.ready);
  }

  startGame() {
    console.log('Starting game with 4 players...');

    // Get all players and sort by position (0=東, 1=南, 2=西, 3=北)
    // This ensures dealerIndex=0 corresponds to position 0 (東)
    const realPlayers = Array.from(this.players.values());
    const playerList = realPlayers.sort((a, b) => a.position - b.position);
    console.log('Player order:', playerList.map(p => `${p.name}(pos:${p.position}, id:${p.id})`));

    this.game = new StatusManager(playerList, this.broadcast.bind(this), this.considerTimeout, this.debugMode);
    this.game.start();
  }

  broadcastPlayerList() {
    const realPlayers = Array.from(this.players.values());

    const playerList = realPlayers.map(p => ({
      id: p.id,
      name: p.name,
      position: p.position,
      ready: p.ready
    }));

    // Sort by position (0=東, 1=南, 2=西, 3=北)
    // Players without position (null) go to the end
    playerList.sort((a, b) => {
      if (a.position === null && b.position === null) return 0;
      if (a.position === null) return 1;
      if (b.position === null) return -1;
      return a.position - b.position;
    });

    this.broadcast({
      type: 'player_list',
      payload: {
        players: playerList,
        considerTimeout: this.considerTimeout,
        debugMode: this.debugMode
      }
    });
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    this.players.forEach((player) => {
      if (!player.ws) return;

      if (player.ws.readyState === 1) { // WebSocket.OPEN
        player.ws.send(messageStr);
      }
    });
  }

  getPlayerCount() {
    return this.players.size;
  }
}

