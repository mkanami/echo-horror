// Prop library. Each function receives a local frame L (from Builder.at)
// so props can be placed and rotated freely.
import * as THREE from 'three';
import { corpseParts, sculpt, fbm, taper } from './organic.js';
import { bodyGeometry, drapeGeometry } from './body.js';

const R = (a, b) => a + Math.random() * (b - a);

// default material for everything a prop function builds (o.key still overrides)
const K = (L, key) => ({
  box: (x, y, z, sx, sy, sz, o = {}) => L.box(x, y, z, sx, sy, sz, { key, ...o }),
  cyl: (x, y, z, rt, rb, h, seg, o = {}) => L.cyl(x, y, z, rt, rb, h, seg, { key, ...o }),
  geo: (g, x, y, z, o = {}) => L.geo(g, x, y, z, { key, ...o }),
});

export function bed(L, { messy = false } = {}) {
  for (const [x, z] of [[-0.42, -0.95], [0.42, -0.95], [-0.42, 0.95], [0.42, 0.95]]) L.cyl(x, 0.22, z, 0.025, 0.025, 0.44, 6);
  L.box(0, 0.47, 0, 0.92, 0.07, 2.0);
  L.box(0, 0.58, 0, 0.86, 0.15, 1.9, { collide: false, key: 'soft' });
  L.geo(sculpt(new THREE.SphereGeometry(0.2, 20, 12), (v) => { v.x *= 1.5; v.y *= 0.35; v.z *= 0.85; v.y += fbm(v.x * 9, v.z * 9, 1) * 0.015; }), 0, 0.72, -0.72, { collide: false, rot: [0.15, 0.1, 0], edges: 40, key: 'soft' });
  L.box(0, 0.8, -1.0, 0.92, 0.7, 0.05, { collide: false });
  L.box(0, 0.68, 1.0, 0.92, 0.35, 0.04, { collide: false });
  for (const x of [-0.47, 0.47]) L.box(x, 0.72, 0.1, 0.03, 0.03, 1.2, { collide: false });
  if (messy) {
    const sheet = sculpt(new THREE.PlaneGeometry(1.1, 1.3, 22, 26), (v) => {
      const edge = Math.max(0, Math.abs(v.x) - 0.42);
      v.z = -edge * 1.4 + fbm(v.x * 5, v.y * 5, 3) * 0.05 + Math.sin(v.y * 14 + v.x * 3) * 0.012;
    });
    sheet.rotateX(-Math.PI / 2);
    L.geo(sheet, 0.05, 0.68, 0.3, { collide: false, rot: [0, 0.15, 0], edges: 0, key: 'soft' });
  }
}

export function bedside(L) {
  L = K(L, 'paint');
  L.box(0, 0.32, 0, 0.45, 0.64, 0.42);
  L.box(0, 0.45, 0.215, 0.38, 0.14, 0.02, { collide: false });
  L.box(0, 0.68, 0.0, 0.08, 0.1, 0.08, { collide: false });
}

export function ivStand(L, { fallen = false } = {}) {
  const rot = fallen ? [0, 0, Math.PI / 2 - 0.1] : [0, 0, 0];
  const y = fallen ? 0.1 : 0.9;
  L.cyl(0, y, 0, 0.012, 0.012, 1.8, 5, { collide: false, rot });
  if (!fallen) {
    L.box(0, 0.8, 0, 0.3, 1.4, 0.3, { render: false });
    L.box(0, 0.03, 0, 0.5, 0.03, 0.04, { collide: false });
    L.box(0, 0.03, 0, 0.04, 0.03, 0.5, { collide: false });
    L.box(0.1, 1.65, 0, 0.12, 0.2, 0.04, { collide: false });
    L.cyl(0.1, 1.2, 0, 0.004, 0.004, 0.7, 3, { collide: false, edges: 0 });
  }
}

export function curtain(L, length, { height = 2.3, folds = 10, drop = 0.3 } = {}) {
  L.cyl(0, height + 0.05, 0, 0.012, 0.012, length, 4, { collide: false, rot: [Math.PI / 2, 0, 0] });
  const step = length / folds;
  for (let i = 0; i < folds; i++) {
    const z = -length / 2 + step * (i + 0.5);
    const off = (i % 2 ? 0.06 : -0.06);
    L.box(off, (height + drop) / 2, z, 0.02, height - drop, step * 1.08, { collide: false, rot: [0, (i % 2 ? 0.5 : -0.5), 0], key: 'soft' });
  }
  L.box(0, 1.2, 0, 0.12, 1.6, length * 0.95, { render: false });
}

