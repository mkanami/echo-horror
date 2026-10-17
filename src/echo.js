// Echo pulse system: every sound becomes an expanding wave that briefly
// reveals geometry. All world materials share the same pulse uniforms.
import * as THREE from 'three';

export const MAXP = 40;

const shared = {
  uTime: { value: 0 },
  uP: { value: Array.from({ length: MAXP }, () => new THREE.Vector4(0, -999, 0, -999)) },
  uQ: { value: Array.from({ length: MAXP }, () => new THREE.Vector4(1, 1, 0, 1)) },
  uC: { value: Array.from({ length: MAXP }, () => new THREE.Color(1, 1, 1)) },
};

export const COLORS = {
  player: new THREE.Color(0.55, 0.85, 1.0),
  click: new THREE.Color(0.75, 0.95, 1.0),
  breath: new THREE.Color(0.55, 0.5, 0.9),
  stone: new THREE.Color(1.0, 0.95, 0.75),
  monster: new THREE.Color(1.0, 0.12, 0.08),
  drip: new THREE.Color(0.25, 0.55, 1.0),
  spark: new THREE.Color(1.0, 0.6, 0.2),
  machine: new THREE.Color(1.0, 0.55, 0.15),
  item: new THREE.Color(0.9, 1.0, 0.6),
  white: new THREE.Color(1, 1, 1),
};

