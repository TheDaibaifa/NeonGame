const fs = require('fs');
const path = '/home/daibaifa/Documents/antigravity/Eager/Eager_v6/js/gamePrismCapture.js';
let content = fs.readFileSync(path, 'utf8');

// 1. isKeyDown -> isPressed
content = content.replace(/\.isKeyDown\(/g, '.isPressed(');

// 2. this.numPlayers
content = content.replace(/this\.numPlayers = Math\.max\(2, Math\.min\(4, input\.length\)\);/, 'this.numPlayers = Math.max(2, Math.min(4, mods.playerMode || 2));');

// 3. this.particles.render -> draw
content = content.replace(/this\.particles\.render\(this\.ctx\);/, 'this.particles.draw(this.ctx);');

// 4. this.particles.emit -> spawnExplosion
content = content.replace(/for\s*\(let k=0; k<20; k\+\+\)\s*\{\s*this\.particles\.emit\(this\.prism\.pos\.x, this\.prism\.pos\.y, p\.color\);\s*\}/, "this.particles.spawnExplosion(this.prism.pos.x, this.prism.pos.y, p.color, 20, 1);");

content = content.replace(/for\s*\(let k=0; k<50; k\+\+\)\s*\{\s*this\.particles\.emit\(p\.pos\.x, p\.pos\.y, '#ffffff', 4\);\s*\}/, "this.particles.spawnExplosion(p.pos.x, p.pos.y, '#ffffff', 50, 2);");

content = content.replace(/for\s*\(let k=0; k<5; k\+\+\)\s*\{\s*this\.particles\.emit\(p\.pos\.x, p\.pos\.y, p\.color\);\s*\}/, "this.particles.spawnExplosion(p.pos.x, p.pos.y, p.color, 5, 0.8);");

content = content.replace(/for\s*\(let k=0; k<10; k\+\+\)\s*\{\s*this\.particles\.emit\(this\.prism\.pos\.x, this\.prism\.pos\.y, '#ffffff'\);\s*\}/, "this.particles.spawnExplosion(this.prism.pos.x, this.prism.pos.y, '#ffffff', 10, 1.5);");

// 5. audio.playSound
content = content.replace(/audio\.playSound\('pickup'\)/g, "audio.playPowerup()");
content = content.replace(/audio\.playSound\('powerup'\)/g, "audio.playPowerupUse()");
content = content.replace(/audio\.playSound\('explosion'\)/g, "audio.playExplosion()");
content = content.replace(/audio\.playSound\('shoot'\)/g, "audio.playBoost()");
content = content.replace(/audio\.playSound\('hit'\)/g, "audio.playBounce()");
content = content.replace(/audio\.playSound\('win'\)/g, "audio.playVictory()");

// 6. triggerScreenShake
content = content.replace(/triggerScreenShake\([^)]*\)/g, "triggerScreenShake()");

// 7. this.onGameOver
content = content.replace(/this\.onGameOver\(\{ winner: p\.id \}\);/g, "const pKeys = ['p1','p2','p3','p4'];\n                this.onGameOver(pKeys[p.id] || 'p1', `${Math.floor(p.score)} pts`);");

// 8. Vector2D methods
content = content.replace(/\.multiply\(/g, '.mult(');
content = content.replace(/\.normalize\(\)/g, '.normalise()');
content = content.replace(/\.subtract\(/g, '.sub(');
content = content.replace(/\.clone\(\)/g, '.copy()');
content = content.replace(/\.distanceTo\(/g, '.dist(');

fs.writeFileSync(path, content);
console.log('Done');
