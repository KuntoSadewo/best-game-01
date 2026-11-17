// Entities: the player, the five shadow kinds plus the Gloom Herald boss,
// bullets, particles, pickups and floating text. Plain objects, updated in
// place; main.js owns the arrays and the game state these functions work on.

import { clamp, dist2, angleTo, edgeSpawn } from './util.js';

export const ENEMY_DEFS = {
  wisp:     { hp: 22,  speed: 72,  r: 13, dmg: 8,  score: 50,  color: '#8f7bff', kind: 'wisp' },
  skitter:  { hp: 14,  speed: 165, r: 11, dmg: 8,  score: 75,  color: '#ff7ad9', kind: 'skitter' },
  spitter:  { hp: 30,  speed: 62,  r: 14, dmg: 12, score: 100, color: '#7dff9a', kind: 'spitter' },
  brute:    { hp: 130, speed: 44,  r: 24, dmg: 20, score: 200, color: '#ff5a4e', kind: 'brute' },
  splitter: { hp: 34,  speed: 88,  r: 15, dmg: 10, score: 120, color: '#ffc857', kind: 'splitter' },
};

export const BOSS_DEF = { hp: 950, speed: 52, r: 44, dmg: 25, score: 2500, color: '#c084fc', kind: 'boss' };

export function makePlayer(x, y) {
  return {
    x, y, r: 16, aim: -Math.PI / 2,
    hp: 120, maxHp: 120,
    speed: 268, damage: 16, fireRate: 7, shots: 1, spread: 0.085,
    bulletSpeed: 640, magnet: 80, regen: 0,
    fireCd: 0, dashCd: 0, dashTime: 0, dashDirX: 0, dashDirY: -1,
    invuln: 0, shield: 0, alive: true, thrust: 0,
  };
}

export function spawnEnemy(kind, x, y, wave) {
  const d = ENEMY_DEFS[kind];
  const hpScale = 1 + (wave - 1) * 0.09;
  return {
    kind, x, y, r: d.r, hp: d.hp * hpScale, maxHp: d.hp * hpScale,
    speed: d.speed * (1 + Math.min(0.35, (wave - 1) * 0.03)),
    dmg: d.dmg, score: d.score, color: d.color,
    angle: 0, wobble: Math.random() * Math.PI * 2,
    shootCd: 1.5 + Math.random(), flash: 0, knockX: 0, knockY: 0,
  };
}

export function spawnBoss(wave, w, h, rng) {
  const p = edgeSpawn(rng, w, h, 90);
  const hpScale = wave >= 10 ? 1.6 : 1;
  return {
    kind: 'boss', x: p.x, y: p.y, r: BOSS_DEF.r,
    hp: BOSS_DEF.hp * hpScale, maxHp: BOSS_DEF.hp * hpScale,
    speed: BOSS_DEF.speed, dmg: BOSS_DEF.dmg, score: BOSS_DEF.score,
    color: BOSS_DEF.color, angle: 0, wobble: 0,
    shootCd: 2.5, summonCd: 6, chargeCd: 5, charging: 0, chargeX: 0, chargeY: 0,
    flash: 0, knockX: 0, knockY: 0,
  };
}

// ---- particles / floating text -------------------------------------------

export function burst(state, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    state.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.45 + Math.random() * 0.4, maxLife: 0.85,
      size: 2 + Math.random() * 3.5, color,
    });
  }
  if (state.particles.length > 420) state.particles.splice(0, state.particles.length - 420);
}

export function addFloat(state, x, y, text, color) {
  state.floats.push({ x, y, text, color, life: 0.9 });
  if (state.floats.length > 40) state.floats.shift();
}

export function dropPickup(state, x, y, kind, rng) {
  state.pickups.push({ x, y, kind, r: 11, life: 9, bob: rng() * Math.PI * 2, vx: 0, vy: 0 });
}

// ---- player ---------------------------------------------------------------

