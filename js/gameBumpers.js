import { Vector2D, ParticleSystem, triggerScreenShake } from './engine.js';
import { audio } from './audio.js';

export default class GameBumpers {
  constructor(canvas, input, onGameOver, mods = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.onGameOver = onGameOver;
    this.mods = mods;

    this.particles = new ParticleSystem();

    // Canvas sizes
    this.width = 800;
    this.height = 500;
    
    // Core Arena Physics
    this.center = new Vector2D(this.width / 2, this.height / 2);
    this.baseRingRadius = 230;
    this.ringRadius = this.baseRingRadius;
    this.ringColor = '#9d4edd';
    this.maxScore = 5;
    
    this.is3P = this.mods.playerMode === 3;
    this.is4P = this.mods.playerMode === 4;
    this.scores = this.is4P ? { p1: 0, p2: 0, p3: 0, p4: 0 } : (this.is3P ? { p1: 0, p2: 0, p3: 0 } : { p1: 0, p2: 0 });
    this.winner = null;
    this.paused = false;
    this.roundTime = 0;
    this.roundEnded = false;

    // Apply Modifiers
    const speedMult = mods.turbo ? 1.4 : 1.0;
    const frictionVal = mods.lunar ? 0.985 : 0.955;
    const vehicleRadius = mods.chaos ? 44 : 22;
    const vehicleMass = mods.chaos ? 4.0 : 1.0;

    // Player 1 hovercraft
    this.p1 = {
      pos: new Vector2D(0, 0),
      vel: new Vector2D(0, 0),
      radius: vehicleRadius,
      mass: vehicleMass,
      baseMass: vehicleMass,
      color: '#00f0ff',
      accel: 0.35 * speedMult,
      friction: frictionVal,
      boostGauge: 100,
      boostCost: 35,
      isBoosting: false,
      boostTimer: 0,
      shieldExpand: 0,
      eliminated: false,
      activePowerup: null,
      powerupTimer: 0,
      key: 'p1'
    };

    // Player 2 hovercraft
    this.p2 = {
      pos: new Vector2D(0, 0),
      vel: new Vector2D(0, 0),
      radius: vehicleRadius,
      mass: vehicleMass,
      baseMass: vehicleMass,
      color: '#ff007f',
      accel: 0.35 * speedMult,
      friction: frictionVal,
      boostGauge: 100,
      boostCost: 35,
      isBoosting: false,
      boostTimer: 0,
      shieldExpand: 0,
      eliminated: false,
      activePowerup: null,
      powerupTimer: 0,
      key: 'p2'
    };

    // Player 3 hovercraft (Yellow Spark)
    if (this.is3P || this.is4P) {
      this.p3 = {
        pos: new Vector2D(0, 0),
        vel: new Vector2D(0, 0),
        radius: vehicleRadius,
        mass: vehicleMass,
        baseMass: vehicleMass,
        color: '#ffff00',
        accel: 0.35 * speedMult,
        friction: frictionVal,
        boostGauge: 100,
        boostCost: 35,
        isBoosting: false,
        boostTimer: 0,
        shieldExpand: 0,
        eliminated: false,
        activePowerup: null,
        powerupTimer: 0,
        key: 'p3'
      };
    }

    // Player 4 hovercraft (Green Vapor)
    if (this.is4P) {
      this.p4 = {
        pos: new Vector2D(0, 0),
        vel: new Vector2D(0, 0),
        radius: vehicleRadius,
        mass: vehicleMass,
        baseMass: vehicleMass,
        color: '#39ff14',
        accel: 0.35 * speedMult,
        friction: frictionVal,
        boostGauge: 100,
        boostCost: 35,
        isBoosting: false,
        boostTimer: 0,
        shieldExpand: 0,
        eliminated: false,
        activePowerup: null,
        powerupTimer: 0,
        key: 'p4'
      };
    }

    this.powerup = {
      pos: new Vector2D(0, 0),
      type: null,
      active: false,
      radius: 24,
      pulse: 0,
      spawnTimer: 180
    };
    
    // Black Hole Mode
    this.blackHoleMode = !!mods.blackhole;
    this.blackHoleCenter = new Vector2D(this.width / 2, this.height / 2);
    this.blackHolePulse = 0;

    this.resetRound();
  }

