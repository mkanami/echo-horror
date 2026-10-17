// Human body as a signed distance field (smooth-unioned round cones and
// ellipsoids), meshed with marching cubes into one continuous surface.
// Lying on its back along +z (head at -z), back resting on y = 0.
import * as THREE from 'three';
import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm } from './organic.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- primitives
export function roundCone(a, b, r1, r2) {
  const ba = b.clone().sub(a);
  const l2 = ba.lengthSq();
  const box = new THREE.Box3().setFromPoints([a, b]).expandByScalar(Math.max(r1, r2));
  return {
    box,
    d(x, y, z) {
      const px = x - a.x, py = y - a.y, pz = z - a.z;
      let h = (px * ba.x + py * ba.y + pz * ba.z) / l2;
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      const dx = px - ba.x * h, dy = py - ba.y * h, dz = pz - ba.z * h;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r1 + (r2 - r1) * h);
    },
  };
}
export function ellipsoid(c, r) {
  const box = new THREE.Box3(c.clone().sub(r), c.clone().add(r));
  return {
    box,
    d(x, y, z) {
      const px = (x - c.x) / r.x, py = (y - c.y) / r.y, pz = (z - c.z) / r.z;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      const qx = px / r.x, qy = py / r.y, qz = pz / r.z;
      const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1e-6;
      return (k0 * (k0 - 1)) / k1;
    },
  };
}
export const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);

// ---------------------------------------------------------------- skeleton
function buildPrims(pose) {
  const add = [];
  const sub = [];
  const U = (p, k = 0.04) => add.push([p, k]);
  // head, skull and face
  U(ellipsoid(V(0, 0.105, -0.79), V(0.074, 0.088, 0.1)), 0.02);
  U(ellipsoid(V(0, 0.12, -0.71), V(0.05, 0.055, 0.04)), 0.03); // jaw
  U(roundCone(V(0, 0.19, -0.785), V(0, 0.205, -0.755), 0.009, 0.013), 0.012); // nose
  U(ellipsoid(V(0, 0.19, -0.735), V(0.022, 0.012, 0.008)), 0.01); // lips
  for (const s of [-1, 1]) {
    U(ellipsoid(V(0.072 * s, 0.11, -0.79), V(0.012, 0.03, 0.02)), 0.008); // ears
    U(ellipsoid(V(0.045 * s, 0.17, -0.78), V(0.022, 0.02, 0.015)), 0.02); // cheekbones
    sub.push(ellipsoid(V(0.032 * s, 0.205, -0.805), V(0.019, 0.016, 0.014))); // eye sockets
  }
  // neck & torso
  U(roundCone(V(0, 0.095, -0.68), V(0, 0.11, -0.57), 0.045, 0.055), 0.03);
  U(ellipsoid(V(0, 0.125, -0.42), V(0.165, 0.11, 0.16)), 0.06); // ribcage
  U(ellipsoid(V(0, 0.095, -0.2), V(0.14, 0.085, 0.14)), 0.07); // belly
  U(ellipsoid(V(0, 0.1, -0.02), V(0.165, 0.095, 0.11)), 0.06); // pelvis
  for (const s of [-1, 1]) {
    U(ellipsoid(V(0.08 * s, 0.19, -0.44), V(0.07, 0.03, 0.06)), 0.04); // pecs
    U(roundCone(V(0.03 * s, 0.17, -0.56), V(0.16 * s, 0.155, -0.545), 0.014, 0.016), 0.03); // collarbones
    U(ellipsoid(V(0.185 * s, 0.11, -0.52), V(0.06, 0.06, 0.065)), 0.04); // shoulders
  }
  // arms
  const arm = (s, sh, el, wr, palmDir) => {
    U(roundCone(sh, el, 0.046, 0.036), 0.04);
    U(roundCone(el, wr, 0.037, 0.024), 0.025);
    const pd = palmDir.clone().normalize();
    const palmC = wr.clone().addScaledVector(pd, 0.055);
    U(ellipsoid(palmC, V(0.035, 0.035, 0.035).multiply(V(1, 1, 1))), 0.02);
    // fingers fan out along palmDir
    const side = new THREE.Vector3().crossVectors(pd, V(0, 1, 0)).normalize();
    if (side.lengthSq() < 0.1) side.set(1, 0, 0);
    for (let f = 0; f < 4; f++) {
      const off = (f - 1.5) * 0.019;
      const base = palmC.clone().addScaledVector(pd, 0.035).addScaledVector(side, off);
      const len = 0.075 - Math.abs(f - 1.4) * 0.01;
      const tip = base.clone().addScaledVector(pd, len).add(V(0, -0.012, 0));
      U(roundCone(base, tip, 0.0095, 0.0075), 0.008);
    }
    const tb = palmC.clone().addScaledVector(side, -0.035 * s).addScaledVector(pd, -0.01);
    U(roundCone(tb, tb.clone().addScaledVector(pd, 0.05).addScaledVector(side, -0.015 * s), 0.011, 0.008), 0.01);
  };
  // legs
  const leg = (s) => {
    const hip = V(0.09 * s, 0.1, 0.03), knee = V(0.11 * s, 0.09, 0.46), ank = V(0.12 * s, 0.06, 0.87);
    U(roundCone(hip, knee, 0.085, 0.05), 0.05);
    U(ellipsoid(V(0.11 * s, 0.125, 0.46), V(0.04, 0.03, 0.04)), 0.02); // kneecap
    U(ellipsoid(V(0.11 * s, 0.065, 0.58), V(0.048, 0.045, 0.1)), 0.04); // calf
    U(roundCone(knee, ank, 0.05, 0.03), 0.04);
    // foot points up, slightly splayed
    const heel = V(0.12 * s, 0.04, 0.9), toe = V(0.15 * s, 0.17, 0.95);
    U(roundCone(heel, toe, 0.035, 0.028), 0.03);
    for (let t = 0; t < 5; t++) {
      const tx = 0.15 * s + (t - 2) * 0.012 * s;
      U(roundCone(V(tx, 0.16 - Math.abs(t - 1) * 0.008, 0.958), V(tx, 0.18 - Math.abs(t - 1) * 0.01, 0.97), 0.008, 0.007), 0.006);
    }
  };
  leg(-1);
  leg(1);
  if (pose === 'mouth') {
    // died holding their own breath: both palms pressed over the mouth
    arm(-1, V(-0.2, 0.1, -0.52), V(-0.27, 0.2, -0.45), V(-0.09, 0.24, -0.66), V(0.75, 0.15, -0.55));
    arm(1, V(0.2, 0.1, -0.52), V(0.27, 0.21, -0.43), V(0.1, 0.27, -0.64), V(-0.7, 0.2, -0.6));
  } else {
    arm(-1, V(-0.2, 0.1, -0.52), V(-0.23, 0.07, -0.25), V(-0.235, 0.06, 0.0), V(0, -0.1, 1));
    if (pose === 'hang') arm(1, V(0.2, 0.1, -0.52), V(0.4, 0.02, -0.46), V(0.43, -0.24, -0.42), V(0.02, -1, 0.05));
    else arm(1, V(0.2, 0.1, -0.52), V(0.23, 0.07, -0.25), V(0.235, 0.06, 0.0), V(0, -0.1, 1));
  }
  return { add, sub };
}

