import { Vector2D, ParticleSystem, triggerScreenShake } from './engine.js';
import { audio } from './audio.js';

/**
 * LUMINOUS RACE — Tron-style Light Cycle Arena (2-4 Players)
 * Players leave permanent glowing trails. Crash into a trail = eliminated.
 * Last player moving wins the round. First to 5 round wins takes the match.
 *
 * POWERUP TYPES:
 *  ✅ PHASER  (white)   — Phase through one wall or trail (positive)
 *  ✅ GHOST   (cyan)    — Leave no trail for 3 seconds (positive)
 *  ✅ SURGE   (yellow)  — 3× speed for 2 seconds (positive)
 *  ❌ WIDEN   (orange)  — Doubles trail width of ALL other players for 5 seconds (negative)
 *  ❌ INVERT  (magenta) — Inverts turning keys of ALL other players for 3 seconds (negative)
 */

// Powerup definition table
const POWERUP_DEFS = [
  { type: 'PHASER', color: '#ffffff', glowColor: 'rgba(255,255,255,0.5)', icon: 'Ø', label: 'PHASE',  positive: true  },
  { type: 'GHOST',  color: '#00f0ff', glowColor: 'rgba(0,240,255,0.5)',   icon: '◈', label: 'GHOST',  positive: true  },
  { type: 'SURGE',  color: '#ffff00', glowColor: 'rgba(255,255,0,0.5)',   icon: '⚡', label: 'SURGE!', positive: true  },
  { type: 'WIDEN',  color: '#ff5500', glowColor: 'rgba(255,85,0,0.5)',    icon: '⊕', label: 'WIDE!',  positive: false },
  { type: 'INVERT', color: '#ff00ff', glowColor: 'rgba(255,0,255,0.5)',   icon: '↻', label: 'FLIP!',  positive: false },
];

export default class GameLuminousRace {
  constructor(canvas, input, onGameOver, mods = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.onGameOver = onGameOver;
    this.mods = mods;

    this.particles = new ParticleSystem();

    this.width = 800;
    this.height = 500;

    this.is3P = this.mods.playerMode === 3;
    this.is4P = this.mods.playerMode === 4;

    this.maxScore = 5;
    this.scores = this.is4P
      ? { p1: 0, p2: 0, p3: 0, p4: 0 }
      : this.is3P
        ? { p1: 0, p2: 0, p3: 0 }
        : { p1: 0, p2: 0 };

    this.winner = null;
    this.paused = false;
    this.roundEnded = false;
    this.roundEndTimer = 0;

    // Speed (Turbo mod = faster)
    this.baseSpeed = this.mods.turbo ? 3.5 : 2.4;

    // Arena boundary walls (with padding)
    this.arenaLeft   = 10;
    this.arenaTop    = 10;
    this.arenaRight  = this.width  - 10;
    this.arenaBottom = this.height - 10;

    // Trail width (base)
    this.baseTrailWidth = this.mods.chaos ? 10 : 5;

    // Trail decay for 4P mode — frames to live
    this.trailDecayTime = 360; // 6 seconds at 60fps

    // Powerup object (one active at a time)
    this.powerup = {
      active:     false,
      pos:        new Vector2D(400, 250),
      radius:     20,
      pulse:      0,
      spawnTimer: 240,
      def:        POWERUP_DEFS[0]   // current powerup definition
    };

    this.players = [];
    this._initPlayers();
    this.resetRound();
  }