export function cabinet(L, w = 0.9, h = 1.9, d = 0.45, { glass = true } = {}) {
  L = K(L, 'paint');
  L.box(0, h / 2, 0, w, h, d);
  L.box(-w / 4, h * 0.62, d / 2, w / 2 - 0.03, h * 0.7, 0.02, { collide: false });
  L.box(w / 4, h * 0.62, d / 2, w / 2 - 0.03, h * 0.7, 0.02, { collide: false });
  if (glass) for (let i = 1; i < 4; i++) L.box(0, h * (0.3 + i * 0.16), 0, w - 0.05, 0.02, d - 0.05, { collide: false });
  for (let i = 0; i < 5; i++) L.cyl(R(-w / 3, w / 3), h * 0.5 + 0.08, R(-0.1, 0.1), 0.03, 0.03, 0.12, 6, { collide: false });
}

export function desk(L, w = 1.4, d = 0.7) {
  L = K(L, 'wood');
  L.box(0, 0.74, 0, w, 0.04, d);
  for (const [x, z] of [[-w / 2 + 0.05, -d / 2 + 0.05], [w / 2 - 0.05, -d / 2 + 0.05], [-w / 2 + 0.05, d / 2 - 0.05], [w / 2 - 0.05, d / 2 - 0.05]])
    L.box(x, 0.36, z, 0.04, 0.72, 0.04);
  L.box(w / 2 - 0.25, 0.5, 0, 0.42, 0.44, d - 0.08, { collide: false });
  L.box(w / 2 - 0.25, 0.5, d / 2 - 0.03, 0.38, 0.01, 0.02, { collide: false });
}

export function chair(L, { fallen = false } = {}) {
  L = K(L, 'wood');
  const P = fallen ? { rot: [Math.PI / 2, 0, 0.3] } : {};
  if (fallen) {
    L.box(0, 0.22, 0, 0.44, 0.44, 0.04, { collide: false, ...P });
    L.box(0, 0.05, 0.35, 0.42, 0.05, 0.42, { collide: false, rot: [0, 0.3, 0] });
    return;
  }
  L.box(0, 0.45, 0, 0.44, 0.04, 0.42);
  L.box(0, 0.72, -0.2, 0.42, 0.5, 0.03, { collide: false });
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) L.cyl(x, 0.22, z, 0.015, 0.015, 0.44, 5, { collide: false });
}

export function monitor(L) {
  L = K(L, 'rubber');
  L.box(0, 0.98, 0, 0.42, 0.34, 0.32, { collide: false });
  L.box(0, 0.98, 0.165, 0.36, 0.28, 0.01, { collide: false });
  L.box(0, 0.78, 0, 0.18, 0.04, 0.18, { collide: false });
  L.box(0.05, 0.775, 0.3, 0.45, 0.025, 0.16, { collide: false });
}

export function shelf(L, len, h = 3, d = 0.5, { fill = 0.7 } = {}) {
  L = K(L, 'wood');
  const n = Math.max(2, Math.round(len / 1.2));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len / n) * i;
    L.box(x, h / 2, -d / 2 + 0.02, 0.04, h, 0.04);
    L.box(x, h / 2, d / 2 - 0.02, 0.04, h, 0.04, { collide: i === 0 || i === n });
  }
  L.box(0, h / 2, 0, len, h, d, { collide: true, render: false });
  const levels = 5;
  for (let j = 0; j < levels; j++) {
    const y = 0.1 + (h - 0.2) * (j / (levels - 1));
    L.box(0, y, 0, len, 0.03, d, { collide: false });
    if (j === levels - 1) continue;
    let x = -len / 2 + 0.05;
    while (x < len / 2 - 0.35) {
      const w = R(0.25, 0.45);
      if (Math.random() < fill) {
        const bh = R(0.22, 0.42);
        L.box(x + w / 2, y + bh / 2 + 0.015, R(-0.04, 0.04), w - 0.03, bh, d * R(0.7, 0.9), { collide: false, rot: [0, R(-0.08, 0.08), Math.random() < 0.1 ? 0.3 : 0], key: Math.random() < 0.75 ? 'cardboard' : 'paperw' });
      }
      x += w;
    }
  }
}

export function lockers(L, count) {
  L = K(L, 'paint');
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 0.5;
    L.box(x, 0.95, 0, 0.48, 1.9, 0.5);
    const open = false;
    L.box(x + (open ? -0.15 : 0), 0.95, 0.26 + (open ? 0.2 : 0), 0.44, 1.8, 0.02, { collide: false, rot: [0, open ? 1.1 : 0, 0] });
    for (let k = 0; k < 3; k++) L.box(x, 1.6 + k * 0.05, 0.27, 0.3, 0.01, 0.01, { collide: false, edges: 0 });
  }
}

export function gurney(L, { body = true, bag = false } = {}) {
  L.box(0, 0.8, 0, 0.65, 0.05, 1.9);
  for (const [x, z] of [[-0.28, -0.85], [0.28, -0.85], [-0.28, 0.85], [0.28, 0.85]]) {
    L.cyl(x, 0.42, z, 0.02, 0.02, 0.75, 5, { collide: false });
    L.cyl(x, 0.05, z, 0.05, 0.05, 0.03, 8, { collide: false, rot: [0, 0, Math.PI / 2] });
  }
  if (body) corpse(L, 0, 0.83, 0, { bag });
}

