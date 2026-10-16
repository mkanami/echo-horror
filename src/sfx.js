// Offline DSP: reverb impulse response and the few noise-type sounds that
// have no recording (electrical sparks, claw scratching).
// (Legacy) Offline DSP sound bank. Everything is synthesized physically (noise
// excitation through resonators, a jittered glottal source through vocal
// formants, granular crackle) and baked into AudioBuffers at startup —
// no clean oscillators, which is what makes synth audio sound "digital".

let SR = 44100;
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const randn = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 0.866;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- primitives
const buf = (sec) => new Float32Array(Math.max(1, Math.ceil(sec * SR)));

function coefs(type, f, q) {
  const w = (2 * Math.PI * Math.min(Math.max(f, 10), SR * 0.45)) / SR;
  const cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * q);
  let b0, b1, b2;
  const a0 = 1 + a, a1 = -2 * cs, a2 = 1 - a;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = a; b1 = 0; b2 = -a; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

// biquad; f may be a number or a function of time (seconds)
function filt(x, type, f, q = 0.707) {
  const y = new Float32Array(x.length);
  const dyn = typeof f === 'function';
  let c = dyn ? coefs(type, f(0), q) : coefs(type, f, q);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (dyn && (i & 31) === 0) c = coefs(type, f(i / SR), q);
    const xi = x[i];
    const v = c[0] * xi + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

// parallel resonators: modes = [[freq, q, gain], ...]
function modes(x, list) {
  // pad so resonances can ring out past the excitation
  let tail = 0;
  for (const [f, q] of list) tail = Math.max(tail, (5 * q) / (Math.PI * f));
  const need = Math.min(x.length + Math.ceil(tail * SR), Math.ceil(4 * SR));
  if (need > x.length) {
    const p = new Float32Array(need);
    p.set(x);
    x = p;
  }
  const y = new Float32Array(x.length);
  for (const [f, q, g] of list) {
    const r = filt(x, 'bp', f, q);
    const k = g * Math.sqrt(q);
    for (let i = 0; i < y.length; i++) y[i] += r[i] * k;
  }
  return y;
}

function mix(dst, src, at = 0, g = 1) {
  const o = Math.floor(at * SR);
  for (let i = 0; i < src.length && i + o < dst.length; i++) if (i + o >= 0) dst[i + o] += src[i] * g;
  return dst;
}

function noise(sec) {
  const x = buf(sec);
  for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1;
  return x;
}

function brown(sec) {
  const x = buf(sec);
  let l = 0;
  for (let i = 0; i < x.length; i++) {
    l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    x[i] = l * 3.5;
  }
  return x;
}

// apply envelope fn(t, dur) -> gain
function env(x, fn) {
  const d = x.length / SR;
  for (let i = 0; i < x.length; i++) x[i] *= fn(i / SR, d);
  return x;
}
const ad = (a, d) => (t) => (t < a ? t / a : Math.exp(-(t - a) / d));
const swell = (a, r) => (t, D) => Math.min(1, t / a) * Math.min(1, (D - t) / r);

// short noise burst with exponential decay
function burst(sec, decay, attack = 0.0005) {
  return env(noise(sec), ad(attack, decay));
}

function impulse(sec, amp = 1) {
  const x = buf(sec);
  x[0] = amp;
  x[1] = -amp * 0.6;
  return x;
}

function drive(x, k) {
  const n = Math.tanh(k);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * k) / n;
  return x;
}

function normalize(x, peak = 0.9, fade = true) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  // de-click edges
  const f = fade ? Math.min(64, x.length >> 2) : 0;
  for (let i = 0; i < f; i++) {
    x[x.length - 1 - i] *= i / f;
  }
  return x;
}