  _initPlayers() {
    const colors = ['#00f0ff', '#ff007f', '#ffff00', '#39ff14'];
    const keys   = ['p1', 'p2', 'p3', 'p4'];
    const count  = this.is4P ? 4 : this.is3P ? 3 : 2;

    for (let i = 0; i < count; i++) {
      this.players.push({
        key:   keys[i],
        color: colors[i],
        pos:   new Vector2D(0, 0),
        dir:   new Vector2D(0, 0),      // current direction (unit vector)
        nextDir: new Vector2D(0, 0),    // buffered turn
        speed: this.baseSpeed,
        alive: true,
        trail: [],                       // Array of { x, y, age }

        // Gauges
        boostGauge:  100,
        isBoosting:  false,

        // Effect timers (frames remaining)
        phaserActive: false,             // one-shot wall/trail phase
        ghostTimer:   0,                 // no trail left
        surgeTimer:   0,                 // 3× speed
        widenTimer:   0,                 // this player's trail is double-wide (applied by opponent's WIDEN)
        invertTimer:  0,                 // this player's turning is inverted

        // Current effect label to show in HUD
        activeEffect: null
      });
    }
  }

  // ============================================================
  // ROUND MANAGEMENT
  // ============================================================
  resetRound() {
    this.roundEnded   = false;
    this.roundEndTimer = 0;
    this.particles.clear();
    this.powerup.active     = false;
    this.powerup.spawnTimer = 240;

    const count = this.players.length;
    const cx = this.width  / 2;
    const cy = this.height / 2;

    const configs = [
      [ // 2P
        { x: cx - 180, y: cy,       dx:  1, dy: 0 },
        { x: cx + 180, y: cy,       dx: -1, dy: 0 }
      ],
      [ // 3P
        { x: cx - 180, y: cy,       dx:  1, dy: 0 },
        { x: cx + 180, y: cy,       dx: -1, dy: 0 },
        { x: cx,       y: cy - 160, dx:  0, dy: 1 }
      ],
      [ // 4P
        { x: cx - 200, y: cy - 150, dx:  1, dy: 0 },
        { x: cx + 200, y: cy - 150, dx: -1, dy: 0 },
        { x: cx - 200, y: cy + 150, dx:  1, dy: 0 },
        { x: cx + 200, y: cy + 150, dx: -1, dy: 0 }
      ]
    ];

    const cfg = configs[count - 2];

    this.players.forEach((p, i) => {
      const c = cfg[i];
      p.pos.set(c.x, c.y);
      p.dir.set(c.dx, c.dy);
      p.nextDir.set(c.dx, c.dy);
      p.alive        = true;
      p.trail        = [{ x: c.x, y: c.y, age: 0 }];
      p.boostGauge   = 100;
      p.isBoosting   = false;
      p.phaserActive = false;
      p.ghostTimer   = 0;
      p.surgeTimer   = 0;
      p.widenTimer   = 0;
      p.invertTimer  = 0;
      p.activeEffect = null;
      p.speed        = this.baseSpeed;
    });
  }

  // ============================================================
  // TICK — main update at 60fps
  // ============================================================
  tick() {
    if (this.roundEnded) {
      this.roundEndTimer++;
      if (this.roundEndTimer >= 90) this._resolveRoundEnd();
      this.particles.update();
      return;
    }

    this._readInputs();
    this._movePlayers();
    this._updatePowerup();
    this._tickEffectTimers();
    this.particles.update();
  }

  // ============================================================
  // INPUT — read direction keys; respect invertTimer
  // ============================================================
  _readInputs() {
    const p = this.players;

    // helper: returns true/false for a key press
    const key = (k) => this.input.isPressed(k);

    // P1: WASD + Space (boost)
    if (p[0] && p[0].alive) this._readPlayerInput(p[0],
      key('KeyW') || key('w'),
      key('KeyS') || key('s'),
      key('KeyA') || key('a'),
      key('KeyD') || key('d'),
      key('Space')
    );

    // P2: Arrows + Enter (boost)
    if (p[1] && p[1].alive) this._readPlayerInput(p[1],
      key('ArrowUp'),
      key('ArrowDown'),
      key('ArrowLeft'),
      key('ArrowRight'),
      key('Enter')
    );

    // P3: IJKL + U (boost)
    if (p[2] && p[2].alive) this._readPlayerInput(p[2],
      key('KeyI') || key('i'),
      key('KeyK') || key('k'),
      key('KeyJ') || key('j'),
      key('KeyL') || key('l'),
      key('KeyU') || key('u')
    );

    // P4: TFGH + Y (boost)
    if (p[3] && p[3].alive) this._readPlayerInput(p[3],
      key('KeyT') || key('t'),
      key('KeyG') || key('g'),
      key('KeyF') || key('f'),
      key('KeyH') || key('h'),
      key('KeyY') || key('y')
    );
  }

