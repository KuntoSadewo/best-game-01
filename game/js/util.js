// Shared helpers: a seedable RNG (so screenshots are deterministic), maths and
// the small geometry the game needs. No DOM, no network, no state of its own.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

// Pick a point on the arena edge, outside the player's view of the centre.
export function edgeSpawn(rng, w, h, margin) {
  const side = Math.floor(rng() * 4);
  if (side === 0) return { x: -margin + rng() * (w + margin * 2), y: -margin };
  if (side === 1) return { x: -margin + rng() * (w + margin * 2), y: h + margin };
  if (side === 2) return { x: -margin, y: -margin + rng() * (h + margin * 2) };
  return { x: w + margin, y: -margin + rng() * (h + margin * 2) };
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}
