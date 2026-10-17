// First-person view-model. The right hand holds a long white cane the way it is
// taught: arm forward, the tip swinging side to side in step with the feet and
// touching down on the floor ahead on the side of the foot that is about to land.
// The left hand guards the face while walking, flattens on walls, reaches for and
// takes the things you use, pumps when you run, throws, and clamps over the mouth
// when you hold your breath. Lit by the same echo waves as the world.
import * as THREE from 'three';
import { echoMaterial } from './echo.js';
import { taper } from './organic.js';
import { gripInfo } from './hands.js';
import { HandRig } from './hand-rig.js';
import { HandContact } from './hand-contact.js';
import { sampleWork } from './work-motion.js';
import { createFuelCan, createFuse, workMaterials } from './work-props.js';
import { Legs } from './legs.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const { lerp, clamp, smoothstep } = THREE.MathUtils;
const CANE_L = 2.2;

function mesh(geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.frustumCulled = false;
  parent.add(m);
  return m;
}

// a basis from "where the fingers point" and "where the back of the hand faces"
// (the left hands are mirrored meshes inside a properly rotated group)
function handQuat(fingers, back) {
  const Z = fingers.clone().normalize().negate();
  const Y = back.clone().addScaledVector(Z, -back.dot(Z)).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}

// critically-damped-ish spring on a vector
class Spring {
  constructor(k = 120, c = 16) {
    this.x = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.k = k;
    this.c = c;
  }
  step(target, dt) {
    const ax = (target.x - this.x.x) * this.k - this.v.x * this.c;
    const ay = (target.y - this.x.y) * this.k - this.v.y * this.c;
    const az = (target.z - this.x.z) * this.k - this.v.z * this.c;
    this.v.x += ax * dt;
    this.v.y += ay * dt;
    this.v.z += az * dt;
    this.x.addScaledVector(this.v, dt);
    return this.x;
  }
}

function arm(skin, sleeve, cuff, parent) {
  const g = new THREE.Group();
  parent.add(g);
  // sleeve of a worn hospital gown: slightly baggy, with folds, rolled cuff
  mesh(taper([V(0, 0.006, 0.5), V(0, 0.01, 0.26), V(0, 0.004, 0.07)], [0.052, 0.043, 0.034], { radial: 22, tubular: 18, noise: 0.0035, noiseScale: 22 }), sleeve, g);
  g.cuff = mesh(taper([V(0, 0.004, 0.095), V(0, 0.003, 0.055)], [0.036, 0.034], { radial: 22, tubular: 3, noise: 0.0018, noiseScale: 30 }), cuff, g);
  return g;
}

