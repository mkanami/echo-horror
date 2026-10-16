// The wait for the lift: a stationary defence in the lift hall.
// Two ways in (corridor door A, ventilation hatch B), each with a steel shutter.
// Shutters and the lift motor share what is left of the generator's power.
// The creature is not on the map here: it moves along two routes and only
// exists as sound — footsteps in the corridor, scraping in the duct.
import * as THREE from 'three';
import { echo, COLORS } from './echo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const SIEGE_TIME = 120;

const ROUTES = {
  door: [
    { id: 'gen', name: 'Генераторная', pos: V(30, 1.2, 8.5), ear: V(16, 1.2, 8.5), loud: 0.35 },
    { id: 'corr', name: 'Переход', pos: V(18.5, 1.2, 8.5), ear: V(15.5, 1.2, 8.5), loud: 0.8 },
    { id: 'doorA', name: 'У двери', pos: V(13.8, 1.4, 8.5), ear: V(13.6, 1.4, 8.5), loud: 1.25 },
  ],
  vent: [
    { id: 'shaft', name: 'Вентшахта', pos: V(7.5, 0.6, 14.6), ear: V(7.5, 0.5, 13.2), loud: 0.45 },
    { id: 'duct', name: 'Короб', pos: V(7.5, 0.6, 13.8), ear: V(7.5, 0.5, 13.2), loud: 0.8 },
    { id: 'ventB', name: 'У люка', pos: V(7.5, 0.5, 13.3), ear: V(7.5, 0.5, 13.1), loud: 1.25 },
  ],
};

export class Siege {
  constructor({ audio, level, game, player, monster, onAttack, ui }) {
    Object.assign(this, { audio, level, game, player, monster, onAttack, ui });
    this.active = false;
  }

  start() {
    this.active = true;
    this.t = 0;
    this.power = 100;
    this.route = 'door';
    this.node = 0;
    this.moveT = 16; // a quiet start
    this.firstArrival = true;
    this.atDoorT = 0;
    this.bangT = 0;
    this.stepT = 0;
    this.pingT = 0;
    this.arrived = false;
    this.blackout = false;
    this.shut = { A: false, B: false };
    this.level.setShutter('A', false);
    this.level.setShutter('B', false);
    if (!this.voice && this.audio.ctx) this.voice = this.audio.createMonsterVoice();
    this.voice && this.voice.setPos(this.cur().ear);
    this.ui.show(true);
  }

  stop() {
    this.active = false;
    this.ui.show(false);
    if (this.voice) this.voice.silence();
  }

  cur() {
    return ROUTES[this.route][this.node];
  }

  toggle(which) {
    if (this.blackout) {
      this.audio.play('tick', null, { gain: 0.5 });
      return false;
    }
    this.shut[which] = !this.shut[which];
    this.level.setShutter(which, this.shut[which]);
    return this.shut[which];
  }

  ping() {
    if (this.blackout || this.power < 2) return null;
    this.power -= 2;
    this.pingT = 3;
    this.audio.play('click', null, { gain: 0.4, rate: 0.7, wet: 0.8 });
    return this.cur();
  }

  // player made noise inside the hall: the creature closes in faster
  heard(radius) {
    if (radius >= 5) this.moveT -= 2.5;
  }

  move() {
    const r = ROUTES[this.route];
    if (this.node < r.length - 1) {
      this.node++;
    }
    const n = this.cur();
    if (this.voice) this.voice.setPos(n.ear);
    this.cue(n, true);
    if (n.id === 'doorA' || n.id === 'ventB') {
      this.atDoorT = 0;
      this.retreatT = 3 + Math.random() * 2;
      for (let i = 0; i < 3; i++) this.audio.play('m_sniff', n.ear, { gain: 1.1, rate: 0.8, wet: 0.3, occ: false, delay: i * 0.25 });
    }
  }

  // what you hear of it: footsteps come down the corridor, scraping comes through the duct
  cue(n, moved) {
    const g = n.loud * (moved ? 1.3 : 1);
    if (this.route === 'door') {
      this.audio.play('flesh', n.ear, { gain: 0.9 * g, rate: 0.68, wet: 0.6, occ: false, vary: 0.05 });
      this.audio.play('tick', n.ear, { gain: 0.35 * g, rate: 1.7, wet: 0.4, occ: false, delay: 0.05 });
      if (moved) echo.emit(V(n.pos.x, 0.1, n.pos.z), { radius: 5, speed: 8, strength: 0.9, color: COLORS.monster });
    } else {
      this.audio.play('scratch', n.ear, { gain: 1.2 * g, rate: 0.75, wet: 0.7, occ: false });
      this.audio.play('knock', n.ear, { gain: 0.7 * g, rate: 1.4, lp: 2500, wet: 0.6, occ: false, delay: 0.1 });
      if (moved) echo.emit(V(7.5, 0.4, 13.1), { radius: 2.5 + n.loud * 2, speed: 6, strength: 0.7, color: COLORS.monster });
    }
  }

