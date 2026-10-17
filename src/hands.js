// Anatomical hand as one smooth surface (SDF + marching cubes): palm with
// thenar/hypothenar pads, knuckles, three phalanges per finger, thumb, nails.
// Right hand: wrist at origin, forearm toward +z, fingers toward -z,
// back of the hand +y, thumb on -x. Two poses: 'grip' (around a cane) and 'open'.
import * as THREE from 'three';
import { roundCone, ellipsoid, smin, march } from './body.js';
import { fbm } from './organic.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function roundBox(c, h, r) {
  const box = new THREE.Box3(c.clone().sub(h).subScalar(r), c.clone().add(h).addScalar(r));
  return {
    box,
    d(x, y, z) {
      const qx = Math.abs(x - c.x) - h.x, qy = Math.abs(y - c.y) - h.y, qz = Math.abs(z - c.z) - h.z;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
    },
  };
}

// direction for a digit: yaw (toward -x positive) and accumulated pitch (toward the palm)
const dirOf = (yaw, pitch) => V(-Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw));
const upOf = (yaw, pitch) => V(-Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), -Math.sin(pitch) * Math.cos(yaw));

const FINGERS = [
  // base x, base z, phalanx lengths, base radius
  { x: -0.027, z: -0.091, L: [0.043, 0.026, 0.021], r: 0.0098 },
  { x: -0.009, z: -0.095, L: [0.048, 0.03, 0.023], r: 0.0102 },
  { x: 0.009, z: -0.093, L: [0.045, 0.028, 0.022], r: 0.0096 },
  { x: 0.026, z: -0.087, L: [0.036, 0.021, 0.019], r: 0.0086 },
];

const POSES = {
  open: {
    yaw: [0.13, 0.03, -0.05, -0.15],
    curl: [[0.14, 0.16, 0.1], [0.12, 0.14, 0.1], [0.16, 0.18, 0.12], [0.22, 0.22, 0.14]],
    thumb: { yaw: 0.85, pitch: 0.3, curl: [0.12, 0.18] },
  },
  grip: {
    yaw: [0.05, 0.01, -0.02, -0.05],
    curl: [[1.32, 1.45, 0.85], [1.38, 1.5, 0.85], [1.42, 1.5, 0.85], [1.45, 1.45, 0.85]],
    thumb: { yaw: 0.35, pitch: 0.95, curl: [0.25, 0.35] },
  },
};

function buildPrims(pose) {
  const P = POSES[pose];
  const add = [];
  const U = (p, k) => add.push([p, k]);
  // forearm & wrist
  U(roundCone(V(0, 0.001, 0.0), V(0, 0.004, 0.13), 0.026, 0.032), 0.02);
  U(ellipsoid(V(0, 0, -0.005), V(0.031, 0.019, 0.026)), 0.02);
  // palm block, pads
  U(roundBox(V(0, 0, -0.052), V(0.033, 0.006, 0.036), 0.011), 0.014);
  U(ellipsoid(V(-0.024, -0.012, -0.036), V(0.021, 0.014, 0.03)), 0.012); // thenar
  U(ellipsoid(V(0.027, -0.01, -0.045), V(0.014, 0.011, 0.032)), 0.01); // hypothenar
  // fingers
  FINGERS.forEach((f, i) => {
    let p = V(f.x, 0.002, f.z);
    let pitch = 0;
    const yaw = P.yaw[i];
    U(ellipsoid(V(f.x, 0.009, f.z + 0.004), V(0.011, 0.008, 0.011)), 0.008); // knuckle
    for (let k = 0; k < 3; k++) {
      pitch += P.curl[i][k];
      const d = dirOf(yaw, pitch);
      const q = p.clone().addScaledVector(d, f.L[k]);
      const r0 = f.r * (1 - k * 0.12), r1 = f.r * (1 - (k + 1) * 0.12);
      U(roundCone(p, q, r0, r1), 0.005);
      if (k === 2) {
        // nail plate on the back of the tip
        const up = upOf(yaw, pitch);
        U(ellipsoid(q.clone().addScaledVector(d, -0.008).addScaledVector(up, r1 * 0.75), V(0.0062, 0.0024, 0.0085)), 0.002);
      }
      p = q;
    }
  });
  // thumb: metacarpal + two phalanges
  {
    const T = P.thumb;
    let p = V(-0.03, -0.006, -0.022);
    let pitch = T.pitch;
    const Ls = [0.038, 0.031, 0.025], rs = [0.0135, 0.0115, 0.0098, 0.0082];
    for (let k = 0; k < 3; k++) {
      if (k > 0) pitch += T.curl[k - 1];
      const d = dirOf(T.yaw, pitch);
      const q = p.clone().addScaledVector(d, Ls[k]);
      U(roundCone(p, q, rs[k], rs[k + 1]), 0.007);
      if (k === 2) U(ellipsoid(q.clone().addScaledVector(d, -0.008).addScaledVector(upOf(T.yaw, pitch), rs[3] * 0.75), V(0.0068, 0.0025, 0.009)), 0.002);
      p = q;
    }
  }
  return add;
}

const cache = {};
export function handGeometry(pose = 'open') {
  if (cache[pose]) return cache[pose];
  const prims = buildPrims(pose);
  const field = (x, y, z) => {
    let d = 1e9;
    for (const [p, k] of prims) {
      const b = p.box;
      const ox = x < b.min.x ? b.min.x - x : x > b.max.x ? x - b.max.x : 0;
      const oy = y < b.min.y ? b.min.y - y : y > b.max.y ? y - b.max.y : 0;
      const oz = z < b.min.z ? b.min.z - z : z > b.max.z ? z - b.max.z : 0;
      if (Math.sqrt(ox * ox + oy * oy + oz * oz) > d + k) continue;
      d = smin(d, p.d(x, y, z), k);
    }
    return d;
  };
  const g = march(field, V(-0.11, -0.1, -0.21), V(0.085, 0.045, 0.135), 0.0021);
  // skin creases and pores, very fine
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const d = fbm(x * 260, y * 260, z * 260, 2) * 0.0004;
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
  }
  g.computeVertexNormals();
  cache[pose] = g;
  return g;
}

// where the cane passes through the fist of the 'grip' pose
export const GRIP_POINT = V(0.0, -0.034, -0.098);
