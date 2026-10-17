// The wait for the lift, played for real. The creature is on the map and comes
// for the lift hall through the corridor, shaft or west service passage.
// One shared motor lowers one shutter at a time. The free palm's real surface
// contact braces it; the creature physically backs away between attacks.
import * as THREE from 'three';
import { echo, COLORS } from './echo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const SIEGE_TIME = 75;

// the lift hall itself: scripted movement goes round it, never through
const HALL = { minX: 4, maxX: 13, minZ: 3, maxZ: 12.9 };

const ROUTES = {
  A: { approach: V(14.1, 0, 8.5), face: V(12.97, 1.4, 8.5), inside: V(11.5, 0, 8.5) },
  B: { approach: V(7.5, 0, 14.35), face: V(7.5, 0.5, 13.0), inside: V(7.5, 0, 11.5) },
  C: { approach: V(2.9, 0, 8.5), face: V(4.03, 1.4, 8.5), inside: V(5.5, 0, 8.5) },
};
const ENTRANCES = Object.keys(ROUTES);

export class Siege {
  constructor({ audio, level, game, player, monster, ui }) {
    Object.assign(this, { audio, level, game, player, monster, ui });
    this.active = false;
    this.t = this.elapsed = 0;
    this.power = 100;
  }

  start() {
    this.active = true;
    this.t = 0;
    this.elapsed = 0;
    this.power = 100;
    this.powerLocked = false;
    this.pingCooldown = 0;
    this.stalled = this.stallUsed = this.feintUsed = false;
    this.bracing = false;
    this.noisePressure = 0;
    this.cueT = 0;
    this.hp = { A: 100, B: 100, C: 100 };
    this.shut = { A: false, B: false, C: false };
    this.broken = { A: 0, B: 0, C: 0 };
    this.visited = new Set();
    for (const k of ENTRANCES) this.level.setShutter(k, false);
    this.arrived = false;
    this.coached = false;
    this.rammedOnce = false;
    this.route = 'A';
    this.phase = 'wait';
    this.phaseT = 9; // a few seconds of dread before it moves
    this.ramT = 0;
    this.hitT = 0;
    this.insideT = 0;
    this.retreatRoute = null;
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
    if (this.stage > 0 && r !== 'C' && !this.visited.has('C')) return 'C';
    const choices = ENTRANCES.filter(k => k !== r && (this.stage > 0 || k !== 'C'));
    return choices[Math.floor(Math.random() * choices.length)];
  }

  toggle(which) {
    if (!this.active || this.broken[which] > 0 || this.powerLocked || this.power < 4) {
      this.audio.play('tick', null, { gain: 0.5 });
      return false;
    }
    const down = !this.shut[which];
    this.power = Math.max(0, this.power - 4);
    this.shut[which] = down;
    this.level.setShutter(which, down);
    if (down) for (const k of ENTRANCES) if (k !== which && this.shut[k]) {
      this.shut[k] = false;
      this.level.setShutter(k, false);
    }
    return down;
  }

  ping() {
    if (!this.active || this.powerLocked || this.power < 8 || this.pingCooldown > 0) return null;
    this.power -= 8;
    this.pingCooldown = 5;
    this.audio.play('tick', null, { gain: 0.35, rate: 1.8 });
    return { pos: this.monster.pos.clone() };
  }

  heard(radius) { this.noisePressure = Math.min(1, this.noisePressure + Math.max(0, radius - 3) * 0.035); }

  get stage() { return this.elapsed < 25 ? 0 : this.elapsed < 55 ? 1 : 2; }

  get remaining() { return Math.max(0, SIEGE_TIME - this.t); }

  restartLift() {
    if (!this.active || !this.stalled) return false;
    this.stalled = false;
    this.power = Math.min(100, this.power + 25);
    this.audio.play('metal_heavy', V(9.55, 1.3, 3.1), { gain: 0.7, rate: 1.1, wet: 0.6 });
    this.game.onLiftRestart?.();
    this.game.hint('Лифт снова идёт. Оно стало быстрее.', 3, true);
    return true;
  }

  isBracing(route) {
    const p = this.player, f = ROUTES[route].face;
    const contact = p.braceContact;
    const inside = route === 'A' ? p.pos.x < f.x : route === 'C' ? p.pos.x > f.x : p.pos.z < f.z;
    const awaySpeed = route === 'A' ? -(p.vel?.x || 0) : route === 'C' ? (p.vel?.x || 0) : -(p.vel?.z || 0);
    const sidewaysSpeed = Math.abs(route === 'B' ? (p.vel?.x || 0) : (p.vel?.z || 0));
    return contact?.doorId === `sh${route}` && inside && !p.hidden && !p.frozen && !(p.fallT > 0) &&
      !p.running && (p.stamina ?? 1) > 0.08 && awaySpeed < 0.3 && sidewaysSpeed < 0.6 &&
      Math.hypot(p.pos.x - f.x, p.pos.z - f.z) < 2.4;
  }