// sheet: body on a slab under a sheet pulled to the chest, one arm hanging off
export function corpse(L, x, y, z, { bag = false, ry = 0, sheet = false, pose = null } = {}) {
  const o = { collide: false, rot: [0, ry, 0], edges: 40 };
  if (bag) {
    const { field } = bodyGeometry('supine');
    L.geo(drapeGeometry(field, { bag: true, x0: -0.44, x1: 0.44, z0: -0.93, z1: 1.0, seed: x + z }), x, y, z, { ...o, key: 'rubber' });
    return;
  }
  const { g, field } = bodyGeometry(pose || (sheet ? 'hang' : 'supine'));
  L.geo(g, x, y, z, { ...o, key: 'flesh' });
  if (sheet) L.geo(drapeGeometry(field, { seed: x * 3 + z }), x, y, z, { ...o, key: 'cloth' });
}

export function crate(L, s = 0.8, { ry = 0, y = 0 } = {}) {
  L = K(L, 'wood');
  L.box(0, y + s / 2, 0, s, s, s, { rot: [0, ry, 0] });
  L.box(0, y + s / 2, 0, s + 0.02, 0.06, s + 0.02, { collide: false, rot: [0, ry, 0] });
}

export function barrel(L, { fallen = false } = {}) {
  L = K(L, 'rust');
  if (fallen) {
    L.cyl(0, 0.3, 0, 0.3, 0.3, 0.88, 10, { rot: [Math.PI / 2, 0, 0] });
    return;
  }
  L.cyl(0, 0.44, 0, 0.3, 0.3, 0.88, 10);
  L.cyl(0, 0.3, 0, 0.31, 0.31, 0.04, 10, { collide: false });
  L.cyl(0, 0.6, 0, 0.31, 0.31, 0.04, 10, { collide: false });
}

// enamel shade + bulb on a cable. Never hangs lower than head height unless
// `low` is set (e.g. right above an operating table).
const HEAD_CLEAR = 2.2;
function shade(L, x, y, z, rot = [0, 0, 0]) {
  L.cyl(x, y, z, 0.045, 0.24, 0.16, 20, { collide: false, rot });
  L.cyl(x, y + 0.1, z, 0.03, 0.045, 0.05, 12, { collide: false, rot, key: 'rust' });
  L.geo(new THREE.SphereGeometry(0.045, 12, 8), x, y - 0.07, z, { collide: false, key: 'glass', lineKey: 'prop' });
}
export function lamp(L, y, cable = 0.5, { low = false } = {}) {
  L = K(L, 'paint');
  if (!low) cable = Math.min(cable, Math.max(0.12, y - HEAD_CLEAR - 0.16));
  L.cyl(0, y - cable / 2, 0, 0.005, 0.005, cable, 3, { collide: false, edges: 0, key: 'rubber' });
  shade(L, 0, y - cable - 0.08, 0);
}

export function danglingLamp(L, y, len = 1.4, tilt = 0.6) {
  L = K(L, 'paint');
  // torn loose: hangs at an angle, but stays above head height
  const room = y - HEAD_CLEAR - 0.18;
  if (Math.cos(tilt) * len > room) len = Math.max(0.2, room / Math.max(0.2, Math.cos(tilt)));
  L.cyl(Math.sin(tilt) * len * 0.5, y - Math.cos(tilt) * len * 0.5, 0, 0.006, 0.006, len, 3, { collide: false, edges: 0, rot: [0, 0, tilt], key: 'rubber' });
  shade(L, Math.sin(tilt) * len, y - Math.cos(tilt) * len - 0.08, 0, [0, 0, tilt + 0.4]);
}

export function cable(L, x1, y1, z1, x2, y2, z2, sag = 0.6, segs = 8) {
  L = K(L, 'rubber');
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(new THREE.Vector3(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t - Math.sin(t * Math.PI) * sag, z1 + (z2 - z1) * t));
  }
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[i + 1];
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(0.012, 0.012, len, 3);
    const dir = b.clone().sub(a).normalize();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    L.geo(g, mid.x, mid.y, mid.z, { collide: false, edges: 0, walk: true });
  }
}

export function vent(L, w = 1.2, d = 0.8) {
  L.box(0, 0, 0, w, 0.05, d, { collide: false });
  for (let i = 1; i < 6; i++) L.box(-w / 2 + (w / 6) * i, -0.04, 0, 0.02, 0.05, d - 0.08, { collide: false });
}

export function drawerWall(L, cols, rows, { openIdx = -1 } = {}) {
  L = K(L, 'iron');
  const w = 0.8, h = 0.7;
  L.box(0, (rows * h) / 2 + 0.2, 0, cols * w + 0.1, rows * h + 0.4, 0.8);
  let k = 0;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++, k++) {
      const x = (c - (cols - 1) / 2) * w;
      const y = 0.2 + h / 2 + r * h + 0.05;
      if (k === openIdx) {
        L.box(x, y - 0.1, 0.9, w - 0.1, 0.12, 1.2, { collide: true });
        corpse(L, x, y - 0.05, 0.9, { bag: true, ry: 0 });
      } else {
        L.box(x, y, 0.41, w - 0.08, h - 0.08, 0.03, { collide: false });
        L.box(x, y, 0.44, 0.2, 0.03, 0.03, { collide: false });
      }
    }
}

