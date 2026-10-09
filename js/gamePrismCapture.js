import { Vector2D, ParticleSystem, triggerScreenShake } from './engine.js';
import { audio } from './audio.js';

const WIDTH = 800;
const HEIGHT = 500;
const GOAL_SCORE = 100;
const OVERLOAD_TIME = 15 * 60; // 15 seconds
const OVERLOAD_DURATION = 5 * 60; // 5 seconds
const SLAM_COOLDOWN = 3 * 60; // 3 seconds
const DASH_COOLDOWN = 60; // 1 second
const POWERUP_SPAWN_MIN = 20 * 60;
const POWERUP_SPAWN_MAX = 30 * 60;

const PLAYER_COLORS = ['#00f0ff', '#ff007f', '#ffff00', '#39ff14'];
const ZONE_TINTS = [
    'rgba(0, 240, 255, 0.05)',
    'rgba(255, 0, 127, 0.05)',
    'rgba(255, 255, 0, 0.05)',
    'rgba(57, 255, 20, 0.05)'
];

class Prism {
    constructor(chaos) {
        this.pos = new Vector2D(WIDTH / 2, HEIGHT / 2);
        this.vel = new Vector2D(Math.random() - 0.5, Math.random() - 0.5).normalise().mult(1.5);
        this.radius = chaos ? 22 : 14;
        this.holderId = -1;
        this.angle = 0;
        this.spinSpeed = 0.02;
        this.cooldown = 0; // Cooldown before it can be picked up again
        this.anchored = 0; // Anchor powerup effect
    }

    update() {
        if (this.anchored > 0) {
            this.anchored--;
            this.vel.x = 0;
            this.vel.y = 0;
        } else if (this.holderId === -1) {
            this.pos.add(this.vel);
            // Elastic wall bounce
            if (this.pos.x - this.radius < 0) { this.pos.x = this.radius; this.vel.x *= -1; }
            if (this.pos.x + this.radius > WIDTH) { this.pos.x = WIDTH - this.radius; this.vel.x *= -1; }
            if (this.pos.y - this.radius < 0) { this.pos.y = this.radius; this.vel.y *= -1; }
            if (this.pos.y + this.radius > HEIGHT) { this.pos.y = HEIGHT - this.radius; this.vel.y *= -1; }
            
            // Add slight drag if moving very fast (after a slam)
            if (this.vel.mag() > 2) {
                this.vel.mult(0.98);
            } else if (this.vel.mag() < 1 && this.cooldown === 0) {
                // Keep some minimum drift
                this.vel.normalise().mult(1);
            }

            this.spinSpeed = 0.02 + (this.vel.mag() * 0.01);
        } else {
            this.spinSpeed = 0.1;
        }

        if (this.cooldown > 0) {
            this.cooldown--;
        }

        this.angle += this.spinSpeed;
    }

    render(ctx, color, isOverloaded, flashFrame) {
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.angle);

        // Flash white during overload
        const drawColor = (isOverloaded && flashFrame) ? '#ffffff' : color;
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = drawColor;
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = 2;
        ctx.fillStyle = drawColor;

        ctx.beginPath();
        ctx.moveTo(0, -this.radius);
        ctx.lineTo(this.radius * 0.7, 0);
        ctx.lineTo(0, this.radius);
        ctx.lineTo(-this.radius * 0.7, 0);
        ctx.closePath();
        
        ctx.stroke();
        
        ctx.globalAlpha = 0.3;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Inner core
        ctx.beginPath();
        ctx.moveTo(0, -this.radius * 0.5);
        ctx.lineTo(this.radius * 0.35, 0);
        ctx.lineTo(0, this.radius * 0.5);
        ctx.lineTo(-this.radius * 0.35, 0);
        ctx.closePath();
        ctx.fillStyle = '#fff';
        ctx.fill();

        ctx.restore();
    }
}