function makeField(pose) {
  const { add, sub } = buildPrims(pose);
  return (x, y, z) => {
    let d = 1e9;
    for (const [p, k] of add) {
      const b = p.box;
      // cheap reject: far outside this primitive's bounds
      const ox = x < b.min.x ? b.min.x - x : x > b.max.x ? x - b.max.x : 0;
      const oy = y < b.min.y ? b.min.y - y : y > b.max.y ? y - b.max.y : 0;
      const oz = z < b.min.z ? b.min.z - z : z > b.max.z ? z - b.max.z : 0;
      const o = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (o > d + k) continue;
      d = smin(d, p.d(x, y, z), k);
    }
    for (const p of sub) d = smax(d, -p.d(x, y, z), 0.012);
    return d;
  };
}

// ---------------------------------------------------------------- meshing
const CORNERS = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

export function march(field, min, max, step) {
  const nx = Math.ceil((max.x - min.x) / step) + 1;
  const ny = Math.ceil((max.y - min.y) / step) + 1;
  const nz = Math.ceil((max.z - min.z) / step) + 1;
  const vals = new Float32Array(nx * ny * nz);
  // coarse pass decides where the fine field is needed
  const C = 4;
  for (let k = 0; k < nz; k += C)
    for (let j = 0; j < ny; j += C)
      for (let i = 0; i < nx; i += C) {
        const x = min.x + i * step, y = min.y + j * step, z = min.z + k * step;
        const dc = field(x + step * C * 0.5, y + step * C * 0.5, z + step * C * 0.5);
        const near = Math.abs(dc) < step * C * 1.2;
        for (let kk = k; kk < Math.min(k + C, nz); kk++)
          for (let jj = j; jj < Math.min(j + C, ny); jj++)
            for (let ii = i; ii < Math.min(i + C, nx); ii++)
              vals[ii + nx * (jj + ny * kk)] = near ? field(min.x + ii * step, min.y + jj * step, min.z + kk * step) : dc;
      }
  const pos = [];
  const vv = new Float32Array(8);
  const ev = new Array(12);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let idx = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, d] = CORNERS[c];
          vv[c] = vals[i + a + nx * (j + b + ny * (k + d))];
          if (vv[c] < 0) idx |= 1 << c;
        }
        const em = edgeTable[idx];
        if (!em) continue;
        for (let e = 0; e < 12; e++) {
          if (!(em & (1 << e))) continue;
          const [c0, c1] = EDGES[e];
          const t = vv[c0] / (vv[c0] - vv[c1]);
          const p0 = CORNERS[c0], p1 = CORNERS[c1];
          ev[e] = [min.x + (i + p0[0] + (p1[0] - p0[0]) * t) * step, min.y + (j + p0[1] + (p1[1] - p0[1]) * t) * step, min.z + (k + p0[2] + (p1[2] - p0[2]) * t) * step];
        }
        const base = idx * 16;
        for (let q = 0; triTable[base + q] !== -1; q += 3) {
          const a = ev[triTable[base + q]], b = ev[triTable[base + q + 1]], c = ev[triTable[base + q + 2]];
          pos.push(...a, ...c, ...b);
        }
      }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g = mergeVertices(g, step * 0.01);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- public
