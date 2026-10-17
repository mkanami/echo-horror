// The "second echo" — a blind thing that exists only through sound.
import * as THREE from 'three';
import { echo, echoMaterial, echoPoints, COLORS } from './echo.js';
import { taper, sculpt, blob, fbm } from './organic.js';

const PI = Math.PI;
const tmp = new THREE.Vector3();

function buildBody() {
  const mat = echoMaterial({ pat: 5, boost: 1.0, wet: 1, bump: 1.4, tint: 0xe8d0c8 });
  const boneMat = echoMaterial({ pat: 5, boost: 2.2, wet: 0.6, bump: 0.3, tint: 0xfff0d8 });
  const lmat = echoMaterial({ kind: 'line', boost: 1.2, tint: 0xffb8a8 });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const part = (geo, parent, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], bone = false, edges = 40 } = {}) => {
    const m = new THREE.Mesh(geo, bone ? boneMat : mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.scale.set(...scale);
    if (edges) {
      const eg = new THREE.EdgesGeometry(geo, edges);
      m.add(new THREE.LineSegments(eg, lmat));
      m.add(echoPoints(eg, { tint: 0xffb8a8, boost: 1.2, size: 2.0 }));
    }
    parent.add(m);
    return m;
  };
  const joint = (parent, pos) => {
    const g = new THREE.Group();
    g.position.set(...pos);
    parent.add(g);
    return g;
  };
  const skin = (v, amp = 0.005, f = 14) => {
    const n = fbm(v.x * f, v.y * f, v.z * f, 3) * amp;
    v.x += n;
    v.z += n * 0.7;
  };
  // needle tooth pointing along local -y (down) or +y (up)
  const tooth = (parent, x, y, z, up, len) => {
    const g = new THREE.ConeGeometry(0.0055, len, 7);
    if (!up) g.rotateX(Math.PI);
    g.translate(0, up ? len / 2 : -len / 2, 0);
    part(g, parent, { pos: [x, y, z], rot: [(Math.random() - 0.5) * 0.4 + (up ? -0.15 : 0.15), 0, (Math.random() - 0.5) * 0.4], bone: true, edges: 30 });
  };

  const root = new THREE.Group();
  const hips = joint(root, [0, 1.15, 0]);
  part(sculpt(blob(0.16, 24, 16), (v) => {
    v.x *= 1.35; v.y *= 0.75; v.z *= 0.9;
    if (Math.abs(v.x) > 0.13 && v.y > 0) v.y += 0.03; // iliac crests
    skin(v, 0.006);
  }), hips);

  const spine = joint(hips, [0, 0.05, 0]);
  spine.rotation.x = 0.55;
  const profR = [[0.001, -0.02], [0.14, 0.0], [0.145, 0.08], [0.125, 0.2], [0.115, 0.3], [0.13, 0.4], [0.18, 0.52], [0.21, 0.64], [0.225, 0.74], [0.21, 0.84], [0.16, 0.92], [0.07, 0.97], [0.001, 0.98]];
  const prof = profR.map(([r, y]) => new THREE.Vector2(r, y));
  part(sculpt(new THREE.LatheGeometry(prof, 40), (v) => {
    v.x *= 1.3;
    v.z *= 0.78;
    const h = Math.hypot(v.x, v.z) || 1;
    const hx = v.x / h, hz = v.z / h;
    // ribs pushing through starved skin
    if (v.y > 0.42 && v.y < 0.87 && hz > -0.35) {
      const rib = (Math.pow(Math.max(0, Math.sin((v.y - 0.42) * Math.PI * 2 * 15.5 + Math.abs(hx) * 2.2)), 2) * 0.036 - 0.01) * Math.min(1, (hz + 0.35) * 3);
      v.x += hx * rib;
      v.z += hz * rib;
      if (Math.abs(v.x) < 0.035 && hz > 0) v.z -= 0.012; // sternum groove
    }
    // sunken belly
    if (v.y > 0.1 && v.y < 0.4 && hz > 0) v.z -= 0.035 * hz * Math.sin(((v.y - 0.1) / 0.3) * Math.PI);
    // vertebrae
    if (hz < 0 && Math.abs(v.x) < 0.04) v.z -= 0.024 * Math.pow(Math.max(0, Math.sin(v.y * Math.PI * 2 * 13)), 2) * (1 - Math.abs(v.x) / 0.04);
    // shoulder blades
    if (hz < 0 && v.y > 0.58 && v.y < 0.84) {
      const ax = Math.abs(v.x);
      if (ax > 0.05 && ax < 0.17) v.z -= 0.028 * Math.sin(((ax - 0.05) / 0.12) * Math.PI) * Math.sin(((v.y - 0.58) / 0.26) * Math.PI);
    }
    skin(v, 0.006);
  }), spine);
  // bony spikes erupting along the spine
  const rAt = (y) => {
    for (let i = 0; i < profR.length - 1; i++) if (y <= profR[i + 1][1]) {
      const f = (y - profR[i][1]) / (profR[i + 1][1] - profR[i][1]);
      return profR[i][0] + (profR[i + 1][0] - profR[i][0]) * f;
    }
    return 0.05;
  };
  for (let i = 0; i < 10; i++) {
    const y = 0.12 + i * 0.08;
    const len = 0.04 + Math.sin((i / 9) * Math.PI) * 0.06;
    const c = new THREE.ConeGeometry(0.012, len, 7);
    c.translate(0, len / 2, 0);
    part(c, spine, { pos: [0, y, -rAt(y) * 0.78 + 0.01], rot: [-1.9, 0, 0], bone: true, edges: 30 });
  }
  // collarbones
  for (const sx of [-1, 1]) part(taper([V(0.02 * sx, 0.9, 0.08), V(0.15 * sx, 0.9, 0.06), V(0.27 * sx, 0.86, -0.01)], 0.014, { radial: 8, tubular: 8 }), spine);

  const chest = joint(spine, [0, 0.88, 0]);
  const neck = joint(chest, [0, 0.05, 0.05]);
  neck.rotation.x = 0.6;
  part(taper([V(0, -0.02, 0), V(0, 0.2, 0.02), V(0, 0.44, 0)], [0.075, 0.05, 0.046, 0.055], { radial: 16, tubular: 16, noise: 0.006, noiseScale: 20 }), neck);
  for (const sx of [-1, 1]) part(taper([V(0.035 * sx, -0.02, 0.05), V(0.04 * sx, 0.22, 0.05), V(0.03 * sx, 0.42, 0.02)], 0.011, { radial: 6, tubular: 10 }), neck);
  for (let i = 0; i < 5; i++) part(blob(0.018, 8, 6), neck, { pos: [0, 0.04 + i * 0.085, -0.045], scale: [1, 0.7, 1] });

  const head = joint(neck, [0, 0.44, 0]);
  head.rotation.x = -0.9;
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const hole = (geo, parent, pos, scale = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, black);
    m.position.set(...pos);
    m.scale.set(...scale);
    parent.add(m);
  };
  part(sculpt(blob(0.145, 48, 36), (v) => {
    v.z *= 1.22;
    if (v.z < 0) v.y += -v.z * 0.14;
    if (v.y < 0.0) v.x *= 0.8 + v.y * 0.6; // gaunt, narrow lower face
    if (v.z > 0.04) v.x *= 1 - (v.z - 0.04) * 0.9;
    // heavy brow
    v.z += 0.022 * Math.exp(-(((v.y - 0.06) / 0.018) ** 2)) * Math.max(0, v.z / 0.17);
    // deep, wide eye sockets
    for (const ex of [-0.05, 0.05]) {
      const d = Math.hypot((v.x - ex) * 0.9, v.y - 0.025);
      if (v.z > 0.04) v.z -= 0.075 * Math.exp(-((d / 0.03) ** 2));
    }
    // cheekbones out, cheeks sucked in below them
    for (const cx of [-0.075, 0.075]) {
      const d1 = Math.hypot(v.x - cx, v.y + 0.005);
      v.x += Math.sign(cx) * 0.012 * Math.exp(-((d1 / 0.02) ** 2));
      const d2 = Math.hypot(v.x - cx * 0.9, v.y + 0.06);
      v.x -= Math.sign(cx) * 0.03 * Math.exp(-((d2 / 0.035) ** 2));
    }
    // maw recess where the jaw has torn open
    if (v.y < -0.035 && v.z > 0.02) v.z -= 0.06 * Math.min(1, (-0.035 - v.y) / 0.04);
    // nasal cavity
    const dn = Math.hypot(v.x * 1.4, v.y + 0.012);
    if (v.z > 0.1) v.z -= 0.035 * Math.exp(-((dn / 0.016) ** 2));
    skin(v, 0.006, 26);
  }), head, { pos: [0, 0.05, 0.06] });
  // pitch-black voids: eyes, nose, throat
  for (const ex of [-0.05, 0.05]) hole(new THREE.SphereGeometry(0.026, 14, 10), head, [ex, 0.074, 0.165], [1, 0.85, 0.6]);
  hole(new THREE.SphereGeometry(0.014, 10, 8), head, [0, 0.04, 0.215], [1, 1.3, 0.6]);
  hole(new THREE.SphereGeometry(0.075, 16, 12), head, [0, -0.06, 0.1], [0.85, 0.7, 1.1]);
  // torn oversized ears
  for (const sx of [-1, 1]) {
    const ear = joint(head, [0.118 * sx, 0.055, 0.0]);
    ear.rotation.set(0.2, sx * 1.35, 0);
    part(sculpt(new THREE.TorusGeometry(0.048, 0.011, 8, 28, Math.PI * 1.55), (v) => skin(v, 0.004, 30)), ear, { rot: [0, 0, sx > 0 ? -0.6 : 0.6 + Math.PI * 0.45], scale: [1, 1.5, 0.55] });
    part(sculpt(blob(0.035, 14, 10), (v) => { v.z *= 0.25; skin(v, 0.004, 30); }), ear, { pos: [0, -0.01, -0.004] });
  }
  // upper gum + needle teeth
  const arc = (r, z0, y, n, a0 = 1.15) => Array.from({ length: n }, (_, i) => {
    const a = -a0 + (2 * a0 * i) / (n - 1);
    return V(Math.sin(a) * r, y, z0 + Math.cos(a) * r * 1.4);
  });
  part(taper(arc(0.062, 0.03, -0.06, 9), 0.013, { radial: 8, tubular: 20 }), head);
  for (const p of arc(0.066, 0.03, -0.068, 17)) tooth(head, p.x, p.y, p.z, false, 0.04 + Math.random() * 0.06);

  const jaw = joint(head, [0, -0.06, 0.05]);
  jaw.rotation.x = 0.35;
  part(taper(arc(0.066, -0.02, -0.01, 9), [0.024, 0.02, 0.024], { radial: 10, tubular: 24 }), jaw);
  part(sculpt(blob(0.06, 18, 10), (v) => { v.y *= 0.3; v.z *= 1.35; skin(v, 0.003, 30); }), jaw, { pos: [0, -0.016, 0.06] });
  for (const p of arc(0.064, -0.02, 0.0, 16)) tooth(jaw, p.x, p.y, p.z, true, 0.035 + Math.random() * 0.05);
  hole(new THREE.SphereGeometry(0.06, 14, 10), jaw, [0, 0.01, 0.05], [0.9, 0.5, 1.2]);
  // long tongue lolling out
  part(taper([V(0, -0.005, 0.0), V(0, -0.01, 0.12), V(0.015, -0.07, 0.2), V(0.03, -0.17, 0.21), V(0.025, -0.24, 0.19)], [0.026, 0.02, 0.014, 0.009, 0.004], { radial: 10, tubular: 24, flat: 0.45 }), jaw);
  // strings of drool
  for (const sx of [-1, 1]) part(taper([V(0.055 * sx, -0.01, 0.02), V(0.058 * sx, -0.1, 0.03), V(0.057 * sx, -0.19, 0.025)], [0.004, 0.002, 0.005], { radial: 5, tubular: 8 }), jaw, { edges: 0 });

  const arms = [];
  for (const s of [-1, 1]) {
    const sh = joint(chest, [s * 0.29, -0.05, 0]);
    part(sculpt(blob(0.065, 16, 12), (v) => skin(v, 0.006)), sh);
    const upper = joint(sh, [0, 0, 0]);
    part(taper([V(0, 0, 0), V(0.01 * s, -0.37, 0.01), V(0, -0.76, 0)], [0.056, 0.04, 0.031, 0.034, 0.045], { radial: 14, tubular: 18, noise: 0.006, noiseScale: 16, seed: s }), upper);
    const fore = joint(upper, [0, -0.75, 0]);
    part(sculpt(blob(0.045, 12, 10), (v) => skin(v, 0.006)), fore);
    part(taper([V(0, 0, 0), V(0, -0.4, 0.012), V(0, -0.82, 0)], [0.042, 0.036, 0.029, 0.023, 0.026], { radial: 14, tubular: 18, flat: 0.75, noise: 0.005, noiseScale: 18, seed: s + 3 }), fore);
    // bone spur through the elbow
    const spur = new THREE.ConeGeometry(0.014, 0.13, 8);
    spur.translate(0, 0.065, 0);
    part(spur, fore, { pos: [0, 0.0, -0.03], rot: [-2.3, 0, 0], bone: true, edges: 30 });
    const hand = joint(fore, [0, -0.82, 0]);
    part(sculpt(blob(0.05, 16, 12), (v) => { v.y *= 1.3; v.z *= 0.42; v.y -= 0.035; skin(v, 0.004, 25); }), hand);
    for (let f = 0; f < 5; f++) {
      const thumb = f === 4;
      const x = thumb ? s * -0.045 : (f - 1.5) * 0.024;
      const L = thumb ? 0.6 : 1 - Math.abs(f - 1.5) * 0.12;
      const pts = thumb
        ? [V(x, -0.04, 0.015), V(x * 1.3, -0.1, 0.04), V(x * 1.2, -0.17, 0.07)]
        : [V(x, -0.085, 0), V(x * 1.05, -0.085 - 0.13 * L, 0.025), V(x * 1.1, -0.085 - 0.26 * L, 0.07), V(x * 1.1, -0.085 - 0.36 * L, 0.12)];
      part(taper(pts, [0.012, 0.013, 0.0095, 0.011, 0.008, 0.0065], { radial: 8, tubular: 14 }), hand);
      const tip = pts[pts.length - 1], prev = pts[pts.length - 2];
      const dir = tip.clone().sub(prev).normalize();
      const claw = new THREE.ConeGeometry(0.0065, 0.075, 7);
      claw.translate(0, 0.0375, 0);
      claw.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.add(V(0, 0, 0.3)).normalize()));
      claw.translate(tip.x, tip.y, tip.z);
      part(claw, hand, { bone: true, edges: 30 });
    }
    arms.push({ sh, upper, fore, hand, s });
  }

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = joint(hips, [s * 0.16, -0.05, 0]);
    const thigh = joint(hip, [0, 0, 0]);
    part(taper([V(0, 0.02, 0), V(0, -0.3, 0.015), V(0, -0.61, 0)], [0.085, 0.068, 0.05, 0.058], { radial: 16, tubular: 16, noise: 0.007, noiseScale: 14, seed: s * 7 }), thigh);
    const shin = joint(thigh, [0, -0.6, 0]);
    part(sculpt(blob(0.055, 14, 10), (v) => skin(v, 0.006)), shin, { pos: [0, 0, 0.012] });
    part(taper([V(0, 0, 0), V(0, -0.28, -0.012), V(0, -0.56, 0)], [0.05, 0.042, 0.032, 0.03], { radial: 14, tubular: 16, noise: 0.005, noiseScale: 16, seed: s * 9 }), shin);
    const foot = joint(shin, [0, -0.55, 0]);
    part(taper([V(0, 0.01, -0.04), V(0, -0.015, 0.08), V(0, -0.03, 0.17)], [0.036, 0.03, 0.022], { radial: 12, tubular: 12, flat: 0.55 }), foot);
    for (let t = 0; t < 3; t++) {
      const x = (t - 1) * 0.022;
      const pts = [V(x, -0.025, 0.15), V(x * 1.3, -0.035, 0.22), V(x * 1.5, -0.04, 0.27)];
      part(taper(pts, [0.011, 0.01, 0.007], { radial: 7, tubular: 8 }), foot);
      const claw = new THREE.ConeGeometry(0.006, 0.05, 6);
      claw.rotateX(Math.PI / 2 + 0.5);
      claw.translate(x * 1.5, -0.045, 0.29);
      part(claw, foot, { bone: true, edges: 30 });
    }
    legs.push({ hip, thigh, shin, foot, s });
  }

  root.scale.setScalar(1.12);
  return { root, hips, spine, chest, neck, head, jaw, arms, legs, mats: [mat, boneMat, lmat] };
}

