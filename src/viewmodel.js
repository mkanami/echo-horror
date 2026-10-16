// First-person view-model: the right hand holding a white cane that sweeps
// ahead with every step and taps the floor for an echo, and the left hand that
// reaches out when you touch something. Lit by the same echo waves as the world.
import * as THREE from 'three';
import { echoMaterial } from './echo.js';
import { taper, sculpt, blob, fbm } from './organic.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function mesh(geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.frustumCulled = false;
  parent.add(m);
  return m;
}

function hand(skin, sleeve, cuff, { left = false } = {}) {
  const s = left ? -1 : 1;
  const g = new THREE.Group();
  // forearm in a worn hospital-gown sleeve
  mesh(taper([V(0, 0, 0.55), V(0, 0.01, 0.25), V(0, 0, 0)], [0.06, 0.055, 0.05], { radial: 16, tubular: 12, noise: 0.006, noiseScale: 12 }), sleeve, g);
  mesh(taper([V(0, 0, 0.02), V(0, 0, -0.03)], 0.052, { radial: 16, tubular: 3 }), cuff, g);
  const wrist = new THREE.Group();
  wrist.position.set(0, 0, -0.04);
  g.add(wrist);
  mesh(taper([V(0, 0, 0.03), V(0, 0, -0.03)], [0.034, 0.032], { radial: 14, tubular: 4 }), skin, wrist);
  // palm and curled fingers around the cane grip
  mesh(sculpt(blob(0.045, 18, 12), (v) => { v.x *= 1.05; v.y *= 0.55; v.z *= 1.2; v.x += fbm(v.x * 30, v.y * 30, v.z * 30, 2) * 0.002; }), skin, wrist, [0, 0, -0.08]);
  for (let f = 0; f < 4; f++) {
    const x = (f - 1.5) * 0.021 * s;
    const pts = [V(x, 0.01, -0.12), V(x, -0.025, -0.155), V(x, -0.055, -0.14), V(x * 0.9, -0.05, -0.11)];
    mesh(taper(pts, [0.011, 0.0105, 0.0095, 0.008], { radial: 8, tubular: 10 }), skin, wrist);
  }
  mesh(taper([V(-0.04 * s, 0, -0.06), V(-0.055 * s, -0.02, -0.1), V(-0.03 * s, -0.04, -0.13)], [0.013, 0.012, 0.009], { radial: 8, tubular: 8 }), skin, wrist);
  return { g, wrist };
}

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    const skin = echoMaterial({ pat: 5, boost: 1.0, wet: 0.2, bump: 0.6, tint: 0xe8d4c8 });
    const sleeve = echoMaterial({ map: 'cloth', scale: 3, boost: 0.8, tint: 0xc8d0d4 });
    const cuff = echoMaterial({ map: 'cloth', scale: 6, boost: 0.6, tint: 0x9aa4a8 });
    const white = echoMaterial({ map: 'plastic', scale: 4, boost: 1.0 });
    const red = echoMaterial({ map: 'plastic', scale: 4, boost: 0.9, tint: 0xb02018 });
    const grip = echoMaterial({ map: 'rubber', scale: 6, boost: 1.0 });
    this.mats = [skin, sleeve, cuff, white, red, grip];
    for (const m of this.mats) m.uniforms.uLit.value = 0.1; // a faint sense of your own body
    white.uniforms.uLit.value = 0.35;
    red.uniforms.uLit.value = 0.3;

    // right arm + cane
    this.right = new THREE.Group();
    this.root.add(this.right);
    const R = hand(skin, sleeve, cuff);
    R.g.rotation.set(0.28, -0.32, 0);
    this.right.add(R.g);
    // the cane lives in camera space and is aimed at a point on the floor ahead
    this.cane = new THREE.Group();
    this.root.add(this.cane);
    // grip, shaft with the red band near the tip, metal tip
    const L = 1.4;
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 14), grip, this.cane, [0, 0.02, 0]);
    mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 16), grip, this.cane, [0, 0.14, 0], [0, 0, 0]);
    const shaft = new THREE.Group();

    this.cane.add(shaft);
    mesh(new THREE.CylinderGeometry(0.0125, 0.0125, L * 0.75, 14), white, shaft, [0, -L * 0.375, 0]);
    mesh(new THREE.CylinderGeometry(0.0125, 0.0125, L * 0.2, 14), red, shaft, [0, -L * 0.85, 0]);
    mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.05, 14), grip, shaft, [0, -L * 0.97, 0]);
    this.tip = new THREE.Object3D();
    this.tip.position.set(0, -L, 0);
    shaft.add(this.tip);

    // left hand, normally out of view
    this.left = new THREE.Group();
    this.root.add(this.left);
    const Lh = hand(skin, sleeve, cuff, { left: true });
    Lh.g.rotation.set(0.1, 0.15, 0);
    this.left.add(Lh.g);
    this.leftT = 0;

    this.sway = new THREE.Vector2();
    this.lastYaw = 0;
    this.lastPitch = 0;
    this.tapT = 0;
    this.phase = 0;
  }

  tap() {
    this.tapT = 0.28;
  }

  reach() {
    this.leftT = 0.55;
  }

  tipWorld() {
    return this.tip.getWorldPosition(new THREE.Vector3());
  }

  update(dt, camera, player) {
    // follow the camera exactly (world space, so echo lighting is correct)
    this.root.position.copy(camera.position);
    this.root.quaternion.copy(camera.quaternion);

    // lag behind fast turns
    const dyaw = player.yaw - this.lastYaw, dp = player.pitch - this.lastPitch;
    this.lastYaw = player.yaw;
    this.lastPitch = player.pitch;
    this.sway.x = THREE.MathUtils.lerp(this.sway.x, THREE.MathUtils.clamp(dyaw * 6, -0.12, 0.12), Math.min(1, dt * 10));
    this.sway.y = THREE.MathUtils.lerp(this.sway.y, THREE.MathUtils.clamp(dp * 6, -0.1, 0.1), Math.min(1, dt * 10));

    // the cane sweeps side to side in step with walking
    const sp = Math.hypot(player.vel.x, player.vel.z);
    this.phase += dt * sp * 2.1;
    const walk = Math.min(1, sp / 2);
    const sweep = Math.sin(this.phase) * 0.32 * walk;
    const bobY = Math.abs(Math.cos(this.phase)) * 0.012 * walk;

    // tap: lift then strike the floor
    let tapLift = 0;
    if (this.tapT > 0) {
      this.tapT = Math.max(0, this.tapT - dt);
      const k = 1 - this.tapT / 0.28;
      tapLift = k < 0.45 ? (k / 0.45) * 0.28 : (1 - (k - 0.45) / 0.55) * 0.28 - 0.06 * Math.sin(((k - 0.45) / 0.55) * Math.PI);
    }
    const crouch = player.crouch ? 0.08 : 0;
    this.right.position.set(0.21 + this.sway.x * 0.5, -0.24 - bobY + this.sway.y * 0.4 + crouch, -0.32);
    this.right.rotation.set(-tapLift + this.sway.y * 0.6 + crouch * 1.5, sweep + this.sway.x * 1.2, -sweep * 0.25);

    // left hand reaches forward then drops away
    if (this.leftT > 0) this.leftT = Math.max(0, this.leftT - dt);
    const r = this.leftT > 0 ? Math.sin((1 - this.leftT / 0.55) * Math.PI) : 0;
    // aim the cane from the grip in the right hand to a spot on the floor ahead
    const grip = new THREE.Vector3(this.right.position.x - 0.025, this.right.position.y - 0.04, this.right.position.z - 0.12);
    const tipT = new THREE.Vector3(-0.12 + sweep * 0.7 + this.sway.x * 0.6, -0.95 - crouch + tapLift * 1.2, -1.45);
    const dir = tipT.sub(grip).normalize();
    this.cane.position.copy(grip);
    this.cane.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    this.left.visible = r > 0.01;
    this.left.position.set(-0.2 + r * 0.06, -0.55 + r * 0.33, -0.25 - r * 0.2);
    this.left.rotation.set(0.25 - r * 0.2, 0.1, 0);
    this.root.updateMatrixWorld(true);
  }
}