class Powerup {
    constructor(type, x, y) {
        this.type = type; // 0: MAGNET, 1: GHOST, 2: ANCHOR
        this.pos = new Vector2D(x, y);
        this.radius = 12;
        this.angle = 0;
        this.active = true;
        this.life = 10 * 60; // 10 seconds alive
    }

    update() {
        this.angle += 0.05;
        this.life--;
        if (this.life <= 0) this.active = false;
    }

    render(ctx) {
        if (!this.active) return;
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.angle);
        
        let color = '#fff';
        if (this.type === 0) color = '#00ffff'; // Magnet
        if (this.type === 1) color = '#ff00ff'; // Ghost
        if (this.type === 2) color = '#ffa500'; // Anchor
        if (this.type === 3) color = '#39ff14'; // Push (green)

        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let sym = 'M';
        if (this.type === 1) sym = 'G';
        if (this.type === 2) sym = 'A';
        if (this.type === 3) sym = 'P';
        
        ctx.rotate(-this.angle); // upright text
        ctx.fillText(sym, 0, 1);

        ctx.restore();
    }
}

class Player {
    constructor(id, numPlayers, chaos) {
        this.id = id;
        this.radius = chaos ? 26 : 18;
        this.color = PLAYER_COLORS[id];
        this.pos = this.getSpawnPos(id, numPlayers);
        this.vel = new Vector2D(0, 0);
        this.score = 0;
        
        this.dashCooldown = 0;
        this.stunTime = 0;
        
        this.powerups = {
            magnet: 0,
            ghost: 0,
            push: 0
        };

        this.inputAccel = 0.5;
        this.drag = 0.85;
        this.maxSpeed = 5.5;
        
        this.heldTime = 0; // Consecutive hold frames
        
        // Input state tracking
        this.actionWasDown = false;
    }

    getSpawnPos(id, numPlayers) {
        if (numPlayers === 2) {
            return id === 0 ? new Vector2D(200, 250) : new Vector2D(600, 250);
        } else if (numPlayers === 3) {
            if (id === 0) return new Vector2D(200, 125);
            if (id === 1) return new Vector2D(600, 125);
            if (id === 2) return new Vector2D(400, 375); // Bottom half center
        } else {
            if (id === 0) return new Vector2D(200, 125);
            if (id === 1) return new Vector2D(600, 125);
            if (id === 2) return new Vector2D(200, 375);
            if (id === 3) return new Vector2D(600, 375);
        }
        return new Vector2D(400, 250);
    }

    inHomeZone(numPlayers) {
        if (numPlayers === 2) {
            if (this.id === 0) return this.pos.x < 400;
            if (this.id === 1) return this.pos.x >= 400;
        } else if (numPlayers === 3) {
            if (this.id === 0) return this.pos.x < 400 && this.pos.y < 250;
            if (this.id === 1) return this.pos.x >= 400 && this.pos.y < 250;
            if (this.id === 2) return this.pos.y >= 250;
        } else {
            if (this.id === 0) return this.pos.x < 400 && this.pos.y < 250;
            if (this.id === 1) return this.pos.x >= 400 && this.pos.y < 250;
            if (this.id === 2) return this.pos.x < 400 && this.pos.y >= 250;
            if (this.id === 3) return this.pos.x >= 400 && this.pos.y >= 250;
        }
        return false;
    }