const VERT = /* glsl */ `
  varying vec3 vW;
  varying vec3 vN;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    #ifdef SURFACE
      vN = normalize(mat3(modelMatrix) * normal);
    #else
      vN = vec3(0.0, 1.0, 0.0);
    #endif
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const FRAG = /* glsl */ `
  #define MAXP ${MAXP}
  uniform vec4 uP[MAXP];
  uniform vec4 uQ[MAXP];
  uniform vec3 uC[MAXP];
  uniform float uTime;
  uniform vec3 uTint;
  uniform float uBoost;
  uniform float uPat;
  uniform float uLit;
  uniform sampler2D uTex;
  uniform sampler2D uNrm;
  uniform float uScale;
  uniform float uBump;
  uniform float uWet;
  uniform sampler2D uTex2;
  uniform sampler2D uNrm2;
  uniform float uScale2;
  uniform float uSplit;
  uniform float uGrime;
  varying vec3 vW;
  varying vec3 vN;
  varying vec2 vUv;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    return vnoise(p) * 0.55 + vnoise(p * 2.13) * 0.28 + vnoise(p * 4.7) * 0.17;
  }

  // triplanar sample: returns albedo, writes perturbed normal + roughness
  vec3 tri(sampler2D T, sampler2D Nm, float sc, vec3 n, vec3 bw, inout vec3 N, inout float rough) {
    vec2 uvX = vW.zy * sc, uvY = vW.xz * sc, uvZ = vW.xy * sc;
    vec3 a = texture2D(T, uvX).rgb * bw.x + texture2D(T, uvY).rgb * bw.y + texture2D(T, uvZ).rgb * bw.z;
    vec4 nX = texture2D(Nm, uvX), nY = texture2D(Nm, uvY), nZ = texture2D(Nm, uvZ);
    vec2 tX = nX.xy * 2.0 - 1.0, tY = nY.xy * 2.0 - 1.0, tZ = nZ.xy * 2.0 - 1.0;
    vec3 sn = sign(n);
    N = normalize(n + (vec3(0.0, tX.y, tX.x * sn.x) * bw.x + vec3(tY.x * sn.y, 0.0, tY.y) * bw.y + vec3(tZ.x * sn.z, tZ.y, 0.0) * bw.z) * uBump);
    rough = nX.b * bw.x + nY.b * bw.y + nZ.b * bw.z;
    return a;
  }

  void main() {
    vec3 n = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    #ifdef SURFACE
      if (dot(n, V) < 0.0) n = -n; // double-sided / inverted geometry
    #endif
    vec3 albedo = vec3(0.5);
    vec3 N = n;
    float rough = 0.8;

    #ifdef SURFACE
      float alpha = 1.0;
      if (uPat > 7.5) {
        // decal: RGBA texture on a quad
        vec4 dc = texture2D(uTex, vUv);
        albedo = dc.rgb;
        alpha = dc.a;
        if (alpha < 0.02) discard;
        rough = uWet > 0.0 ? mix(0.7, 0.18, uWet * smoothstep(0.3, 0.9, alpha)) : 0.85;
        N = n;
      } else
      if (uPat < 4.5 || (uPat > 6.5 && uPat < 7.5)) {
        // triplanar photo material (pat 7: two-tone wall, lower part uses map 2)
        vec3 bw = pow(abs(n), vec3(4.0));
        bw /= (bw.x + bw.y + bw.z);
        albedo = tri(uTex, uNrm, uScale, n, bw, N, rough);
        if (uPat > 6.5) {
          float wob = (vnoise(vec3(vW.x * 3.0, 0.0, vW.z * 3.0)) - 0.5) * 0.015;
          if (vW.y < uSplit + wob) albedo = tri(uTex2, uNrm2, uScale2, n, bw, N, rough);
          // painted divider stripe
          float st = smoothstep(0.035, 0.02, abs(vW.y - uSplit - wob));
          albedo = mix(albedo, albedo * 0.35, st);
        }
        if (uPat > 0.5 && uPat < 1.5) {
          // standing water over the tiles: dark, mirror-like, rippling
          vec2 rp = vec2(sin(vW.x * 7.0 + uTime * 1.4 + sin(vW.z * 3.0)), sin(vW.z * 6.0 - uTime * 1.1 + sin(vW.x * 2.0)));
          vec2 rp2 = vec2(sin(vW.x * 19.0 - uTime * 2.3 + vW.z * 4.0), sin(vW.z * 17.0 + uTime * 1.9 - vW.x * 3.0));
          N = normalize(vec3(0.0, 1.0, 0.0) + vec3(rp.x + rp2.x * 0.5, 0.0, rp.y + rp2.y * 0.5) * 0.14);
          albedo *= 0.12;
          rough = 0.12;
        } else if (uPat > 2.5 && uPat < 3.5) {
          // crushed glass on the floor glints
          if (hash(floor(vW * 40.0)) > 0.93) { rough = 0.02; N = normalize(n + (vec3(hash(floor(vW * 41.0)), 0.0, hash(floor(vW * 43.0))) - 0.5) * 1.2); }
        }
        if (uGrime > 0.0) {
          // water stains running down from the ceiling, damp rising from the floor, mould
          float h = vW.x * 1.7 + vW.z * 1.7;
          float drip = smoothstep(0.55, 0.85, vnoise(vec3(h * 4.0, vW.y * 0.35, 0.0))) * smoothstep(0.0, 1.5, vW.y);
          float damp = (1.0 - smoothstep(0.0, 0.7 + vnoise(vec3(h * 2.0, 0.0, 3.0)) * 0.6, vW.y)) * step(abs(n.y), 0.5);
          float mould = smoothstep(0.62, 0.8, fbm(vW * 1.3 + 11.0)) * fbm(vW * 9.0);
          float g = clamp(drip * 0.6 + damp * 0.55 + mould * 0.9, 0.0, 1.0) * uGrime;
          albedo *= mix(vec3(1.0), vec3(0.32, 0.3, 0.24), g);
          rough = mix(rough, 0.25, damp * uGrime * 0.6);
        }
      } else if (uPat < 5.5) {
        // flesh: clammy, mottled, wet skin with veins
        float m = fbm(vW * 9.0);
        float veins = smoothstep(0.03, 0.0, abs(fbm(vW * 4.0 + 3.1) - 0.5)) * 0.6;
        albedo = mix(vec3(0.16, 0.13, 0.12), vec3(0.34, 0.29, 0.27), m) * (1.0 - veins * 0.7);
        float e = 0.01;
        float h0 = fbm(vW * 26.0);
        vec3 grad = vec3(fbm((vW + vec3(e, 0, 0)) * 26.0) - h0, fbm((vW + vec3(0, e, 0)) * 26.0) - h0, fbm((vW + vec3(0, 0, e)) * 26.0) - h0) / e;
        N = normalize(n - (grad - dot(grad, n) * n) * 0.02 * uBump);
        rough = mix(0.75, 0.3, uWet * smoothstep(0.35, 0.7, fbm(vW * 5.0 + 7.0)));
      } else {
        // glass
        albedo = vec3(0.03);
        rough = 0.05;
      }
    #endif

    vec3 acc = vec3(0.0);
    vec3 edge = vec3(0.0);
    for (int i = 0; i < MAXP; i++) {
      vec4 P = uP[i];
      vec4 Q = uQ[i];
      if (Q.z <= 0.0) continue;
      float age = uTime - P.w;
      if (age < 0.0) continue;
      vec3 Lv = P.xyz - vW;
      float d = length(Lv);
      if (d > Q.x) continue;
      vec3 L = Lv / max(d, 1e-3);
      float r = age * Q.y;
      float tSince = age - d / Q.y;
      float f = 1.0 - d / Q.x;
      f = f * f * (3.0 - 2.0 * f);
      float fr = (d - r) / 0.4;
      float front = exp(-fr * fr);
      float trail = tSince > 0.0 ? exp(-tSince * Q.w) : 0.0;
      // light colour: mostly cold white, a hint of the source's hue
      vec3 c = uC[i];
      c = mix(vec3(dot(c, vec3(0.3, 0.5, 0.2))), c, 0.4 + 0.4 * step(0.8, c.r - c.g));
      float wave = (front * 0.9 + trail * 0.75) * f * Q.z;
      #ifdef SURFACE
        float dif = max(dot(N, L), 0.0) * 0.85 + 0.15 * max(dot(n, L), 0.0);
        vec3 H = normalize(L + V);
        float shin = mix(90.0, 6.0, rough);
        float spec = pow(max(dot(N, H), 0.0), shin) * (1.0 - rough) * (1.0 + uWet * 2.0);
        float fres = uPat > 0.5 && uPat < 1.5 ? pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.5 : 0.0;
        acc += c * wave * (dif * albedo + spec * 0.5 + fres);
      #else
        edge += c * front * f * Q.z;
        acc += c * trail * f * Q.z * 0.15 * max(uBoost - 1.5, 0.0);
      #endif
    }

    float cd = distance(vW, cameraPosition);
    float fog = exp(-cd * 0.07);
    vec3 col;
    #ifdef SURFACE
      vec3 litTerm = vec3(0.0);
      if (uLit > 0.0) {
        // harsh under-light for the screamer
        vec3 L = normalize(cameraPosition + vec3(0.0, -0.9, 0.0) - vW);
        float dif = pow(max(dot(N, L), 0.0), 1.4);
        vec3 H = normalize(L + V);
        litTerm = uLit * (albedo * (0.05 + dif * 1.4) + pow(max(dot(N, H), 0.0), 40.0) * 0.6);
      }
      col = (acc * fog * 1.6 + litTerm) * uBoost * uTint;
    #else
      col = (edge * 0.22 + acc) * fog * uBoost * uTint;
    #endif
    col = col / (1.0 + col * 0.8);
    #ifdef SURFACE
      gl_FragColor = vec4(col, alpha);
    #else
      gl_FragColor = vec4(col, 1.0);
    #endif
  }
