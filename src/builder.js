// Accumulates static geometry (surfaces + edge lines) into merged meshes,
// and records XZ colliders for everything that blocks movement.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { echoPoints } from './echo.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// rounded surface for realism, sharp box kept for the edge lines
function smoothBox(sx, sy, sz) {
  const m = Math.min(sx, sy, sz);
  const sharp = new THREE.BoxGeometry(sx, sy, sz);
  if (m < 0.03) return { geo: sharp, lineGeo: sharp };
  return { geo: new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(0.028, m * 0.22)), lineGeo: sharp };
}
const cylSegs = (seg) => (seg <= 4 ? 6 : Math.max(seg, 22));

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _box = new THREE.Box3();

export class Builder {
  constructor() {
    this.surfaces = {}; // key -> geometries
    this.lines = {}; // key -> geometries
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
    if (edges && render) {
      const eg = new THREE.EdgesGeometry(lineGeo || geo, edges);
      eg.applyMatrix4(_m);
      (this.lines[lineKey || key] ||= []).push(eg);
    }
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
        this.colliders.push({ minX: _box.min.x, maxX: _box.max.x, minZ: _box.min.z, maxZ: _box.max.z });
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
      const g = mergeGeometries(this.surfaces[k], false);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, materials[k] || materials.prop);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    for (const k in this.lines) {
      const g = mergeGeometries(this.lines[k], false);
      const lm = lineMaterials[k] || lineMaterials.prop;
      const ls = new THREE.LineSegments(g, lm);
      ls.matrixAutoUpdate = false;
      group.add(ls);
      const pts = echoPoints(g, { tint: lm.uniforms.uTint.value, boost: lm.uniforms.uBoost.value });
      pts.matrixAutoUpdate = false;
      group.add(pts);
    }
    return group;
  }
}

// Build a single movable object (mesh + edges) – used for items and doors.
export function makeObject(parts, material, lineMaterial) {
  const group = new THREE.Group();
  for (const p of parts) {
    const mesh = new THREE.Mesh(p.geo, material);
    if (p.pos) mesh.position.set(...p.pos);
    if (p.rot) mesh.rotation.set(...p.rot);
    if (p.scale) mesh.scale.set(...p.scale);
    const ls = new THREE.LineSegments(new THREE.EdgesGeometry(p.geo, 28), lineMaterial);
    mesh.add(ls);
    group.add(mesh);
  }
  return group;
}
