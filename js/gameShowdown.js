import { Vector2D, ParticleSystem, triggerScreenShake } from './engine.js';
import { audio } from './audio.js';

export default class GameShowdown {
  constructor(canvas, input, onGameOver, mods = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.onGameOver = onGameOver;
    this.mods = mods;

    this.particles = new ParticleSystem();

    // Game Constants
    this.width = 800;
    this.height = 500;
    
    // Goal dimensions
    this.is3P = this.mods.playerMode === 3;
    this.is4P = this.mods.playerMode === 4;
    this.goalTop = (this.is3P || this.is4P) ? 50 : 150;
    this.goalBottom = (this.is3P || this.is4P) ? 200 : 350;
    this.maxScore = 5;

    // Scores
    this.scores = this.is4P ? { p1: 0, p2: 0, p3: 0, p4: 0 } : (this.is3P ? { p1: 0, p2: 0, p3: 0 } : { p1: 0, p2: 0 });
    this.winner = null;

    // Apply Modifiers
    const speedMult = mods.turbo ? 1.45 : 1.0;
    const puckSize = mods.chaos ? 24 : (mods.dvd ? 18 : 12);
    const frictionVal = mods.lunar ? 0.996 : 0.993; // Low drag on lunar

    // Entity Definitions
    // In 3P/4P: P1 is top-left
    const p1StartX = 120;
    const p1StartY = (this.is3P || this.is4P) ? this.height / 4 : this.height / 2;
    this.p1 = {
      pos: new Vector2D(p1StartX, p1StartY),
      prevPos: new Vector2D(p1StartX, p1StartY),
      vel: new Vector2D(0, 0),
      radius: 32,
      baseRadius: 32,
      color: '#00f0ff',
      speed: 6.5 * speedMult,
      baseSpeed: 6.5 * speedMult,
      invertedControls: false,
      powerupTimer: 0,
      activePowerup: null,
      externalForce: new Vector2D(0, 0)
    };

    // In 3P/4P: P2 is top-right
    const p2StartX = this.width - 120;
    const p2StartY = (this.is3P || this.is4P) ? this.height / 4 : this.height / 2;
    this.p2 = {
      pos: new Vector2D(p2StartX, p2StartY),
      prevPos: new Vector2D(p2StartX, p2StartY),
      vel: new Vector2D(0, 0),
      radius: 32,
      baseRadius: 32,
      color: '#ff007f',
      speed: 6.5 * speedMult,
      baseSpeed: 6.5 * speedMult,
      invertedControls: false,
      powerupTimer: 0,
      activePowerup: null,
      externalForce: new Vector2D(0, 0)
    };

    // P3 is bottom center in 3P, bottom left in 4P
    if (this.is3P || this.is4P) {
      const p3StartX = this.is4P ? 120 : this.width / 2;
      const p3StartY = this.is4P ? (this.height / 4) * 3 : this.height - 80;
      this.p3 = {
        pos: new Vector2D(p3StartX, p3StartY),
        prevPos: new Vector2D(p3StartX, p3StartY),
        vel: new Vector2D(0, 0),
        radius: 32,
        baseRadius: 32,
        color: '#ffff00',
        speed: 6.5 * speedMult,
        baseSpeed: 6.5 * speedMult,
        invertedControls: false,
        powerupTimer: 0,
        activePowerup: null,
        externalForce: new Vector2D(0, 0)
      };
    }

    // P4 is bottom right in 4P
    if (this.is4P) {
      const p4StartX = this.width - 120;
      const p4StartY = (this.height / 4) * 3;
      this.p4 = {
        pos: new Vector2D(p4StartX, p4StartY),
        prevPos: new Vector2D(p4StartX, p4StartY),
        vel: new Vector2D(0, 0),
        radius: 32,
        baseRadius: 32,
        color: '#39ff14',
        speed: 6.5 * speedMult,
        baseSpeed: 6.5 * speedMult,
        invertedControls: false,
        powerupTimer: 0,
        activePowerup: null,
        externalForce: new Vector2D(0, 0)
      };
    }

    this.puck = {
      pos: new Vector2D(this.width / 2, (this.is3P || this.is4P) ? this.height / 3 : this.height / 2),
      vel: new Vector2D(0, 0),
      radius: puckSize,
      baseMaxSpeed: 12 * speedMult,
      maxSpeed: 12 * speedMult,
      friction: frictionVal,
      lastTouchedBy: null,
      color: '#ffffff',
      trail: [],
      dvdColorIndex: 0
    };

    // Power-up State
    this.powerup = {
      pos: new Vector2D(0, 0),
      type: null, // 'SIZE', 'SPEED', 'SHIELD'
      active: false,
      radius: 18,
      pulse: 0,
      spawnTimer: 180
    };

    // Shields (active walls blocking portion of goal)
    this.shields = this.is4P ? { p1: false, p2: false, p3: false, p4: false } : (this.is3P ? { p1: false, p2: false, p3: false } : { p1: false, p2: false });

    // Bouncing DVD Screensaver setup
    this.dvdMode = !!mods.dvd;
    this.dvdImage = new Image();
    this.dvdImage.src = 'dvd_logo.png';
    this.dvdImageLoaded = false;
    this.dvdImage.onload = () => {
      this.dvdImageLoaded = true;
    };
    
    this.dvdColors = ['#00f0ff', '#ff007f', '#39ff14', '#ffaa00', '#9d4edd', '#ffffff', '#ff3333'];
    
    this.dvdOffscreen = document.createElement('canvas');
    this.dvdOctx = this.dvdOffscreen.getContext('2d');
    
    // Pinball Mode
    this.pinballMode = !!mods.pinball;
    this.pinballBumpers = [];
    if (this.pinballMode) {
      this.pinballBumpers = [
        { x: this.width / 2, y: this.height / 2 - 140, r: 18.75, glowColor: null, glowTimer: 0 },
        { x: this.width / 2, y: this.height / 2 + 140, r: 18.75, glowColor: null, glowTimer: 0 },
        { x: this.width / 2 - 90, y: this.height / 2, r: 18.75, glowColor: null, glowTimer: 0 },
        { x: this.width / 2 + 90, y: this.height / 2, r: 18.75, glowColor: null, glowTimer: 0 }
      ];
    }

    this.resetPuck(1);
    this.paused = false;
  }

