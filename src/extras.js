// Things that fill the station between the story beats:
//  - junk on the floor along the routes you walk (cans, bottles, trays): walk
//    into it and it clatters; creep [C] and you step over it;
//  - hiding places under the beds;
//  - wind-up alarm clocks: throw one [G], it ticks, then rings and pulls the
//    creature to it — pick it up again afterwards;
//  - wall phones that start ringing near you and call the creature over:
//    answer [E] to stop them, or let them ring and use the noise.
import * as THREE from 'three';
import { echo, echoMaterial, COLORS } from './echo.js';
import { makeObject } from './builder.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PHONE_LINES = [
  'В трубке дыхание. Твоё — только на полсекунды позже.',
  'Тишина. Потом щелчок — как языком о нёбо. Твой щелчок.',
  'Женский голос считает до семи. Сбивается на четырёх и начинает снова.',
  'Гудок. Под гудком — шаги. Они ближе, чем телефонная станция.',
];

export class Extras {
  constructor({ level, audio, game, player, scene }) {
    Object.assign(this, { level, audio, game, player, scene });
    this.monster = null;
    this.traps = [];
    this.clocks = []; // clock items (level.items entries)
    this.held = []; // clocks in your pocket
    this.live = []; // thrown clocks: flying, ticking, ringing
    this.phones = [];
    this.phoneCd = 40;
    this.ringing = null;
  }

  build() {
    const L = this.level;
    const lm = L.lineMat.prop;
    const mats = {
      can: echoMaterial({ map: 'metal', scale: 6, boost: 1.9, tint: 0xd8d0c0 }),
      bottle: echoMaterial({ map: 'bplastic', scale: 6, boost: 2.2, tint: 0x8ab08a, wet: 0.8 }),
      tray: echoMaterial({ map: 'metal', scale: 3, boost: 1.2, tint: 0xc0c4c8 }),
      clock: echoMaterial({ map: 'paint', scale: 5, boost: 1.8, tint: 0xd8b0a0 }),
      brass: echoMaterial({ map: 'metal', scale: 6, boost: 2.0, tint: 0xe0c080 }),
      phone: echoMaterial({ map: 'bplastic', scale: 4, boost: 1.4, tint: 0xb8b0a0 }),
    };
    this.mats = mats;
    const geos = {
      can: () => [{ geo: new THREE.CylinderGeometry(0.033, 0.033, 0.115, 14), rot: [Math.PI / 2, 0, 0], pos: [0, 0.033, 0] }],
      bottle: () => [
        { geo: new THREE.LatheGeometry([[0.001, 0], [0.036, 0], [0.037, 0.18], [0.03, 0.21], [0.013, 0.25], [0.013, 0.3], [0.001, 0.3]].map(([r, y]) => new THREE.Vector2(r, y)), 14), rot: [0, 0, Math.PI / 2], pos: [0.15, 0.036, 0] },
      ],
      tray: () => [{ geo: new THREE.BoxGeometry(0.4, 0.012, 0.28), pos: [0, 0.006, 0] }, { geo: new THREE.BoxGeometry(0.4, 0.03, 0.01), pos: [0, 0.015, 0.14] }, { geo: new THREE.BoxGeometry(0.4, 0.03, 0.01), pos: [0, 0.015, -0.14] }],
    };

    // ---- junk along the routes between the objectives
    const R = rng(1987);
    const route = [V(34.9, 0, 50.6), V(33.9, 0, 29.6), V(2.5, 0, 18), V(54.5, 0, 34.0), V(54, 0, 25.6), V(53, 0, 8), V(32, 0, 9.6), V(9.5, 0, 6)];
    const pts = [];
    for (let i = 0; i < route.length - 1; i++) {
      const p = L.findPath(route[i], route[i + 1]);
      if (!p) continue;
      for (let k = 0; k < p.length - 1; k++) {
        const a = p[k], b = p[k + 1];
        const n = Math.max(1, Math.round(a.distanceTo(b) / 0.5));
        for (let s = 0; s < n; s++) pts.push(a.clone().lerp(b, s / n));
      }
    }
    const avoid = L.items.map((it) => it.pos).concat(route.slice(0, 1));
    let next = 6 + R() * 4;
    let acc = 0;
    for (let i = 1; i < pts.length && this.traps.length < 22; i++) {
      acc += pts[i].distanceTo(pts[i - 1]);
      if (acc < next) continue;
      const q = pts[i];
      const d = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[i - 1]).setY(0).normalize();
      const off = (R() - 0.5) * 0.5;
      const p = V(q.x - d.z * off, 0, q.z + d.x * off);
      if (avoid.some((a) => Math.hypot(a.x - p.x, a.z - p.z) < 1.8)) continue;
      if (this.traps.some((t) => t.home.distanceTo(p) < 3.5)) continue;
      if (!L.open(Math.floor(p.x), Math.floor(p.z)) || L.blockedPoint(p.x, p.z, 0.15)) continue;
      const kind = ['can', 'can', 'bottle', 'tray'][Math.floor(R() * 4)];
      const obj = makeObject(geos[kind](), mats[kind], lm);
      const yaw = R() * Math.PI * 2;
      obj.position.copy(p);
      obj.rotation.y = yaw;
      this.scene.add(obj);
      this.traps.push({ kind, obj, home: p.clone(), yaw, vel: V(0, 0, 0), spin: 0, cd: 0, broken: false });
      acc = 0;
      next = 6 + R() * 5;
    }