export function opTable(L) {
  L = K(L, 'iron');
  L.cyl(0, 0.45, 0, 0.12, 0.2, 0.9, 8);
  L.box(0, 0.92, 0, 0.75, 0.06, 2.0);
  L.box(0, 0.96, 0.9, 0.6, 0.02, 0.15, { collide: false });
}

export function sink(L) {
  L = K(L, 'plastic');
  L.box(0, 0.85, 0, 0.6, 0.18, 0.45);
  L.box(0, 0.4, -0.1, 0.12, 0.8, 0.12, { collide: false });
  L.cyl(0, 1.05, -0.18, 0.015, 0.015, 0.25, 5, { collide: false });
  L.box(0, 1.6, -0.21, 0.5, 0.65, 0.02, { collide: false });
}

export function toilet(L) {
  L = K(L, 'plastic');
  L.box(0, 0.2, 0.05, 0.36, 0.4, 0.5);
  L.box(0, 0.42, 0.05, 0.4, 0.05, 0.55, { collide: false });
  L.box(0, 0.65, -0.22, 0.4, 0.45, 0.16, { collide: false });
}

export function wheelchair(L, { fallen = false } = {}) {
  const rot = fallen ? [0, 0, Math.PI / 2] : [0, 0, 0];
  const yo = fallen ? 0.32 : 0;
  const t = new THREE.TorusGeometry(0.3, 0.02, 8, 36);
  if (fallen) {
    L.geo(t, 0, 0.03, 0, { collide: false, rot: [Math.PI / 2, 0, 0] });
    L.geo(t, 0, 0.55, 0, { collide: false, rot: [Math.PI / 2, 0, 0] });
    L.box(0, 0.3, 0.2, 0.5, 0.45, 0.04, { collide: false });
    L.box(0, 0.3, -0.1, 0.5, 0.45, 0.04, { collide: false, rot: [0, 0, 0.1] });
    return;
  }
  L.geo(t, -0.28, 0.3 + yo, 0, { collide: false, rot: [0, Math.PI / 2, 0] });
  L.geo(t, 0.28, 0.3 + yo, 0, { collide: false, rot: [0, Math.PI / 2, 0] });
  L.box(0, 0.5, 0, 0.5, 0.05, 0.45, { rot });
  L.box(0, 0.8, -0.22, 0.5, 0.55, 0.04, { collide: false });
}

export function bench(L, len = 1.8) {
  L = K(L, 'wood');
  L.box(0, 0.45, 0, len, 0.06, 0.45);
  L.box(-len / 2 + 0.1, 0.22, 0, 0.06, 0.44, 0.4, { collide: false });
  L.box(len / 2 - 0.1, 0.22, 0, 0.06, 0.44, 0.4, { collide: false });
}

export function planter(L) {
  L = K(L, 'rust');
  L.cyl(0, 0.35, 0, 0.35, 0.28, 0.7, 9);
  for (let i = 0; i < 6; i++) {
    const a = R(0, Math.PI * 2);
    L.cyl(Math.cos(a) * 0.15, 1.0, Math.sin(a) * 0.15, 0.005, 0.015, R(0.6, 1.0), 3, { collide: false, rot: [R(-0.5, 0.5), 0, R(-0.5, 0.5)] });
  }
}

export function debris(L, n, rx, rz) {
  L = K(L, 'w_concrete');
  for (let i = 0; i < n; i++) {
    const s = R(0.05, 0.25);
    L.box(R(-rx, rx), s * 0.3, R(-rz, rz), s, s * 0.6, s * R(0.6, 1.4), { collide: false, rot: [R(0, 1), R(0, 3), R(0, 1)] });
  }
}

export function papers(L, n, rx, rz) {
  L = K(L, 'paperw');
  for (let i = 0; i < n; i++) L.box(R(-rx, rx), 0.005, R(-rz, rz), 0.21, 0.004, 0.297, { collide: false, rot: [0, R(0, 3.14), 0] });
}

export function tank(L, { body = true } = {}) {
  L = K(L, 'rust');
  L.cyl(0, 0.2, 0, 0.75, 0.8, 0.4, 14);
  L.cyl(0, 1.4, 0, 0.65, 0.65, 2.0, 14, { key: 'glass', lineKey: 'prop' });
  L.cyl(0, 2.55, 0, 0.75, 0.75, 0.3, 14, { collide: false });
  for (let i = 0; i < 5; i++) L.cyl(0, 2.9 + i * 0.4, 0, 0.06, 0.06, 0.42, 12, { collide: false });
  if (body) {
    // a body floating upright, limp
    const { g } = bodyGeometry('supine');
    L.geo(g, 0, 1.42, 0.0, { collide: false, edges: 40, key: 'flesh', rot: [Math.PI / 2 - 0.25, 0.4, 0.12], scale: [0.78, 0.78, 0.78] });
    L.cyl(0, 2.25, 0, 0.01, 0.01, 0.6, 3, { collide: false, edges: 0 });
  }
}

