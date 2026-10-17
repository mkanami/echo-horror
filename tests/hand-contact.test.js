import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HandContact } from '../src/hand-contact.js';
import { HandRig } from '../src/hand-rig.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function fixture({ wall = () => false, props = [], doors = [] } = {}) {
  const hash = Array.from({ length: 64 * 56 }, () => []);
  for (const p of props) for (let z = Math.floor(p.minZ); z <= Math.floor(p.maxZ); z++) {
    for (let x = Math.floor(p.minX); x <= Math.floor(p.maxX); x++) hash[z * 64 + x].push(p);
  }
  const level = { NW: 256, navS: 0.25, hash, doors, open: (x, z) => x >= 0 && x < 64 && z >= 0 && z < 56 && !wall(x, z) };
  return new HandContact(level);
}

test('a flat wall supplies a stable outward normal and flat palm', () => {
  const solver = fixture({ wall: (x, z) => z < 3 });
  const hit = solver.sample({ position: V(6.5, 1.65, 3.55) }, { yaw: 0 });
  assert.equal(hit.type, 'wall');
  assert.deepEqual(hit.normal.toArray(), [0, 0, 1]);
  assert.equal(hit.point.z, 3);
});

test('grid seams do not masquerade as physical corners', () => {
  const solver = fixture({ wall: (x, z) => z < 3 });
  const hit = solver.sample({ position: V(7.02, 1.65, 3.55) }, { yaw: 0 });
  assert.equal(hit.type, 'wall');
});

test('a true wall edge turns the fingers around the corner', () => {
  const solver = fixture({ wall: (x, z) => x >= 6 && z < 3 });
  const hit = solver.sample({ position: V(6.11, 1.65, 3.55) }, { yaw: 0 });
  assert.equal(hit.type, 'edge');
  assert.deepEqual(hit.fingers.toArray(), [-1, 0, 0]);
});

test('prop height distinguishes resting on a top from touching its front', () => {
  const solver = fixture({ props: [{ minX: 6, maxX: 7, minY: 0, maxY: 1.2, minZ: 3, maxZ: 4 }] });
  const top = solver.sample({ position: V(6.5, 1.65, 4.55) }, { yaw: 0 });
  assert.equal(top.type, 'support');
  assert.deepEqual(top.normal.toArray(), [0, 1, 0]);
  assert.equal(top.point.y, 1.2);
});

test('opening a dynamic door releases contact, and finger pads are projected out', () => {
  const door = { id: 'shA', box: { minX: 6, maxX: 7, minZ: 3, maxZ: 3.1 } };
  const solver = fixture({ doors: [door] });
  assert.equal(solver.sample({ position: V(6.5, 1.65, 3.55) }, { yaw: 0 }).doorId, 'shA');
  const point = V(6.5, 1.3, 3.095);
  const corrected = point.clone().add(solver.pushOut(point));
  assert.ok(corrected.z >= 3.112 - 1e-8);
  door.box = null;
  assert.equal(solver.sample({ position: V(6.5, 1.65, 3.55) }, { yaw: 0 }), null);
});

test('articulated hand has valid weights, smooth joints and distinct contact poses', () => {
  const rig = new HandRig(new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial());
  const w = rig.mesh.geometry.attributes.skinWeight;
  for (let i = 0; i < w.count; i++) {
    const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
    assert.ok(Math.abs(sum - 1) < 1e-5);
  }
  rig.setPose('flat', 1);
  const open = rig.digits[0][1].quaternion.clone();
  rig.setPose('edge', 1 / 60);
  assert.ok(open.angleTo(rig.digits[0][1].quaternion) > 0);
  assert.ok(open.angleTo(rig.digits[0][1].quaternion) < 0.4);
  rig.setPose('edge', 1);
  assert.ok(open.angleTo(rig.digits[0][1].quaternion) > 0.7);
  rig.mesh.updateMatrixWorld(true);
  rig.skeleton.update();
  const point = new THREE.Vector3();
  for (let i = 0; i < rig.mesh.geometry.attributes.position.count; i += 101) {
    rig.mesh.getVertexPosition(i, point);
    assert.ok(point.toArray().every(Number.isFinite));
  }
});