export class Monster {
  constructor(scene, level, audio) {
    this.level = level;
    this.audio = audio;
    this.body = buildBody();
    this.obj = this.body.root;
    this.obj.visible = false;
    scene.add(this.obj);
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.state = 'dormant';
    this.path = null;
    this.target = null;
    this.speed = 0;
    this.phase = 0;
    this.stepAcc = 0;
    this.suspicion = 0;
    this.stateT = 0;
    this.breathT = 0;
    this.inhale = false;
    this.twitch = 0;
    this.idleT = 0;
    this.sniffCd = 0;
    this.voice = null;
    this.lunge = null;
    this.onKill = null;
    this.forcedTarget = null;
    this.headWorld = new THREE.Vector3();
    this.clock = 0; // game time while active
    // eased after repeated deaths at the same checkpoint
    this.assist = { hear: 1, speed: 1 };
  }

  get active() {
    return this.state !== 'dormant';
  }

  spawn(pos, state = 'wander') {
    this.pos.copy(pos);
    this.pos.y = 0;
    this.obj.visible = true;
    this.state = state;
    this.path = null;
    this.suspicion = 0;
    this.stateT = 0;
    this.lunge = null;
    this.afterSniff = null;
    this.checkList = null;
    this.sniffCd = 0;
    this.curSpeed = 0;
    this.scare = null;
    this.bashing = null;
    this.body.mats[0].uniforms.uLit.value = 0;
    this.body.mats[1].uniforms.uLit.value = 0;
    if (!this.voice && this.audio.ctx) this.voice = this.audio.createMonsterVoice();
  }

