import { Vector2D, ParticleSystem, triggerScreenShake } from './engine.js';
import { audio } from './audio.js';

export default class GameArtillery {
  constructor(canvas, input, onGameOver, mods = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.onGameOver = onGameOver;
    this.mods = mods;

    this.particles = new ParticleSystem();

    this.width = 800;
    this.height = 500;
    this.maxScore = 3; // First to 3 wins

    this.is3P = this.mods.playerMode === 3;
    this.scores = this.is3P ? { p1: 0, p2: 0, p3: 0 } : { p1: 0, p2: 0 };
    this.winner = null;
    this.paused = false;

    // Turn States: 'CONTROLS', 'FLIGHT', 'ROUND_OVER'
    this.state = 'CONTROLS';
    this.activePlayer = 'p1';

    // Apply Modifiers
    this.wind = 0;
    this.gravity = mods.lunar ? 0.11 : 0.22;
    this.tankRadius = mods.chaos ? 28 : 14;
    this.windstormMode = !!mods.windstorm;

    // Player 1 Tank
    this.p1 = {
      x: 120,
      y: 0,
      angle: 45,
      power: 60,
      health: 100,
      color: '#00f0ff',
      ammo: { standard: -1, cluster: 1 },
      weapon: 'STANDARD',
      radius: this.tankRadius,
      activeLuckyEffect: null,
      luckyEffectTimer: 0,
      key: 'p1'
    };

    // Player 2 Tank
    this.p2 = {
      x: this.width - 120,
      y: 0,
      angle: 135,
      power: 60,
      health: 100,
      color: '#ff007f',
      ammo: { standard: -1, cluster: 1 },
      weapon: 'STANDARD',
      radius: this.tankRadius,
      activeLuckyEffect: null,
      luckyEffectTimer: 0,
      key: 'p2'
    };

    // Player 3 Tank
    if (this.is3P) {
      this.p3 = {
        x: this.width / 2,
        y: 0,
        angle: 90,
        power: 60,
        health: 100,
        color: '#ffff00',
        ammo: { standard: -1, cluster: 1 },
        weapon: 'STANDARD',
        radius: this.tankRadius,
        activeLuckyEffect: null,
        luckyEffectTimer: 0,
        key: 'p3'
      };
    }

    // Height Map array
    this.terrain = new Array(this.width);

    // Active Projectiles
    this.projectiles = [];

    // Wind clouds
    this.windClouds = [];
    for (let i = 0; i < 6; i++) {
      this.windClouds.push({
        x: Math.random() * this.width,
        y: 30 + Math.random() * 100,
        speed: 0.2 + Math.random() * 0.5,
        length: 20 + Math.random() * 40
      });
    }

    this.terrainDirty = true;
    this.initRound();
  }

  /**
   * Generates organic heights map and resets active tank positions.
   */
  initRound() {
    this.terrainDirty = true;
    this.generateTerrain();
    
    this.luckyBox = {
      active: false,
      x: 0,
      y: 0,
      size: 24,
      spawnTimer: 180
    };
    
    // Position tanks on procedurally generated hills
    this.p1.x = 100 + Math.floor(Math.random() * 80);
    this.p1.y = this.terrain[this.p1.x];
    this.p1.health = 100;
    this.p1.angle = 45;
    this.p1.power = 60;
    this.p1.weapon = 'STANDARD';
    this.p1.ammo.cluster = 1;
    this.p1.activeLuckyEffect = null;
    
    this.p2.x = this.width - 100 - Math.floor(Math.random() * 80);
    this.p2.y = this.terrain[this.p2.x];
    this.p2.angle = 135;
    this.p2.power = 40;
    this.p2.health = 100;
    this.p2.weapon = 'STANDARD';
    this.p2.ammo.cluster = 1;
    this.p2.activeLuckyEffect = null;

    if (this.is3P) {
      this.p3.x = this.width / 2;
      this.p3.y = this.terrain[this.p3.x];
      this.p3.angle = 90;
      this.p3.power = 40;
      this.p3.health = 100;
      this.p3.weapon = 'STANDARD';
      this.p3.ammo.cluster = 1;
      this.p3.activeLuckyEffect = null;
    }

    this.randomizeWind();

    this.projectiles = [];
    this.particles.clear();
    this.state = 'CONTROLS';
    
    // Choose active starting player randomly
    const playersPool = this.is3P ? ['p1', 'p2', 'p3'] : ['p1', 'p2'];
    this.activePlayer = playersPool[Math.floor(Math.random() * playersPool.length)];
  }