  nextRoute() {
    // It favours the open way, but may return to a weakened shutter.
    const other = this.other(this.route);
    if (this.stage === 0) return other;
    if (this.hp[this.route] < 35 && Math.random() < 0.55) {
      this.game.hint('Оно не уходит. Сейчас ударит снова.', 2.5, true);
      return this.route;
    }
    return other;
  }

  get monsterInHall() {
    // Its body must clear the doorway, not merely touch the hall boundary.
    const p = this.monster.pos, margin = 0.4;
    return p.x > HALL.minX + margin && p.x < HALL.maxX - margin &&
      p.z > HALL.minZ + margin && p.z < HALL.maxZ - margin;
  }

  go(route) {
    this.route = route;
    this.visited.add(route);
    this.phase = 'approach';
    const m = this.monster;
    m.ramming = false;
    this.level.avoid = HALL;
    m.goTo(ROUTES[route].approach, 'scripted');
    this.level.avoid = null;
    m.state = 'scripted';
    const assist = this.assist ?? 1;
    m.scriptSpeed = ((route === 'B' ? 2.2 : route === 'C' ? 2.6 : 3.0) + this.stage * 0.55 + this.noisePressure * 0.5) * (0.75 + assist * 0.25);
    m.siege = true;
    this.repathT = 1;
  }

