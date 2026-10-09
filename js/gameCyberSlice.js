import { Vector2D, ParticleSystem, triggerScreenShake } from './engine.js';
import { audio } from './audio.js';

export default class GameCyberSlice {
    constructor(canvas, input, onGameOver, mods = {}) {
        this.canvas = canvas;
        this.input = input;
        this.audio = audio;
        this.triggerScreenShake = triggerScreenShake;
        this.onGameOver = onGameOver;

        this.numPlayers = 2;
        this.particles = new ParticleSystem();

        this.colors = {
            p1: '#00f0ff',
            p2: '#ff007f',
            bg: '#050510',
            grid: '#1a1a3a'
        };

        this.state = this.getInitialState();
    }

    getInitialState() {
        return {
            p1: {
                id: 1,
                pos: new Vector2D(100, 250),
                vel: new Vector2D(0, 0),
                facing: new Vector2D(1, 0),
                hp: 3,
                stun: 0,
                energy: 100,
                actionHeld: 0,
                wins: 0,
                cooldown: 0,
                color: this.colors.p1,
                wasActionPressed: false
            },
            p2: {
                id: 2,
                pos: new Vector2D(700, 250),
                vel: new Vector2D(0, 0),
                facing: new Vector2D(-1, 0),
                hp: 3,
                stun: 0,
                energy: 100,
                actionHeld: 0,
                wins: 0,
                cooldown: 0,
                color: this.colors.p2,
                wasActionPressed: false
            },
            slices: [],
            roundActive: true,
            roundEndTimer: 0,
            winner: null
        };
    }

    getPlayerInput(pId, input) {
        if (pId === 1) {
            return {
                up: input.isPressed('KeyW'),
                down: input.isPressed('KeyS'),
                left: input.isPressed('KeyA'),
                right: input.isPressed('KeyD'),
                action: input.isPressed('Space')
            };
        } else {
            return {
                up: input.isPressed('ArrowUp'),
                down: input.isPressed('ArrowDown'),
                left: input.isPressed('ArrowLeft'),
                right: input.isPressed('ArrowRight'),
                action: input.isPressed('Enter')
            };
        }
    }

    tick() {
        this.particles.update();

        if (this.state.winner) {
            return;
        }

        if (!this.state.roundActive) {
            this.state.roundEndTimer--;
            if (this.state.roundEndTimer <= 0) {
                this.resetRound();
            }
            return;
        }

        this.updatePlayer(this.state.p1, this.state.p2);
        this.updatePlayer(this.state.p2, this.state.p1);

        // Check for round end
        if (this.state.p1.hp <= 0 || this.state.p2.hp <= 0) {
            this.state.roundActive = false;
            this.state.roundEndTimer = 120;

            let roundWinner = null;
            if (this.state.p1.hp <= 0 && this.state.p2.hp > 0) {
                roundWinner = this.state.p2;
            } else if (this.state.p2.hp <= 0 && this.state.p1.hp > 0) {
                roundWinner = this.state.p1;
            }

            if (roundWinner) {
                roundWinner.wins++;
                this.audio.playVictory();
                if (roundWinner.wins >= 3) {
                    this.state.winner = roundWinner.id === 1 ? 'p1' : 'p2';
                    this.onGameOver(this.state.winner, `${this.state.p1.wins} - ${this.state.p2.wins}`);
                }
            }
        }
    }

