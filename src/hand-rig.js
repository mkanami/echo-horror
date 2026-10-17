import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { handGeometry, FINGERS, POSES, gripInfo } from './hands.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lengths = [...FINGERS.map(f => f.L), [0.042, 0.033, 0.027]];
let skinGeometry, nailGeometry;

function thumbQuaternion(direction) {
  const z = direction.clone().normalize().negate();
  const y = V(-0.55, 0.75, 0.1).addScaledVector(z, -V(-0.55, 0.75, 0.1).dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// One continuous anatomical mesh, articulated at MCP/PIP/DIP joints. Vertices
// blend across adjacent joints, rather than swapping entire hand silhouettes.
export class HandRig {
  constructor(skin, nail, pose = 'relaxed') {
    this.group = new THREE.Group();
    this.mesh = new THREE.SkinnedMesh(handGeometry('open'), skin);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.wrist = new THREE.Bone();
    this.forearm = new THREE.Bone();
    this.wrist.add(this.forearm);
    this.mesh.add(this.wrist);
    this.digits = [];
    this.bones = [this.wrist, this.forearm];
    for (let i = 0; i < 5; i++) {
      const chain = [];
      for (let j = 0; j < 3; j++) {
        const bone = new THREE.Bone();
        if (j === 0) bone.position.copy(i < 4 ? FINGERS[i].k.clone().add(V(0, -0.001, -0.003)) : V(-0.02, -0.006, -0.016));
        else bone.position.set(0, 0, -lengths[i][j - 1]);
        (j ? chain[j - 1] : this.wrist).add(bone);
        chain.push(bone);
        this.bones.push(bone);
      }
      this.digits.push(chain);
    }
    this.setPose('open', 1);
    this.mesh.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.mesh.bind(this.skeleton);
    if (!skinGeometry) this.buildGeometry();
    this.mesh.geometry = skinGeometry;
    this.nails = new THREE.SkinnedMesh(nailGeometry, nail);
    this.nails.frustumCulled = false;
    this.group.add(this.nails);
    this.nails.bind(this.skeleton, this.mesh.bindMatrix);
    this.setPose(pose, 1);
  }

  buildGeometry() {
    skinGeometry = handGeometry('open').clone();
    const p = skinGeometry.attributes.position;
    const indices = new Uint16Array(p.count * 4), weights = new Float32Array(p.count * 4);
    const segments = [];
    for (let finger = 0; finger < 5; finger++) {
      this.digits[finger].forEach((bone, joint) => segments.push({
        a: bone.getWorldPosition(new THREE.Vector3()),
        b: V(0, 0, -lengths[finger][joint]).applyMatrix4(bone.matrixWorld),
        index: this.bones.indexOf(bone), finger, joint,
      }));
    }
    const point = new THREE.Vector3(), ab = new THREE.Vector3(), ap = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i);
      if (point.z > -0.015 && point.x > -0.04) {
        const fore = THREE.MathUtils.smoothstep(point.z, 0.005, 0.065);
        indices[i * 4] = 0; indices[i * 4 + 1] = 1;
        weights[i * 4] = 1 - fore; weights[i * 4 + 1] = fore;
        continue;
      }
      let best = null, distance = Infinity, along = 0;
      for (const s of segments) {
        ab.subVectors(s.b, s.a); ap.subVectors(point, s.a);
        const t = THREE.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
        const d = ap.addScaledVector(ab, -t).lengthSq();
        if (d < distance) { distance = d; best = s; along = t; }
      }
      // Keep the palm/web rooted; only the digits follow the finger chains.
      const influence = best.finger < 4
        ? THREE.MathUtils.smoothstep(-point.z, -FINGERS[best.finger].k.z - 0.02, -FINGERS[best.finger].k.z + 0.007)
        : THREE.MathUtils.smoothstep(-point.x, 0.028, 0.047);
      let neighbor = best.index, blend = 0;
      if (along < 0.25) {
        neighbor = best.joint ? best.index - 1 : 0;
        blend = (1 - THREE.MathUtils.smoothstep(along, 0, 0.25)) * 0.5;
      } else if (along > 0.75 && best.joint < 2) {
        neighbor = best.index + 1;
        blend = THREE.MathUtils.smoothstep(along, 0.75, 1) * 0.5;
      }
      indices.set([best.index, neighbor, 0, 0], i * 4);
      weights.set([influence * (1 - blend), influence * blend, 1 - influence, 0], i * 4);
    }
    skinGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    skinGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const plates = [];
    for (let finger = 0; finger < 5; finger++) {
      const bone = this.digits[finger][2], r = finger < 4 ? FINGERS[finger].r * 0.7 : 0.007;
      // A thin curved nail plate, tucked into the skin at its cuticle, with a
      // rounded square free edge. An ellipsoid looked like a bead on each tip.
      const verts = [], colors = [], triangles = [], rows = 12, cols = 10;
      const len = finger === 4 ? 0.0155 : 0.0145, tip = lengths[finger][2];
      for (let row = 0; row <= rows; row++) {
        const t = row / rows;
        const width = r * 0.72 * Math.sqrt(Math.max(0.02, 1 - Math.max(0, (0.22 - t) / 0.22) ** 2)) * (1 - Math.max(0, (t - 0.8) / 0.2) * 0.12);
        for (let col = 0; col <= cols; col++) {
          const u = col / cols * 2 - 1;
          verts.push(u * width, r * (0.91 - 0.28 * u * u) + 0.0006 - Math.cos(t * Math.PI * 2) * 0.00045, -tip + 0.003 + len * (1 - t));
          const edge = THREE.MathUtils.smoothstep(t, 0.93, 0.99);
          const moon = (1 - THREE.MathUtils.smoothstep(t + u * u * 0.1, 0.07, 0.2)) * 0.15;
          colors.push(0.92 + edge * 0.04 + moon, 0.8 + edge * 0.13 + moon, 0.76 + edge * 0.13 + moon);
          if (row < rows && col < cols) {
            const a = row * (cols + 1) + col, b = a + cols + 1;
            triangles.push(a, a + 1, b, a + 1, b + 1, b);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(triangles);
      geo.computeVertexNormals();
      geo.applyMatrix4(bone.matrixWorld);
      const count = geo.attributes.position.count;
      const si = new Uint16Array(count * 4), sw = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) { si[i * 4] = this.bones.indexOf(bone); sw[i * 4] = 1; }
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      plates.push(geo);
    }
    nailGeometry = mergeGeometries(plates);
    plates.forEach(g => g.dispose());
  }

  setPose(name, dt, curl = null) {
    const pose = POSES[name] || POSES.relaxed;
    const curls = curl || pose.curl || gripInfo().curl;
    const alpha = dt >= 1 ? 1 : 1 - Math.exp(-dt * 18);
    this.pose = name;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(-curls[i][j], j ? 0 : pose.yaw[i], 0, 'YXZ'));
      this.digits[i][j].quaternion.slerp(target, alpha);
    }
    let previous = new THREE.Quaternion();
    for (let j = 0; j < 3; j++) {
      const world = thumbQuaternion(pose.thumb[j]);
      this.digits[4][j].quaternion.slerp(previous.clone().invert().multiply(world), alpha);
      previous = world;
    }
  }

  setForearm(direction, dt) {
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), direction.clone().normalize());
    this.forearm.quaternion.slerp(q, 1 - Math.exp(-dt * 16));
  }
}