export function console_(L, w = 1.6) {
  L = K(L, 'paint');
  L.box(0, 0.45, 0, w, 0.9, 0.7);
  L.box(0, 1.0, -0.05, w, 0.25, 0.6, { collide: false, rot: [-0.5, 0, 0] });
  for (let i = 0; i < 8; i++) L.box(-w / 2 + 0.15 + i * (w - 0.3) / 7, 1.08, 0.08, 0.06, 0.03, 0.06, { collide: false, rot: [-0.5, 0, 0] });
  L.box(-w / 4, 1.45, -0.25, 0.5, 0.38, 0.1, { collide: false });
  L.box(w / 4, 1.45, -0.25, 0.5, 0.38, 0.1, { collide: false });
}

export function bars(L, len, h, { gapFrom = 99, gapTo = -99, bent = false } = {}) {
  L = K(L, 'rust');
  const n = Math.round(len / 0.18);
  L.box(0, h, 0, len, 0.08, 0.1, { collide: false });
  L.box(0, 0.04, 0, len, 0.08, 0.1, { collide: false });
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len / n) * i;
    if (x > gapFrom && x < gapTo) {
      if (bent) L.cyl(x, h * 0.3, 0.3, 0.02, 0.02, h * 0.6, 5, { collide: false, walk: true, rot: [0.9, 0, (x - (gapFrom + gapTo) / 2) * 0.8] });
      continue;
    }
    L.cyl(x, h / 2, 0, 0.02, 0.02, h, 5, { collide: false, edges: 0 });
  }
}

export function fan(L, r = 1.0) {
  L = K(L, 'rust');
  L.cyl(0, 0, 0, r + 0.08, r + 0.08, 0.2, 16, { collide: false, rot: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    L.box(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 0.05, r * 0.85, 0.22, 0.02, { collide: false, rot: [0.3, 0, a] });
  }
  L.cyl(0, 0, 0.08, 0.15, 0.15, 0.1, 8, { collide: false, rot: [Math.PI / 2, 0, 0] });
}

export function doorFrame(L, w, h, ceil) {
  L = K(L, 'paint');
  L.box(-w / 2 - 0.06, h / 2, 0, 0.12, h, 0.3);
  L.box(w / 2 + 0.06, h / 2, 0, 0.12, h, 0.3);
  L.box(0, (h + ceil) / 2, 0, w + 0.24, ceil - h, 0.3, { collide: false });
}

export function sign(L, w = 0.8, h = 0.3) {
  L = K(L, 'paperw');
  L.box(0, 0, 0, w, h, 0.03, { collide: false });
  L.box(0, 0, 0.02, w * 0.8, 0.02, 0.01, { collide: false, edges: 0 });
}

export function generator(L) {
  L = K(L, 'paint');
  L.box(0, 1.3, 0, 7, 2.6, 3);
  L.box(0, 2.75, 0, 6, 0.3, 2.4, { collide: false });
  for (let i = 0; i < 6; i++) L.box(-2.5 + i, 1.3, 1.52, 0.6, 2.0, 0.04, { collide: false });
  for (const x of [-2, 0, 2]) {
    L.cyl(x, 3.6, -0.6, 0.35, 0.35, 1.5, 10, { collide: false });
    L.cyl(x, 5.0, -0.6, 0.25, 0.25, 1.4, 8, { collide: false });
  }
  L.cyl(-4.2, 1.2, 0, 1.1, 1.1, 0.5, 18, { rot: [0, 0, Math.PI / 2] });
  L.cyl(-3.7, 1.2, 0, 0.2, 0.2, 0.6, 8, { collide: false, rot: [0, 0, Math.PI / 2] });
  L.box(3.0, 1.0, 1.9, 1.4, 1.6, 0.6);
}

export function fuelTank(L, len = 4) {
  L = K(L, 'rust');
  L.cyl(0, 1.1, 0, 0.9, 0.9, len, 14, { rot: [0, 0, Math.PI / 2] });
  for (const x of [-len / 2 + 0.4, len / 2 - 0.4]) L.box(x, 0.3, 0, 0.3, 0.6, 1.4);
}

export function elevatorDoorFrame(L, w, h) {
  L = K(L, 'rust');
  L.box(-w / 2 - 0.15, h / 2, 0, 0.3, h, 0.35);
  L.box(w / 2 + 0.15, h / 2, 0, 0.3, h, 0.35);
  L.box(0, h + 0.15, 0, w + 0.6, 0.3, 0.35, { collide: false });
  L.box(0, h + 0.55, 0.15, 0.8, 0.25, 0.05, { collide: false });
}

// ---------------------------------------------------------------- extra set
export function medCart(L) {
  const W = K(L, 'plastic'), I = K(L, 'iron');
  W.box(0, 0.5, 0, 0.6, 0.7, 0.45);
  for (let k = 0; k < 4; k++) {
    W.box(0, 0.25 + k * 0.16, 0.228, 0.56, 0.14, 0.01, { collide: false });
    I.box(0, 0.25 + k * 0.16, 0.238, 0.16, 0.015, 0.012, { collide: false });
  }
  I.box(0, 0.87, 0, 0.64, 0.03, 0.5, { collide: false });
  for (const [x, z] of [[-0.25, -0.18], [0.25, -0.18], [-0.25, 0.18], [0.25, 0.18]]) K(L, 'rubber').cyl(x, 0.06, z, 0.05, 0.05, 0.03, 14, { collide: false, rot: [0, 0, Math.PI / 2] });
  // bottles and a kidney dish on top
  for (let k = 0; k < 4; k++) K(L, 'glass').cyl(-0.2 + k * 0.09, 0.95, -0.1 + (k % 2) * 0.1, 0.025, 0.025, 0.12, 12, { collide: false, lineKey: 'prop' });
  I.box(0.15, 0.9, 0.08, 0.22, 0.02, 0.12, { collide: false });
}

export function oxygenTanks(L, n = 3) {
  const I = K(L, 'iron');
  for (let k = 0; k < n; k++) {
    const x = (k - (n - 1) / 2) * 0.24, tilt = k === n - 1 ? 0.12 : 0;
    I.cyl(x, 0.72, 0, 0.1, 0.1, 1.25, 20, { rot: [0, 0, tilt] });
    I.geo(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), x - tilt * 0.65, 1.34, 0, { collide: false, rot: [0, 0, tilt] });
    K(L, 'rust').cyl(x - tilt * 0.75, 1.47, 0, 0.025, 0.03, 0.1, 10, { collide: false });
    K(L, 'iron').cyl(x - tilt * 0.75, 1.53, 0, 0.05, 0.05, 0.015, 14, { collide: false });
  }
  I.box(0, 0.9, -0.12, (n - 1) * 0.24 + 0.3, 0.03, 0.03, { collide: false });
}

