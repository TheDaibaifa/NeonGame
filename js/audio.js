/**
 * DUEL NEON // Retro Sound Synthesizer (Web Audio API)
 * Synthesizes retro sounds in real-time without needing external audio files.
 */
class RetroAudioSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.muted = false;
    this.volume = 0.5; // Default 50%
    
    // Netplay Sound Syncing fields
    this.queuedSounds = [];
    this.isSyncing = false;
  }

  /**
   * Unlocks the AudioContext. Must be called synchronously from a user
   * gesture handler (click/keydown). Do NOT make this function async —
   * Chrome's activation window is strictly synchronous; any await will
   * break the gesture chain and cause the autoplay policy warning.
   */
  resume() {
    if (!this.ctx) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        console.log('Duel Neon Audio Synth Initialized!');
      } catch (e) {
        console.error('Failed to initialize Web Audio API:', e);
        return;
      }
    }

    // Fire-and-forget — do NOT await here. Awaiting would suspend execution
    // and lose the synchronous user-gesture activation context Chrome requires.
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(e => console.warn('AudioContext resume failed:', e));
    }
  }

  /**
   * Queues a sound effect trigger to be sent to clients if hosting.
   */
  queueSound(name) {
    if (this.isSyncing) return;
    this.queuedSounds.push(name);
  }

  /**
   * Returns and clears the current frame's queued sound triggers.
   */
  flushSounds() {
    const list = [...this.queuedSounds];
    this.queuedSounds = [];
    return list;
  }

  /**
   * Directly triggers a sound effect by its identifier, skipping network queuing.
   */
  playDirect(name) {
    this.isSyncing = true;
    try {
      if (name === 'bounce') this.playBounce();
      else if (name === 'score') this.playScore();
      else if (name === 'powerup') this.playPowerup();
      else if (name === 'powerupUse') this.playPowerupUse();
      else if (name === 'boost') this.playBoost();
      else if (name === 'explosion') this.playExplosion();
      else if (name === 'victory') this.playVictory();
      else if (name === 'menuTick') this.playMenuTick();
      else if (name === 'menuSelect') this.playMenuSelect();
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Plays a customizable tone.
   */
  beep({
    frequency = 440,
    duration = 0.1,
    type = 'sine',
    sweepTo = null,
    volumeScale = 0.5
  } = {}) {
    // Silently skip if AudioContext hasn't been unlocked by a user gesture yet
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);

    // Dynamic frequency sweep (e.g. lasers, pitch drops)
    if (sweepTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(sweepTo, this.ctx.currentTime + duration);
    }

    // Exponential volume decay envelope
    gainNode.gain.setValueAtTime(volumeScale, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  /**
   * Generates custom white noise for explosion syntheses.
   */
  createNoiseBuffer() {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 1.5; // 1.5 seconds of noise
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /* ==========================================================================
     ARCADE SOUND EFFECTS LIBRARY
     ========================================================================== */

  playMenuTick() {
    this.queueSound('menuTick');
    this.beep({ frequency: 800, duration: 0.05, type: 'triangle', volumeScale: 0.15 });
  }

  playMenuSelect() {
    this.queueSound('menuSelect');
    this.beep({ frequency: 400, duration: 0.15, type: 'sine', sweepTo: 900, volumeScale: 0.25 });
  }

  playBounce() {
    this.queueSound('bounce');
    // Solid retro ping
    this.beep({ frequency: 280, duration: 0.08, type: 'triangle', sweepTo: 180, volumeScale: 0.35 });
  }

  playScore() {
    this.queueSound('score');
    // Happy ding!
    this.beep({ frequency: 523.25, duration: 0.12, type: 'sine', volumeScale: 0.3 }); // C5
    setTimeout(() => {
      this.beep({ frequency: 659.25, duration: 0.3, type: 'sine', volumeScale: 0.3 }); // E5
    }, 100);
  }

  playPowerup() {
    this.queueSound('powerup');
    // Retro chord arpeggio sweep
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.beep({ frequency: freq, duration: 0.15, type: 'sine', volumeScale: 0.2 });
      }, idx * 60);
    });
  }

  playPowerupUse() {
    this.queueSound('powerupUse');
    this.beep({ frequency: 800, duration: 0.25, type: 'triangle', sweepTo: 300, volumeScale: 0.3 });
  }

  playBoost() {
    this.queueSound('boost');
    // Whoosh engine sweep
    this.beep({ frequency: 80, duration: 0.25, type: 'sawtooth', sweepTo: 450, volumeScale: 0.25 });
  }

  playExplosion() {
    this.queueSound('explosion');
    // Silently skip if AudioContext hasn't been unlocked by a user gesture yet
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return;

    const noise = this.ctx.createBufferSource();
    const noiseBuffer = this.createNoiseBuffer();
    if (!noiseBuffer) return;
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    
    // Sweep lowpass filter down to simulate muffled rumbling explosion
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 1.2);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.8, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    noise.start();
    noise.stop(this.ctx.currentTime + 1.2);
  }

  playVictory() {
    this.queueSound('victory');
    // Short classic game over victory tune
    const melody = [523.25, 493.88, 523.25, 587.33, 659.25]; // C5, B4, C5, D5, E5
    const durations = [0.15, 0.15, 0.15, 0.15, 0.45];
    let timeAccumulator = 0;

    melody.forEach((freq, idx) => {
      setTimeout(() => {
        this.beep({ frequency: freq, duration: durations[idx], type: 'sine', volumeScale: 0.3 });
      }, timeAccumulator);
      timeAccumulator += durations[idx] * 1000 * 0.85;
    });
  }

  /* ==========================================================================
     VOLUME / STATE CONTROLS
     ========================================================================== */

  setVolume(percent) {
    this.volume = Math.max(0, Math.min(100, percent)) / 100;
    if (this.masterGain && !this.muted && this.ctx) {
      // Smoothly transition volume to avoid popping clicks
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      const targetVal = this.muted ? 0 : this.volume;
      this.masterGain.gain.setTargetAtTime(targetVal, this.ctx.currentTime, 0.01);
    }
    return this.muted;
  }
}

// Export singleton instance
export const audio = new RetroAudioSynth();
export default audio;