export function updatePlayer(state, dt, input) {
  const p = state.player;
  if (!p.alive) return;
  const W = state.w, H = state.h;

  p.fireCd -= dt; p.dashCd -= dt; p.invuln -= dt; p.shield -= dt;
  if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

  // Movement: WASD / arrows. Dash overrides with a fast burst + i-frames.
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const mLen = Math.hypot(mx, my);
  if (mLen > 0) { mx /= mLen; my /= mLen; }
  if (p.dashTime > 0) {
    p.dashTime -= dt;
    p.x += p.dashDirX * 780 * dt;
    p.y += p.dashDirY * 780 * dt;
    if (Math.random() < 0.6) {
      state.particles.push({ x: p.x, y: p.y, vx: -p.dashDirX * 60, vy: -p.dashDirY * 60,
        life: 0.3, maxLife: 0.3, size: 4, color: '#ffd166' });
    }
  } else {
    p.x += mx * p.speed * dt;
    p.y += my * p.speed * dt;
    p.thrust = mLen;
  }
  p.x = clamp(p.x, p.r + 6, W - p.r - 6);
  p.y = clamp(p.y, p.r + 6, H - p.r - 6);
  p.aim = angleTo(p.x, p.y, input.mouseX, input.mouseY);

  if (input.dash && p.dashCd <= 0 && mLen > 0) {
    p.dashTime = 0.16; p.dashCd = 1.6 / (p.dashRecharge || 1); p.invuln = Math.max(p.invuln, 0.22);
    p.dashDirX = mx; p.dashDirY = my;
    state.sound.dash();
  }

  // Fire while the mouse is held: multishot fan around the aim angle.
  if (input.firing && p.fireCd <= 0) {
    p.fireCd = 1 / p.fireRate;
    const n = p.shots;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * p.spread * 2;
      const a = p.aim + off;
      state.bullets.push({
        x: p.x + Math.cos(a) * (p.r + 6), y: p.y + Math.sin(a) * (p.r + 6),
        vx: Math.cos(a) * p.bulletSpeed, vy: Math.sin(a) * p.bulletSpeed,
        r: 4, dmg: p.damage, life: 0.9, friendly: true,
      });
    }
    state.sound.shoot();
    burst(state, p.x + Math.cos(p.aim) * 22, p.y + Math.sin(p.aim) * 22, '#ffd166', 2, 90);
  }
}

export function damagePlayer(state, amount) {
  const p = state.player;
  if (!p.alive || p.invuln > 0 || p.dashTime > 0) return;
  if (p.shield > 0) { // a shield orb eats the hit entirely
    p.shield = 0;
    addFloat(state, p.x, p.y - 24, 'SHIELD!', '#7dd3fc');
    burst(state, p.x, p.y, '#7dd3fc', 14, 200);
    state.sound.hit();
    return;
  }
  p.hp -= amount;
  p.invuln = 0.7;
  state.damageTaken = (state.damageTaken || 0) + amount;
  state.shake = Math.min(14, state.shake + 7);
  burst(state, p.x, p.y, '#ff5a4e', 16, 260);
  state.sound.hurt();
  if (p.hp <= 0) {
    p.hp = 0; p.alive = false;
    burst(state, p.x, p.y, '#ffd166', 60, 380);
    burst(state, p.x, p.y, '#ff5a4e', 40, 260);
    state.shake = 22;
    state.sound.gameOver();
  }
}

// ---- enemies ---------------------------------------------------------------

function steer(e, tx, ty, dt, speed) {
  const a = angleTo(e.x, e.y, tx, ty);
  e.x += Math.cos(a) * speed * dt + e.knockX * dt;
  e.y += Math.sin(a) * speed * dt + e.knockY * dt;
  e.knockX *= Math.pow(0.001, dt);
  e.knockY *= Math.pow(0.001, dt);
  e.angle = a;
}