export function wallClock(L) {
  K(L, 'bplastic').cyl(0, 0, 0, 0.16, 0.16, 0.05, 32, { collide: false, rot: [Math.PI / 2, 0, 0] });
  K(L, 'paperw').cyl(0, 0, 0.026, 0.14, 0.14, 0.004, 32, { collide: false, rot: [Math.PI / 2, 0, 0] });
  K(L, 'bplastic').box(0.03, 0.04, 0.03, 0.012, 0.11, 0.004, { collide: false, rot: [0, 0, -0.6] });
  K(L, 'bplastic').box(-0.04, -0.01, 0.031, 0.01, 0.08, 0.004, { collide: false, rot: [0, 0, 1.9] });
}

export function extinguisherBox(L) {
  const P = K(L, 'paint');
  P.box(0, 1.1, 0.12, 0.35, 0.75, 0.24, { collide: false });
  K(L, 'glassDark').box(0, 1.1, 0.245, 0.29, 0.66, 0.01, { collide: false });
  K(L, 'iron').cyl(0, 1.05, 0.12, 0.075, 0.075, 0.5, 18, { collide: false });
  K(L, 'bplastic').cyl(0.06, 1.33, 0.12, 0.012, 0.012, 0.18, 8, { collide: false, rot: [0, 0, 0.6] });
}

export function wallPhone(L) {
  K(L, 'bplastic').box(0, 1.45, 0.04, 0.18, 0.26, 0.07, { collide: false });
  K(L, 'bplastic').box(0.12, 1.47, 0.06, 0.06, 0.22, 0.06, { collide: false });
  // handset off the hook, dangling on its cord
  K(L, 'bplastic').box(0.15, 0.75, 0.12, 0.05, 0.2, 0.05, { collide: false, rot: [0.3, 0, 0.2] });
  for (let k = 0; k < 10; k++) K(L, 'rubber').geo(new THREE.TorusGeometry(0.02, 0.004, 4, 10), 0.13 + Math.sin(k) * 0.01, 1.32 - k * 0.055, 0.1, { collide: false, edges: 0 });
}

export function mirror(L, w = 0.5, h = 0.65) {
  K(L, 'iron').box(0, 0, 0, w + 0.04, h + 0.04, 0.02, { collide: false });
  K(L, 'glassDark').box(0, 0, 0.012, w, h, 0.006, { collide: false });
  // cracked: a few thin dark fracture lines
  for (let k = 0; k < 5; k++) K(L, 'bplastic').box((Math.random() - 0.5) * w * 0.3, (Math.random() - 0.5) * h * 0.3, 0.016, 0.003, h * (0.3 + Math.random() * 0.4), 0.002, { collide: false, edges: 0, rot: [0, 0, Math.random() * 3] });
}