  /**
   * Resets positions for a new round without resetting total scores.
   */
  resetRound() {
    this.p1.vel.set(0, 0);
    this.p1.boostGauge = 100;
    this.p1.shieldExpand = 0;
    this.p1.eliminated = false;

    this.p2.vel.set(0, 0);
    this.p2.boostGauge = 100;
    this.p2.shieldExpand = 0;
    this.p2.eliminated = false;

    if (this.is4P) {
      this.p3.vel.set(0, 0);
      this.p3.boostGauge = 100;
      this.p3.shieldExpand = 0;
      this.p3.eliminated = false;

      this.p4.vel.set(0, 0);
      this.p4.boostGauge = 100;
      this.p4.shieldExpand = 0;
      this.p4.eliminated = false;

      // Square layout centered on ring
      this.p1.pos.set(this.width / 2 - 110, this.height / 2 - 110);
      this.p2.pos.set(this.width / 2 + 110, this.height / 2 - 110);
      this.p3.pos.set(this.width / 2 - 110, this.height / 2 + 110);
      this.p4.pos.set(this.width / 2 + 110, this.height / 2 + 110);
    } else if (this.is3P) {
      this.p3.vel.set(0, 0);
      this.p3.boostGauge = 100;
      this.p3.shieldExpand = 0;
      this.p3.eliminated = false;

      // Equilateral triangle layout centered on ring
      this.p1.pos.set(this.width / 2 - 120, this.height / 2 - 60);
      this.p2.pos.set(this.width / 2 + 120, this.height / 2 - 60);
      this.p3.pos.set(this.width / 2, this.height / 2 + 110);
    } else {
      // 2P standard spawn offsets
      const startOffset = this.mods.chaos ? 160 : 140;
      this.p1.pos.set(this.width / 2 - startOffset, this.height / 2);
      this.p2.pos.set(this.width / 2 + startOffset, this.height / 2);
    }

    this.ringRadius = this.baseRingRadius;
    this.roundTime = 0;
    this.roundEnded = false;
    this.powerup.active = false;
    this.powerup.spawnTimer = 180;
    this.particles.clear();
  }