function scale(x, g) {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

// granular crackle: n tiny resonant clicks spread over `spread` seconds
function crackle(sec, n, spread, fLo, fHi, q, shape = 1.5) {
  const x = buf(sec);
  for (let k = 0; k < n; k++) {
    const t = Math.pow(Math.random(), shape) * spread;
    const g = impulse(0.03, rnd(0.2, 1) * (1 - t / (spread * 1.3)));
    mix(x, modes(g, [[rnd(fLo, fHi), q, 1]]), t);
  }
  return x;
}

// glottal source: jittered pulse train. f0(t) in Hz.
function voice(sec, f0, { jitter = 0.03, shimmer = 0.1, sub = 0, skip = 0, tilt = 2200 } = {}) {
  const x = buf(sec);
  let t = 0, k = 0;
  while (t < sec) {
    const f = Math.max(5, f0(t / sec, t));
    let a = 1 + randn() * shimmer;
    if (sub && k % 2) a *= 1 - sub;
    if (!(skip && Math.random() < skip)) {
      const i0 = Math.floor(t * SR);
      const dec = SR * Math.min(0.0012, 0.25 / f);
      for (let j = 0; j < dec * 5 && i0 + j < x.length; j++) x[i0 + j] += a * Math.exp(-j / dec) * (j < 2 ? 1 : 0.8);
    }
    t += (1 / f) * (1 + randn() * jitter);
    k++;
  }
  return filt(x, 'lp', tilt, 0.6);
}

// vocal tract: formants as [[f or fn(t), q, gain]]
function tract(x, fm) {
  const y = new Float32Array(x.length);
  for (const [f, q, g] of fm) {
    const r = filt(x, 'bp', f, q);
    const k = g * Math.sqrt(q);
    for (let i = 0; i < y.length; i++) y[i] += r[i] * k;
  }
  return y;
}

// slow random wander (0..1) for organic modulation
function wander(rate) {
  const pts = Array.from({ length: 64 }, () => Math.random());
  return (t) => {
    const p = t * rate;
    const i = Math.floor(p) % 63;
    const f = p - Math.floor(p);
    const s = f * f * (3 - 2 * f);
    return pts[i] * (1 - s) + pts[i + 1] * s;
  };
}

// ---------------------------------------------------------------- recipes
const R = {};

function heelToe(sec, body, scuff) {
  const x = buf(sec);
  const heel = burst(0.04, 0.0025);
  mix(x, filt(modes(heel, body), 'lp', 2400), 0, 1);
  mix(x, filt(heel, 'bp', 2400, 1.2), 0, 0.25);
  const tt = rnd(0.045, 0.085);
  mix(x, filt(modes(burst(0.03, 0.0018), body), 'lp', 3000), tt, 0.5);
  if (scuff) {
    const sc = env(noise(0.09), ad(0.006, 0.03));
    mix(x, filt(filt(sc, 'bp', rnd(2200, 3200), 0.9), 'lp', 6000), tt, scuff);
    mix(x, crackle(0.12, Math.floor(rnd(4, 12)), 0.07, 2500, 6500, 4), tt, scuff * 0.5);
  }
  return x;
}

R.step_tile = () => {
  const body = [[rnd(95, 125), 3, 1], [rnd(220, 260), 5, 0.6], [rnd(480, 560), 7, 0.35], [rnd(1100, 1400), 6, 0.15]];
  return heelToe(0.35, body, 0.45);
};

R.step_carpet = () => {
  const x = buf(0.3);
  mix(x, filt(burst(0.06, 0.012, 0.004), 'lp', 380, 0.8), 0, 1);
  mix(x, filt(env(noise(0.12), ad(0.01, 0.04)), 'bp', 2600, 0.7), 0.05, 0.12);
  return x;
};

R.step_water = () => {
  const x = buf(0.75);
  mix(x, filt(burst(0.05, 0.006), 'bp', 900, 0.8), 0, 0.8);
  const body = env(noise(0.45), ad(0.012, 0.11));
  const f0 = rnd(500, 800);
  mix(x, filt(body, 'bp', (t) => f0 + 1600 * Math.exp(-t * 18) + 500 * t, 0.8), 0, 1.2);
  mix(x, filt(env(noise(0.5), ad(0.03, 0.15)), 'lp', 260), 0.01, 0.9);
  // droplets: bubble resonances rise in pitch (Minnaert)
  const n = Math.floor(rnd(14, 26));
  for (let k = 0; k < n; k++) {
    const t0 = 0.03 + Math.pow(Math.random(), 1.6) * 0.5;
    const f = rnd(900, 3800), len = rnd(0.012, 0.04), rise = rnd(1.3, 2.2);
    const d = buf(len * 3);
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * f * (1 + (rise - 1) * Math.min(1, t / len))) / SR;
      d[i] = Math.sin(ph) * Math.exp(-t / (len * 0.6));
    }
    mix(x, d, t0, rnd(0.04, 0.16));
  }
  mix(x, crackle(0.5, 20, 0.35, 3000, 8000, 3), 0.02, 0.25);
  return x;
};

