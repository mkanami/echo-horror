// Organic geometry: tapered tubes along curves, sculpted (displaced) solids,
// value noise for skin. Used for the creature, corpses and soft props.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- noise
function hash(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(
    L(L(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), L(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    L(L(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), L(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
    w,
  ) * 2 - 1;
}
export function fbm(x, y, z, oct = 3) {
  let a = 0, f = 1, g = 0.5;
  for (let i = 0; i < oct; i++) {
    a += vnoise(x * f, y * f, z * f) * g;
    f *= 2.03;
    g *= 0.5;
  }
  return a;
}

// strip to position/normal so everything merges cleanly
export function clean(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g;
}

// ---------------------------------------------------------------- tube
// points: Vector3[]; radius: number | fn(u) | [r0, r1, ...] (piecewise)
// opts: radial, tubular, noise (amp), noiseScale, flat (x/y scale of cross-section), caps
export function taper(points, radius, { radial = 14, tubular = 24, noise = 0, noiseScale = 9, flat = 1, seed = 0, caps = true } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const frames = curve.computeFrenetFrames(tubular, false);
  const rfn = typeof radius === 'function'
    ? radius
    : Array.isArray(radius)
      ? (u) => {
          const p = u * (radius.length - 1);
          const i = Math.min(radius.length - 2, Math.floor(p));
          const f = p - i;
          const s = f * f * (3 - 2 * f);
          return radius[i] * (1 - s) + radius[i + 1] * s;
        }
      : () => radius;
  const pos = [];
  const idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), V = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    curve.getPointAt(u, P);
    N.copy(frames.normals[i]);
    B.copy(frames.binormals[i]);
    const r = rfn(u);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a) * flat;
      V.copy(P).addScaledVector(N, c * r).addScaledVector(B, s * r);
      if (noise) {
        const n = fbm(V.x * noiseScale + seed, V.y * noiseScale, V.z * noiseScale, 2);
        V.addScaledVector(N, c * n * noise).addScaledVector(B, s * n * noise);
      }
      pos.push(V.x, V.y, V.z);
    }
  }
  for (let i = 0; i < tubular; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j, d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  if (caps) {
    const p0 = curve.getPointAt(0), p1 = curve.getPointAt(1);
    const s0 = pos.length / 3;
    pos.push(p0.x, p0.y, p0.z);
    const s1 = pos.length / 3;
    pos.push(p1.x, p1.y, p1.z);
    const last = tubular * radial;
    for (let j = 0; j < radial; j++) {
      idx.push(s0, j, (j + 1) % radial);
      idx.push(s1, last + ((j + 1) % radial), last + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- sculpt
// fn(v: Vector3 (mutable), n: unit direction from centre) displaces vertex
export function sculpt(geo, fn) {
  let g = clean(geo.index ? geo : geo);
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    n.copy(v).normalize();
    fn(v, n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function blob(r, wS = 28, hS = 20) {
  return new THREE.SphereGeometry(r, wS, hS);
}

// ---------------------------------------------------------------- human body
// A gaunt human figure, returned as a list of {geo} in world-local coords
// lying along +z (head at -z), resting on y=0. Used for corpses.
export function corpseParts({ seed = Math.random() * 100, sheet = false } = {}) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const parts = [];
  if (sheet) {
    // body under a sheet: sculpted capsule with draped wrinkles
    const g = sculpt(new THREE.CapsuleGeometry(0.22, 1.35, 10, 24), (v) => {
      v.z *= 1;
      const along = v.y;
      // head bump, chest, legs split
      let w = 1;
      if (along > 0.55) w = 0.75;
      else if (along > 0.35) w = 0.6;
      else if (along > -0.1) w = 1.05;
      v.x *= w * 1.15;
      v.z *= 0.55;
      if (along < -0.1) v.x += Math.sign(v.x) * 0.02;
      v.x += fbm(v.x * 6 + seed, v.y * 6, v.z * 6) * 0.025;
      v.z += fbm(v.x * 8, v.y * 8 + seed, v.z * 8) * 0.02 + Math.sin(v.y * 22 + seed) * 0.006;
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.13, 0);
    parts.push(g);
    return parts;
  }
  const skin = (amp) => (v) => {
    v.x += fbm(v.x * 10 + seed, v.y * 10, v.z * 10) * amp;
  };
  // torso
  const torso = sculpt(new THREE.CapsuleGeometry(0.15, 0.42, 8, 20), (v) => {
    v.x *= 1.25;
    v.z *= 0.7;
    if (v.y > 0.05) v.x *= 1 + (v.y - 0.05) * 0.4;
    skin(0.01)(v);
  });
  torso.rotateX(-Math.PI / 2);
  torso.translate(0, 0.12, -0.25);
  parts.push(torso);
  const head = sculpt(blob(0.1, 20, 14), (v) => {
    v.z *= 1.15;
    if (v.y < -0.02) v.x *= 0.85;
    skin(0.006)(v);
  });
  head.translate(0, 0.11, -0.72);
  parts.push(head);
  parts.push(taper([V(0, 0.11, -0.55), V(0, 0.11, -0.62)], 0.045, { radial: 10, tubular: 3 }));
  const limb = (a, b, c, r0, r1) => parts.push(taper([a, b, c], [r0, (r0 + r1) / 2 * 1.05, r1], { radial: 10, tubular: 12, noise: 0.006, seed }));
  // arms (one bent across the chest)
  limb(V(-0.21, 0.12, -0.42), V(-0.27, 0.07, -0.18), V(-0.24, 0.06, 0.06), 0.045, 0.028);
  limb(V(0.21, 0.12, -0.42), V(0.3, 0.08, -0.2), V(0.1, 0.18, -0.25), 0.045, 0.028);
  // legs
  limb(V(-0.09, 0.1, 0.0), V(-0.11, 0.1, 0.42), V(-0.12, 0.07, 0.86), 0.07, 0.035);
  limb(V(0.09, 0.1, 0.0), V(0.14, 0.13, 0.4), V(0.18, 0.07, 0.84), 0.07, 0.035);
  // feet
  for (const x of [-0.12, 0.18]) {
    const f = sculpt(blob(0.045, 12, 8), (v) => {
      v.z *= 2.2;
      v.y *= 0.9;
    });
    f.rotateX(-1.2);
    f.translate(x, 0.08, 0.92);
    parts.push(f);
  }
  return parts;
}
