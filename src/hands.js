// Anatomical hand as one smooth surface (SDF + marching cubes): forearm with
// flattened cross-section, wrist bones, metacarpals fanning out under a domed
// back, tendons, knuckles, three phalanges per finger with pads and nails,
// a thumb on its own metacarpal with the web of skin to the index finger.
// Right hand: wrist at origin, forearm toward +z, fingers toward -z,
// back of the hand +y, thumb on -x. Poses: 'grip' (round a cane), 'open',
// 'relaxed' (half-curled, hanging), 'cover' (cupped, over the mouth).
import * as THREE from 'three';
import { roundCone, ellipsoid, smin, march } from './body.js';
import { fbm } from './organic.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// direction for a digit: yaw (toward -x positive) and accumulated pitch (toward the palm)
const dirOf = (yaw, pitch) => V(-Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw));
const upOf = (yaw, pitch) => V(-Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), -Math.sin(pitch) * Math.cos(yaw));

// knuckle (MCP head) positions, phalanx lengths, base radius
export const FINGERS = [
  { k: V(-0.0285, 0.0, -0.086), L: [0.047, 0.028, 0.022], r: 0.0099 }, // index
  { k: V(-0.0095, 0.001, -0.09), L: [0.052, 0.032, 0.023], r: 0.0102 }, // middle
  { k: V(0.0095, 0.0, -0.087), L: [0.049, 0.03, 0.023], r: 0.0095 }, // ring
  { k: V(0.0265, -0.002, -0.08), L: [0.039, 0.023, 0.02], r: 0.0084 }, // little
];
// wrist ends of the metacarpals
const CARPAL = [V(-0.017, 0.002, -0.014), V(-0.005, 0.003, -0.012), V(0.007, 0.002, -0.013), V(0.017, 0.0, -0.016)];

export const POSES = {
  open: {
    yaw: [0.1, 0.02, -0.06, -0.15],
    curl: [[0.1, 0.14, 0.08], [0.08, 0.14, 0.08], [0.12, 0.16, 0.1], [0.16, 0.2, 0.12]],
    thumb: [V(-0.75, -0.25, -0.6), V(-0.55, -0.15, -0.82), V(-0.45, -0.1, -0.88)],
  },
  relaxed: {
    yaw: [0.06, 0.01, -0.04, -0.1],
    curl: [[0.35, 0.55, 0.3], [0.42, 0.62, 0.32], [0.5, 0.68, 0.34], [0.58, 0.72, 0.36]],
    thumb: [V(-0.55, -0.45, -0.7), V(-0.3, -0.48, -0.82), V(-0.12, -0.55, -0.83)],
  },
  cover: {
    // fingers together and gently cupped, as if pressed over a mouth
    yaw: [0.03, 0.0, -0.03, -0.07],
    curl: [[0.22, 0.3, 0.16], [0.2, 0.3, 0.16], [0.24, 0.32, 0.18], [0.3, 0.34, 0.2]],
    thumb: [V(-0.62, -0.32, -0.72), V(-0.38, -0.28, -0.88), V(-0.22, -0.28, -0.93)],
  },
  grip: {
    // the cane lies diagonally across the palm; the index finger rides along it,
    // the others close tighter the nearer they are to the heel of the hand
    yaw: [0.12, 0.04, -0.02, -0.06],
    curl: null, // solved round the cane below
    // the thumb lies along the side of the shaft, pressing it into the fingers
    thumb: [V(-0.45, -0.35, -0.82), V(-0.35, -0.2, -0.91), V(-0.3, -0.12, -0.95)],
  },
};

POSES.flat = {
  yaw: [0.045, 0, -0.025, -0.065],
  curl: [[0.005, 0.01, 0.005], [0, 0.008, 0.004], [0.008, 0.012, 0.005], [0.015, 0.02, 0.01]],
  thumb: [V(-0.8, 0, -0.6), V(-0.65, 0, -0.76), V(-0.55, 0, -0.84)],
};
POSES.edge = {
  yaw: POSES.flat.yaw,
  curl: [[0.65, 0.85, 0.35], [0.7, 0.95, 0.42], [0.75, 1, 0.45], [0.8, 1.1, 0.5]],
  thumb: POSES.flat.thumb,
};
POSES.fuseGrip = {
  yaw: [0.04, 0.01, -0.03, -0.06],
  curl: [[0.65, 1.1, 0.6], [0.75, 1.15, 0.65], [0.85, 1.15, 0.65], [0.95, 1.1, 0.6]],
  thumb: [V(-0.5,-0.4,-0.7),V(0.25,-0.6,-0.75),V(0.65,-0.45,-0.6)],
};
POSES.handle = { ...POSES.fuseGrip, curl: [[0.9,1.35,.6],[1,1.4,.65],[1.1,1.4,.65],[1.2,1.3,.6]] };
POSES.point = { ...POSES.relaxed, curl: [[.02,.04,.04],[.95,1.35,.65],[1.05,1.4,.7],[1.1,1.35,.65]] };