  /**
   * Applies control inputs, hover mechanics, and boost surges.
   */
  updatePlayers() {
    if (this.roundEnded) return;

    // --- PLAYER 1 CONTROLS (WASD + Space) ---
    if (!this.p1.eliminated) {
      let p1Force = new Vector2D(0, 0);
      if (this.input.isPressed('KeyW') || this.input.isPressed('w')) p1Force.y -= 1;
      if (this.input.isPressed('KeyS') || this.input.isPressed('s')) p1Force.y += 1;
      if (this.input.isPressed('KeyA') || this.input.isPressed('a')) p1Force.x -= 1;
      if (this.input.isPressed('KeyD') || this.input.isPressed('d')) p1Force.x += 1;

      if (p1Force.mag() > 0) {
        p1Force.normalise().mult(this.p1.accel);
        this.p1.vel.add(p1Force);
      }

      if (this.input.isPressed('Space')) {
        if (this.p1.boostGauge >= this.p1.boostCost && !this.p1.isBoosting) {
          this.p1.isBoosting = true;
          this.p1.boostGauge -= this.p1.boostCost;
          this.p1.boostTimer = 12;
          this.p1.shieldExpand = 20;
          
          let boostDir = p1Force.copy();
          if (boostDir.mag() === 0) boostDir = this.p1.vel.copy();
          if (boostDir.mag() === 0) boostDir.set(-1, 0);

          const boostPower = this.mods.turbo ? 12 : 8.5;
          boostDir.normalise().mult(boostPower);
          this.p1.vel.add(boostDir);

          audio.playBoost();
          triggerScreenShake();
          this.particles.spawnExplosion(this.p1.pos.x, this.p1.pos.y, '#00f0ff', 15, 1.2);
        }
      } else {
        this.p1.isBoosting = false;
      }

      if (this.p1.boostTimer > 0) {
        this.p1.boostTimer--;
        this.particles.spawnExplosion(this.p1.pos.x, this.p1.pos.y, '#ffffff', 2, 0.4);
      }
      if (this.p1.boostGauge < 100) this.p1.boostGauge = Math.min(100, this.p1.boostGauge + 0.35);
      if (this.p1.shieldExpand > 0) this.p1.shieldExpand -= 1.2;

      this.p1.vel.mult(this.p1.friction);
      this.p1.pos.add(this.p1.vel);
    }

    // --- PLAYER 2 CONTROLS (Arrows + Enter) ---
    if (!this.p2.eliminated) {
      let p2Force = new Vector2D(0, 0);
      if (this.input.isPressed('ArrowUp')) p2Force.y -= 1;
      if (this.input.isPressed('ArrowDown')) p2Force.y += 1;
      if (this.input.isPressed('ArrowLeft')) p2Force.x -= 1;
      if (this.input.isPressed('ArrowRight')) p2Force.x += 1;

      if (p2Force.mag() > 0) {
        p2Force.normalise().mult(this.p2.accel);
        this.p2.vel.add(p2Force);
      }

      if (this.input.isPressed('Enter')) {
        if (this.p2.boostGauge >= this.p2.boostCost && !this.p2.isBoosting) {
          this.p2.isBoosting = true;
          this.p2.boostGauge -= this.p2.boostCost;
          this.p2.boostTimer = 12;
          this.p2.shieldExpand = 20;

          let boostDir = p2Force.copy();
          if (boostDir.mag() === 0) boostDir = this.p2.vel.copy();
          if (boostDir.mag() === 0) boostDir.set(1, 0);

          const boostPower = this.mods.turbo ? 12 : 8.5;
          boostDir.normalise().mult(boostPower);
          this.p2.vel.add(boostDir);

          audio.playBoost();
          triggerScreenShake();
          this.particles.spawnExplosion(this.p2.pos.x, this.p2.pos.y, '#ff007f', 15, 1.2);
        }
      } else {
        this.p2.isBoosting = false;
      }

      if (this.p2.boostTimer > 0) {
        this.p2.boostTimer--;
        this.particles.spawnExplosion(this.p2.pos.x, this.p2.pos.y, '#ffffff', 2, 0.4);
      }
      if (this.p2.boostGauge < 100) this.p2.boostGauge = Math.min(100, this.p2.boostGauge + 0.35);
      if (this.p2.shieldExpand > 0) this.p2.shieldExpand -= 1.2;

      this.p2.vel.mult(this.p2.friction);
      this.p2.pos.add(this.p2.vel);
    }

    // --- PLAYER 3 CONTROLS (IJKL + KeyU) ---
    // --- PLAYER 3 CONTROLS (IJKL + KeyU) ---
    if ((this.is3P || this.is4P) && !this.p3.eliminated) {
      let p3Force = new Vector2D(0, 0);
      if (this.input.isPressed('KeyI') || this.input.isPressed('i')) p3Force.y -= 1;
      if (this.input.isPressed('KeyK') || this.input.isPressed('k')) p3Force.y += 1;
      if (this.input.isPressed('KeyJ') || this.input.isPressed('j')) p3Force.x -= 1;
      if (this.input.isPressed('KeyL') || this.input.isPressed('l')) p3Force.x += 1;

      if (p3Force.mag() > 0) {
        p3Force.normalise().mult(this.p3.accel);
        this.p3.vel.add(p3Force);
      }

      if (this.input.isPressed('KeyU') || this.input.isPressed('u')) {
        if (this.p3.boostGauge >= this.p3.boostCost && !this.p3.isBoosting) {
          this.p3.isBoosting = true;
          this.p3.boostGauge -= this.p3.boostCost;
          this.p3.boostTimer = 12;
          this.p3.shieldExpand = 20;

          let boostDir = p3Force.copy();
          if (boostDir.mag() === 0) boostDir = this.p3.vel.copy();
          if (boostDir.mag() === 0) boostDir.set(0, 1);

          const boostPower = this.mods.turbo ? 12 : 8.5;
          boostDir.normalise().mult(boostPower);
          this.p3.vel.add(boostDir);

          audio.playBoost();
          triggerScreenShake();
          this.particles.spawnExplosion(this.p3.pos.x, this.p3.pos.y, '#ffff00', 15, 1.2);
        }
      } else {
        this.p3.isBoosting = false;
      }

      if (this.p3.boostTimer > 0) {
        this.p3.boostTimer--;
        this.particles.spawnExplosion(this.p3.pos.x, this.p3.pos.y, '#ffffff', 2, 0.4);
      }
      if (this.p3.boostGauge < 100) this.p3.boostGauge = Math.min(100, this.p3.boostGauge + 0.35);
      if (this.p3.shieldExpand > 0) this.p3.shieldExpand -= 1.2;

      this.p3.vel.mult(this.p3.friction);
      this.p3.pos.add(this.p3.vel);
    }

    // --- PLAYER 4 CONTROLS (TFGH + KeyY) ---
    if (this.is4P && !this.p4.eliminated) {
      let p4Force = new Vector2D(0, 0);
      if (this.input.isPressed('KeyT') || this.input.isPressed('t')) p4Force.y -= 1;
      if (this.input.isPressed('KeyG') || this.input.isPressed('g')) p4Force.y += 1;
      if (this.input.isPressed('KeyF') || this.input.isPressed('f')) p4Force.x -= 1;
      if (this.input.isPressed('KeyH') || this.input.isPressed('h')) p4Force.x += 1;

      if (p4Force.mag() > 0) {
        p4Force.normalise().mult(this.p4.accel);
        this.p4.vel.add(p4Force);
      }

      if (this.input.isPressed('KeyY') || this.input.isPressed('y')) {
        if (this.p4.boostGauge >= this.p4.boostCost && !this.p4.isBoosting) {
          this.p4.isBoosting = true;
          this.p4.boostGauge -= this.p4.boostCost;
          this.p4.boostTimer = 12;
          this.p4.shieldExpand = 20;

          let boostDir = p4Force.copy();
          if (boostDir.mag() === 0) boostDir = this.p4.vel.copy();
          if (boostDir.mag() === 0) boostDir.set(0, 1);

          const boostPower = this.mods.turbo ? 12 : 8.5;
          boostDir.normalise().mult(boostPower);
          this.p4.vel.add(boostDir);

          audio.playBoost();
          triggerScreenShake();
          this.particles.spawnExplosion(this.p4.pos.x, this.p4.pos.y, '#39ff14', 15, 1.2);
        }
      } else {
        this.p4.isBoosting = false;
      }

      if (this.p4.boostTimer > 0) {
        this.p4.boostTimer--;
        this.particles.spawnExplosion(this.p4.pos.x, this.p4.pos.y, '#ffffff', 2, 0.4);
      }
      if (this.p4.boostGauge < 100) this.p4.boostGauge = Math.min(100, this.p4.boostGauge + 0.35);
      if (this.p4.shieldExpand > 0) this.p4.shieldExpand -= 1.2;

      this.p4.vel.mult(this.p4.friction);
      this.p4.pos.add(this.p4.vel);
    }

    // Update active powerups on players
    const playersList = this.is4P ? [this.p1, this.p2, this.p3, this.p4] : (this.is3P ? [this.p1, this.p2, this.p3] : [this.p1, this.p2]);
    playersList.forEach(p => {
      if (p.activePowerup) {
        p.powerupTimer--;
        if (p.powerupTimer <= 0) {
          this.deactivatePowerup(p);
        }
      }
      
      // Apply Black Hole gravity
      if (this.blackHoleMode && !p.eliminated) {
        const dist = p.pos.dist(this.blackHoleCenter);
        if (dist > 10) {
          // Pull gets slightly stronger the closer you are
          const pullStrength = Math.min(0.8, 30 / dist);
          const pullForce = this.blackHoleCenter.copy().sub(p.pos).normalise().mult(pullStrength);
          p.vel.add(pullForce);
        }
      }
    });
  }

