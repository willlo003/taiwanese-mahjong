import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { createServer } from 'http';
import { GameManager } from './game/GameManager.js';
import os from 'os';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Initialize game manager
const gameManager = new GameManager();

// Get local IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('New client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      gameManager.handleMessage(ws, data);
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    gameManager.handleDisconnect(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', players: gameManager.getPlayerCount() });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIPAddress();
  console.log('\n🀄 Taiwanese Mahjong Server Started 🀄');
  console.log('=====================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`\nLocal access: http://localhost:${PORT}`);
  console.log(`Network access: http://${localIP}:${PORT}`);
  console.log('\n📱 Share the network URL with other players!');
  console.log('=====================================\n');
});

