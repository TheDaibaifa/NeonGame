import { Vector2D, ParticleSystem, triggerScreenShake } from './engine.js';
import { audio } from './audio.js';

/**
 * NEON TETHER — 2-Player Elastic Physics Duel
 * Two players are linked by a glowing elastic tether.
 * Build centrifugal momentum to slingshot your opponent into the spike boundaries.
 * First to 3 points wins.
 *
 * Added mechanics:
 * - Polarity Flip: costs energy, briefly reverses tether pull direction
 * - Tether Snap: auto-breaks at max tension → 2s free movement
 */
export default class GameNeonTether {
  constructor(canvas, input, onGameOver, mods = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.onGameOver = onGameOver;
    this.mods = mods;

    this.particles = new ParticleSystem();

    this.width = 800;
    this.height = 500;

    this.maxScore = 3;
    this.scores = { p1: 0, p2: 0 };
    this.winner = null;
    this.paused = false;
    this.roundEnded = false;
    this.roundEndTimer = 0;

    this.frameCount = 0;

    // Tether physics parameters
    this.restLength = 180;       // natural spring length
    this.springK = 0.015;        // spring stiffness (Hooke's)
    this.damping = 0.98;         // velocity damping

    // Turbo mod: faster movement
    const speedMult = this.mods.turbo ? 1.5 : 1.0;
    this.accel = 0.45 * speedMult;
    this.maxSpeed = 8 * speedMult;

    // Tether snap
    this.snapDistance = 320;     // distance at which tether snaps
    this.snapCooldown = 0;       // frames of free movement after snap
    this.snapDuration = 120;     // 2 seconds free movement
    this.snapReformTimer = 0;    // frames until re-linking
    this.isSnapped = false;

    // Tether tension pulse
    this.tetherPulse = 0;

    // Spike hazards on arena edges
    this.spikes = this._buildSpikes();

    // Players
    this.p1 = {
      key: 'p1',
      color: '#00f0ff',
      pos: new Vector2D(300, 250),
      vel: new Vector2D(0, 0),
      radius: 16,
      energy: 100,      // for Polarity Flip
      flipCooldown: 0,
      isFlipping: false,
      score: 0,
      stunTimer: 0,
      alive: true
    };

    this.p2 = {
      key: 'p2',
      color: '#ff007f',
      pos: new Vector2D(500, 250),
      vel: new Vector2D(0, 0),
      radius: 16,
      energy: 100,
      flipCooldown: 0,
      isFlipping: false,
      score: 0,
      stunTimer: 0,
      alive: true
    };

    this.resetRound();
  }

  _buildSpikes() {
    const spikes = [];
    const spikeSpacing = 40;
    const spikeLen = 14;
    const W = this.width;
    const H = this.height;

    // Top wall
    for (let x = 20; x < W - 20; x += spikeSpacing) {
      spikes.push({ x, y: 0, nx: 0, ny: 1, len: spikeLen });
    }
    // Bottom wall
    for (let x = 20; x < W - 20; x += spikeSpacing) {
      spikes.push({ x, y: H, nx: 0, ny: -1, len: spikeLen });
    }
    // Left wall
    for (let y = 20; y < H - 20; y += spikeSpacing) {
      spikes.push({ x: 0, y, nx: 1, ny: 0, len: spikeLen });
    }
    // Right wall
    for (let y = 20; y < H - 20; y += spikeSpacing) {
      spikes.push({ x: W, y, nx: -1, ny: 0, len: spikeLen });
    }

    return spikes;
  }

  resetRound() {
    this.roundEnded = false;
    this.roundEndTimer = 0;
    this.isSnapped = false;
    this.snapCooldown = 0;
    this.snapReformTimer = 0;
    this.tetherPulse = 0;
    this.frameCount = 0;
    this.particles.clear();

    this.p1.pos.set(280, 250);
    this.p1.vel.set(0, 0);
    this.p1.energy = 100;
    this.p1.flipCooldown = 0;
    this.p1.isFlipping = false;
    this.p1.stunTimer = 0;
    this.p1.alive = true;

    this.p2.pos.set(520, 250);
    this.p2.vel.set(0, 0);
    this.p2.energy = 100;
    this.p2.flipCooldown = 0;
    this.p2.isFlipping = false;
    this.p2.stunTimer = 0;
    this.p2.alive = true;
  }

