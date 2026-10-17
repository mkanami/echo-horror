import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player.js';
import { Level, FLOOR } from '../src/level.js';
import { Monster } from '../src/monster.js';
import { findTripObstacle } from '../src/trip-obstacle.js';
import { legKnee } from '../src/legs.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const low = () => ({ minX: 4, maxX: 5, minZ: 5, maxZ: 5.5, minY: 0, maxY: 0.4 });
function fixture({ boxes = [low()], psychosis = 1 } = {}) {
  const level = Object.assign(Object.create(Level.prototype), {
    colliders: boxes, doors: [], NW: 256, navS: 0.25,
    open: (x, z) => x >= 0 && z >= 0 && x < 64 && z < 56,
    ceilAt: () => 3, floorAt: () => FLOOR.TILE,
  });
  level.buildCollision();
  const sounds = [], impacts = [], hints = [];
  const audio = { step() {}, breath() {}, click() {}, gasp() {}, bodyFall: (...a) => impacts.push(a) };
  const game = { state: 'play', psychosis, noise: (p, o) => sounds.push({ p, ...o }), hint: (...a) => hints.push(a) };
  const p = new Player(new THREE.PerspectiveCamera(), level, audio, game);
  p.reset(V(4.5, 0, 7), 0);
  const advance = (seconds, fps = 60) => { for (let n = Math.round(seconds * fps); n > 0; n--) p.update(1 / fps); };
  const sprint = () => { p.keys.add('KeyW'); p.keys.add('ShiftLeft'); };
  return { p, level, game, sounds, impacts, hints, advance, sprint };
}

test('only frontal contact with a low grounded prop is a trip obstacle', () => {
  const { level } = fixture();
  assert.ok(findTripObstacle(level, V(4.5, 0, 5.84), V(4.5, 0, 5.76)));
  assert.equal(findTripObstacle(level, V(4.5, 0, 5.84), V(4.5, 0, 5.92)), null);
  assert.equal(findTripObstacle(level, V(5.5, 0, 5.84), V(5.5, 0, 5.76)), null);
  assert.equal(findTripObstacle(level, V(4.4, 0, 5.8), V(4.5, 0, 5.8)), null);
  for (const box of [{ ...low(), maxY: 2 }, { ...low(), minY: 1, maxY: 1.2 }]) {
    const f = fixture({ boxes: [box] });
    assert.equal(findTripObstacle(f.level, V(4.5, 0, 5.84), V(4.5, 0, 5.76)), null);
  }
});

test('a cupboard plinth with a solid body above it is not a low obstacle', () => {
  const { level } = fixture({ boxes: [low(), { ...low(), minY: 0.4, maxY: 1.8 }] });
  assert.equal(findTripObstacle(level, V(4.5, 0, 5.84), V(4.5, 0, 5.76)), null);
});

test('psychotic sprint into a low obstacle falls, collides safely, and emits one impact', () => {
  const f = fixture(); f.sprint(); f.advance(0.4);
  assert.equal(f.p.falls, 1); assert.ok(f.p.fallT > 0); assert.equal(f.p.running, false);
  f.advance(0.55);
  assert.ok(f.p.camera.position.y < 0.8);
  assert.ok(f.p.pos.z >= 5.8 - 1e-6);
  assert.equal(f.impacts.length, 1);
  assert.equal(f.sounds.filter(s => s.kind === 'fall').length, 1);
  assert.ok(f.sounds.find(s => s.kind === 'fall').radius > 9);
  const clicks = f.sounds.filter(s => s.kind === 'click').length;
  f.p.click(); assert.equal(f.sounds.filter(s => s.kind === 'click').length, clicks);
  f.p.stones = 1; f.p.throwStone(new THREE.Scene()); assert.equal(f.p.stones, 1);
  f.advance(2.2);
  assert.equal(f.p.fallT, 0); assert.ok(f.p.camera.position.y > 1.55);
  f.advance(6); assert.equal(f.p.falls, 1); // holding Shift into the same prop cannot chain falls
});

for (const mode of ['calm sprint', 'walk', 'crouch', 'frozen', 'low psychosis']) test(`${mode} does not trip at the same obstacle`, () => {
  const f = fixture({ psychosis: mode === 'calm sprint' ? 0 : mode === 'low psychosis' ? 0.4 : 1 });
  f.sprint();
  if (mode === 'walk') f.p.keys.delete('ShiftLeft');
  if (mode === 'crouch') f.p.crouch = true;
  if (mode === 'frozen') f.p.frozen = true;
  f.advance(3); assert.equal(f.p.falls, 0);
});

test('open ground and sharp turns never produce random falls', () => {
  const f = fixture({ boxes: [] }); f.sprint();
  for (let i = 0; i < 600; i++) { f.p.yaw += 0.05; f.advance(1 / 60); }
  assert.equal(f.p.falls, 0);
});

test('standing against a low prop and pressing sprint does not count as a running collision', () => {
  const f = fixture(); f.p.reset(V(4.5, 0, 5.8), 0); f.sprint(); f.advance(3);
  assert.equal(f.p.falls, 0);
});

for (const fps of [30, 60, 144]) test(`physical trip and recovery work at ${fps} fps`, () => {
  const f = fixture(); f.sprint(); f.advance(0.7, fps);
  assert.equal(f.p.falls, 1); assert.equal(f.impacts.length, 1);
  f.advance(3, fps); assert.equal(f.p.fallT, 0);
});

test('reset clears a fall, its low camera and its impact deadline', () => {
  const f = fixture(); f.sprint(); f.advance(0.4); f.p.reset(V(10, 0, 10), 0);
  f.p.keys.clear(); f.advance(1);
  assert.equal(f.p.fallT, 0); assert.equal(f.p.fallK, 0); assert.equal(f.p.tripCooldown, 0);
  assert.ok(f.p.camera.position.y > 1.5); assert.equal(f.impacts.length, 0);
});

test('a fall pitches the face toward the floor even when looking up', () => {
  const f = fixture(); f.p.pitch = 1.2; f.sprint(); f.advance(0.85);
  const direction = f.p.camera.getWorldDirection(new THREE.Vector3());
  assert.ok(direction.y < -0.9);
  assert.ok(f.p.camera.position.y < 0.5);
  assert.ok(f.p.camera.position.z < f.p.pos.z - 0.07);
});

test('the actual fall noise makes a nearby creature pursue the player', () => {
  const f = fixture(); f.sprint(); f.advance(0.8);
  const sound = f.sounds.find(s => s.kind === 'fall');
  const m = Object.assign(Object.create(Monster.prototype), { state: 'wander', pos: V(4.5, 0, 13.8), headWorld: V(4.5, 2, 13.8), suspicion: 0, assist: { hear: 1, speed: 1 }, level: { occlusion: () => 0 }, audio: { monsterRoar() {}, stinger() {} } });
  m.hear(sound.p, sound.radius, sound.source, sound.kind, f.p.pos);
  assert.equal(m.state, 'chase');
});

test('leg IK retains segment lengths in standing, crouching and fallen poses', () => {
  for (const [height, z] of [[0.91, 0], [0.58, -0.1], [0.22, 0.92]]) {
    const hip = V(0.12, height, 0.07), ankle = V(0.14, 0.11, z), knee = legKnee(hip, ankle);
    assert.ok(Math.abs(hip.distanceTo(knee) - 0.43) < 1e-6);
    assert.ok(Math.abs(ankle.distanceTo(knee) - 0.43) < 1e-6);
    assert.ok(knee.y >= 0.1);
  }
});
