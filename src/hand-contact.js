import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// Uses the level's collision hash, including real prop heights and current door
// colliders. No full-scene triangle raycasts in the per-frame hand animation.
export class HandContact {
  constructor(level) {
    this.level = level;
    this.boxes = [];
    this.cached = new WeakMap();
    this.walls = new Map();
    this.ray = new THREE.Ray();
    this.last = null;
  }

  collect(position) {
    const L = this.level, seen = new Set();
    this.boxes.length = 0;
    for (let z = Math.floor(position.z) - 2; z <= Math.floor(position.z) + 2; z++) {
      for (let x = Math.floor(position.x) - 2; x <= Math.floor(position.x) + 2; x++) {
        if (!L.open(x, z)) {
          const key = `${x},${z}`;
          if (!this.walls.has(key)) this.walls.set(key, new THREE.Box3(V(x, -0.1, z), V(x + 1, 7, z + 1)));
          this.boxes.push(this.walls.get(key));
        } else {
          const bucket = L.hash?.[z * (L.NW * L.navS || 64) + x] || [];
          for (const c of bucket) {
            if (seen.has(c)) continue;
            seen.add(c);
            if (!this.cached.has(c)) this.cached.set(c, new THREE.Box3(V(c.minX, c.minY ?? 0, c.minZ), V(c.maxX, c.maxY ?? 1.5, c.maxZ)));
            this.boxes.push(this.cached.get(c));
          }
        }
      }
    }
    for (const d of L.doors || []) {
      if (!d.box) continue;
      const b = d.box;
      const box = new THREE.Box3(V(b.minX, 0, b.minZ), V(b.maxX, d.id === 'shB' ? 0.95 : 2.8, b.maxZ));
      box.doorId = d.id;
      this.boxes.push(box);
    }
  }

  cast(origin, direction, reach = 0.8) {
    this.ray.set(origin, direction);
    let best = null;
    const p = new THREE.Vector3();
    for (const box of this.boxes) {
      if (box.containsPoint(origin) || !this.ray.intersectBox(box, p)) continue;
      const distance = p.distanceTo(origin);
      if (distance > reach || (best && distance >= best.distance)) continue;
      const faces = [
        [Math.abs(p.x - box.min.x), V(-1, 0, 0)], [Math.abs(p.x - box.max.x), V(1, 0, 0)],
        [Math.abs(p.y - box.min.y), V(0, -1, 0)], [Math.abs(p.y - box.max.y), UP.clone()],
        [Math.abs(p.z - box.min.z), V(0, 0, -1)], [Math.abs(p.z - box.max.z), V(0, 0, 1)],
      ];
      faces.sort((a, b) => a[0] - b[0]);
      const normal = faces[0][1];
      if (normal.dot(direction) > -0.1 || normal.y < -0.5) continue;
      best = { point: p.clone(), normal, distance, box, doorId: box.doorId };
    }
    return best;
  }

  edge(hit) {
    if (hit.normal.y > 0.5) return null;
    const { point: p, normal: n, box: b } = hit;
    const axis = Math.abs(n.x) > 0.5 ? 'z' : 'x';
    const candidates = [
      { distance: p[axis] - b.min[axis], direction: V(axis === 'x' ? -1 : 0, 0, axis === 'z' ? -1 : 0) },
      { distance: b.max[axis] - p[axis], direction: V(axis === 'x' ? 1 : 0, 0, axis === 'z' ? 1 : 0) },
      { distance: b.max.y - p.y, direction: UP.clone() },
    ].filter(e => e.distance >= 0 && e.distance < 0.11).sort((a, b) => a.distance - b.distance);
    for (const e of candidates) {
      const edge = p.clone().addScaledVector(e.direction, e.distance);
      const beyond = edge.clone().addScaledVector(e.direction, 0.035).addScaledVector(n, -0.035);
      // Adjacent solid wall cells form one surface, not a new edge every metre.
      if (this.boxes.some(box => box.containsPoint(beyond))) continue;
      return { point: edge, direction: e.direction };
    }
    return null;
  }

  sample(camera, player) {
    this.collect(camera.position);
    const rotation = new THREE.Quaternion().setFromAxisAngle(UP, player.yaw);
    const origin = V(-0.04, -0.27, -0.14).applyQuaternion(rotation).add(camera.position);
    let best = null, score = Infinity;
    for (const angle of [-55, -30, 0, 25, 50]) {
      for (const down of [0, -0.42]) {
        const a = angle * Math.PI / 180;
        const direction = V(Math.sin(a), down, -Math.cos(a)).normalize().applyQuaternion(rotation);
        const hit = this.cast(origin, direction, this.last ? 0.82 : 0.7);
        if (!hit) continue;
        const local = hit.point.clone().sub(camera.position).applyQuaternion(rotation.clone().invert());
        // The free left arm reaches left/forward. A surface on the far right
        // would drag its elbow across the face and through the cane hand.
        if (local.x > 0.16 || local.distanceTo(V(-0.2, -0.3, 0)) > 0.76) continue;
        const s = hit.distance + Math.abs(angle) * 0.001 + (down ? 0.045 : 0) - (this.last && hit.normal.dot(this.last.normal) > 0.95 ? 0.04 : 0);
        if (s < score) { score = s; best = hit; }
      }
    }
    const forward = V(0, 0, -1).applyQuaternion(rotation);
    this.forwardDistance = this.cast(camera.position, forward, 1.4)?.distance ?? 9;
    if (best) {
      const edge = this.edge(best);
      best.pose = edge ? 'edge' : 'flat';
      best.fingers = edge ? edge.direction : best.normal.y > 0.5 ? forward.clone().addScaledVector(best.normal, -forward.dot(best.normal)).normalize() : UP.clone();
      if (edge) best.point.copy(edge.point).addScaledVector(best.fingers, -0.035);
      best.type = edge ? 'edge' : best.normal.y > 0.5 ? 'support' : 'wall';
    }
    this.last = best;
    return best;
  }

  // Sphere/box projection for finger pads during the approach/release blend.
  pushOut(point, radius = 0.012) {
    const correction = V(0, 0, 0), p = point.clone(), closest = new THREE.Vector3();
    for (const box of this.boxes) {
      box.clampPoint(p, closest);
      const delta = p.clone().sub(closest), distance = delta.length();
      if (distance >= radius) continue;
      if (distance > 1e-6) p.addScaledVector(delta, (radius - distance) / distance);
      else {
        const sides = [
          [p.x - box.min.x, 'x', box.min.x - radius], [box.max.x - p.x, 'x', box.max.x + radius],
          [p.y - box.min.y, 'y', box.min.y - radius], [box.max.y - p.y, 'y', box.max.y + radius],
          [p.z - box.min.z, 'z', box.min.z - radius], [box.max.z - p.z, 'z', box.max.z + radius],
        ].sort((a, b) => a[0] - b[0]);
        p[sides[0][1]] = sides[0][2];
      }
    }
    return correction.copy(p).sub(point);
  }
}