  _readPlayerInput(p, up, down, left, right, boost) {
    const d = p.dir;

    // INVERT effect: swap left↔right and up↔down
    if (p.invertTimer > 0) {
      [up, down, left, right] = [down, up, right, left];
    }

    // Only allow 90° turns (no 180° reversal)
    if (up    && d.y === 0) p.nextDir.set( 0, -1);
    if (down  && d.y === 0) p.nextDir.set( 0,  1);
    if (left  && d.x === 0) p.nextDir.set(-1,  0);
    if (right && d.x === 0) p.nextDir.set( 1,  0);

    // Boost
    if (boost && p.boostGauge >= 40) {
      p.isBoosting = true;
    } else if (!boost) {
      p.isBoosting = false;
    }
  }

  // ============================================================
  // MOVEMENT & TRAIL
  // ============================================================
  _movePlayers() {
    for (const p of this.players) {
      if (!p.alive) continue;

      // Commit queued turn
      p.dir.set(p.nextDir.x, p.nextDir.y);

      // Speed calculation
      let spd = this.baseSpeed;
      if (p.surgeTimer > 0) {
        spd = this.baseSpeed * 3.0;   // SURGE: 3×
      } else if (p.isBoosting && p.boostGauge >= 2) {
        spd = this.baseSpeed * 2.0;   // manual boost: 2×
        p.boostGauge -= 2;
        if (p.boostGauge < 0) p.boostGauge = 0;
      } else {
        p.isBoosting = false;
        if (p.boostGauge < 100) p.boostGauge = Math.min(100, p.boostGauge + 0.4);
      }
      p.speed = spd;

      const newX = p.pos.x + p.dir.x * spd;
      const newY = p.pos.y + p.dir.y * spd;

      // Collision checks
      const hitWall  = newX <= this.arenaLeft || newX >= this.arenaRight
                     || newY <= this.arenaTop  || newY >= this.arenaBottom;
      const hitTrail = !p.phaserActive && this._checkTrailCollision(p, newX, newY);

      if (hitWall || hitTrail) {
        if (p.phaserActive) {
          // Phaser consumed — survive this crash
          p.phaserActive = false;
          this.particles.spawnExplosion(p.pos.x, p.pos.y, p.color, 20, 1.0);
          audio.playPowerup();
        } else {
          this._eliminatePlayer(p);
          continue;
        }
      }

      p.pos.set(newX, newY);

      // GHOST: don't append trail
      if (p.ghostTimer <= 0) {
        const trailWidth = this._trailWidth(p);
        p.trail.push({ x: newX, y: newY, age: 0, w: trailWidth });
      }

      // 4P trail decay
      if (this.is4P) {
        for (const seg of p.trail) seg.age++;
        p.trail = p.trail.filter(seg => seg.age <= this.trailDecayTime);
      }

      // Occasional spark
      if (Math.random() < 0.1) {
        this.particles.spawnTrail(newX, newY, p.color, 1);
      }
    }

    // Check round end
    const alive = this.players.filter(p => p.alive);
    if (alive.length <= 1 && !this.roundEnded) {
      this.roundEnded = true;
    }
  }

  _trailWidth(p) {
    return p.widenTimer > 0
      ? this.baseTrailWidth * 2    // WIDEN effect: double width
      : this.baseTrailWidth;
  }

  _checkTrailCollision(checkPlayer, nx, ny) {
    const headGap = Math.ceil(8 + this.baseTrailWidth);

    for (const p of this.players) {
      const trailLen = p.trail.length;
      for (let i = 0; i < trailLen; i++) {
        if (p === checkPlayer && i >= trailLen - headGap) continue;

        const seg = p.trail[i];
        const halfW = ((seg.w || this.baseTrailWidth) / 2) + 2;
        if (Math.abs(nx - seg.x) < halfW && Math.abs(ny - seg.y) < halfW) {
          return true;
        }
      }
    }
    return false;
  }