export function updateEnemies(state, dt) {
  const p = state.player;
  for (const e of state.enemies) {
    e.flash -= dt;
    if (e.kind === 'wisp') {
      e.wobble += dt * 3;
      const a = angleTo(e.x, e.y, p.x, p.y) + Math.sin(e.wobble) * 0.5;
      e.x += Math.cos(a) * e.speed * dt + e.knockX * dt;
      e.y += Math.sin(a) * e.speed * dt + e.knockY * dt;
      e.knockX *= Math.pow(0.001, dt); e.knockY *= Math.pow(0.001, dt);
    } else if (e.kind === 'skitter') {
      e.wobble += dt * 6;
      const a = angleTo(e.x, e.y, p.x, p.y) + Math.sin(e.wobble) * 0.9;
      e.x += Math.cos(a) * e.speed * dt + e.knockX * dt;
      e.y += Math.sin(a) * e.speed * dt + e.knockY * dt;
      e.knockX *= Math.pow(0.001, dt); e.knockY *= Math.pow(0.001, dt);
      e.angle = a;
    } else if (e.kind === 'spitter') {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      e.wobble += dt;
      if (d > 300) steer(e, p.x, p.y, dt, e.speed);
      else if (d < 210) steer(e, p.x - (p.x - e.x), p.y - (p.y - e.y), dt, e.speed * 0.7);
      else { // strafe sideways at range
        const a = angleTo(e.x, e.y, p.x, p.y) + Math.PI / 2 * Math.sin(e.wobble * 0.8);
        e.x += Math.cos(a) * e.speed * 0.6 * dt;
        e.y += Math.sin(a) * e.speed * 0.6 * dt;
      }
      e.shootCd -= dt;
      if (e.shootCd <= 0 && p.alive && d < 560) {
        e.shootCd = 2.4;
        const a = angleTo(e.x, e.y, p.x, p.y);
        state.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
          r: 6, dmg: e.dmg, life: 4, friendly: false });
        burst(state, e.x, e.y, e.color, 4, 80);
      }
    } else if (e.kind === 'brute') {
      steer(e, p.x, p.y, dt, e.speed);
    } else if (e.kind === 'splitter') {
      steer(e, p.x, p.y, dt, e.speed);
    } else if (e.kind === 'boss') {
      updateBoss(state, e, dt);
    }

    // Touch damage.
    if (p.alive && dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) * (e.r + p.r)) {
      damagePlayer(state, e.dmg);
      // Shove the enemy back so one touch is not a permanent hug.
      const a = angleTo(p.x, p.y, e.x, e.y);
      e.x += Math.cos(a) * 26; e.y += Math.sin(a) * 26;
    }
  }
}

function updateBoss(state, b, dt) {
  const p = state.player;
  b.shootCd -= dt; b.summonCd -= dt; b.chargeCd -= dt;
  if (b.charging > 0) {
    b.charging -= dt;
    b.x += b.chargeX * 420 * dt;
    b.y += b.chargeY * 420 * dt;
    if (Math.random() < 0.5) burst(state, b.x, b.y, b.color, 2, 120);
    if (b.charging <= 0) b.chargeCd = 5;
  } else {
    steer(b, p.x, p.y, dt, b.speed);
    // Radial burst.
    if (b.shootCd <= 0 && p.alive) {
      b.shootCd = b.hp < b.maxHp * 0.5 ? 2.1 : 3.0;
      const n = b.hp < b.maxHp * 0.5 ? 12 : 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + b.wobble;
        state.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170,
          r: 7, dmg: 14, life: 5, friendly: false });
      }
      b.wobble += 0.35;
      state.sound.bossRoar();
      state.shake = Math.min(12, state.shake + 4);
    }
    // Summon wisps.
    if (b.summonCd <= 0) {
      b.summonCd = 7;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        state.enemies.push(spawnEnemy('wisp', b.x + Math.cos(a) * 70, b.y + Math.sin(a) * 70, state.wave));
      }
      burst(state, b.x, b.y, '#c084fc', 24, 220);
    }
    // Charge when hurt.
    if (b.hp < b.maxHp * 0.5 && b.chargeCd <= 0 && p.alive) {
      b.charging = 0.7;
      const a = angleTo(b.x, b.y, p.x, p.y);
      b.chargeX = Math.cos(a); b.chargeY = Math.sin(a);
      state.sound.bossRoar();
    }
  }
  b.x = clamp(b.x, b.r, state.w - b.r);
  b.y = clamp(b.y, b.r, state.h - b.r);
}

// ---- bullets ----------------------------------------------------------------

