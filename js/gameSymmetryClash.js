import { Vector2D, ParticleSystem, triggerScreenShake } from './engine.js';
import { audio } from './audio.js';

/**
 * Helper function to calculate the distance from the center to the edge 
 * of a hexagon given the circumradius R and an angle theta.
 */
function getHexRadius(R, theta) {
    // Normalize theta to [0, PI/3]
    let t = theta % (Math.PI / 3);
    if (t < 0) t += Math.PI / 3;
    // Hexagon math: distance to edge = R * cos(30deg) / cos(theta - 30deg)
    return R * Math.cos(Math.PI / 6) / Math.cos(t - Math.PI / 6);
}

// Player control mappings and colors
const P_CONFIG = [
    { left: 'KeyA', right: 'KeyD', shoot: 'Space', color: '#ff0055' },
    { left: 'ArrowLeft', right: 'ArrowRight', shoot: 'Enter', color: '#00ccff' },
    { left: 'KeyJ', right: 'KeyL', shoot: 'KeyU', color: '#ffaa00' },
    { left: 'KeyF', right: 'KeyH', shoot: 'KeyY', color: '#00ffaa' }
];

class Player {
    constructor(id, config, numPlayers) {
        this.id = id;
        this.keys = config;
        this.color = config.color;
        this.lives = 3;
        this.dead = false;
        this.respawnTimer = 0;
        this.invulnTimer = 0;
        
        // Distribute players evenly around the circle
        this.angle = this.id * (Math.PI * 2 / numPlayers);
        this.vo = 0; // Outward velocity
        this.offset = 0; // Distance pushed outward from the edge
        this.cooldown = 0; // Cooldown for shooting pulses
    }
}

class Pulse {
    constructor(x, y, color, ownerId) {
        this.pos = new Vector2D(x, y);
        this.color = color;
        this.ownerId = ownerId;
        
        // Pulses travel exactly towards the center
        let center = new Vector2D(400, 250);
        let dir = center.copy().sub(this.pos);
        if (dir.dist(new Vector2D(0, 0)) === 0) {
            dir = new Vector2D(1, 0);
        } else {
            dir.normalise();
        }
        this.vel = dir.mult(5); // Speed of the pulse
        
        this.linger = 0; // Time spent waiting at the center
        this.dead = false;
    }
    
    update() {
        if (this.linger > 0) {
            this.linger--;
            if (this.linger <= 0) this.dead = true;
            return;
        }
        
        this.pos.add(this.vel);
        
        let center = new Vector2D(400, 250);
        if (this.pos.dist(center) < 5) {
            // Pulse reached the center, linger and wait for others to hit it
            this.linger = 60;
            this.pos = center.copy();
        }
    }
}

class Shockwave {
    constructor(pos) {
        this.pos = pos.copy();
        this.r = 0;
        this.maxR = 600; // Will cover the whole screen eventually
        this.hitPlayers = new Set();
    }
    
    update(players, platformR, audio, particles, triggerScreenShake) {
        this.r += 8; // Expand rapidly
        
        let center = new Vector2D(400, 250);
        
        for (let p of players) {
            if (p.dead || p.invulnTimer > 0) continue;
            if (this.hitPlayers.has(p.id)) continue;
            
            let r_hex = getHexRadius(platformR, p.angle);
            let actual_dist = r_hex - 10 + p.offset;
            let px = center.x + actual_dist * Math.cos(p.angle);
            let py = center.y + actual_dist * Math.sin(p.angle);
            
            let playerPos = new Vector2D(px, py);
            let d = playerPos.dist(this.pos);
            
            // Check if the expanding ring crossed the player
            if (d < this.r + 10 && d > this.r - 20) {
                this.hitPlayers.add(p.id);
                
                // Shockwave force depends heavily on proximity to the epicenter
                let force = 450 / Math.max(10, d);
                p.vo += force; // Push player outward
                
                particles.spawnExplosion(px, py, '#ffffff', 10, 2);
                triggerScreenShake();
            }
        }
    }
}

export default class GameSymmetryClash {
    constructor(canvas, input, onGameOver, mods = {}) {
        this.canvas = canvas;
        this.input = input;
        this.onGameOver = onGameOver;
        this.numPlayers = Math.max(3, Math.min(4, mods.playerMode || 3));
        this.particles = new ParticleSystem();
        
        this.players = [];
        for (let i = 0; i < this.numPlayers; i++) {
            this.players.push(new Player(i, P_CONFIG[i], this.numPlayers));
        }
        
        this.pulses = [];
        this.shockwaves = [];
        
        this.gameTimer = 0;
        this.platformR = 180;
        this.gameOver = false;
    }
    
