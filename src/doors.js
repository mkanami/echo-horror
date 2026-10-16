// Door models: panelled wooden doors with wired-glass windows, heavy riveted
// airlock leaves, steel lift doors. Each leaf pivots on its hinge edge.
import * as THREE from 'three';

function part(group, geo, mat, lmat, pos, rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (lmat) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), lmat));
  group.add(m);
  return m;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// returns { pivot, handle }: pivot at hinge (x=0), leaf spans +x, front face +z
export function woodLeaf(M, L, w = 0.9, h = 2.05, { window = true, plaque = true, mat = 'pwood' } = {}) {
  const pivot = new THREE.Group();
  const leaf = new THREE.Group();
  leaf.position.x = w / 2;
  pivot.add(leaf);
  const t = 0.045;
  part(leaf, B(w, h, t), M[mat], L, [0, h / 2, 0]);
  // raised panels front and back
  for (const z of [t / 2 + 0.006, -t / 2 - 0.006]) {
    part(leaf, B(w - 0.2, h * 0.32, 0.012), M[mat], L, [0, h * 0.25, z]);
    if (!window) part(leaf, B(w - 0.2, h * 0.3, 0.012), M[mat], L, [0, h * 0.68, z]);
  }
  if (window) {
    // wired glass window in a steel frame
    const ww = w * 0.5, wh = h * 0.28;
    part(leaf, B(ww + 0.06, wh + 0.06, t + 0.02), M.iron, L, [0, h * 0.7, 0]);
    part(leaf, B(ww, wh, t + 0.024), M.glassDark, null, [0, h * 0.7, 0]);
    for (let k = 1; k < 5; k++) part(leaf, B(0.004, wh, 0.003), M.iron, null, [-ww / 2 + (ww / 5) * k, h * 0.7, t / 2 + 0.013]);
    for (let k = 1; k < 4; k++) part(leaf, B(ww, 0.004, 0.003), M.iron, null, [0, h * 0.7 - wh / 2 + (wh / 4) * k, t / 2 + 0.013]);
  }
  // kick plate
  part(leaf, B(w - 0.06, 0.22, 0.004), M.iron, null, [0, 0.13, t / 2 + 0.003]);
  // lever handles both sides
  const handle = new THREE.Group();
  handle.position.set(w / 2 - 0.09, 1.0, 0);
  leaf.add(handle);
  for (const s of [1, -1]) {
    part(handle, B(0.05, 0.16, 0.012), M.iron, L, [0, -0.02, s * (t / 2 + 0.008)]);
    part(handle, new THREE.CylinderGeometry(0.009, 0.009, 0.12, 10), M.iron, L, [-0.06, 0.02, s * (t / 2 + 0.04)], [0, 0, Math.PI / 2]);
    part(handle, new THREE.CylinderGeometry(0.01, 0.01, 0.03, 10), M.iron, null, [0, 0.02, s * (t / 2 + 0.022)], [Math.PI / 2, 0, 0]);
  }
  if (plaque) part(leaf, B(0.16, 0.07, 0.004), M.paperw, null, [0, h * 0.88, t / 2 + 0.004]);
  // hinges
  for (const y of [0.25, h - 0.25]) part(pivot, new THREE.CylinderGeometry(0.012, 0.012, 0.11, 8), M.iron, null, [0, y, t / 2]);
  return { pivot, handle, leaf };
}

export function steelLeaf(M, L, w = 1.0, h = 2.5) {
  const pivot = new THREE.Group();
  const leaf = new THREE.Group();
  leaf.position.x = w / 2;
  pivot.add(leaf);
  const t = 0.09;
  part(leaf, B(w, h, t), M.plates, L, [0, h / 2, 0]);
  // stiffening ribs and rivets
  for (const z of [t / 2 + 0.012, -t / 2 - 0.012]) {
    for (const y of [0.4, h / 2, h - 0.4]) part(leaf, B(w - 0.08, 0.07, 0.024), M.iron, L, [0, y, z]);
    part(leaf, B(0.07, h - 0.2, 0.024), M.iron, L, [-w / 2 + 0.06, h / 2, z]);
    for (let k = 0; k < 6; k++) part(leaf, new THREE.SphereGeometry(0.012, 8, 6), M.iron, null, [-w / 2 + 0.12 + k * ((w - 0.24) / 5), 0.4, z + Math.sign(z) * 0.012]);
  }
  // porthole
  part(leaf, new THREE.CylinderGeometry(0.13, 0.13, t + 0.05, 24), M.iron, L, [0.05, h * 0.68, 0], [Math.PI / 2, 0, 0]);
  part(leaf, new THREE.CylinderGeometry(0.1, 0.1, t + 0.056, 24), M.glassDark, null, [0.05, h * 0.68, 0], [Math.PI / 2, 0, 0]);
  // lever bar
  const handle = new THREE.Group();
  handle.position.set(w / 2 - 0.12, 1.1, 0);
  leaf.add(handle);
  for (const s of [1, -1]) {
    part(handle, B(0.06, 0.3, 0.02), M.iron, L, [0, 0, s * (t / 2 + 0.012)]);
    part(handle, new THREE.CylinderGeometry(0.016, 0.016, 0.26, 10), M.iron, L, [0, 0, s * (t / 2 + 0.06)], [0, 0, 0]);
  }
  return { pivot, handle, leaf };
}

export function liftLeaf(M, L, w = 1.5, h = 2.4) {
  const g = new THREE.Group();
  part(g, B(w, h, 0.06), M.iron, L, [0, 0, 0]);
  part(g, B(w - 0.08, h - 0.08, 0.004), M.plates, null, [0, 0, 0.032]);
  part(g, B(0.01, h, 0.01), M.rubber, null, [w / 2, 0, 0.03]);
  return g;
}

// architrave around a doorway on a wall; group local: x along wall, +z out of wall
export function doorFrame(M, L, w, h, mat = 'pwood') {
  const g = new THREE.Group();
  const d = 0.06;
  part(g, B(0.09, h + 0.09, d), M[mat], L, [-w / 2 - 0.045, (h + 0.09) / 2, d / 2]);
  part(g, B(0.09, h + 0.09, d), M[mat], L, [w / 2 + 0.045, (h + 0.09) / 2, d / 2]);
  part(g, B(w + 0.18, 0.09, d), M[mat], L, [0, h + 0.045, d / 2]);
  // dark recess behind the leaf
  part(g, B(w, h, 0.02), M.void, null, [0, h / 2, 0.005]);
  return g;
}

export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