`;

const loader = new THREE.TextureLoader();
const texCache = {};
function tex(name, color) {
  const key = name + (color ? 'c' : 'n');
  if (texCache[key]) return texCache[key];
  const decal = name.startsWith('decal:');
  const t = loader.load(decal ? `tex/decals/${name.slice(6)}.png` : `tex/${name}_${color ? 'c' : 'n'}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return (texCache[key] = t);
}

export function echoMaterial({ kind = 'surface', tint = 0xffffff, boost = 1, pat = 0, map = 'metal', scale = 0.5, bump = 1, wet = 0, map2 = null, scale2 = 0.5, split = 1.4, grime = 0 } = {}) {
  const surface = kind === 'surface';
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: surface ? { SURFACE: 1 } : {},
    uniforms: {
      uTime: shared.uTime,
      uP: shared.uP,
      uQ: shared.uQ,
      uC: shared.uC,
      uTint: { value: new THREE.Color(tint) },
      uBoost: { value: boost },
      uPat: { value: pat },
      uLit: { value: 0 },
      uTex: { value: surface ? tex(map, true) : null },
      uNrm: { value: surface ? tex(map, false) : null },
      uScale: { value: scale },
      uBump: { value: bump },
      uWet: { value: wet },
      uTex2: { value: surface ? tex(map2 || map, true) : null },
      uNrm2: { value: surface ? tex(map2 || map, false) : null },
      uScale2: { value: scale2 },
      uSplit: { value: split },
      uGrime: { value: grime },
    },
    side: surface ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (surface) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = 1;
    m.polygonOffsetUnits = 1;
  }
  if (pat === 8) {
    m.transparent = true;
    m.depthWrite = false;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -4;
  }
    if (pat === 6) {
    // glass: only its reflections show, everything behind stays visible
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
  }
  return m;
}

