/**
 * DUEL NEON // Core Engine Utilities
 * Includes 2D Vector Math, Keyboard Input Management, Gamepad Polling, Particle Systems, and Screen Shake.
 */

// ==========================================================================
// 1. 2D VECTOR MATH CLASS
// ==========================================================================
export class Vector2D {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  copy() {
    return new Vector2D(this.x, this.y);
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  mult(n) {
    this.x *= n;
    this.y *= n;
    return this;
  }

  div(n) {
    if (n !== 0) {
      this.x /= n;
      this.y /= n;
    }
    return this;
  }

  magSq() {
    return this.x * this.x + this.y * this.y;
  }

  mag() {
    return Math.sqrt(this.magSq());
  }

  heading() {
    return Math.atan2(this.y, this.x);
  }

  normalise() {
    const m = this.mag();
    if (m !== 0) this.div(m);
    return this;
  }

  limit(max) {
    const mSq = this.magSq();
    if (mSq > max * max) {
      this.normalise().mult(max);
    }
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  dist(v) {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

// ==========================================================================
// 2. INPUT CONTROLLER (KEYBOARD & GAMEPADS)
// ==========================================================================
export class InputController {
  constructor() {
    this.keys = {};
    this.gameActive = false;

    // Standard gaming key bindings
    window.addEventListener('keydown', (e) => {
      // In netplay host mode, ignore Player 2 arrow controls from local physical keyboard
      if (window.arcade && typeof window.arcade.isHostActive === 'function' && window.arcade.isHostActive()) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'ShiftRight', 'ShiftLeft', 'NumpadEnter'].includes(e.code) || 
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
          return;
        }
      }

      this.keys[e.key] = true;
      this.keys[e.code] = true; // Use codes like 'KeyW' or 'ArrowUp' to be layout-independent

      // Prevent scrolling when game is playing
      if (this.gameActive && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (window.arcade && typeof window.arcade.isHostActive === 'function' && window.arcade.isHostActive()) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'ShiftRight', 'ShiftLeft', 'NumpadEnter'].includes(e.code) || 
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
          return;
        }
      }

      this.keys[e.key] = false;
      this.keys[e.code] = false;
    });
  }

  isPressed(keyOrCode) {
    return !!this.keys[keyOrCode];
  }

  /**
   * Merges remote keystroke state packets directly into active inputs.
   */
  setRemoteKeys(remoteKeys) {
    for (const key in remoteKeys) {
      this.keys[key] = remoteKeys[key];
    }
  }

  setGameActive(active) {
    this.gameActive = active;
    if (!active) {
      this.keys = {}; // Clear stuck keys
    }
  }

  /**
   * Polls Gamepad API and maps gamepad buttons to virtual keypresses.
   * Player 1 maps to Gamepad index 0. Player 2 maps to Gamepad index 1.
   */
  pollGamepads() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let detected = false;
    
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp) continue;
      
      detected = true;

      // Axis thresholds
      const threshold = 0.25;

      if (i === 0) {
        // Player 1 mapping (WASD + Space)
        // Left stick mapping
        this.keys['KeyW'] = gp.axes[1] < -threshold;
        this.keys['KeyS'] = gp.axes[1] > threshold;
        this.keys['KeyA'] = gp.axes[0] < -threshold;
        this.keys['KeyD'] = gp.axes[0] > threshold;
        
        // Button A or Trigger mapping for SPACE
        this.keys['Space'] = gp.buttons[0].pressed || gp.buttons[7].pressed;
      } else if (i === 1) {
        // Player 2 mapping (Arrow Keys + Enter)
        // Left stick mapping
        this.keys['ArrowUp'] = gp.axes[1] < -threshold;
        this.keys['ArrowDown'] = gp.axes[1] > threshold;
        this.keys['ArrowLeft'] = gp.axes[0] < -threshold;
        this.keys['ArrowRight'] = gp.axes[0] > threshold;
        
        // Button A or Trigger mapping for ENTER
        this.keys['Enter'] = gp.buttons[0].pressed || gp.buttons[7].pressed;
      } else if (i === 2) {
        // Player 3 mapping (IJKL + U)
        // Left stick mapping
        this.keys['KeyI'] = gp.axes[1] < -threshold;
        this.keys['KeyK'] = gp.axes[1] > threshold;
        this.keys['KeyJ'] = gp.axes[0] < -threshold;
        this.keys['KeyL'] = gp.axes[0] > threshold;
        
        // Button A or Trigger mapping for U
        this.keys['KeyU'] = gp.buttons[0].pressed || gp.buttons[7].pressed;
      }
    }

    return detected;
  }
}

// ==========================================================================
// 3. GLOWING PARTICLE PHYSICS SYSTEM
// ==========================================================================
export class Particle {
  constructor(x, y, color, speedScale = 1, gravity = 0) {
    this.pos = new Vector2D(x, y);
    
    // Random angle & explosion speed
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.5 + Math.random() * 4.5) * speedScale;
    this.vel = new Vector2D(Math.cos(angle) * speed, Math.sin(angle) * speed);
    
    this.color = color;
    this.gravity = gravity;
    
    // Fading parameters
    this.alpha = 1.0;
    this.decay = 0.015 + Math.random() * 0.025;
    this.size = 2 + Math.random() * 4;
  }

  update() {
    this.vel.y += this.gravity;
    this.pos.add(this.vel);
    this.alpha -= this.decay;
    return this.alpha > 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = this.alpha;
    ctx.shadowBlur = this.size * 2;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.queuedExplosions = [];
  }

  spawnExplosion(x, y, color, count = 25, speedScale = 1, gravity = 0) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, color, speedScale, gravity));
    }

    if (window.arcade && typeof window.arcade.isHostActive === 'function' && window.arcade.isHostActive()) {
      this.queuedExplosions.push({ x, y, color, count, speedScale, gravity });
    }
  }

  flushExplosions() {
    const list = [...this.queuedExplosions];
    this.queuedExplosions = [];
    return list;
  }

  spawnTrail(x, y, color, count = 1) {
    for (let i = 0; i < count; i++) {
      const p = new Particle(x, y, color, 0.2, 0);
      p.decay = 0.04;
      p.size = 1.5 + Math.random() * 2;
      this.particles.push(p);
    }
  }

  update() {
    this.particles = this.particles.filter(p => p.update());
  }

  draw(ctx) {
    this.particles.forEach(p => p.draw(ctx));
  }

  clear() {
    this.particles = [];
  }
}

// ==========================================================================
// 4. SCREEN SHAKE COORDINATOR
// ==========================================================================
let _shakeQueued = false;

export function triggerScreenShake() {
  const container = document.getElementById('app-container');
  if (!container) return;

  // Clear class if already shaking
  container.classList.remove('shake-active');
  // Trigger reflow to restart animation
  void container.offsetWidth;
  // Apply shake
  container.classList.add('shake-active');

  setTimeout(() => {
    container.classList.remove('shake-active');
  }, 400);

  // Auto-queue for network sync when hosting
  _shakeQueued = true;
}

/**
 * Returns whether a screen shake was triggered since last flush, then resets.
 */
export function flushScreenShake() {
  const val = _shakeQueued;
  _shakeQueued = false;
  return val;
}