  /**
   * Procedural terrain generator using combined sine/cosine waves.
   */
  generateTerrain() {
    const baseHeight = this.height - 130;
    const waveFrequency1 = 0.005;
    const waveFrequency2 = 0.015;
    const waveFrequency3 = 0.03;

    const seed1 = Math.random() * 100;
    const seed2 = Math.random() * 100;

    for (let x = 0; x < this.width; x++) {
      const h1 = Math.sin(x * waveFrequency1 + seed1) * 80;
      const h2 = Math.cos(x * waveFrequency2 + seed2) * 35;
      const h3 = Math.sin(x * waveFrequency3) * 10;
      
      this.terrain[x] = Math.min(this.height - 40, Math.max(180, baseHeight + h1 + h2 + h3));
    }
  }

  randomizeWind() {
    if (this.windstormMode) {
      // Windstorm: extreme, volatile wind values
      const sign = Math.random() > 0.5 ? 1 : -1;
      this.wind = sign * (15 + Math.random() * 15); // Very strong wind
    } else {
      this.wind = -5 + Math.random() * 10;
    }
  }

  /**
   * Handles keyboard adjustment of aim angles and power.
   */
  updateControls() {
    if (this.state !== 'CONTROLS') return;

    const tank = this.activePlayer === 'p1' ? this.p1 : (this.activePlayer === 'p2' ? this.p2 : this.p3);

    // Decouple inputs logically per player
    let leftAim = false;
    let rightAim = false;
    let powerUp = false;
    let powerDown = false;
    let moveLeft = false;
    let moveRight = false;
    let toggleWeapon = false;
    let fire = false;

    if (this.activePlayer === 'p1') {
      leftAim = this.input.isPressed('KeyA') || this.input.isPressed('a');
      rightAim = this.input.isPressed('KeyD') || this.input.isPressed('d');
      powerUp = this.input.isPressed('KeyW') || this.input.isPressed('w');
      powerDown = this.input.isPressed('KeyS') || this.input.isPressed('s');
      moveLeft = this.input.isPressed('KeyZ') || this.input.isPressed('z');
      moveRight = this.input.isPressed('KeyX') || this.input.isPressed('x');
      toggleWeapon = this.input.isPressed('KeyQ');
      fire = this.input.isPressed('Space');
    } else if (this.activePlayer === 'p2') {
      leftAim = this.input.isPressed('ArrowLeft');
      rightAim = this.input.isPressed('ArrowRight');
      powerUp = this.input.isPressed('ArrowUp');
      powerDown = this.input.isPressed('ArrowDown');
      moveLeft = this.input.isPressed('Comma') || this.input.isPressed(',');
      moveRight = this.input.isPressed('Period') || this.input.isPressed('.');
      toggleWeapon = this.input.isPressed('Shift') || this.input.isPressed('ShiftLeft');
      fire = this.input.isPressed('Enter');
    } else if (this.activePlayer === 'p3') {
      leftAim = this.input.isPressed('KeyJ');
      rightAim = this.input.isPressed('KeyL');
      powerUp = this.input.isPressed('KeyI');
      powerDown = this.input.isPressed('KeyK');
      moveLeft = this.input.isPressed('KeyN') || this.input.isPressed('n');
      moveRight = this.input.isPressed('KeyM') || this.input.isPressed('m');
      toggleWeapon = this.input.isPressed('KeyU');
      fire = this.input.isPressed('Space') || this.input.isPressed('Enter') || this.input.isPressed('KeyU');
    }

    // Angle Aim
    if (leftAim) {
      tank.angle += 0.8;
    }
    if (rightAim) {
      tank.angle -= 0.8;
    }

    // Enforce aiming constraints
    if (this.activePlayer === 'p1') {
      tank.angle = Math.max(0, Math.min(90, tank.angle));
    } else if (this.activePlayer === 'p2') {
      tank.angle = Math.max(90, Math.min(180, tank.angle));
    } else {
      // P3 in center can aim both sides
      tank.angle = Math.max(15, Math.min(165, tank.angle));
    }

    // Movement
    if (moveLeft) {
      tank.x -= 1.5;
    }
    if (moveRight) {
      tank.x += 1.5;
    }

    // Limit movement (restricted by 15% towards center)
    const halfMap = this.width / 2;
    const restrict15 = halfMap * 0.15;
    
    if (this.activePlayer === 'p1') {
      tank.x = Math.max(tank.radius, Math.min(halfMap - restrict15 - tank.radius, tank.x));
    } else if (this.activePlayer === 'p2') {
      tank.x = Math.max(halfMap + restrict15 + tank.radius, Math.min(this.width - tank.radius, tank.x));
    } else if (this.activePlayer === 'p3') {
      const thirdMap = this.width / 3;
      tank.x = Math.max(thirdMap + tank.radius + thirdMap * 0.15, Math.min(this.width - thirdMap - tank.radius - thirdMap * 0.15, tank.x));
    }

    // Update Y coordinate to snap to terrain!
    if (moveLeft || moveRight) {
      tank.x = Math.round(tank.x);
      tank.y = this.terrain[tank.x];
    }

    // Power Level
    if (powerUp) {
      tank.power = Math.min(100, tank.power + 0.5);
    }
    if (powerDown) {
      tank.power = Math.max(10, tank.power - 0.5);
    }

    // Toggle Weapons
    if (toggleWeapon) {
      // Clear key to prevent quick-flickering toggles
      if (this.activePlayer === 'p1') this.input.keys['KeyQ'] = false;
      else if (this.activePlayer === 'p2') {
        this.input.keys['Shift'] = false;
        this.input.keys['ShiftLeft'] = false;
      } else {
        this.input.keys['KeyU'] = false;
      }
      this.toggleWeapon(tank);
    }

    // Fire!
    if (fire) {
      if (this.activePlayer === 'p1') this.input.keys['Space'] = false;
      else if (this.activePlayer === 'p2') this.input.keys['Enter'] = false;
      else {
        this.input.keys['Space'] = false;
        this.input.keys['Enter'] = false;
      }
      this.fireProjectile(tank);
    }
  }

