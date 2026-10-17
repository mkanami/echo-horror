import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player.js';
import { Monster } from '../src/monster.js';

// Exercise the real tap -> hearing -> navigation chain without rendering a body.
function encounter({ distance = 20, occlusion = 0, state = 'wander' } = {}) {
  const level = {
    occlusion: () => occlusion,
    findPath: (from, to) => [from.clone(), to.clone()],
    collide() {},
    ceilAt: () => 3,
  };
  const audio = { click() {}, breath() {}, monsterRoar() {}, stinger() {} };
  const monster = Object.assign(Object.create(Monster.prototype), {
    level, audio, state, pos: new THREE.Vector3(distance, 0, 0),
    headWorld: new THREE.Vector3(distance, 2, 0),
    assist: { hear: 1, speed: 1 }, suspicion: 0, stateT: 0, yaw: 0,
  });
  const sounds = [];
  const game = {
    noise(pos, options) {
      sounds.push(options);
      monster.hear(pos, options.radius, options.source, options.kind, player.pos);
    },
  };
  const player = new Player(new THREE.PerspectiveCamera(), level, audio, game);
  const advance = (seconds) => {
    for (let remaining = seconds; remaining > 1e-8; remaining -= 1 / 60) {
      player.update(Math.min(remaining, 1 / 60));
    }
  };
  const tap = () => { player.click(); advance(0.6); };
  return { player, monster, sounds, advance, tap };
}

test('a lone tap leaves a distant creature unaware; repeated taps draw it toward the source', () => {
  const { player, monster, sounds, tap } = encounter();
  tap();
  assert.equal(monster.state, 'wander');
  tap();
  tap();
  tap();
  assert.equal(monster.state, 'hunt');
  assert.ok(monster.path.length > 0);
  assert.ok(monster.target.distanceTo(player.pos) < 3);
  const before = monster.pos.distanceTo(player.pos);
  monster.speed = 3.1;
  for (let i = 0; i < 120; i++) monster.move(1 / 60);
  assert.ok(monster.pos.distanceTo(player.pos) < before - 4);
  assert.ok(sounds.filter((s) => s.kind === 'click').every((s) => s.visual === 10));
});

test('a sustained rhythm is heard through heavy occlusion, with bounded reach', () => {
  const nearby = encounter({ distance: 17, occlusion: 1 });
  const far = encounter({ distance: 40 });
  for (let i = 0; i < 10; i++) { nearby.tap(); far.tap(); }
  assert.equal(nearby.monster.state, 'hunt');
  assert.equal(far.monster.state, 'wander');
  assert.equal(nearby.player.clickStreak, 5);
});

test('repeated taps break an ambush and trigger a close chase', () => {
  const { monster, tap } = encounter({ distance: 5, state: 'ambush' });
  tap();
  assert.equal(monster.state, 'ambush');
  tap();
  assert.equal(monster.state, 'chase');
});

test('cooldown and frozen input cannot build a rhythm without emitting taps', () => {
  const { player, sounds, advance } = encounter();
  player.click();
  for (let i = 0; i < 30; i++) player.click();
  assert.equal(player.clickStreak, 1);
  assert.equal(sounds.length, 1);
  advance(0.6);
  player.frozen = true;
  player.click();
  assert.equal(player.clickStreak, 1);
  assert.equal(sounds.length, 1);
});

test('silence and checkpoint reset restore the quiet single tap', () => {
  const { player, sounds, advance, tap } = encounter();
  tap(); tap(); tap();
  advance(3);
  assert.equal(player.clickStreak, 0);
  player.click();
  assert.equal(sounds.at(-1).radius, 5);
  advance(0.6);
  player.click();
  player.reset(new THREE.Vector3(), 0);
  player.click();
  assert.equal(sounds.at(-1).radius, 5);
});

test('taps preserve dormant and scripted story encounters', () => {
  for (const state of ['dormant', 'scripted']) {
    const { monster, tap } = encounter({ distance: 5, state });
    for (let i = 0; i < 6; i++) tap();
    assert.equal(monster.state, state);
  }
});
