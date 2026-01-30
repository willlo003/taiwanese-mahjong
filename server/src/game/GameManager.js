import { v4 as uuidv4 } from 'uuid';
import { MahjongGame } from './MahjongGame.js';

export class GameManager {
  constructor() {
    this.players = new Map(); // ws -> player data
    this.game = null;
    this.maxPlayers = 4;
  }

  handleMessage(ws, data) {
    const { type, payload } = data;

    switch (type) {
      case 'join':
        this.handleJoin(ws, payload);
        break;
      case 'ready':
        this.handleReady(ws);
        break;
      case 'random_seats':
        this.handleRandomSeats(ws);
        break;
      case 'start_game':
        this.handleStartGame(ws);
        break;
      case 'action':
        this.handleAction(ws, payload);
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
    const { name } = payload;

    // Validate name
    if (!name || name.trim().length === 0) {
      ws.send(JSON.stringify({ type: 'error', message: 'Name is required' }));
      return;
    }

    // Check if game is full
    if (this.players.size >= this.maxPlayers) {
      ws.send(JSON.stringify({ type: 'error', message: 'Game is full' }));
      return;
    }

    // Check if name is already taken
    const nameTaken = Array.from(this.players.values()).some(p => p.name === name.trim());
    if (nameTaken) {
      ws.send(JSON.stringify({ type: 'error', message: 'Name is already taken' }));
      return;
    }

    // Find available position
    const position = this.getAvailablePosition();
    if (position === -1) {
      ws.send(JSON.stringify({ type: 'error', message: 'No seats available' }));
      return;
    }

    // Add player
    const playerId = uuidv4();
    const player = {
      id: playerId,
      name: name.trim(),
      ws,
      ready: false,
      position: position // Use first available position
    };

    this.players.set(ws, player);

    // Send success to the joining player
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

    console.log(`Player joined: ${name} at position ${position} (${this.players.size}/${this.maxPlayers})`);
  }

  handleReady(ws) {
    const player = this.players.get(ws);
    if (!player) return;

    player.ready = true;
    this.broadcastPlayerList();
    // Don't auto-start - wait for 東 player to click START
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

    // Assign new positions (keep ready status unchanged)
    playerList.forEach((p, index) => {
      p.position = positions[index];
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

    // Check if all players are ready
    if (this.players.size !== this.maxPlayers) {
      ws.send(JSON.stringify({ type: 'error', message: 'Need 4 players to start' }));
      return;
    }

    if (!this.allPlayersReady()) {
      ws.send(JSON.stringify({ type: 'error', message: 'All players must be ready' }));
      return;
    }

    this.startGame();
  }

  handleAction(ws, payload) {
    const player = this.players.get(ws);
    if (!player || !this.game) return;

    this.game.handlePlayerAction(player.id, payload);
  }

  handleDisconnect(ws) {
    const player = this.players.get(ws);
    if (player) {
      console.log(`Player disconnected: ${player.name}`);
      this.players.delete(ws);
      
      // Reset game if a player disconnects
      if (this.game) {
        this.game = null;
        this.broadcast({ type: 'game_ended', payload: { reason: 'Player disconnected' } });
      }

      this.broadcastPlayerList();
    }
  }

  allPlayersReady() {
    return Array.from(this.players.values()).every(p => p.ready);
  }

  startGame() {
    console.log('Starting game with 4 players...');
    
    const playerList = Array.from(this.players.values());
    this.game = new MahjongGame(playerList, this.broadcast.bind(this));
    this.game.start();
  }

  broadcastPlayerList() {
    const playerList = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      position: p.position,
      ready: p.ready
    }));

    this.broadcast({
      type: 'player_list',
      payload: { players: playerList }
    });
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    this.players.forEach((player) => {
      if (player.ws.readyState === 1) { // WebSocket.OPEN
        player.ws.send(messageStr);
      }
    });
  }

  getPlayerCount() {
    return this.players.size;
  }
}

