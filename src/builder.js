// Accumulates static surfaces into spatially batched meshes,
// and records XZ colliders for everything that blocks movement.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { spatialBatches } from './render-batches.js';

// Rounded surfaces retain the same silhouette without allocating disabled lines.
function smoothBox(sx, sy, sz) {
  const m = Math.min(sx, sy, sz);
  if (m < 0.03) return { geo: new THREE.BoxGeometry(sx, sy, sz) };
  return { geo: new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(0.028, m * 0.22)) };
}
const cylSegs = (seg) => (seg <= 4 ? 6 : Math.max(seg, 22));

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _box = new THREE.Box3();

export class Builder {
  constructor() {
    this.surfaces = {}; // key -> geometries
    this.colliders = [];
  }

  add(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], collide = true, key = 'prop', edges = 28, lineKey = null, parent = null, render = true, lineGeo = null, walk = false } = {}) {
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(...pos), _q, new THREE.Vector3(...scale));
    if (parent) _m.premultiply(parent);
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(_m);
    if (render) (this.surfaces[key] ||= []).push(g);
    if (!collide && render && !walk) {
      // anything solid-looking at body height blocks movement unless marked walk-through
      g.computeBoundingBox();
      const b = g.boundingBox;
      const foot = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
      if (b.min.y < 1.85 && b.max.y > 0.3 && foot > 0.12) collide = true;
    }
    if (collide) {
      g.computeBoundingBox();
      _box.copy(g.boundingBox);
      if (_box.min.y < 1.5 && _box.max.y > 0.15) {
        this.colliders.push({ minX: _box.min.x, maxX: _box.max.x, minY: _box.min.y, maxY: _box.max.y, minZ: _box.min.z, maxZ: _box.max.z });
      }
    }
    return g;
  }

  box(x, y, z, sx, sy, sz, o = {}) {
    if (o.render === false) return this.add(new THREE.BoxGeometry(sx, sy, sz), { ...o, pos: [x, y, z] });
    const b = smoothBox(sx, sy, sz);
    return this.add(b.geo, { ...o, lineGeo: b.lineGeo, pos: [x, y, z] });
  }

  cyl(x, y, z, rt, rb, h, seg = 8, o = {}) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, cylSegs(seg)), { ...o, pos: [x, y, z] });
  }

  // horizontal pipe between two points at height y
  pipe(x1, z1, x2, z2, y, r = 0.08, o = {}) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const g = new THREE.CylinderGeometry(r, r, len, 18);
    g.rotateZ(Math.PI / 2);
    const ang = Math.atan2(-dz, dx);
    return this.add(g, { key: 'rust', ...o, pos: [(x1 + x2) / 2, y, (z1 + z2) / 2], rot: [0, ang, 0], collide: false });
  }

  // local frame: returns helpers whose coordinates are relative to (ox,oy,oz) rotated by ry
  at(ox, oy, oz, ry = 0) {
    const parent = new THREE.Matrix4().makeRotationY(ry).setPosition(ox, oy, oz);
    const B = this;
    return {
      box: (x, y, z, sx, sy, sz, o = {}) => {
        if (o.render === false) return B.add(new THREE.BoxGeometry(sx, sy, sz), { ...o, pos: [x, y, z], parent });
        const b = smoothBox(sx, sy, sz);
        return B.add(b.geo, { ...o, lineGeo: b.lineGeo, pos: [x, y, z], parent });
      },
      cyl: (x, y, z, rt, rb, h, seg = 8, o = {}) => B.add(new THREE.CylinderGeometry(rt, rb, h, cylSegs(seg)), { ...o, pos: [x, y, z], parent }),
      geo: (g, x, y, z, o = {}) => B.add(g, { ...o, pos: [x, y, z], parent }),
    };
  }

  build(materials, lineMaterials) {
    const group = new THREE.Group();
    for (const k in this.surfaces) {
      for (const g of spatialBatches(this.surfaces[k])) {
        const mesh = new THREE.Mesh(g, materials[k] || materials.prop);
        mesh.matrixAutoUpdate = false;
        mesh.userData.staticBatch = true;
        group.add(mesh);
      }
      this.surfaces[k].forEach(g => g.dispose());
    }
    return group;
  }
}

// Bake same-material parts into one draw, retaining the movable parent group.
export function makeObject(parts, material, lineMaterial) {
  const group = new THREE.Group();
  const surfaces = [];
  for (const p of parts) {
    const mesh = new THREE.Mesh(p.geo, material);
    if (p.pos) mesh.position.set(...p.pos);
    if (p.rot) mesh.rotation.set(...p.rot);
    if (p.scale) mesh.scale.set(...p.scale);
    mesh.updateMatrix();
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(mesh.matrix);
    surfaces.push(g);
  }
  const g = mergeGeometries(surfaces,false);
  surfaces.forEach(g=>g.dispose());
  group.add(new THREE.Mesh(g,material));
  return group;
}
