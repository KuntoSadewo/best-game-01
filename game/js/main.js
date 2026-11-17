// EMBERHOLD — Last Lantern. Entry point: owns the game state, the loop, the
// input and the five phases (title, playing, upgrade, paused, over, win).
// Also owns the deterministic screenshot mode: ?shot=title|play|boss|win|over
// builds a fixed scene from a seed and sets window.__shotReady when drawn.

import { mulberry32, clamp } from './util.js';
import { SoundBank } from './audio.js';
import {
  makePlayer, updatePlayer, updateEnemies, updateBullets,
  updatePickups, updateParticles,
} from './entities.js';
import { TOTAL_WAVES, spawnFromQueue, startWave, drawUpgrades } from './waves.js';
import { drawFrame } from './render.js';

const W = 1280, H = 720;
const GOLD = '#ffd166';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const shotScene = params.get('shot');
const shotSeed = Number(params.get('seed') || 7);

const sound = new SoundBank();

function loadBest() {
  try {
    return {
      score: Number(localStorage.getItem('emberhold.best') || 0),
      wave: Number(localStorage.getItem('emberhold.bestWave') || 0),
    };
  } catch (e) { return { score: 0, wave: 0 }; }
}

function saveBest(score, wave) {
  try {
    if (score > loadBest().score) localStorage.setItem('emberhold.best', String(score));
    if (wave > loadBest().wave) localStorage.setItem('emberhold.bestWave', String(wave));
  } catch (e) { /* storage unavailable: best score is just not kept */ }
}

function makeStars(rng) {
  const stars = [];
  const colors = ['#ffffff', '#c9b8ff', '#ffd166', '#9fd8ff'];
  for (let i = 0; i < 130; i++) {
    stars.push({
      x: rng() * W, y: rng() * H, s: rng() < 0.85 ? 1 : 2,
      a: 0.3 + rng() * 0.6, c: colors[Math.floor(rng() * colors.length)],
      tw: 0.6 + rng() * 2.2, ph: rng() * Math.PI * 2,
    });
  }
  return stars;
}

function freshState(rng) {
  const best = loadBest();
  return {
    w: W, h: H, rng,
    phase: 'title', // title | playing | upgrade | paused | over | win
    time: 0, score: 0, kills: 0, embers: 0, damageTaken: 0,
    wave: 0, scoreMult: 1,
    best: best.score, bestWave: best.wave,
    player: makePlayer(W / 2, H / 2 + 60),
    enemies: [], bullets: [], ebullets: [], particles: [], pickups: [], floats: [],
    spawnQueue: [], spawnTimer: 0,
    stars: makeStars(rng),
    shake: 0, bannerTime: 0, waveBanner: '',
    bossDown: false, upgradeChoices: [], upgradeRects: [], hoverCard: -1,
    sound,
  };
}

const state = freshState(mulberry32((Math.random() * 1e9) | 0));

// ---- input --------------------------------------------------------------------

const input = {
  up: false, down: false, left: false, right: false,
  firing: false, dash: false, mouseX: W / 2, mouseY: H / 2 - 100,
};

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (W / r.width),
    y: (e.clientY - r.top) * (H / r.height),
  };
}

window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code] !== undefined) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space') { input.dash = true; e.preventDefault(); }
  if (e.code === 'Enter' && state.phase === 'title') startGame();
  if (e.code === 'KeyR' && (state.phase === 'over' || state.phase === 'win')) startGame();
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state.phase === 'playing') state.phase = 'paused';
    else if (state.phase === 'paused') state.phase = 'playing';
  }
  if (e.code === 'KeyM') {
    sound.unlock();
    const muted = sound.toggleMute();
    state.floats.push({ x: state.player.x, y: state.player.y - 30, text: muted ? 'MUTED' : 'SOUND ON', color: '#8f8aa8', life: 0.9 });
  }
  if (state.phase === 'upgrade' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
    pickUpgrade(Number(e.code.slice(-1)) - 1);
  }
});

window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code] !== undefined) input[KEYMAP[e.code]] = false;
  if (e.code === 'Space') input.dash = false;
});