  retreat() {
    this.route = Math.random() < 0.55 ? 'door' : 'vent';
    this.node = 0;
    this.moveT = 6 + Math.random() * 4;
    const n = this.cur();
    if (this.voice) this.voice.setPos(n.ear);
    this.audio.play('m_roar', n.ear, { gain: 0.6, rate: 0.75, wet: 1.2, occ: false });
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const closed = (this.shut.A ? 1 : 0) + (this.shut.B ? 1 : 0);
    if (!this.blackout) {
      this.power = Math.max(0, this.power - dt * (0.15 + closed * 0.6) * (this.assist || 1));
      if (this.power <= 0) {
        // fail-safe: everything opens, the motor coasts on
        this.blackout = true;
        this.shut.A = this.shut.B = false;
        this.level.setShutter('A', false);
        this.level.setShutter('B', false);
        this.audio.play('slam', V(8, 3, 8), { gain: 0.8, rate: 0.6 });
        this.game.hint('Питание кончилось. Заслонки поднялись сами.', 4, true);
        this.route = Math.random() < 0.5 ? 'door' : 'vent';
        this.node = 1;
        this.moveT = 5;
      }
    }
    this.pingT = Math.max(0, this.pingT - dt);

    const n = this.cur();
    const atDoor = n.id === 'doorA' || n.id === 'ventB';
    const shutHere = n.id === 'doorA' ? this.shut.A : n.id === 'ventB' ? this.shut.B : false;

    // the player walked out of the hall towards it
    const pp = this.player.pos;
    const inHall = pp.x < 13.2;
    if (!inHall) {
      this.outT = (this.outT || 0) + dt;
      if (!this.outWarned) {
        this.outWarned = true;
        this.game.hint('Не уходи от лифта. В переходе ты для него как на ладони.', 4, true);
      }
      if (this.outT > 4 && this.route === 'door' && this.node >= 1) {
        this.attack();
        return;
      }
    } else {
      this.outT = 0;
      this.outWarned = false;
    }

    if (atDoor) {
      if (shutHere) {
        // banging on the steel, then it gives up and circles round
        this.bangT -= dt;
        if (this.bangT <= 0) {
          this.bangT = 0.7 + Math.random() * 0.6;
          this.audio.play('slam', n.ear, { gain: 0.9, rate: 0.75 + Math.random() * 0.2, wet: 0.7, occ: false });
          echo.emit(n.pos, { radius: 4, speed: 10, strength: 1, color: COLORS.monster });
        }
        this.retreatT -= dt;
        if (this.retreatT <= 0) {
          if (this.firstArrival) this.game.hint('Ушло. Открой заслонку — она ест питание.', 4, true);
          this.firstArrival = false;
          this.retreat();
        }
      } else {
        this.atDoorT += dt;
        const grace = this.firstArrival ? 6 : 3.3 + (1 - (this.assist || 1)) * 4;
        if (this.firstArrival && this.atDoorT > 0.6 && !this.coached) {
          this.coached = true;
          this.game.hint(n.id === 'doorA' ? 'Оно за дверью. Опусти заслонку — [1].' : 'Оно в коробе у люка. Закрой люк — [2].', 4, true);
        }
        if (this.atDoorT > grace) {
          this.attack();
          return;
        }
      }
    } else {
      const aggr = 1 + this.t / 70;
      this.moveT -= dt * aggr;
      if (this.moveT <= 0) {
        this.moveT = 6.5 + Math.random() * 4.5;
        if (this.node === 0 && Math.random() < 0.5) this.route = Math.random() < 0.55 ? 'door' : 'vent';
        if (Math.random() < 0.8) this.move();
      }
      // ambient presence on its current node
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = this.route === 'door' ? 1.6 + Math.random() : 2.2 + Math.random() * 1.5;
        this.cue(n, false);
      }
    }

    // breathing gets audible when it is right behind a shutter
    if (this.voice) {
      this.breathT = (this.breathT ?? 0) - dt;
      if (this.breathT <= 0 && this.node >= 1) {
        this.breathT = atDoor ? 1.1 : 2.4;
        this.voice.breathe(true, atDoor ? 1 : 0.4);
      }
    }

    if (!this.arrived && this.t >= SIEGE_TIME) this.arrive();
    this.warn = atDoor ? n.id : null;
    this.ui.update(this);
  }

  arrive() {
    this.arrived = true;
    this.game.onLiftArrived();
    // the ding is loud: it comes for the hall at once
    this.route = Math.random() < 0.5 ? 'door' : 'vent';
    this.node = 1;
    this.moveT = 4;
  }

  attack() {
    const n = this.cur();
    this.stop();
    this.onAttack(n.pos);
  }
}