R.step_glass = () => {
  const x = buf(0.4);
  mix(x, R.step_carpet(), 0, 0.5);
  mix(x, crackle(0.35, Math.floor(rnd(45, 80)), 0.16, 2800, 10500, 22, 2.2), 0.005, 1.0);
  mix(x, filt(env(noise(0.2), ad(0.004, 0.05)), 'bp', 4500, 1.2), 0.0, 0.3);
  return x;
};

R.step_metal = () => {
  const x = buf(0.9);
  const v = rnd(0.9, 1.1);
  const hit = burst(0.02, 0.0015);
  mix(x, modes(hit, [[212 * v, 40, 0.5], [347 * v, 45, 0.4], [589 * v, 55, 0.3], [873 * v, 60, 0.22], [1243 * v, 60, 0.16], [1782 * v, 70, 0.1], [2611 * v, 70, 0.06]]), 0, 0.5);
  mix(x, filt(modes(burst(0.03, 0.003), [[110, 3, 1]]), 'lp', 400), 0, 1.2);
  // grate rattle
  const rat = noise(0.18);
  const rr = rnd(30, 45);
  env(rat, (t) => Math.exp(-t / 0.05) * (Math.sin(2 * Math.PI * rr * t) > 0.3 ? 1 : 0.15));
  mix(x, filt(rat, 'bp', 1600, 1.5), 0.01, 0.35);
  mix(x, heelToe(0.3, [[180, 3, 1], [420, 5, 0.4]], 0.2), 0, 0.5);
  return x;
};

R.breath_in = (heavy = false) => {
  const d = heavy ? rnd(0.45, 0.6) : rnd(0.8, 1.05);
  const w = wander(9);
  const x = env(noise(d), (t, D) => Math.sin(Math.PI * Math.min(1, t / D)) ** 1.5 * (0.75 + 0.5 * w(t)));
  let y = tract(x, [[rnd(1000, 1300), 2.2, 0.6], [rnd(2300, 2700), 3, 0.35], [4200, 2, 0.15]]);
  y = filt(y, 'hp', 350);
  if (heavy) mix(y, tract(voice(d, () => rnd(95, 105), { jitter: 0.08, shimmer: 0.3 }), [[650, 5, 0.4], [1100, 6, 0.2]]), 0, 0.12);
  return y;
};

R.breath_out = (heavy = false) => {
  const d = heavy ? rnd(0.5, 0.7) : rnd(1.0, 1.3);
  const w = wander(7);
  const x = env(noise(d), (t, D) => Math.min(1, t / 0.08) * Math.pow(1 - t / D, 1.4) * (0.7 + 0.6 * w(t)));
  let y = tract(x, [[rnd(500, 650), 1.8, 0.7], [rnd(1150, 1400), 2.5, 0.35], [2600, 3, 0.15]]);
  y = filt(y, 'lp', 3500);
  if (heavy) mix(y, tract(voice(d, (u) => 110 - 20 * u, { jitter: 0.06, shimmer: 0.25 }), [[600, 5, 0.5], [1000, 6, 0.25]]), 0, 0.18);
  return y;
};

R.gasp = () => {
  const x = buf(1.6);
  const inh = env(noise(0.45), (t) => Math.min(1, t / 0.03) * Math.exp(-t / 0.25));
  mix(x, filt(tract(inh, [[1400, 2, 0.6], [2800, 3, 0.4]]), 'hp', 500), 0, 1);
  mix(x, tract(voice(0.4, (u) => 220 + 90 * u, { jitter: 0.05, shimmer: 0.3 }), [[750, 6, 0.5], [1250, 7, 0.3], [2700, 8, 0.15]]), 0.02, 0.35);
  // shaky exhale
  const ex = env(noise(0.9), (t, D) => Math.min(1, t / 0.05) * (1 - t / D) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 7)));
  mix(x, tract(ex, [[600, 2, 0.6], [1300, 2.5, 0.3]]), 0.6, 0.7);
  return x;
};

R.heart = () => {
  const x = buf(0.55);
  const lub = burst(0.06, 0.008, 0.002);
  mix(x, filt(modes(lub, [[42, 6, 1], [68, 5, 0.6], [110, 4, 0.2]]), 'lp', 180), 0, 1);
  mix(x, filt(modes(burst(0.05, 0.006, 0.002), [[55, 6, 1], [92, 5, 0.5]]), 'lp', 220), rnd(0.24, 0.28), 0.65);
  return x;
};