    update(inputState, mods) {
        if (this.stunTime > 0) {
            this.stunTime--;
            this.vel.mult(0.95);
        } else {
            // Apply input
            let move = new Vector2D(0, 0);
            if (inputState.up) move.y -= 1;
            if (inputState.down) move.y += 1;
            if (inputState.left) move.x -= 1;
            if (inputState.right) move.x += 1;

            if (move.mag() > 0) {
                move.normalise().mult(this.inputAccel * (mods.turbo ? 1.3 : 1));
                this.vel.add(move);
            }

            // Drag
            this.vel.mult(this.drag);
            
            // Limit speed
            let maxS = this.maxSpeed * (mods.turbo ? 1.3 : 1);
            if (this.vel.mag() > maxS && this.dashCooldown < DASH_COOLDOWN - 10) { // Allow burst for dash
                this.vel.normalise().mult(maxS);
            }
        }

        this.pos.add(this.vel);

        // Wall collisions
        if (this.pos.x - this.radius < 0) { this.pos.x = this.radius; this.vel.x = 0; }
        if (this.pos.x + this.radius > WIDTH) { this.pos.x = WIDTH - this.radius; this.vel.x = 0; }
        if (this.pos.y - this.radius < 0) { this.pos.y = this.radius; this.vel.y = 0; }
        if (this.pos.y + this.radius > HEIGHT) { this.pos.y = HEIGHT - this.radius; this.vel.y = 0; }

        if (this.dashCooldown > 0) this.dashCooldown--;
        
        if (this.powerups.magnet > 0) this.powerups.magnet--;
        if (this.powerups.ghost > 0) this.powerups.ghost--;
        if (this.powerups.push > 0) this.powerups.push--;
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);

        if (this.stunTime > 0) {
            ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        }
        
        if (this.powerups.ghost > 0) {
            ctx.globalAlpha *= 0.6;
        }

        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Dash cooldown indicator
        if (this.dashCooldown > 0) {
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 4, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (1 - this.dashCooldown / DASH_COOLDOWN)));
            ctx.stroke();
        }

        // Held time indicator
        if (this.heldTime > 0) {
            let progress = Math.min(this.heldTime / OVERLOAD_TIME, 1);
            let pColor = (this.heldTime > OVERLOAD_TIME) ? '#fff' : this.color;
            ctx.strokeStyle = pColor;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 8, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress));
            ctx.stroke();
        }

        ctx.restore();
    }
}

