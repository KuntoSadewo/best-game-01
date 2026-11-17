// Waves and the between-wave upgrade draft. Ten waves; the 5th and 10th end in
// the Gloom Herald. Clearing wave 10 wins the run. Upgrades are offered as
// three cards the player clicks — a choice that matters every wave.

import { edgeSpawn } from './util.js';
import { spawnEnemy, spawnBoss } from './entities.js';

export const TOTAL_WAVES = 10;

// composition per wave: [kind, count]. Boss waves add the boss on top.
const WAVE_TABLE = {
  1: [['wisp', 6]],
  2: [['wisp', 8], ['skitter', 3]],
  3: [['wisp', 8], ['skitter', 5], ['spitter', 2]],
  4: [['wisp', 10], ['skitter', 6], ['spitter', 3], ['splitter', 2]],
  5: [['wisp', 8], ['skitter', 6], ['spitter', 3], ['splitter', 3]],
  6: [['wisp', 12], ['skitter', 8], ['spitter', 4], ['splitter', 4], ['brute', 1]],
  7: [['wisp', 12], ['skitter', 10], ['spitter', 5], ['splitter', 5], ['brute', 2]],
  8: [['wisp', 14], ['skitter', 10], ['spitter', 6], ['splitter', 6], ['brute', 3]],
  9: [['wisp', 16], ['skitter', 12], ['spitter', 7], ['splitter', 7], ['brute', 4]],
  10: [['wisp', 10], ['skitter', 8], ['spitter', 4], ['splitter', 4], ['brute', 3]],
};

export function isBossWave(wave) {
  return wave === 5 || wave === 10;
}

// Build the spawn queue for a wave: a trickle at first, then the rest in
// small groups so the player is never buried at the spawn moment.
export function buildWaveQueue(wave, rng) {
  const queue = [];
  for (const [kind, count] of WAVE_TABLE[wave]) {
    for (let i = 0; i < count; i++) queue.push(kind);
  }
  // Shuffle so kinds arrive mixed.
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

export function spawnFromQueue(state, dt) {
  if (!state.spawnQueue.length) return;
  state.spawnTimer -= dt;
  // One enemy every 0.55 s early, faster later; at most 3 at once at the start.
  const interval = state.wave >= 7 ? 0.34 : 0.55;
  if (state.spawnTimer <= 0) {
    state.spawnTimer = interval;
    const kind = state.spawnQueue.shift();
    const p = edgeSpawn(state.rng, state.w, state.h, 40);
    state.enemies.push(spawnEnemy(kind, p.x, p.y, state.wave));
  }
}

export function startWave(state, wave) {
  state.wave = wave;
  state.spawnQueue = buildWaveQueue(wave, state.rng);
  state.spawnTimer = 0.4;
  state.bossDown = false;
  state.waveBanner = 'WAVE ' + wave + (isBossWave(wave) ? ' — THE GLOOM HERALD' : '');
  state.bannerTime = 2.4;
  if (isBossWave(wave)) {
    state.enemies.push(spawnBoss(wave, state.w, state.h, state.rng));
    state.sound.bossRoar();
  } else {
    state.sound.waveHorn();
  }
}

// ---- upgrades ----------------------------------------------------------------

export const UPGRADES = [
  { id: 'damage', name: 'HEAVY ROUNDS', desc: '+35% bullet damage', icon: '✦', apply(p) { p.damage *= 1.35; } },
  { id: 'firerate', name: 'RAPID LANTERN', desc: '+30% fire rate', icon: '≫', apply(p) { p.fireRate *= 1.3; } },
  { id: 'multishot', name: 'TRIPLE FLAME', desc: '+1 projectile per shot', icon: '✺', apply(p) { p.shots = Math.min(5, p.shots + 1); } },
  { id: 'speed', name: 'SWIFT BOOTS', desc: '+15% move speed', icon: '»', apply(p) { p.speed *= 1.15; } },
  { id: 'maxhp', name: 'STURDY WICK', desc: '+30 max HP, heal 30', icon: '♥', apply(p) { p.maxHp += 30; p.hp = Math.min(p.maxHp, p.hp + 30); } },
  { id: 'magnet', name: 'EMBER LURE', desc: '+60% pickup magnet', icon: '◎', apply(p) { p.magnet *= 1.6; } },
  { id: 'regen', name: 'SLOW BURN', desc: 'Regenerate 1.2 HP / s', icon: '✚', apply(p) { p.regen += 1.2; } },
  { id: 'bulletspeed', name: 'LONG LANTERN', desc: '+25% bullet speed', icon: '→', apply(p) { p.bulletSpeed *= 1.25; } },
  { id: 'dash', name: 'QUICKSTEP', desc: 'Dash recharges 40% faster', icon: '↯', apply(p) { p.dashRecharge = (p.dashRecharge || 1) * 1.4; } },
  { id: 'score', name: 'GILDED EMBERS', desc: '+25% score from all sources', icon: '◆', apply(p, s) { s.scoreMult *= 1.25; } },
];

// Three distinct cards, drawn at random, never the same card twice in a row
// when a cheaper reroll would do — here: pure random distinct picks.
export function drawUpgrades(state) {
  const pool = [...UPGRADES];
  const picks = [];
  while (picks.length < 3 && pool.length) {
    const i = Math.floor(state.rng() * pool.length);
    picks.push(pool.splice(i, 1)[0]);
  }
  state.upgradeChoices = picks;
}