    // ---- under the beds: crawl in from the foot end, watch the room from the floor
    const bed = (x, z, dir) => {
      // dir: +1 if the foot of the bed points to +x, -1 if to -x
      const inside = V(x - dir * 0.15, 0, z);
      const front = V(x + dir * 1.45, 0, z);
      L.items.push({ type: 'locker', low: true, pos: V(x + dir * 0.95, 0.42, z), inside, front, yaw: dir > 0 ? -Math.PI / 2 : Math.PI / 2, obj: new THREE.Object3D(), taken: false });
    };
    for (const z of [45.3, 47.8, 50.3]) {
      bed(27.1, z, 1);
      bed(36.9, z, -1);
    }
    bed(46.5, 7.4, 1);
    bed(61.0, 7.4, -1);

    // ---- alarm clocks
    const clockParts = () => [
      { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.035, 18), rot: [Math.PI / 2, 0, 0], pos: [0, 0.06, 0] },
      { geo: new THREE.SphereGeometry(0.022, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), pos: [-0.03, 0.105, 0], rot: [0, 0, 0.4] },
      { geo: new THREE.SphereGeometry(0.022, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), pos: [0.03, 0.105, 0], rot: [0, 0, -0.4] },
      { geo: new THREE.BoxGeometry(0.012, 0.03, 0.012), pos: [-0.035, 0.02, 0] },
      { geo: new THREE.BoxGeometry(0.012, 0.03, 0.012), pos: [0.035, 0.02, 0] },
    ];
    for (const [x, z] of [[39.6, 37.7], [8.6, 30.3], [46.3, 13.9], [34.6, 12.2], [21.5, 24.5]]) {
      if (!L.open(Math.floor(x), Math.floor(z))) continue;
      const obj = makeObject(clockParts(), mats.clock, lm);
      obj.position.set(x, 0, z);
      obj.rotation.y = Math.random() * 6.28;
      this.scene.add(obj);
      const it = { type: 'clock', pos: V(x, 0.08, z), home: V(x, 0, z), obj, taken: false };
      L.items.push(it);
      this.clocks.push(it);
    }

    // ---- wall phones
    const phoneParts = () => [
      { geo: new THREE.BoxGeometry(0.17, 0.24, 0.07), pos: [0, 0, 0.035] },
      { geo: new THREE.CapsuleGeometry(0.022, 0.15, 4, 10), pos: [-0.06, 0.0, 0.085] },
      { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16), rot: [Math.PI / 2, 0, 0], pos: [0.03, 0.04, 0.072] },
    ];
    for (const [x, z] of [[20.5, 25.2], [5.5, 22.5], [31.5, 18.0], [38.5, 40.0], [48.0, 27.6], [16.5, 8.2]]) {
      const w = this.wallSpot(x, z);
      if (!w) continue;
      const obj = makeObject(phoneParts(), mats.phone, lm);
      obj.position.copy(w.pos).setY(1.45);
      obj.rotation.y = Math.atan2(w.n.x, w.n.z);
      this.scene.add(obj);
      const it = { type: 'phone', pos: w.pos.clone().setY(1.45).addScaledVector(w.n, 0.08), obj, taken: false, idx: this.phones.length };
      L.items.push(it);
      this.phones.push(it);
    }
  }

  // nearest wall face to (x, z): a point on it and the normal pointing into the room
  wallSpot(x, z) {
    const L = this.level;
    let best = null;
    for (let j = Math.floor(z) - 3; j <= Math.floor(z) + 3; j++)
      for (let i = Math.floor(x) - 3; i <= Math.floor(x) + 3; i++) {
        if (!L.open(i, j) || L.ceilAt(i, j) < 2.2) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (L.open(i + dx, j + dz)) continue;
          const p = V(i + 0.5 + dx * 0.5, 0, j + 0.5 + dz * 0.5);
          if (L.blockedPoint(p.x - dx * 0.3, p.z - dz * 0.3, 0.2)) continue;
          const d = Math.hypot(p.x - x, p.z - z);
          if (!best || d < best.d) best = { d, pos: p, n: V(-dx, 0, -dz) };
        }
      }
    return best;
  }

  prompt(it) {
    if (it.type === 'clock') return this.held.length >= 3 ? 'Больше не унести' : '[E] Взять будильник';
    if (it.type === 'phone') return this.ringing && this.ringing.it === it ? '[E] Снять трубку' : 'Телефон. Гудка нет.';
    return null;
  }

  interact(it) {
    if (it.type === 'clock') {
      if (this.held.length >= 3) return true;
      it.taken = true;
      it.obj.visible = false;
      this.held.push(it);
      this.live = this.live.filter((c) => c.it !== it);
      this.audio.pickup();
      if (!this.game.flags.clockHint) {
        this.game.flags.clockHint = true;
        this.game.hint('Будильник. [G] — бросить: потикает и зазвенит. Оно пойдёт на звон.', 5);
      }
      return true;
    }
    if (it.type === 'phone') {
      if (!this.ringing || this.ringing.it !== it) return true;
      this.ringing = null;
      this.audio.play('click', it.pos, { gain: 0.6, rate: 0.7 });
      this.audio.play('m_breath', it.pos, { gain: 0.35, rate: 0.85, delay: 0.5, wet: 0.2 });
      this.game.noise(it.pos.clone(), { radius: 2, visual: 2, source: 'player', kind: 'item', color: COLORS.item, strength: 0.5 });
      this.game.hint(PHONE_LINES[(this.game.flags.phoneN = (this.game.flags.phoneN || 0) + 1) % PHONE_LINES.length], 5);
      return true;
    }
    return false;
  }

  throwClock(camera) {
    if (!this.held.length || this.player.frozen || this.player.hidden) return false;
    const it = this.held.pop();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    it.obj.visible = true;
    it.obj.position.copy(camera.position).addScaledVector(dir, 0.45);
    this.live.push({ it, vel: dir.multiplyScalar(8.5).add(V(0, 2.4, 0)), state: 'fly', t: 0, tick: 0, ring: 0, call: 0 });
    this.audio.whoosh();
    return true;
  }

  update(dt) {
    const L = this.level, P = this.player;
    const sp = Math.hypot(P.vel.x, P.vel.z);
    // ---- junk underfoot
    for (const t of this.traps) {
      t.cd = Math.max(0, t.cd - dt);
      const o = t.obj;
      if (t.vel.lengthSq() > 1e-4) {
        o.position.addScaledVector(t.vel, dt);
        L.collide(o.position, 0.06);
        t.vel.multiplyScalar(Math.max(0, 1 - dt * 3.2));
        o.rotation.y += t.spin * dt;
        t.spin *= Math.max(0, 1 - dt * 3);
        if (t.kind === 'can') o.rotation.x += t.vel.length() * dt * 18;
      }
      if (t.broken || t.cd > 0) continue;
      // it blunders into junk too — and you hear where it is
      const Mo = this.monster;
      if (Mo && Mo.active && (Mo.curSpeed || 0) > 0.5 && Math.hypot(Mo.pos.x - o.position.x, Mo.pos.z - o.position.z) < 0.55) {
        this.kick(t, Mo.curSpeed, V(Math.sin(Mo.yaw), 0, Math.cos(Mo.yaw)));
        continue;
      }
      if (P.hidden) continue;
      const d = Math.hypot(P.pos.x - o.position.x, P.pos.z - o.position.z);
      if (d > 0.42 + (P.running ? 0.12 : 0) || sp < 0.6) continue;
      if (P.crouch) {
        // careful feet: you feel it and step over
        if (!this.game.flags.trapCrouchHint) {
          this.game.flags.trapCrouchHint = true;
          this.game.hint('Нога нащупала что-то на полу. Переступаешь — тихо.', 3);
        }
        t.cd = 2;
        continue;
      }
      this.kick(t, sp);
    }

    // ---- thrown clocks
    for (const c of this.live) {
      const o = c.it.obj;
      c.t += dt;
      if (c.state === 'fly') {
        c.vel.y -= 9.8 * dt;
        const prev = o.position.clone();
        o.position.addScaledVector(c.vel, dt);
        o.rotation.x += dt * 8;
        o.rotation.z += dt * 5;
        const p = o.position;
        const open = L.open(Math.floor(p.x), Math.floor(p.z));
        let hit = false;
        if (!open || p.y > L.ceilAt(Math.floor(p.x), Math.floor(p.z)) || (p.y < 1.4 && L.blockedPoint(p.x, p.z, 0.05))) {
          o.position.copy(prev);
          c.vel.x *= -0.3;
          c.vel.z *= -0.3;
          hit = true;
        }
        if (p.y <= 0.02) {
          p.y = 0;
          c.vel.y *= -0.25;
          c.vel.x *= 0.45;
          c.vel.z *= 0.45;
          hit = true;
        }
        if (hit && c.vel.length() > 1.2) {
          this.audio.play('metal_heavy', p, { gain: 0.35, rate: 2.4 });
          this.audio.play('ding', p, { gain: 0.25, rate: 2.6 });
        }
        if ((p.y <= 0.02 && c.vel.length() < 0.8) || c.t > 3) {
          p.y = 0;
          o.rotation.set(0, Math.random() * 6.28, 0);
          c.state = 'tick';
          c.t = 0;
          c.it.pos.set(p.x, 0.08, p.z);
        }
      } else if (c.state === 'tick') {
        c.tick -= dt;
        if (c.tick <= 0) {
          c.tick = 0.5;
          this.audio.play('tick', o.position, { gain: 0.55, rate: 1.1 });
          echo.emit(o.position.clone().setY(0.1), { radius: 1.6, speed: 6, strength: 0.5, decay: 1.5, color: COLORS.stone });
        }
        if (c.t > 3.5) {
          c.state = 'ring';
          c.t = 0;
        }
      } else if (c.state === 'ring') {
        c.ring -= dt;
        c.call -= dt;
        o.position.x = c.it.pos.x + (Math.random() - 0.5) * 0.012; // rattling on the floor
        if (c.ring <= 0) {
          c.ring = 0.16;
          this.audio.play('ding', o.position, { gain: 0.8, rate: 2.3 + Math.random() * 0.25, wet: 0.6 });
        }
        if (c.call <= 0) {
          c.call = 1.0;
          this.game.noise(o.position.clone().setY(0.2), { radius: 16, visual: 6, source: 'stone', kind: 'stone', color: COLORS.stone, strength: 1.1, speed: 12 });
        }
        if (c.t > 7) {
          c.state = 'done';
          o.position.x = c.it.pos.x;
          c.it.taken = false; // lying there, can be picked up again
        }
      }
    }
    this.live = this.live.filter((c) => c.state !== 'done');

    // ---- phones
    const M = this.monster;
    this.phoneCd -= dt;
    if (this.ringing) {
      const r = this.ringing;
      r.t += dt;
      r.cyc -= dt;
      if (r.cyc <= 0) {
        r.cyc = 2.8;
        for (const delay of [0, 0.42]) this.audio.play('ding', r.it.pos, { gain: 0.95, rate: 1.7, delay, wet: 0.7 });
        echo.emit(r.it.pos.clone(), { radius: 5, speed: 9, strength: 0.9, decay: 1.0, color: COLORS.item });
        this.game.noise(r.it.pos.clone().setY(0.5), { radius: 26, visual: 0, source: 'phone', kind: 'stone', strength: 0 });
      }
      if (r.t > 22 || this.game.state !== 'play') this.ringing = null;
    } else if (M && M.active && this.phoneCd <= 0 && this.game.state === 'play' && M.state !== 'chase' && !P.hidden) {
      const f = (this.game.flags.phones ||= {});
      for (const it of this.phones) {
        if (f[it.idx]) continue;
        const d = Math.hypot(P.pos.x - it.pos.x, P.pos.z - it.pos.z);
        const md = Math.hypot(M.pos.x - P.pos.x, M.pos.z - P.pos.z);
        if (d < 7 && md > 12) {
          f[it.idx] = true;
          this.ringing = { it, t: 0, cyc: 0 };
          this.phoneCd = 80;
          if (!this.game.flags.phoneHint) {
            this.game.flags.phoneHint = true;
            this.game.hint('Звонит телефон. Оно услышит. Сними трубку [E] — или уходи, пока звенит.', 5, true);
          }
          break;
        }
      }
    }
  }

  kick(t, sp, by = null) {
    const P = this.player;
    const o = t.obj;
    const dir = by ? by.clone() : V(P.vel.x, 0, P.vel.z).normalize();
    dir.x += (Math.random() - 0.5) * 0.6;
    dir.z += (Math.random() - 0.5) * 0.6;
    dir.normalize();
    t.vel.copy(dir).multiplyScalar(1.4 + sp * 0.5);
    t.spin = (Math.random() - 0.5) * 14;
    t.cd = 1.2;
    const p = o.position;
    if (t.kind === 'can') {
      this.audio.play('metal_heavy', p, { gain: 0.55, rate: 2.2 + Math.random() * 0.4 });
      this.audio.play('knock', p, { gain: 0.35, rate: 1.7, delay: 0.12 });
    } else if (t.kind === 'tray') {
      this.audio.play('metal_heavy', p, { gain: 0.9, rate: 1.35 + Math.random() * 0.2 });
      this.audio.play('ding', p, { gain: 0.3, rate: 1.4 });
    } else {
      this.audio.play('glass_crunch', p, { gain: 1.0, rate: 1.2 });
      this.audio.play('ding', p, { gain: 0.35, rate: 2.4 });
      t.broken = true;
      o.scale.set(1, 0.25, 1); // shattered
      t.vel.multiplyScalar(0.3);
    }
    if (by) {
      echo.emit(p.clone().setY(0.1), { radius: 5, speed: 10, strength: 0.9, color: COLORS.monster });
      return;
    }
    this.game.noise(p.clone().setY(0.1), { radius: P.running ? 11 : 7.5, visual: 6, source: 'player', kind: 'door', color: COLORS.player, strength: 1.0 });
    if (!this.game.flags.trapHint) {
      this.game.flags.trapHint = true;
      this.game.hint('Задел ногой. Так слышно на пол-этажа. Крадись [C] — тогда переступишь.', 4.5);
    }
  }

  // back to the checkpoint: junk where it was, clocks where they belong, nothing ringing
  reset() {
    for (const t of this.traps) {
      t.obj.position.copy(t.home);
      t.obj.rotation.set(0, t.yaw, 0);
      t.obj.scale.set(1, 1, 1);
      t.vel.set(0, 0, 0);
      t.broken = false;
      t.cd = 0;
    }
    this.live = [];
    this.held = this.clocks.filter((c) => c.taken);
    for (const c of this.clocks) if (!c.taken) {
      c.obj.position.copy(c.home);
      c.pos.set(c.home.x, 0.08, c.home.z);
    }
    this.ringing = null;
    this.phoneCd = 30;
  }
}