  update(dt) {
    if (!this.active) return;
    const m = this.monster;
    this.elapsed += dt;
    if (!this.stalled && !this.arrived) this.t = Math.min(SIEGE_TIME, this.t + dt);
    if (!this.stallUsed && this.t >= 38 && !this.arrived) {
      this.t = 38;
      this.stalled = this.stallUsed = true;
      this.audio.play('metal_heavy', V(7.5, 1.4, 1.5), { gain: 1, rate: 0.5, wet: 1 });
      this.game.onLiftStall?.();
      this.game.hint('Лифт встал. Вернись к кнопке вызова у дверей и держи [E].', 6, true);
    }
    this.noisePressure = Math.max(0, this.noisePressure - dt * 0.08);
    this.pingCooldown = Math.max(0, this.pingCooldown - dt);
    const closed = ENTRANCES.some(k => this.shut[k]);
    this.power = THREE.MathUtils.clamp(this.power + dt * (closed ? -1.1 : 4), 0, 100);
    if (this.power <= 0 && !this.powerLocked) {
      this.powerLocked = true;
      for (const k of ENTRANCES) { this.shut[k] = false; this.level.setShutter(k, false); }
      this.audio.play('metal_heavy', this.player.pos, { gain: 0.6, rate: 0.6 });
      this.game.hint('Привод перегрелся. Заслонки поднялись — дай ему остыть.', 4, true);
    } else if (this.powerLocked && this.power >= 20) this.powerLocked = false;
    for (const k of ENTRANCES)
      if (this.broken[k] > 0) {
        this.broken[k] -= dt;
        if (this.broken[k] <= 0) this.hp[k] = 60; // the motor drags what is left back into the guides
      }

    // shoring up the lowered shutter
    this.bracing = false;
    for (const k of ENTRANCES) {
      const f = ROUTES[k].face;
      if (this.isBracing(k) && this.shut[k]) {
        this.bracing = true;
        if (this.phase === 'ram' && this.route === k) this.player.stamina = Math.max(0, (this.player.stamina ?? 1) - dt * 0.23);
        else this.hp[k] = Math.min(100, this.hp[k] + dt * 10);
        this.repairT = (this.repairT || 0) - dt;
        if (this.repairT <= 0) {
          this.repairT = 0.6;
          this.audio.play('tick', f, { gain: 0.5, rate: 0.9, wet: 0.4 });
        }
      }
    }

    if (this.phase === 'recoil') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        const next = this.retreatRoute || this.route;
        this.retreatRoute = null;
        this.go(next);
      }
    } else if (this.phase === 'feint') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.go(this.other(this.route));
    } else if (this.phase === 'squeeze') {
      // forcing its body through the gap: a couple of seconds to get into the locker
      this.phaseT -= dt;
      if (this.shut[this.route] && !this.monsterInHall) {
        // A last-second closure interrupts entry. Retreat physically to the
        // outside approach point before attacking the shutter.
        this.go(this.route);
      } else if (this.phaseT <= 0 && this.monsterInHall) {
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
      } else if (!m.path || !m.path.length) {
        this.repathT -= dt;
        if (this.repathT <= 0) {
          this.repathT = 1;
          m.goTo(ROUTES[this.route].inside, 'scripted');
        }
      }
    } else if (this.phase === 'inside') {
      // it got in: the ordinary hunt runs; if it loses you, it goes back to the ways in
      if (m.state === 'search' || m.state === 'wander') {
        this.insideT = (this.insideT || 0) + dt;
        if (this.insideT > (this.player.hidden ? 3.5 : 6)) {
          this.insideT = 0;
          this.go(this.other(this.route));
        }
      } else this.insideT = 0;
    } else if (this.phase === 'wait') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.go(Math.random() < 0.6 ? 'A' : 'B');
    } else if (this.phase === 'approach') {
      this.cueT -= dt;
      if (this.cueT <= 0) {
        this.cueT = this.route === 'B' ? 1.4 : 0.95;
        this.audio.play(this.route === 'B' ? 'metal_heavy' : this.route === 'C' ? 'creak' : 'step_tile', m.pos, { gain: 0.65, rate: this.route === 'B' ? 0.65 : 0.8, wet: 0.7, occ: false });
        echo.emit(m.pos.clone().setY(this.route === 'B' ? 0.3 : 0.05), { radius: 3, speed: 7, strength: 0.5, color: COLORS.monster });
      }
      const a = ROUTES[this.route].approach;
      const dist = Math.hypot(m.pos.x - a.x, m.pos.z - a.z);
      if (!this.coached && dist < 13) {
        this.coached = true;
        this.game.hint(this.route === 'A' ? 'Шаги в переходе — опусти заслонку двери [1].' : this.route === 'B' ? 'Скребётся в шахте — закрой люк [2].' : 'Скрип слева — закрой служебную дверь [3].', 4, true);
      }
      if (dist < 0.6) {
        m.path = null;
        if (this.stage === 1 && !this.feintUsed && this.shut[this.route]) {
          this.feintUsed = true;
          this.phase = 'feint';
          this.phaseT = 2.1;
          m.ramming = false;
          this.audio.play('scratch', ROUTES[this.route].face, { gain: 0.9, wet: 0.8, occ: false });
          this.game.hint('Скребнуло — и замерло. Слушай, куда уйдёт.', 3, true);
          this.ui.update(this);
          return;
        }
        if (this.shut[this.route]) {
          this.phase = 'ram';
          this.ramT = 5 + this.stage * 1.5 + Math.random();
          this.hitT = 0.4;
          m.ramming = true;
          const f = ROUTES[this.route].face;
          m.yaw = Math.atan2(f.x - m.pos.x, f.z - m.pos.z);
          if (!this.rammedOnce) {
            this.rammedOnce = true;
            this.game.hint('Бьёт в заслонку. Подойди вплотную лицом к ней — упрёшься рукой. У люка присядь.', 5, true);
          }
        } else this.enter();
      } else if (!m.path || !m.path.length) {
        // A failed/exhausted path is not proof that it reached the entrance.
        this.repathT -= dt;
        if (this.repathT <= 0) this.go(this.route);
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
          this.hitT = 1.25 - this.stage * 0.18 + Math.random() * 0.2;
          const damage = (9 + this.stage * 7 + Math.random() * 4) * (this.assist ?? 1);
          this.hp[this.route] -= damage * (this.isBracing(this.route) ? 0.32 : 1);
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
          this.game.hint(this.route === 'A' ? 'Заслонку двери вырвало!' : this.route === 'B' ? 'Люк выбит!' : 'Служебная дверь выбита!', 3, true);
          m.ramming = false;
          this.enter();
        } else if (this.ramT <= 0) {
          // it gives up on this way in and goes round
          m.ramming = false;
          this.audio.play('m_roar', f, { gain: 0.9, rate: 0.75, wet: 1, occ: false });
          // Even the short west/shaft route leaves a breath between attacks.
          // The real retreat also makes a repeated attack readable.
          this.retreatRoute = this.nextRoute();
          this.phase = 'recoil';
          this.phaseT = 3.4;
          const back = ROUTES[this.route].approach.clone();
          if (this.route === 'A') back.x += 1.6;
          else if (this.route === 'C') back.x -= 1.3;
          else back.z += 1.6;
          m.goTo(back, 'scripted');
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
    m.goTo(ROUTES[this.route].inside, 'scripted');
    m.scriptSpeed = 1.3;
    this.repathT = 1;
    const f = ROUTES[this.route].face;
    this.audio.play('m_roar', f, { gain: 1.0, rate: 0.85, wet: 0.9, occ: false });
    this.audio.play('bonecrack', f, { gain: 0.8, rate: 0.9, occ: false });
    echo.emit(f, { radius: 8, speed: 10, strength: 1.3, color: COLORS.monster });
    this.game.hint('Оно лезет внутрь. Шкафчик у лифта — быстро.', 3, true);
  }
}