  _eliminatePlayer(player) {
    player.alive = false;
    audio.playExplosion();
    triggerScreenShake();
    this.particles.spawnExplosion(player.pos.x, player.pos.y, player.color, 50, 2.2);
    this.particles.spawnExplosion(player.pos.x, player.pos.y, '#ffffff', 20, 3.0);
  }

  // ============================================================
  // EFFECT TIMERS — count down each frame
  // ============================================================
  _tickEffectTimers() {
    for (const p of this.players) {
      if (p.ghostTimer  > 0) p.ghostTimer--;
      if (p.surgeTimer  > 0) p.surgeTimer--;
      if (p.widenTimer  > 0) p.widenTimer--;
      if (p.invertTimer > 0) p.invertTimer--;

      // Update active effect label for HUD
      if (p.phaserActive)    p.activeEffect = 'PHASE';
      else if (p.ghostTimer  > 0) p.activeEffect = 'GHOST';
      else if (p.surgeTimer  > 0) p.activeEffect = 'SURGE';
      else p.activeEffect = null;

      // Show negative effects received
      if (p.widenTimer  > 0) p.activeEffect = (p.activeEffect ? p.activeEffect + '+' : '') + 'WIDE';
      if (p.invertTimer > 0) p.activeEffect = (p.activeEffect ? p.activeEffect + '+' : '') + 'FLIP';
    }
  }