  /**
   * Resets puck positions after a score or restart.
   */
  resetPuck(serveToPlayer) {
    this.puck.pos.set(this.width / 2, (this.is3P || this.is4P) ? this.height / 3 : this.height / 2);
    const speed = this.mods.turbo ? 6 : 4;
    
    let angle = 0;
    if (serveToPlayer === 1) angle = Math.PI * 0.75;
    else if (serveToPlayer === 2) angle = Math.PI * 0.25;
    else if (serveToPlayer === 3) angle = this.is4P ? -Math.PI * 0.75 : -Math.PI / 2;
    else if (serveToPlayer === 4) angle = -Math.PI * 0.25;
    else angle = Math.PI * 0.5;

    this.puck.vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.puck.lastTouchedBy = null;
    this.puck.maxSpeed = this.puck.baseMaxSpeed;
    this.puck.color = '#ffffff';
    this.puck.trail = [];
    this.puck.dvdColorIndex = 0;
  }

  /**
   * Handles keyboard controls and moves players.
   */
  updatePlayers() {
    // --- Player 1 controls (WASD) ---
    let p1Move = new Vector2D(0, 0);
    if (this.input.isPressed('KeyW') || this.input.isPressed('w')) p1Move.y -= 1;
    if (this.input.isPressed('KeyS') || this.input.isPressed('s')) p1Move.y += 1;
    if (this.input.isPressed('KeyA') || this.input.isPressed('a')) p1Move.x -= 1;
    if (this.input.isPressed('KeyD') || this.input.isPressed('d')) p1Move.x += 1;

    if (this.p1.invertedControls) p1Move.mult(-1);
    if (p1Move.mag() > 0) {
      p1Move.normalise().mult(this.p1.speed);
    }

    this.p1.prevPos.set(this.p1.pos.x, this.p1.pos.y);
    this.p1.pos.add(p1Move);
    this.p1.pos.add(this.p1.externalForce);
    this.p1.externalForce.mult(0.85);
    if (this.p1.externalForce.mag() < 0.1) this.p1.externalForce.set(0, 0);
    this.p1.vel.set(this.p1.pos.x - this.p1.prevPos.x, this.p1.pos.y - this.p1.prevPos.y);

    // Enforce Player 1 boundaries
    if (this.is3P || this.is4P) {
      // Top-Left Quadrant
      this.p1.pos.x = Math.max(this.p1.radius, Math.min(this.width / 2 - 10 - this.p1.radius, this.p1.pos.x));
      this.p1.pos.y = Math.max(this.p1.radius, Math.min(this.height / 2 - 10 - this.p1.radius, this.p1.pos.y));
    } else {
      // Left side split
      this.p1.pos.x = Math.max(this.p1.radius, Math.min(this.width / 2 - 10 - this.p1.radius, this.p1.pos.x));
      this.p1.pos.y = Math.max(this.p1.radius, Math.min(this.height - this.p1.radius, this.p1.pos.y));
    }

    // --- Player 2 controls (Arrow Keys) ---
    let p2Move = new Vector2D(0, 0);
    if (this.input.isPressed('ArrowUp')) p2Move.y -= 1;
    if (this.input.isPressed('ArrowDown')) p2Move.y += 1;
    if (this.input.isPressed('ArrowLeft')) p2Move.x -= 1;
    if (this.input.isPressed('ArrowRight')) p2Move.x += 1;

    if (this.p2.invertedControls) p2Move.mult(-1);
    if (p2Move.mag() > 0) {
      p2Move.normalise().mult(this.p2.speed);
    }

    this.p2.prevPos.set(this.p2.pos.x, this.p2.pos.y);
    this.p2.pos.add(p2Move);
    this.p2.pos.add(this.p2.externalForce);
    this.p2.externalForce.mult(0.85);
    if (this.p2.externalForce.mag() < 0.1) this.p2.externalForce.set(0, 0);
    this.p2.vel.set(this.p2.pos.x - this.p2.prevPos.x, this.p2.pos.y - this.p2.prevPos.y);

    // Enforce Player 2 boundaries
    if (this.is3P || this.is4P) {
      // Top-Right Quadrant
      this.p2.pos.x = Math.max(this.width / 2 + 10 + this.p2.radius, Math.min(this.width - this.p2.radius, this.p2.pos.x));
      this.p2.pos.y = Math.max(this.p2.radius, Math.min(this.height / 2 - 10 - this.p2.radius, this.p2.pos.y));
    } else {
      // Right side split
      this.p2.pos.x = Math.max(this.width / 2 + 10 + this.p2.radius, Math.min(this.width - this.p2.radius, this.p2.pos.x));
      this.p2.pos.y = Math.max(this.p2.radius, Math.min(this.height - this.p2.radius, this.p2.pos.y));
    }

    // --- Player 3 controls (IJKL) ---
    if (this.is3P || this.is4P) {
      let p3Move = new Vector2D(0, 0);
      if (this.input.isPressed('KeyI') || this.input.isPressed('i')) p3Move.y -= 1;
      if (this.input.isPressed('KeyK') || this.input.isPressed('k')) p3Move.y += 1;
      if (this.input.isPressed('KeyJ') || this.input.isPressed('j')) p3Move.x -= 1;
      if (this.input.isPressed('KeyL') || this.input.isPressed('l')) p3Move.x += 1;

      if (this.p3.invertedControls) p3Move.mult(-1);
      if (p3Move.mag() > 0) {
        p3Move.normalise().mult(this.p3.speed);
      }

      this.p3.prevPos.set(this.p3.pos.x, this.p3.pos.y);
      this.p3.pos.add(p3Move);
      this.p3.pos.add(this.p3.externalForce);
      this.p3.externalForce.mult(0.85);
      if (this.p3.externalForce.mag() < 0.1) this.p3.externalForce.set(0, 0);
      this.p3.vel.set(this.p3.pos.x - this.p3.prevPos.x, this.p3.pos.y - this.p3.prevPos.y);

      // Enforce P3 boundaries
      if (this.is4P) {
        // Bottom-Left Quadrant
        this.p3.pos.x = Math.max(this.p3.radius, Math.min(this.width / 2 - 10 - this.p3.radius, this.p3.pos.x));
        this.p3.pos.y = Math.max(this.height / 2 + 10 + this.p3.radius, Math.min(this.height - this.p3.radius, this.p3.pos.y));
      } else {
        // Bottom half
        this.p3.pos.x = Math.max(this.p3.radius, Math.min(this.width - this.p3.radius, this.p3.pos.x));
        this.p3.pos.y = Math.max(this.height / 2 + 10 + this.p3.radius, Math.min(this.height - this.p3.radius, this.p3.pos.y));
      }
    }

    // --- Player 4 controls (TFGH) ---
    if (this.is4P) {
      let p4Move = new Vector2D(0, 0);
      if (this.input.isPressed('KeyT') || this.input.isPressed('t')) p4Move.y -= 1;
      if (this.input.isPressed('KeyG') || this.input.isPressed('g')) p4Move.y += 1;
      if (this.input.isPressed('KeyF') || this.input.isPressed('f')) p4Move.x -= 1;
      if (this.input.isPressed('KeyH') || this.input.isPressed('h')) p4Move.x += 1;

      if (this.p4.invertedControls) p4Move.mult(-1);
      if (p4Move.mag() > 0) {
        p4Move.normalise().mult(this.p4.speed);
      }

      this.p4.prevPos.set(this.p4.pos.x, this.p4.pos.y);
      this.p4.pos.add(p4Move);
      this.p4.pos.add(this.p4.externalForce);
      this.p4.externalForce.mult(0.85);
      if (this.p4.externalForce.mag() < 0.1) this.p4.externalForce.set(0, 0);
      this.p4.vel.set(this.p4.pos.x - this.p4.prevPos.x, this.p4.pos.y - this.p4.prevPos.y);

      // Enforce P4 boundaries (Bottom-Right Quadrant)
      this.p4.pos.x = Math.max(this.width / 2 + 10 + this.p4.radius, Math.min(this.width - this.p4.radius, this.p4.pos.x));
      this.p4.pos.y = Math.max(this.height / 2 + 10 + this.p4.radius, Math.min(this.height - this.p4.radius, this.p4.pos.y));
    }

    // Update active powerups
    const playersList = this.is4P ? [this.p1, this.p2, this.p3, this.p4] : (this.is3P ? [this.p1, this.p2, this.p3] : [this.p1, this.p2]);
    playersList.forEach(p => {
      if (p.activePowerup) {
        p.powerupTimer--;
        if (p.powerupTimer <= 0) {
          this.deactivatePowerup(p);
        }
      }
    });
  }