R.click = () => {
  const x = buf(0.12);
  const imp = impulse(0.1);
  mix(x, modes(imp, [[rnd(1150, 1450), 9, 1], [rnd(2600, 3100), 7, 0.45], [5200, 4, 0.12]]), 0, 1);
  mix(x, filt(burst(0.01, 0.0008), 'hp', 2000), 0, 0.3);
  return x;
};

R.stone = () => {
  const x = buf(0.45);
  const knock = (amp, at) => {
    const h = impulse(0.2, amp);
    mix(x, modes(h, [[rnd(1800, 2600), 18, 0.5], [rnd(3200, 4400), 20, 0.35], [rnd(5000, 7000), 22, 0.2], [rnd(380, 520), 6, 0.6]]), at);
    mix(x, filt(burst(0.02, 0.002), 'bp', 3000, 1), at, amp * 0.3);
  };
  knock(1, 0);
  knock(0.35, rnd(0.07, 0.12));
  knock(0.12, rnd(0.16, 0.22));
  mix(x, crackle(0.4, 6, 0.3, 3000, 6000, 10), 0.05, 0.15);
  return x;
};

R.whoosh = () => {
  const x = env(noise(0.35), (t, D) => Math.sin(Math.PI * t / D) ** 2);
  return filt(x, 'bp', (t) => 400 + 900 * Math.sin(Math.PI * t / 0.35), 1.2);
};

R.drip = () => {
  const x = buf(0.4);
  mix(x, filt(impulse(0.01), 'hp', 3000), 0, 0.15);
  const f = rnd(700, 1700), len = rnd(0.02, 0.05), rise = rnd(1.5, 2.6);
  const d = buf(len * 4);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * f * (1 + (rise - 1) * Math.min(1, t / len) ** 0.7)) / SR;
    d[i] = Math.sin(ph) * Math.min(1, t / 0.0008) * Math.exp(-t / (len * 0.55));
  }
  mix(x, d, 0.001, 0.8);
  if (Math.random() < 0.5) mix(x, d.map((v) => v * 0.3), rnd(0.05, 0.09));
  return x;
};

R.spark = () => {
  const x = buf(0.8);
  const n = Math.floor(rnd(3, 6));
  for (let k = 0; k < n; k++) {
    const t0 = rnd(0, 0.45);
    const len = rnd(0.02, 0.12);
    const c = env(noise(len), () => (Math.random() < 0.35 ? 1 : 0.05));
    mix(x, drive(filt(c, 'hp', 1800), 3), t0, rnd(0.4, 1));
  }
  // mains buzz
  const hum = buf(0.6);
  for (let i = 0; i < hum.length; i++) {
    const t = i / SR;
    hum[i] = Math.sign(Math.sin(2 * Math.PI * 100 * t)) * (0.8 + 0.2 * Math.random());
  }
  mix(x, env(filt(hum, 'bp', 400, 1.5), swell(0.05, 0.2)), 0.05, 0.12);
  return x;
};

// stick-slip creak: building settling, pipes
R.creak = () => {
  const d = rnd(1.4, 2.8);
  const w = wander(rnd(1, 2.5));
  const src = voice(d, (u, t) => 18 + 70 * w(t), { jitter: 0.12, shimmer: 0.4, skip: 0.05, tilt: 5000 });
  let y = modes(src, [[rnd(150, 220), 18, 0.6], [rnd(380, 470), 22, 0.45], [rnd(780, 900), 25, 0.3], [rnd(1400, 1700), 25, 0.2]]);
  y = env(y, swell(0.3, 0.6));
  mix(y, filt(env(brown(d), swell(0.5, 0.8)), 'lp', 120), 0, 0.6);
  return y;
};

R.knock = () => {
  // distant metallic bang in the pipes
  const x = buf(1.8);
  const n = Math.floor(rnd(1, 4));
  for (let k = 0; k < n; k++)
    mix(x, filt(modes(burst(0.02, 0.003), [[rnd(90, 140), 12, 1], [rnd(260, 330), 18, 0.5], [rnd(610, 700), 25, 0.3]]), 'lp', 900), k * rnd(0.18, 0.4), 1 / (k + 1));
  return x;
};

R.door = () => {
  const x = buf(1.9);
  const src = voice(1.2, (u) => 120 + 60 * Math.sin(u * Math.PI), { jitter: 0.01, shimmer: 0.05, tilt: 6000 });
  mix(x, env(tract(src, [[900, 4, 0.6], [1800, 5, 0.3]]), swell(0.08, 0.15)), 0, 0.4);
  mix(x, env(filt(noise(1.2), 'bp', 1500, 1), swell(0.1, 0.2)), 0, 0.12);
  mix(x, filt(modes(burst(0.04, 0.006), [[70, 6, 1], [140, 8, 0.5], [330, 12, 0.3]]), 'lp', 900), 1.2, 1.2);
  mix(x, crackle(0.3, 8, 0.15, 1500, 4000, 12), 1.21, 0.3);
  return x;
};