  /**
   * Circle-circle rigid body elastic collisions with vector impulse transfer.
   */
  resolveCollisions() {
    if (this.roundEnded) return;

    if (this.is4P) {
      if (!this.p1.eliminated && !this.p2.eliminated) this.resolvePairwiseCollision(this.p1, this.p2);
      if (!this.p1.eliminated && !this.p3.eliminated) this.resolvePairwiseCollision(this.p1, this.p3);
      if (!this.p1.eliminated && !this.p4.eliminated) this.resolvePairwiseCollision(this.p1, this.p4);
      if (!this.p2.eliminated && !this.p3.eliminated) this.resolvePairwiseCollision(this.p2, this.p3);
      if (!this.p2.eliminated && !this.p4.eliminated) this.resolvePairwiseCollision(this.p2, this.p4);
      if (!this.p3.eliminated && !this.p4.eliminated) this.resolvePairwiseCollision(this.p3, this.p4);
    } else if (this.is3P) {
      if (!this.p1.eliminated && !this.p2.eliminated) this.resolvePairwiseCollision(this.p1, this.p2);
      if (!this.p2.eliminated && !this.p3.eliminated) this.resolvePairwiseCollision(this.p2, this.p3);
      if (!this.p3.eliminated && !this.p1.eliminated) this.resolvePairwiseCollision(this.p3, this.p1);
    } else {
      if (!this.p1.eliminated && !this.p2.eliminated) this.resolvePairwiseCollision(this.p1, this.p2);
    }
  }

