import * as THREE from 'three';
import { FLOOR } from './level.js';
import { COLORS } from './echo.js';

const SURF_MUL = { [FLOOR.TILE]: 1, [FLOOR.WATER]: 1.6, [FLOOR.GLASS]: 1.7, [FLOOR.METAL]: 1.3, [FLOOR.CARPET]: 0.65 };

export class Player {
  constructor(camera, level, audio, game) {
    this.camera = camera;
    this.level = level;
    this.audio = audio;
    this.game = game;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.crouch = false;
    this.stamina = 1;
    this.breathCap = 1;
    this.holding = false;
    this.holdT = 0;
    this.breathT = 1;
    this.breathOut = true;
    this.stepAcc = 0;
    this.bob = 0;
    this.eye = 1.65;
    this.vel = new THREE.Vector3();
    this.clickCd = 0;
    this.stones = 0;
    this.projectiles = [];
    this.frozen = false;
    this.moving = false;
    this.running = false;
    this.lookTarget = null;
  }

  reset(pos, yaw) {
    this.pos.set(pos.x, 0, pos.z);
    this.yaw = yaw;
    this.pitch = 0;
    this.stamina = 1;
    this.breathCap = 1;
    this.holding = false;
    this.crouch = false;
    this.vel.set(0, 0, 0);
    this.frozen = false;
    this.lookTarget = null;
    this.hidden = null;
    this.camera.position.set(this.pos.x, this.eye, this.pos.z);
    this.camera.rotation.set(0, yaw, 0, 'YXZ');
    for (const p of this.projectiles) p.mesh.removeFromParent();
    this.projectiles = [];
  }

  hide(locker) {
    this.hidden = locker;
    this.vel.set(0, 0, 0);
    this.pos.copy(locker.inside);
    this.yaw = locker.yaw;
    this.hideYaw = locker.yaw;
    this.pitch = 0;
    this.crouch = false;
  }

  unhide() {
    if (!this.hidden) return;
    this.pos.copy(this.hidden.front);
    this.hidden = null;
  }