R.slam = () => {
  const x = buf(2.2);
  mix(x, modes(burst(0.03, 0.004), [[78, 20, 1], [131, 25, 0.7], [207, 30, 0.5], [344, 40, 0.35], [571, 45, 0.25], [902, 50, 0.15]]), 0, 1);
  mix(x, filt(burst(0.2, 0.05), 'lp', 400), 0, 1);
  mix(x, crackle(0.6, 10, 0.4, 1500, 5000, 15), 0.03, 0.3);
  return x;
};

R.crash = () => {
  const x = buf(3.2);
  mix(x, filt(env(brown(2.5), ad(0.01, 0.6)), 'lp', 200), 0, 2);
  for (let k = 0; k < 28; k++) {
    const t = Math.pow(Math.random(), 1.8) * 1.6;
    const b = rnd(0.6, 1.4);
    mix(x, modes(burst(0.02, 0.002), [[rnd(100, 300) * b, 25, 0.6], [rnd(400, 900) * b, 35, 0.4], [rnd(1200, 3000) * b, 40, 0.25]]), t, rnd(0.3, 1) * (1 - t / 2));
  }
  mix(x, crackle(2, 80, 1.5, 1500, 7000, 8, 2), 0.05, 0.6);
  return x;
};

const VOWELS = [[800, 1200, 2500], [500, 900, 2400], [350, 800, 2300], [500, 1800, 2500], [300, 2200, 3000], [650, 1100, 2600]];

R.whisper = () => {
  const x = buf(2.6);
  let t = rnd(0, 0.1);
  const n = Math.floor(rnd(6, 10));
  for (let k = 0; k < n; k++) {
    if (Math.random() < 0.35) {
      const s = filt(env(noise(0.09), swell(0.02, 0.04)), 'hp', rnd(3500, 5500));
      mix(x, s, t, 0.5);
      t += 0.08;
    }
    const v = pick(VOWELS);
    const d = rnd(0.1, 0.24);
    const s = env(noise(d), (tt, D) => Math.sin((Math.PI * tt) / D));
    mix(x, tract(s, [[v[0], 5, 0.6], [v[1], 7, 0.5], [v[2], 9, 0.3]]), t, 1);
    t += d + rnd(0.0, 0.12);
    if (t > 2.3) break;
  }
  return filt(x, 'hp', 300);
};

R.pickup = () => {
  const x = buf(0.4);
  mix(x, modes(impulse(0.3), [[rnd(1800, 2200), 25, 0.5], [rnd(3300, 3900), 30, 0.3]]), 0, 0.6);
  mix(x, filt(env(noise(0.2), ad(0.005, 0.05)), 'bp', 3000, 1), 0.03, 0.4);
  return x;
};

R.paper = () => {
  const x = env(noise(0.5), (t, D) => Math.sin(Math.PI * t / D) * (Math.random() < 0.15 ? 1 : 0.25));
  return filt(filt(x, 'bp', 3200, 0.8), 'hp', 1200);
};

R.ding = () => {
  const x = buf(4.5);
  const bell = (f, at) => {
    const h = impulse(3.5);
    mix(x, modes(h, [[f * 0.5, 300, 0.4], [f, 400, 1], [f * 1.003, 400, 0.6], [f * 2.4, 350, 0.35], [f * 3.0, 300, 0.2], [f * 4.1, 250, 0.12]]), at);
  };
  bell(880, 0);
  bell(698, 0.55);
  return x;
};

R.scratch = () => {
  const x = buf(0.8);
  const n = Math.floor(rnd(2, 4));
  for (let k = 0; k < n; k++) {
    const d = rnd(0.12, 0.3);
    const s = env(noise(d), (t, D) => Math.sin(Math.PI * t / D) * (0.5 + 0.5 * (Math.random() < 0.3 ? 1 : 0)));
    mix(x, filt(s, 'bp', rnd(2500, 4500), 2), k * rnd(0.15, 0.25), 1);
    mix(x, crackle(d + 0.05, 10, d, 3000, 7000, 12), k * 0.2, 0.4);
  }
  return x;
};

