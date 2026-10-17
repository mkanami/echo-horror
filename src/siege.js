// The wait for the lift, played for real. The creature is on the map and comes
// for the lift hall either down the corridor (door A) or crawling the shaft from
// the generator room (hatch B). Only one steel shutter can be down at a time —
// they share a motor. A closed shutter takes a beating and can break; if it
// holds, the creature goes round to the other way in. Hold R near the lowered
// shutter to shore it up.
import * as THREE from 'three';
import { echo, COLORS } from './echo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const SIEGE_TIME = 75;

// the lift hall itself: scripted movement goes round it, never through
const HALL = { minX: 4, maxX: 13, minZ: 3, maxZ: 12.9 };

const ROUTES = {
  A: { approach: V(14.1, 0, 8.5), face: V(12.97, 1.4, 8.5) },
  B: { approach: V(7.5, 0, 14.35), face: V(7.5, 0.5, 13.0) },
};

export class Siege {
  constructor({ audio, level, game, player, monster, ui }) {
    Object.assign(this, { audio, level, game, player, monster, ui });
    this.active = false;
  }

  start() {
    this.active = true;
    this.t = 0;
    this.hp = { A: 100, B: 100 };
    this.shut = { A: false, B: false };
    this.broken = { A: 0, B: 0 };
    this.level.setShutter('A', false);
    this.level.setShutter('B', false);
    this.arrived = false;
    this.coached = false;
    this.rammedOnce = false;
    this.route = 'A';
    this.phase = 'wait';
    this.phaseT = 9; // a few seconds of dread before it moves
    this.ramT = 0;
    this.hitT = 0;
    const m = this.monster;
    m.spawn(V(36, 0, 11), 'scripted');
    m.state = 'scripted';
    m.scriptSpeed = 0;
    m.siege = true;
    this.ui.show(true);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.monster.siege = false;
    this.monster.ramming = false;
    this.ui.show(false);
  }

  other(r) {
    return r === 'A' ? 'B' : 'A';
  }

  toggle(which) {
    if (this.broken[which] > 0) {
      this.audio.play('tick', null, { gain: 0.5 });
      return false;
    }
    const down = !this.shut[which];
    this.shut[which] = down;
    this.level.setShutter(which, down);
    if (down && this.shut[this.other(which)]) {
      // one motor: the other one rolls back up
      this.shut[this.other(which)] = false;
      this.level.setShutter(this.other(which), false);
    }
    return down;
  }

  ping() {
    return { pos: this.monster.pos.clone() };
  }

  heard() {}

  go(route) {
    this.route = route;
    this.phase = 'approach';
    const m = this.monster;
    m.ramming = false;
    this.level.avoid = HALL;
    m.goTo(ROUTES[route].approach, 'scripted');
    this.level.avoid = null;
    m.state = 'scripted';
    m.scriptSpeed = route === 'B' ? 2.2 : 3.0;
  }