  resolvePairwiseCollision(p1, p2) {
    const diff = p2.pos.copy().sub(p1.pos);
    const dist = diff.mag();
    const minDist = p1.radius + p2.radius;

    if (dist < minDist) {
      const overlap = minDist - dist;
      const normal = diff.copy().normalise();

      p1.pos.sub(normal.copy().mult(overlap / 2));
      p2.pos.add(normal.copy().mult(overlap / 2));

      const relVel = p2.vel.copy().sub(p1.vel);
      const velAlongNormal = relVel.dot(normal);

      if (velAlongNormal < 0) {
        const e = this.mods.chaos ? 1.0 : 1.15;
        const j = -(1 + e) * velAlongNormal / (1 / p1.mass + 1 / p2.mass);
        const impulse = normal.copy().mult(j);

        p1.vel.sub(impulse.copy().div(p1.mass));
        p2.vel.add(impulse.copy().div(p2.mass));

        p1.shieldExpand = 12;
        p2.shieldExpand = 12;

        const impactForce = Math.abs(velAlongNormal);
        audio.playBounce();

        if (impactForce > 4) {
          triggerScreenShake();
          audio.playExplosion();
          this.particles.spawnExplosion(
            p1.pos.x + normal.x * p1.radius,
            p1.pos.y + normal.y * p1.radius,
            '#ffffff',
            25,
            1.5
          );
        } else {
          this.particles.spawnExplosion(
            p1.pos.x + normal.x * p1.radius,
            p1.pos.y + normal.y * p1.radius,
            '#e0aaff',
            10,
            0.6
          );
        }
      }
    }
  }

  /**
   * Shrinks ring radius over time. Checks if players are outside boundaries.
   */
  updateArena() {
    if (this.roundEnded) return;

    this.roundTime++;

    if (this.roundTime > 180) {
      const shrinkSpeed = this.mods.turbo ? 0.35 : 0.22;
      this.ringRadius = Math.max(75, this.baseRingRadius - (this.roundTime - 180) * shrinkSpeed);
      this.ringColor = this.roundTime % 20 < 10 ? '#ff5e00' : '#ff0055';
    } else {
      this.ringColor = '#9d4edd';
    }

    // Boundary Out check
    if (!this.p1.eliminated && this.p1.pos.dist(this.center) > this.ringRadius) {
      this.eliminatePlayer(this.p1);
    }
    if (!this.p2.eliminated && this.p2.pos.dist(this.center) > this.ringRadius) {
      this.eliminatePlayer(this.p2);
    }
    if ((this.is3P || this.is4P) && !this.p3.eliminated && this.p3.pos.dist(this.center) > this.ringRadius) {
      this.eliminatePlayer(this.p3);
    }
    if (this.is4P && !this.p4.eliminated && this.p4.pos.dist(this.center) > this.ringRadius) {
      this.eliminatePlayer(this.p4);
    }
  }

  updatePowerups() {
    if (this.roundEnded) return;

    if (this.powerup.active) {
      this.powerup.pulse += 0.05;
      
      const playersList = this.is4P ? [this.p1, this.p2, this.p3, this.p4] : (this.is3P ? [this.p1, this.p2, this.p3] : [this.p1, this.p2]);
      for (const p of playersList) {
        if (!p.eliminated && p.pos.dist(this.powerup.pos) < p.radius + this.powerup.radius) {
          this.activatePowerupEffect(p);
          break;
        }
      }
    } else {
      this.powerup.spawnTimer--;
      if (this.powerup.spawnTimer <= 0) {
        this.spawnPowerup();
      }
    }
  }

  spawnPowerup() {
    const types = ['MASSIVE', 'GHOST', 'OVERCHARGE'];
    this.powerup.type = types[Math.floor(Math.random() * types.length)];
    
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (this.ringRadius - 50);
    this.powerup.pos.set(this.center.x + Math.cos(angle) * dist, this.center.y + Math.sin(angle) * dist);
    
    this.powerup.active = true;
    this.powerup.pulse = 0;
    audio.playPowerup();
    
    const color = this.powerup.type === 'GHOST' ? '#ff3333' : '#39ff14';
    this.particles.spawnExplosion(this.powerup.pos.x, this.powerup.pos.y, color, 15, 0.5);
  }

  activatePowerupEffect(player) {
    this.powerup.active = false;
    this.powerup.spawnTimer = 300 + Math.random() * 240;

    audio.playPowerupUse();
    const isTroll = this.powerup.type === 'GHOST';
    const effectColor = isTroll ? '#ff3333' : '#39ff14';
    this.particles.spawnExplosion(this.powerup.pos.x, this.powerup.pos.y, effectColor, 20, 1.2);

    this.deactivatePowerup(player); // Clear existing
    player.activePowerup = this.powerup.type;
    player.powerupTimer = 300;

    if (this.powerup.type === 'MASSIVE') {
      player.mass = player.baseMass * 3;
      player.radius = player.radius * 1.5;
    } else if (this.powerup.type === 'GHOST') {
      player.mass = player.baseMass * 0.1;
      player.friction = 0.999;
    } else if (this.powerup.type === 'OVERCHARGE') {
      player.boostGauge = 100;
      player.boostCost = 0;
    }
  }