// ---------------------------------------------------------------- monster
R.m_step = () => {
  const x = buf(0.6);
  // bare heavy flesh on concrete
  const thud = burst(0.08, 0.012, 0.003);
  mix(x, filt(modes(thud, [[rnd(55, 70), 4, 1], [rnd(100, 130), 5, 0.6], [rnd(240, 300), 5, 0.25]]), 'lp', 450), 0, 1.4);
  // wet slap of skin
  mix(x, filt(env(noise(0.06), ad(0.002, 0.012)), 'bp', rnd(700, 1100), 1), 0.003, 0.5);
  // claws: hard keratin clicks on the floor
  const n = Math.floor(rnd(2, 5));
  let t = rnd(0.02, 0.05);
  for (let k = 0; k < n; k++) {
    mix(x, modes(impulse(0.05), [[rnd(2800, 4200), 25, 0.6], [rnd(5000, 7500), 30, 0.35]]), t, rnd(0.25, 0.6));
    t += rnd(0.012, 0.045);
  }
  if (Math.random() < 0.5) mix(x, filt(env(noise(0.12), (tt, D) => Math.sin(Math.PI * tt / D)), 'bp', rnd(3500, 5500), 3), t, 0.12);
  return x;
};

// the vocal-fry death rattle — its "voice"
R.m_croak = () => {
  const d = rnd(1.0, 2.6);
  const w = wander(rnd(2, 4));
  const w2 = wander(rnd(1.5, 3));
  const base = rnd(14, 26), top = rnd(35, 70);
  const src = voice(d, (u, t) => base + (top - base) * w(t), { jitter: 0.28, shimmer: 0.45, skip: 0.06, tilt: 3500 });
  let y = tract(src, [
    [(t) => 380 + 260 * w2(t), 6, 0.9],
    [(t) => 950 + 400 * w2(t), 8, 0.55],
    [(t) => 2300 + 500 * w(t), 9, 0.3],
    [3600, 7, 0.12],
  ]);
  const br = env(noise(d), () => 0.15 + 0.15 * Math.random());
  mix(y, tract(br, [[600, 3, 0.5], [1300, 4, 0.3]]), 0, 0.25);
  return env(y, swell(rnd(0.05, 0.25), 0.3));
};

// throat clicking — its own echolocation
R.m_click = () => {
  const d = rnd(0.5, 0.9);
  const src = voice(d, () => rnd(16, 24), { jitter: 0.15, shimmer: 0.3, tilt: 7000 });
  return env(tract(src, [[rnd(1400, 1900), 14, 1], [rnd(3000, 3600), 12, 0.5], [500, 6, 0.3]]), swell(0.02, 0.1));
};

R.m_breath_in = () => {
  const d = rnd(0.9, 1.4);
  const rr = rnd(22, 34);
  const x = env(noise(d), (t, D) => Math.sin((Math.PI * t) / D) ** 1.3 * (0.55 + 0.45 * (Math.sin(2 * Math.PI * rr * t + Math.random() * 0.8) > 0 ? 1 : 0.2)));
  let y = tract(x, [[rnd(1500, 1900), 3, 0.6], [rnd(2700, 3200), 4, 0.35], [rnd(700, 900), 4, 0.4]]);
  // wet gurgle in the throat
  const g = env(noise(d), (t, D) => Math.sin((Math.PI * t) / D) * (Math.random() < 0.08 ? 1 : 0.1));
  mix(y, filt(g, 'bp', rnd(180, 260), 4), 0, 0.5);
  return filt(y, 'hp', 120);
};

R.m_breath_out = () => {
  const d = rnd(1.1, 1.7);
  const y = R.m_croak().slice(0, Math.floor(d * SR));
  const x = env(noise(d), (t, D) => Math.min(1, t / 0.1) * Math.pow(1 - t / D, 1.2));
  const b = tract(x, [[rnd(450, 600), 2.5, 0.8], [rnd(1000, 1300), 3, 0.4], [2500, 4, 0.15]]);
  const out = buf(d);
  mix(out, b, 0, 1);
  mix(out, env(y, swell(0.1, 0.4)), 0, 0.35);
  return out;
};