  update(dt) {
    if (!this.active) return;
    const m = this.monster;
    this.t += dt;
    for (const k of ['A', 'B'])
      if (this.broken[k] > 0) {
        this.broken[k] -= dt;
        if (this.broken[k] <= 0) this.hp[k] = 60; // the motor drags what is left back into the guides
      }

    // shoring up the lowered shutter
    const R = this.player.keys.has('KeyR');
    for (const k of ['A', 'B']) {
      const f = ROUTES[k].face;
      const near = Math.hypot(this.player.pos.x - f.x, this.player.pos.z - f.z) < 3.2;
      if (R && near && this.shut[k] && !(this.phase === 'ram' && this.route === k)) {
        this.hp[k] = Math.min(100, this.hp[k] + dt * 24);
        this.repairT = (this.repairT || 0) - dt;
        if (this.repairT <= 0) {
          this.repairT = 0.6;
          this.audio.play('tick', f, { gain: 0.5, rate: 0.9, wet: 0.4 });
        }
      }
    }

    if (this.phase === 'squeeze') {
      // forcing its body through the gap: a couple of seconds to get into the locker
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'inside';
        m.siege = false;
        if (this.player.hidden) {
          // it knows this hall: it goes straight to where you'd hide and listens
          const h = this.player.hidden;
          m.goTo(h.front.clone().add(new THREE.Vector3(h.front.x - h.inside.x, 0, h.front.z - h.inside.z).multiplyScalar(0.4)), 'investigate');
          m.sniffCd = 0;
          m.suspicion = Math.max(m.suspicion, 0.35);
          this.game.hint('Идёт к шкафчику. Не дыши [Q].', 3, true);
        } else m.startChase();
      }
    } else if (this.phase === 'inside') {
      // it got in: the ordinary hunt runs; if it loses you, it goes back to the ways in
      if (m.state === 'search' || m.state === 'wander') {
        this.insideT = (this.insideT || 0) + dt;
        if (this.insideT > (this.player.hidden ? 3.5 : 6)) {
          this.insideT = 0;
          this.go(Math.random() < 0.5 ? 'A' : 'B');
        }
      } else this.insideT = 0;
    } else if (this.phase === 'wait') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.go(Math.random() < 0.6 ? 'A' : 'B');
    } else if (this.phase === 'approach') {
      const a = ROUTES[this.route].approach;
      const dist = Math.hypot(m.pos.x - a.x, m.pos.z - a.z);
      if (!this.coached && dist < 13) {
        this.coached = true;
        this.game.hint(this.route === 'A' ? 'Шаги в переходе — опусти заслонку двери [1].' : 'Скребётся в шахте — закрой люк [2].', 4, true);
      }
      if (!m.path || !m.path.length || dist < 0.6) {
        m.path = null;
        if (this.shut[this.route]) {
          this.phase = 'ram';
          this.ramT = 4 + Math.random() * 1.5;
          this.hitT = 0.4;
          m.ramming = true;
          const f = ROUTES[this.route].face;
          m.yaw = Math.atan2(f.x - m.pos.x, f.z - m.pos.z);
          if (!this.rammedOnce) {
            this.rammedOnce = true;
            this.game.hint('Бьёт в заслонку. Держи [R] рядом с ней — подопрёшь.', 4, true);
          }
        } else this.enter();
      }
    } else if (this.phase === 'ram') {
      const f = ROUTES[this.route].face;
      if (!this.shut[this.route]) {
        m.ramming = false;
        this.enter();
      } else {
        this.ramT -= dt;
        this.hitT -= dt;
        if (this.hitT <= 0) {
          this.hitT = 1.25 + Math.random() * 0.35;
          this.hp[this.route] -= 5 + Math.random() * 3.5;
          this.audio.play('slam', f, { gain: 1.2, rate: 0.7 + Math.random() * 0.2, wet: 0.8, occ: false });
          this.audio.play('metal_heavy', f, { gain: 0.8, rate: 0.6, wet: 0.8, occ: false });
          echo.emit(f, { radius: 7, speed: 11, strength: 1.3, color: COLORS.monster });
          const d = Math.hypot(this.player.pos.x - f.x, this.player.pos.z - f.z);
          this.player.shake = Math.max(this.player.shake || 0, Math.max(0.2, 1 - d / 9));
          m.twitch = 1;
        }
        if (this.hp[this.route] <= 0) {
          // the shutter tears out of its guides
          this.hp[this.route] = 0;
          this.broken[this.route] = 6;
          this.shut[this.route] = false;
          this.level.setShutter(this.route, false);
          this.audio.crash(f);
          this.game.hint(this.route === 'A' ? 'Заслонку двери вырвало!' : 'Люк выбит!', 3, true);
          m.ramming = false;
          this.enter();
        } else if (this.ramT <= 0) {
          // it gives up on this way in and goes round
          m.ramming = false;
          this.audio.play('m_roar', f, { gain: 0.9, rate: 0.75, wet: 1, occ: false });
          this.go(this.other(this.route));
        }
      }
    }

    if (!this.arrived && this.t >= SIEGE_TIME) {
      this.arrived = true;
      this.game.onLiftArrived();
    }
    this.ui.update(this);
  }

  enter() {
    const m = this.monster;
    this.phase = 'squeeze';
    this.phaseT = 2.2;
    m.ramming = false;
    m.path = null;
    m.state = 'scripted';
    m.scriptSpeed = 0;
    const f = ROUTES[this.route].face;
    this.audio.play('m_roar', f, { gain: 1.0, rate: 0.85, wet: 0.9, occ: false });
    this.audio.play('bonecrack', f, { gain: 0.8, rate: 0.9, occ: false });
    echo.emit(f, { radius: 8, speed: 10, strength: 1.3, color: COLORS.monster });
    this.game.hint('Оно лезет внутрь. Шкафчик у лифта — быстро.', 3, true);
  }
}