  deactivatePowerup(player) {
    if (player.activePowerup === 'MASSIVE') {
      player.mass = player.baseMass;
      player.radius = player.radius / 1.5;
    } else if (player.activePowerup === 'GHOST') {
      player.mass = player.baseMass;
      player.friction = this.mods.lunar ? 0.985 : 0.955;
    } else if (player.activePowerup === 'OVERCHARGE') {
      player.boostCost = 35;
    }
    player.activePowerup = null;
  }

  /**
   * Eliminates a player, checks win caps, starts next round.
   */
  eliminatePlayer(player) {
    player.eliminated = true;

    audio.playExplosion();
    triggerScreenShake();
    this.particles.spawnExplosion(player.pos.x, player.pos.y, player.color, 45, 2.5);

    // Re-evaluate round state survivors
    const activeSurvivors = [];
    if (!this.p1.eliminated) activeSurvivors.push(this.p1);
    if (!this.p2.eliminated) activeSurvivors.push(this.p2);
    if ((this.is3P || this.is4P) && !this.p3.eliminated) activeSurvivors.push(this.p3);
    if (this.is4P && !this.p4.eliminated) activeSurvivors.push(this.p4);

    if (this.is3P || this.is4P) {
      if (activeSurvivors.length <= 1) {
        this.roundEnded = true;
        const winner = activeSurvivors.length === 1 ? activeSurvivors[0] : null;

        if (winner) {
          this.scores[winner.key]++;
        }

        setTimeout(() => {
          if (winner && this.scores[winner.key] >= this.maxScore) {
            this.winner = winner.key;
            audio.playVictory();
            const scoreParts = [this.scores.p1, this.scores.p2, this.scores.p3];
            if (this.is4P) scoreParts.push(this.scores.p4);
            this.onGameOver(winner.key, scoreParts.join(" - "));
          } else {
            this.resetRound();
          }
        }, 1500);
      }
    } else {
      // 2P original eliminate
      this.roundEnded = true;
      const winnerKey = player.key === 'p1' ? 'p2' : 'p1';
      this.scores[winnerKey]++;

      setTimeout(() => {
        if (this.scores[winnerKey] >= this.maxScore) {
          this.winner = winnerKey;
          audio.playVictory();
          this.onGameOver(winnerKey, `${this.scores.p1} - ${this.scores.p2}`);
        } else {
          this.resetRound();
        }
      }, 1500);
    }
  }

  /* ==========================================================================
     SIGNALING MULTIPLAYER STATE SYNC PROTOCOLS
     ========================================================================== */

  getState() {
    const state = {
      p1: {
        x: this.p1.pos.x,
        y: this.p1.pos.y,
        radius: this.p1.radius,
        velX: this.p1.vel.x,
        velY: this.p1.vel.y,
        boostGauge: this.p1.boostGauge,
        isBoosting: this.p1.isBoosting,
        shieldExpand: this.p1.shieldExpand,
        eliminated: this.p1.eliminated,
        activePowerup: this.p1.activePowerup,
        radius: this.p1.radius
      },
      p2: {
        x: this.p2.pos.x,
        y: this.p2.pos.y,
        radius: this.p2.radius,
        velX: this.p2.vel.x,
        velY: this.p2.vel.y,
        boostGauge: this.p2.boostGauge,
        isBoosting: this.p2.isBoosting,
        shieldExpand: this.p2.shieldExpand,
        eliminated: this.p2.eliminated,
        activePowerup: this.p2.activePowerup,
        radius: this.p2.radius
      },
      powerup: {
        active: this.powerup.active,
        x: this.powerup.pos.x,
        y: this.powerup.pos.y,
        type: this.powerup.type,
        pulse: this.powerup.pulse
      },
      ringRadius: this.ringRadius,
      ringColor: this.ringColor,
      roundTime: this.roundTime,
      roundEnded: this.roundEnded
    };

    if (this.is3P || this.is4P) {
      state.p3 = {
        x: this.p3.pos.x,
        y: this.p3.pos.y,
        radius: this.p3.radius,
        velX: this.p3.vel.x,
        velY: this.p3.vel.y,
        boostGauge: this.p3.boostGauge,
        isBoosting: this.p3.isBoosting,
        shieldExpand: this.p3.shieldExpand,
        eliminated: this.p3.eliminated,
        activePowerup: this.p3.activePowerup
      };
    }

    if (this.is4P) {
      state.p4 = {
        x: this.p4.pos.x,
        y: this.p4.pos.y,
        radius: this.p4.radius,
        velX: this.p4.vel.x,
        velY: this.p4.vel.y,
        boostGauge: this.p4.boostGauge,
        isBoosting: this.p4.isBoosting,
        shieldExpand: this.p4.shieldExpand,
        eliminated: this.p4.eliminated,
        activePowerup: this.p4.activePowerup
      };
    }

    return state;
  }