const cache = {};
export function bodyGeometry(pose = 'supine') {
  if (cache[pose]) return cache[pose];
  const field = makeField(pose);
  const min = V(-0.48, -0.42, -0.93), max = V(0.48, 0.26, 1.02);
  const g = march(field, min, max, 0.0085);
  // fine skin irregularity
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = fbm(x * 40, y * 40, z * 40, 2) * 0.0015;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  g.computeVertexNormals();
  cache[pose] = { g, field };
  return cache[pose];
}

// a sheet (or body bag) draped over a body field: blurred heightfield over x/z
export function drapeGeometry(field, { x0 = -0.62, x1 = 0.62, z0 = -0.48, z1 = 1.08, edge = 0.375, drop = 0.3, bag = false, seed = 1 } = {}) {
  const nxs = 60, nzs = 90;
  const H = new Float32Array((nxs + 1) * (nzs + 1));
  const X = (u) => x0 + (x1 - x0) * (u / nxs), Z = (w) => z0 + (z1 - z0) * (w / nzs);
  for (let w = 0; w <= nzs; w++)
    for (let u = 0; u <= nxs; u++) {
      const x = X(u), z = Z(w);
      let y = 0.45, top = 0;
      for (let s = 0; s < 80; s++) {
        const d = field(x, y, z);
        if (d < 0.002) { top = y; break; }
        y -= Math.max(d * 0.9, 0.003);
        if (y < 0) break;
      }
      H[w * (nxs + 1) + u] = Math.max(top + 0.018, 0.004);
    }
  // cloth bridges hollows: dilate, then blur
  const tmp = new Float32Array(H.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let w = 0; w <= nzs; w++)
      for (let u = 0; u <= nxs; u++) {
        let m = 0;
        for (let dw = -2; dw <= 2; dw++) for (let du = -2; du <= 2; du++) {
          const uu = Math.min(nxs, Math.max(0, u + du)), ww = Math.min(nzs, Math.max(0, w + dw));
          m = Math.max(m, H[ww * (nxs + 1) + uu] - 0.006 * (Math.abs(du) + Math.abs(dw)));
        }
        tmp[w * (nxs + 1) + u] = m;
      }
    H.set(tmp);
  }
  for (let pass = 0; pass < 4; pass++) {
    for (let w = 0; w <= nzs; w++)
      for (let u = 0; u <= nxs; u++) {
        let acc = 0, n = 0;
        for (let dw = -1; dw <= 1; dw++) for (let du = -1; du <= 1; du++) {
          const uu = u + du, ww = w + dw;
          if (uu < 0 || ww < 0 || uu > nxs || ww > nzs) continue;
          acc += H[ww * (nxs + 1) + uu];
          n++;
        }
        tmp[w * (nxs + 1) + u] = acc / n;
      }
    H.set(tmp);
  }
  const g = new THREE.PlaneGeometry(1, 1, nxs, nzs);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = Math.round((p.getX(i) + 0.5) * nxs), w = Math.round((p.getZ(i) + 0.5) * nzs);
    const x = X(u), z = Z(w);
    let h = H[w * (nxs + 1) + u];
    const ax = Math.abs(x);
    if (bag) {
      const rim = Math.max(0, Math.min(1, (0.44 - ax) / 0.12, (z - z0) / 0.1, (z1 - z) / 0.1));
      h = 0.006 + (h + 0.01) * Math.sqrt(rim);
    } else if (ax > edge) {
      // hangs over the slab edge, folding as it falls
      const t = (ax - edge) / (x1 - edge);
      h = Math.min(h, 0.004 - t * drop) ;
    }
    const wr = fbm(x * 8 + seed, z * 8, seed, 2) * 0.01 + Math.sin(z * 26 + x * 5 + seed) * 0.003;
    const fold = !bag && ax > edge ? Math.sin(z * 18 + seed) * 0.012 : 0;
    p.setXYZ(i, x + Math.sign(x) * fold, h + wr, z);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