    tick() {
        this.gameTimer++;
        
        // The platform continuously shrinks every 10 seconds (600 ticks) by 15px.
        // We smooth it out so it shrinks gradually.
        this.platformR = Math.max(30, 180 - (this.gameTimer / 600) * 15);
        
        // --- Update Players ---
        for (let p of this.players) {
            if (p.dead) {
                if (p.lives > 0) {
                    p.respawnTimer--;
                    if (p.respawnTimer <= 0) {
                        p.dead = false;
                        p.offset = 0;
                        p.vo = 0;
                        p.cooldown = 0;
                        p.invulnTimer = 90; // 1.5 seconds invuln
                        p.angle = p.id * (Math.PI * 2 / this.numPlayers);
                    }
                }
                continue;
            }
            
            if (p.invulnTimer > 0) p.invulnTimer--;
            if (p.cooldown > 0) p.cooldown--;
            
            // Movement along the perimeter
            if (this.input.isPressed(p.keys.left)) {
                p.angle -= 0.04;
            }
            if (this.input.isPressed(p.keys.right)) {
                p.angle += 0.04;
            }
            
            // Gravity pulling back towards the edge
            p.vo -= 0.4;
            p.offset += p.vo;
            
            if (p.offset < 0) {
                p.offset = 0;
                if (p.vo < 0) p.vo = 0;
            }
            
            let r_hex = getHexRadius(this.platformR, p.angle);
            let px = 400 + (r_hex - 10 + p.offset) * Math.cos(p.angle);
            let py = 250 + (r_hex - 10 + p.offset) * Math.sin(p.angle);
            
            // If pushed entirely off the platform, they fall and die
            if (p.offset > 15) {
                p.dead = true;
                p.lives--;
                audio.playExplosion();
                triggerScreenShake();
                this.particles.spawnExplosion(px, py, p.color, 40, 4);
                
                if (p.lives > 0) {
                    p.respawnTimer = 90;
                }
            } else {
                // Shoot Pulse Action
                if (this.input.isPressed(p.keys.shoot) && p.cooldown <= 0) {
                    p.cooldown = 45; // 0.75s cooldown
                    p.vo += 1.5; // Slight recoil penalty pushing them outward
                    
                    this.pulses.push(new Pulse(px, py, p.color, p.id));
                    audio.playBoost();
                }
            }
        }
        
        // --- Update Pulses ---
        for (let p of this.pulses) {
            p.update();
        }
        
        // Check Pulse-Pulse collisions
        for (let i = 0; i < this.pulses.length; i++) {
            for (let j = i + 1; j < this.pulses.length; j++) {
                let p1 = this.pulses[i];
                let p2 = this.pulses[j];
                if (p1.dead || p2.dead) continue;
                
                if (p1.pos.dist(p2.pos) < 16) {
                    p1.dead = true;
                    p2.dead = true;
                    
                    // Create shockwave at midpoint
                    let mid = p1.pos.copy().add(p2.pos).mult(0.5);
                    this.shockwaves.push(new Shockwave(mid));
                    
                    audio.playExplosion();
                    this.particles.spawnExplosion(mid.x, mid.y, '#ffffff', 30, 4);
                    triggerScreenShake();
                }
            }
        }
        
        this.pulses = this.pulses.filter(p => !p.dead);
        
        // --- Update Shockwaves ---
        for (let sw of this.shockwaves) {
            sw.update(this.players, this.platformR, audio, this.particles, triggerScreenShake);
        }
        this.shockwaves = this.shockwaves.filter(sw => sw.r <= sw.maxR);
        
        // --- Update Particles ---
        this.particles.update();
        
        // --- Win Condition ---
        if (!this.gameOver) {
            let aliveCount = 0;
            let lastAlive = null;
            
            for (let p of this.players) {
                if (p.lives > 0) {
                    aliveCount++;
                    lastAlive = p;
                }
            }
            
            if (aliveCount <= 1) {
                this.gameOver = true;
                if (aliveCount === 1) {
                    this.onGameOver(`p${lastAlive.id + 1}`, 'WINNER');
                    audio.playVictory();
                } else {
                    this.onGameOver('none', 'DRAW');
                }
            }
        }
    }
    
    render() {
        const ctx = this.canvas.getContext('2d');
        // Dark swirling void background
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, 800, 500);
        