  applyNetworkState(state) {
    this.p1.pos.set(state.p1.x, state.p1.y);
    if (state.p1.radius) this.p1.radius = state.p1.radius;
    this.p1.vel.set(state.p1.velX, state.p1.velY);
    this.p1.boostGauge = state.p1.boostGauge;
    this.p1.isBoosting = state.p1.isBoosting;
    this.p1.shieldExpand = state.p1.shieldExpand;
    this.p1.eliminated = state.p1.eliminated;
    this.p1.activePowerup = state.p1.activePowerup;

    this.p2.pos.set(state.p2.x, state.p2.y);
    if (state.p2.radius) this.p2.radius = state.p2.radius;
    this.p2.vel.set(state.p2.velX, state.p2.velY);
    this.p2.boostGauge = state.p2.boostGauge;
    this.p2.isBoosting = state.p2.isBoosting;
    this.p2.shieldExpand = state.p2.shieldExpand;
    this.p2.eliminated = state.p2.eliminated;
    this.p2.activePowerup = state.p2.activePowerup;

    if ((this.is3P || this.is4P) && state.p3) {
      this.p3.pos.set(state.p3.x, state.p3.y);
      if (state.p3.radius) this.p3.radius = state.p3.radius;
      this.p3.vel.set(state.p3.velX, state.p3.velY);
      this.p3.boostGauge = state.p3.boostGauge;
      this.p3.isBoosting = state.p3.isBoosting;
      this.p3.shieldExpand = state.p3.shieldExpand;
      this.p3.eliminated = state.p3.eliminated;
      this.p3.activePowerup = state.p3.activePowerup;
    }

    if (this.is4P && state.p4) {
      this.p4.pos.set(state.p4.x, state.p4.y);
      if (state.p4.radius) this.p4.radius = state.p4.radius;
      this.p4.vel.set(state.p4.velX, state.p4.velY);
      this.p4.boostGauge = state.p4.boostGauge;
      this.p4.isBoosting = state.p4.isBoosting;
      this.p4.shieldExpand = state.p4.shieldExpand;
      this.p4.eliminated = state.p4.eliminated;
      this.p4.activePowerup = state.p4.activePowerup;
    }

    if (state.powerup) {
      this.powerup.active = state.powerup.active;
      if (state.powerup.active) {
        this.powerup.pos.set(state.powerup.x, state.powerup.y);
        this.powerup.type = state.powerup.type;
        this.powerup.pulse = state.powerup.pulse;
      }
    }

    this.ringRadius = state.ringRadius;
    this.ringColor = state.ringColor;
    this.roundTime = state.roundTime;
    this.roundEnded = state.roundEnded;
  }

  /* ==========================================================================
     CORE RENDERING LOOP
     ========================================================================== */