R.m_sniff = () => {
  const x = buf(1.6);
  let t = 0;
  const n = Math.floor(rnd(3, 6));
  for (let k = 0; k < n; k++) {
    const d = rnd(0.05, 0.09);
    const s = env(noise(d), (tt, D) => Math.min(1, tt / 0.008) * Math.min(1, (D - tt) / 0.02));
    mix(x, filt(tract(s, [[rnd(1700, 2300), 2, 0.8], [3600, 3, 0.3]]), 'hp', 700), t, 1);
    t += d + rnd(0.04, 0.09);
  }
  // snort
  const sn = env(noise(0.35), (tt, D) => Math.min(1, tt / 0.01) * Math.exp(-tt / 0.12) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 38 * tt)));
  mix(x, tract(sn, [[550, 3, 0.8], [1100, 3, 0.4], [180, 4, 0.5]]), t + 0.12, 1.1);
  return x;
};

// lunge warning: rattle accelerating into a hiss
R.m_hiss = () => {
  const d = 1.15;
  const src = voice(d, (u) => 18 + 160 * u * u, { jitter: 0.2, shimmer: 0.4, tilt: 4000 });
  let y = tract(src, [[(t) => 500 + 600 * t, 6, 0.8], [(t) => 1200 + 900 * t, 7, 0.5], [2800, 8, 0.3]]);
  const h = env(noise(d), (t, D) => Math.pow(t / D, 1.6));
  mix(y, filt(h, 'bp', (t) => 1500 + 3500 * (t / d), 1.3), 0, 0.9);
  y = env(y, (t, D) => Math.min(1, 0.15 + t / D) * Math.min(1, (D - t) / 0.04));
  return drive(normalize(y, 1), 1.8);
};

function roarCore(d, f0, form, driveK) {
  const w = wander(6);
  const src = voice(d, (u, t) => f0(u) * (0.85 + 0.3 * w(t)), { jitter: 0.09, shimmer: 0.35, sub: 0.5, tilt: 3000 });
  let y = tract(src, form);
  mix(y, tract(env(noise(d), () => 0.4 + 0.3 * Math.random()), form), 0, 0.35);
  y = env(y, (t, D) => Math.min(1, t / 0.08) * Math.pow(1 - t / D, 0.7));
  return drive(normalize(y, 1), driveK);
}

R.m_roar = () => roarCore(rnd(1.3, 1.8), (u) => 85 + 50 * Math.sin(u * Math.PI), [[(t) => 650 + 150 * t, 4, 1], [1150, 5, 0.6], [2600, 6, 0.35], [3500, 5, 0.15]], 3.5);

R.scream = () => {
  const d = 1.9;
  const x = buf(d);
  const w = wander(12);
  const shriek = voice(d, (u, t) => (500 + 500 * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5)) * (0.9 + 0.2 * w(t)), { jitter: 0.06, shimmer: 0.3, tilt: 6000 });
  const shriek2 = voice(d, (u, t) => 730 + 400 * u + 60 * w(t + 3), { jitter: 0.08, shimmer: 0.3, tilt: 6000 });
  const fm = [[(t) => 950 + 200 * Math.sin(t * 9), 5, 1], [(t) => 1900 + 300 * Math.sin(t * 7), 6, 0.7], [3300, 7, 0.4]];
  mix(x, tract(shriek, fm), 0, 1);
  mix(x, tract(shriek2, fm), 0, 0.6);
  mix(x, roarCore(d, () => 110, [[700, 4, 1], [1200, 5, 0.6], [2600, 6, 0.3]], 2), 0, 0.7);
  mix(x, filt(noise(d), 'hp', 2500), 0, 0.15);
  env(x, (t, D) => Math.min(1, t / 0.015) * Math.pow(1 - t / D, 0.5));
  return drive(normalize(x, 1), 3);
};

// ---------------------------------------------------------------- loops
function loopify(x, fade) {
  const n = Math.floor(fade * SR);
  const out = x.slice(0, x.length - n);
  for (let i = 0; i < n; i++) {
    const a = i / n;
    out[i] = out[i] * a + x[x.length - n + i] * (1 - a);
  }
  return out;
}

R.room = () => {
  const d = 10;
  const x = buf(d + 1);
  mix(x, filt(brown(d + 1), 'lp', 160), 0, 1.0);
  // ventilation airflow
  const w = wander(0.4);
  mix(x, env(filt(noise(d + 1), 'bp', 220, 0.9), (t) => 0.5 + 0.5 * w(t)), 0, 0.25);
  mix(x, filt(noise(d + 1), 'bp', 900, 1.2), 0, 0.03);
  // mains hum with harmonics (very low)
  const h = buf(d + 1);
  for (let i = 0; i < h.length; i++) {
    const t = i / SR;
    h[i] = Math.sin(2 * Math.PI * 50 * t) * 0.5 + Math.sin(2 * Math.PI * 100 * t) * 0.3 + Math.sin(2 * Math.PI * 150 * t) * 0.12;
  }
  mix(x, h, 0, 0.04);
  return loopify(x, 1);
};