export function typewriter(L) {
  const B = K(L, 'bplastic');
  B.box(0, 0.83, 0, 0.42, 0.13, 0.36, { collide: false, rot: [0.12, 0, 0] });
  B.cyl(0, 0.93, -0.1, 0.04, 0.04, 0.5, 16, { collide: false, rot: [0, 0, Math.PI / 2] });
  K(L, 'paperw').box(0, 1.02, -0.11, 0.21, 0.18, 0.004, { collide: false, rot: [-0.25, 0, 0] });
  for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) K(L, 'iron').cyl(-0.16 + c * 0.035, 0.86 + r * 0.012, 0.1 - r * 0.035, 0.01, 0.01, 0.01, 8, { collide: false, edges: 0 });
}

export function deskLamp(L) {
  const I = K(L, 'iron');
  I.cyl(0, 0.77, 0, 0.08, 0.09, 0.03, 18, { collide: false });
  I.cyl(0.05, 0.98, 0, 0.01, 0.01, 0.42, 6, { collide: false, rot: [0, 0, -0.3] });
  I.cyl(0.18, 1.14, 0, 0.01, 0.01, 0.3, 6, { collide: false, rot: [0, 0, 1.2] });
  K(L, 'paint').cyl(0.3, 1.08, 0, 0.03, 0.09, 0.14, 18, { collide: false, rot: [0, 0, 0.7] });
}

export function filingCabinet(L, { open = true } = {}) {
  const P = K(L, 'iron');
  P.box(0, 0.7, 0, 0.47, 1.4, 0.62);
  for (let k = 0; k < 4; k++) {
    const o = open && k === 1 ? 0.38 : 0;
    P.box(0, 0.2 + k * 0.33, 0.31 + o, 0.43, 0.3, 0.02, { collide: false });
    K(L, 'bplastic').box(0, 0.28 + k * 0.33, 0.33 + o, 0.12, 0.02, 0.02, { collide: false });
    if (o) {
      P.box(-0.205, 0.2 + k * 0.33, 0.31 + o / 2 - 0.02, 0.01, 0.26, o, { collide: false });
      P.box(0.205, 0.2 + k * 0.33, 0.31 + o / 2 - 0.02, 0.01, 0.26, o, { collide: false });
      for (let f = 0; f < 8; f++) K(L, 'cardboard').box(0, 0.25 + k * 0.33, 0.35 + f * 0.04, 0.38, 0.22, 0.01, { collide: false, rot: [0.1 * Math.sin(f), 0, 0] });
    }
  }
  if (open) papers(L, 12, 0.6, 0.6);
}

export function pallet(L) {
  const W = K(L, 'planks');
  for (let k = 0; k < 7; k++) W.box(-0.5 + k * 0.166, 0.13, 0, 0.12, 0.022, 1.2);
  for (const z of [-0.5, 0, 0.5]) W.box(0, 0.06, z, 1.1, 0.1, 0.1, { collide: false });
}

export function boards(L, w, h) {
  // planks nailed across a doorway
  const W = K(L, 'planks');
  for (let k = 0; k < 5; k++) {
    const y = 0.35 + k * (h - 0.5) / 4 + (Math.random() - 0.5) * 0.1;
    W.box(0, y, 0.08, w + 0.3, 0.14, 0.03, { collide: false, rot: [0, 0, (Math.random() - 0.5) * 0.35] });
  }
}

// a few lumpy rock shapes, reused
const ROCKS = [];
function rock() {
  if (ROCKS.length < 8) {
    const seed = ROCKS.length * 7.3;
    ROCKS.push(sculpt(new THREE.IcosahedronGeometry(1, 2), (v, n) => {
      const d = 0.75 + fbm(n.x * 2 + seed, n.y * 2, n.z * 2, 3) * 0.6;
      // fractured flat faces
      const f = Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z));
      v.copy(n).multiplyScalar(d * (0.85 + f * 0.25));
    }));
  }
  return ROCKS[Math.floor(Math.random() * ROCKS.length)];
}

export function rubble(L, n = 26, rx = 0.8, rz = 0.8) {
  // broken concrete and brick: irregular chunks heaped toward the middle, a few slabs
  for (let k = 0; k < n; k++) {
    const s = 0.05 + Math.random() * 0.2;
    const key = Math.random() < 0.35 ? 'brick' : Math.random() < 0.5 ? 'w_concrete' : 'conc2';
    const x = (Math.random() - 0.5) * 2 * rx, z = (Math.random() - 0.5) * 2 * rz;
    const r = Math.max(0, 1 - Math.hypot(x / rx, z / rz));
    const g = rock().clone().scale(s, s, s);
    K(L, key).geo(g, x, s * 0.45 + r * 0.22, z, { collide: false, rot: [Math.random() * 3, Math.random() * 3, Math.random() * 3], scale: [1 + Math.random(), 0.45 + Math.random() * 0.4, 0.8 + Math.random() * 0.6] });
  }
  for (let k = 0; k < 3; k++) K(L, 'w_concrete').box((Math.random() - 0.5) * rx, 0.12, (Math.random() - 0.5) * rz, 0.5 + Math.random() * 0.4, 0.07, 0.4 + Math.random() * 0.3, { collide: false, rot: [Math.random() * 0.4, Math.random() * 3, Math.random() * 0.4] });
  // fine grit
  for (let k = 0; k < n; k++) K(L, 'conc2').geo(new THREE.TetrahedronGeometry(0.02 + Math.random() * 0.03), (Math.random() - 0.5) * 2.4 * rx, 0.015, (Math.random() - 0.5) * 2.4 * rz, { collide: false, edges: 0, rot: [Math.random() * 3, Math.random() * 3, 0] });
}