  render() {
    const ctx = this.ctx;

    ctx.fillStyle = '#04020a';
    ctx.fillRect(0, 0, this.width, this.height);

    // Inner mesh spirals
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let r = 50; r < 400; r += 50) {
      ctx.beginPath();
      ctx.arc(this.center.x, this.center.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    
    // Black Hole Visuals
    if (this.blackHoleMode) {
      this.blackHolePulse = (this.blackHolePulse + 0.1) % (Math.PI * 2);
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.center.x, this.center.y, 30 + Math.sin(this.blackHolePulse) * 5, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.shadowBlur = 30 + Math.sin(this.blackHolePulse) * 10;
      ctx.shadowColor = '#6a0dad';
      ctx.fill();
      ctx.strokeStyle = '#8a2be2';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // Shrinking Sumo ring boundary
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = this.ringColor;
    ctx.strokeStyle = this.ringColor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, this.ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (this.roundTime > 180 && !this.roundEnded) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 94, 0, 0.15)';
      ctx.font = 'bold 24px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('BORDER COLLAPSE IN PROGRESS', this.width / 2, 70);
      ctx.restore();
    }

    // Hovercraft vehicles render list
    const vehicles = this.is4P ? [this.p1, this.p2, this.p3, this.p4] : (this.is3P ? [this.p1, this.p2, this.p3] : [this.p1, this.p2]);
    vehicles.forEach(p => {
      if (p.eliminated) return;

      // Spawn local exhaust trail particles based on movement
      if (Math.random() < 0.3 && p.vel.mag() > 0.1) {
        const normVel = p.vel.copy().normalise();
        const exhaustX = p.pos.x - (normVel.x * p.radius);
        const exhaustY = p.pos.y - (normVel.y * p.radius);
        this.particles.spawnTrail(exhaustX, exhaustY, p.color);
      }

      if (p.shieldExpand > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = p.shieldExpand / 20;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.radius + p.shieldExpand, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.shadowBlur = 15;
      ctx.shadowColor = p.color;
      
      ctx.strokeStyle = p.color;
      ctx.fillStyle = 'rgba(13, 11, 26, 0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (p.vel.mag() > 0.2) {
        const angle = p.vel.heading();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(
          p.pos.x + Math.cos(angle) * (p.radius - 4),
          p.pos.y + Math.sin(angle) * (p.radius - 4),
          4,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.pos.x, p.pos.y);
        ctx.lineTo(p.pos.x + Math.cos(angle) * (p.radius + 30), p.pos.y + Math.sin(angle) * (p.radius + 30));
        ctx.stroke();
      }

      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.radius - 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Booster gauge under vehicle
      ctx.save();
      const gaugeWidth = p.radius * 1.5;
      const gaugeHeight = 4;
      const gx = p.pos.x - gaugeWidth / 2;
      const gy = p.pos.y + p.radius + 10;
      
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(gx, gy, gaugeWidth, gaugeHeight);
      
      ctx.fillStyle = p.boostGauge > 30 ? '#ffaa00' : '#ff0000';
      ctx.fillRect(gx, gy, gaugeWidth * (p.boostGauge / 100), gaugeHeight);
      
      // Draw active powerup indicator below gauge
      if (p.activePowerup) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Orbitron';
        ctx.textAlign = 'center';
        let sym = '';
        if (p.activePowerup === 'MASSIVE') sym = '➕';
        if (p.activePowerup === 'GHOST') sym = '👻';
        if (p.activePowerup === 'OVERCHARGE') sym = '⚡';
        ctx.fillText(sym, p.pos.x, gy + 15);

        ctx.fillStyle = p.color;
        ctx.font = 'bold 12px Orbitron';
        ctx.fillText(Math.ceil(p.powerupTimer / 60) + 's', p.pos.x, gy + 28);
      }
      ctx.restore();
    });

    if (this.powerup.active) {
      const scalePulse = 1 + Math.sin(this.powerup.pulse) * 0.15;
      const size = this.powerup.radius * scalePulse;

      const isTroll = this.powerup.type === 'GHOST';
      const orbColor = isTroll ? 'rgba(255, 51, 51, 0.3)' : 'rgba(57, 255, 20, 0.3)';
      const orbBorder = isTroll ? '#ff3333' : '#39ff14';

      ctx.save();
      ctx.shadowBlur = 15;
      ctx.shadowColor = orbBorder;
      ctx.fillStyle = orbColor;
      ctx.strokeStyle = orbBorder;
      ctx.lineWidth = 3;
      
      ctx.beginPath();
      ctx.arc(this.powerup.pos.x, this.powerup.pos.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Orbitron';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let sym = '★';
      if (this.powerup.type === 'MASSIVE') sym = '➕';
      if (this.powerup.type === 'GHOST') sym = '👻';
      if (this.powerup.type === 'OVERCHARGE') sym = '⚡';
      ctx.fillText(sym, this.powerup.pos.x, this.powerup.pos.y);
      ctx.restore();
    }

    this.particles.draw(ctx);

    // Background Score
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.font = '80px Orbitron';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    if (this.is4P) {
      ctx.fillText(`${this.scores.p1} - ${this.scores.p2} - ${this.scores.p3} - ${this.scores.p4}`, this.width / 2, this.height / 2);
    } else if (this.is3P) {
      ctx.fillText(`${this.scores.p1} - ${this.scores.p2} - ${this.scores.p3}`, this.width / 2, this.height / 2);
    } else {
      ctx.fillText(`${this.scores.p1} - ${this.scores.p2}`, this.width / 2, this.height / 2);
    }
    ctx.restore();
  }

  /**
   * Frame tick execution.
   */
  tick() {
    if (this.paused || this.winner) return;

    this.updatePlayers();
    this.resolveCollisions();
    this.updatePowerups();
    this.updateArena();
    this.particles.update();

    this.render();
  }
}