  // ============================================================
  // TICK
  // ============================================================
  tick() {
    if (this.roundEnded) {
      this.roundEndTimer++;
      if (this.roundEndTimer >= 90) {
        this._resolveRoundEnd();
      }
      this.particles.update();
      return;
    }

    this.frameCount++;
    this._readInputs();
    this._applyTether();
    this._movePlayers();
    this._checkSpikeCollisions();
    this.particles.update();
    this.tetherPulse += 0.08;
  }

  _readInputs() {
    // P1: WASD — move; Space — Polarity Flip
    if (this.p1.stunTimer <= 0) {
      if (this.input.isPressed('KeyW') || this.input.isPressed('w')) this.p1.vel.y -= this.accel;
      if (this.input.isPressed('KeyS') || this.input.isPressed('s')) this.p1.vel.y += this.accel;
      if (this.input.isPressed('KeyA') || this.input.isPressed('a')) this.p1.vel.x -= this.accel;
      if (this.input.isPressed('KeyD') || this.input.isPressed('d')) this.p1.vel.x += this.accel;

      // Polarity Flip
      if (this.input.isPressed('Space') && this.p1.energy >= 50 && this.p1.flipCooldown <= 0) {
        this.p1.isFlipping = true;
        this.p1.energy -= 50;
        this.p1.flipCooldown = 180; // 3 second cooldown
        this.particles.spawnExplosion(this.p1.pos.x, this.p1.pos.y, '#00f0ff', 25, 1.5);
        audio.playBoost();
      }
    } else {
      this.p1.stunTimer--;
    }

    // Flip expires after 60 frames (1s)
    if (this.p1.isFlipping) {
      this.p1.flipCooldown--;
      if (this.p1.flipCooldown <= 120) this.p1.isFlipping = false; // flip lasts 1s
    } else if (this.p1.flipCooldown > 0) {
      this.p1.flipCooldown--;
    }
    if (this.p1.energy < 100) this.p1.energy = Math.min(100, this.p1.energy + 0.15);

    // P2: Arrow Keys — move; Enter — Polarity Flip
    if (this.p2.stunTimer <= 0) {
      if (this.input.isPressed('ArrowUp')) this.p2.vel.y -= this.accel;
      if (this.input.isPressed('ArrowDown')) this.p2.vel.y += this.accel;
      if (this.input.isPressed('ArrowLeft')) this.p2.vel.x -= this.accel;
      if (this.input.isPressed('ArrowRight')) this.p2.vel.x += this.accel;

      // Polarity Flip
      if (this.input.isPressed('Enter') && this.p2.energy >= 50 && this.p2.flipCooldown <= 0) {
        this.p2.isFlipping = true;
        this.p2.energy -= 50;
        this.p2.flipCooldown = 180;
        this.particles.spawnExplosion(this.p2.pos.x, this.p2.pos.y, '#ff007f', 25, 1.5);
        audio.playBoost();
      }
    } else {
      this.p2.stunTimer--;
    }

    if (this.p2.isFlipping) {
      this.p2.flipCooldown--;
      if (this.p2.flipCooldown <= 120) this.p2.isFlipping = false;
    } else if (this.p2.flipCooldown > 0) {
      this.p2.flipCooldown--;
    }
    if (this.p2.energy < 100) this.p2.energy = Math.min(100, this.p2.energy + 0.15);
  }

