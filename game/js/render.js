// Rendering: the arena, every entity, the HUD and all five screens
// (title, upgrade draft, pause, game over, victory). Pure canvas 2D, no
// images — the art is drawn shapes, glow and a seeded starfield.

import { clamp, formatTime } from './util.js';
import { TOTAL_WAVES, isBossWave } from './waves.js';

const BG_TOP = '#0b0c1a';
const BG_BOT = '#14102a';
const GOLD = '#ffd166';
const INK = '#e8e4ff';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, size, color, align = 'center', weight = '700') {
  ctx.font = weight + ' ' + size + 'px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function glowCircle(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---- background ---------------------------------------------------------------

export function drawBackground(ctx, state, t) {
  const W = state.w, H = state.h;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, BG_TOP);
  g.addColorStop(1, BG_BOT);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Seeded starfield, gently twinkling.
  for (const s of state.stars) {
    const tw = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph));
    ctx.globalAlpha = tw * s.a;
    ctx.fillStyle = s.c;
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  // Faint arena ring and grid: the lantern's ground.
  ctx.strokeStyle = 'rgba(143,123,255,0.10)';
  ctx.lineWidth = 1;
  for (let x = 80; x < W; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 80; y < H; y += 80) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,209,102,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, 430, 260, 0, 0, Math.PI * 2);
  ctx.stroke();

  // The last lantern: a warm glow at the arena centre that the fight orbits.
  glowCircle(ctx, W / 2, H / 2, 190, 'rgba(255,170,60,0.20)', 0.5 + 0.1 * Math.sin(t * 1.4));
}

// ---- entities -----------------------------------------------------------------

function drawPlayer(ctx, p, t) {
  const blink = p.invuln > 0 && Math.floor(t * 14) % 2 === 0;
  if (blink) ctx.globalAlpha = 0.35;
  // Lantern glow.
  glowCircle(ctx, p.x, p.y, 64, 'rgba(255,190,80,0.55)', 0.9);
  // Dash trail is drawn by particles; the warden is a hooded triangle.
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.aim);
  ctx.fillStyle = '#2b2350';
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, 0); ctx.lineTo(-12, -13); ctx.lineTo(-7, 0); ctx.lineTo(-12, 13);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // The lantern itself, held forward.
  ctx.fillStyle = '#ffb347';
  ctx.beginPath(); ctx.arc(16, 0, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath(); ctx.arc(16, 0, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (p.shield > 0) {
    ctx.strokeStyle = 'rgba(125,211,252,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2); ctx.stroke();
  }
  if (p.dashTime > 0) {
    ctx.strokeStyle = 'rgba(255,209,102,0.7)';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawEnemy(ctx, e, t) {
  // Hit flash turns the body white for a frame.
  const body = e.flash > 0 ? '#ffffff' : e.color;
  glowCircle(ctx, e.x, e.y, e.r * 2.4, e.color, 0.35);
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.kind === 'wisp') {
    ctx.rotate(Math.sin(t * 2 + e.wobble) * 0.3);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -e.r); ctx.quadraticCurveTo(e.r, 0, 0, e.r);
    ctx.quadraticCurveTo(-e.r, 0, 0, -e.r);
    ctx.fill();
    ctx.fillStyle = '#1a1030';
    ctx.beginPath(); ctx.arc(-4, -2, 2.4, 0, Math.PI * 2); ctx.arc(5, -2, 2.4, 0, Math.PI * 2); ctx.fill();
  } else if (e.kind === 'skitter') {
    ctx.rotate(e.angle);
    ctx.fillStyle = body;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rr = i % 2 === 0 ? e.r : e.r * 0.55;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a1030';
    ctx.beginPath(); ctx.arc(3, 0, 3, 0, Math.PI * 2); ctx.fill();
  } else if (e.kind === 'spitter') {
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#1a1030';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
  } else if (e.kind === 'brute') {
    ctx.rotate(e.angle);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(e.r, 0); ctx.lineTo(0, -e.r * 0.8); ctx.lineTo(-e.r, 0); ctx.lineTo(0, e.r * 0.8);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-e.r * 0.5, 0); ctx.lineTo(e.r * 0.5, 0); ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(e.r * 0.35, -5, 2.6, 0, Math.PI * 2); ctx.arc(e.r * 0.35, 5, 2.6, 0, Math.PI * 2); ctx.fill();
  } else if (e.kind === 'splitter') {
    ctx.rotate(t * 0.8);
    ctx.fillStyle = body;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(Math.cos(a) * e.r * 0.45, Math.sin(a) * e.r * 0.45, e.r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#1a1030';
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
  } else if (e.kind === 'boss') {
    ctx.rotate(Math.sin(t * 0.7) * 0.12);
    ctx.fillStyle = body;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = i % 2 === 0 ? e.r : e.r * 0.72;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a1030';
    ctx.beginPath(); ctx.arc(-12, -6, 5, 0, Math.PI * 2); ctx.arc(12, -6, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5a4e';
    ctx.beginPath(); ctx.arc(-12, -6, 2.2, 0, Math.PI * 2); ctx.arc(12, -6, 2.2, 0, Math.PI * 2); ctx.fill();
    // Crown of thorns.
    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-20, -e.r * 0.7); ctx.lineTo(-10, -e.r - 10); ctx.lineTo(0, -e.r * 0.7);
    ctx.lineTo(10, -e.r - 10); ctx.lineTo(20, -e.r * 0.7);
    ctx.stroke();
  }
  ctx.restore();
  // HP bar for tough enemies only.
  if ((e.kind === 'brute' || e.kind === 'boss' || e.kind === 'spitter') && e.hp < e.maxHp) {
    const w = e.r * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 5);
    ctx.fillStyle = '#ff5a4e';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * clamp(e.hp / e.maxHp, 0, 1), 5);
  }
}