  /**
   * Puck physics, wall collisions, puck-paddle elastic collisions, goals.
   */
  updatePuck() {
    const puck = this.puck;
    
    puck.trail.push(puck.pos.copy());
    if (puck.trail.length > 10) puck.trail.shift();

    puck.pos.add(puck.vel);
    puck.vel.mult(puck.friction);

    const velocityMag = puck.vel.mag();

    // Dynamic puck color
    if (this.dvdMode) {
      puck.color = this.dvdColors[puck.dvdColorIndex];
    } else {
      if (velocityMag > puck.baseMaxSpeed * 1.3) {
        puck.color = '#ff9100'; // Supercharged orange
      } else if (velocityMag > puck.baseMaxSpeed * 0.9) {
        puck.color = '#ffeb3b'; // High speed yellow
      } else if (puck.lastTouchedBy === 'p1') {
        puck.color = '#00f0ff';
      } else if (puck.lastTouchedBy === 'p2') {
        puck.color = '#ff007f';
      } else if (puck.lastTouchedBy === 'p3') {
        puck.color = '#ffff00';
      } else if (puck.lastTouchedBy === 'p4') {
        puck.color = '#39ff14';
      } else {
        puck.color = '#ffffff';
      }
    }



    // Top Wall Collision
    if (puck.pos.y - puck.radius <= 0) {
      puck.pos.y = puck.radius;
      puck.vel.y *= -1;
      audio.playBounce();
      this.particles.spawnExplosion(puck.pos.x, puck.pos.y, puck.color, 5, 0.4);
      if (this.dvdMode) this.cycleDvdColor();
    }

    // Bottom Wall Collision / Goal check for 3P/4P
    if (puck.pos.y + puck.radius >= this.height) {
      if (this.is4P) {
        const isXInGoal3 = puck.pos.x >= 100 && puck.pos.x <= 300;
        const isXInGoal4 = puck.pos.x >= 500 && puck.pos.x <= 700;
        if (isXInGoal3) {
          if (this.shields.p3) {
            puck.pos.y = this.height - puck.radius;
            puck.vel.y *= -1;
            audio.playBounce();
            this.particles.spawnExplosion(puck.pos.x, puck.pos.y, '#ffff00', 8, 0.5);
            if (this.dvdMode) this.cycleDvdColor();
          } else {
            this.scorePoint('p3');
          }
        } else if (isXInGoal4) {
          if (this.shields.p4) {
            puck.pos.y = this.height - puck.radius;
            puck.vel.y *= -1;
            audio.playBounce();
            this.particles.spawnExplosion(puck.pos.x, puck.pos.y, '#39ff14', 8, 0.5);
            if (this.dvdMode) this.cycleDvdColor();
          } else {
            this.scorePoint('p4');
          }
        } else {
          // Bounce bottom wall
          puck.pos.y = this.height - puck.radius;
          puck.vel.y *= -1;
          audio.playBounce();
          this.particles.spawnExplosion(puck.pos.x, puck.pos.y, puck.color, 5, 0.4);
          if (this.dvdMode) this.cycleDvdColor();
        }
      } else if (this.is3P) {
        const isXInBottomGoal = puck.pos.x >= 300 && puck.pos.x <= 500;
        if (isXInBottomGoal) {
          if (this.shields.p3) {
            puck.pos.y = this.height - puck.radius;
            puck.vel.y *= -1;
            audio.playBounce();
            this.particles.spawnExplosion(puck.pos.x, puck.pos.y, '#ffff00', 8, 0.5);
            if (this.dvdMode) this.cycleDvdColor();
          } else {
            this.scorePoint('p3');
          }
        } else {
          // Bounce bottom wall
          puck.pos.y = this.height - puck.radius;
          puck.vel.y *= -1;
          audio.playBounce();
          this.particles.spawnExplosion(puck.pos.x, puck.pos.y, puck.color, 5, 0.4);
          if (this.dvdMode) this.cycleDvdColor();
        }
      } else {
        // 2P standard bottom bounce
        puck.pos.y = this.height - puck.radius;
        puck.vel.y *= -1;
        audio.playBounce();
        this.particles.spawnExplosion(puck.pos.x, puck.pos.y, puck.color, 5, 0.4);
        if (this.dvdMode) this.cycleDvdColor();
      }
    }

    // Left and Right Wall Collisions (Goal areas)
    const isYInGoalRange = puck.pos.y >= this.goalTop && puck.pos.y <= this.goalBottom;

    if (puck.pos.x - puck.radius <= 0) {
      if (isYInGoalRange) {
        if (this.shields.p1) {
          puck.pos.x = puck.radius;
          puck.vel.x *= -1;
          audio.playBounce();
          this.particles.spawnExplosion(puck.pos.x, puck.pos.y, '#00f0ff', 8, 0.5);
          if (this.dvdMode) this.cycleDvdColor();
        } else {
          this.scorePoint('p1');
        }
      } else {
        puck.pos.x = puck.radius;
        puck.vel.x *= -1;
        audio.playBounce();
        this.particles.spawnExplosion(puck.pos.x, puck.pos.y, puck.color, 5, 0.4);
        if (this.dvdMode) this.cycleDvdColor();
      }
    } else if (puck.pos.x + puck.radius >= this.width) {
      if (isYInGoalRange) {
        if (this.shields.p2) {
          puck.pos.x = this.width - puck.radius;
          puck.vel.x *= -1;
          audio.playBounce();
          this.particles.spawnExplosion(puck.pos.x, puck.pos.y, '#ff007f', 8, 0.5);
          if (this.dvdMode) this.cycleDvdColor();
        } else {
          this.scorePoint('p2');
        }
      } else {
        puck.pos.x = this.width - puck.radius;
        puck.vel.x *= -1;
        audio.playBounce();
        this.particles.spawnExplosion(puck.pos.x, puck.pos.y, puck.color, 5, 0.4);
        if (this.dvdMode) this.cycleDvdColor();
      }
    }

    // Paddle Collisions (Elastic reflection loop)
    const playersList = this.is4P ? [this.p1, this.p2, this.p3, this.p4] : (this.is3P ? [this.p1, this.p2, this.p3] : [this.p1, this.p2]);
    playersList.forEach(p => {
      const dist = puck.pos.dist(p.pos);
      const minDist = p.radius + puck.radius;

      if (dist < minDist) {
        const normal = puck.pos.copy().sub(p.pos).normalise();
        puck.pos.set(p.pos.x + normal.x * minDist, p.pos.y + normal.y * minDist);

        const incomingSpeed = puck.vel.mag();
        const baseBounceSpeed = Math.max(incomingSpeed * 0.85, 6);
        
        puck.vel.set(
          normal.x * baseBounceSpeed + p.vel.x * 0.75,
          normal.y * baseBounceSpeed + p.vel.y * 0.75
        );

        puck.vel.limit(puck.maxSpeed);

        puck.lastTouchedBy = p === this.p1 ? 'p1' : (p === this.p2 ? 'p2' : (p === this.p3 ? 'p3' : 'p4'));
        if (!this.dvdMode) puck.color = p.color;

        audio.playBounce();
        this.particles.spawnExplosion(puck.pos.x, puck.pos.y, p.color, 12, 0.8);
        
        if (this.dvdMode) this.cycleDvdColor();
      }
    });
    
    // Pinball Bumpers Collisions
    if (this.pinballMode) {
      this.pinballBumpers.forEach(bumper => {
        const dist = puck.pos.dist(new Vector2D(bumper.x, bumper.y));
        const minDist = bumper.r + puck.radius;
        if (bumper.glowTimer > 0) bumper.glowTimer--;

        if (dist < minDist) {
          const normal = puck.pos.copy().sub(new Vector2D(bumper.x, bumper.y)).normalise();
          puck.pos.set(bumper.x + normal.x * minDist, bumper.y + normal.y * minDist);
          
          const incomingSpeed = puck.vel.mag();
          // Boost speed slightly on bumper hit
          const bounceSpeed = Math.min(Math.max(incomingSpeed * 1.5, 10), puck.maxSpeed);
          
          puck.vel.set(normal.x * bounceSpeed, normal.y * bounceSpeed);
          
          const glowColor = this.dvdColors[Math.floor(Math.random() * this.dvdColors.length)];
          bumper.glowColor = glowColor;
          bumper.glowTimer = 15;

          audio.playBounce();
          this.particles.spawnExplosion(bumper.x, bumper.y, glowColor, 15, 0.6);
        }
        
        // Player Bumper Collisions
        playersList.forEach(p => {
          const pDist = p.pos.dist(new Vector2D(bumper.x, bumper.y));
          const pMinDist = bumper.r + p.radius;
          if (pDist < pMinDist) {
            const normal = p.pos.copy().sub(new Vector2D(bumper.x, bumper.y)).normalise();
            p.pos.set(bumper.x + normal.x * pMinDist, bumper.y + normal.y * pMinDist);
            
            const incomingSpeed = p.vel.mag();
            // Significantly increase bounce power for players
            const bounceSpeed = Math.max(incomingSpeed * 2.5, 14); 
            
            p.externalForce.set(normal.x * bounceSpeed, normal.y * bounceSpeed);
            
            const glowColor = this.dvdColors[Math.floor(Math.random() * this.dvdColors.length)];
            bumper.glowColor = glowColor;
            bumper.glowTimer = 15;

            audio.playBounce();
            this.particles.spawnExplosion(bumper.x, bumper.y, glowColor, 10, 0.4);
          }
        });
      });
    }
  }