// The cane lies diagonally across the palm, out between thumb and index finger
// toward the top of the handle. Each finger's joints wrap the shaft.
export const CANE_AXIS = V(-0.77, -0.08, -0.63).normalize();
const CANE_C = V(0, -0.031, -0.068);
export const CANE_R = 0.0112;
function solveGrip() {
  const A = CANE_AXIS;
  return FINGERS.map((f, i) => {
    // where the shaft crosses this finger's plane, relative to the knuckle
    const t = (f.k.x - CANE_C.x) / A.x;
    const cy = CANE_C.y + A.y * t - (f.k.y - 0.001), cz = CANE_C.z + A.z * t - (f.k.z - 0.003);
    let best = null;
    for (let a = 0.2; a <= 1.7; a += 0.04)
      for (let b = 0.2; b <= 1.8; b += 0.04)
        for (let c = 0.2; c <= 1.1; c += 0.06) {
          let y = 0, z = 0, p = 0, cost = (a + b + c) * 0.00002;
          const ang = [a, b, c];
          for (let k = 0; k < 3; k++) {
            p += ang[k];
            const dy = -Math.sin(p) * f.L[k], dz = -Math.cos(p) * f.L[k];
            // distance from the shaft centre to this phalanx
            const l2 = dy * dy + dz * dz;
            let h = ((cy - y) * dy + (cz - z) * dz) / l2;
            h = h < 0 ? 0 : h > 1 ? 1 : h;
            const d = Math.hypot(cy - y - dy * h, cz - z - dz * h);
            const want = CANE_R + f.r * (1 - (k + 0.5) * 0.1);
            if (d < want) cost += (want - d) * (want - d) * 400;
            else cost += (d - want) * (d - want) * [0.15, 1, 1][k];
            y += dy;
            z += dz;
          }
          if (!best || cost < best.cost) best = { cost, curl: [a, b, c] };
        }
    return best.curl;
  });
}