R.generator = () => {
  // diesel: firing pulses at ~25 Hz through engine block resonances
  const period = 1 / 25;
  const d = period * 50;
  const x = buf(d);
  for (let k = 0; k < 50; k++) {
    const a = 1 + randn() * 0.08;
    mix(x, burst(0.03, 0.004), k * period, a);
    if (k % 2) mix(x, burst(0.02, 0.003), k * period + period * 0.5, 0.4 * a);
  }
  let y = modes(x, [[55, 4, 1], [110, 5, 0.6], [180, 6, 0.4], [420, 8, 0.25], [900, 6, 0.15]]);
  y = filt(y, 'lp', 1200);
  const mech = filt(noise(d), 'bp', 2400, 2);
  mix(y, mech, 0, 0.05);
  return y;
};

R.motor = () => {
  const d = 2;
  const x = buf(d);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = Math.sin(2 * Math.PI * 100 * t) * 0.4 + Math.sin(2 * Math.PI * 300 * t) * 0.1 + Math.sin(2 * Math.PI * 1240 * t) * 0.02;
  }
  mix(x, filt(noise(d), 'bp', 600, 2), 0, 0.15);
  mix(x, crackle(d, 30, d, 800, 2500, 6, 1), 0, 0.2);
  return x;
};

// ---------------------------------------------------------------- reverb IR
function makeIR(ctx, sec) {
  const n = Math.floor(sec * SR);
  const ir = ctx.createBuffer(2, n, SR);
  for (let c = 0; c < 2; c++) {
    const lo = filt(noise(sec), 'lp', 500);
    const mid = filt(noise(sec), 'bp', 1500, 0.6);
    const hi = filt(noise(sec), 'hp', 3500);
    const d = ir.getChannelData(c);
    const pre = 0.012;
    for (let i = 0; i < n; i++) {
      const t = i / SR - pre;
      if (t < 0) continue;
      const fade = Math.min(1, t / 0.04);
      d[i] = fade * (lo[i] * Math.exp((-6.9 * t) / 3.0) * 1.2 + mid[i] * Math.exp((-6.9 * t) / 2.0) + hi[i] * Math.exp((-6.9 * t) / 0.8) * 0.6) * 0.5;
    }
    // early reflections off concrete
    for (let k = 0; k < 14; k++) {
      const t = rnd(0.008, 0.08);
      const i = Math.floor(t * SR);
      d[i] += (Math.random() < 0.5 ? -1 : 1) * rnd(0.2, 0.7) * (1 - t * 8);
    }
  }
  return ir;
}

// ---------------------------------------------------------------- bake
const PLAN = {
  step_tile: 6, step_carpet: 4, step_water: 6, step_glass: 5, step_metal: 5,
  breath_in: 3, breath_out: 3, breath_in_h: 3, breath_out_h: 3, gasp: 2, heart: 2, click: 4,
  stone: 4, whoosh: 2, drip: 8, spark: 4, creak: 5, knock: 3, door: 1, slam: 2, crash: 1, whisper: 5,
  pickup: 2, paper: 3, ding: 1, scratch: 4,
  m_step: 8, m_croak: 7, m_click: 3, m_breath_in: 4, m_breath_out: 4, m_sniff: 4, m_hiss: 3, m_roar: 3, scream: 2,
  room: 1, generator: 1, motor: 1,
};

export function bakeBank(ctx, only = null) {
  SR = ctx.sampleRate;
  const bank = {};
  for (const name in PLAN) {
    if (only && !only.includes(name)) continue;
    bank[name] = [];
    for (let v = 0; v < PLAN[name]; v++) {
      let data;
      if (name === 'breath_in_h') data = R.breath_in(true);
      else if (name === 'breath_out_h') data = R.breath_out(true);
      else data = R[name]();
      const loop = name === 'room' || name === 'generator' || name === 'motor';
      if (!loop) normalize(data);
      else normalize(data, 0.8, false);
      const b = ctx.createBuffer(1, data.length, SR);
      b.copyToChannel(data, 0);
      bank[name].push(b);
    }
  }
  bank.ir = makeIR(ctx, 3.4);
  return bank;
}