  cycleDvdColor() {
    this.puck.dvdColorIndex = (this.puck.dvdColorIndex + 1) % this.dvdColors.length;
    this.puck.color = this.dvdColors[this.puck.dvdColorIndex];
  }

  /**
   * Spawning and tracking center arena powerups.
   */
  updatePowerups() {
    if (this.powerup.active) {
      this.powerup.pulse += 0.05;
      
      const dist = this.puck.pos.dist(this.powerup.pos);
      if (dist < this.puck.radius + this.powerup.radius) {
        this.activatePowerupEffect();
      }
    } else {
      this.powerup.spawnTimer--;
      if (this.powerup.spawnTimer <= 0) {
        this.spawnPowerup();
      }
    }
  }

  spawnPowerup() {
    const types = ['SIZE', 'SPEED', 'SHIELD', 'SNAIL', 'SHRINK', 'INVERT'];
    this.powerup.type = types[Math.floor(Math.random() * types.length)];
    
    // Span slightly different in 3P to cover sectors
    const rx = 350 + Math.random() * 100;
    const ry = this.is3P ? (150 + Math.random() * 200) : (100 + Math.random() * 300);

    this.powerup.pos.set(rx, ry);
    this.powerup.active = true;
    this.powerup.pulse = 0;
    
    audio.playPowerup();
    const isTroll = ['SNAIL', 'SHRINK', 'INVERT'].includes(this.powerup.type);
    const effectColor = isTroll ? '#ff3333' : '#e0aaff';
    this.particles.spawnExplosion(this.powerup.pos.x, this.powerup.pos.y, effectColor, 15, 0.5);
  }