  /**
   * Apply spring/tether force between both players.
   * Handles snap, free movement period, and re-linking.
   */
  _applyTether() {
    const dx = this.p2.pos.x - this.p1.pos.x;
    const dy = this.p2.pos.y - this.p1.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.isSnapped) {
      this.snapCooldown--;
      if (this.snapCooldown <= 0) {
        // Begin reforming tether
        this.isSnapped = false;
        this.snapReformTimer = 60; // visual glow reform delay
        audio.playPowerup();
        this.particles.spawnExplosion(
          (this.p1.pos.x + this.p2.pos.x) / 2,
          (this.p1.pos.y + this.p2.pos.y) / 2,
          '#ffffff', 20, 1.0
        );
      }
      return;
    }

    if (this.snapReformTimer > 0) {
      this.snapReformTimer--;
    }

    // Check if tether should snap
    if (dist > this.snapDistance && this.snapCooldown <= 0) {
      this.isSnapped = true;
      this.snapCooldown = this.snapDuration;
      audio.playExplosion();
      triggerScreenShake();
      this.particles.spawnExplosion(
        (this.p1.pos.x + this.p2.pos.x) / 2,
        (this.p1.pos.y + this.p2.pos.y) / 2,
        '#ffffff', 35, 2.5
      );
      return;
    }

    // Hooke's Law spring force
    const extension = dist - this.restLength;
    if (dist === 0) return;

    const nx = dx / dist;
    const ny = dy / dist;

    // Force magnitude (positive = attractive, pulling toward each other)
    let fMag = extension * this.springK;

    // Polarity Flip reverses force direction for the flipper
    if (this.p1.isFlipping) fMag = -fMag;
    if (this.p2.isFlipping) fMag = -fMag;