  look(dx, dy, sens) {
    if (this.frozen) return;
    if (this.hidden) {
      // inside a locker you can only lean your eye to the slits
      this.yaw = THREE.MathUtils.clamp(this.yaw - dx * sens, this.hideYaw - 0.45, this.hideYaw + 0.45);
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -0.35, 0.3);
      return;
    }
    this.yaw -= dx * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * sens));
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  click() {
    if (this.clickCd > 0 || this.frozen) return;
    this.clickCd = 0.55;
    this.audio.click();
    // the cane taps the floor ahead: the echo starts at its tip
    let p = this.camera.position.clone();
    if (this.vm) {
      this.vm.tap();
      p = this.vm.tipWorld();
      p.y = Math.max(0.05, p.y);
    }
    this.game.noise(p, { radius: 5, visual: 10, source: 'player', kind: 'click', color: COLORS.click, speed: 13, strength: 1.1, decay: 0.55 });
  }

  throwStone(scene) {
    if (this.stones <= 0 || this.frozen) return;
    this.stones--;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), this.level.mat.item);
    mesh.position.copy(this.camera.position).addScaledVector(dir, 0.4);
    scene.add(mesh);
    this.projectiles.push({ mesh, vel: dir.multiplyScalar(11).add(new THREE.Vector3(0, 2.2, 0)), bounces: 0, life: 4 });
    this.audio.whoosh();
  }

  update(dt, scene) {
    this.clickCd -= dt;
    const k = this.keys;
    let mx = 0, mz = 0;
    if (!this.frozen) {
      if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    }
    this.listening = !this.frozen && !this.hidden && k.has('KeyV');
    if (this.hidden || this.listening) mx = mz = 0;
    const want = new THREE.Vector3(mx, 0, mz);
    this.moving = want.lengthSq() > 0;
    this.running = this.moving && (k.has('ShiftLeft') || k.has('ShiftRight')) && this.stamina > 0.05 && !this.crouch;
    if (this.moving) want.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const speed = this.crouch ? 1.25 : this.running ? 4.4 : 2.3;
    this.vel.lerp(want.multiplyScalar(speed), Math.min(1, dt * 10));

    const before = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);
    if (!this.hidden) this.level.collide(this.pos, 0.3);
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);

    // stamina
    if (this.running) this.stamina = Math.max(0, this.stamina - dt * 0.2);
    else this.stamina = Math.min(1, this.stamina + dt * (this.moving ? 0.06 : 0.13));

    // footsteps
    this.stepAcc += moved;
    const stride = this.crouch ? 0.55 : this.running ? 1.1 : 0.78;
    if (this.stepAcc > stride) {
      this.stepAcc = 0;
      this.footstep();
    }

    // breath hold
    const wantHold = !this.frozen && (k.has('KeyQ') || k.has('Mouse2'));
    if (wantHold && this.breathCap > 0.02 && !this.holding) {
      this.holding = true;
      this.holdT = 0;
    }
    if (this.holding) {
      this.holdT += dt;
      this.breathCap = Math.max(0, this.breathCap - dt * (0.085 + (1 - this.stamina) * 0.08));
      if (this.breathCap <= 0) {
        this.holding = false;
        this.audio.gasp();
        this.game.noise(this.camera.position.clone(), { radius: 7, visual: 4, source: 'player', kind: 'gasp', color: COLORS.breath, strength: 0.7 });
        this.game.hint('Воздух кончился. Вдох вышел громким.');
        this.breathT = 0.8;
      } else if (!wantHold) {
        this.holding = false;
        if (this.holdT > 4) {
          this.audio.breath(true, 1.4);
          this.game.noise(this.camera.position.clone(), { radius: 2.2, visual: 2, source: 'player', kind: 'breath', color: COLORS.breath, strength: 0.4 });
        }
        this.breathT = 0.6;
      }
    } else {
      this.breathCap = Math.min(1, this.breathCap + dt * 0.14);
    }

    // natural breathing
    if (!this.holding && !this.frozen) {
      this.breathT -= dt;
      if (this.breathT <= 0) {
        this.breathOut = !this.breathOut;
        const tired = 1 - this.stamina;
        const rate = 1.6 - tired * 1.0;
        this.breathT = rate * (this.breathOut ? 1.1 : 0.9);
        const strength = 0.4 + tired * 1.2;
        this.audio.breath(this.breathOut, strength);
        if (this.breathOut) {
          const r = (2.4 + tired * 2.8) * (this.hidden ? 0.5 : 1);
          this.game.noise(this.camera.position.clone(), { radius: r, visual: 0.9 + tired, source: 'player', kind: 'breath', color: COLORS.breath, strength: 0.25 + tired * 0.3, speed: 4 });
        }
      }
    }

    // camera: a body, not a dolly. Spring-damped head that takes a kick on
    // every footfall, sways with breathing, and shakes when something heavy walks near.
    const lowCeil = this.level.ceilAt(Math.floor(this.pos.x), Math.floor(this.pos.z)) < 1.7;
    if (lowCeil) this.crouch = true;
    const targetEye = this.crouch ? 1.0 : 1.65;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 7);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const walk = Math.min(1, sp / 2.3);
    this.bob += dt * sp * 3.4;
    this.time = (this.time || 0) + dt;
    // spring for the vertical head offset
    this.headV = this.headV || 0;
    this.headY = this.headY || 0;
    const kSpring = 160, damp = 16;
    this.headV += (-kSpring * this.headY - damp * this.headV) * dt;
    this.headY += this.headV * dt;
    // breathing rise and fall, deeper when winded or scared
    const tired = 1 - this.stamina;
    const breathAmp = (0.004 + tired * 0.012 + (this.game.fear || 0) * 0.004) * (this.holding ? 0.15 : 1);
    const breathY = Math.sin(this.time * (1.9 + tired * 2.5)) * breathAmp;
    // side-to-side weight shift between steps
    const sway = Math.sin(this.bob * 0.5) * 0.03 * walk;
    // external shake (monster footsteps, impacts)
    this.shake = Math.max(0, (this.shake || 0) - dt * 2.5);
    const sh = this.shake * this.shake;
    const shX = (Math.random() - 0.5) * 0.03 * sh, shY = (Math.random() - 0.5) * 0.03 * sh;
    this.camera.position.set(this.pos.x, this.eye + this.headY + breathY + Math.abs(Math.sin(this.bob)) * 0.012 * walk + shY, this.pos.z);
    this.camera.position.x += Math.cos(this.yaw) * (sway + shX);
    this.camera.position.z -= Math.sin(this.yaw) * (sway + shX);
    // lean into strafes, roll with the step, pitch forward when running
    this.roll = THREE.MathUtils.lerp(this.roll || 0, -mx * 0.02 * walk + Math.sin(this.bob * 0.5) * 0.006 * walk, Math.min(1, dt * 7));
    const runPitch = this.running ? -0.035 : 0;
    this.runPitch = THREE.MathUtils.lerp(this.runPitch || 0, runPitch, Math.min(1, dt * 4));
    const swayP = Math.sin(this.time * 0.8) * 0.003 * (1 - walk) + this.headY * 0.6 + sh * (Math.random() - 0.5) * 0.02;
    const swayY = Math.cos(this.time * 0.55) * 0.0025 * (1 - walk);
    if (!this.lookTarget) {
      const fovT = 72 + (this.running ? 6 : 0) - (this.holding ? 3 : 0) - (this.listening ? 4 : 0);
      if (Math.abs(this.camera.fov - fovT) > 0.05) {
        this.camera.fov += (fovT - this.camera.fov) * Math.min(1, dt * 4);
        this.camera.updateProjectionMatrix();
      }
    }
    if (this.lookTarget) {
      const m = new THREE.Matrix4().lookAt(this.camera.position, this.lookTarget, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      this.camera.quaternion.slerp(q, Math.min(1, dt * 10));
    } else {
      this.camera.rotation.set(this.pitch + swayP + this.runPitch, this.yaw + swayY, this.roll, 'YXZ');
    }

    this.updateProjectiles(dt);
  }

  footstep() {
    this.headV = (this.headV || 0) - (this.crouch ? 0.12 : this.running ? 0.55 : 0.28);
    const surf = this.level.floorAt(this.pos.x, this.pos.z);
    const mul = SURF_MUL[surf] ?? 1;
    const base = this.crouch ? 1.1 : this.running ? 9 : 3.8;
    const radius = base * mul;
    const loud = this.crouch ? 0.15 : this.running ? 1.3 : 0.6;
    this.audio.step(surf, loud * Math.min(1.4, mul));
    const p = new THREE.Vector3(this.pos.x, 0.05, this.pos.z);
    this.game.noise(p, {
      radius, visual: Math.max(1.8, radius), source: 'player', kind: this.crouch ? 'crouch' : this.running ? 'run' : 'step',
      color: COLORS.player, strength: this.crouch ? 0.55 : 0.9, speed: this.running ? 12 : 9, decay: 0.9,
    });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.vel.y -= 9.8 * dt;
      const m = p.mesh;
      const prev = m.position.clone();
      m.position.addScaledVector(p.vel, dt);
      m.rotation.x += dt * 9;
      m.rotation.z += dt * 7;
      const c = m.position;
      const room = this.level.open(Math.floor(c.x), Math.floor(c.z));
      const ceil = room ? this.level.ceilAt(Math.floor(c.x), Math.floor(c.z)) : 0;
      let hit = false;
      if (!room || c.y >= ceil) {
        // bounce off wall/ceiling
        m.position.copy(prev);
        if (!room) {
          p.vel.x *= -0.35;
          p.vel.z *= -0.35;
        } else p.vel.y *= -0.3;
        hit = true;
      } else if (c.y <= 0.06) {
        c.y = 0.06;
        p.vel.y *= -0.3;
        p.vel.x *= 0.5;
        p.vel.z *= 0.5;
        hit = true;
      } else if (c.y < 1.4 && this.level.blockedPoint(c.x, c.z, 0.05)) {
        m.position.copy(prev);
        p.vel.x *= -0.3;
        p.vel.z *= -0.3;
        hit = true;
      }
      if (hit && p.vel.length() > 1.2) {
        p.bounces++;
        const loud = p.bounces === 1 ? 1 : 0.5;
        this.audio.impact(m.position, loud);
        this.game.noise(m.position.clone(), { radius: 10 * loud, visual: 10 * loud, source: 'stone', kind: 'stone', color: COLORS.stone, strength: 1.2 * loud, speed: 12 });
      }
      if (p.life <= 0 || (p.bounces > 0 && p.vel.length() < 0.6)) {
        m.removeFromParent();
        this.projectiles.splice(i, 1);
      }
    }
  }
}