  activatePowerupEffect() {
    this.powerup.active = false;
    this.powerup.spawnTimer = 480 + Math.random() * 300;

    const targetPlayerKey = this.puck.lastTouchedBy || 'p1';
    let player = this.p1;
    if (targetPlayerKey === 'p2') player = this.p2;
    else if (targetPlayerKey === 'p3' && (this.is3P || this.is4P)) player = this.p3;
    else if (targetPlayerKey === 'p4' && this.is4P) player = this.p4;

    const type = this.powerup.type;
    const isTroll = ['SNAIL', 'SHRINK', 'INVERT'].includes(type);
    const effectColor = isTroll ? '#ff3333' : '#e0aaff';

    audio.playPowerupUse();
    this.particles.spawnExplosion(this.powerup.pos.x, this.powerup.pos.y, effectColor, 20, 1.2);

    const playersList = this.is4P ? [this.p1, this.p2, this.p3, this.p4] : (this.is3P ? [this.p1, this.p2, this.p3] : [this.p1, this.p2]);

    if (type === 'SIZE') {
      player.activePowerup = 'SIZE';
      player.radius = this.mods.chaos ? 70 : 48;
      player.powerupTimer = 300;
    } else if (type === 'SPEED') {
      this.puck.maxSpeed = this.puck.baseMaxSpeed * 1.8;
      this.puck.vel.normalise().mult(this.puck.maxSpeed);
      if (!this.dvdMode) this.puck.color = '#ff9100';
    } else if (type === 'SHIELD') {
      this.shields[targetPlayerKey] = true;
      player.activePowerup = 'SHIELD';
      player.powerupTimer = 300;
    } else if (isTroll) {
      playersList.forEach(opp => {
        if (opp !== player) {
          this.deactivatePowerup(opp);
          opp.activePowerup = type;
          opp.powerupTimer = 300;
          if (type === 'SNAIL') {
            opp.speed = opp.baseSpeed * 0.4;
          } else if (type === 'SHRINK') {
            opp.radius = opp.baseRadius * 0.5;
          } else if (type === 'INVERT') {
            opp.invertedControls = true;
          }
        }
      });
    }
  }

