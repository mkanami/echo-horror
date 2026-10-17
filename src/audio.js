import * as THREE from 'three';
import { bakeBank } from './sfx.js';

// Recorded samples (public/sfx, see CREDITS.md) played through HRTF panners,
// a concrete-room convolution reverb and per-source occlusion low-pass.

const SURF = { 1: 'step_tile', 2: 'step_water', 3: 'step_tile', 4: 'step_metal', 5: 'step_carpet' };
const _v = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.occlusion = () => 0;
  }

  async init(onProgress) {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.bank = bakeBank(ctx, ['spark', 'scratch']);
    this.master = ctx.createGain();
    this.master.gain.value = location.search.includes('mute') ? 0 : 0.9;
    this.muted = location.search.includes('mute');
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.bank.ir;
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 7000;
    const rg = ctx.createGain();
    rg.gain.value = 0.75;
    this.reverb.connect(rlp).connect(rg).connect(this.master);

    // harsh saturation bus for the screamer
    this.dist = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      const x = (i / 2047) * 2 - 1;
      curve[i] = Math.tanh(x * 4) / Math.tanh(4);
    }
    this.dist.curve = curve;
    this.dist.connect(this.master);

    await this.loadSamples(onProgress);
    this._startAmbience();
    this.ready = true;
  }

  async loadSamples(onProgress) {
    const response = await fetch('sfx/manifest.json');
    if (!response.ok) throw new Error(`Sound manifest: HTTP ${response.status}`);
    const man = await response.json();
    const jobs = [];
    for (const name in man) for (const file of man[name]) jobs.push([name, file]);
    let done = 0;
    const failed = [];
    await Promise.all(
      jobs.map(async ([name, file]) => {
        try {
          const response = await fetch('sfx/' + file);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const ab = await response.arrayBuffer();
          const buf = await this.ctx.decodeAudioData(ab);
          (this.bank[name] ||= []).push(buf);
        } catch (e) {
          console.warn('sfx failed', file, e);
          failed.push(file);
        }
        done++;
        if (onProgress) onProgress(done / jobs.length, done, jobs.length);
      }),
    );
    if (failed.length) throw new Error(`${failed.length} sound samples failed to load`);
  }

  get t() {
    return this.ctx.currentTime;
  }

  out(pos, { wet = 0.35, gain = 1, ref = 1.2, roll = 1.25, lp = 0, bus = null, occ: useOcc = true } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    let tail = g;
    let occ = 0;
    if (pos) {
      occ = useOcc ? this.occlusion(pos) : 0;
      const p = makePanner(ctx, ref, roll);
      setPannerPos(p, pos, ctx, true);
      tail.connect(p);
      tail = p;
      wet *= 1 + occ * 1.5;
    }
    const f = lp || (occ > 0.01 ? 18000 * Math.pow(0.05, occ) : 0);
    if (f) {
      const l = ctx.createBiquadFilter();
      l.type = 'lowpass';
      l.frequency.value = f;
      tail.connect(l);
      tail = l;
    }
    tail.connect(bus || this.master);
    const w = ctx.createGain();
    w.gain.value = wet;
    tail.connect(w).connect(this.reverb);
    return g;
  }

  play(name, pos = null, { gain = 1, rate = 1, vary = 0.05, wet = 0.35, ref = 1.2, roll = 1.25, delay = 0, lp = 0, bus = null, offset = 0, occ = true } = {}) {
    if (!this.ready && !this.bank?.[name]) return null;
    const list = this.bank[name];
    if (!list || !list.length) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = list[Math.floor(Math.random() * list.length)];
    s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    s.connect(this.out(pos, { wet, gain, ref, roll, lp, bus, occ }));
    s.start(this.t + delay, offset);
    return s;
  }

  channel({ wet = 0.35, ref = 1.2, roll = 1.2 } = {}) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 18000;
    const p = makePanner(ctx, ref, roll);
    input.connect(lp).connect(p);
    p.connect(this.master);
    const w = ctx.createGain();
    w.gain.value = wet;
    p.connect(w).connect(this.reverb);
    return {
      input,
      setPos: (pos) => {
        setPannerPos(p, pos, ctx);
        const occ = this.occlusion(pos);
        lp.frequency.setTargetAtTime(18000 * Math.pow(0.05, occ), ctx.currentTime, 0.12);
        w.gain.setTargetAtTime(wet * (1 + occ * 1.5), ctx.currentTime, 0.12);
      },
    };
  }

  setListener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = cam.position;
    const f = cam.getWorldDirection(_v);
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.015);
      L.positionY.setTargetAtTime(p.y, t, 0.015);
      L.positionZ.setTargetAtTime(p.z, t, 0.015);
      L.forwardX.setTargetAtTime(f.x, t, 0.015);
      L.forwardY.setTargetAtTime(f.y, t, 0.015);
      L.forwardZ.setTargetAtTime(f.z, t, 0.015);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  // ---------------------------------------------------------------- player
  step(surface, loud = 1) {
    const g = 0.22 + loud * 0.5;
    this.play(SURF[surface] || 'step_tile', null, { gain: g, rate: 1 - loud * 0.03, vary: 0.07, wet: 0.15 + loud * 0.12 });
    if (surface === 3) this.play('glass_crunch', null, { gain: g * 0.45, rate: 1.1, vary: 0.15, wet: 0.2 });
  }
  click() {
    // cane tip on the floor: a hard 'tok' and a little ring of the aluminium shaft
    this.play('click', null, { gain: 0.3, rate: 1.25, vary: 0.08, wet: 1.3 });
    this.play('tick', null, { gain: 0.18, rate: 2.2, vary: 0.1, wet: 0.6, delay: 0.01 });
  }
  breath(out, strength) {
    if (!out) return; // one recorded breath per cycle
    // strength: 0.4 rested .. 1.6 exhausted. Rested breathing should sit barely
    // above the room tone, softened like you hear it from inside your head.
    const tired = Math.max(0, Math.min(1, (strength - 0.4) / 1.2));
    const heavy = tired > 0.45;
    this.play(heavy ? 'breath_heavy' : 'breath_calm', null, {
      gain: heavy ? 0.1 + tired * 0.18 : 0.045 + tired * 0.08,
      lp: heavy ? 3500 : 1800,
      wet: 0.03,
      vary: 0.04,
    });
  }
  gasp() {
    this.play('breath_heavy', null, { gain: 0.5, wet: 0.3, rate: 1.05, lp: 5000 });
  }
  bodyFall(pos, surface) {
    this.play('flesh', pos, { gain: 0.75, rate: 0.65, vary: 0.06, wet: 0.4, lp: 2200 });
    this.play(SURF[surface] || 'step_tile', pos, { gain: 0.5, rate: 0.65, wet: 0.3 });
    this.gasp();
  }
  heartbeat(intensity) {
    this.play('heart', null, { gain: 0.3 + intensity * 0.9, wet: 0, vary: 0.02, lp: 900 });
  }
  whoosh() {
    this.play('whoosh', null, { gain: 0.3, wet: 0.05, rate: 1.3 });
  }

  // ---------------------------------------------------------------- world
  impact(pos, loud = 1) {
    this.play('stone', pos, { gain: 0.9 * loud, wet: 0.6, vary: 0.1 });
  }
  drip(pos) {
    this.play('drip', pos, { gain: 0.6, wet: 0.9, ref: 1, roll: 1.5, vary: 0.12 });
  }
  spark(pos) {
    this.play('spark', pos, { gain: 0.4, wet: 0.4, roll: 1.5 });
  }
  groan(pos) {
    const r = Math.random();
    if (r < 0.45) this.play('creak', pos, { gain: 0.9, wet: 1.8, ref: 3, roll: 0.6, rate: rnd(0.35, 0.55), vary: 0 });
    else if (r < 0.8) this.play('knock', pos, { gain: 0.8, wet: 1.6, ref: 3, roll: 0.6, rate: rnd(0.6, 0.8), lp: 1200 });
    else this.play('m_growl', pos, { gain: 0.6, wet: 2.0, ref: 3, roll: 0.6, rate: rnd(0.6, 0.75), lp: 900 }); // something else, far away
  }
  whisper(pos) {
    this.play('m_short', pos, { gain: 0.5, wet: 2.0, ref: 2, roll: 0.7, rate: rnd(0.5, 0.65), lp: 1500 });
  }
  door(pos) {
    this.play('door', pos, { gain: 1.0, wet: 0.6, rate: 0.85 });
    this.play('metal_heavy', pos, { gain: 0.6, wet: 0.8, rate: 0.7, delay: 1.1 });
  }
  rattle(pos) {
    for (let i = 0; i < 3; i++) this.play('knock', pos, { gain: 0.45, wet: 0.7, rate: rnd(1.3, 1.7), delay: i * rnd(0.09, 0.14), lp: 3500 });
    this.play('tick', pos, { gain: 0.5, wet: 0.4, rate: 0.8 });
  }
    slam(pos) {
    this.play('slam', pos, { gain: 1.1, wet: 1.0, ref: 2, rate: 0.8 });
    this.play('metal_heavy', pos, { gain: 0.7, wet: 1.0, ref: 2, rate: 0.6, delay: 0.05 });
  }
  crash(pos) {
    for (let i = 0; i < 9; i++) this.play(i % 3 ? 'metal_heavy' : 'slam', pos, { gain: rnd(0.6, 1.2), wet: 1.2, ref: 4, roll: 0.5, rate: rnd(0.55, 0.9), delay: Math.pow(Math.random(), 1.7) * 1.4 });
    this.play('bonecrack', pos, { gain: 1, wet: 0.8, ref: 4, roll: 0.5, delay: 0.3 });
    this.stinger('low', 0.9);
  }
  pickup() {
    this.play('pickup', null, { gain: 0.22, wet: 0.2, rate: 1.4 });
  }
  paper() {
    this.play('paper', null, { gain: 0.35, wet: 0.1 });
  }
  ding(pos) {
    this.play('ding', pos, { gain: 0.8, wet: 1.0, ref: 3, roll: 0.6, vary: 0, rate: 1.1 });
  }
  scratch(pos) {
    this.play('scratch', pos, { gain: 0.6, wet: 0.3 });
  }
  // dissonant horror hit; kind: low | mid | high | mid2
  stinger(kind = 'mid', gain = 0.8) {
    this.play('sting_' + kind, null, { gain, wet: 0.5, vary: 0 });
  }

  // ---------------------------------------------------------------- monster
  monsterStep(pos, heavy = 1) {
    this.play('flesh', pos, { gain: 0.55 + heavy * 0.45, wet: 0.55, ref: 1.5, roll: 1.0, rate: rnd(0.6, 0.75) - (heavy - 1) * 0.05, vary: 0 });
    if (Math.random() < 0.6) this.play('tick', pos, { gain: 0.25, wet: 0.4, ref: 1.2, roll: 1.2, rate: rnd(1.5, 2.0), delay: rnd(0.02, 0.07) });
    if (Math.random() < 0.15) this.play('bonecrack', pos, { gain: 0.35, wet: 0.5, ref: 1.2, roll: 1.2, rate: rnd(0.8, 1.1), delay: 0.1 });
  }
  monsterSniff(pos) {
    for (let i = 0; i < 3; i++) this.play('m_sniff', pos, { gain: 1.0, wet: 0.3, ref: 1, roll: 1.4, rate: rnd(0.7, 0.9), delay: i * rnd(0.2, 0.3) });
    this.play('breath_heavy', pos, { gain: 0.7, wet: 0.4, ref: 1, roll: 1.4, rate: 0.55, delay: 0.95 });
  }
  monsterClick(pos) {
    this.play('m_click', pos, { gain: 0.9, wet: 0.9, ref: 1.5, roll: 1.0, rate: rnd(0.6, 0.8) });
  }
  monsterCroak(pos, loud = 1) {
    const growl = Math.random() < 0.45;
    this.play(growl ? 'm_growl' : 'm_short', pos, { gain: 0.45 + loud * 0.55, wet: 0.6, ref: 1.3, roll: 1.0, rate: growl ? rnd(0.75, 0.9) : rnd(0.55, 0.7), vary: 0 });
  }
  monsterHiss(pos) {
    this.play('m_hiss', pos, { gain: 1.3, wet: 0.5, ref: 1.5, roll: 1.0, rate: rnd(0.6, 0.72), vary: 0 });
    this.play('m_scream', pos, { gain: 0.7, wet: 0.5, ref: 1.5, roll: 1.0, rate: 0.6, delay: 0.55 });
    this.stinger('mid2', 0.55);
  }
  monsterRoar(pos) {
    this.play('m_roar', pos, { gain: 1.3, wet: 1.0, ref: 3, roll: 0.5, rate: rnd(0.7, 0.85), vary: 0 });
  }

  // the screamer: everything at once, saturated, head-locked
  scream() {
    const o = { wet: 0.4, vary: 0, bus: this.dist };
    this.play('m_scream', null, { ...o, gain: 1.0, rate: 0.82 });
    this.play('m_scream', null, { ...o, gain: 0.7, rate: 0.62, delay: 0.03 });
    this.play('m_roar', null, { ...o, gain: 0.9, rate: 0.75 });
    this.play('sting_high', null, { gain: 1.0, wet: 0.3, vary: 0 });
    this.play('sting_low', null, { gain: 1.2, wet: 0.3, vary: 0 });
    this.play('bonecrack', null, { gain: 0.8, wet: 0.2, delay: 0.1 });
  }

  createMonsterVoice() {
    const ch = this.channel({ wet: 0.45, ref: 1.2, roll: 1.1 });
    let cur = null;
    const src = (name, rate, gain) => {
      const list = this.bank[name];
      const s = this.ctx.createBufferSource();
      s.buffer = list[Math.floor(Math.random() * list.length)];
      s.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      s.connect(g).connect(ch.input);
      s.start();
      return s;
    };
    return {
      setPos: ch.setPos,
      // a human breath slowed down ~40% turns into something huge and wet
      breathe: (inhale, loud) => {
        if (!this.ready || !inhale) return;
        cur = src(Math.random() < 0.2 ? 'm_breath' : 'breath_heavy', rnd(0.5, 0.62), loud * 1.1);
      },
      croak: (loud) => {
        if (!this.ready) return;
        const growl = Math.random() < 0.4;
        src(growl ? 'm_growl' : 'm_short', growl ? rnd(0.75, 0.9) : rnd(0.55, 0.7), loud * 0.9);
      },
      silence: () => {
        try {
          if (cur) cur.stop();
        } catch (_) {}
      },
    };
  }

  createLoop(name, pos, gain = 0.5, { ref = 2, roll = 1, rate = 1 } = {}) {
    const ctx = this.ctx;
    const ch = this.channel({ wet: 0.5, ref, roll });
    ch.setPos(pos);
    const s = ctx.createBufferSource();
    s.buffer = this.bank[name][0];
    s.loop = true;
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(g).connect(ch.input);
    s.start(0, Math.random() * s.buffer.duration);
    return {
      setGain: (v, tc = 1.0) => g.gain.setTargetAtTime(v * gain, ctx.currentTime, tc),
      spinUp: (sec) => {
        s.playbackRate.setValueAtTime(0.25 * rate, ctx.currentTime);
        s.playbackRate.exponentialRampToValueAtTime(rate, ctx.currentTime + sec);
      },
      setPos: ch.setPos,
      update: () => ch.setPos(pos),
    };
  }

  createMachine(pos, { type = 'generator', gain = 0.5 } = {}) {
    return this.createLoop(type === 'generator' ? 'loop_gen' : 'loop_lift', pos, gain * 1.6, { ref: 3, roll: 0.8, rate: type === 'generator' ? 0.8 : 1 });
  }

  _startAmbience() {
    const ctx = this.ctx;
    const amb = ctx.createGain();
    amb.gain.value = 0;
    amb.gain.setTargetAtTime(0.35, ctx.currentTime, 3);
    amb.connect(this.master);
    for (const [name, g, rate] of [['amb_belly', 0.55, 0.8], ['loop_vent', 0.12, 0.6]]) {
      const s = ctx.createBufferSource();
      s.buffer = this.bank[name][0];
      s.loop = true;
      s.playbackRate.value = rate;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const gg = ctx.createGain();
      gg.gain.value = g;
      s.connect(lp).connect(gg).connect(amb);
      s.start(0, Math.random() * 5);
    }
    this.ambGain = amb;
  }

  setAmbience(v) {
    if (this.ambGain) this.ambGain.gain.setTargetAtTime(v, this.ctx.currentTime, 1.5);
  }

  setMaster(v, tc = 0.5) {
    if (this.muted) v = 0;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  cut() {
    // hard cut to silence (end of the screamer)
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(0, this.ctx.currentTime);
  }
}

function makePanner(ctx, ref, roll) {
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = ref;
  p.rolloffFactor = roll;
  p.maxDistance = 80;
  return p;
}

function setPannerPos(p, pos, ctx, instant = false) {
  if (p.positionX) {
    if (instant) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else {
      const t = ctx.currentTime;
      p.positionX.setTargetAtTime(pos.x, t, 0.02);
      p.positionY.setTargetAtTime(pos.y, t, 0.02);
      p.positionZ.setTargetAtTime(pos.z, t, 0.02);
    }
  } else p.setPosition(pos.x, pos.y, pos.z);
}