  toggleWeapon(tank) {
    if (tank.weapon === 'STANDARD') {
      if (tank.ammo.cluster > 0) {
        tank.weapon = 'CLUSTER';
      }
    } else {
      tank.weapon = 'STANDARD';
    }
    audio.playMenuTick();
  }

  /**
   * Spawns a physical ballistic projectile.
   */
  fireProjectile(tank) {
    const rad = (tank.angle * Math.PI) / 180;
    
    const barrelLength = this.mods.chaos ? 26 : 18;
    const startX = tank.x + Math.cos(rad) * barrelLength;
    const startY = tank.y - (this.mods.chaos ? 12 : 8) - Math.sin(rad) * barrelLength;

    const powerScale = this.mods.turbo ? 0.22 : 0.14;
    const launchSpeed = tank.power * powerScale;

    const projRadius = this.mods.chaos ? 7 : 4;

    const proj = {
      pos: new Vector2D(startX, startY),
      vel: new Vector2D(Math.cos(rad) * launchSpeed, -Math.sin(rad) * launchSpeed),
      radius: projRadius,
      type: tank.weapon,
      glow: tank.color,
      isSubmunition: false,
      owner: tank.key
    };

    if (['CLUSTER', 'NUKE', 'DUD'].includes(tank.weapon)) {
      if (tank.weapon === 'CLUSTER') tank.ammo.cluster--;
      tank.weapon = 'STANDARD';
      tank.activeLuckyEffect = null;
    }

    this.projectiles.push(proj);
    this.state = 'FLIGHT';

    audio.playBoost();
    this.particles.spawnExplosion(startX, startY, tank.color, 12, 0.8);
  }

  /**
   * Wind resistance, ballistic integration, terrain carving, damages.
   */
  updateProjectiles() {
    this.windClouds.forEach(cloud => {
      cloud.x += this.wind * 0.1 * cloud.speed;
      if (cloud.x > this.width + 50) {
        cloud.x = -50;
        cloud.y = 30 + Math.random() * 100;
      } else if (cloud.x < -50) {
        cloud.x = this.width + 50;
        cloud.y = 30 + Math.random() * 100;
      }
    });

    if (this.state !== 'FLIGHT') return;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];

      proj.vel.y += this.gravity;
      proj.vel.x += this.wind * 0.004;
      proj.pos.add(proj.vel);

      if (proj.pos.x < 0 || proj.pos.x >= this.width || proj.pos.y >= this.height) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const roundedX = Math.round(proj.pos.x);
      const groundY = this.terrain[roundedX];