function drawBullets(ctx, state) {
  for (const b of state.bullets) {
    glowCircle(ctx, b.x, b.y, 14, 'rgba(255,209,102,0.8)', 0.8);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }
  for (const b of state.ebullets) {
    glowCircle(ctx, b.x, b.y, 16, 'rgba(255,90,78,0.7)', 0.8);
    ctx.fillStyle = '#ff8a7a';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a1020';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPickups(ctx, state, t) {
  for (const k of state.pickups) {
    const bob = Math.sin(k.bob) * 3;
    const fade = k.life < 2 ? (Math.floor(t * 8) % 2 === 0 ? 0.35 : 1) : 1;
    ctx.globalAlpha = fade;
    if (k.kind === 'ember') {
      glowCircle(ctx, k.x, k.y + bob, 18, 'rgba(255,179,71,0.8)', 0.9);
      ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.arc(k.x, k.y + bob, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath(); ctx.arc(k.x, k.y + bob, 3, 0, Math.PI * 2); ctx.fill();
    } else if (k.kind === 'heart') {
      glowCircle(ctx, k.x, k.y + bob, 20, 'rgba(255,107,129,0.8)', 0.9);
      ctx.fillStyle = '#ff6b81';
      ctx.beginPath();
      ctx.moveTo(k.x, k.y + bob + 6);
      ctx.bezierCurveTo(k.x - 9, k.y + bob - 2, k.x - 6, k.y + bob - 9, k.x, k.y + bob - 4);
      ctx.bezierCurveTo(k.x + 6, k.y + bob - 9, k.x + 9, k.y + bob - 2, k.x, k.y + bob + 6);
      ctx.fill();
    } else if (k.kind === 'shield') {
      glowCircle(ctx, k.x, k.y + bob, 20, 'rgba(125,211,252,0.8)', 0.9);
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(k.x, k.y + bob, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#dff3ff';
      ctx.beginPath(); ctx.arc(k.x, k.y + bob, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawParticles(ctx, state) {
  for (const q of state.particles) {
    ctx.globalAlpha = clamp(q.life / q.maxLife, 0, 1);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
  for (const f of state.floats) {
    ctx.globalAlpha = clamp(f.life / 0.9, 0, 1);
    text(ctx, f.text, f.x, f.y, 15, f.color, 'center', '800');
  }
  ctx.globalAlpha = 1;
}

// ---- HUD ----------------------------------------------------------------------

export function drawHUD(ctx, state) {
  const p = state.player;
  const W = state.w;
  // Top bar.
  ctx.fillStyle = 'rgba(5,6,16,0.72)';
  ctx.fillRect(0, 0, W, 54);
  ctx.strokeStyle = 'rgba(143,123,255,0.25)';
  ctx.beginPath(); ctx.moveTo(0, 54); ctx.lineTo(W, 54); ctx.stroke();

  // HP bar.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, 20, 16, 220, 20, 6); ctx.fill();
  ctx.fillStyle = p.hp / p.maxHp > 0.35 ? '#ff6b81' : '#ff2e4d';
  roundRect(ctx, 20, 16, 220 * clamp(p.hp / p.maxHp, 0, 1), 20, 6); ctx.fill();
  text(ctx, Math.ceil(p.hp) + ' / ' + p.maxHp, 130, 27, 13, '#ffffff', 'center', '800');

  text(ctx, 'SCORE  ' + state.score.toLocaleString('en-US'), W / 2 - 130, 27, 19, INK, 'center', '800');
  text(ctx, 'WAVE ' + state.wave + ' / ' + TOTAL_WAVES, W / 2 + 130, 27, 16, GOLD, 'center', '800');

  text(ctx, '◆ ' + state.embers, W - 260, 27, 16, '#ffb347', 'right', '800');
  text(ctx, 'BEST ' + state.best.toLocaleString('en-US'), W - 20, 27, 14, '#8f8aa8', 'right', '700');
  text(ctx, formatTime(state.time), W - 130, 27, 14, '#8f8aa8', 'right', '700');

  // Dash cooldown pip under the HP bar.
  const dashReady = p.dashCd <= 0;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, 20, 42, 90, 6, 3); ctx.fill();
  ctx.fillStyle = dashReady ? GOLD : '#6f6a8a';
  roundRect(ctx, 20, 42, 90 * (dashReady ? 1 : clamp(1 - p.dashCd / 1.6, 0, 1)), 6, 3); ctx.fill();
  text(ctx, dashReady ? 'DASH READY [SPACE]' : 'DASH…', 118, 46, 10, dashReady ? GOLD : '#8f8aa8', 'left', '700');

  // Boss bar.
  const boss = state.enemies.find(e => e.kind === 'boss');
  if (boss) {
    const bw = 460;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, W / 2 - bw / 2, 66, bw, 14, 7); ctx.fill();
    ctx.fillStyle = '#c084fc';
    roundRect(ctx, W / 2 - bw / 2, 66, bw * clamp(boss.hp / boss.maxHp, 0, 1), 14, 7); ctx.fill();
    text(ctx, 'THE GLOOM HERALD', W / 2, 96, 13, '#e9d5ff', 'center', '800');
  }

  // Wave banner.
  if (state.bannerTime > 0) {
    const a = clamp(state.bannerTime / 0.5, 0, 1);
    ctx.globalAlpha = a;
    text(ctx, state.waveBanner, W / 2, 150, 34, GOLD, 'center', '900');
    ctx.globalAlpha = 1;
  }

  // Low-HP vignette.
  if (p.alive && p.hp / p.maxHp < 0.3) {
    const pulse = 0.25 + 0.12 * Math.sin(state.time * 6);
    const vg = ctx.createRadialGradient(W / 2, state.h / 2, state.h * 0.42, W / 2, state.h / 2, state.h * 0.85);
    vg.addColorStop(0, 'rgba(255,0,40,0)');
    vg.addColorStop(1, 'rgba(255,0,40,' + pulse + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, state.h);
  }
}

// ---- screens ------------------------------------------------------------------

function dim(ctx, state, alpha) {
  ctx.fillStyle = 'rgba(5,6,16,' + alpha + ')';
  ctx.fillRect(0, 0, state.w, state.h);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,11,26,0.88)';
  roundRect(ctx, x, y, w, h, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(255,209,102,0.35)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 14); ctx.stroke();
}

export function drawTitle(ctx, state, t) {
  dim(ctx, state, 0.45);
  const W = state.w;
  glowCircle(ctx, W / 2, 200, 220, 'rgba(255,190,80,0.5)', 0.8 + 0.1 * Math.sin(t * 1.6));
  text(ctx, 'E M B E R H O L D', W / 2, 150, 64, GOLD, 'center', '900');
  text(ctx, '—  LAST LANTERN  —', W / 2, 205, 20, '#c9b8ff', 'center', '700');
  text(ctx, 'The dark has swallowed the valley. Hold the last lantern.', W / 2, 262, 18, INK, 'center', '600');
  text(ctx, 'Survive all 10 waves. Slay the Gloom Herald. Twice.', W / 2, 290, 16, '#8f8aa8', 'center', '600');

  panel(ctx, W / 2 - 330, 330, 660, 150);
  text(ctx, 'WASD / ARROWS — move        MOUSE — aim', W / 2, 362, 16, INK, 'center', '700');
  text(ctx, 'HOLD CLICK — fire        SPACE — dash (brief invulnerability)', W / 2, 392, 16, INK, 'center', '700');
  text(ctx, 'Clear a wave, pick 1 of 3 upgrades, face the next.', W / 2, 422, 16, INK, 'center', '700');
  text(ctx, 'Embers score. Hearts heal. Blue orbs shield.', W / 2, 452, 16, '#8f8aa8', 'center', '600');

  const pulse = 0.75 + 0.25 * Math.sin(t * 4);
  ctx.globalAlpha = pulse;
  text(ctx, 'CLICK OR PRESS ENTER TO BEGIN', W / 2, 540, 22, '#ffffff', 'center', '800');
  ctx.globalAlpha = 1;
  if (state.best > 0) {
    text(ctx, 'BEST SCORE  ' + state.best.toLocaleString('en-US') + '   ·   BEST WAVE  ' + state.bestWave + ' / ' + TOTAL_WAVES,
      W / 2, 590, 15, '#8f8aa8', 'center', '700');
  }
  text(ctx, 'An original game — art, sound and code made for this entry.', W / 2, 668, 12, '#55516e', 'center', '600');
}

export function drawUpgrade(ctx, state) {
  dim(ctx, state, 0.55);
  const W = state.w;
  text(ctx, 'WAVE ' + state.wave + ' CLEARED', W / 2, 120, 30, GOLD, 'center', '900');
  text(ctx, 'Choose one blessing of the lantern:', W / 2, 160, 18, INK, 'center', '600');
  const cw = 300, ch = 210, gap = 26;
  const total = cw * 3 + gap * 2;
  const x0 = W / 2 - total / 2;
  state.upgradeRects = [];
  state.upgradeChoices.forEach((u, i) => {
    const x = x0 + i * (cw + gap);
    const y = 210;
    state.upgradeRects.push({ x, y, w: cw, h: ch, id: u.id });
    const hover = state.hoverCard === i;
    ctx.fillStyle = hover ? 'rgba(38,30,72,0.96)' : 'rgba(16,17,38,0.94)';
    roundRect(ctx, x, y, cw, ch, 14); ctx.fill();
    ctx.strokeStyle = hover ? GOLD : 'rgba(143,123,255,0.5)';
    ctx.lineWidth = hover ? 2.5 : 1.5;
    roundRect(ctx, x, y, cw, ch, 14); ctx.stroke();
    text(ctx, u.icon, x + cw / 2, y + 58, 44, GOLD, 'center', '900');
    text(ctx, u.name, x + cw / 2, y + 118, 19, INK, 'center', '800');
    // Wrap the description over two lines if it is long.
    const words = u.desc.split(' ');
    let line = '';
    const lines = [];
    for (const wd of words) {
      if ((line + ' ' + wd).trim().length > 26) { lines.push(line.trim()); line = wd; }
      else line += ' ' + wd;
    }
    lines.push(line.trim());
    lines.forEach((ln, li) => text(ctx, ln, x + cw / 2, y + 152 + li * 22, 14, '#a49ed0', 'center', '600'));
    text(ctx, (i + 1) + '  —  press ' + (i + 1), x + cw / 2, y + ch - 22, 12, '#6f6a8a', 'center', '700');
  });
  text(ctx, 'Click a card or press 1 / 2 / 3', W / 2, 480, 15, '#8f8aa8', 'center', '600');
}

export function drawPaused(ctx, state) {
  dim(ctx, state, 0.6);
  text(ctx, 'PAUSED', state.w / 2, 320, 48, INK, 'center', '900');
  text(ctx, 'Press P or click to resume', state.w / 2, 380, 18, '#8f8aa8', 'center', '600');
}

export function drawGameOver(ctx, state) {
  dim(ctx, state, 0.62);
  const W = state.w;
  text(ctx, 'THE LIGHT GOES OUT', W / 2, 210, 52, '#ff5a4e', 'center', '900');
  text(ctx, 'The shadows take the valley… this time.', W / 2, 268, 18, INK, 'center', '600');
  panel(ctx, W / 2 - 260, 310, 520, 150);
  text(ctx, 'SCORE   ' + state.score.toLocaleString('en-US'), W / 2, 348, 20, INK, 'center', '800');
  text(ctx, 'WAVE REACHED   ' + state.wave + ' / ' + TOTAL_WAVES + '      KILLS   ' + state.kills, W / 2, 384, 17, '#a49ed0', 'center', '700');
  text(ctx, 'TIME   ' + formatTime(state.time) + '      EMBERS   ' + state.embers, W / 2, 416, 17, '#a49ed0', 'center', '700');
  text(ctx, 'BEST  ' + state.best.toLocaleString('en-US'), W / 2, 500, 16, GOLD, 'center', '800');
  text(ctx, 'Press R or click to try again', W / 2, 556, 20, '#ffffff', 'center', '800');
}

export function drawVictory(ctx, state) {
  dim(ctx, state, 0.5);
  const W = state.w;
  glowCircle(ctx, W / 2, 210, 260, 'rgba(255,209,102,0.6)', 0.9);
  text(ctx, 'THE LANTERN ENDURES', W / 2, 200, 52, GOLD, 'center', '900');
  text(ctx, 'Ten waves. Two heralds slain. Dawn breaks over the valley.', W / 2, 258, 18, INK, 'center', '600');
  panel(ctx, W / 2 - 260, 300, 520, 150);
  text(ctx, 'FINAL SCORE   ' + state.score.toLocaleString('en-US'), W / 2, 338, 20, INK, 'center', '800');
  text(ctx, 'KILLS   ' + state.kills + '      TIME   ' + formatTime(state.time), W / 2, 374, 17, '#a49ed0', 'center', '700');
  text(ctx, 'EMBERS   ' + state.embers + '      DAMAGE TAKEN   ' + state.damageTaken, W / 2, 406, 17, '#a49ed0', 'center', '700');
  text(ctx, 'BEST  ' + state.best.toLocaleString('en-US'), W / 2, 490, 16, GOLD, 'center', '800');
  text(ctx, 'Press R or click to play again', W / 2, 546, 20, '#ffffff', 'center', '800');
}

// ---- frame ----------------------------------------------------------------------

export function drawFrame(ctx, state, t) {
  ctx.save();
  if (state.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }
  drawBackground(ctx, state, t);
  if (state.phase === 'title') {
    // A quiet demo fight plays behind the title.
    for (const e of state.enemies) drawEnemy(ctx, e, t);
    drawParticles(ctx, state);
    drawTitle(ctx, state, t);
  } else {
    drawPickups(ctx, state, t);
    for (const e of state.enemies) drawEnemy(ctx, e, t);
    if (state.player.alive) drawPlayer(ctx, state.player, t);
    drawBullets(ctx, state);
    drawParticles(ctx, state);
    drawHUD(ctx, state);
    if (state.phase === 'upgrade') drawUpgrade(ctx, state);
    else if (state.phase === 'paused') drawPaused(ctx, state);
    else if (state.phase === 'over') drawGameOver(ctx, state);
    else if (state.phase === 'win') drawVictory(ctx, state);
  }
  ctx.restore();
}