canvas.addEventListener('mousemove', (e) => {
  const p = canvasPos(e);
  input.mouseX = p.x; input.mouseY = p.y;
  // Hover highlight on upgrade cards.
  state.hoverCard = -1;
  if (state.phase === 'upgrade') {
    state.upgradeRects.forEach((r, i) => {
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) state.hoverCard = i;
    });
  }
});

canvas.addEventListener('mousedown', (e) => {
  sound.unlock();
  if (e.button !== 0) return;
  if (state.phase === 'title') { startGame(); return; }
  if (state.phase === 'over' || state.phase === 'win') { startGame(); return; }
  if (state.phase === 'paused') { state.phase = 'playing'; return; }
  if (state.phase === 'upgrade') {
    const p = canvasPos(e);
    const idx = state.upgradeRects.findIndex(r =>
      p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    if (idx >= 0) { pickUpgrade(idx); return; }
  }
  input.firing = true;
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) input.firing = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---- flow ---------------------------------------------------------------------

function startGame() {
  const rng = state.rng;
  const keepStars = state.stars;
  const keepBest = { score: state.best, wave: state.bestWave };
  Object.assign(state, freshState(rng));
  state.stars = keepStars;
  state.best = keepBest.score; state.bestWave = keepBest.wave;
  state.phase = 'playing';
  sound.unlock();
  startWave(state, 1);
}

function pickUpgrade(idx) {
  const u = state.upgradeChoices[idx];
  if (!u) return;
  u.apply(state.player, state);
  state.sound.upgrade();
  state.score += 100;
  state.phase = 'playing';
  startWave(state, state.wave + 1);
}

function endRun(won) {
  state.phase = won ? 'win' : 'over';
  saveBest(state.score, state.wave);
  state.best = Math.max(state.best, state.score);
  state.bestWave = Math.max(state.bestWave, state.wave);
  if (won) state.sound.victory();
  input.firing = false;
}

function update(dt) {
  state.time += dt;
  if (state.bannerTime > 0) state.bannerTime -= dt;

  if (state.phase === 'title') {
    // A quiet demo fight drifts behind the title screen.
    updateEnemies(state, dt);
    updateParticles(state, dt);
    if (state.enemies.length < 5 && Math.random() < dt * 0.5) {
      const kinds = ['wisp', 'skitter'];
      const k = kinds[Math.floor(Math.random() * kinds.length)];
      state.enemies.push({ kind: k, x: Math.random() * W, y: Math.random() * H, r: 13,
        hp: 10, maxHp: 10, speed: 40, dmg: 0, score: 0, color: k === 'wisp' ? '#8f7bff' : '#ff7ad9',
        angle: 0, wobble: Math.random() * 6, shootCd: 9, flash: 0, knockX: 0, knockY: 0 });
    }
    return;
  }
  if (state.phase !== 'playing') {
    updateParticles(state, dt);
    return;
  }

  updatePlayer(state, dt, input);
  spawnFromQueue(state, dt);
  updateEnemies(state, dt);
  updateBullets(state, dt);
  updatePickups(state, dt);
  updateParticles(state, dt);

  if (!state.player.alive) { endRun(false); return; }

  // Wave cleared: no enemies left and nothing left to spawn.
  if (!state.spawnQueue.length && !state.enemies.length) {
    if (state.wave >= TOTAL_WAVES) { endRun(true); return; }
    const bonus = 250 * state.wave;
    state.score += bonus;
    state.floats.push({ x: W / 2, y: H / 2 - 40, text: 'WAVE CLEAR  +' + bonus, color: GOLD, life: 1.2 });
    state.phase = 'upgrade';
    drawUpgrades(state);
    state.sound.upgrade();
  }
}

// ---- screenshot mode ------------------------------------------------------------

function buildShotScene(scene) {
  const rng = mulberry32(shotSeed);
  Object.assign(state, freshState(rng));
  state.stars = makeStars(rng);
  const p = state.player;

  if (scene === 'title') {
    state.phase = 'title';
    for (let i = 0; i < 6; i++) {
      state.enemies.push({ kind: i % 2 ? 'wisp' : 'skitter', x: 180 + i * 170, y: 420 + (i % 3) * 60, r: 13,
        hp: 10, maxHp: 10, speed: 0, dmg: 0, score: 0, color: i % 2 ? '#8f7bff' : '#ff7ad9',
        angle: 0, wobble: i, shootCd: 9, flash: 0, knockX: 0, knockY: 0 });
    }
    state.best = 12450; state.bestWave = 6;
  } else if (scene === 'play' || scene === 'boss') {
    state.phase = 'playing';
    state.wave = scene === 'boss' ? 5 : 3;
    state.score = scene === 'boss' ? 4860 : 2340;
    state.time = scene === 'boss' ? 214 : 96;
    state.kills = scene === 'boss' ? 41 : 22;
    state.embers = scene === 'boss' ? 38 : 17;
    p.x = 560; p.y = 400; p.hp = 74; p.aim = 0.5;
    const kinds = ['wisp', 'skitter', 'spitter', 'brute', 'splitter'];
    const spots = [[820, 300], [950, 480], [300, 250], [1020, 220], [240, 520], [700, 180], [420, 580], [1100, 380]];
    spots.forEach(([x, y], i) => {
      const k = kinds[i % kinds.length];
      const def = { wisp: '#8f7bff', skitter: '#ff7ad9', spitter: '#7dff9a', brute: '#ff5a4e', splitter: '#ffc857' }[k];
      state.enemies.push({ kind: k, x, y, r: k === 'brute' ? 24 : 14, hp: 30, maxHp: 40,
        speed: 60, dmg: 10, score: 50, color: def, angle: 0.4, wobble: i,
        shootCd: 2, flash: i === 2 ? 0.08 : 0, knockX: 0, knockY: 0 });
    });
    for (let i = 0; i < 5; i++) {
      const a = 0.5 + (i - 2) * 0.09;
      state.bullets.push({ x: 600 + i * 42, y: 412 - i * 6, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, r: 4, dmg: 13, life: 0.9, friendly: true });
    }
    state.pickups.push({ x: 700, y: 480, kind: 'ember', r: 11, life: 9, bob: 1 });
    state.pickups.push({ x: 480, y: 300, kind: 'heart', r: 11, life: 9, bob: 2 });
    state.particles.push({ x: 820, y: 300, vx: 40, vy: -60, life: 0.5, maxLife: 0.85, size: 4, color: '#ffd166' });
    state.particles.push({ x: 820, y: 300, vx: -50, vy: 30, life: 0.4, maxLife: 0.85, size: 3, color: '#8f7bff' });
    state.floats.push({ x: 950, y: 450, text: '+75', color: '#ffe9a8', life: 0.8 });
    if (scene === 'boss') {
      state.enemies.push({ kind: 'boss', x: 880, y: 320, r: 44, hp: 620, maxHp: 950,
        speed: 52, dmg: 25, score: 2500, color: '#c084fc', angle: 0, wobble: 0,
        shootCd: 2, summonCd: 5, chargeCd: 4, charging: 0, chargeX: 0, chargeY: 0, flash: 0, knockX: 0, knockY: 0 });
      state.waveBanner = 'WAVE 5 — THE GLOOM HERALD';
      state.bannerTime = 2;
    } else {
      state.waveBanner = 'WAVE 3';
      state.bannerTime = 1.6;
    }
  } else if (scene === 'win') {
    state.phase = 'win';
    state.wave = 10; state.score = 24850; state.kills = 187; state.time = 642; state.embers = 96;
    state.damageTaken = 342;
    state.best = 24850; state.bestWave = 10;
  } else if (scene === 'over') {
    state.phase = 'over';
    state.wave = 7; state.score = 8930; state.kills = 74; state.time = 321; state.embers = 51;
    state.best = 12450; state.bestWave = 6;
  }
  // One fixed-time render; the frame below draws it and signals readiness.
  drawFrame(ctx, state, 1.7);
  window.__shotReady = true;
}

// ---- main loop ------------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 1 / 30);
  last = now;
  update(dt);
  drawFrame(ctx, state, state.time);
  requestAnimationFrame(frame);
}

// Debug handle for automated play-testing (read-only state inspection).
window.__emberhold = { state, input };

if (shotScene) {
  buildShotScene(shotScene);
} else {
  requestAnimationFrame(frame);
}
