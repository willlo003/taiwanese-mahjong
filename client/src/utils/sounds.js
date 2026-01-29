// Sound effects using Web Audio API
class SoundManager {
  constructor() {
    this.audioContext = null;
    this.enabled = true;
  }

  init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playTone(frequency, duration, type = 'sine') {
    if (!this.enabled) return;
    
    this.init();
    
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
    
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  // Tile click sound
  tileClick() {
    this.playTone(800, 0.05, 'square');
  }

  // Tile discard sound
  tileDiscard() {
    this.playTone(400, 0.1, 'triangle');
  }

  // Tile draw sound
  tileDraw() {
    this.playTone(600, 0.08, 'sine');
  }

  // Pong sound
  pong() {
    this.playTone(500, 0.15, 'square');
    setTimeout(() => this.playTone(700, 0.15, 'square'), 100);
  }

  // Gang sound
  gang() {
    this.playTone(450, 0.12, 'square');
    setTimeout(() => this.playTone(600, 0.12, 'square'), 80);
    setTimeout(() => this.playTone(750, 0.12, 'square'), 160);
  }

  // Chow sound
  chow() {
    this.playTone(550, 0.1, 'sine');
    setTimeout(() => this.playTone(650, 0.1, 'sine'), 70);
    setTimeout(() => this.playTone(750, 0.1, 'sine'), 140);
  }

  // Win sound
  win() {
    const notes = [523, 659, 784, 1047]; // C, E, G, C (major chord)
    notes.forEach((note, i) => {
      setTimeout(() => this.playTone(note, 0.3, 'sine'), i * 100);
    });
  }

  // Turn notification
  yourTurn() {
    this.playTone(880, 0.1, 'sine');
    setTimeout(() => this.playTone(1100, 0.15, 'sine'), 100);
  }

  // Error sound
  error() {
    this.playTone(200, 0.2, 'sawtooth');
  }

  // Player joined
  playerJoined() {
    this.playTone(660, 0.1, 'sine');
  }

  // Game start
  gameStart() {
    this.playTone(440, 0.15, 'sine');
    setTimeout(() => this.playTone(554, 0.15, 'sine'), 100);
    setTimeout(() => this.playTone(659, 0.2, 'sine'), 200);
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

export const soundManager = new SoundManager();