  deactivatePowerup(player) {
    if (player.activePowerup === 'SIZE' || player.activePowerup === 'SHRINK') {
      player.radius = player.baseRadius;
    } else if (player.activePowerup === 'SHIELD') {
      if (player === this.p1) this.shields.p1 = false;
      if (player === this.p2) this.shields.p2 = false;
      if ((this.is3P || this.is4P) && player === this.p3) this.shields.p3 = false;
      if (this.is4P && player === this.p4) this.shields.p4 = false;
    } else if (player.activePowerup === 'SNAIL') {
      player.speed = player.baseSpeed;
    } else if (player.activePowerup === 'INVERT') {
      player.invertedControls = false;
    }
    player.activePowerup = null;
  }

  /**
   * Scores a point, shakes screens, plays dynamic beeps, resets arena.
   */
  scorePoint(concededPlayerKey) {
    if (this.is3P || this.is4P) {
      const scorer = this.puck.lastTouchedBy;
      if (scorer && scorer !== concededPlayerKey) {
        this.scores[scorer]++;
      } else {
        // Conceded self-goal: award 1 point to all other players!
        for (const p in this.scores) {
          if (p !== concededPlayerKey) this.scores[p]++;
        }
      }

      audio.playScore();
      triggerScreenShake();

      let explodeX = this.puck.pos.x;
      let explodeY = this.puck.pos.y;
      const explodeColor = concededPlayerKey === 'p1' ? '#00f0ff' : (concededPlayerKey === 'p2' ? '#ff007f' : (concededPlayerKey === 'p3' ? '#ffff00' : '#39ff14'));
      this.particles.spawnExplosion(explodeX, explodeY, explodeColor, 40, 2);

      // Check overall winner
      let matchWinner = null;
      for (const p in this.scores) {
        if (this.scores[p] >= this.maxScore) {
          matchWinner = p;
          break;
        }
      }

      if (matchWinner) {
        this.winner = matchWinner;
        audio.playVictory();
        const scoreParts = [this.scores.p1, this.scores.p2, this.scores.p3];
        if (this.is4P) scoreParts.push(this.scores.p4);
        this.onGameOver(matchWinner, scoreParts.join(" - "));
      } else {
        let serveIdx = concededPlayerKey === 'p1' ? 1 : (concededPlayerKey === 'p2' ? 2 : (concededPlayerKey === 'p3' ? 3 : 4));
        this.resetPuck(serveIdx);
      }

    } else {
      // 2P Original logic
      const winnerKey = concededPlayerKey === 'p1' ? 'p2' : 'p1';
      this.scores[winnerKey]++;
      
      audio.playScore();
      triggerScreenShake();
      
      const goalX = concededPlayerKey === 'p1' ? 0 : this.width;
      const goalY = this.puck.pos.y;
      const explodeColor = winnerKey === 'p1' ? '#00f0ff' : '#ff007f';
      this.particles.spawnExplosion(goalX, goalY, explodeColor, 40, 2);

      if (this.scores[winnerKey] >= this.maxScore) {
        this.winner = winnerKey;
        audio.playVictory();
        this.onGameOver(winnerKey, `${this.scores.p1} - ${this.scores.p2}`);
      } else {
        this.resetPuck(winnerKey === 'p1' ? 2 : 1);
      }
    }
  }

  /* ==========================================================================
     SIGNALING STATE SYNC PROTOCOLS
     ========================================================================== */

  getState() {
    const packet = {
      puck: {
        x: this.puck.pos.x,
        y: this.puck.pos.y,
        vx: this.puck.vel.x,
        vy: this.puck.vel.y,
        color: this.puck.color,
        trail: this.puck.trail.map(t => ({ x: t.x, y: t.y })),
        dvdColorIndex: this.puck.dvdColorIndex
      },
      p1: {
        x: this.p1.pos.x,
        y: this.p1.pos.y,
        radius: this.p1.radius,
        speed: this.p1.speed,
        invertedControls: this.p1.invertedControls,
        activePowerup: this.p1.activePowerup
      },
      p2: {
        x: this.p2.pos.x,
        y: this.p2.pos.y,
        radius: this.p2.radius,
        speed: this.p2.speed,
        invertedControls: this.p2.invertedControls,
        activePowerup: this.p2.activePowerup
      },
      powerup: {
        active: this.powerup.active,
        x: this.powerup.pos.x,
        y: this.powerup.pos.y,
        type: this.powerup.type,
        radius: this.powerup.radius,
        pulse: this.powerup.pulse
      },
      shields: this.shields
    };

    if (this.is3P || this.is4P) {
      packet.p3 = {
        x: this.p3.pos.x,
        y: this.p3.pos.y,
        radius: this.p3.radius,
        speed: this.p3.speed,
        invertedControls: this.p3.invertedControls,
        activePowerup: this.p3.activePowerup
      };
    }

    if (this.is4P) {
      packet.p4 = {
        x: this.p4.pos.x,
        y: this.p4.pos.y,
        radius: this.p4.radius,
        speed: this.p4.speed,
        invertedControls: this.p4.invertedControls,
        activePowerup: this.p4.activePowerup
      };
    }

    return packet;
  }