function buildPrims(pose) {
  const P = typeof pose === 'string' ? POSES[pose] : pose;
  if (!P.curl) P.curl = solveGrip();
  const add = [];
  const U = (p, k) => add.push([p, k]);

  // forearm: flattened, widening toward the elbow, ulna head on the little-finger side
  const forearm = roundCone(V(0, 0.001, 0.012), V(-0.002, 0.004, 0.088), 0.025, 0.033);
  const forearmField = forearm.d;
  forearm.d = (x, y, z) => forearmField(x, y / 0.68, z) * 0.68;
  U(forearm, 0.008);
  U(ellipsoid(V(0.022, 0.008, 0.012), V(0.008, 0.007, 0.009)), 0.008); // ulnar styloid
  U(ellipsoid(V(-0.022, 0.002, 0.01), V(0.008, 0.008, 0.012)), 0.01); // radial styloid
  // carpus: the wrist is narrower than the hand and a little humped on the back
  U(ellipsoid(V(0, 0.002, -0.012), V(0.025, 0.0135, 0.019)), 0.008);

  // metacarpals fanning from the carpus to the knuckles, blended into one back
  FINGERS.forEach((f, i) => {
    const kk = f.k.clone().add(V(0, 0.001, 0.006));
    U(roundCone(CARPAL[i], kk, 0.008, f.r * 0.88), 0.008);
    // extensor tendon standing out on the back of the hand
    U(roundCone(CARPAL[i].clone().add(V(0, 0.011, 0.004)), kk.clone().add(V(0, 0.0085, 0.003)), 0.0014, 0.002), 0.0035);
    // knuckle
    U(ellipsoid(f.k.clone().add(V(0, 0.0035, 0.002)), V(f.r * 1.08, f.r * 0.85, f.r * 0.88)), 0.004);
  });
  // palm body: domed back, flatter palm, pad under the knuckles
  U(ellipsoid(V(-0.001, -0.001, -0.05), V(0.0315, 0.011, 0.036)), 0.006);
  U(ellipsoid(V(-0.001, 0.004, -0.05), V(0.032, 0.009, 0.035)), 0.004);
  // Separate pads preserve the hollow of the palm and the scalloped finger web.
  FINGERS.forEach(f => U(ellipsoid(f.k.clone().add(V(0, -0.0075, 0.006)), V(f.r * 0.95, 0.0075, 0.013)), 0.004));
  U(ellipsoid(V(0.024, -0.007, -0.042), V(0.0105, 0.01, 0.029)), 0.006); // hypothenar
  U(ellipsoid(V(-0.02, -0.01, -0.032), V(0.014, 0.012, 0.025)), 0.006); // thenar

  // fingers
  FINGERS.forEach((f, i) => {
    let p = f.k.clone().add(V(0, -0.001, -0.003));
    let pitch = 0;
    const yaw = P.yaw[i];
    for (let k = 0; k < 3; k++) {
      pitch += P.curl[i][k];
      const d = dirOf(yaw, pitch), up = upOf(yaw, pitch);
      const q = p.clone().addScaledVector(d, f.L[k]);
      const r0 = f.r * (1 - k * 0.1), r1 = f.r * (1 - (k + 1) * 0.1);
      U(roundCone(p, q, r0, r1 * (k === 2 ? 0.88 : 1)), 0.002);
      // joint swelling (wider than deep)
      if (k > 0) U(ellipsoid(p.clone().addScaledVector(up, r0 * 0.08), V(r0 * 1.07, r0 * 0.96, r0 * 0.8)), 0.0025);
      // fleshy pad on the palm side
      U(ellipsoid(p.clone().addScaledVector(d, f.L[k] * 0.54).addScaledVector(up, -r0 * 0.25), V(r0 * 0.85, r0 * 0.8, f.L[k] * 0.38)), 0.002);
      if (k === 2) {
        // nail plate on the back of the tip
        U(ellipsoid(q.clone().addScaledVector(d, -0.0075).addScaledVector(up, r1 * 0.62), V(r1 * 0.72, 0.0019, 0.0072)), 0.0015);
      }
      p = q;
    }
  });

  // thumb: metacarpal from the wrist + two phalanges, with the web to the index
  {
    const T = P.thumb;
    let p = V(-0.02, -0.006, -0.016);
    const Ls = [0.042, 0.033, 0.027], rs = [0.0128, 0.0112, 0.0098, 0.0084];
    const joints = [];
    for (let k = 0; k < 3; k++) {
      const d = T[k].clone().normalize();
      // nail side: away from the palm, roughly the back of the hand turned toward -x
      const up = V(-0.55, 0.75, 0.1).addScaledVector(d, -V(-0.55, 0.75, 0.1).dot(d)).normalize();
      const q = p.clone().addScaledVector(d, Ls[k]);
      U(roundCone(p, q, rs[k], rs[k + 1] * (k === 2 ? 0.9 : 1)), k === 0 ? 0.007 : 0.0025);
      if (k > 0) U(ellipsoid(p, V(rs[k] * 1.03, rs[k] * 0.97, rs[k] * 0.9)), 0.004);
      if (k === 2) U(ellipsoid(q.clone().addScaledVector(d, -0.008).addScaledVector(up, rs[3] * 0.6), V(rs[3] * 0.75, 0.002, 0.0078)), 0.0015);
      joints.push(q.clone());
      p = q;
    }
    // first dorsal interosseous / web of the thumb
    U(roundCone(joints[0].clone().add(V(0.004, 0.002, 0)), FINGERS[0].k.clone().add(V(0.002, -0.002, 0.012)), 0.005, 0.005), 0.006);
  }
  return add;
}