    // Apply forces (equal and opposite on each player)
    this.p1.vel.x += nx * fMag;
    this.p1.vel.y += ny * fMag;
    this.p2.vel.x -= nx * fMag;
    this.p2.vel.y -= ny * fMag;
  }

  _movePlayers() {
    for (const p of [this.p1, this.p2]) {
      // Cap speed
      const speed = Math.sqrt(p.vel.x * p.vel.x + p.vel.y * p.vel.y);
      if (speed > this.maxSpeed) {
        p.vel.x = (p.vel.x / speed) * this.maxSpeed;
        p.vel.y = (p.vel.y / speed) * this.maxSpeed;
      }

      // Damping
      p.vel.x *= this.damping;
      p.vel.y *= this.damping;

      // Move
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;

      // Soft wall bounce (push back, don't kill — spikes kill)
      const margin = 18;
      if (p.pos.x < margin) { p.pos.x = margin; p.vel.x *= -0.4; }
      if (p.pos.x > this.width - margin) { p.pos.x = this.width - margin; p.vel.x *= -0.4; }
      if (p.pos.y < margin) { p.pos.y = margin; p.vel.y *= -0.4; }
      if (p.pos.y > this.height - margin) { p.pos.y = this.height - margin; p.vel.y *= -0.4; }
    }
  }

  /**
   * Check if players are too close to wall (spike zone = 20px from edge)
   */
  _checkSpikeCollisions() {
    const spikeZone = 22;
    for (const p of [this.p1, this.p2]) {
      if (!p.alive) continue;

      const hitSpike = p.pos.x <= spikeZone || p.pos.x >= this.width - spikeZone
        || p.pos.y <= spikeZone || p.pos.y >= this.height - spikeZone;

      if (hitSpike) {
        this._hitSpike(p);
      }
    }
  }

  _hitSpike(player) {
    if (this.roundEnded) return;
    this.roundEnded = true;

    // Score opponent
    const opponent = player === this.p1 ? this.p2 : this.p1;
    this.scores[opponent.key]++;

    audio.playExplosion();
    triggerScreenShake();
    this.particles.spawnExplosion(player.pos.x, player.pos.y, player.color, 60, 2.8);
    this.particles.spawnExplosion(player.pos.x, player.pos.y, '#ffffff', 25, 3.5);
  }

  _resolveRoundEnd() {
    // Determine winner of this round
    if (this.scores.p1 >= this.maxScore) {
      this.winner = 'p1';
      audio.playVictory();
      this.onGameOver('p1', `${this.scores.p1} - ${this.scores.p2}`);
    } else if (this.scores.p2 >= this.maxScore) {
      this.winner = 'p2';
      audio.playVictory();
      this.onGameOver('p2', `${this.scores.p1} - ${this.scores.p2}`);
    } else {
      this.resetRound();
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  render() {
    const ctx = this.ctx;
    this.frameCount++;

    // Background — dark synthwave grid
    ctx.fillStyle = '#05010f';
    ctx.fillRect(0, 0, this.width, this.height);
    this._drawSynthwaveGrid(ctx);

    // Spikes
    this._drawSpikes(ctx);

    // Tether beam
    if (!this.isSnapped || this.snapCooldown > this.snapDuration - 10) {
      this._drawTether(ctx);
    }

    // Players
    this._drawPlayer(ctx, this.p1);
    this._drawPlayer(ctx, this.p2);

    // Particles
    this.particles.draw(ctx);

    // HUD
    this._drawHUD(ctx);

    // Round end flash
    if (this.roundEnded && this.roundEndTimer < 30) {
      ctx.save();
      ctx.globalAlpha = (30 - this.roundEndTimer) / 30 * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  _drawSynthwaveGrid(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(157, 78, 221, 0.06)';
    ctx.lineWidth = 0.5;
    const step = 50;
    for (let x = 0; x <= this.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = 0; y <= this.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }

    // Magenta / Cyan borders
    const borderGrad = ctx.createLinearGradient(0, 0, this.width, 0);
    borderGrad.addColorStop(0, 'rgba(0, 240, 255, 0.6)');
    borderGrad.addColorStop(0.5, 'rgba(157, 78, 221, 0.3)');
    borderGrad.addColorStop(1, 'rgba(255, 0, 127, 0.6)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 2;
    ctx.shadowColor = '#9d4edd';
    ctx.shadowBlur = 10;
    ctx.strokeRect(2, 2, this.width - 4, this.height - 4);
    ctx.restore();
  }

  _drawSpikes(ctx) {
    const t = this.frameCount;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const spike of this.spikes) {
      // Only draw visible spikes (on the edges)
      const tipX = spike.x + spike.nx * spike.len;
      const tipY = spike.y + spike.ny * spike.len;

      // Perpendicular base
      const perpX = -spike.ny;
      const perpY = spike.nx;
      const halfBase = 5;

      // Pulsing glow
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.05 + spike.x * 0.1);
      ctx.shadowColor = '#9d4edd';
      ctx.shadowBlur = 8 + pulse * 8;
      ctx.fillStyle = `rgba(157, 78, 221, ${0.5 + pulse * 0.5})`;

      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(spike.x + perpX * halfBase, spike.y + perpY * halfBase);
      ctx.lineTo(spike.x - perpX * halfBase, spike.y - perpY * halfBase);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _drawTether(ctx) {
    const { p1, p2 } = this;
    const dx = p2.pos.x - p1.pos.x;
    const dy = p2.pos.y - p1.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Tension ratio (0..1)
    const tension = Math.min(1, Math.max(0, (dist - this.restLength) / (this.snapDistance - this.restLength)));

    // Color: white → red as tension builds
    const r = Math.round(255);
    const g = Math.round(255 * (1 - tension));
    const b = Math.round(255 * (1 - tension));
    const tetherColor = `rgb(${r}, ${g}, ${b})`;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Glow outer
    ctx.strokeStyle = tetherColor;
    ctx.lineWidth = 3 + tension * 4;
    ctx.shadowColor = tetherColor;
    ctx.shadowBlur = 12 + tension * 18;
    ctx.globalAlpha = 0.4;

    // Oscillating tether — draw wavy line
    const segments = 20;
    const amplitude = tension * 12 * Math.sin(this.tetherPulse);
    const nx = -dy / dist;
    const ny = dx / dist;

    ctx.beginPath();
    ctx.moveTo(p1.pos.x, p1.pos.y);
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const wave = amplitude * Math.sin(t * Math.PI * 2 + this.tetherPulse * 2);
      const mx = p1.pos.x + dx * t + nx * wave;
      const my = p1.pos.y + dy * t + ny * wave;
      ctx.lineTo(mx, my);
    }
    ctx.stroke();

    // Core line
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(p1.pos.x, p1.pos.y);
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const wave = amplitude * Math.sin(t * Math.PI * 2 + this.tetherPulse * 2);
      const mx = p1.pos.x + dx * t + nx * wave;
      const my = p1.pos.y + dy * t + ny * wave;
      ctx.lineTo(mx, my);
    }
    ctx.stroke();

    ctx.restore();

    // Snap warning flash
    if (tension > 0.85) {
      ctx.save();
      ctx.globalAlpha = (tension - 0.85) / 0.15 * 0.3 * (0.5 + 0.5 * Math.sin(this.tetherPulse * 6));
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }

    // Snapped state indicator
    if (this.isSnapped) {
      const remaining = this.snapCooldown;
      const pct = remaining / this.snapDuration;
      ctx.save();
      ctx.font = 'bold 14px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff0000';
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 14;
      ctx.fillText(`TETHER SNAPPED — FREE: ${Math.ceil(remaining / 60)}s`, this.width / 2, 30);
      ctx.restore();
    }
  }

  _drawPlayer(ctx, player) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Stun flash
    const stunAlpha = player.stunTimer > 0 ? (player.stunTimer % 6 < 3 ? 0.3 : 1) : 1;

    // Polarity flip aura
    if (player.isFlipping) {
      ctx.strokeStyle = player === this.p1 ? '#00f0ff' : '#ff007f';
      ctx.lineWidth = 3;
      ctx.shadowColor = player.color;
      ctx.shadowBlur = 30;
      ctx.globalAlpha = 0.5 + Math.sin(this.tetherPulse * 4) * 0.5;
      ctx.beginPath();
      ctx.arc(player.pos.x, player.pos.y, player.radius * 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.shadowColor = player.color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = player.color;
    ctx.globalAlpha = stunAlpha;

    // Player sphere
    ctx.beginPath();
    ctx.arc(player.pos.x, player.pos.y, player.radius, 0, Math.PI * 2);
    ctx.fill();

    // White core highlight
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.globalAlpha = stunAlpha * 0.8;
    ctx.beginPath();
    ctx.arc(player.pos.x - player.radius * 0.3, player.pos.y - player.radius * 0.3, player.radius * 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawHUD(ctx) {
    const { p1, p2 } = this;
    const dx = p2.pos.x - p1.pos.x;
    const dy = p2.pos.y - p1.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const tension = Math.min(1, Math.max(0, (dist - this.restLength) / (this.snapDistance - this.restLength)));

    // P1 HUD (top-left)
    this._drawPlayerHUD(ctx, p1, 12, 12, false);

    // P2 HUD (top-right)
    this._drawPlayerHUD(ctx, p2, this.width - 12, 12, true);

    // Tension meter (center)
    const centerX = this.width / 2;
    const meterW = 120;
    const meterH = 10;
    const meterY = 15;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(centerX - meterW / 2, meterY, meterW, meterH);

    const tensionColor = tension < 0.5
      ? `rgba(0, 240, 255, 0.8)`
      : tension < 0.85
        ? `rgba(255, 200, 0, 0.9)`
        : `rgba(255, 30, 30, 1.0)`;
    ctx.fillStyle = tensionColor;
    ctx.shadowColor = tensionColor;
    ctx.shadowBlur = 8;
    ctx.fillRect(centerX - meterW / 2, meterY, meterW * tension, meterH);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(centerX - meterW / 2, meterY, meterW, meterH);

    ctx.font = 'bold 8px Orbitron, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('TENSION', centerX, meterY - 1);

    // Score display center
    ctx.font = 'bold 16px Orbitron, sans-serif';
    ctx.textBaseline = 'top';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.textAlign = 'right';
    ctx.fillText(this.scores.p1, centerX - 20, meterY + meterH + 6);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.fillText('-', centerX, meterY + meterH + 6);

    ctx.fillStyle = '#ff007f';
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 8;
    ctx.textAlign = 'left';
    ctx.fillText(this.scores.p2, centerX + 20, meterY + meterH + 6);

    ctx.restore();
  }

  _drawPlayerHUD(ctx, player, x, y, isRight) {
    const barW = 80;
    const barH = 8;
    const align = isRight ? 'right' : 'left';
    const barX = isRight ? x - barW : x;

    ctx.save();

    // Label
    ctx.font = 'bold 11px Orbitron, sans-serif';
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillStyle = player.color;
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 10;
    ctx.fillText(player.key.toUpperCase(), x, y);

    // Energy bar background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 0;
    ctx.fillRect(barX, y + 16, barW, barH);

    // Energy fill
    const pct = player.energy / 100;
    const energyColor = player.energy > 50 ? player.color : '#ffaa00';
    ctx.fillStyle = energyColor;
    ctx.shadowColor = energyColor;
    ctx.shadowBlur = 6;
    ctx.fillRect(barX, y + 16, barW * pct, barH);

    // Flip cooldown indicator
    if (player.flipCooldown > 0 && !player.isFlipping) {
      const readyPct = 1 - player.flipCooldown / 180;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.shadowBlur = 0;
      ctx.fillRect(barX, y + 28, barW, 4);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 4;
      ctx.fillRect(barX, y + 28, barW * readyPct, 4);
    }

    // FLIP active indicator
    if (player.isFlipping) {
      ctx.font = 'bold 9px Orbitron, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.fillText('FLIP!', x, y + 28);
    }

    // Energy label
    ctx.font = '8px Orbitron, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.shadowBlur = 0;
    ctx.fillText('ENERGY', x, y + 36);

    ctx.restore();
  }

  // ============================================================
  // NETWORK STATE SYNC
  // ============================================================
  getState() {
    return {
      p1: {
        x: this.p1.pos.x, y: this.p1.pos.y,
        vx: this.p1.vel.x, vy: this.p1.vel.y,
        energy: this.p1.energy,
        flipCooldown: this.p1.flipCooldown,
        isFlipping: this.p1.isFlipping,
        stunTimer: this.p1.stunTimer,
        alive: this.p1.alive
      },
      p2: {
        x: this.p2.pos.x, y: this.p2.pos.y,
        vx: this.p2.vel.x, vy: this.p2.vel.y,
        energy: this.p2.energy,
        flipCooldown: this.p2.flipCooldown,
        isFlipping: this.p2.isFlipping,
        stunTimer: this.p2.stunTimer,
        alive: this.p2.alive
      },
      isSnapped: this.isSnapped,
      snapCooldown: this.snapCooldown,
      tetherPulse: this.tetherPulse,
      roundEnded: this.roundEnded,
      roundEndTimer: this.roundEndTimer
    };
  }

  applyNetworkState(state) {
    if (!state) return;

    this.p1.pos.set(state.p1.x, state.p1.y);
    this.p1.vel.set(state.p1.vx, state.p1.vy);
    this.p1.energy = state.p1.energy;
    this.p1.flipCooldown = state.p1.flipCooldown;
    this.p1.isFlipping = state.p1.isFlipping;
    this.p1.stunTimer = state.p1.stunTimer;
    this.p1.alive = state.p1.alive;

    this.p2.pos.set(state.p2.x, state.p2.y);
    this.p2.vel.set(state.p2.vx, state.p2.vy);
    this.p2.energy = state.p2.energy;
    this.p2.flipCooldown = state.p2.flipCooldown;
    this.p2.isFlipping = state.p2.isFlipping;
    this.p2.stunTimer = state.p2.stunTimer;
    this.p2.alive = state.p2.alive;

    this.isSnapped = state.isSnapped;
    this.snapCooldown = state.snapCooldown;
    this.tetherPulse = state.tetherPulse;
    this.roundEnded = state.roundEnded;
    this.roundEndTimer = state.roundEndTimer;
  }

  cleanup() {}
}