  applyNetworkState(state) {
    this.puck.pos.set(state.puck.x, state.puck.y);
    this.puck.vel.set(state.puck.vx, state.puck.vy);
    this.puck.color = state.puck.color;
    this.puck.trail = state.puck.trail.map(t => new Vector2D(t.x, t.y));
    this.puck.dvdColorIndex = state.puck.dvdColorIndex;

    this.p1.pos.set(state.p1.x, state.p1.y);
    this.p1.radius = state.p1.radius;
    this.p1.speed = state.p1.speed;
    this.p1.invertedControls = state.p1.invertedControls;
    this.p1.activePowerup = state.p1.activePowerup;

    this.p2.pos.set(state.p2.x, state.p2.y);
    this.p2.radius = state.p2.radius;
    this.p2.speed = state.p2.speed;
    this.p2.invertedControls = state.p2.invertedControls;
    this.p2.activePowerup = state.p2.activePowerup;

    if ((this.is3P || this.is4P) && state.p3) {
      this.p3.pos.set(state.p3.x, state.p3.y);
      this.p3.radius = state.p3.radius;
      this.p3.speed = state.p3.speed;
      this.p3.invertedControls = state.p3.invertedControls;
      this.p3.activePowerup = state.p3.activePowerup;
    }

    if (this.is4P && state.p4) {
      this.p4.pos.set(state.p4.x, state.p4.y);
      this.p4.radius = state.p4.radius;
      this.p4.speed = state.p4.speed;
      this.p4.invertedControls = state.p4.invertedControls;
      this.p4.activePowerup = state.p4.activePowerup;
    }

    this.powerup.active = state.powerup.active;
    if (state.powerup.active) {
      this.powerup.pos.set(state.powerup.x, state.powerup.y);
      this.powerup.type = state.powerup.type;
      this.powerup.radius = state.powerup.radius;
    }
    if (state.powerup.pulse !== undefined) {
      this.powerup.pulse = state.powerup.pulse;
    }

    this.shields = state.shields;
  }

  /* ==========================================================================
     CORE RENDERING LOOP
     ========================================================================== */