      if (proj.pos.y >= groundY) {
        this.handleExplosion(proj.pos.x, groundY, proj);
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check collision against all active alive tanks
      const tanks = this.is3P ? [this.p1, this.p2, this.p3] : [this.p1, this.p2];
      let hitRegister = false;

      for (let t of tanks) {
        if (t.health <= 0) continue;
        const tankCenterY = t.y - (this.mods.chaos ? 12 : 6);
        const dist = proj.pos.dist(new Vector2D(t.x, tankCenterY));

        if (dist < t.radius + proj.radius) {
          this.handleExplosion(t.x, t.y - 6, proj);
          this.projectiles.splice(i, 1);
          hitRegister = true;
          break;
        }
      }

      if (hitRegister) continue;

      if (this.luckyBox.active) {
        const boxDist = proj.pos.dist(new Vector2D(this.luckyBox.x, this.luckyBox.y));
        if (boxDist < this.luckyBox.size / 2 + proj.radius) {
          this.activateLuckyBoxEffect(proj.owner);
          this.handleExplosion(this.luckyBox.x, this.luckyBox.y, proj);
          this.projectiles.splice(i, 1);
          continue;
        }
      }
    }

    // Return turn controls once projectiles exit
    if (this.projectiles.length === 0) {
      const survivors = [];
      if (this.p1.health > 0) survivors.push(this.p1);
      if (this.p2.health > 0) survivors.push(this.p2);
      if (this.is3P && this.p3.health > 0) survivors.push(this.p3);

      if (this.is3P) {
        if (survivors.length <= 1) {
          this.handleRoundFinish();
        } else {
          this.state = 'CONTROLS';
          this.cycleActiveTurn();
          this.randomizeWind();
        }
      } else {
        if (this.p1.health <= 0 || this.p2.health <= 0) {
          this.handleRoundFinish();
        } else {
          this.state = 'CONTROLS';
          this.cycleActiveTurn();
          this.randomizeWind();
        }
      }
    }
  }

  cycleActiveTurn() {
    let nextPlayer = this.activePlayer;
    while (true) {
      if (nextPlayer === 'p1') nextPlayer = 'p2';
      else if (nextPlayer === 'p2') nextPlayer = this.is3P ? 'p3' : 'p1';
      else nextPlayer = 'p1';

      // Check if alive
      const t = nextPlayer === 'p1' ? this.p1 : (nextPlayer === 'p2' ? this.p2 : this.p3);
      if (t.health > 0) {
        this.activePlayer = nextPlayer;
        break;
      }
    }
  }

  /**
   * Explosion calculations: terrain deformation and damage ratios.
   */
  handleExplosion(x, y, proj) {
    if (proj.type === 'DUD') {
      audio.playBounce(); // Just a thud
      this.particles.spawnExplosion(x, y, '#555555', 8, 0.4);
      return; // Skip terrain carving and damage
    }

    audio.playExplosion();
    triggerScreenShake();

    const sizeMult = this.mods.chaos ? 1.8 : 1.0;
    let blastRadius = (proj.type === 'CLUSTER' && !proj.isSubmunition ? 24 : 35) * sizeMult;
    let maxDamage = 45;

    if (proj.type === 'NUKE') {
      blastRadius = 80 * sizeMult;
      maxDamage = 80;
    }

    this.terrainDirty = true;

    // 1. Procedural Terrain Deforming
    const startX = Math.max(0, Math.round(x - blastRadius));
    const endX = Math.min(this.width - 1, Math.round(x + blastRadius));

    for (let tx = startX; tx <= endX; tx++) {
      const dx = tx - x;
      const craterDepth = Math.sqrt(Math.max(0, blastRadius * blastRadius - dx * dx));
      this.terrain[tx] = Math.min(this.height - 40, Math.max(this.terrain[tx], y + craterDepth * 0.8));
    }

    // 2. Adjust tanks sitting on terrain
    this.p1.y = this.terrain[Math.round(this.p1.x)];
    this.p2.y = this.terrain[Math.round(this.p2.x)];
    if (this.is3P) {
      this.p3.y = this.terrain[Math.round(this.p3.x)];
    }

    // 3. Compute blast damage to active tanks
    const tanks = this.is3P ? [this.p1, this.p2, this.p3] : [this.p1, this.p2];
    tanks.forEach(tank => {
      if (tank.health <= 0) return;

      const tankCenterY = tank.y - (this.mods.chaos ? 12 : 6);
      const dist = new Vector2D(tank.x, tankCenterY).dist(new Vector2D(x, y));
      
      if (dist < blastRadius + 15) {
        const proximityRatio = 1 - (dist / (blastRadius + 15));
        const damage = Math.round(proximityRatio * maxDamage);
        
        tank.health = Math.max(0, tank.health - damage);
        this.particles.spawnExplosion(tank.x, tankCenterY, '#ffffff', 10, 0.6);
      }
    });

    this.particles.spawnExplosion(x, y, proj.glow, blastRadius, 1.4);

    if (proj.type === 'CLUSTER' && !proj.isSubmunition) {
      this.spawnSubmunitions(x, y, proj.glow);
    }
  }

  /**
   * Spawns 4 small bouncing cluster shell submunitions upward on impact.
   */
  spawnSubmunitions(x, y, color) {
    audio.playPowerup();

    for (let i = 0; i < 4; i++) {
      const angle = (200 + i * 45) * Math.PI / 180;
      const speed = 2.5 + Math.random() * 2;

      this.projectiles.push({
        pos: new Vector2D(x, y - 10),
        vel: new Vector2D(Math.cos(angle) * speed, Math.sin(angle) * speed),
        radius: 2.5,
        type: 'STANDARD',
        glow: color,
        isSubmunition: true
      });
    }
  }

  /**
   * Round wrap: checks score thresholds and executes callbacks.
   */
  handleRoundFinish() {
    this.state = 'ROUND_OVER';

    const survivors = [];
    if (this.p1.health > 0) survivors.push(this.p1);
    if (this.p2.health > 0) survivors.push(this.p2);
    if (this.is3P && this.p3.health > 0) survivors.push(this.p3);

    // Spawn massive tank destruction wreckages for dead tanks
    [this.p1, this.p2, this.is3P ? this.p3 : null].forEach(tank => {
      if (tank && tank.health <= 0) {
        this.particles.spawnExplosion(tank.x, tank.y - 10, tank.color, 45, 2.2, 0.2);
      }
    });

    let roundWinner = null;
    if (survivors.length === 1) {
      roundWinner = survivors[0].key;
      this.scores[roundWinner]++;
    }

    if (roundWinner && this.scores[roundWinner] >= this.maxScore) {
      this.winner = roundWinner;
      audio.playVictory();
      const scoreStr = this.is3P 
        ? `${this.scores.p1} - ${this.scores.p2} - ${this.scores.p3}`
        : `${this.scores.p1} - ${this.scores.p2}`;
      this.onGameOver(roundWinner, scoreStr);
    } else {
      setTimeout(() => {
        this.initRound();
        this.luckyBox.active = false;
        this.luckyBox.spawnTimer = 180;
      }, 2000);
    }
  }

  updateLuckyBox() {
    if (this.state === 'ROUND_OVER') return;
    
    if (!this.luckyBox.active) {
      this.luckyBox.spawnTimer--;
      if (this.luckyBox.spawnTimer <= 0) {
        this.spawnLuckyBox();
      }
    }

    const players = this.is3P ? [this.p1, this.p2, this.p3] : [this.p1, this.p2];
    players.forEach(p => {
      if (p.activeLuckyEffect && p.luckyEffectTimer > 0) {
        p.luckyEffectTimer--;
        if (p.luckyEffectTimer === 0) p.activeLuckyEffect = null;
      }
    });
  }

  spawnLuckyBox() {
    // Randomly spawn in the center 20% area
    this.luckyBox.x = this.width * 0.4 + Math.random() * (this.width * 0.2);
    // Snap to terrain
    const tx = Math.max(0, Math.min(this.width - 1, Math.round(this.luckyBox.x)));
    this.luckyBox.y = this.terrain[tx] - this.luckyBox.size / 2;
    this.luckyBox.active = true;
    
    this.particles.spawnExplosion(this.luckyBox.x, this.luckyBox.y, '#ffffff', 10, 0.5);
  }

  activateLuckyBoxEffect(ownerKey) {
    this.luckyBox.active = false;
    this.luckyBox.spawnTimer = 180 + Math.random() * 300;
    
    let player = this.p1;
    if (ownerKey === 'p2') player = this.p2;
    else if (ownerKey === 'p3' && this.is3P) player = this.p3;
    
    if (!player || player.health <= 0) return;

    const types = ['NUKE', 'DUD', 'HEAL', 'BACKFIRE'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    audio.playPowerupUse();
    
    player.activeLuckyEffect = type;
    if (type === 'HEAL' || type === 'BACKFIRE') {
      player.luckyEffectTimer = 180;
    } else {
      player.luckyEffectTimer = -1; // indefinite until fired
    }

    if (type === 'NUKE' || type === 'DUD') {
      player.weapon = type;
    } else if (type === 'HEAL') {
      player.health = Math.min(100, player.health + 35);
      this.particles.spawnExplosion(player.x, player.y - 10, '#39ff14', 15, 1);
    } else if (type === 'BACKFIRE') {
      player.health = Math.max(0, player.health - 20);
      this.particles.spawnExplosion(player.x, player.y - 10, '#ff3333', 15, 1);
    }
  }

  /* ==========================================================================
     SIGNALING MULTIPLAYER STATE SYNC PROTOCOLS
     ========================================================================== */

  getState() {
    const statePacket = {
      p1: {
        x: this.p1.x,
        y: this.p1.y,
        health: this.p1.health,
        angle: this.p1.angle,
        power: this.p1.power,
        weapon: this.p1.weapon,
        ammo: this.p1.ammo,
        radius: this.p1.radius,
        activeLuckyEffect: this.p1.activeLuckyEffect
      },
      p2: {
        x: this.p2.x,
        y: this.p2.y,
        health: this.p2.health,
        angle: this.p2.angle,
        power: this.p2.power,
        weapon: this.p2.weapon,
        ammo: this.p2.ammo,
        radius: this.p2.radius,
        activeLuckyEffect: this.p2.activeLuckyEffect
      },
      projectiles: this.projectiles.map(p => ({
        x: p.pos.x,
        y: p.pos.y,
        radius: p.radius,
        type: p.type,
        glow: p.glow
      })),
      wind: this.wind,
      windClouds: this.windClouds,
      activePlayer: this.activePlayer,
      state: this.state
    };

    if (this.is3P) {
      statePacket.p3 = {
        x: this.p3.x,
        y: this.p3.y,
        health: this.p3.health,
        angle: this.p3.angle,
        power: this.p3.power,
        weapon: this.p3.weapon,
        ammo: this.p3.ammo,
        radius: this.p3.radius,
        activeLuckyEffect: this.p3.activeLuckyEffect
      };
    }

    statePacket.luckyBox = {
      active: this.luckyBox.active,
      x: this.luckyBox.x,
      y: this.luckyBox.y,
      size: this.luckyBox.size
    };

    if (this.terrainDirty) {
      statePacket.terrain = Array.from(this.terrain);
      this.terrainDirty = false;
    }

    return statePacket;
  }

  applyNetworkState(state) {
    this.p1.x = state.p1.x;
    this.p1.y = state.p1.y;
    this.p1.health = state.p1.health;
    this.p1.angle = state.p1.angle;
    this.p1.power = state.p1.power;
    this.p1.weapon = state.p1.weapon;
    this.p1.ammo = state.p1.ammo;
    this.p1.radius = state.p1.radius;
    this.p1.activeLuckyEffect = state.p1.activeLuckyEffect;

    this.p2.x = state.p2.x;
    this.p2.y = state.p2.y;
    this.p2.health = state.p2.health;
    this.p2.angle = state.p2.angle;
    this.p2.power = state.p2.power;
    this.p2.weapon = state.p2.weapon;
    this.p2.ammo = state.p2.ammo;
    this.p2.radius = state.p2.radius;
    this.p2.activeLuckyEffect = state.p2.activeLuckyEffect;

    if (this.is3P && state.p3) {
      this.p3.x = state.p3.x;
      this.p3.y = state.p3.y;
      this.p3.health = state.p3.health;
      this.p3.angle = state.p3.angle;
      this.p3.power = state.p3.power;
      this.p3.weapon = state.p3.weapon;
      this.p3.ammo = state.p3.ammo;
      this.p3.radius = state.p3.radius;
      this.p3.activeLuckyEffect = state.p3.activeLuckyEffect;
    }

    this.projectiles = state.projectiles.map(p => ({
      pos: new Vector2D(p.x, p.y),
      radius: p.radius,
      type: p.type,
      glow: p.glow
    }));

    this.wind = state.wind;
    
    if (state.terrain) {
      this.terrain = state.terrain;
    }
    
    this.windClouds = state.windClouds;
    this.activePlayer = state.activePlayer;
    this.state = state.state;

    if (state.luckyBox) {
      this.luckyBox.active = state.luckyBox.active;
      this.luckyBox.x = state.luckyBox.x;
      this.luckyBox.y = state.luckyBox.y;
      this.luckyBox.size = state.luckyBox.size;
    }
  }

  /* ==========================================================================
     CORE RENDERING LOOP
     ========================================================================== */

  render() {
    const ctx = this.ctx;

    // 1. Backdrop
    ctx.fillStyle = '#04020a';
    ctx.fillRect(0, 0, this.width, this.height);

    // Parallax background wireframes
    ctx.save();
    ctx.strokeStyle = 'rgba(157, 78, 221, 0.08)';
    ctx.lineWidth = 1;
    for (let layer = 1; layer <= 2; layer++) {
      ctx.beginPath();
      ctx.moveTo(0, this.height - 40);
      const step = 80;
      const amp = 40 / layer;
      for (let x = 0; x <= this.width; x += step) {
        const peakY = this.height - 180 - Math.sin(x * 0.01 + layer) * amp;
        ctx.lineTo(x, peakY);
      }
      ctx.lineTo(this.width, this.height - 40);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Draw Wind clouds
    ctx.save();
    ctx.strokeStyle = 'rgba(224, 170, 255, 0.06)';
    ctx.lineWidth = 2;
    this.windClouds.forEach(cloud => {
      ctx.beginPath();
      ctx.moveTo(cloud.x, cloud.y);
      ctx.lineTo(cloud.x + cloud.length, cloud.y);
      ctx.stroke();
    });
    ctx.restore();

    // 3. Draw terrain
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, this.height);
    for (let x = 0; x < this.width; x++) {
      ctx.lineTo(x, this.terrain[x]);
    }
    ctx.lineTo(this.width, this.height);
    ctx.closePath();

    ctx.fillStyle = '#0f0c24';
    ctx.fill();

    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(57, 255, 20, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, this.terrain[0]);
    for (let x = 1; x < this.width; x++) {
      ctx.lineTo(x, this.terrain[x]);
    }
    ctx.stroke();
    ctx.restore();

    // 4. Draw Wind vane
    ctx.save();
    const wx = this.width / 2;
    const wy = 40;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(wx - 80, wy - 15, 160, 30);
    
    ctx.font = '10px Orbitron';
    ctx.fillStyle = '#8b88a1';
    ctx.textAlign = 'center';
    ctx.fillText('WIND SYSTEM', wx, wy - 20);

    ctx.strokeStyle = '#e0aaff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + this.wind * 12, wy);
    ctx.stroke();

    if (Math.abs(this.wind) > 0.2) {
      const tipX = wx + this.wind * 12;
      const arrowSize = 5;
      const sign = Math.sign(this.wind);
      ctx.beginPath();
      ctx.moveTo(tipX, wy);
      ctx.lineTo(tipX - arrowSize * sign, wy - arrowSize);
      ctx.lineTo(tipX - arrowSize * sign, wy + arrowSize);
      ctx.closePath();
      ctx.fillStyle = '#e0aaff';
      ctx.fill();
    }

    // Draw Lucky Box
    if (this.luckyBox.active) {
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ffff00';
      ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      
      const hs = this.luckyBox.size / 2;
      ctx.beginPath();
      ctx.rect(this.luckyBox.x - hs, this.luckyBox.y - hs, this.luckyBox.size, this.luckyBox.size);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Orbitron';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', this.luckyBox.x, this.luckyBox.y);
      ctx.restore();
    } else {
      ctx.fillStyle = '#8b88a1';
      ctx.font = '10px Orbitron';
      ctx.fillText('CALM', wx, wy + 4);
    }
    ctx.restore();

    // 5. Draw Player Tanks & Turrets
    const tanks = this.is3P ? [this.p1, this.p2, this.p3] : [this.p1, this.p2];
    tanks.forEach(p => {
      if (p.health <= 0) return;

      const yOffset = this.mods.chaos ? 12 : 6;

      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      
      ctx.fillStyle = '#1b1730';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(p.x - p.radius, p.y - yOffset, p.radius * 2, yOffset, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y - yOffset, p.radius * 0.6, Math.PI, 0);
      ctx.fill();

      // Barrel
      const rad = (p.angle * Math.PI) / 180;
      const barrelLength = this.mods.chaos ? 26 : 16;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = this.mods.chaos ? 5 : 3.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - yOffset);
      ctx.lineTo(p.x + Math.cos(rad) * barrelLength, p.y - yOffset - Math.sin(rad) * barrelLength);
      ctx.stroke();
      ctx.restore();

      // Aim Trajectory Helper Line
      if (this.state === 'CONTROLS' && this.activePlayer === p.key) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.setLineDash([3, 5]);
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        const startRad = (p.angle * Math.PI) / 180;
        let tx = p.x + Math.cos(startRad) * barrelLength;
        let ty = p.y - yOffset - Math.sin(startRad) * barrelLength;
        
        const powerScale = this.mods.turbo ? 0.22 : 0.14;
        const launchSpd = p.power * powerScale;
        let tvx = Math.cos(startRad) * launchSpd;
        let tvy = -Math.sin(startRad) * launchSpd;

        ctx.moveTo(tx, ty);
        for (let step = 0; step < 28; step++) {
          tvy += this.gravity;
          tvx += this.wind * 0.004;
          tx += tvx;
          ty += tvy;
          ctx.lineTo(tx, ty);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Overlays
      ctx.save();
      ctx.font = 'bold 8px Orbitron';
      ctx.fillStyle = '#8b88a1';
      ctx.textAlign = 'center';

      const ammoStr = `AM: ${p.weapon === 'CLUSTER' ? 'CLUSTER' : 'STD'} (${p.ammo.cluster})`;
      ctx.fillText(ammoStr, p.x, p.y - p.radius - 16);

      const barW = p.radius * 2.2;
      const barH = 3;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(p.x - barW / 2, p.y - p.radius - 10, barW, barH);
      
      ctx.fillStyle = p.health > 40 ? p.color : '#ff0000';
      ctx.fillRect(p.x - barW / 2, p.y - p.radius - 10, barW * (p.health / 100), barH);
      ctx.restore();

      // Render Active Lucky Effect in Screen Corners
      if (p.activeLuckyEffect) {
        let textX = 70;
        let textY = 40;
        if (p.key === 'p2') { textX = this.width - 70; }
        if (p.key === 'p3') { textX = this.width / 2; textY = 80; }
        
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(textX - 55, textY - 15, 110, 30, 6);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = p.color;
        ctx.font = 'bold 12px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let emoji = '⚡';
        if (p.activeLuckyEffect === 'NUKE') emoji = '☢️';
        if (p.activeLuckyEffect === 'DUD') emoji = '🌧️';
        if (p.activeLuckyEffect === 'HEAL') emoji = '💚';
        if (p.activeLuckyEffect === 'BACKFIRE') emoji = '💥';
        ctx.fillText(`${emoji} ${p.activeLuckyEffect}`, textX, textY);
        ctx.restore();
      }
    });

    // 6. Draw Projectiles
    this.projectiles.forEach(proj => {
      if (Math.random() < 0.4) {
        this.particles.spawnTrail(proj.pos.x, proj.pos.y, proj.glow);
      }

      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = proj.glow;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(proj.pos.x, proj.pos.y, proj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    this.particles.draw(ctx);

    // 7. Active Turn overlay
    if (this.state === 'CONTROLS' && !this.paused) {
      ctx.save();
      ctx.font = '11px Orbitron';
      
      let pColor = '#00f0ff';
      let pName = 'CYAN';
      if (this.activePlayer === 'p2') {
        pColor = '#ff007f';
        pName = 'PINK';
      } else if (this.activePlayer === 'p3') {
        pColor = '#ffff00';
        pName = 'YELLOW';
      }

      ctx.fillStyle = pColor;
      ctx.textAlign = 'center';
      
      const activeTank = this.activePlayer === 'p1' ? this.p1 : (this.activePlayer === 'p2' ? this.p2 : this.p3);
      const text = `${pName} TURN // ANGLE: ${Math.round(activeTank.angle)}° | PWR: ${Math.round(activeTank.power)}%`;
      ctx.fillText(text, this.width / 2, this.height - 15);
      ctx.restore();
    }

    // 8. Background Score
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.font = '80px Orbitron';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    if (this.is3P) {
      ctx.fillText(`${this.scores.p1} - ${this.scores.p2} - ${this.scores.p3}`, this.width / 2, this.height / 2 - 40);
    } else {
      ctx.fillText(`${this.scores.p1} - ${this.scores.p2}`, this.width / 2, this.height / 2 - 40);
    }
    ctx.restore();
  }

  /**
   * Framework tick executor.
   */
  tick() {
    if (this.paused || this.winner) return;

    this.updateControls();
    this.updateProjectiles();
    this.updateLuckyBox();
    this.particles.update();

    this.render();
  }
}