export default class GamePrismCapture {
    constructor(canvas, input, onGameOver, mods = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.input = input;
        this.onGameOver = onGameOver;
        this.mods = mods;

        this.numPlayers = Math.max(2, Math.min(4, mods.playerMode || 2));
        this.players = [];
        for (let i = 0; i < this.numPlayers; i++) {
            this.players.push(new Player(i, this.numPlayers, this.mods.chaos));
        }

        this.prism = new Prism(this.mods.chaos);
        this.particles = new ParticleSystem();
        this.powerups = [];
        
        this.gameOver = false;
        this.winner = -1;
        
        this.powerupTimer = Math.random() * (POWERUP_SPAWN_MAX - POWERUP_SPAWN_MIN) + POWERUP_SPAWN_MIN;

        // Set up input mapping per player
        // P1: WASD, Space (action)
        // P2: Arrows, Enter
        // P3: IJKL, U
        // P4: TFGH, Y
        this.keys = [
            { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', action: 'Space' },
            { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', action: 'Enter' },
            { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', action: 'KeyU' },
            { up: 'KeyT', down: 'KeyG', left: 'KeyF', right: 'KeyH', action: 'KeyY' }
        ];
    }

    tick() {
        if (this.gameOver) return;

        this.prism.update();
        this.particles.update();
        
        // Powerup spawn
        this.powerupTimer--;
        if (this.powerupTimer <= 0) {
            let type = Math.floor(Math.random() * 4);
            let px = 100 + Math.random() * (WIDTH - 200);
            let py = 100 + Math.random() * (HEIGHT - 200);
            this.powerups.push(new Powerup(type, px, py));
            this.powerupTimer = Math.random() * (POWERUP_SPAWN_MAX - POWERUP_SPAWN_MIN) + POWERUP_SPAWN_MIN;
            audio.playPowerup(); // Alert sound
        }

        // Update powerups
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            let p = this.powerups[i];
            p.update();
            if (!p.active) {
                this.powerups.splice(i, 1);
                continue;
            }
            
            // Check pickup
            for (let j = 0; j < this.players.length; j++) {
                let player = this.players[j];
                let dist = p.pos.dist(player.pos);
                if (dist < p.radius + player.radius) {
                    p.active = false;
                    audio.playPowerupUse();
                    if (p.type === 0) player.powerups.magnet = 5 * 60;
                    if (p.type === 1) player.powerups.ghost = 4 * 60;
                    if (p.type === 2) this.prism.anchored = 3 * 60;
                    if (p.type === 3) player.powerups.push = 5 * 60;
                    break;
                }
            }
        }

        for (let i = 0; i < this.players.length; i++) {
            let p = this.players[i];
            let k = this.keys[i];
            
            // Build input state
            let inputState = {
                up: this.input.isPressed(k.up),
                down: this.input.isPressed(k.down),
                left: this.input.isPressed(k.left),
                right: this.input.isPressed(k.right),
                action: this.input.isPressed(k.action)
            };

            p.update(inputState, this.mods);

            // Handle actions
            let actionJustPressed = inputState.action && !p.actionWasDown;
            p.actionWasDown = inputState.action;

            if (this.prism.holderId === p.id) {
                // Player holds prism
                p.heldTime++;
                
                // Position prism near player
                let offset = new Vector2D(Math.cos(p.heldTime * 0.05) * 20, Math.sin(p.heldTime * 0.05) * 20);
                this.prism.pos.x = p.pos.x + offset.x;
                this.prism.pos.y = p.pos.y + offset.y;
                this.prism.vel.x = p.vel.x;
                this.prism.vel.y = p.vel.y;

                // Scoring
                let scoreRate = p.inHomeZone(this.numPlayers) ? 2 : 1;
                if (p.heldTime > OVERLOAD_TIME) {
                    scoreRate *= 2; // Overload bonus
                }
                
                // Add points (scale fractional points to whole points when reaching GOAL)
                // We actually store score as float, display as int
                p.score += scoreRate / 60; 

                // Removed passive gravity shield

                // Slam
                if (actionJustPressed) {
                    this.prism.holderId = -1;
                    p.heldTime = 0;
                    
                    let throwDir = p.vel.copy();
                    if (throwDir.mag() < 0.1) throwDir = new Vector2D(1, 0); // fallback
                    throwDir.normalise();
                    
                    let slamSpeed = this.mods.chaos ? 18 : 12;
                    this.prism.vel = throwDir.mult(slamSpeed);
                    this.prism.cooldown = SLAM_COOLDOWN;
                    
                    triggerScreenShake();
                    audio.playExplosion();

                    // Shockwave
                    for (let j = 0; j < this.players.length; j++) {
                        if (i !== j) {
                            let other = this.players[j];
                            let dist = p.pos.dist(other.pos);
                            let maxDist = this.mods.chaos ? 120 : 80;
                            if (dist < maxDist && dist > 0) {
                                let push = other.pos.copy().sub(p.pos).normalise().mult(this.mods.chaos ? 8 : 5);
                                other.vel.add(push);
                                other.stunTime = 15;
                            }
                        }
                    }

                    // Particles
                    this.particles.spawnExplosion(this.prism.pos.x, this.prism.pos.y, p.color, 20, 1);
                }

                // Overload Burst
                if (p.heldTime >= OVERLOAD_TIME + OVERLOAD_DURATION) {
                    this.prism.holderId = -1;
                    p.heldTime = 0;
                    this.prism.pos = new Vector2D(WIDTH/2, HEIGHT/2); // Reset to center
                    this.prism.vel = new Vector2D(0, 0);
                    this.prism.cooldown = SLAM_COOLDOWN;
                    
                    triggerScreenShake();
                    audio.playExplosion();

                    // Huge stun
                    for (let j = 0; j < this.players.length; j++) {
                        let other = this.players[j];
                        let dist = p.pos.dist(other.pos);
                        if (dist < 150) {
                            let push = other.pos.copy().sub(p.pos).normalise().mult(8);
                            other.vel.add(push);
                            other.stunTime = 90; // 1.5s
                        }
                    }
                    
                    this.particles.spawnExplosion(p.pos.x, p.pos.y, '#ffffff', 50, 2);
                }

            } else {
                // Not holding prism
                p.heldTime = 0;

                // Dash
                if (actionJustPressed && p.dashCooldown === 0 && p.stunTime === 0) {
                    let dashDir = p.vel.copy();
                    if (dashDir.mag() < 0.1) dashDir = new Vector2D(1, 0);
                    dashDir.normalise().mult(8);
                    p.vel.add(dashDir);
                    p.dashCooldown = DASH_COOLDOWN;
                    audio.playBoost();
                    
                    this.particles.spawnExplosion(p.pos.x, p.pos.y, p.color, 5, 0.8);
                }

                // Magnet powerup pulls free prism
                if (p.powerups.magnet > 0 && this.prism.holderId === -1 && this.prism.anchored <= 0) {
                    let toPlayer = p.pos.copy().sub(this.prism.pos).normalise().mult(0.2);
                    this.prism.vel.add(toPlayer);
                }

                // Collision with free prism
                if (this.prism.holderId === -1 && this.prism.cooldown === 0 && p.stunTime === 0) {
                    let dist = p.pos.dist(this.prism.pos);
                    if (dist < p.radius + this.prism.radius) {
                        this.prism.holderId = p.id;
                        this.prism.anchored = 0; // Break anchor
                        audio.playPowerup();
                    }
                }
            }

            // Active Push Powerup: push others away unconditionally if active
            if (p.powerups.push > 0) {
                for (let j = 0; j < this.players.length; j++) {
                    if (i !== j && this.players[j].powerups.ghost === 0) {
                        let other = this.players[j];
                        let dist = p.pos.dist(other.pos);
                        if (dist < 80 && dist > 0) {
                            let push = other.pos.copy().sub(p.pos).normalise().mult(1.2);
                            other.vel.add(push);
                        }
                    }
                }
            }

            // Check win condition
            if (p.score >= GOAL_SCORE && !this.gameOver) {
                this.gameOver = true;
                this.winner = p.id;
                const pKeys = ['p1','p2','p3','p4'];
                this.onGameOver(pKeys[p.id] || 'p1', `${Math.floor(p.score)} pts`);
                audio.playVictory();
            }
        }

        // Check steals
        for (let i = 0; i < this.players.length; i++) {
            let p1 = this.players[i];
            if (this.prism.holderId === p1.id) {
                for (let j = 0; j < this.players.length; j++) {
                    if (i !== j) {
                        let p2 = this.players[j];
                        if (p2.powerups.ghost > 0 || p2.stunTime > 0) continue; // Ghost can't steal, stun can't steal
                        
                        let dist = p1.pos.dist(p2.pos);
                        if (dist < p1.radius + p2.radius) {
                            // Collision! Check relative speed
                            let relVel = p2.vel.copy().sub(p1.vel);
                            let speed = relVel.mag();
                            
                            // Deflection
                            let n = p2.pos.copy().sub(p1.pos).normalise();
                            let v1n = p1.vel.dot(n);
                            let v2n = p2.vel.dot(n);
                            
                            p1.vel.sub(n.copy().mult(v1n - v2n));
                            p2.vel.sub(n.copy().mult(v2n - v1n));

                            if (speed > 3.0) {
                                // Steal!
                                this.prism.holderId = p2.id;
                                p1.heldTime = 0;
                                p1.stunTime = 15;
                                audio.playBounce();
                                triggerScreenShake();
                                
                                this.particles.spawnExplosion(this.prism.pos.x, this.prism.pos.y, '#ffffff', 10, 1.5);
                                break; // Only one steal per frame
                            }
                        }
                    }
                }
            }
        }
    }

    renderBackground() {
        // Clear background
        this.ctx.fillStyle = '#030008';
        this.ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // Draw grid
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for (let x = 0; x <= WIDTH; x += 50) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, HEIGHT);
        }
        for (let y = 0; y <= HEIGHT; y += 50) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(WIDTH, y);
        }
        this.ctx.stroke();
        