    updatePlayer(p, opp) {
        let inps = this.getPlayerInput(p.id, this.input);

        // Movement
        if (p.stun <= 0) {
            let speed = 1.5;
            if (inps.up) p.vel.y -= speed;
            if (inps.down) p.vel.y += speed;
            if (inps.left) p.vel.x -= speed;
            if (inps.right) p.vel.x += speed;
        } else {
            p.stun--;
        }

        // Drag
        p.vel.x *= 0.85;
        p.vel.y *= 0.85;

        p.pos.add(p.vel);

        // Update facing direction based on velocity
        if (Math.abs(p.vel.x) > 0.1 || Math.abs(p.vel.y) > 0.1) {
            let len = Math.sqrt(p.vel.x * p.vel.x + p.vel.y * p.vel.y);
            p.facing.x = p.vel.x / len;
            p.facing.y = p.vel.y / len;
        }

        // Arena Bounds
        let r = 14;
        if (p.pos.x < r) { p.pos.x = r; p.vel.x *= -1; }
        if (p.pos.x > 800 - r) { p.pos.x = 800 - r; p.vel.x *= -1; }
        if (p.pos.y < r) { p.pos.y = r; p.vel.y *= -1; }
        if (p.pos.y > 500 - r) { p.pos.y = 500 - r; p.vel.y *= -1; }

        if (p.cooldown > 0) p.cooldown--;

        // Action Logic (Shoot / Shatter)
        let actionJustPressed = inps.action && !p.wasActionPressed;

        if (actionJustPressed && p.cooldown <= 0 && p.stun <= 0) {
            this.shootSlice(p, opp);
        }

        if (inps.action && p.stun <= 0) {
            p.actionHeld++;
            if (p.actionHeld >= 60 && p.energy >= 100) {
                // Trigger Shatter
                p.energy = 0;
                this.state.slices = [];
                this.particles.spawnExplosion(p.pos.x, p.pos.y, p.color, 50, 5);
                this.audio.playPowerup();
                this.triggerScreenShake();
                p.actionHeld = 0;
            }
        } else {
            p.actionHeld = 0;
        }

        p.wasActionPressed = inps.action;

        // Enemy Slice Collisions
        if (p.stun <= 0) {
            for (let s of this.state.slices) {
                if (s.owner !== p.id) {
                    let d2 = this.distToSegmentSquared(p.pos, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
                    if (d2 < r * r) {
                        // Push back out of the slice
                        let l2 = (s.x2 - s.x1) ** 2 + (s.y2 - s.y1) ** 2;
                        let t = ((p.pos.x - s.x1) * (s.x2 - s.x1) + (p.pos.y - s.y1) * (s.y2 - s.y1)) / l2;
                        t = Math.max(0, Math.min(1, t));
                        let projX = s.x1 + t * (s.x2 - s.x1);
                        let projY = s.y1 + t * (s.y2 - s.y1);

                        let nx = p.pos.x - projX;
                        let ny = p.pos.y - projY;
                        let nLen = Math.sqrt(nx * nx + ny * ny);
                        
                        if (nLen > 0) {
                            nx /= nLen; ny /= nLen;
                            p.pos.x = projX + nx * (r + 1);
                            p.pos.y = projY + ny * (r + 1);
                            p.vel.x = nx * 8;
                            p.vel.y = ny * 8;
                        } else {
                            p.vel.x = -p.vel.x * 2;
                            p.vel.y = -p.vel.y * 2;
                        }

                        p.stun = 90; // 1.5 seconds stun
                        p.hp -= 1;
                        this.particles.spawnExplosion(p.pos.x, p.pos.y, p.color, 20, 3);
                        this.audio.playBounce();
                        this.triggerScreenShake();
                        break; // Prevent multiple hits in a single tick
                    }
                }
            }
        }
    }

    shootSlice(p, opp) {
        // Start ray slightly ahead to avoid self-intersection logic glitches
        let sx = p.pos.x + p.facing.x * 15;
        let sy = p.pos.y + p.facing.y * 15;
        let ex = sx + p.facing.x * 2000;
        let ey = sy + p.facing.y * 2000;

        let closestDist = 1; // max t = 1 (representing the end of the 2000px ray)
        let endX = ex;
        let endY = ey;
        let hitOpponent = null;

        // Intersect bounds
        let bounds = [
            [0, 0, 800, 0], [800, 0, 800, 500], [800, 500, 0, 500], [0, 500, 0, 0]
        ];
        for (let b of bounds) {
            let hit = this.getIntersection(sx, sy, ex, ey, b[0], b[1], b[2], b[3]);
            if (hit && hit.dist < closestDist) {
                closestDist = hit.dist;
                endX = hit.x; endY = hit.y;
            }
        }

        // Intersect other slices
        for (let s of this.state.slices) {
            let hit = this.getIntersection(sx, sy, ex, ey, s.x1, s.y1, s.x2, s.y2);
            if (hit && hit.dist < closestDist) {
                closestDist = hit.dist;
                endX = hit.x; endY = hit.y;
            }
        }

        // Intersect opponent
        let oppHit = this.lineCircleIntersection(sx, sy, ex, ey, opp.pos.x, opp.pos.y, 14);
        if (oppHit && oppHit.dist < closestDist) {
            closestDist = oppHit.dist;
            endX = oppHit.x; endY = oppHit.y;
            hitOpponent = opp;
        }

        this.state.slices.push({ x1: sx, y1: sy, x2: endX, y2: endY, owner: p.id, color: p.color });
        this.audio.playBoost();
        this.particles.spawnExplosion(endX, endY, p.color, 10, 2);

        if (hitOpponent) {
            hitOpponent.hp -= 1;
            this.particles.spawnExplosion(endX, endY, hitOpponent.color, 25, 4);
            this.audio.playExplosion();
            this.triggerScreenShake();
        }

        p.cooldown = 45; // Delay between shots
    }

    resetRound() {
        this.state.roundActive = true;
        this.state.slices = [];

        let p1 = this.state.p1;
        p1.pos.x = 100; p1.pos.y = 250; p1.vel.x = 0; p1.vel.y = 0;
        p1.facing.x = 1; p1.facing.y = 0;
        p1.hp = 3; p1.stun = 0; p1.energy = 100; p1.actionHeld = 0; p1.cooldown = 0;

        let p2 = this.state.p2;
        p2.pos.x = 700; p2.pos.y = 250; p2.vel.x = 0; p2.vel.y = 0;
        p2.facing.x = -1; p2.facing.y = 0;
        p2.hp = 3; p2.stun = 0; p2.energy = 100; p2.actionHeld = 0; p2.cooldown = 0;
    }

    render() {
        const ctx = this.canvas.getContext('2d');
        // Background
        ctx.fillStyle = this.colors.bg;
        ctx.fillRect(0, 0, 800, 500);

        // Grid
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= 800; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, 500); }
        for (let y = 0; y <= 500; y += 50) { ctx.moveTo(0, y); ctx.lineTo(800, y); }
        ctx.stroke();