  // ============================================================
  // POWERUP SYSTEM
  // ============================================================
  _updatePowerup() {
    if (this.powerup.active) {
      this.powerup.pulse += 0.06;

      for (const p of this.players) {
        if (!p.alive) continue;
        const dx = p.pos.x - this.powerup.pos.x;
        const dy = p.pos.y - this.powerup.pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < p.speed * 2 + this.powerup.radius) {
          this._applyPowerup(p, this.powerup.def);
          this.powerup.active     = false;
          this.powerup.spawnTimer = 300 + Math.floor(Math.random() * 240);
          break;
        }
      }
    } else {
      this.powerup.spawnTimer--;
      if (this.powerup.spawnTimer <= 0) {
        this._spawnPowerup();
      }
    }
  }

  _spawnPowerup() {
    // Pick a random powerup type
    const def = POWERUP_DEFS[Math.floor(Math.random() * POWERUP_DEFS.length)];
    this.powerup.def = def;

    const margin = 60;
    this.powerup.pos.set(
      margin + Math.random() * (this.width  - margin * 2),
      margin + Math.random() * (this.height - margin * 2)
    );
    this.powerup.active = true;
    this.powerup.pulse  = 0;

    audio.playPowerup();
    this.particles.spawnExplosion(
      this.powerup.pos.x, this.powerup.pos.y,
      def.color, 20, 0.8
    );
  }

  _applyPowerup(collector, def) {
    const others = this.players.filter(p => p !== collector && p.alive);

    // Burst effect on collection
    this.particles.spawnExplosion(
      this.powerup.pos.x, this.powerup.pos.y,
      def.color, 35, 1.8
    );
    audio.playPowerupUse();

    switch (def.type) {

      case 'PHASER':
        // Phase through next wall or trail crash — already existed
        collector.phaserActive = true;
        break;

      case 'GHOST':
        // Leave no trail for 3 seconds (180 frames)
        collector.ghostTimer = 180;
        // Wipe existing trail so the gap starts now
        collector.trail = [];
        this.particles.spawnExplosion(collector.pos.x, collector.pos.y, def.color, 25, 1.2);
        break;

      case 'SURGE':
        // 3× speed for 2 seconds (120 frames)
        collector.surgeTimer = 120;
        triggerScreenShake();
        this.particles.spawnExplosion(collector.pos.x, collector.pos.y, def.color, 30, 2.0);
        break;

      case 'WIDEN':
        // Double trail width of ALL other players for 5 seconds (300 frames)
        for (const op of others) {
          op.widenTimer = 300;
          this.particles.spawnExplosion(op.pos.x, op.pos.y, def.color, 20, 1.2);
        }
        triggerScreenShake();
        break;

      case 'INVERT':
        // Invert turning keys of ALL other players for 3 seconds (180 frames)
        for (const op of others) {
          op.invertTimer = 180;
          this.particles.spawnExplosion(op.pos.x, op.pos.y, def.color, 20, 1.2);
        }
        triggerScreenShake();
        break;
    }
  }

  // ============================================================
  // ROUND END
  // ============================================================
  _resolveRoundEnd() {
    const alive = this.players.filter(p => p.alive);
    const roundWinner = alive.length === 1 ? alive[0] : null;

    if (roundWinner) {
      this.scores[roundWinner.key]++;

      if (this.scores[roundWinner.key] >= this.maxScore) {
        this.winner = roundWinner.key;
        audio.playVictory();
        const parts = this.players.map(p => this.scores[p.key]);
        this.onGameOver(roundWinner.key, parts.join(' - '));
        return;
      }
    }

    this.resetRound();
  }

  // ============================================================
  // RENDER
  // ============================================================
  render() {
    const ctx = this.ctx;

    ctx.fillStyle = '#03010a';
    ctx.fillRect(0, 0, this.width, this.height);

    this._drawGrid(ctx);
    this._drawArenaBorder(ctx);

    for (const p of this.players) this._drawTrail(ctx, p);

    if (this.powerup.active) this._drawPowerup(ctx);

    for (const p of this.players) {
      if (p.alive) this._drawPlayer(ctx, p);
    }

    this._drawHUD(ctx);
    this.particles.draw(ctx);

    // Round-end white flash
    if (this.roundEnded && this.roundEndTimer < 30) {
      ctx.save();
      ctx.globalAlpha = (30 - this.roundEndTimer) / 30 * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  _drawGrid(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(157, 78, 221, 0.05)';
    ctx.lineWidth = 0.5;
    const step = 40;
    for (let x = this.arenaLeft;  x <= this.arenaRight;  x += step) {
      ctx.beginPath(); ctx.moveTo(x, this.arenaTop); ctx.lineTo(x, this.arenaBottom); ctx.stroke();
    }
    for (let y = this.arenaTop; y <= this.arenaBottom; y += step) {
      ctx.beginPath(); ctx.moveTo(this.arenaLeft, y); ctx.lineTo(this.arenaRight, y); ctx.stroke();
    }
    ctx.restore();
  }

  _drawArenaBorder(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(157, 78, 221, 0.7)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#9d4edd';
    ctx.shadowBlur = 12;
    ctx.strokeRect(
      this.arenaLeft, this.arenaTop,
      this.arenaRight - this.arenaLeft,
      this.arenaBottom - this.arenaTop
    );
    ctx.restore();
  }

  _drawTrail(ctx, player) {
    if (player.trail.length < 2) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap  = 'square';
    ctx.lineJoin = 'miter';

    // WIDEN effect: trail color tints orange-red
    const trailColor = player.widenTimer > 0
      ? _blendColors(player.color, '#ff5500', 0.5)
      : player.color;

    // Determine current trail width for draw (last segment's width)
    const tw = this._trailWidth(player);

    const trail = player.trail;
    const totalLen = trail.length;

    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < totalLen; i++) ctx.lineTo(trail[i].x, trail[i].y);

    // Outer glow
    ctx.strokeStyle = trailColor;
    ctx.lineWidth = tw + 4;
    ctx.shadowColor = trailColor;
    ctx.shadowBlur = 14;
    ctx.globalAlpha = 0.3;
    ctx.stroke();

    // Core line
    ctx.lineWidth = tw;
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 8;
    ctx.stroke();

    // 4P decay fade
    if (this.is4P && totalLen > 10) {
      for (let i = 0; i < Math.min(30, totalLen - 1); i++) {
        const seg = trail[i];
        ctx.globalAlpha = Math.max(0, 1 - seg.age / this.trailDecayTime) * 0.6;
        ctx.fillStyle   = trailColor;
        ctx.shadowBlur  = 4;
        ctx.shadowColor = trailColor;
        ctx.beginPath();
        ctx.arc(seg.x, seg.y, (seg.w || tw) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  _drawPlayer(ctx, player) {
    ctx.save();

    const size  = this.mods.chaos ? 14 : 8;
    const angle = Math.atan2(player.dir.y, player.dir.x);

    ctx.translate(player.pos.x, player.pos.y);
    ctx.rotate(angle);

    // ── GHOST effect: player is semi-transparent + flickering
    if (player.ghostTimer > 0) {
      const flicker = Math.sin(Date.now() * 0.02) * 0.2 + 0.6;
      ctx.globalAlpha = flicker;
    }

    // ── PHASER shield ring
    if (player.phaserActive) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 2;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur  = 20;
      ctx.globalAlpha = 0.7 + Math.sin(Date.now() * 0.015) * 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, size * 2.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── SURGE aura: pulsing yellow ring
    if (player.surgeTimer > 0) {
      ctx.save();
      const surgePulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.03);
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth   = 3;
      ctx.shadowColor = '#ffff00';
      ctx.shadowBlur  = 16 + surgePulse * 12;
      ctx.globalAlpha = 0.4 + surgePulse * 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, size * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── INVERT indicator: spinning magenta arrows around player
    if (player.invertTimer > 0) {
      ctx.save();
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth   = 2;
      ctx.shadowColor = '#ff00ff';
      ctx.shadowBlur  = 10;
      ctx.globalAlpha = 0.6;
      const invertAngle = (Date.now() * 0.005) % (Math.PI * 2);
      ctx.rotate(invertAngle);
      ctx.beginPath();
      ctx.arc(0, 0, size * 2, 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.restore();
    }

    // ── WIDEN indicator: orange rings on player
    if (player.widenTimer > 0) {
      ctx.save();
      const widenPulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.02);
      ctx.strokeStyle = '#ff5500';
      ctx.lineWidth   = 2;
      ctx.shadowColor = '#ff5500';
      ctx.shadowBlur  = 8;
      ctx.globalAlpha = 0.5 + widenPulse * 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, size * 2.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── Boost flame (behind bike)
    if (player.isBoosting || player.surgeTimer > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const flameColor = player.surgeTimer > 0 ? '#ffff00' : player.color;
      const flameLen   = player.surgeTimer > 0 ? size * 5 : size * 3;
      const grad = ctx.createLinearGradient(-flameLen, 0, 0, 0);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(1, flameColor);
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(-flameLen, -size * 0.6);
      ctx.lineTo(0, 0);
      ctx.lineTo(-flameLen,  size * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ── Bike body (diamond shape)
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowColor = player.color;
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = player.color;
    ctx.beginPath();
    ctx.moveTo( size,  0);
    ctx.lineTo( 0, -size * 0.6);
    ctx.lineTo(-size,  0);
    ctx.lineTo( 0,  size * 0.6);
    ctx.closePath();
    ctx.fill();

    // ── White core dot
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawPowerup(ctx) {
    const { pos, pulse, def, radius } = this.powerup;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const scale = 1 + Math.sin(pulse) * 0.15;
    const alpha = 0.7 + Math.sin(pulse * 1.3) * 0.3;

    ctx.translate(pos.x, pos.y);
    ctx.scale(scale, scale);

    // Outer rotating arc (positive = full circle; negative = broken ring)
    ctx.save();
    if (!def.positive) {
      ctx.rotate(pulse * 1.5);   // spin for negative powerups
    }
    ctx.strokeStyle = def.color;
    ctx.lineWidth   = 3;
    ctx.shadowColor = def.color;
    ctx.shadowBlur  = 22;
    ctx.globalAlpha = alpha * 0.55;
    ctx.beginPath();
    if (def.positive) {
      ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
    } else {
      // Broken ring for negative: two arcs
      ctx.arc(0, 0, radius * 1.5, 0,       Math.PI * 1.3);
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius * 1.5, Math.PI * 1.6, Math.PI * 2.0);
    }
    ctx.stroke();
    ctx.restore();

    // Inner filled disc
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, def.positive ? 'rgba(255,255,255,0.35)' : 'rgba(255,80,0,0.2)');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle   = gradient;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Icon label
    ctx.globalAlpha = 1;
    ctx.fillStyle   = def.color;
    ctx.shadowColor = def.color;
    ctx.shadowBlur  = 14;
    ctx.font        = 'bold 15px Orbitron, sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, 0, 1);

    // Positive/negative indicator dot below icon
    ctx.font        = '7px Orbitron, sans-serif';
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = def.positive ? '#39ff14' : '#ff3300';
    ctx.shadowColor = def.positive ? '#39ff14' : '#ff3300';
    ctx.fillText(def.positive ? '+' : '−', 0, radius * 0.78);

    ctx.restore();
  }

  // ============================================================
  // HUD
  // ============================================================
  _drawHUD(ctx) {
    const pad  = 12;
    const barW = 80;
    const barH = 8;

    this.players.forEach((p, i) => {
      const isRight  = i % 2 === 1;
      const isBottom = i >= 2;
      const x = isRight ? this.width - pad - barW - 40 : pad;
      const y = isBottom ? this.height - pad - 52 : pad;

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';

      // Player label + score
      ctx.font         = 'bold 11px Orbitron, sans-serif';
      ctx.fillStyle    = p.color;
      ctx.shadowColor  = p.color;
      ctx.shadowBlur   = 8;
      ctx.textAlign    = isRight ? 'right' : 'left';
      ctx.textBaseline = 'top';
      const label = ['P1', 'P2', 'P3', 'P4'][i];
      ctx.fillText(
        `${label}: ${this.scores[p.key] || 0}`,
        isRight ? x + barW + 40 : x + barW + 44,
        y
      );

      if (!p.alive) {
        ctx.globalAlpha = 0.4;
        ctx.fillText('✕', isRight ? x + barW + 40 - 48 : x + barW + 44 + 48, y);
        ctx.globalAlpha = 1;
      }

      // Boost bar background
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x, y + 16, barW, barH);

      // Boost bar fill
      const boostColor = p.surgeTimer > 0 ? '#ffff00'
                        : p.isBoosting    ? '#ffffff'
                        : p.color;
      ctx.fillStyle   = boostColor;
      ctx.shadowColor = boostColor;
      ctx.shadowBlur  = 6;
      ctx.fillRect(x, y + 16, barW * (p.boostGauge / 100), barH);

      // Active effect label
      if (p.activeEffect) {
        // Determine label color
        const isNegative = p.activeEffect.includes('WIDE') || p.activeEffect.includes('FLIP');
        const effectColor = p.surgeTimer > 0 ? '#ffff00'
                          : p.ghostTimer > 0  ? '#00f0ff'
                          : p.phaserActive     ? '#ffffff'
                          : '#ff5500';

        ctx.font      = 'bold 8px Orbitron, sans-serif';
        ctx.fillStyle = effectColor;
        ctx.shadowColor = effectColor;
        ctx.shadowBlur  = 10;
        ctx.fillText(
          p.activeEffect,
          isRight ? x + barW + 40 : x + barW + 44,
          y + 18
        );
      }

      // Effect timer bars (one per active effect, stacked)
      let barOffset = 28;

      if (p.ghostTimer > 0) {
        this._drawTimerBar(ctx, x, y + barOffset, barW, 4, p.ghostTimer / 180, '#00f0ff');
        barOffset += 8;
      }
      if (p.surgeTimer > 0) {
        this._drawTimerBar(ctx, x, y + barOffset, barW, 4, p.surgeTimer / 120, '#ffff00');
        barOffset += 8;
      }
      if (p.widenTimer > 0) {
        this._drawTimerBar(ctx, x, y + barOffset, barW, 4, p.widenTimer / 300, '#ff5500');
        barOffset += 8;
      }
      if (p.invertTimer > 0) {
        this._drawTimerBar(ctx, x, y + barOffset, barW, 4, p.invertTimer / 180, '#ff00ff');
        barOffset += 8;
      }

      ctx.restore();
    });

    // Center: alive racer count + powerup legend
    const aliveCount = this.players.filter(p => p.alive).length;
    ctx.save();
    ctx.font         = 'bold 13px Orbitron, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = 'rgba(255,255,255,0.4)';
    ctx.fillText(`RACERS: ${aliveCount}`, this.width / 2, 14);
    ctx.restore();
  }

  _drawTimerBar(ctx, x, y, w, h, pct, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 4;
    ctx.fillRect(x, y, w * Math.max(0, pct), h);
    ctx.shadowBlur = 0;
  }

  // ============================================================
  // NETWORK STATE SYNC
  // ============================================================
  getState() {
    return {
      players: this.players.map(p => ({
        key:          p.key,
        alive:        p.alive,
        posX:         p.pos.x,
        posY:         p.pos.y,
        dirX:         p.dir.x,
        dirY:         p.dir.y,
        boostGauge:   p.boostGauge,
        isBoosting:   p.isBoosting,
        phaserActive: p.phaserActive,
        ghostTimer:   p.ghostTimer,
        surgeTimer:   p.surgeTimer,
        widenTimer:   p.widenTimer,
        invertTimer:  p.invertTimer,
        trail: p.trail.slice(-200).map(s => ({ x: s.x, y: s.y, age: s.age || 0, w: s.w || this.baseTrailWidth }))
      })),
      powerup: {
        active:  this.powerup.active,
        x:       this.powerup.pos.x,
        y:       this.powerup.pos.y,
        pulse:   this.powerup.pulse,
        defType: this.powerup.def ? this.powerup.def.type : 'PHASER'
      },
      roundEnded:    this.roundEnded,
      roundEndTimer: this.roundEndTimer
    };
  }

  applyNetworkState(state) {
    if (!state) return;

    state.players.forEach((sp, i) => {
      const p = this.players[i];
      if (!p) return;
      p.alive        = sp.alive;
      p.pos.set(sp.posX, sp.posY);
      p.dir.set(sp.dirX, sp.dirY);
      p.boostGauge   = sp.boostGauge;
      p.isBoosting   = sp.isBoosting;
      p.phaserActive = sp.phaserActive;
      p.ghostTimer   = sp.ghostTimer  || 0;
      p.surgeTimer   = sp.surgeTimer  || 0;
      p.widenTimer   = sp.widenTimer  || 0;
      p.invertTimer  = sp.invertTimer || 0;
      p.trail = (sp.trail || []).map(s => ({ x: s.x, y: s.y, age: s.age || 0, w: s.w || this.baseTrailWidth }));
    });

    if (state.powerup) {
      this.powerup.active = state.powerup.active;
      this.powerup.pos.set(state.powerup.x, state.powerup.y);
      this.powerup.pulse  = state.powerup.pulse;
      if (state.powerup.defType) {
        this.powerup.def = POWERUP_DEFS.find(d => d.type === state.powerup.defType) || POWERUP_DEFS[0];
      }
    }
    this.roundEnded    = state.roundEnded;
    this.roundEndTimer = state.roundEndTimer;
  }

  cleanup() {}
}

// Utility: blend two hex colors by ratio t (0=c1, 1=c2)
function _blendColors(c1, c2, t) {
  const h = s => parseInt(s, 16);
  const r1 = h(c1.slice(1, 3)), g1 = h(c1.slice(3, 5)), b1 = h(c1.slice(5, 7));
  const r2 = h(c2.slice(1, 3)), g2 = h(c2.slice(3, 5)), b2 = h(c2.slice(5, 7));
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}
