import { Vector2D, ParticleSystem, triggerScreenShake } from './engine.js';
import { audio } from './audio.js';

export default class GameNeonVortex {
  constructor(canvas, input, onGameOver, mods = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input; // Input state manager
    this.onGameOver = onGameOver; // Callback to end the game
    this.mods = mods;

    // Arena definitions
    this.center = new Vector2D(400, 250);
    this.platformRadius = 220;
    this.vortexRadius = 30;

    // Game state
    this.tickCount = 0;
    this.numPlayers = Math.max(3, Math.min(4, mods.playerMode || 3));
    this.matchWins = [0, 0, 0, 0];
    this.winsNeeded = 3;
    this.matchActive = true;
    this.matchWinner = null;
    this.gameWinner = null;
    this.matchOverTimer = 0;

    // Stars background
    this.stars = [];
    for (let i = 0; i < 50; i++) {
      this.stars.push({
        x: Math.random() * 800,
        y: Math.random() * 500,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
        blinkSpeed: Math.random() * 0.05 + 0.01,
      });
    }

    this.playerColors = ['#00f0ff', '#ff007f', '#ffff00', '#39ff14'];
    this.basePlayerRadius = this.mods.chaos ? 24 : 16;
    this.players = [];
    this.powerups = [];
    this.powerupTimer = 0;

    this.particles = new ParticleSystem();
    this.shockwaves = []; // For repulsor and vortex eruptions

    this.initMatch();
  }

  initMatch() {
    this.matchActive = true;
    this.matchWinner = null;
    this.matchOverTimer = 0;
    this.players = [];
    this.powerups = [];
    this.powerupTimer = 900; // 15 seconds at 60fps
    this.particles.clear();
    this.shockwaves = [];

    // Vortex phases
    this.vortex = {
      phase: 'STABLE', // STABLE, SUCKING, WARNING, ERUPTING
      timer: 480, // 8s
      rotation: 0
    };

    // Spawn players
    for (let i = 0; i < this.numPlayers; i++) {
      const angle = (Math.PI * 2 / this.numPlayers) * i - Math.PI / 2;
      const spawnDist = 180;
      this.players.push({
        id: i,
        pos: new Vector2D(this.center.x + Math.cos(angle) * spawnDist, this.center.y + Math.sin(angle) * spawnDist),
        vel: new Vector2D(0, 0),
        color: this.playerColors[i],
        radius: this.basePlayerRadius,
        lives: 3,
        alive: true,
        respawnTimer: 0,
        energy: 100,
        cooldown: 0,
        anchorTimer: 0,
        shieldTimer: 0,
        bootsTimer: 0,
        stats: { eliminations: 0 }
      });
    }
  }

  tick() {
    if (this.gameWinner !== null) return;
    this.tickCount++;
    this.particles.update();

    if (!this.matchActive) {
      this.matchOverTimer--;
      if (this.matchOverTimer <= 0) {
        if (this.gameWinner === null) {
          this.initMatch();
        }
      }
      return;
    }

    this.updateVortex();
    this.updatePowerups();
    this.updatePlayers();
    this.updateShockwaves();
    this.checkMatchEnd();
  }

  updateVortex() {
    this.vortex.rotation += this.mods.chaos ? 0.1 : 0.05;
    this.vortex.timer--;

    if (this.vortex.timer <= 0) {
      switch (this.vortex.phase) {
        case 'STABLE':
          this.vortex.phase = 'SUCKING';
          this.vortex.timer = 240; // 4s
          if (audio) audio.playBoost();
          break;
        case 'SUCKING':
          this.vortex.phase = 'WARNING';
          this.vortex.timer = 60; // 1s warning
          if (audio) audio.playMenuTick();
          break;
        case 'WARNING':
          this.vortex.phase = 'ERUPTING';
          this.vortex.timer = 120; // 2s
          if (audio) audio.playExplosion();
          triggerScreenShake();
          this.spawnShockwave(this.center, '#ff00ff', 400, 20);
          break;
        case 'ERUPTING':
          this.vortex.phase = 'STABLE';
          this.vortex.timer = 480; // 8s
          break;
      }
    }
  }

