import * as THREE from 'three';
import { echoMaterial } from './echo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export function legKnee(hip, ankle, length = 0.43) {
  const direction = ankle.clone().sub(hip);
  const distance = Math.max(0.001, Math.min(length * 2 - 0.001, direction.length()));
  direction.normalize();
  const bend = V(0, 0, -1).addScaledVector(direction, direction.z).normalize();
  return hip.clone().addScaledVector(direction, distance / 2).addScaledVector(bend, Math.sqrt(length * length - distance * distance / 4));
}

// A body anchored to the floor, separate from the camera-mounted hands. Looking
// down reveals it naturally; head bob and mouse pitch never drag the feet up.
export class Legs {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    const trousers = echoMaterial({ map: 'cloth', scale: 5, boost: 0.45, tint: 0x879092 });
    const shoes = echoMaterial({ map: 'rubber', scale: 7, boost: 0.4, tint: 0x6b6864 });
    for (const material of [trousers, shoes]) {
      material.uniforms.uLit.value = 0.1;
      material.uniforms.uLocal.value = 1;
    }
    const add = (geometry, material) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.root.add(mesh);
      return mesh;
    };
    this.legs = [-1, 1].map(side => ({
      side,
      thigh: add(new THREE.CylinderGeometry(0.075, 0.058, 1, 14), trousers),
      shin: add(new THREE.CylinderGeometry(0.059, 0.043, 1, 14), trousers),
      knee: add(new THREE.SphereGeometry(0.061, 12, 10), trousers),
      shoe: add(new THREE.SphereGeometry(1, 14, 10), shoes),
    }));
    for (const leg of this.legs) leg.shoe.scale.set(0.078, 0.062, 0.15);
    this.gait = 0;
  }

  update(dt, player, visible = true) {
    this.root.visible = visible && !player.hidden;
    if (!this.root.visible) return;
    const fall = player.fallK || 0;
    // First-person framing: the hips remain behind/below the camera, so the
    // upper ends of the thighs leave the frame instead of exposing cut caps.
    const behind = player.crouch ? 0.45 : 0.65;
    this.root.position.copy(player.pos).add(V(Math.sin(player.yaw) * behind, 0, Math.cos(player.yaw) * behind));
    this.root.rotation.y = player.yaw;
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const moving = player.moving && player.fallT <= 0;
    this.gait = THREE.MathUtils.lerp(this.gait, moving ? Math.min(1, speed / 2.3) : 0, Math.min(1, dt * 10));
    const direction = player.vel.clone().applyAxisAngle(UP, -player.yaw).normalize();
    const phase = ((player.steps || 0) + Math.min(1, player.stepAcc / (player.stride || 0.78))) * Math.PI;
    const hipHeight = THREE.MathUtils.lerp(player.crouch ? 0.58 : 0.91, 0.22, fall);
    for (const leg of this.legs) {
      const p = phase + (leg.side > 0 ? Math.PI : 0);
      const stride = Math.sin(p) * (player.running ? 0.22 : player.crouch ? 0.1 : 0.16) * this.gait;
      const lift = Math.max(0, Math.cos(p)) * (player.running ? 0.095 : 0.055) * this.gait;
      const hip = V(leg.side * 0.12, hipHeight, 0.07);
      // Face-first fall: the feet trail behind the hips, rather than swinging
      // in front of the camera into a seated pose.
      const ankle = V(leg.side * 0.14 + direction.x * stride, 0.11 + lift, direction.z * stride + fall * 0.92);
      const knee = legKnee(hip, ankle);
      if (fall > 0) knee.y = Math.max(0.095, knee.y);
      for (const [mesh, a, b] of [[leg.thigh, hip, knee], [leg.shin, knee, ankle]]) {
        const axis = b.clone().sub(a);
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(UP, axis.clone().normalize());
        mesh.scale.y = axis.length();
      }
      leg.knee.position.copy(knee);
      leg.shoe.position.copy(ankle).add(V(0, -0.045, -0.065));
      leg.shoe.rotation.x = -Math.max(0, Math.cos(p)) * 0.15 * this.gait;
    }
  }
}