function bevelField(prims) {
  return (x, y, z) => {
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
}

const cache = {};
export function handGeometry(pose = 'open') {
  if (cache[pose]) return cache[pose];
  const field = bevelField(buildPrims(pose));
  const g = march(field, V(-0.115, -0.11, -0.215), V(0.07, 0.045, 0.125), 0.0014);
  const P = POSES[pose];
  const joints = [];
  FINGERS.forEach((f, i) => {
    let p = f.k.clone().add(V(0, -0.001, -0.003)), pitch = 0;
    for (let j = 0; j < 3; j++) {
      pitch += P.curl[i][j];
      const d = dirOf(P.yaw[i], pitch), up = upOf(P.yaw[i], pitch);
      joints.push({ p: p.clone(), d, up, side: new THREE.Vector3().crossVectors(d, up), r: f.r * (1 - j * 0.1), mcp: j === 0 });
      p.addScaledVector(d, f.L[j]);
    }
  });
  const gauss = (x, width) => Math.exp(-((x / width) ** 2));
  const { smoothstep: ss } = THREE.MathUtils;
  // Details are sculpted/coloured in the bind pose, then move with the skin.
  // Wrinkles follow joints and palm folds rather than arbitrary noise stripes.
  const pos = g.attributes.position, nor = g.attributes.normal;
  const colors = new Float32Array(pos.count * 3), p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let crease = 0, blush = 0;
    for (const joint of joints) {
      p.set(x, y, z).sub(joint.p);
      const along = p.dot(joint.d), across = p.dot(joint.side), back = p.dot(joint.up);
      if (Math.abs(along) > 0.016 || Math.abs(across) > joint.r * 1.1) continue;
      const mask = 1 - ss(Math.abs(across), joint.r * 0.6, joint.r * 1.1);
      const curved = along + across * across / joint.r * 0.16;
      const dorsal = ss(back, 0.001, 0.006);
      const palmar = 1 - ss(back, -0.006, -0.001);
      // Three shallow dorsal folds, one deeper flexion crease on the palm side.
      crease += mask * (dorsal * (gauss(curved + 0.001, 0.0008) * 0.55 + gauss(curved - 0.002, 0.00065) * 0.35 + gauss(curved + 0.0035, 0.0006) * 0.25)
        + palmar * gauss(curved - (joint.mcp ? 0.005 : 0), 0.0009) * 0.9);
      blush = Math.max(blush, mask * gauss(along, joint.mcp ? 0.01 : 0.006) * (0.4 + dorsal * 0.6));
    }
    const palm = (1 - ss(y, -0.008, 0.002)) * (1 - ss(Math.abs(x), 0.029, 0.037));
    if (z > -0.084 && z < 0.025) {
      const life = x + 0.01 + 0.017 * ((z + 0.041) / 0.038) ** 2;
      const lifeMask = ss(z, -0.082, -0.067) * (1 - ss(z, -0.016, -0.004));
      const heart = z + 0.073 - x * 0.19 - Math.sin(x * 50) * 0.003;
      const head = z + 0.052 + x * 0.37;
      crease += palm * (gauss(life, 0.00085) * lifeMask * 0.85 + gauss(heart, 0.0008) * 0.8
        + gauss(head, 0.00075) * ss(x, -0.02, -0.006) * 0.65);
      crease += palm * (gauss(z - x * 0.06 - 0.002, 0.0009) * 0.8 + gauss(z + x * 0.03 - 0.011, 0.0008) * 0.45);
    }
    const dorsalPalm = ss(y, 0.005, 0.013) * ss(z, -0.085, -0.06) * (1 - ss(z, 0.015, 0.045));
    const vein = dorsalPalm * (gauss(x + 0.013 + Math.sin(z * 55) * 0.004, 0.0008) + gauss(x - 0.01 - Math.sin(z * 42) * 0.005, 0.00065));
    const micro = fbm(x * 550, y * 550, z * 550, 2);
    const d = (micro - 0.5) * 0.00012 - crease * 0.00065 + vein * 0.00015;
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
    const tone = fbm(x * 80, y * 80, z * 80, 2) - 0.5;
    colors.set([
      0.96 + tone * 0.08 + blush * 0.025 + palm * 0.025 - crease * 0.16 - vein * 0.08,
      0.91 + tone * 0.07 - blush * 0.07 + palm * 0.035 - crease * 0.18 - vein * 0.035,
      0.87 + tone * 0.06 - blush * 0.05 + palm * 0.025 - crease * 0.17 - vein * 0.015,
    ], i * 3);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  cache[pose] = g;
  return g;
}

export function gripInfo() {
  return { p: CANE_C.clone(), axis: CANE_AXIS.clone(), r: CANE_R, curl: POSES.grip.curl || solveGrip() };
}

export const handField = (pose) => bevelField(buildPrims(pose));