  getVortexForce() {
    let baseForce = 0;
    if (this.vortex.phase === 'STABLE') baseForce = -0.04; // Inward
    else if (this.vortex.phase === 'SUCKING') baseForce = -0.18; // Strong inward
    else if (this.vortex.phase === 'WARNING') baseForce = -0.18; // Same as sucking
    else if (this.vortex.phase === 'ERUPTING') baseForce = 0.45; // Outward blast

    if (this.mods.chaos) {
      baseForce *= 1.5;
    }
    return baseForce;
  }

  updatePlayers() {
    const vortexForce = this.getVortexForce();
    const accel = this.mods.turbo ? 0.6 : 0.4;
    const drag = 0.88;
    const maxSpeed = this.mods.turbo ? 8 : 6;
    const repulsorCost = 40;
    const repulsorCooldown = 90; // 1.5s

    const keyMaps = [
      { up:'KeyW', down:'KeyS', left:'KeyA', right:'KeyD', action:'Space' },
      { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight', action:'Enter' },
      { up:'KeyI', down:'KeyK', left:'KeyJ', right:'KeyL', action:'KeyU' },
      { up:'KeyT', down:'KeyG', left:'KeyF', right:'KeyH', action:'KeyY' }
    ];

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p.alive) {
        if (p.lives > 0) {
          p.respawnTimer--;
          if (p.respawnTimer <= 0) {
            p.alive = true;
            // Spawn at random edge
            const angle = Math.random() * Math.PI * 2;
            p.pos = new Vector2D(this.center.x + Math.cos(angle) * 190, this.center.y + Math.sin(angle) * 190);
            p.vel = new Vector2D(0, 0);
            p.shieldTimer = 180; // 3s invuln on spawn
            this.spawnParticles(p.pos, p.color, 15, 3);
          }
        }
        continue;
      }

      // Decrement timers
      if (p.cooldown > 0) p.cooldown--;
      if (p.anchorTimer > 0) p.anchorTimer--;
      if (p.shieldTimer > 0) p.shieldTimer--;
      if (p.bootsTimer > 0) p.bootsTimer--;
      if (p.energy < 100) p.energy = Math.min(100, p.energy + 0.25);

      // Input handling
      const km = keyMaps[i];
      let moveDir = new Vector2D(0, 0);
      if (this.input.isPressed(km.up)) moveDir.y -= 1;
      if (this.input.isPressed(km.down)) moveDir.y += 1;
      if (this.input.isPressed(km.left)) moveDir.x -= 1;
      if (this.input.isPressed(km.right)) moveDir.x += 1;

      let isMoving = moveDir.magSq() > 0;
      if (isMoving) moveDir = moveDir.normalise();

      // Action / Repulsor / Anchor
      if (this.input.isPressed(km.action) && p.cooldown <= 0 && p.energy >= repulsorCost) {
        p.energy -= repulsorCost;
        p.cooldown = repulsorCooldown;
        
        if (isMoving) {
          // Gravity Anchor
          p.anchorTimer = 120; // 2s
          if (audio) audio.playPowerupUse(); // Anchor sound
          this.spawnParticles(p.pos, '#ffffff', 20, 2);
        } else {
          // Repulsor
          if (audio) audio.playBoost();
          this.spawnShockwave(p.pos, p.color, 160, 10);
          
          let nearestEnemy = null;
          let nearestDist = Infinity;

          for (let j = 0; j < this.players.length; j++) {
            if (i === j) continue;
            const op = this.players[j];
            if (!op.alive) continue;
            const dist = p.pos.dist(op.pos);
            if (dist < 160) {
              const pushDir = op.pos.copy().sub(p.pos).normalise();
              op.vel.add(pushDir.copy().mult(6)); // Force 6
              if (dist < nearestDist) {
                nearestDist = dist;
                nearestEnemy = op;
              }
            }
          }
          // Recoil
          if (nearestEnemy) {
            const recoilDir = p.pos.copy().sub(nearestEnemy.pos).normalise();
            p.vel.add(recoilDir.mult(2.5));
          }
        }
      }

      // Apply movement
      if (isMoving && p.anchorTimer <= 0) {
        p.vel.add(moveDir.copy().mult(accel));
      }

      // Apply vortex gravity
      const distToVortex = p.pos.dist(this.center);
      if (distToVortex > 0) {
        let pullMod = 1;
        if (p.anchorTimer > 0) pullMod = 0.2;
        const pullDir = p.pos.copy().sub(this.center).normalise();
        p.vel.add(pullDir.mult(vortexForce * pullMod));
      }

      // Drag
      p.vel.mult(drag);
      if (p.vel.mag() > maxSpeed) {
        p.vel = p.vel.normalise().mult(maxSpeed);
      }

      // Apply velocity
      p.pos.add(p.vel);

      // Player collisions
      for (let j = i + 1; j < this.players.length; j++) {
        const p2 = this.players[j];
        if (!p2.alive) continue;
        const dist = p.pos.dist(p2.pos);
        const minDist = p.radius + p2.radius;
        if (dist < minDist && dist > 0) {
          const overlap = minDist - dist;
          const normal = p.pos.copy().sub(p2.pos).normalise();
          
          // Separate
          p.pos.add(normal.copy().mult(overlap * 0.5));
          p2.pos.sub(normal.copy().mult(overlap * 0.5));
          
          // Exchange velocity (elastic collision)
          const relVel = p.vel.copy().sub(p2.vel);
          const speed = relVel.dot(normal);
          if (speed < 0) {
            const bounciness = 0.8;
            const impulse = -(1 + bounciness) * speed / 2;
            const impulseVec = normal.copy().mult(impulse);
            p.vel.add(impulseVec);
            p2.vel.sub(impulseVec);
            if (audio) audio.playBounce();
            triggerScreenShake();
          }
        }
      }

      // Check bounds / eliminations
      let eliminated = false;
      const dCenter = p.pos.dist(this.center);
      
      // Into vortex
      if (dCenter < this.vortexRadius) {
        eliminated = true;
        this.spawnParticles(p.pos, '#ffffff', 30, 5);
      }
      
      // Off edge
      if (dCenter > this.platformRadius) {
        if (p.bootsTimer > 0) {
          // Stick to edge
          const normal = this.center.copy().sub(p.pos).normalise();
          p.pos = this.center.copy().sub(normal.copy().mult(this.platformRadius));
          // Project velocity along tangent
          const dot = p.vel.dot(normal);
          if (dot < 0) {
            p.vel.sub(normal.mult(dot));
          }
        } else {
          eliminated = true;
          this.spawnParticles(p.pos, p.color, 30, 4);
        }
      }

      if (eliminated) {
        if (p.shieldTimer > 0) {
          // Absorb
          p.shieldTimer = 0;
          p.pos = this.center.copy(); // Teleport slightly safer or bounce
          p.pos.x += (Math.random() - 0.5) * 100;
          p.pos.y += (Math.random() - 0.5) * 100;
          p.vel.mult(0);
          if (audio) audio.playBounce();
          this.spawnParticles(p.pos, '#00ff00', 20, 2);
        } else {
          p.alive = false;
          p.lives--;
          if (audio) audio.playExplosion();
          triggerScreenShake();
          if (p.lives > 0) {
            p.respawnTimer = 120; // 2s
          }
        }
      }
    }
  }

  updatePowerups() {
    this.powerupTimer--;
    if (this.powerupTimer <= 0) {
      this.powerupTimer = 900 + Math.random() * 300; // 15-20s
      this.spawnPowerup();
    }

    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      pu.timer--;
      if (pu.timer <= 0) {
        this.powerups.splice(i, 1);
        continue;
      }

      // Check collision
      for (const p of this.players) {
        if (!p.alive) continue;
        if (p.pos.dist(pu.pos) < p.radius + 10) {
          this.collectPowerup(p, pu);
          this.powerups.splice(i, 1);
          break;
        }
      }
    }
  }

  spawnPowerup() {
    const types = ['SHIELD', 'GRAVITY_BOOTS', 'VORTEX_BOMB'];
    const type = types[Math.floor(Math.random() * types.length)];
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (this.platformRadius - 40) + 40; // between 40 and edge
    
    this.powerups.push({
      type,
      pos: new Vector2D(this.center.x + Math.cos(angle) * dist, this.center.y + Math.sin(angle) * dist),
      timer: 600, // 10s lifetime
      yOffset: 0
    });
    if (audio) audio.playPowerup();
  }

  collectPowerup(player, pu) {
    if (audio) audio.playPowerupUse();
    this.spawnParticles(pu.pos, '#ffffff', 20, 3);
    
    switch (pu.type) {
      case 'SHIELD':
        player.shieldTimer = 480; // 8s
        break;
      case 'GRAVITY_BOOTS':
        player.bootsTimer = 300; // 5s
        break;
      case 'VORTEX_BOMB':
        // Instant mini-eruption
        this.spawnShockwave(player.pos, '#ffaa00', 250, 15);
        for (const op of this.players) {
          if (op.id === player.id || !op.alive) continue;
          const dist = player.pos.dist(op.pos);
          if (dist < 250) {
            const pushDir = op.pos.copy().sub(player.pos).normalise();
            op.vel.add(pushDir.mult(8));
          }
        }
        triggerScreenShake();
        break;
    }
  }

  spawnShockwave(pos, color, maxRadius, life) {
    this.shockwaves.push({ pos: pos.copy(), color, radius: 0, maxRadius, life, maxLife: life });
  }

  updateShockwaves() {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life--;
      sw.radius += sw.maxRadius / sw.maxLife;
      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }
  }

  spawnParticles(pos, color, count, speed) {
    this.particles.spawnExplosion(pos.x, pos.y, color, count, speed * 0.4);
  }

  checkMatchEnd() {
    let alivePlayers = 0;
    let lastAlive = null;

    for (const p of this.players) {
      if (p.alive || p.lives > 0) {
        alivePlayers++;
        lastAlive = p;
      }
    }

    if (alivePlayers <= 1) {
      this.matchActive = false;
      this.matchOverTimer = 180; // 3s
      if (lastAlive) {
        this.matchWinner = lastAlive.id;
        this.matchWins[lastAlive.id]++;
        if (this.matchWins[lastAlive.id] >= this.winsNeeded) {
          this.gameWinner = lastAlive.id;
          const pKeys = ['p1','p2','p3','p4'];
          const wk = pKeys[this.gameWinner] || 'p1';
          const scores = this.matchWins.slice(0, this.numPlayers).join(' - ');
          if (this.onGameOver) this.onGameOver(wk, scores);
        }
      } else {
        // Draw
        this.matchWinner = -1; 
      }
    }
  }

  render() {
    // Clear bg
    this.ctx.fillStyle = '#030005';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Render stars
    this.ctx.save();
    for (const star of this.stars) {
      star.alpha += (Math.random() > 0.5 ? 1 : -1) * star.blinkSpeed;
      if (star.alpha > 1) star.alpha = 1;
      if (star.alpha < 0.1) star.alpha = 0.1;
      
      this.ctx.globalAlpha = star.alpha;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();

    // Render platform
    this.ctx.save();
    this.ctx.translate(this.center.x, this.center.y);
    
    // Outer glow
    this.ctx.shadowBlur = 20;
    this.ctx.shadowColor = 'rgba(157,78,221,1)';
    this.ctx.strokeStyle = 'rgba(157,78,221,0.7)';
    this.ctx.lineWidth = 4;
    this.ctx.fillStyle = 'rgba(157,78,221,0.05)';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.platformRadius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();

    // Render Vortex
    this.ctx.save();
    this.ctx.translate(this.center.x, this.center.y);
    this.ctx.rotate(this.vortex.rotation);
    
    let vortexColor = '#9d4edd';
    if (this.vortex.phase === 'SUCKING') vortexColor = '#ff00ff';
    if (this.vortex.phase === 'WARNING') vortexColor = '#ff0000';
    if (this.vortex.phase === 'ERUPTING') vortexColor = '#ffffff';

    this.ctx.shadowBlur = 30;
    this.ctx.shadowColor = vortexColor;
    this.ctx.fillStyle = '#000000';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.vortexRadius, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const r = this.vortexRadius + (this.tickCount * 0.5 + i * 10) % 20;
      this.ctx.strokeStyle = vortexColor;
      this.ctx.globalAlpha = 1 - ((r - this.vortexRadius) / 20);
      this.ctx.beginPath();
      this.ctx.arc(0, 0, r, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    this.ctx.restore();

    // Render Powerups
    for (const pu of this.powerups) {
      pu.yOffset = Math.sin(this.tickCount * 0.1) * 5;
      this.ctx.save();
      this.ctx.translate(pu.pos.x, pu.pos.y + pu.yOffset);
      let pColor = '#ffffff';
      if (pu.type === 'SHIELD') pColor = '#00ff00';
      else if (pu.type === 'GRAVITY_BOOTS') pColor = '#00ffff';
      else if (pu.type === 'VORTEX_BOMB') pColor = '#ffaa00';
      
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = pColor;
      this.ctx.fillStyle = pColor;
      this.ctx.beginPath();
      if (pu.type === 'SHIELD') {
        this.ctx.arc(0, 0, 8, 0, Math.PI * 2);
      } else {
        this.ctx.rect(-6, -6, 12, 12);
      }
      this.ctx.fill();
      
      // Timer outline
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 12, -Math.PI / 2, -Math.PI / 2 + (pu.timer / 600) * Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Render Shockwaves
    for (const sw of this.shockwaves) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(sw.pos.x, sw.pos.y, sw.radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = sw.color;
      this.ctx.lineWidth = 4 * (sw.life / sw.maxLife);
      this.ctx.globalAlpha = sw.life / sw.maxLife;
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Render Players
    for (const p of this.players) {
      if (!p.alive) {
        if (p.lives <= 0) continue; // Out of game
        continue; // Dead but respawning
      }

      this.ctx.save();
      this.ctx.translate(p.pos.x, p.pos.y);

      // Effects
      if (p.anchorTimer > 0) {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.radius + 8, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
      }
      if (p.shieldTimer > 0) {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.radius + 5, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
        this.ctx.fill();
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
      if (p.bootsTimer > 0) {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.radius + 2, 0, Math.PI * 2);
        this.ctx.setLineDash([4, 4]);
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }

      // Player body
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = p.color;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // White core
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, p.radius * 0.4, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();

      // HUD Energy Bar above player
      this.ctx.save();
      this.ctx.translate(p.pos.x, p.pos.y - p.radius - 12);
      this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
      this.ctx.fillRect(-15, 0, 30, 4);
      this.ctx.fillStyle = p.energy >= 40 ? p.color : '#555555';
      this.ctx.fillRect(-15, 0, 30 * (p.energy / 100), 4);
      this.ctx.restore();
    }

    this.particles.draw(this.ctx);

    this.renderHUD();
  }

  renderHUD() {
    this.ctx.save();
    
    // Vortex Phase
    this.ctx.textAlign = 'center';
    this.ctx.font = '20px "Press Start 2P", monospace, sans-serif';
    
    let phaseText = this.vortex.phase;
    let phaseColor = '#9d4edd';
    if (this.vortex.phase === 'WARNING') phaseColor = '#ff0000';
    if (this.vortex.phase === 'ERUPTING') phaseColor = '#ffffff';
    if (this.vortex.phase === 'SUCKING') phaseColor = '#ff00ff';

    this.ctx.fillStyle = phaseColor;
    this.ctx.fillText(`${phaseText} - ${Math.ceil(this.vortex.timer / 60)}s`, 400, 30);

    // Player Lives & Matches
    const padding = 20;
    const positions = [
      { x: padding, y: padding, align: 'left' },
      { x: 800 - padding, y: padding, align: 'right' },
      { x: padding, y: 500 - padding, align: 'left' },
      { x: 800 - padding, y: 500 - padding, align: 'right' }
    ];

    for (let i = 0; i < this.numPlayers; i++) {
      const pos = positions[i];
      const p = this.players[i] || { lives: 0 };
      
      this.ctx.textAlign = pos.align;
      this.ctx.font = '14px "Press Start 2P", monospace, sans-serif';
      this.ctx.fillStyle = this.playerColors[i];
      this.ctx.fillText(`P${i + 1} WINS: ${this.matchWins[i]}/${this.winsNeeded}`, pos.x, pos.y + (i > 1 ? -20 : 20));
      
      // Lives
      let lx = pos.x;
      let ly = pos.y + (i > 1 ? 0 : 40);
      const dir = pos.align === 'left' ? 1 : -1;
      
      for (let l = 0; l < 3; l++) {
        this.ctx.beginPath();
        this.ctx.arc(lx + (l * 15 * dir) + (dir === -1 ? -5 : 5), ly, 5, 0, Math.PI * 2);
        if (l < p.lives) {
          this.ctx.fill();
        } else {
          this.ctx.strokeStyle = this.playerColors[i];
          this.ctx.lineWidth = 1;
          this.ctx.stroke();
        }
      }
    }

    if (!this.matchActive && this.gameWinner === null) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(0, 0, 800, 500);
      this.ctx.textAlign = 'center';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '30px "Press Start 2P", monospace, sans-serif';
      if (this.matchWinner >= 0) {
        this.ctx.fillText(`P${this.matchWinner + 1} WINS ROUND!`, 400, 250);
      } else {
        this.ctx.fillText(`ROUND DRAW!`, 400, 250);
      }
    }

    if (this.gameWinner !== null) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      this.ctx.fillRect(0, 0, 800, 500);
      this.ctx.textAlign = 'center';
      this.ctx.fillStyle = this.playerColors[this.gameWinner];
      this.ctx.font = '40px "Press Start 2P", monospace, sans-serif';
      this.ctx.fillText(`P${this.gameWinner + 1} WINS MATCH!`, 400, 250);
    }

    this.ctx.restore();
  }

  getState() {
    return {
      tickCount: this.tickCount,
      players: this.players.map(p => ({ ...p, pos: p.pos.copy(), vel: p.vel.copy() })),
      vortex: { ...this.vortex },
      powerups: this.powerups.map(pu => ({ ...pu, pos: pu.pos.copy() })),
      matchWins: [...this.matchWins],
      matchActive: this.matchActive,
      matchOverTimer: this.matchOverTimer,
      gameWinner: this.gameWinner,
      shockwaves: this.shockwaves.map(sw => ({ ...sw, pos: sw.pos.copy() }))
    };
  }

  applyNetworkState(state) {
    this.tickCount = state.tickCount;
    this.vortex = { ...state.vortex };
    this.matchWins = [...state.matchWins];
    this.matchActive = state.matchActive;
    this.matchOverTimer = state.matchOverTimer;
    this.gameWinner = state.gameWinner;

    for (let i = 0; i < state.players.length; i++) {
      if (this.players[i]) {
        Object.assign(this.players[i], state.players[i]);
        this.players[i].pos = new Vector2D(state.players[i].pos.x, state.players[i].pos.y);
        this.players[i].vel = new Vector2D(state.players[i].vel.x, state.players[i].vel.y);
      }
    }

    this.powerups = state.powerups.map(pu => ({
      ...pu,
      pos: new Vector2D(pu.pos.x, pu.pos.y)
    }));
    
    this.shockwaves = state.shockwaves.map(sw => ({
      ...sw,
      pos: new Vector2D(sw.pos.x, sw.pos.y)
    }));
  }

  cleanup() {
    this.particles.clear();
  }
}