        // Faint grid for depth
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 800; i += 40) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 500); ctx.stroke();
        }
        for (let i = 0; i < 500; i += 40) {
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(800, i); ctx.stroke();
        }

        let cx = 400, cy = 250;
        
        // Draw the platform
        ctx.save();
        ctx.translate(cx, cy);
        
        // Maximum original boundary
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            let a = i * Math.PI / 3;
            ctx.lineTo(180 * Math.cos(a), 180 * Math.sin(a));
        }
        ctx.closePath();
        ctx.stroke();
        
        // Current shrinking platform
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            let a = i * Math.PI / 3;
            ctx.lineTo(this.platformR * Math.cos(a), this.platformR * Math.sin(a));
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
        ctx.fill();
        
        // Subtle center point indicator
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.shadowBlur = 0;
        ctx.fill();
        ctx.restore();
        
        // Draw shockwaves
        for (let sw of this.shockwaves) {
            ctx.beginPath();
            ctx.arc(sw.pos.x, sw.pos.y, sw.r, 0, Math.PI * 2);
            let alpha = Math.max(0, 1 - sw.r / sw.maxR);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 4;
            ctx.stroke();
        }
        
        // Draw pulses
        for (let pulse of this.pulses) {
            ctx.beginPath();
            let pr = pulse.linger > 0 ? 4 + Math.sin(pulse.linger * 0.5) * 2 : 4;
            ctx.arc(pulse.pos.x, pulse.pos.y, pr, 0, Math.PI * 2);
            ctx.fillStyle = pulse.color;
            ctx.shadowColor = pulse.color;
            ctx.shadowBlur = 10;
            ctx.fill();
            
            // Draw a trail if not lingering
            if (pulse.linger <= 0) {
                ctx.beginPath();
                ctx.moveTo(pulse.pos.x, pulse.pos.y);
                ctx.lineTo(pulse.pos.x - pulse.vel.x * 3, pulse.pos.y - pulse.vel.y * 3);
                ctx.strokeStyle = pulse.color;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
        
        // Draw Particles
        this.particles.draw(ctx);
        
        // Draw Players
        for (let p of this.players) {
            if (p.dead) continue;
            
            let r_hex = getHexRadius(this.platformR, p.angle);
            let actual_dist = r_hex - 10 + p.offset;
            let px = cx + actual_dist * Math.cos(p.angle);
            let py = cy + actual_dist * Math.sin(p.angle);
            
            ctx.beginPath();
            ctx.arc(px, py, 8, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            
            // Blink if invulnerable
            if (p.invulnTimer > 0 && Math.floor(this.gameTimer / 5) % 2 === 0) {
                ctx.shadowBlur = 0;
                ctx.globalAlpha = 0.5;
            } else {
                ctx.shadowBlur = 15;
                ctx.globalAlpha = 1.0;
            }
            ctx.fill();
            ctx.globalAlpha = 1.0;
            
            // Cooldown Indicator
            if (p.cooldown > 0) {
                ctx.beginPath();
                ctx.arc(px, py, 13, -Math.PI/2, -Math.PI/2 + (p.cooldown/45) * Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.shadowBlur = 0;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
        
        // --- Draw UI (Lives & Stats) ---
        ctx.font = 'bold 16px monospace';
        ctx.shadowBlur = 0;
        const UI_POS = [
            {x: 30, y: 30, align: 'left'},
            {x: 770, y: 30, align: 'right'},
            {x: 30, y: 470, align: 'left'},
            {x: 770, y: 470, align: 'right'}
        ];
        
        for (let i = 0; i < this.numPlayers; i++) {
            let p = this.players[i];
            let pos = UI_POS[i];
            
            ctx.fillStyle = p.color;
            ctx.textAlign = pos.align;
            if (p.lives <= 0 && p.dead) {
                ctx.fillStyle = '#555';
                ctx.fillText(`P${i+1} OUT`, pos.x, pos.y);
            } else {
                ctx.fillText(`P${i+1}`, pos.x, pos.y);
                // Draw lives explicitly
                for (let l = 0; l < 3; l++) {
                    ctx.beginPath();
                    let lx = pos.align === 'left' ? pos.x + 40 + l * 15 : pos.x - 40 - l * 15;
                    ctx.arc(lx, pos.y - 5, 5, 0, Math.PI * 2);
                    if (l < p.lives) {
                        ctx.fillStyle = p.color;
                        ctx.fill();
                    } else {
                        ctx.strokeStyle = '#555';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
            }
        }
    }
    
    getState() {
        return {
            gameTimer: this.gameTimer,
            platformR: this.platformR,
            gameOver: this.gameOver,
            players: this.players.map(p => ({
                angle: p.angle,
                vo: p.vo,
                offset: p.offset,
                cooldown: p.cooldown,
                lives: p.lives,
                dead: p.dead,
                respawnTimer: p.respawnTimer,
                invulnTimer: p.invulnTimer
            })),
            pulses: this.pulses.map(p => ({
                x: p.pos.x, y: p.pos.y, vx: p.vel.x, vy: p.vel.y,
                linger: p.linger, dead: p.dead, color: p.color, ownerId: p.ownerId
            })),
            shockwaves: this.shockwaves.map(sw => ({
                x: sw.pos.x, y: sw.pos.y, r: sw.r, hitPlayers: Array.from(sw.hitPlayers)
            }))
        };
    }
    
    applyNetworkState(state) {
        this.gameTimer = state.gameTimer;
        this.platformR = state.platformR;
        this.gameOver = state.gameOver;
        
        this.players.forEach((p, i) => {
            Object.assign(p, state.players[i]);
        });
        
        this.pulses = state.pulses.map(p => {
            let pulse = new Pulse(p.x, p.y, p.color, p.ownerId);
            pulse.vel = new Vector2D(p.vx, p.vy);
            pulse.linger = p.linger;
            pulse.dead = p.dead;
            return pulse;
        });
        
        this.shockwaves = state.shockwaves.map(sw => {
            let shock = new Shockwave(new Vector2D(sw.x, sw.y));
            shock.r = sw.r;
            shock.hitPlayers = new Set(sw.hitPlayers);
            return shock;
        });
    }
    
    cleanup() {
        // Safe tear down logic
    }
}