  despawn() {
    this.state = 'dormant';
    this.obj.visible = false;
    if (this.voice) this.voice.silence();
  }

  goTo(target, state) {
    this.target = target.clone();
    this.path = this.level.findPath(this.pos, this.target);
    if (this.path) this.path.shift();
    this.setState(state);
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
    if (s === 'search') this.idleT = 0;
  }

  // Called for every audible event. source: 'player' | 'stone' | 'machine' | 'world'
  hear(pos, radius, source, kind, playerPos) {
    if (!this.active || this.state === 'kill' || this.state === 'lunge' || this.state === 'windup' || this.state === 'scripted') return false;
    const d = tmp.set(pos.x - this.pos.x, 0, pos.z - this.pos.z).length();
    const occ = this.level.occlusion(this.pos, pos);
    const reach = radius * (1.15 - occ * 0.5) * this.assist.hear;
    if (d > reach) return false;
    const prox = 1 - d / reach;
    const pd = playerPos ? Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z) : 99;
    if (source === 'player') {
      const w = { step: 0.35, run: 0.7, click: 0.5, breath: 0.6, gasp: 1.2, fall: 1.2, crouch: 0.25, door: 0.6, item: 0.3 }[kind] ?? 0.4;
      this.suspicion = Math.min(1.5, this.suspicion + w * (0.5 + prox));
      if (this.state === 'recover') return true;
      if (pd < 3.4) {
        // something right next to it: certain -> strike, otherwise freeze and listen.
        // The first moment of a sniff is a grace window: you get time to stop breathing.
        const grace = this.state === 'sniff' && this.stateT < 1.4;
        if (this.suspicion > 0.62 && !grace) this.startWindup(playerPos);
        else if (this.state !== 'sniff') this.startSniff(true);
        return true;
      }
    }
    if (this.state === 'recover') return true;
    // close and certain: it comes running for you
    if (source === 'player' && pd < 11 && this.suspicion > 0.5 && ['run', 'step', 'click', 'door', 'gasp', 'fall'].includes(kind) && this.state !== 'chase') {
      this.startChase();
      return true;
    }
    if (this.state === 'chase') return true;
    // going round the hiding places it keeps to its round: small sounds only make
    // it surer (the sniff at the right door will find you)
    if ((this.state === 'check' || (this.state === 'sniff' && this.afterSniff === 'check')) && source === 'player' && ['breath', 'crouch', 'item', 'step'].includes(kind)) return true;
    // lying in wait it doesn't move for small sounds — it only turns its head
    if (this.state === 'ambush' && radius < 9 && pd > 3.4) {
      this.turnTowards(pos, 0.6);
      return true;
    }
    // it learns: stones thrown again and again stop fooling it, and it goes
    // looking for whoever is throwing them
    if (source === 'stone' && playerPos) {
      // game time, so a pause doesn't count
      const now = this.clock;
      this.lures = (this.lures || []).filter((t) => now - t < 70);
      this.lures.push(now);
      if (this.lures.length >= 3) {
        const guess = playerPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
        this.goTo(guess, 'investigate');
        this.suspicion = Math.max(this.suspicion, 0.45);
        if (this.onWise) this.onWise();
        return true;
      }
    }
    // inexact localisation for far sounds
    const err = (1 - prox) * Math.min(3, d * 0.15);
    const t = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * err, 0, (Math.random() - 0.5) * err));
    const loud = radius >= 9 || this.suspicion > 0.55 || source === 'stone';
    this.goTo(t, loud ? 'hunt' : 'investigate');
    if (loud && Math.random() < 0.35) this.audio.monsterRoar(this.headWorld);
    return true;
  }

  startSniff(force = false) {
    if (this.state === 'sniff' && !force) return;
    const now = performance.now();
    if (!this.lastSting || now - this.lastSting > 25000) {
      this.lastSting = now;
      this.audio.stinger('mid', 0.45);
    }
    this.state = 'sniff';
    this.stateT = 0;
    this.path = null;
    this.sniffCd = 8;
    this.doSniff();
  }

  // shadow the player from just out of sight: move, stop, listen, move closer
  stalk(duration = 40) {
    if (!this.active || this.state === 'chase' || this.state === 'kill') return;
    this.setState('stalk');
    this.stalkT = duration;
    this.stalkWait = 0;
    this.path = null;
  }

  // walk to a spot on the player's way and wait there without a sound
  ambush(point) {
    if (!this.active || this.state === 'chase' || this.state === 'kill') return;
    this.ambushAt = point.clone();
    this.ambushT = 32;
    this.goTo(point, 'ambushGo');
  }

  // after losing the player: listen at each nearby hiding place in turn
  checkSpots(spots) {
    this.checkList = spots.slice();
    this.nextCheck();
  }
  nextCheck() {
    const s = this.checkList && this.checkList.shift();
    if (!s) {
      // nothing: it gives up and leaves, so a held breath is enough
      this.afterSniff = null;
      const away = this.level.randomWalkable(this.pos, 16, 9);
      if (away) this.goTo(away, 'investigate');
      else this.setState('search');
      this.idleT = 0;
      return;
    }
    const out = new THREE.Vector3(s.front.x - s.inside.x, 0, s.front.z - s.inside.z).normalize();
    this.goTo(s.front.clone().addScaledVector(out, 0.35), 'check');
  }

  startChase() {
    if (this.state === 'chase' || this.state === 'kill') return;
    this.setState('chase');
    this.chaseT = 0;
    this.lostT = 0;
    this.repathT = 0;
    this.audio.monsterRoar(this.headWorld);
    this.audio.stinger('low', 0.8);
    echo.emit(this.headWorld, { radius: 9, speed: 12, strength: 1.2, decay: 0.7, color: COLORS.monster });
    if (this.onChase) this.onChase(true);
  }

  endChase(lastSeen) {
    this.target = lastSeen ? lastSeen.clone() : this.pos.clone();
    this.path = this.level.findPath(this.pos, this.target);
    if (this.path) this.path.shift();
    this.setState('search');
    // it knows you went to ground somewhere close: it checks the hiding places
    const t = this.target;
    const spots = this.level.items
      .filter((it) => it.type === 'locker' && Math.hypot(it.front.x - t.x, it.front.z - t.z) < 7)
      .sort((a, b) => Math.hypot(a.front.x - t.x, a.front.z - t.z) - Math.hypot(b.front.x - t.x, b.front.z - t.z))
      .slice(0, 2);
    if (spots.length) this.checkSpots(spots);
    this.audio.play('m_growl', this.headWorld, { gain: 0.9, rate: 0.7, wet: 0.8 });
    if (this.onChase) this.onChase(false);
  }

  startWindup(playerPos) {
    this.setState('windup');
    this.lunge = { target: playerPos.clone(), t: 0, dir: new THREE.Vector3() };
    this.lunge.dir.set(playerPos.x - this.pos.x, 0, playerPos.z - this.pos.z).normalize();
    this.yaw = Math.atan2(this.lunge.dir.x, this.lunge.dir.z);
    this.audio.monsterHiss(this.headWorld, 1.1);
    echo.emit(this.headWorld, { radius: 3.5, speed: 6, strength: 1.4, decay: 0.6, color: COLORS.monster });
  }

  update(dt, player, game) {
    if (!this.active) return;
    this.clock += dt;
    this.stateT += dt;
    this.suspicion = Math.max(0, this.suspicion - dt * (this.state === 'hunt' ? 0.04 : 0.09));
    if (this.state !== 'sniff') this.sniffCd -= dt;
    const pp = player.pos;
    const pd = Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z);

    switch (this.state) {
      case 'wander': {
        this.speed = 1.05 * this.assist.speed;
        if (!this.path || !this.path.length) {
          if (this.idleT > 0) {
            this.idleT -= dt;
            this.speed = 0;
          } else {
            const t = this.forcedTarget
              ? this.level.randomWalkable(this.forcedTarget, 6)
              : (Math.random() < 0.22 ? this.level.randomWalkable(pp, 18, 8) : this.level.randomWalkable(this.pos, 18, 6));
            if (t) {
              this.target = t;
              this.path = this.level.findPath(this.pos, t);
              if (this.path) this.path.shift();
            }
            if (Math.random() < 0.55) this.idleT = 3 + Math.random() * 4;
          }
        }
        this.proximitySniff(pd, player);
        break;
      }
      case 'investigate':
        this.speed = 1.6 * this.assist.speed;
        if (!this.path || !this.path.length) this.setState('search');
        this.proximitySniff(pd, player);
        break;
      case 'hunt':
        this.speed = 3.1 * this.assist.speed;
        if (!this.path || !this.path.length) {
          if (player.hidden && pd < 3) this.startSniff(true);
          else this.setState('search');
        }
        if (pd < 1.6) {
          if (this.suspicion > 0.9) this.startWindup(player.pos);
          else this.startSniff(true);
        }
        break;
      case 'scripted':
        this.speed = this.ramming ? 0 : this.scriptSpeed || 0;
        break;
      case 'stalk': {
        this.speed = 1.25 * this.assist.speed;
        this.stalkT -= dt;
        if (this.stalkT <= 0) {
          // it has had its look: it drifts off (and the tension can breathe)
          const far = this.level.randomWalkable(this.pos, 24, 14);
          if (far) this.goTo(far, 'wander');
          else this.setState('wander');
          break;
        }
        if (!this.path || !this.path.length) {
          this.speed = 0;
          this.turnTowards(pp, dt * 0.8); // listening toward you
          this.stalkWait -= dt;
          if (this.stalkWait <= 0) {
            // a new spot: near you, but with a wall between
            let pick = null;
            for (let k = 0; k < 24 && !pick; k++) {
              const c = this.level.randomWalkable(pp, 10.5, 5.5);
              if (!c) continue;
              const hidden = this.level.occlusion(pp, c) > 0.35 || player.hidden;
              if (hidden || k > 18) pick = c;
            }
            if (pick) {
              this.path = this.level.findPath(this.pos, pick);
              if (this.path) this.path.shift();
            }
            this.stalkWait = 2.5 + Math.random() * 3.5;
          }
          // now and then a breath close by, so you know it's there
          this.cueT = (this.cueT ?? 4) - dt;
          if (this.cueT <= 0) {
            this.cueT = 6 + Math.random() * 5;
            this.audio.play('m_breath', this.headWorld, { gain: 0.55, rate: 0.8 + Math.random() * 0.15, wet: 0.6 });
          }
        }
        this.proximitySniff(pd, player);
        break;
      }
      case 'ambushGo':
        this.speed = 2.0 * this.assist.speed;
        if (!this.path || !this.path.length) {
          this.setState('ambush');
          this.turnTowards(pp, PI);
        }
        break;
      case 'ambush':
        // dead still, silent, waiting for you to walk into it
        this.speed = 0;
        this.ambushT -= dt;
        this.turnTowards(pp, dt * 0.4);
        if (pd < 3.3 && !player.hidden) {
          this.audio.stinger('high', 1.0);
          this.startChase();
          break;
        }
        if (this.ambushT <= 0) this.setState('wander');
        break;
      case 'check':
        this.speed = 2.4 * this.assist.speed;
        if (!this.path || !this.path.length) {
          this.afterSniff = 'check';
          this.startSniff(true);
        }
        break;
      case 'chase': {
        this.speed = 3.4 * this.assist.speed;
        this.chaseT += dt;
        this.repathT -= dt;
        const reachable = !player.hidden && this.level.ceilAt(Math.floor(pp.x), Math.floor(pp.z)) >= 1.7;
        if (reachable) this.lastSeen = pp.clone();
        if (this.repathT <= 0 && reachable) {
          this.repathT = 0.35;
          this.path = this.level.findPath(this.pos, pp);
          if (this.path) this.path.shift();
        }
        // lose you: hidden, crawled away, too far for too long, or it simply tires
        if (!reachable || pd > 15) this.lostT += dt;
        else this.lostT = Math.max(0, this.lostT - dt);
        if (this.lostT > (reachable ? 2.5 : 0.6) || this.chaseT > 24 || (!this.path && reachable)) {
          this.endChase(this.lastSeen);
          break;
        }
        if (pd < 1.45 && reachable) {
          this.startWindup(pp);
          this.lunge.fast = true;
          if (this.onChase) this.onChase(false);
        }
        break;
      }
      case 'search': {
        this.speed = 0.75;
        if (!this.path || !this.path.length) {
          if (this.idleT > 0) {
            this.idleT -= dt;
            this.speed = 0;
          } else {
            const t = this.level.randomWalkable(this.target || this.pos, 3.5, 1);
            if (t) {
              this.path = this.level.findPath(this.pos, t);
              if (this.path) this.path.shift();
            }
            this.idleT = 1 + Math.random() * 2.5;
            if (Math.random() < 0.5) this.doSniff();
          }
        }
        if (this.stateT > 7 + Math.random() * 2.5) this.setState('wander');
        this.proximitySniff(pd, player);
        break;
      }
      case 'sniff':
        this.speed = 0;
        // turn towards the faint scent of the player
        this.turnTowards(pp, dt * 1.2);
        // leans in, creeping closer to the warmth
        if (pd > 1.2 && this.stateT < 3) {
          const k = (0.3 * dt) / pd;
          this.pos.x += (pp.x - this.pos.x) * k;
          this.pos.z += (pp.z - this.pos.z) * k;
        }
        // right up against your hiding place: it hears you breathe unless you don't
        if (player.hidden && pd < 2.2 && this.stateT > 1.4 && !player.holding) {
          this.suspicion += dt * 1.0;
          if (this.suspicion > 0.95) {
            this.startWindup(pp);
            break;
          }
        }
        if (this.stateT > 2.3 && this.afterSniff === 'check') {
          this.nextCheck();
          break;
        }
        if (this.stateT > 3.6) {
          // it moves on, away from the player
          // turn around: pick a spot on the far side from the player
          const tx = pp.x - this.pos.x, tz = pp.z - this.pos.z;
          let away = null;
          for (let k = 0; k < 30 && !away; k++) {
            const c = this.level.randomWalkable(this.pos, 14, 5);
            if (c && (c.x - this.pos.x) * tx + (c.z - this.pos.z) * tz < -0.3 * c.distanceTo(this.pos) * pd) away = c;
          }
          away = away || this.level.randomWalkable(this.pos, 12, 6);
          if (away) this.goTo(away, 'investigate');
        }
        break;
      case 'windup':
        this.speed = 0;
        if (this.stateT > (this.lunge && this.lunge.fast ? 0.25 : 0.45)) {
          this.setState('lunge');
          this.lunge.t = 0;
          this.audio.monsterRoar(this.headWorld);
        }
        break;
      case 'lunge': {
        const step = 9 * dt;
        const p2 = this.pos.clone().addScaledVector(this.lunge.dir, step);
        const before = p2.clone();
        this.level.collide(p2, 0.3);
        this.pos.copy(p2);
        this.lunge.t += dt;
        // a hiding place is no use once it has heard you in it: it tears it open
        const ld = Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z);
        if (ld < 0.85 || (player.hidden && ld < 1.7)) {
          this.kill(player);
          break;
        }
        if (this.lunge.t > 0.5 || before.distanceTo(p2) > 0.05) {
          this.setState('recover');
          this.suspicion = 0.3;
          this.audio.monsterStep(this.pos, 2);
          echo.emit(this.pos, { radius: 6, speed: 10, strength: 1.2, color: COLORS.monster });
        }
        break;
      }
      case 'recover':
        this.speed = 0;
        if (this.stateT > 2.4) {
          this.target = this.pos.clone();
          this.setState('search');
        }
        break;
      case 'kill':
        this.speed = 0;
        break;
    }

    if (this.state !== 'lunge') this.move(dt);
    this.animate(dt, player);
    this.sounds(dt, pd, player);
    if (this.voice) this.voice.setPos(this.headWorld);
  }

  proximitySniff(pd, player) {
    // Walking blindly into the player: it senses warmth, stops and sniffs.
    if (pd < 1.9 && this.state !== 'sniff' && this.sniffCd <= 0) {
      this.startSniff();
      this.suspicion += 0.2;
    }
    if (pd < 0.8 && this.state !== 'sniff') {
      // bumped right into you
      this.suspicion += 0.5;
      if (this.suspicion > 0.62) this.startWindup(player.pos);
      else this.startSniff(true);
    }
  }

  doSniff() {
    this.audio.monsterSniff(this.headWorld);
    this.twitch = 1;
  }

  turnTowards(p, rate) {
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    let d = want - this.yaw;
    while (d > PI) d -= 2 * PI;
    while (d < -PI) d += 2 * PI;
    this.yaw += Math.max(-rate, Math.min(rate, d));
  }

  move(dt) {
    // a closed door in the way: smash it down
    if (this.bashing) {
      this.curSpeed = 0;
      this.bashT -= dt;
      if (this.bashT <= 0) {
        this.bashT = 0.85;
        const done = this.level.bashDoor(this.bashing);
        this.audio.play('slam', this.bashing.center, { gain: 1.1, rate: 0.75 + Math.random() * 0.2, wet: 0.8 });
        echo.emit(this.bashing.center, { radius: 6, speed: 11, strength: 1.2, color: COLORS.monster });
        if (this.onBash) this.onBash(this.bashing);
        if (done) this.bashing = null;
      }
      return;
    }
    if (this.speed > 0 && this.level.slamDoorAhead) {
      const d = this.level.slamDoorAhead(this.pos, this.path && this.path[0]);
      if (d) {
        this.bashing = d;
        this.bashT = 0.35;
        return;
      }
    }
    if (!this.path || !this.path.length || this.speed <= 0) {
      this.curSpeed = THREE.MathUtils.lerp(this.curSpeed || 0, 0, dt * 6);
      return;
    }
    const wp = this.path[0];
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) {
      this.path.shift();
      return;
    }
    this.turnTowards(wp, dt * 5);
    this.curSpeed = THREE.MathUtils.lerp(this.curSpeed || 0, this.speed, dt * 3);
    const s = Math.min(d, this.curSpeed * dt);
    this.pos.x += (dx / d) * s;
    this.pos.z += (dz / d) * s;
    this.keepClear();
  }

  // keep the feet off walls; the posture (see animate) keeps the rest inside
  keepClear() {
    this.level.collide(this.pos, 0.3);
  }

  sounds(dt, pd, player) {
    const sp = this.curSpeed || 0;
    if (sp > 0.1 && this.state !== 'lunge') {
      this.stepAcc += sp * dt;
      const stride = this.state === 'hunt' || this.state === 'chase' ? 1.25 : 0.95;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const sneaking = this.state === 'stalk' || this.state === 'ambushGo' || this.state === 'check';
        const heavy = this.state === 'hunt' || this.state === 'chase' ? 1.6 : sneaking ? 0.4 : 0.8;
        this.audio.monsterStep(this.pos, heavy);
        if (player) {
          const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
          player.shake = Math.max(player.shake || 0, Math.max(0, 1 - d / 8) * (this.state === 'hunt' || this.state === 'chase' ? 1 : 0.6));
        }
        echo.emit(new THREE.Vector3(this.pos.x, 0.1, this.pos.z), {
          radius: this.state === 'hunt' || this.state === 'chase' ? 6.5 : sneaking ? 2.4 : 4.2, speed: 8, strength: this.state === 'hunt' || this.state === 'chase' ? 1.1 : 0.8, decay: 1.0, color: COLORS.monster,
        });
      }
    }
    // breathing rhythm + death-rattle croaks
    const agitated = this.state === 'hunt' || this.state === 'windup' || this.state === 'chase';
    const loud = agitated ? 1.0 : this.state === 'sniff' || this.state === 'search' ? 0.7 : 0.45;
    this.breathT -= dt;
    const silent = this.state === 'ambush';
    if (this.breathT <= 0 && this.voice && !silent) {
      this.inhale = !this.inhale;
      this.voice.breathe(this.inhale, loud);
      this.breathT = agitated ? (this.inhale ? 0.7 : 0.85) : (this.inhale ? 1.3 : 1.9) + Math.random() * 0.7;
    }
    this.croakT = (this.croakT ?? 4) - dt;
    if (this.croakT <= 0 && this.voice && this.state !== 'windup' && this.state !== 'kill' && !silent && this.state !== 'stalk') {
      this.croakT = agitated ? 2.5 + Math.random() * 2 : 5 + Math.random() * 7;
      this.voice.croak(this.state === 'sniff' ? 0.4 : loud);
    }
    // occasional echolocating click when searching — briefly reveals the room in red
    if ((this.state === 'search' || this.state === 'wander') && Math.random() < dt * 0.05) {
      this.audio.monsterClick(this.headWorld);
      echo.emit(this.headWorld, { radius: 9, speed: 7, strength: 0.7, decay: 0.9, color: COLORS.monster });
    }
  }

  kill(player) {
    if (this.state === 'kill') return;
    this.setState('kill');
    this.path = null;
    // face the player, close in
    const dir = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z).normalize();
    this.yaw = Math.atan2(dir.x, dir.z);
    this.pos.set(player.pos.x - dir.x * 0.75, 0, player.pos.z - dir.z * 0.75);
    if (this.onKill) this.onKill();
  }

  // the screamer: rush the camera, face filling the screen
  startScare(camera) {
    this.setState('kill');
    this.path = null;
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    f.y = 0;
    f.normalize();
    this.scare = { t: 0, cam: camera.position.clone(), f };
    this.yaw = Math.atan2(-f.x, -f.z);
  }

  animate(dt, player) {
    const b = this.body;
    const sp = this.curSpeed || 0;
    this.phase += dt * sp * 3.0;
    const t = performance.now() / 1000;
    const kill = this.state === 'kill';

    if (kill && this.scare) this.scare.t += dt;
    this.obj.position.copy(this.pos);
    this.obj.rotation.y = this.yaw;
    // fit the room: it folds itself smaller under low ceilings and in the duct,
    // and narrows its shoulders between close walls
    {
      // lowest ceiling where it is and where its head is about to be
      let ceil = 9;
      for (const d of [0, 0.6, 1.2]) {
        const c = this.level.ceilAt(Math.floor(this.pos.x + Math.sin(this.yaw) * d), Math.floor(this.pos.z + Math.cos(this.yaw) * d));
        if (c > 0) ceil = Math.min(ceil, c);
      }
      const side = this.level.clearance ? this.level.clearance(this.pos.x, this.pos.z) : 1;
      this.lowAhead = ceil < 1.7;
      const sWant = kill ? 1 : ceil < 1.7 ? 0.66 : THREE.MathUtils.clamp((ceil - 0.1) / 2.65, 0.8, 1);
      this.fitS = THREE.MathUtils.lerp(this.fitS ?? sWant, sWant, Math.min(1, dt * (sWant < this.fitS ? 6 : 2)));
      this.tuckK = THREE.MathUtils.lerp(this.tuckK || 0, kill ? 0 : THREE.MathUtils.clamp((0.95 - side) / 0.4, 0, 1), Math.min(1, dt * 4));
      const sx = this.fitS * (1 - this.tuckK * 0.18);
      this.obj.scale.set(sx, this.fitS, this.fitS);
    }

    // stop-motion: limbs snap between poses at irregular intervals — the body
    // glides but the joints jerk, which reads as deeply wrong
    this.snapT = (this.snapT ?? 0) - dt;
    if (this.snapT > 0 && !kill) {
      this.obj.updateMatrixWorld(true);
      b.head.getWorldPosition(this.headWorld);
      return;
    }
    this.snapT = (0.05 + Math.random() * 0.09) * (this.state === 'hunt' ? 0.6 : 1);

    const ph = this.phase;
    const amp = Math.min(1, sp / 1.4);
    // random violent head twitches
    this.twitchT = (this.twitchT ?? 2) - 0.08;
    if (this.twitchT <= 0) {
      this.twitchT = 8 + Math.random() * 30;
      this.twitch = 1;
      this.twY = (Math.random() - 0.5) * 1.4;
      this.twZ = (Math.random() - 0.5) * 1.6;
    }
    this.twitch = Math.max(0, (this.twitch || 0) - 0.12);
    const tw = this.twitch > 0.5 ? 1 : 0;

    let hipsY = 1.08 + Math.abs(Math.cos(ph)) * 0.05 * amp;
    let spineX = 0.55, neckX = 0.6, headX = -0.9, headY = 0, headZ = 0, jaw = 0.35;
    let arm = (i) => {
      const s = Math.sin(ph + i * Math.PI + Math.PI);
      return { ux: s * 0.4 * amp, uz: 0.15, fx: -0.3 - 0.3 * amp, hx: 0 };
    };
    let leg = (i) => {
      const s = Math.sin(ph + i * Math.PI);
      return { tx: -s * 0.55 * amp - 0.25, sx: Math.max(0, Math.cos(ph + i * Math.PI)) * 0.9 * amp + 0.45 };
    };
    const low = !!this.lowAhead;
    const crawl = ((this.state === 'hunt' || this.state === 'investigate' || this.state === 'chase' || this.state === 'scripted') && sp > 1.4) || low;
    this.crawling = crawl;

    if (kill) {
      spineX = 0.3; neckX = 0.7; headX = -2.05;
      jaw = 1.45 + Math.sin(t * 60) * 0.08;
      headY = (Math.random() - 0.5) * 0.5;
      headZ = (Math.random() - 0.5) * 0.5;
      hipsY = 1.0;
      arm = () => ({ ux: -2.3 + (Math.random() - 0.5) * 0.2, uz: 0.65, fx: -0.6, hx: 0.6 });
      leg = () => ({ tx: -0.5, sx: 0.8 });
    } else if (crawl && low) {
      // flattened into the duct: belly almost on the grating, elbows and knees splayed
      hipsY = 0.5 + Math.abs(Math.sin(ph)) * 0.03;
      spineX = 1.5; neckX = -0.12; headX = -1.25;
      headY = Math.sin(t * 9) * 0.12;
      jaw = 0.6 + Math.sin(t * 21) * 0.1;
      arm = (i) => {
        const s = Math.sin(ph + i * Math.PI);
        return { ux: -2.75 + s * 0.3, uz: 0.55, fx: 2.3 - Math.max(0, Math.cos(ph + i * Math.PI)) * 0.4, hx: 1.0 };
      };
      leg = (i) => {
        const s = Math.sin(ph + i * Math.PI + 0.6);
        return { tx: -1.35 - s * 0.25, sx: 2.25 + Math.max(0, -Math.cos(ph + i * Math.PI)) * 0.2 };
      };
    } else if (crawl) {
      // galloping on all fours
      hipsY = 0.86 + Math.abs(Math.sin(ph)) * 0.08;
      spineX = 1.35; neckX = -0.45; headX = -0.7;
      headY = Math.sin(t * 13) * 0.15;
      jaw = 0.7 + Math.sin(t * 25) * 0.1;
      arm = (i) => {
        const s = Math.sin(ph + i * Math.PI);
        return { ux: -2.5 + s * 0.38, uz: 0.22, fx: 1.9 - Math.max(0, Math.cos(ph + i * Math.PI)) * 0.4, hx: 0.8 };
      };
      leg = (i) => {
        const s = Math.sin(ph + i * Math.PI + 0.6);
        return { tx: -0.9 - s * 0.35, sx: 1.5 + Math.max(0, -Math.cos(ph + i * Math.PI)) * 0.3 };
      };
    } else if (this.state === 'sniff' || (this.state === 'search' && sp < 0.1)) {
      spineX = 0.85;
      neckX = 0.95 + Math.sin(t * 2.3) * 0.1;
      headX = -1.0;
      headY = Math.sin(t * 1.1) * 0.5;
      headZ = 0.95 * Math.sign(Math.sin(t * 0.37) + 0.3); // listening head-tilt, far too far
      jaw = 0.3 + Math.min(0.7, this.stateT * 0.2);
    } else if (this.ramming) {
      // throwing its whole weight against the steel
      const k = Math.max(0, Math.sin(t * 6));
      spineX = 0.5 + k * 0.6; neckX = 0.2; headX = -0.6; jaw = 1.0;
      hipsY = 1.0 - k * 0.15;
      arm = () => ({ ux: -2.2 + k * 0.6, uz: 0.4, fx: -0.6, hx: 0.5 });
    } else if (this.state === 'windup') {
      spineX = 0.25; neckX = 0.35; headX = -1.25; jaw = 1.2;
      headY = (Math.random() - 0.5) * 0.12;
      arm = () => ({ ux: -1.6, uz: 0.65, fx: -1.1, hx: 0.5 });
    } else if (this.state === 'lunge') {
      spineX = 0.9; neckX = 0.3; headX = -0.3; jaw = 1.2;
      arm = () => ({ ux: -1.5, uz: 0.15, fx: -0.2, hx: 0.3 });
    } else if (this.state === 'recover') {
      spineX = 1.0; neckX = 0.4;
      headY = Math.sin(t * 5) * 0.5;
      headZ = Math.sin(t * 3.1) * 0.6;
    } else {
      headY = Math.sin(t * 0.7) * 0.25;
    }
    if (tw && !kill) {
      headY += this.twY;
      headZ += this.twZ;
    }
    // a wall right in front of its face: it rears up instead of leaning through it
    if (!kill && !low) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const want = (crawl ? 1.75 : 1.3) * this.fitS;
      let clear = want;
      for (let d = 0.3; d <= want; d += 0.1) {
        const x = this.pos.x + fx * d, z = this.pos.z + fz * d;
        if (!this.level.open(Math.floor(x), Math.floor(z)) || this.level.blockedPoint(x, z, 0.1)) {
          clear = d;
          break;
        }
      }
      const k = THREE.MathUtils.clamp((clear - 0.45) / (want - 0.45), 0, 1);
      this.rearK = THREE.MathUtils.lerp(this.rearK ?? 1, k, 0.35);
      spineX = THREE.MathUtils.lerp(0.12, spineX, this.rearK);
      neckX = THREE.MathUtils.lerp(0.35, neckX, this.rearK);
      if (crawl) hipsY = THREE.MathUtils.lerp(1.05, hipsY, this.rearK);
    }

    // squeezing through: arms drawn in where it's narrow
    const tuck = this.tuckK || 0;
    if (tuck > 0.01 && !kill) {
      const base = arm;
      arm = (i) => {
        const p = base(i);
        return { ux: p.ux * (1 - tuck * 0.35), uz: THREE.MathUtils.lerp(p.uz, -0.06, tuck), fx: p.fx, hx: p.hx };
      };
    }
    b.hips.position.y = hipsY;
    b.spine.rotation.x = spineX;
    b.neck.rotation.x = neckX;
    b.head.rotation.set(headX, headY, headZ);
    b.jaw.rotation.x = jaw;
    b.arms.forEach((a, i) => {
      const p = arm(i);
      a.upper.rotation.x = p.ux;
      a.upper.rotation.z = a.s * p.uz;
      a.fore.rotation.x = p.fx;
      a.hand.rotation.x = p.hx + Math.sin(t * 3 + i) * 0.1;
    });
    b.legs.forEach((l, i) => {
      const p = leg(i);
      l.thigh.rotation.x = p.tx;
      l.shin.rotation.x = p.sx;
      l.foot.rotation.x = -0.2;
    });
    this.obj.updateMatrixWorld(true);
    b.head.getWorldPosition(this.headWorld);
    if (kill && this.scare) {
      this.mouthWorld = this.mouthWorld || new THREE.Vector3();
      // place the root so the face lands right in front of the eyes
      const sc = this.scare;
      const d = THREE.MathUtils.lerp(1.9, 0.6, Math.min(1, sc.t / 0.16));
      for (let it = 0; it < 2; it++) {
        this.pos.x += sc.cam.x + sc.f.x * d - this.headWorld.x;
        this.pos.z += sc.cam.z + sc.f.z * d - this.headWorld.z;
        b.hips.position.y += (sc.cam.y + 0.08 - this.headWorld.y) / 1.12;
        this.obj.position.copy(this.pos);
        this.obj.updateMatrixWorld(true);
        // stare straight down the lens, shaking
        b.head.lookAt(sc.cam.x, sc.cam.y - 0.12, sc.cam.z);
        b.head.rotateZ((Math.random() - 0.5) * 0.35);
        b.head.rotateX((Math.random() - 0.5) * 0.15);
        b.head.updateMatrixWorld(true);
        b.head.getWorldPosition(this.headWorld);
      }
      b.jaw.getWorldPosition(this.mouthWorld);
      this.mouthWorld.lerp(this.headWorld, 0.5);
    }
  }
}