class EchoSystem {
  constructor() {
    this.time = 0;
    this.listeners = [];
  }

  // radius: max reach (m); speed: m/s; strength: brightness; decay: how fast afterglow fades
  emit(pos, { radius = 6, speed = 11, strength = 1, decay = 0.8, color = COLORS.player } = {}) {
    const t = this.time;
    // pick a free slot, else the one closest to finishing
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < MAXP; i++) {
      const q = shared.uQ.value[i];
      const p = shared.uP.value[i];
      if (q.z <= 0) { best = i; bestScore = Infinity; break; }
      const age = t - p.w;
      const life = q.x / q.y + 4 / q.w;
      const score = age / life - q.z * 0.1;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    shared.uP.value[best].set(pos.x, pos.y, pos.z, t);
    shared.uQ.value[best].set(radius, speed, strength, decay);
    shared.uC.value[best].copy(color);
  }

  update(dt) {
    this.time += dt;
    shared.uTime.value = this.time;
    for (let i = 0; i < MAXP; i++) {
      const q = shared.uQ.value[i];
      if (q.z <= 0) continue;
      const age = this.time - shared.uP.value[i].w;
      if (age > q.x / q.y + 5 / q.w) q.z = 0;
    }
  }

  clear() {
    for (let i = 0; i < MAXP; i++) shared.uQ.value[i].z = 0;
  }

  // how strongly a point is lit right now by any wave (0..~1)
  litAt(pos) {
    let best = 0;
    for (let i = 0; i < MAXP; i++) {
      const q = shared.uQ.value[i], p = shared.uP.value[i];
      if (q.z <= 0) continue;
      const age = this.time - p.w;
      const d = Math.hypot(pos.x - p.x, pos.y - p.y, pos.z - p.z);
      if (d > q.x || age * q.y < d) continue;
      const v = Math.exp(-(age - d / q.y) * q.w) * (1 - d / q.x) * q.z;
      if (v > best) best = v;
    }
    return best;
  }
}

export const echo = new EchoSystem();

// Dust motes hanging in the air around the listener, lit only by passing waves.
export function createDust(count = 2200) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random();
    pos[i * 3 + 1] = Math.random();
    pos[i * 3 + 2] = Math.random();
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uP: shared.uP, uQ: shared.uQ, uC: shared.uC, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(9, 3.2, 9) } },
    vertexShader: `
      #define MAXP ${MAXP}
      uniform vec4 uP[MAXP]; uniform vec4 uQ[MAXP]; uniform vec3 uC[MAXP];
      uniform float uTime; uniform vec3 uCam; uniform vec3 uBox;
      attribute float seed;
      varying vec3 vCol;
      void main() {
        vec3 p = position * uBox;
        p += vec3(sin(uTime * 0.11 + seed * 40.0) * 0.4, -uTime * 0.025 * (0.5 + seed), cos(uTime * 0.09 + seed * 31.0) * 0.4);
        vec3 base = vec3(uCam.x, 0.0, uCam.z) - vec3(uBox.x, 0.0, uBox.z) * 0.5;
        p = base + mod(p - base, uBox);
        vec3 acc = vec3(0.0);
        for (int i = 0; i < MAXP; i++) {
          vec4 P = uP[i]; vec4 Q = uQ[i];
          if (Q.z <= 0.0) continue;
          float age = uTime - P.w;
          if (age < 0.0) continue;
          float d = distance(p, P.xyz);
          if (d > Q.x) continue;
          float fr = (d - age * Q.y) / 0.5;
          float ts = age - d / Q.y;
          float f = 1.0 - d / Q.x;
          acc += uC[i] * (exp(-fr * fr) * 1.2 + (ts > 0.0 ? exp(-ts * Q.w * 1.5) * 0.35 : 0.0)) * f * Q.z;
        }
        vCol = acc * (0.08 + seed * 0.16);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(2.4 / -mv.z * (0.5 + seed), 0.5, 3.0) * 2.2;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vCol;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(c));
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}