        // Slices
        ctx.lineCap = 'round';
        for (let s of this.state.slices) {
            // Glow
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 6;
            ctx.shadowBlur = 15;
            ctx.shadowColor = s.color;
            ctx.beginPath();
            ctx.moveTo(s.x1, s.y1);
            ctx.lineTo(s.x2, s.y2);
            ctx.stroke();

            // Core
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.shadowBlur = 0;
            ctx.stroke();
        }
        ctx.shadowBlur = 0;

        this.particles.draw(ctx);

        if (this.state.p1.hp > 0) this.drawPlayer(ctx, this.state.p1);
        if (this.state.p2.hp > 0) this.drawPlayer(ctx, this.state.p2);

        this.drawHUD(ctx);
    }

    drawPlayer(ctx, p) {
        // Flicker if stunned
        if (p.stun > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
            return;
        }

        ctx.save();
        ctx.translate(p.pos.x, p.pos.y);
        ctx.rotate(Math.atan2(p.facing.y, p.facing.x));

        ctx.fillStyle = p.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;

        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-10, 10);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-10, -10);
        ctx.closePath();
        ctx.fill();
        
        ctx.shadowBlur = 0;

        // Shatter charge indicator
        if (p.actionHeld > 0 && p.energy >= 100) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            let pct = p.actionHeld / 60;
            ctx.arc(0, 0, 20, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawHUD(ctx) {
        ctx.font = 'bold 20px "Courier New", monospace';
        ctx.textAlign = 'center';

        // P1 HUD
        ctx.fillStyle = this.colors.p1;
        ctx.fillText(`P1 WINS: ${this.state.p1.wins}`, 120, 30);
        this.drawHP(ctx, 120, 50, this.state.p1.hp, this.state.p1.color);
        if (this.state.p1.energy >= 100) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px "Courier New", monospace';
            ctx.fillText('SHATTER READY', 120, 75);
        }

        // P2 HUD
        ctx.fillStyle = this.colors.p2;
        ctx.font = 'bold 20px "Courier New", monospace';
        ctx.fillText(`P2 WINS: ${this.state.p2.wins}`, 680, 30);
        this.drawHP(ctx, 680, 50, this.state.p2.hp, this.state.p2.color);
        if (this.state.p2.energy >= 100) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px "Courier New", monospace';
            ctx.fillText('SHATTER READY', 680, 75);
        }

        // Round Over Overlay
        if (!this.state.roundActive && !this.state.winner) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 40px "Courier New", monospace';
            ctx.fillText('ROUND OVER', 400, 250);
        }
    }

    drawHP(ctx, x, y, hp, color) {
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(x - 20 + i * 20, y, 6, 0, Math.PI * 2);
            if (i < hp) {
                ctx.fillStyle = color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = color;
                ctx.fill();
            } else {
                ctx.strokeStyle = '#555';
                ctx.shadowBlur = 0;
                ctx.stroke();
            }
        }
        ctx.shadowBlur = 0;
    }

    // Geometry Helpers

    distToSegmentSquared(p, v, w) {
        let l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
        if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        let projX = v.x + t * (w.x - v.x);
        let projY = v.y + t * (w.y - v.y);
        return (p.x - projX) ** 2 + (p.y - projY) ** 2;
    }

    lineCircleIntersection(x1, y1, x2, y2, cx, cy, r) {
        let dx = x2 - x1;
        let dy = y2 - y1;
        let a = dx * dx + dy * dy;
        let b = 2 * (dx * (x1 - cx) + dy * (y1 - cy));
        let c = (x1 - cx) ** 2 + (y1 - cy) ** 2 - r * r;
        let det = b * b - 4 * a * c;
        
        if (a <= 0.0000001 || det < 0) {
            return null;
        } else {
            let t1 = (-b - Math.sqrt(det)) / (2 * a);
            let t2 = (-b + Math.sqrt(det)) / (2 * a);
            let t = -1;
            if (t1 >= 0 && t1 <= 1) t = t1;
            if (t2 >= 0 && t2 <= 1 && (t === -1 || t2 < t)) t = t2;
            
            if (t !== -1) {
                return {
                    x: x1 + t * dx,
                    y: y1 + t * dy,
                    dist: t
                };
            }
            return null;
        }
    }

    getIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        let denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (denom === 0) return null;
        let t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        let u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1),
                dist: t
            };
        }
        return null;
    }

    // Engine Methods

    getState() {
        return this.state;
    }

    applyNetworkState(state) {
        this.state = state;
        
        // Rehydrate Vector2D instances if they were serialized to plain objects
        const restoreVec = (obj, prop) => {
            if (obj[prop] && !(obj[prop] instanceof Vector2D)) {
                obj[prop] = new Vector2D(obj[prop].x, obj[prop].y);
            }
        };

        if (this.state.p1) {
            restoreVec(this.state.p1, 'pos');
            restoreVec(this.state.p1, 'vel');
            restoreVec(this.state.p1, 'facing');
        }
        if (this.state.p2) {
            restoreVec(this.state.p2, 'pos');
            restoreVec(this.state.p2, 'vel');
            restoreVec(this.state.p2, 'facing');
        }
    }

    cleanup() {
        this.state.slices = [];
    }
}
