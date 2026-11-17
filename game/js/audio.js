// All sound is synthesised with WebAudio oscillators: no audio files, no network.
// The bank stays silent until the player first interacts (browser autoplay rule);
// screenshot mode never creates a context at all.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.padNodes = null;
  }

  // Call from a user gesture (click / key). Safe to call repeatedly.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startPad();
    } catch (e) {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // A quiet two-oscillator drone that sits under the game. Started once.
  startPad() {
    if (!this.ctx || this.padNodes) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.045;
    const o1 = this.ctx.createOscillator();
    o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = this.ctx.createOscillator();
    o2.type = 'triangle'; o2.frequency.value = 82.4;
    const o3 = this.ctx.createOscillator();
    o3.type = 'sine'; o3.frequency.value = 110.3;
    const g3 = this.ctx.createGain();
    g3.gain.value = 0.35;
    o1.connect(g); o2.connect(g); o3.connect(g3); g3.connect(g);
    g.connect(this.master);
    o1.start(); o2.start(); o3.start();
    // Slow breathing on the drone so it never feels like a stuck note.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    lfo.start();
    this.padNodes = { o1, o2, o3, lfo };
  }

  // One short blip: a sine/triangle/square burst with a pitch slide.
  blip({ type = 'sine', from = 440, to = 220, dur = 0.12, vol = 0.2, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // Filtered noise burst: the thump behind explosions and hits.
  noise({ dur = 0.2, vol = 0.3, freq = 800, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }

  shoot() { this.blip({ type: 'square', from: 880, to: 320, dur: 0.07, vol: 0.08 }); }
  hit() { this.blip({ type: 'triangle', from: 300, to: 140, dur: 0.06, vol: 0.12 }); }
  kill() {
    this.blip({ type: 'sawtooth', from: 320, to: 60, dur: 0.22, vol: 0.16 });
    this.noise({ dur: 0.18, vol: 0.2, freq: 1200 });
  }
  hurt() {
    this.blip({ type: 'sawtooth', from: 180, to: 70, dur: 0.25, vol: 0.25 });
    this.noise({ dur: 0.15, vol: 0.18, freq: 500 });
  }
  pickup() {
    this.blip({ type: 'sine', from: 660, to: 990, dur: 0.1, vol: 0.14 });
    this.blip({ type: 'sine', from: 990, to: 1320, dur: 0.12, vol: 0.12, delay: 0.07 });
  }
  heart() {
    this.blip({ type: 'sine', from: 520, to: 780, dur: 0.14, vol: 0.16 });
    this.blip({ type: 'sine', from: 780, to: 1040, dur: 0.16, vol: 0.14, delay: 0.09 });
  }
  dash() { this.noise({ dur: 0.16, vol: 0.14, freq: 2400 }); }
  waveHorn() {
    this.blip({ type: 'sawtooth', from: 110, to: 220, dur: 0.5, vol: 0.14 });
    this.blip({ type: 'sawtooth', from: 165, to: 330, dur: 0.5, vol: 0.1, delay: 0.12 });
  }
  bossRoar() {
    this.blip({ type: 'sawtooth', from: 90, to: 40, dur: 0.8, vol: 0.3 });
    this.noise({ dur: 0.7, vol: 0.25, freq: 300 });
  }
  upgrade() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.blip({ type: 'sine', from: f, to: f, dur: 0.14, vol: 0.13, delay: i * 0.08 }));
  }
  victory() {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      this.blip({ type: 'triangle', from: f, to: f, dur: 0.22, vol: 0.16, delay: i * 0.11 }));
  }
  gameOver() {
    [392, 330, 262, 196].forEach((f, i) =>
      this.blip({ type: 'triangle', from: f, to: f * 0.94, dur: 0.3, vol: 0.16, delay: i * 0.16 }));
  }
}