        // Draw decorative background stars/nodes
        for (let x = 0; x <= WIDTH; x += 100) {
            for (let y = 0; y <= HEIGHT; y += 100) {
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
                this.ctx.beginPath();
                this.ctx.arc(x, y, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Draw Home Zones
        if (this.numPlayers === 2) {
            this.ctx.fillStyle = ZONE_TINTS[0]; this.ctx.fillRect(0, 0, 400, 500);
            this.ctx.fillStyle = ZONE_TINTS[1]; this.ctx.fillRect(400, 0, 400, 500);
            
            this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            this.ctx.beginPath(); this.ctx.moveTo(400,0); this.ctx.lineTo(400,500); this.ctx.stroke();
        } else if (this.numPlayers === 3) {
            this.ctx.fillStyle = ZONE_TINTS[0]; this.ctx.fillRect(0, 0, 400, 250);
            this.ctx.fillStyle = ZONE_TINTS[1]; this.ctx.fillRect(400, 0, 400, 250);
            this.ctx.fillStyle = ZONE_TINTS[2]; this.ctx.fillRect(0, 250, 800, 250);
            
            this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            this.ctx.beginPath(); 
            this.ctx.moveTo(400,0); this.ctx.lineTo(400,250);
            this.ctx.moveTo(0,250); this.ctx.lineTo(800,250);
            this.ctx.stroke();
        } else {
            this.ctx.fillStyle = ZONE_TINTS[0]; this.ctx.fillRect(0, 0, 400, 250);
            this.ctx.fillStyle = ZONE_TINTS[1]; this.ctx.fillRect(400, 0, 400, 250);
            this.ctx.fillStyle = ZONE_TINTS[2]; this.ctx.fillRect(0, 250, 400, 250);
            this.ctx.fillStyle = ZONE_TINTS[3]; this.ctx.fillRect(400, 250, 400, 250);
            
            this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            this.ctx.beginPath(); 
            this.ctx.moveTo(400,0); this.ctx.lineTo(400,500);
            this.ctx.moveTo(0,250); this.ctx.lineTo(800,250);
            this.ctx.stroke();
        }
    }

    renderHUD() {
        this.ctx.font = '20px "Press Start 2P", monospace';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';

        // P1 Score
        this.ctx.fillStyle = PLAYER_COLORS[0];
        this.ctx.fillText(`P1: ${Math.floor(this.players[0].score)}`, 20, 20);

        // P2 Score
        this.ctx.textAlign = 'right';
        this.ctx.fillStyle = PLAYER_COLORS[1];
        this.ctx.fillText(`P2: ${Math.floor(this.players[1].score)}`, WIDTH - 20, 20);

        if (this.numPlayers >= 3) {
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'bottom';
            this.ctx.fillStyle = PLAYER_COLORS[2];
            this.ctx.fillText(`P3: ${Math.floor(this.players[2].score)}`, 20, HEIGHT - 20);
        }

        if (this.numPlayers >= 4) {
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'bottom';
            this.ctx.fillStyle = PLAYER_COLORS[3];
            this.ctx.fillText(`P4: ${Math.floor(this.players[3].score)}`, WIDTH - 20, HEIGHT - 20);
        }
        
        // Find leader
        let leader = null;
        let maxScore = -1;
        for (let p of this.players) {
            if (p.score > maxScore) {
                maxScore = p.score;
                leader = p;
            }
        }
        
        // Display goal
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '14px "Press Start 2P", monospace';
        this.ctx.fillText(`GOAL: ${GOAL_SCORE}`, WIDTH/2, 20);
        
        if (leader && leader.score > 0) {
            this.ctx.fillStyle = leader.color;
            this.ctx.fillText(`LEADER: P${leader.id + 1}`, WIDTH/2, 40);
        }

        if (this.gameOver) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
            this.ctx.fillStyle = PLAYER_COLORS[this.winner];
            this.ctx.font = '40px "Press Start 2P", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(`PLAYER ${this.winner + 1} WINS!`, WIDTH / 2, HEIGHT / 2);
        }
    }

    render() {
        this.renderBackground();

        // Draw Powerups
        for (let p of this.powerups) p.render(this.ctx);

        // Draw Players
        for (let p of this.players) p.render(this.ctx);

        // Draw Particles
        this.particles.draw(this.ctx);

        // Draw Prism
        let prismColor = '#ffffff';
        let isOverloaded = false;
        let flashFrame = Math.floor(Date.now() / 100) % 2 === 0;

        if (this.prism.holderId !== -1) {
            let holder = this.players[this.prism.holderId];
            prismColor = holder.color;
            if (holder.heldTime > OVERLOAD_TIME) {
                isOverloaded = true;
            }
        }
        this.prism.render(this.ctx, prismColor, isOverloaded, flashFrame);

        // Draw Overload Warning
        if (isOverloaded) {
            this.ctx.fillStyle = flashFrame ? '#ff0000' : '#ffffff';
            this.ctx.font = '24px "Press Start 2P", monospace';
            this.ctx.fillText('PRISM OVERLOAD!', WIDTH/2, HEIGHT/2 - 50);
        }

        this.renderHUD();
    }

    getState() {
        return {
            players: this.players.map(p => ({
                pos: { x: p.pos.x, y: p.pos.y },
                vel: { x: p.vel.x, y: p.vel.y },
                score: p.score,
                dashCooldown: p.dashCooldown,
                stunTime: p.stunTime,
                heldTime: p.heldTime,
                powerups: p.powerups
            })),
            prism: {
                pos: { x: this.prism.pos.x, y: this.prism.pos.y },
                vel: { x: this.prism.vel.x, y: this.prism.vel.y },
                holderId: this.prism.holderId,
                angle: this.prism.angle,
                cooldown: this.prism.cooldown,
                anchored: this.prism.anchored
            },
            powerups: this.powerups.map(p => ({
                type: p.type,
                pos: { x: p.pos.x, y: p.pos.y },
                active: p.active,
                life: p.life
            })),
            gameOver: this.gameOver,
            winner: this.winner
        };
    }

    applyNetworkState(state) {
        if (!state) return;
        for (let i = 0; i < this.players.length; i++) {
            if (state.players[i]) {
                this.players[i].pos.x = state.players[i].pos.x;
                this.players[i].pos.y = state.players[i].pos.y;
                this.players[i].vel.x = state.players[i].vel.x;
                this.players[i].vel.y = state.players[i].vel.y;
                this.players[i].score = state.players[i].score;
                this.players[i].dashCooldown = state.players[i].dashCooldown;
                this.players[i].stunTime = state.players[i].stunTime;
                this.players[i].heldTime = state.players[i].heldTime;
                this.players[i].powerups = state.players[i].powerups;
            }
        }
        
        this.prism.pos.x = state.prism.pos.x;
        this.prism.pos.y = state.prism.pos.y;
        this.prism.vel.x = state.prism.vel.x;
        this.prism.vel.y = state.prism.vel.y;
        this.prism.holderId = state.prism.holderId;
        this.prism.angle = state.prism.angle;
        this.prism.cooldown = state.prism.cooldown;
        this.prism.anchored = state.prism.anchored;

        this.powerups = state.powerups.map(p => {
            let pobj = new Powerup(p.type, p.pos.x, p.pos.y);
            pobj.active = p.active;
            pobj.life = p.life;
            return pobj;
        });

        this.gameOver = state.gameOver;
        this.winner = state.winner;
    }

    cleanup() {
        // Any cleanup if necessary
    }
}