export function bucketMop(L) {
  K(L, 'plastic').cyl(0, 0.16, 0, 0.15, 0.12, 0.32, 20, { tint: 0x888888 });
  K(L, 'wood').cyl(0.1, 0.75, 0.05, 0.015, 0.015, 1.3, 8, { collide: false, rot: [0.25, 0, -0.2] });
  K(L, 'cloth').cyl(0, 0.14, 0, 0.12, 0.14, 0.12, 12, { collide: false });
}

export function screen(L, w = 1.6) {
  // folding hospital privacy screen
  const panels = 3;
  for (let k = 0; k < panels; k++) {
    const ang = (k % 2 ? 0.5 : -0.5);
    const x = (k - 1) * (w / panels) * 0.92;
    K(L, 'iron').box(x, 0.95, 0, w / panels, 1.7, 0.03, { rot: [0, ang, 0] });
    K(L, 'cloth').box(x, 1.0, 0, w / panels - 0.06, 1.4, 0.035, { collide: false, rot: [0, ang, 0] });
  }
}

export function armchair(L) {
  const Le = K(L, 'leather');
  Le.box(0, 0.25, 0, 0.8, 0.3, 0.75);
  Le.box(0, 0.45, 0.05, 0.62, 0.14, 0.6, { collide: false, rot: [0.05, 0, 0] });
  Le.box(0, 0.7, -0.32, 0.8, 0.6, 0.16, { collide: false, rot: [-0.12, 0, 0] });
  for (const s of [-1, 1]) Le.box(s * 0.36, 0.5, 0, 0.12, 0.3, 0.72, { collide: false });
}

export function couch(L) {
  const Le = K(L, 'leather');
  Le.box(0, 0.24, 0, 1.9, 0.3, 0.8);
  for (const x of [-0.45, 0.45]) Le.box(x, 0.45, 0.06, 0.88, 0.14, 0.62, { collide: false, rot: [0.04, 0, x * 0.05] });
  Le.box(0, 0.7, -0.33, 1.9, 0.6, 0.16, { collide: false, rot: [-0.1, 0, 0] });
  for (const s of [-1, 1]) Le.box(s * 0.9, 0.48, 0, 0.14, 0.32, 0.8, { collide: false });
  // torn cushion
  K(L, 'cloth').box(0.45, 0.53, 0.1, 0.3, 0.05, 0.25, { collide: false, rot: [0.3, 0.4, 0.2] });
}

export function valveWheel(L, r = 0.16) {
  const I = K(L, 'rust');
  I.geo(new THREE.TorusGeometry(r, 0.016, 8, 28), 0, 0, 0, { collide: false });
  for (let k = 0; k < 3; k++) I.box(0, 0, 0, 0.02, r * 2, 0.02, { collide: false, rot: [0, 0, (k / 3) * Math.PI] });
  I.cyl(0, 0, -0.08, 0.03, 0.03, 0.16, 10, { collide: false, rot: [Math.PI / 2, 0, 0] });
}

export function shower(L) {
  K(L, 'iron').cyl(0, 1.6, 0.05, 0.012, 0.012, 1.0, 8, { collide: false });
  K(L, 'iron').cyl(0, 2.1, 0.15, 0.06, 0.03, 0.04, 14, { collide: false, rot: [0.6, 0, 0] });
  K(L, 'iron').box(0, 0.01, 0.4, 0.12, 0.01, 0.12, { collide: false });
}

export function hangingWires(L, n = 4) {
  for (let k = 0; k < n; k++) {
    const x = (Math.random() - 0.5) * 0.6, z = (Math.random() - 0.5) * 0.6;
    const len = 0.25 + Math.random() * 0.35;
    K(L, 'rubber').cyl(x, -len / 2, z, 0.008, 0.008, len, 5, { collide: false, edges: 0, rot: [(Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4] });
  }
  K(L, 'c_office').box(0.2, -0.25, 0.1, 0.6, 0.02, 0.6, { collide: false, rot: [0.9, 0.2, 0.1] });
}

export function drain(L) {
  K(L, 'iron').cyl(0, 0.004, 0, 0.14, 0.14, 0.008, 20, { collide: false });
  for (let k = -3; k <= 3; k++) K(L, 'bplastic').box(k * 0.035, 0.009, 0, 0.012, 0.004, 0.22 - Math.abs(k) * 0.02, { collide: false, edges: 0 });
}