export class ViewModel {
  constructor(level) {
    this.contactSolver = level ? new HandContact(level) : null;
    this.scene = new THREE.Scene();
    this.legs = new Legs(this.scene);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    const skin = echoMaterial({ pat: 5, human: true, boost: 0.58, wet: 0.05, bump: 0.25, tint: 0xf2ded0 });
    const nail = echoMaterial({ map: 'plastic', human: true, scale: 16, boost: 0.5, wet: 0.08, tint: 0xc9aaa0 });
    const sleeve = echoMaterial({ map: 'cloth', scale: 3, boost: 0.45, tint: 0xc8d0d4 });
    const cuff = echoMaterial({ map: 'cloth', scale: 6, boost: 0.4, tint: 0x9aa4a8 });
    const white = echoMaterial({ map: 'plastic', scale: 4, boost: 1.0 });
    const red = echoMaterial({ map: 'plastic', scale: 4, boost: 0.9, tint: 0xb02018 });
    const grip = echoMaterial({ map: 'rubber', scale: 6, boost: 1.0 });
    this.mats = [skin, nail, sleeve, cuff, white, red, grip];
    for (const m of this.mats) {
      m.uniforms.uLit.value = 0.22; // a steady faint sense of your own body
      m.uniforms.uLocal.value = 1; // patterns stick to the model, they don't swim
    }
    // Keep a faint silhouette between echoes without lighting up the arms.
    for (const m of [skin, nail, sleeve, cuff]) m.uniforms.uLit.value = 0.12;
    white.uniforms.uLit.value = 0.35;
    red.uniforms.uLit.value = 0.3;

    // right arm, fist round the cane grip
    const gi = gripInfo();
    this.gripLocal = gi.p.clone();
    {
      // The shaft is an undirected line through the palm. Its thumb/index end
      // points UP the handle, away from the floor, not toward the cane tip.
      const a1 = gi.axis.clone().negate(), a2 = V(0, 0, 1).addScaledVector(a1, -a1.z).normalize(), a3 = new THREE.Vector3().crossVectors(a1, a2);
      this.handFrameInv = new THREE.Matrix4().makeBasis(a1, a2, a3).invert();
    }
    this.right = new THREE.Group();
    this.root.add(this.right);
    this.rightArm = arm(skin, sleeve, cuff, this.right);
    this.rightHand = new HandRig(skin, nail, 'grip');
    this.right.add(this.rightHand.group);

    // the cane lives in camera space: origin at the fist, shaft along -y
    this.cane = new THREE.Group();
    this.root.add(this.cane);
    const gr = gi.r;
    mesh(new THREE.CylinderGeometry(gr, gr, 0.12, 16), grip, this.cane, [0, -0.015, 0]);
    mesh(new THREE.SphereGeometry(gr, 12, 8), grip, this.cane, [0, 0.045, 0]);
    const L = CANE_L;
    mesh(new THREE.CylinderGeometry(0.0105, 0.0105, L * 0.75, 14), white, this.cane, [0, -0.065 - L * 0.355, 0]);
    mesh(new THREE.CylinderGeometry(0.0105, 0.0105, L * 0.2, 14), red, this.cane, [0, -L * 0.84, 0]);
    mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.05, 14), grip, this.cane, [0, -L * 0.97, 0]);
    this.tip = new THREE.Object3D();
    this.tip.position.set(0, -L, 0);
    this.cane.add(this.tip);

    // left arm with a hand for each thing it does
    this.left = new THREE.Group();
    this.root.add(this.left);
    this.leftArm = arm(skin, sleeve, cuff, this.left);
    this.leftHand = new HandRig(skin, nail);
    this.leftHand.group.scale.x = -1;
    this.left.add(this.leftHand.group);
    const upper = () => mesh(taper([V(0, 0, 0), V(0, 0, 0.2), V(0, 0, 0.4)], [0.052, 0.059, 0.066], { radial: 22, tubular: 10, noise: 0.003, noiseScale: 16 }), sleeve, this.root);
    this.rightUpper = upper();
    this.leftUpper = upper();
    const workMats = workMaterials(true);
    this.workCan = createFuelCan(workMats);
    this.workFuse = createFuse(workMats);
    this.root.add(this.workCan, this.workFuse);
    this.workCan.visible = this.workFuse.visible = false;
    this.mats.push(...Object.values(workMats));
    this.fuelStream = new THREE.Group();this.root.add(this.fuelStream);
    for (let i=0;i<9;i++) mesh(new THREE.CylinderGeometry(.0032,.004,1,8),workMats.fuel,this.fuelStream);
    this.fuelStream.visible = false;

    // things the left hand can hold (in the curled 'relaxed' hand)
    const paper = echoMaterial({ map: 'paperw', scale: 6, boost: 1.1 });
    const stoneM = echoMaterial({ map: 'conc2', scale: 8, boost: 1.0 });
    const ceramic = echoMaterial({ map: 'plastic', scale: 8, boost: 1.1, tint: 0xe8e0d0 });
    const brass = echoMaterial({ map: 'metal', scale: 8, boost: 1.0, tint: 0xd8b070 });
    const cardM = echoMaterial({ map: 'bplastic', scale: 10, boost: 1.1, tint: 0xc8d8e0 });
    for (const m of [paper, stoneM, ceramic, brass, cardM]) {
      m.uniforms.uLit.value = 0.3;
      m.uniforms.uLocal.value = 1;
      this.mats.push(m);
    }
    const held = (build) => {
      const g = new THREE.Group();
      build(g);
      g.visible = false;
      g.traverse((o) => (o.frustumCulled = false));
      this.left.add(g);
      return g;
    };
    this.items = {
      stone: held((g) => mesh(new THREE.IcosahedronGeometry(0.03, 1), stoneM, g, [0, -0.035, -0.075], [0.4, 0.2, 0.1])),
      fuse: held((g) => {
        mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.055, 14), ceramic, g, [0, -0.034, -0.078], [0, 0, Math.PI / 2]);
        for (const x of [-0.031, 0.031]) mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.012, 14), brass, g, [x, -0.034, -0.078], [0, 0, Math.PI / 2]);
      }),
      card: held((g) => mesh(new THREE.BoxGeometry(0.054, 0.0025, 0.086), cardM, g, [0.004, -0.028, -0.09], [0.15, 0.3, 0])),
      note: held((g) => mesh(new THREE.PlaneGeometry(0.15, 0.2), paper, g, [0.0, -0.03, -0.13], [-Math.PI / 2 + 0.2, 0, 0.1])),
      clock: held((g) => {
        mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.026, 16), cardM, g, [0, -0.038, -0.078], [Math.PI / 2, 0, 0]);
        for (const x of [-0.022, 0.022]) mesh(new THREE.SphereGeometry(0.016, 8, 6), brass, g, [x, -0.004, -0.078]);
      }),
    };

    this.sway = new Spring(90, 13);
    this.leftSpring = new Spring(130, 19);
    this.leftQ = new THREE.Quaternion();
    this.kick = new Spring(220, 18);
    this.lastYaw = 0;
    this.lastPitch = 0;
    this.tapT = 0;
    this.actT = 0;
    this.throwT = 0;
    this.leftW = 0;
    this.lastSteps = 0;
    this.sweepPh = 0;
    this.t = 0;
  }

  tap() {
    this.tapT = 0.32;
  }

  // what the left hand does with a thing: 'take' (with item: stone/fuse/card),
  // 'read' (a note), 'push' (doors, lockers), 'press' (buttons, panels),
  // 'rattle' (a locked handle), 'pump' (the priming lever)
  act(kind, target, item = null) {
    if (this.work) return;
    const DUR = { take: 1.05, read: 1.5, push: 0.62, press: 0.5, rattle: 0.95, pump: 0.95 };
    this.actK = kind;
    this.actD = DUR[kind] || 0.6;
    this.actT = this.actD;
    this.actItem = item;
    this.reachTarget = target ? target.clone() : null;
  }
  reach(target) {
    this.act('take', target);
  }

  throw(item = 'stone') {
    this.throwT = 0.45;
    this.throwItem = item;
  }

  // keyframes for the left hand's actions (camera space). k: 0..1 through the action
  actPose(k, camInv) {
    const ease = (a, b) => smoothstep(k, a, b);
    let tgt = V(-0.08, -0.12, -0.5);
    if (this.reachTarget) {
      tgt = this.reachTarget.clone().applyMatrix4(camInv);
      const len = tgt.length();
      tgt.multiplyScalar(Math.min(1, 0.56 / Math.max(0.01, len)));
      tgt.x = clamp(tgt.x - 0.03, -0.3, 0.2);
      tgt.y = clamp(tgt.y + 0.04, -0.3, 0.12);
    }
    const rest = V(-0.24, -0.5, -0.24);
    const toTgt = tgt.clone().sub(V(-0.2, -0.3, 0)).normalize();
    const palmDown = V(-0.25, 1, 0.15);
    switch (this.actK) {
      case 'take': {
        // out, close round it, bring it in close to look at it, then away
        const out = ease(0, 0.4);
        const back = ease(0.5, 0.72);
        const away = ease(0.82, 1);
        const show = V(-0.07, -0.19, -0.3);
        const pos = rest.clone().lerp(tgt, out).lerp(show, back).add(V(0, -0.35 * away, 0.05 * away));
        const fingers = toTgt.clone().lerp(V(0.55, 0.2, -0.8), back).normalize();
        const bk = palmDown.clone().lerp(V(-0.75, 0.25, 0.6), back).normalize(); // palm turns up
        return { pose: k > 0.4 ? 'relaxed' : 'open', pos, fingers, back: bk };
      }
      case 'read': {
        const out = ease(0, 0.35);
        const back = ease(0.42, 0.62);
        const away = ease(0.85, 1);
        const hold = V(-0.06, -0.13 + Math.sin(k * 9) * 0.003, -0.3);
        const pos = rest.clone().lerp(tgt, out).lerp(hold, back).add(V(0, -0.4 * away, 0));
        const fingers = toTgt.clone().lerp(V(0.45, 0.35, -0.8), back).normalize();
        const bk = palmDown.clone().lerp(V(-0.5, -0.2, 1), back).normalize();
        return { pose: k > 0.36 ? 'relaxed' : 'open', pos, fingers, back: bk };
      }
      case 'push': {
        // flat palm against it, a firm shove, let go
        const out = ease(0, 0.38);
        const shove = Math.sin(clamp((k - 0.3) / 0.3, 0, 1) * Math.PI) * 0.06;
        const ret = ease(0.6, 1);
        const at = tgt.clone().add(V(0, 0, 0.06));
        at.y = Math.min(at.y, -0.1);
        const pos = rest.clone().lerp(at, out).add(toTgt.clone().multiplyScalar(shove)).lerp(rest, ret);
        return { pose: 'open', pos, fingers: V(0.3, 0.5, -0.8), back: V(-0.15, 0.55, 0.85) };
      }
      case 'press': {
        const out = ease(0, 0.4);
        const jab = Math.sin(clamp((k - 0.35) / 0.25, 0, 1) * Math.PI) * 0.035;
        const ret = ease(0.6, 1);
        const pos = rest.clone().lerp(tgt, out).add(toTgt.clone().multiplyScalar(jab)).lerp(rest, ret);
        return { pose: 'point', pos, fingers: toTgt.clone().add(V(0, 0.1, 0)).normalize(), back: V(-0.2, 0.6, 0.8) };
      }
      case 'rattle': {
        const out = ease(0, 0.3);
        const ret = ease(0.82, 1);
        const shake = k > 0.3 && k < 0.82 ? Math.sin((k - 0.3) * 38) * 0.022 : 0;
        const pos = rest.clone().lerp(tgt, out).add(V(shake, shake * 0.3, -Math.abs(shake) * 0.5)).lerp(rest, ret);
        return { pose: k > 0.28 ? 'relaxed' : 'open', pos, fingers: toTgt, back: V(-0.9, 0.3, 0.2) };
      }
      case 'pump': {
        // grab the lever up high, haul it down
        const grab = ease(0, 0.25);
        const pull = ease(0.3, 0.75);
        const ret = ease(0.8, 1);
        const top = tgt.clone().add(V(0, 0.1, 0));
        const bottom = tgt.clone().add(V(0.02, -0.17, 0.06));
        const pos = rest.clone().lerp(top, grab).lerp(bottom, pull).lerp(top, ret * 0.6);
        return { pose: k > 0.22 ? 'relaxed' : 'open', pos, fingers: V(0.25, -0.2 - pull * 0.3, -1).normalize(), back: V(-0.3, 1, 0.1) };
      }
    }
    return { pose: 'open', pos: tgt, fingers: toTgt, back: palmDown };
  }

  tipWorld() {
    return this.tip.getWorldPosition(new THREE.Vector3());
  }

  showLeft(pose) {
    this.leftHand.setPose(pose, this.handDt || 1 / 60);
  }

  update(dt, camera, player) {
    player.braceContact = null;
    this.legs.update(dt, player, this.root.visible);
    this.handDt = dt;
    if (!this.contactSolver) this.contactSolver = new HandContact(player.level);
    if (this.lastPosition && this.lastPosition.distanceToSquared(player.pos) > 4) {
      this.leftW = this.touchK = 0;
      this.lastContact = this.contactSolver.last = null;
      this.leftPos = null;
      this.leftSpring.init = false;
      this.leftSpring.v.set(0, 0, 0);
      this.sway.x.set(0, 0, 0);
      this.sway.v.set(0, 0, 0);
      this.lastYaw = player.yaw;
      this.lastPitch = player.pitch;
    }
    (this.lastPosition ||= new THREE.Vector3()).copy(player.pos);
    this.t += dt;
    // follow the camera exactly (world space, so echo lighting is correct)
    this.root.position.copy(camera.position);
    this.root.quaternion.copy(camera.quaternion);
    this.root.updateMatrixWorld(true);

    const fear = (player.game && player.game.fear) || 0;
    // the arms hang from the body, not the head: take back most of the head's own bob
    const body = player.headOffset ? player.headOffset.clone().multiplyScalar(-0.65) : V(0, 0, 0);
    const sp = Math.hypot(player.vel.x, player.vel.z);
    const walk = Math.min(1, sp / 2);
    const run = player.running ? 1 : 0;
    this.runK = lerp(this.runK || 0, run, Math.min(1, dt * 5));
    const crouch = (this.crouchK = lerp(this.crouchK || 0, player.crouch ? 1 : 0, Math.min(1, dt * 6)));

    // inertia: the arms lag behind turns and settle with a little overshoot
    let dyaw = player.yaw - this.lastYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const dp = player.pitch - this.lastPitch;
    this.lastYaw = player.yaw;
    this.lastPitch = player.pitch;
    const sw = this.sway.step(V(clamp(dyaw * 3.2, -0.07, 0.07), clamp(-dp * 3, -0.06, 0.06), 0), dt);

    // step phase: one swing of the cane per step, touching down as the foot lands
    const stride = player.stride || 0.78;
    const steps = player.steps || 0;
    if (steps !== this.lastSteps) {
      this.lastSteps = steps;
      this.kick.v.y -= player.running ? 0.55 : player.crouch ? 0.12 : 0.28;
    }
    const kick = this.kick.step(V(0, 0, 0), dt);
    const stepF = steps + clamp((player.stepAcc || 0) / stride, 0, 1);
    const targetPh = stepF * Math.PI;
    // when standing still the sweep eases back to the centre rather than freezing
    if (walk > 0.05) this.sweepPh = targetPh;
    this.sweepAmp = lerp(this.sweepAmp || 0, walk > 0.05 ? (player.running ? 0.12 : 0.21) : 0.0, Math.min(1, dt * 4));
    const sweep = -Math.cos(this.sweepPh) * this.sweepAmp; // radians round the vertical
    const arcLift = Math.max(0, Math.sin(this.sweepPh)) * (0.03 + this.runK * 0.07) * walk; // tip skims up mid-arc

    // breathing and fear tremor
    const tired = 1 - (player.stamina ?? 1);
    const breath = Math.sin(this.t * (1.9 + tired * 2.4)) * (0.003 + tired * 0.008) * (player.holding ? 0.2 : 1);
    const tr = fear * fear * 0.004 + (player.holding ? smoothstep(player.holdT || 0, 3, 8) * 0.004 : 0);
    const trem = V(Math.sin(this.t * 37) * tr + Math.sin(this.t * 23.3) * tr * 0.6, Math.sin(this.t * 41.7) * tr, 0);
    this.contact = !player.hidden && !player.running ? this.contactSolver.sample(camera, player) : null;
    if (player.hidden || player.running) {
      this.contactSolver.last = null;
      this.contactSolver.forwardDistance = 9;
    }
    this.wallDist = this.contactSolver.forwardDistance ?? 9;

    // ---------------------------------------------------------- right hand + cane
    // tap: lift then strike
    let tapLift = 0;
    if (this.tapT > 0) {
      const k0 = 1 - this.tapT / 0.32;
      this.tapT = Math.max(0, this.tapT - dt);
      const k = 1 - this.tapT / 0.32;
      // the strike jars back up the cane into the wrist
      if (k0 < 0.62 && k >= 0.62) this.kick.v.y -= 0.45;
      tapLift = k < 0.4 ? Math.sin((k / 0.4) * Math.PI * 0.5) * 0.36 : Math.cos(((k - 0.4) / 0.6) * Math.PI * 0.5) * 0.36 - Math.sin(((k - 0.4) / 0.6) * Math.PI) * 0.05;
    }
    const pump = Math.sin(this.sweepPh) * 0.035 * this.runK;
    const hand = V(
      0.17 + sw.x * 0.6 + trem.x,
      -0.235 + sw.y * 0.5 + kick.y * 0.35 + breath + pump - crouch * 0.03 + trem.y + tapLift * 0.06 + this.runK * 0.03,
      -0.43 + this.runK * 0.05 - Math.abs(pump) * 0.4,
    );
    if (player.holding) hand.y -= 0.025; // tensed, held close
    const retract = 1 - smoothstep(this.wallDist, 0.32, 0.85);
    hand.z += retract * 0.22;
    hand.y -= retract * 0.045;
    hand.add(body);
    const camInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const work = this.work ? sampleWork(this.work,camInv) : null;
    this.workK = lerp(this.workK || 0,work?1:0,1-Math.exp(-dt*12));
    hand.y -= this.workK * 0.4;
    // Resting arms follow the torso's yaw. Looking down must not pull the
    // wrist into the chest or turn the sleeve through the other hand.
    hand.applyAxisAngle(V(0, 1, 0), player.yaw).add(camera.position).applyMatrix4(camInv);
    this.right.position.copy(hand);
    // the floor point the tip goes for: on the ground ahead, at cane's length
    const handW = hand.clone().applyMatrix4(this.root.matrixWorld);
    const tipY = 0.03 + arcLift + tapLift * 1.1 + this.runK * 0.25;
    const h = Math.max(0.3, handW.y - tipY);
    const reachH = Math.sqrt(Math.max(0.2, CANE_L * CANE_L - h * h)) * (1 - this.runK * 0.12);
    const ang = player.yaw + sweep + 0.05 + sw.x * 0.5;
    const tipW = V(handW.x - Math.sin(ang) * reachH, tipY, handW.z - Math.cos(ang) * reachH);
    // don't let it swing up into the view when looking down at your feet
    const tipC = tipW.clone().applyMatrix4(camInv);
    if (tipC.z > -0.35) tipC.z = -0.35;
    // first aim the hand, then hang the cane from the fist. Two frames: in the
    // hand, the cane axis and the forearm; in view, where the cane must point and
    // where the forearm should run (back to the lower right corner)
    const dirC = tipC.clone().sub(hand).normalize();
    const elbow = (side) => V(side * 0.3, Math.max(0.2, Math.min(player.eye, 1.65) - 0.6 + (player.actionLean || 0)), 0.12).applyAxisAngle(V(0, 1, 0), player.yaw).add(V(player.pos.x, 0, player.pos.z)).applyMatrix4(camInv);
    const fore = elbow(1).sub(hand).normalize();
    const b1 = dirC, b2 = fore.addScaledVector(b1, -fore.dot(b1)).normalize(), b3 = new THREE.Vector3().crossVectors(b1, b2);
    const B = new THREE.Matrix4().makeBasis(b1, b2, b3);
    this.right.quaternion.setFromRotationMatrix(B.multiply(this.handFrameInv));
    this.rightHand.setPose('grip', dt);
    const gripC = this.gripLocal.clone().applyQuaternion(this.right.quaternion).add(hand);
    const caneDir = tipC.sub(gripC).normalize();
    this.cane.position.copy(gripC);
    this.cane.quaternion.setFromUnitVectors(V(0, -1, 0), caneDir);
    this.cane.visible = this.workK < 0.85;
    if (work?.right) {
      this.right.position.lerp(work.right.pos,this.workK);
      this.right.quaternion.slerp(work.right.q,this.workK);
      this.rightHand.setPose(work.right.pose,dt);
    }
    this.workCan.visible = !!work?.can;
    this.workFuse.visible = !!work?.fuse?.visible;
    this.fuelStream.visible = !!work?.can?.flow;
    if (work?.fuse) {this.workFuse.position.copy(work.fuse.pos);this.workFuse.quaternion.copy(work.fuse.q);}
    if (work?.can) {
      const c=work.can;
      this.workCan.position.copy(c.pos);this.workCan.quaternion.copy(c.q);
      this.workCan.cap.visible=c.capVisible;
      this.workCan.cap.position.copy(this.workCan.capHome).addScaledVector(this.workCan.capAxis,c.capAway*.075);
      this.workCan.cap.rotateY(dt*7);
      const start=this.workCan.spout.position.clone().applyQuaternion(c.q).add(c.pos);
      const point=(t)=>start.clone().lerp(c.end,t).add(V(Math.sin(t*8+this.t*13)*Math.sin(t*Math.PI)*.003*c.flow,-Math.sin(t*Math.PI)*.018,0));
      this.fuelStream.children.forEach((o,i)=>{const a=point(i/9),b=point((i+1)/9),d=b.clone().sub(a);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(V(0,1,0),d.clone().normalize());o.scale.set(c.flow,d.length(),c.flow);});
    }

    // ---------------------------------------------------------- left hand
    if (this.actT > 0) this.actT = Math.max(0, this.actT - dt);
    if (this.throwT > 0) this.throwT = Math.max(0, this.throwT - dt);
    const wd = this.wallDist ?? 9;
    const wall = !!this.contact && !work && !player.holding && !player.listening && this.actT <= 0 && this.throwT <= 0;
    this.touchK = lerp(this.touchK || 0, wall ? 1 : 0, Math.min(1, dt * 5));
    if (wall && this.touchK > 0.65 && this.contact.normal.y < 0.5) player.braceContact = this.contact;

    let pose = null, pos = null, fingers = null, back = null;
    if (player.fallT > 0) {
      pose = 'open';
      const height = lerp(Math.max(0.16, player.eye - 0.35), 0.16, player.fallK);
      pos = V(-0.28, height, -0.32).applyAxisAngle(V(0, 1, 0), player.yaw).add(player.pos).applyMatrix4(camInv);
      fingers = V(0, -0.15, -1).applyAxisAngle(V(0, 1, 0), player.yaw).transformDirection(camInv);
      back = V(0, 1, 0).transformDirection(camInv);
    } else if (work?.left) {
      pose=work.left.pose;pos=work.left.pos;
      this.leftQ.copy(work.left.q);
    } else if (this.throwT > 0) {
      // underarm lob: from low behind to out in front, fingers opening at release
      const k = 1 - this.throwT / 0.45;
      const s = smoothstep(k, 0, 0.55);
      pos = V(lerp(-0.26, -0.08, s), lerp(-0.42, -0.1, s) - Math.max(0, k - 0.6) * 0.5, lerp(-0.12, -0.55, s));
      fingers = V(0.1, lerp(-0.6, 0.35, s), -1);
      back = V(-0.2, 1, 0.3);
      pose = k < 0.5 ? 'relaxed' : 'open';
    } else if (player.holding && !player.hidden) {
      // clamped over the mouth: palm to the face, fingers across toward the right cheek
      const hold = smoothstep(player.holdT || 0, 0, 0.25);
      pos = V(-0.1 + trem.x * 2, lerp(-0.45, -0.145, hold) + trem.y * 2, -0.22);
      fingers = V(0.95, 0.3, -0.05);
      back = V(0.0, 0.7, -0.7);
      pose = 'cover';
    } else if (this.actT > 0) {
      ({ pose, pos, fingers, back } = this.actPose(1 - this.actT / this.actD, camInv, trem));
    } else if (player.listening && !player.hidden) {
      // cupped behind the ear, at the edge of sight
      pos = V(-0.3, -0.06 + breath, -0.16);
      fingers = V(0.15, 1, 0.1);
      back = V(-1, 0, 0.35);
      pose = 'cover';
    } else if (this.touchK > 0.05) {
      const contact = this.contact || this.lastContact;
      if (contact) {
        // Palm pad rests on the sampled face; MCP joints sit at the corner
        // when wrapping, so the phalanges close around its far side.
        const wrist = contact.point.clone().addScaledVector(contact.normal, 0.022).addScaledVector(contact.fingers, -0.055);
        pos = wrist.applyMatrix4(camInv);
        fingers = contact.fingers.clone().transformDirection(camInv);
        back = contact.normal.clone().transformDirection(camInv);
        pose = contact.pose;
        this.lastContact = contact;
      }
    } else if (this.runK > 0.4) {
      // pumping
      const ph = Math.sin(this.sweepPh + Math.PI);
      pos = V(-0.23, -0.27 + ph * 0.06, -0.38 - ph * 0.07);
      fingers = V(0.35, 0.25 + ph * 0.3, -1);
      back = V(-0.6, 0.8, 0.1);
      pose = 'relaxed';
    } else if (walk > 0.15 && !player.hidden && !player.crouch && wd < 1.6) {
      // guarding the face while walking in the dark: forearm across, palm out
      const ph = Math.sin(this.sweepPh) * 0.012;
      pos = V(-0.2 + ph, -0.33 + breath + kick.y * 0.5, -0.36);
      fingers = V(0.42, 0.62, -0.62);
      back = V(-0.15, 0.25, 1);
      pose = 'open';
    }
    const want = pose ? 1 : 0;
    this.leftW = lerp(this.leftW, want, Math.min(1, dt * (want ? 9 : 5)));
    if (pose) {
      this.leftPose = pose;
      this.leftPos = pos;
      if (!work) this.leftQ.slerp(handQuat(fingers, back), this.leftW < 0.1 ? 1 : Math.min(1, dt * 14));
    }
    let heldKey = null;
    if (this.actT > 0) {
      const k = 1 - this.actT / this.actD;
      if (this.actK === 'take' && k > 0.42 && k < 0.92) heldKey = this.actItem;
      if (this.actK === 'read' && k > 0.38 && k < 0.95) heldKey = 'note';
    } else if (this.throwT > 0 && 1 - this.throwT / 0.45 < 0.55) heldKey = this.throwItem || 'stone';
    for (const key in this.items) this.items[key].visible = key === heldKey;
    const shown = this.leftW > 0.02 && this.leftPos;
    this.left.visible = !!shown;
    if (shown) {
      this.showLeft(this.leftPose);
      // drops out of view below the frame when not in use
      const planted = wall && this.touchK > 0.65;
      const target = this.leftPos.clone().add(V(sw.x * 0.5, sw.y * 0.4 - (1 - this.leftW) * 0.35, 0).multiplyScalar(planted ? 0 : 1)).add(trem.clone().multiplyScalar(planted ? 0.1 : 1)).add(body.clone().multiplyScalar(planted ? 0 : 1));
      if (!this.leftSpring.init) {
        this.leftSpring.x.copy(target);
        this.leftSpring.init = true;
      }
      if (work) {this.left.position.copy(pos);this.leftSpring.x.copy(pos);this.leftSpring.v.set(0,0,0);}
      else this.left.position.copy(this.leftSpring.step(target, dt));
      this.left.quaternion.copy(this.leftQ);
    } else this.leftSpring.init = false;

    this.root.updateMatrixWorld(true);
    if (wall && shown) {
      // Keep the finger pads outside solid geometry even while pose/spring
      // interpolation is still catching up to a newly encountered corner.
      for (const chain of this.leftHand.digits) {
        for (let j = 1; j <= 3; j++) {
          // Recompute after every correction: translating the wrist moves all
          // remaining pads too, so stale points would over-correct the hand.
          const p = j < 3 ? chain[j].getWorldPosition(new THREE.Vector3()) : V(0, 0, -0.02).applyMatrix4(chain[2].matrixWorld);
          const correction = this.contactSolver.pushOut(p);
          if (correction.lengthSq() < 1e-8) continue;
          const local = correction.applyQuaternion(this.root.quaternion.clone().invert());
          this.left.position.add(local);
          this.leftSpring.x.copy(this.left.position);
          this.left.updateMatrixWorld(true);
        }
      }
    }
    // Fit each sleeve to its actual elbow. A fixed 66 cm tube continued past
    // the elbow and crossed the camera/other wrist on close reaches.
    const fitArm = (wrist, sleeve, rig, side) => {
      const elbowC = elbow(side);
      const toElbow = elbowC.clone().sub(wrist.position).applyQuaternion(wrist.quaternion.clone().invert());
      const distance = toElbow.length();
      toElbow.normalize();
      if (side < 0) toElbow.x *= -1;
      rig.setForearm(toElbow, dt);
      const current = V(0, 0, 1).applyQuaternion(rig.forearm.quaternion);
      if (side < 0) current.x *= -1;
      // Cloth and skin share the same smoothed forearm direction, including
      // the first frame of a reach; otherwise the cuff detaches from the skin.
      sleeve.quaternion.setFromUnitVectors(V(0, 0, 1), current);
      sleeve.scale.z = clamp(distance / 0.5, 0.35, 1.4);
      sleeve.cuff.scale.z = 1 / sleeve.scale.z;
      const upper = side > 0 ? this.rightUpper : this.leftUpper;
      const shoulder = V(side * 0.19, player.eye - 0.2 + (player.actionLean || 0), 0.13).applyAxisAngle(V(0, 1, 0), player.yaw).add(V(player.pos.x, 0, player.pos.z)).applyMatrix4(camInv);
      const toShoulder = shoulder.sub(elbowC);
      upper.position.copy(elbowC);
      upper.quaternion.setFromUnitVectors(V(0, 0, 1), toShoulder.clone().normalize());
      upper.scale.z = toShoulder.length() / 0.4;
    };
    fitArm(this.right, this.rightArm, this.rightHand, 1);
    this.leftUpper.visible = !!shown;
    if (shown) fitArm(this.left, this.leftArm, this.leftHand, -1);
    if (wall && !this.touching && this.touchK > 0.6 && this.onTouch) this.onTouch(this.left.getWorldPosition(new THREE.Vector3()));
    this.touching = wall && this.touchK > 0.6;
  }
}