export function updateBullets(state, dt) {
  const p = state.player;
  // Player bullets vs enemies.
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < -20 || b.x > state.w + 20 || b.y < -20 || b.y > state.h + 20;
    if (!dead) {
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        const e = state.enemies[j];
        if (dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) * (b.r + e.r)) {
          dead = true;
          e.hp -= b.dmg;
          e.flash = 0.08;
          const a = Math.atan2(b.vy, b.vx);
          e.knockX += Math.cos(a) * 130; e.knockY += Math.sin(a) * 130;
          burst(state, b.x, b.y, '#ffd166', 5, 160);
          state.sound.hit();
          if (e.hp <= 0) killEnemy(state, j);
          break;
        }
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
  // Enemy bullets vs player.
  for (let i = state.ebullets.length - 1; i >= 0; i--) {
    const b = state.ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < -20 || b.x > state.w + 20 || b.y < -20 || b.y > state.h + 20;
    if (!dead && p.alive && dist2(b.x, b.y, p.x, p.y) < (b.r + p.r) * (b.r + p.r)) {
      dead = true;
      damagePlayer(state, b.dmg);
    }
    if (dead) state.ebullets.splice(i, 1);
  }
}

function killEnemy(state, idx) {
  const e = state.enemies[idx];
  state.enemies.splice(idx, 1);
  state.kills++;
  const gained = Math.round(e.score * state.scoreMult);
  state.score += gained;
  addFloat(state, e.x, e.y, '+' + gained, '#ffe9a8');
  burst(state, e.x, e.y, e.color, e.kind === 'boss' ? 70 : 18, e.kind === 'boss' ? 380 : 240);
  state.sound.kill();
  if (e.kind === 'boss') {
    state.shake = 20;
    dropPickup(state, e.x - 30, e.y, 'heart', Math.random);
    dropPickup(state, e.x + 30, e.y, 'heart', Math.random);
    state.bossDown = true;
    return;
  }
  if (e.kind === 'splitter') {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      state.enemies.push(spawnEnemy('wisp', e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, state.wave));
    }
  }
  // Drops: embers often, a heart rarely, a shield rarer still.
  const roll = Math.random();
  if (roll < 0.42) dropPickup(state, e.x, e.y, 'ember', Math.random);
  else if (roll < 0.47) dropPickup(state, e.x, e.y, 'heart', Math.random);
  else if (roll < 0.50) dropPickup(state, e.x, e.y, 'shield', Math.random);
}

// ---- pickups / particles / floats ------------------------------------------

export function updatePickups(state, dt) {
  const p = state.player;
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const k = state.pickups[i];
    k.life -= dt; k.bob += dt * 3;
    if (p.alive) {
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      if (d < p.magnet) { // magnet pull
        const a = angleTo(k.x, k.y, p.x, p.y);
        const pull = 520 * (1 - d / p.magnet);
        k.x += Math.cos(a) * pull * dt;
        k.y += Math.sin(a) * pull * dt;
      }
      if (d < p.r + k.r + 4) {
        if (k.kind === 'ember') {
          state.score += Math.round(25 * state.scoreMult);
          state.embers++;
          addFloat(state, k.x, k.y, '+25', '#ffb347');
          state.sound.pickup();
        } else if (k.kind === 'heart') {
          p.hp = Math.min(p.maxHp, p.hp + 25);
          addFloat(state, k.x, k.y, '+25 HP', '#ff6b81');
          state.sound.heart();
        } else if (k.kind === 'shield') {
          p.shield = 4;
          addFloat(state, k.x, k.y, 'SHIELD', '#7dd3fc');
          state.sound.pickup();
        }
        burst(state, k.x, k.y, '#ffffff', 6, 120);
        state.pickups.splice(i, 1);
        continue;
      }
    }
    if (k.life <= 0) state.pickups.splice(i, 1);
  }
}

export function updateParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const q = state.particles[i];
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx *= Math.pow(0.02, dt); q.vy *= Math.pow(0.02, dt);
    q.life -= dt;
    if (q.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.floats.length - 1; i >= 0; i--) {
    const f = state.floats[i];
    f.y -= 42 * dt; f.life -= dt;
    if (f.life <= 0) state.floats.splice(i, 1);
  }
  state.shake = Math.max(0, state.shake - dt * 34);
}