  render() {
    const ctx = this.ctx;
    
    // 1. Clear background
    ctx.fillStyle = '#04020a';
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Draw Vector Arena Borders
    ctx.strokeStyle = 'rgba(157, 78, 221, 0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, this.width, this.height);
    
    if (this.is4P) {
      // Horizontal Center Line divider
      ctx.beginPath();
      ctx.moveTo(0, this.height / 2);
      ctx.lineTo(this.width, this.height / 2);
      ctx.stroke();

      // Vertical Center Line divider
      ctx.beginPath();
      ctx.moveTo(this.width / 2, 0);
      ctx.lineTo(this.width / 2, this.height);
      ctx.stroke();

      // Center Node circular mesh
      ctx.beginPath();
      ctx.arc(this.width / 2, this.height / 2, 45, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.is3P) {
      // Horizontal Center Line divider
      ctx.beginPath();
      ctx.moveTo(0, this.height / 2);
      ctx.lineTo(this.width, this.height / 2);
      ctx.stroke();

      // Top Half vertical center line divider
      ctx.beginPath();
      ctx.moveTo(this.width / 2, 0);
      ctx.lineTo(this.width / 2, this.height / 2);
      ctx.stroke();

      // Small center node circular mesh
      ctx.beginPath();
      ctx.arc(this.width / 2, this.height / 2, 35, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Standard 2P split
      ctx.beginPath();
      ctx.moveTo(this.width / 2, 0);
      ctx.lineTo(this.width / 2, this.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(this.width / 2, this.height / 2, 70, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw Pinball Bumpers
    if (this.pinballMode) {
      this.pinballBumpers.forEach(bumper => {
        ctx.beginPath();
        ctx.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2);
        
        if (bumper.glowTimer > 0) {
          ctx.fillStyle = bumper.glowColor;
          ctx.strokeStyle = '#ffffff';
          ctx.shadowBlur = 20;
          ctx.shadowColor = bumper.glowColor;
        } else {
          ctx.fillStyle = '#444444'; // Matte gray
          ctx.strokeStyle = '#666666';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#000000';
        }
        
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      });
    }

    // Goals boxes (Neon boundaries)
    // Left goal (Cyan)
    ctx.strokeStyle = this.shields.p1 ? '#00f0ff' : 'rgba(0, 240, 255, 0.3)';
    ctx.lineWidth = this.shields.p1 ? 6 : 3;
    ctx.beginPath();
    ctx.moveTo(0, this.goalTop);
    ctx.lineTo(0, this.goalBottom);
    ctx.stroke();
    
    // Right goal (Pink)
    ctx.strokeStyle = this.shields.p2 ? '#ff007f' : 'rgba(255, 0, 127, 0.3)';
    ctx.lineWidth = this.shields.p2 ? 6 : 3;
    ctx.beginPath();
    ctx.moveTo(this.width, this.goalTop);
    ctx.lineTo(this.width, this.goalBottom);
    ctx.stroke();

    // Bottom goals - active if is3P or is4P
    if (this.is4P) {
      // Goal P3 (Yellow)
      ctx.strokeStyle = this.shields.p3 ? '#ffff00' : 'rgba(255, 255, 0, 0.3)';
      ctx.lineWidth = this.shields.p3 ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(100, this.height);
      ctx.lineTo(300, this.height);
      ctx.stroke();

      // Goal P4 (Green)
      ctx.strokeStyle = this.shields.p4 ? '#39ff14' : 'rgba(57, 255, 20, 0.3)';
      ctx.lineWidth = this.shields.p4 ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(500, this.height);
      ctx.lineTo(700, this.height);
      ctx.stroke();
    } else if (this.is3P) {
      ctx.strokeStyle = this.shields.p3 ? '#ffff00' : 'rgba(255, 255, 0, 0.3)';
      ctx.lineWidth = this.shields.p3 ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(300, this.height);
      ctx.lineTo(500, this.height);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    // 3. Draw Active Power-up
    if (this.powerup.active) {
      const scalePulse = 1 + Math.sin(this.powerup.pulse) * 0.15;
      const size = this.powerup.radius * scalePulse;

      const isTroll = ['SNAIL', 'SHRINK', 'INVERT'].includes(this.powerup.type);
      const orbColor = isTroll ? 'rgba(255, 51, 51, 0.3)' : 'rgba(224, 170, 255, 0.3)';
      const orbBorder = isTroll ? '#ff3333' : '#e0aaff';

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
      ctx.font = 'bold 10px Orbitron';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let sym = '★';
      if (this.powerup.type === 'SIZE') sym = '➕';
      if (this.powerup.type === 'SPEED') sym = '⚡';
      if (this.powerup.type === 'SHIELD') sym = '🛡️';
      if (this.powerup.type === 'SNAIL') sym = '🐌';
      if (this.powerup.type === 'SHRINK') sym = '🤏';
      if (this.powerup.type === 'INVERT') sym = '🙃';
      ctx.fillText(sym, this.powerup.pos.x, this.powerup.pos.y);
      ctx.restore();
    }

    // 4. Draw Puck & Trails
    const puck = this.puck;

    // Generate trail sparkle particles locally (works on both host and client)
    const velocityMag = puck.vel.mag();
    if (velocityMag > 3 && Math.random() < 0.3) {
      this.particles.spawnTrail(puck.pos.x, puck.pos.y, puck.color);
    }

    if (puck.trail.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < puck.trail.length - 1; i++) {
        const p1 = puck.trail[i];
        const p2 = puck.trail[i + 1];
        const alpha = (i / puck.trail.length) * 0.4;
        
        ctx.strokeStyle = puck.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = puck.radius * 2 * (i / puck.trail.length);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Puck Body
    ctx.save();
    if (this.dvdMode && this.dvdImageLoaded) {
      if (this.dvdOffscreen.width !== this.dvdImage.width || this.dvdOffscreen.height !== this.dvdImage.height) {
        this.dvdOffscreen.width = this.dvdImage.width;
        this.dvdOffscreen.height = this.dvdImage.height;
      }

      const octx = this.dvdOctx;
      const targetColor = this.dvdColors[puck.dvdColorIndex];
      octx.clearRect(0, 0, this.dvdOffscreen.width, this.dvdOffscreen.height);
      octx.drawImage(this.dvdImage, 0, 0);
      octx.globalCompositeOperation = 'source-in';
      octx.fillStyle = targetColor;
      octx.fillRect(0, 0, this.dvdOffscreen.width, this.dvdOffscreen.height);
      octx.globalCompositeOperation = 'source-over';

      ctx.shadowBlur = 18;
      ctx.shadowColor = targetColor;

      const aspect = this.dvdImage.height / this.dvdImage.width;
      const drawW = puck.radius * 2.8;
      const drawH = drawW * aspect;
      ctx.drawImage(this.dvdOffscreen, puck.pos.x - drawW / 2, puck.pos.y - drawH / 2, drawW, drawH);
    } else {
      ctx.shadowBlur = 15;
      ctx.shadowColor = puck.color;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(puck.pos.x, puck.pos.y, puck.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 5. Draw Paddles
    const playersList = this.is4P ? [this.p1, this.p2, this.p3, this.p4] : (this.is3P ? [this.p1, this.p2, this.p3] : [this.p1, this.p2]);
    playersList.forEach(p => {
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = p.color;
      let rgbFill = '0, 240, 255';
      if (p === this.p2) rgbFill = '255, 0, 127';
      else if (p === this.p3) rgbFill = '255, 255, 0';
      else if (p === this.p4) rgbFill = '57, 255, 20';
      ctx.fillStyle = 'rgba(' + rgbFill + ', 0.15)';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4;
      
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, 8, 0, Math.PI * 2);
      ctx.fill();
      
      if (p.activePowerup) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.radius - 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = p.color;
        ctx.font = 'bold 14px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(Math.ceil(p.powerupTimer / 60) + 's', p.pos.x, p.pos.y + p.radius + 20);
      }
      ctx.restore();
    });

    // 6. Draw particles
    this.particles.draw(ctx);

    // 7. Dynamic Score overlay on Canvas background
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.font = '80px Orbitron';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    if (this.is4P) {
      // 4-way layout scores
      ctx.fillText(this.scores.p1, this.width / 4, this.height / 4);
      ctx.fillText(this.scores.p2, (this.width / 4) * 3, this.height / 4);
      ctx.fillText(this.scores.p3, this.width / 4, (this.height / 4) * 3);
      ctx.fillText(this.scores.p4, (this.width / 4) * 3, (this.height / 4) * 3);
    } else if (this.is3P) {
      // 3-way layout scores
      ctx.fillText(this.scores.p1, this.width / 4, this.height / 4);
      ctx.fillText(this.scores.p2, (this.width / 4) * 3, this.height / 4);
      ctx.fillText(this.scores.p3, this.width / 2, (this.height / 4) * 3);
    } else {
      ctx.fillText(this.scores.p1, this.width / 4, this.height / 2);
      ctx.fillText(this.scores.p2, (this.width / 4) * 3, this.height / 2);
    }
    ctx.restore();
  }

  /**
   * Main gameplay tick loop.
   */
  tick() {
    if (this.paused || this.winner) return;

    this.updatePlayers();
    this.updatePuck();
    this.updatePowerups();
    this.particles.update();
  }
}
