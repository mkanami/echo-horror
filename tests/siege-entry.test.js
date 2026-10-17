import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Siege } from '../src/siege.js';
import { Monster } from '../src/monster.js';
import { Level } from '../src/level.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);
const approaches = { A: V(14.1, 8.5), B: V(7.5, 14.35), C: V(2.9,8.5) };

function encounter(route = 'A', { missingPath = false } = {}) {
  const shutters = {
    A: { closed: false, t: 0, speed: 0.9, box: { minX: 12.92, maxX: 13.02, minZ: 7, maxZ: 10 } },
    B: { closed: false, t: 0, speed: 1.3, box: { minX: 7, maxX: 8, minZ: 12.9, maxZ: 13.02 } },
    C: { closed:false,t:0,speed:.9,box:{minX:3.98,maxX:4.08,minZ:7,maxZ:10} },
  };
  const level = {
    findPath: (from, to) => missingPath ? null : [from.clone(), to.clone()],
    setShutter: (which, closed) => { shutters[which].closed = closed; },
    collide(pos, radius) {
      for (const d of Object.values(shutters)) {
        if (d.t <= 0.85) continue;
        const b = d.box;
        Level.prototype._push.call(this, pos, radius, b.minX, b.maxX, b.minZ, b.maxZ);
      }
    },
  };
  const audio = { play() {}, monsterRoar() {}, stinger() {}, crash() {} };
  const monster = Object.assign(Object.create(Monster.prototype), {
    pos: V(36, 11), headWorld: V(36, 11), level, audio, suspicion: 0,
    stateT: 0, yaw: 0, curSpeed: 0,
    spawn(pos, state) { this.pos.copy(pos); this.state = state; this.path = null; },
  });
  const player = { pos: V(9, 6), keys: new Set() };
  const siege = new Siege({ level, monster, audio, player,
    game: { hint() {}, onLiftArrived() {} }, ui: { show() {}, update() {} },
  });
  siege.start();
  siege.go(route);
  monster.pos.copy(approaches[route]);
  const step = (seconds, check = () => {}) => {
    for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 1 / 60) {
      monster.speed = monster.state === 'scripted' ? monster.scriptSpeed : 0;
      monster.move(1 / 60);
      for (const d of Object.values(shutters)) {
        const target = d.closed ? 1 : 0;
        d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), d.speed / 60);
      }
      siege.update(1 / 60);
      check();
    }
  };
  return { siege, monster, player, step };
}

test('elapsed entry time cannot declare a creature behind the wall to be inside', () => {
  const { siege, monster } = encounter();
  siege.enter();
  siege.update(3);
  assert.equal(siege.phase, 'squeeze');
  assert.equal(monster.state, 'scripted');
  assert.equal(siege.monsterInHall, false);
  assert.ok(monster.path.length > 0);
});

for (const route of ['A', 'B', 'C']) {
  test(`${route}: open entrance requires physical traversal before the hunt begins`, () => {
    const { siege, monster, step } = encounter(route);
    step(2.6, () => {
      if (siege.phase === 'inside') assert.equal(siege.monsterInHall, true);
      else assert.equal(monster.state, 'scripted');
    });
    assert.equal(siege.phase, 'inside');
    assert.equal(monster.state, 'chase');
  });

  test(`${route}: late closure interrupts traversal and leaves the creature outside`, () => {
    const { siege, monster, step } = encounter(route);
    step(0.5);
    assert.equal(siege.phase, 'squeeze');
    siege.toggle(route);
    step(2.5, () => assert.notEqual(siege.phase, 'inside'));
    assert.equal(siege.monsterInHall, false);
    assert.equal(siege.phase, 'ram');
    assert.equal(monster.state, 'scripted');
  });

  test(`${route}: closing after the creature has entered cannot put it outside again`, () => {
    const { siege, monster, step } = encounter(route);
    step(2.6);
    const inside = monster.pos.clone();
    siege.toggle(route);
    step(0.5);
    assert.equal(siege.phase, 'inside');
    assert.equal(siege.monsterInHall, true);
    assert.equal(monster.pos.distanceTo(inside), 0);
  });

  test(`${route}: closure while the body is in the doorway still permits retreat`, () => {
    const { siege, monster, step } = encounter(route);
    siege.enter();
    monster.pos.copy(route === 'A' ? V(12.72, 8.5) : route === 'C' ? V(4.28,8.5) : V(7.5, 12.62));
    siege.toggle(route);
    step(2.5, () => assert.notEqual(siege.phase, 'inside'));
    assert.equal(siege.monsterInHall, false);
    assert.equal(siege.phase, 'ram');
  });
}

test('an unavailable approach path retries without fabricating arrival', () => {
  const { siege, monster, step } = encounter('A', { missingPath: true });
  monster.pos.set(30, 0, 11);
  step(4);
  assert.equal(siege.phase, 'approach');
  assert.equal(siege.monsterInHall, false);
});

test('a broken shutter permits physical entry', () => {
  const { siege, step } = encounter();
  siege.toggle('A');
  siege.hp.A = 1;
  step(0.6);
  assert.equal(siege.shut.A, false);
  assert.equal(siege.phase, 'squeeze');
  assert.equal(siege.monsterInHall, false);
  step(2.5);
  assert.equal(siege.phase, 'inside');
});

test('path smoothing preserves the area the siege route must avoid', () => {
  const level = Object.assign(Object.create(Level.prototype), {
    navS: 1, NW: 24, NH: 24,
    nav: new Uint8Array(24 * 24).fill(1),
    navDist: new Float32Array(24 * 24).fill(1),
    avoid: { minX: 4, maxX: 13, minZ: 3, maxZ: 12.9 },
  });
  const path = level.findPath(V(15, 8), V(7, 15));
  assert.ok(path?.length > 2);
  for (let i = 1; i < path.length; i++) {
    for (let t = 0; t <= 1; t += 0.01) {
      const p = path[i - 1].clone().lerp(path[i], t);
      assert.ok(!(p.x >= 4 && p.x < 13 && p.z >= 3 && p.z < 13));
    }
  }
});
