import { Vector2D, ParticleSystem, triggerScreenShake } from './engine.js';
import { audio } from './audio.js';

export default class GameNeonChaosBall {
    constructor(canvas, input, onGameOver, mods = {}) {
        this.canvas = canvas;
        this.input = input;
        this.audio = audio;
        this.triggerScreenShake = triggerScreenShake;
        this.onGameOver = onGameOver;

        this.numPlayers = Math.max(3, Math.min(4, mods.playerMode || 3));
        this.particles = new ParticleSystem();

        this.colors = ['#00f0ff', '#ff007f', '#ffff00', '#39ff14'];
        this.margin = 20;
        this.bounds = {
            left: this.margin,
            top: this.margin,
            right: 800 - this.margin,
            bottom: 500 - this.margin
        };

        this.initPlayers();
        this.ball = null;
        this.state = 'playing';

        this.startRound();
    }

    initPlayers() {
        const controls = [
            { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', action: 'Space' },
            { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', action: 'Enter' },
            { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', action: 'KeyU' },
            { up: 'KeyT', down: 'KeyG', left: 'KeyF', right: 'KeyH', action: 'KeyY' }
        ];

        this.players = [];
        for (let i = 0; i < this.numPlayers; i++) {
            this.players.push({
                id: `p${i + 1}`,
                pos: new Vector2D(0, 0),
                vel: new Vector2D(0, 0),
                radius: 16,
                color: this.colors[i],
                lives: 3,
                stunned: 0,
                controls: controls[i],
                speed: 5
            });
        }
    }

    startRound() {
        // Reset player positions
        const spawnPoints = [
            new Vector2D(this.bounds.left + 50, this.bounds.top + 50),
            new Vector2D(this.bounds.right - 50, this.bounds.bottom - 50),
            new Vector2D(this.bounds.right - 50, this.bounds.top + 50),
            new Vector2D(this.bounds.left + 50, this.bounds.bottom - 50)
        ];

        this.players.forEach((p, i) => {
            p.pos = spawnPoints[i].copy();
            p.vel = new Vector2D(0, 0);
            p.stunned = 0;
        });

        // Initialize ball
        this.ball = {
            pos: new Vector2D(this.canvas.width / 2, this.canvas.height / 2),
            vel: new Vector2D(Math.random() - 0.5, Math.random() - 0.5),
            radius: 12,
            baseSpeed: 4,
            speed: 4,
            bounces: 0,
            colorType: 'white',
            color: '#ffffff',
            holder: null,
            colorTimer: 180, // 3 seconds
            detonationTimer: 1800 // 30 seconds
        };
        this.ball.vel.normalise();
        this.ball.vel.mult(this.ball.speed);

        this.pickNewBallColor();
    }

    pickNewBallColor() {
        const alivePlayers = this.players.filter(p => p.lives > 0);
        if (alivePlayers.length === 0) return;

        // 20% chance for white (chaos), otherwise pick random alive player
        if (Math.random() < 0.2) {
            this.ball.colorType = 'white';
            this.ball.color = '#ffffff';
        } else {
            const randomPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
            this.ball.colorType = randomPlayer.id;
            this.ball.color = randomPlayer.color;
        }
    }

    checkWinCondition() {
        const alivePlayers = this.players.filter(p => p.lives > 0);
        if (alivePlayers.length <= 1) {
            this.state = 'gameover';
            if (alivePlayers.length === 1) {
                this.onGameOver(alivePlayers[0].id, 'WINNER');
            } else {
                this.onGameOver('draw', 'DRAW');
            }
        }
    }

    damagePlayer(p) {
        if (p.lives <= 0) return;
        p.lives--;
        p.stunned = 60; // 1 second stun
        this.particles.spawnExplosion(p.pos.x, p.pos.y, p.color, 30, 5);
        this.triggerScreenShake();
        this.audio.playExplosion();
        
        if (p.lives <= 0) {
            // Drop ball if holding
            if (this.ball.holder === p) {
                this.ball.holder = null;
                this.ball.vel = new Vector2D(Math.random() - 0.5, Math.random() - 0.5);
                this.ball.vel.normalise();
                this.ball.vel.mult(this.ball.speed);
            }
            this.checkWinCondition();
        }
    }

    tick() {
        if (this.state === 'gameover') {
            this.particles.update();
            return;
        }

        this.particles.update();

        // Update players
        this.players.forEach(p => {
            if (p.lives <= 0) return;

            if (p.stunned > 0) {
                p.stunned--;
            } else {
                // Movement
                let move = new Vector2D(0, 0);
                if (this.input.isPressed(p.controls.up)) move.y -= 1;
                if (this.input.isPressed(p.controls.down)) move.y += 1;
                if (this.input.isPressed(p.controls.left)) move.x -= 1;
                if (this.input.isPressed(p.controls.right)) move.x += 1;

                if (move.x !== 0 || move.y !== 0) {
                    move.normalise();
                    move.mult(p.speed);
                }

                p.pos.add(move);

                // Constrain to bounds
                p.pos.x = Math.max(this.bounds.left + p.radius, Math.min(this.bounds.right - p.radius, p.pos.x));
                p.pos.y = Math.max(this.bounds.top + p.radius, Math.min(this.bounds.bottom - p.radius, p.pos.y));

                // Launch ball if held
                if (this.ball.holder === p && this.input.isPressed(p.controls.action)) {
                    this.ball.holder = null;
                    this.audio.playBoost();
                    this.ball.bounces = 0;
                    this.ball.speed = this.ball.baseSpeed + 6; // High speed launch
                    
                    if (move.x !== 0 || move.y !== 0) {
                        this.ball.vel = move.copy();
                        this.ball.vel.normalise();
                    } else {
                        // Random dir if standing still
                        this.ball.vel = new Vector2D(Math.random() - 0.5, Math.random() - 0.5);
                        this.ball.vel.normalise();
                    }
                    this.ball.vel.mult(this.ball.speed);
                }
            }
        });

        // Update Ball Color Timer
        this.ball.colorTimer--;
        if (this.ball.colorTimer <= 0) {
            this.ball.colorTimer = 180;
            this.pickNewBallColor();
            
            // If ball changes while held to wrong color, holder takes damage
            if (this.ball.holder && this.ball.colorType !== this.ball.holder.id) {
                let p = this.ball.holder;
                this.ball.holder = null;
                this.damagePlayer(p);
                // Bounce ball away randomly
                this.ball.vel = new Vector2D(Math.random() - 0.5, Math.random() - 0.5);
                this.ball.vel.normalise();
                this.ball.speed = this.ball.baseSpeed;
                this.ball.vel.mult(this.ball.speed);
                this.ball.detonationTimer = Math.max(0, this.ball.detonationTimer - 120); // Penalty
            }
        }

        // Update Detonation Timer
        this.ball.detonationTimer--;
        if (this.ball.detonationTimer <= 0) {
            // Find closest player to the ball
            let closestPlayer = null;
            let minDistance = Infinity;
            
            this.players.forEach(p => {
                if (p.lives <= 0) return;
                let d = this.ball.pos.dist(p.pos);
                if (d < minDistance) {
                    minDistance = d;
                    closestPlayer = p;
                }
            });

            if (closestPlayer) {
                this.damagePlayer(closestPlayer);
            }
            
            if (this.state === 'playing') {
                this.startRound();
            }
            return;
        }

        // Update Ball Position
        if (this.ball.holder) {
            this.ball.pos = this.ball.holder.pos.copy();
            // Optional: offset so it floats above or around the player
            this.ball.pos.y -= this.ball.holder.radius + this.ball.radius;
        } else {
            this.ball.pos.add(this.ball.vel);

            // Wall collisions
            let bounced = false;
            if (this.ball.pos.x - this.ball.radius <= this.bounds.left) {
                this.ball.pos.x = this.bounds.left + this.ball.radius;
                this.ball.vel.x *= -1;
                bounced = true;
            } else if (this.ball.pos.x + this.ball.radius >= this.bounds.right) {
                this.ball.pos.x = this.bounds.right - this.ball.radius;
                this.ball.vel.x *= -1;
                bounced = true;
            }

            if (this.ball.pos.y - this.ball.radius <= this.bounds.top) {
                this.ball.pos.y = this.bounds.top + this.ball.radius;
                this.ball.vel.y *= -1;
                bounced = true;
            } else if (this.ball.pos.y + this.ball.radius >= this.bounds.bottom) {
                this.ball.pos.y = this.bounds.bottom - this.ball.radius;
                this.ball.vel.y *= -1;
                bounced = true;
            }

            if (bounced) {
                this.audio.playBounce();
                this.ball.bounces++;
                this.ball.speed = this.ball.baseSpeed + this.ball.bounces * 0.5;
                // Update velocity vector length
                this.ball.vel.normalise();
                this.ball.vel.mult(this.ball.speed);
                this.particles.spawnExplosion(this.ball.pos.x, this.ball.pos.y, this.ball.color, 5, 2);
            }

            // Player collisions
            this.players.forEach(p => {
                if (p.lives <= 0 || p.stunned > 0 || this.ball.holder) return;

                if (this.ball.pos.dist(p.pos) < this.ball.radius + p.radius) {
                    if (this.ball.colorType === p.id) {
                        // Safe touch -> Capture
                        this.ball.holder = p;
                        this.audio.playPowerup();
                    } else {
                        // Danger touch -> Damage and Stun
                        this.damagePlayer(p);
                        this.ball.detonationTimer = Math.max(0, this.ball.detonationTimer - 120); // 2s acceleration
                        
                        // Bounce off player
                        let bounceDir = this.ball.pos.copy();
                        bounceDir.sub(p.pos);
                        bounceDir.normalise();
                        this.ball.vel = bounceDir;
                        this.ball.vel.mult(this.ball.speed);
                    }
                }
            });
        }
    }

    render() {
        const ctx = this.canvas.getContext('2d');

        // Clear background
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, 800, 500);

        // Draw enclosed neon box
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(this.bounds.left, this.bounds.top, this.bounds.right - this.bounds.left, this.bounds.bottom - this.bounds.top);

        // Draw Glitchy Timer in Background
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.font = '120px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let timeStr = (this.ball.detonationTimer / 60).toFixed(1);
        
        let glitchOffset = 0;
        if (this.ball.detonationTimer < 300 && Math.random() < 0.3) {
            glitchOffset = (Math.random() - 0.5) * 10;
        }

        ctx.fillStyle = this.ball.color;
        ctx.fillText(timeStr, this.canvas.width / 2 + glitchOffset, this.canvas.height / 2);
        ctx.restore();

        this.particles.draw(ctx);

        // Draw players
        this.players.forEach(p => {
            if (p.lives <= 0) return;

            ctx.save();
            ctx.translate(p.pos.x, p.pos.y);

            // Draw lives as small dots
            for (let i = 0; i < p.lives; i++) {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(-10 + i * 10, -p.radius - 10, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            if (p.stunned > 0) {
                // Glitchy rendering for stun
                ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);
                ctx.globalAlpha = 0.5;
            }

            // Player body
            ctx.beginPath();
            ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 3;
            ctx.stroke();

            // Inner fill
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 0.3;
            ctx.fill();

            ctx.restore();
        });

        // Draw ball
        if (this.state !== 'gameover' || this.ball.holder !== null || this.ball.detonationTimer > 0) {
            ctx.save();
            ctx.translate(this.ball.pos.x, this.ball.pos.y);
            
            // Pulse effect
            let pulse = Math.sin(Date.now() / 100) * 2;
            
            ctx.beginPath();
            ctx.arc(0, 0, this.ball.radius + pulse, 0, Math.PI * 2);
            ctx.shadowBlur = 20 + pulse * 2;
            ctx.shadowColor = this.ball.color;
            ctx.fillStyle = this.ball.color;
            ctx.fill();

            ctx.lineWidth = 2;
            ctx.strokeStyle = '#fff';
            ctx.stroke();

            ctx.restore();
        }
    }

    getState() {
        return {
            state: this.state,
            players: this.players.map(p => ({
                pos: { x: p.pos.x, y: p.pos.y },
                lives: p.lives,
                stunned: p.stunned
            })),
            ball: {
                pos: { x: this.ball.pos.x, y: this.ball.pos.y },
                color: this.ball.color,
                detonationTimer: this.ball.detonationTimer,
                holderIndex: this.ball.holder ? this.players.indexOf(this.ball.holder) : -1
            }
        };
    }

    applyNetworkState(state) {
        this.state = state.state;
        state.players.forEach((pState, i) => {
            if (this.players[i]) {
                this.players[i].pos.x = pState.pos.x;
                this.players[i].pos.y = pState.pos.y;
                this.players[i].lives = pState.lives;
                this.players[i].stunned = pState.stunned;
            }
        });
        this.ball.pos.x = state.ball.pos.x;
        this.ball.pos.y = state.ball.pos.y;
        this.ball.color = state.ball.color;
        this.ball.detonationTimer = state.ball.detonationTimer;
        
        if (state.ball.holderIndex !== -1 && this.players[state.ball.holderIndex]) {
            this.ball.holder = this.players[state.ball.holderIndex];
        } else {
            this.ball.holder = null;
        }
    }

    cleanup() {
        // Any specific cleanup needed
        this.players = [];
        this.ball = null;
    }
}
