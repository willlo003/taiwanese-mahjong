# 🀄 Taiwanese Mahjong - Local Multiplayer Game

A real-time, local multiplayer Taiwanese Mahjong game that works offline using WiFi hotspot. Play with 4 players on mobile devices connected to your MacBook's local server.

## Features

- 🎮 **Local Multiplayer** - No internet required, works on flight mode
- 📱 **Mobile-Friendly** - Optimized for phone browsers
- 🔌 **Real-time** - WebSocket-based instant updates
- 🀄 **Taiwanese Mahjong** - Authentic 144-tile set with proper rules
- 👥 **4 Players** - Traditional mahjong gameplay

## Architecture

- **Server**: Node.js + Express + WebSocket (runs on MacBook)
- **Client**: React web app (accessed from phones via WiFi)
- **Communication**: WebSocket for real-time bidirectional messaging

## Quick Start

### Prerequisites

- Node.js 18+ installed on your MacBook
- WiFi hotspot enabled on your MacBook
- 3 phones with web browsers

### Installation

```bash
# Install all dependencies
npm run install:all
```

### Running the Game

1. **Start the server on your MacBook:**
```bash
npm run dev
```

This will start:
- Server on port 3001
- Client development server on port 3000

2. **Connect from phones:**
   - Make sure all phones are connected to your MacBook's WiFi hotspot
   - The server will display the network URL (e.g., `http://192.168.x.x:3000`)
   - Open this URL in each phone's browser
   - Each player enters their name to join

3. **Start playing:**
   - Once 4 players join and click "Ready", the game starts automatically
   - Follow traditional Taiwanese Mahjong rules

## Project Structure

```
taiwanese-mahjong/
├── server/                 # Node.js server
│   ├── src/
│   │   ├── index.js       # Server entry point
│   │   └── game/
│   │       ├── GameManager.js    # Player & game session management
│   │       ├── MahjongGame.js    # Game logic
│   │       └── TileManager.js    # Tile generation & distribution
│   └── package.json
├── client/                 # React client
│   ├── src/
│   │   ├── App.js         # Main app component
│   │   ├── hooks/
│   │   │   └── useWebSocket.js   # WebSocket connection hook
│   │   └── components/
│   │       ├── JoinScreen.js     # Name entry screen
│   │       ├── LobbyScreen.js    # Waiting room
│   │       ├── GameScreen.js     # Main game interface
│   │       └── Tile.js           # Mahjong tile component
│   └── package.json
└── package.json           # Root package.json
```

## Game Flow

1. **Join** - Players enter their name
2. **Lobby** - Wait for 4 players, everyone clicks "Ready"
3. **Game Start** - Tiles are shuffled and dealt (16 tiles per player)
4. **Gameplay** - Players take turns drawing and discarding tiles
5. **Win** - First player to complete a winning hand calls "Hu!"

## Taiwanese Mahjong Tiles

- **Suits** (108 tiles):
  - Bamboo (條) 1-9, 4 of each
  - Characters (萬) 1-9, 4 of each
  - Dots (筒) 1-9, 4 of each

- **Honors** (28 tiles):
  - Winds (風): East, South, West, North, 4 of each
  - Dragons (箭): Red, Green, White, 4 of each

- **Bonus** (8 tiles):
  - Flowers (花) 1-4
  - Seasons (季) 1-4

**Total: 144 tiles**

## Development

### Server Only
```bash
npm run server
```

### Client Only
```bash
npm run client
```

### Build for Production
```bash
npm run build
```

## Network Setup

### MacBook WiFi Hotspot Setup:
1. Go to System Preferences → Sharing
2. Enable "Internet Sharing" or create a WiFi hotspot
3. Note your local IP address (shown in server console)

### Firewall:
Make sure port 3001 is not blocked by your firewall.

## Future Enhancements

- [ ] Complete win condition validation
- [ ] Pong (碰), Gang (槓), Chow (吃) actions
- [ ] Scoring system
- [ ] Game history
- [ ] Sound effects
- [ ] Animations
- [ ] Multiple game rooms

## License

MIT

## Contributing

Pull requests are welcome! For major changes, please open an issue first.

