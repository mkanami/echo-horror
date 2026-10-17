// Echo pulse system: every sound becomes an expanding wave that briefly
// reveals geometry. All world materials share the same pulse uniforms.
import * as THREE from 'three';

export const MAXP = 40;

const shared = {
  uTime: { value: 0 },
  uP: { value: Array.from({ length: MAXP }, () => new THREE.Vector4(0, -999, 0, -999)) },
  uQ: { value: Array.from({ length: MAXP }, () => new THREE.Vector4(1, 1, 0, 1)) },
  uC: { value: Array.from({ length: MAXP }, () => new THREE.Color(1, 1, 1)) },
  uN: { value: 0 }, // live pulses, packed at the front of the arrays
  uListen: { value: 0 }, // the creature's (red) waves are only seen while you listen
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
  varying vec3 vO;
  varying vec3 vNo;
  void main() {
    vUv = uv;
    vO = position;
    vNo = normal;
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
  uniform float uN;
  uniform float uListen;
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
  uniform sampler2D uHgt;
  uniform sampler2D uHgt2;
  uniform float uPom;
  varying vec3 vW;
  varying vec3 vN;
  varying vec2 vUv;
  varying vec3 vO;
  varying vec3 vNo;
  uniform float uLocal;
  // pattern space: world for the static level, the model's own space for things
  // that move with you (hands), so textures don't swim across them
  vec3 pW;

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

  // parallax occlusion: march the view ray down into the height map (white = high)
  // and return where it first hits the surface (xy) and the height there (z).
  // dirT: the view vector's components along the plane, nz: its component along
  // the normal, depth: relief in uv units. Explicit gradients let it stop early.
  vec3 pom(sampler2D H, vec2 uv, vec2 gx, vec2 gy, vec2 dirT, float nz, float depth) {
    vec2 delta = -dirT / max(nz, 0.22) * depth;
    float n = floor(mix(30.0, 10.0, clamp(nz, 0.0, 1.0)));
    float stp = 1.0 / n;
    float cur = 0.0, prevD = 0.0, prevCur = 0.0;
    vec2 cuv = uv, puv = uv;
    float d = 1.0 - textureGrad(H, uv, gx, gy).r;
    for (int i = 0; i < 30; i++) {
      if (cur >= d || float(i) >= n) break;
      puv = cuv; prevD = d; prevCur = cur;
      cur += stp;
      cuv = uv + delta * cur;
      d = 1.0 - textureGrad(H, cuv, gx, gy).r;
    }
    // refine between the last two layers
    float after = d - cur, before = prevD - prevCur;
    float w = clamp(after / (after - before + 1e-5), 0.0, 1.0);
    return vec3(mix(cuv, puv, w), 1.0 - mix(d, prevD, w));
  }

  // triplanar sample: returns albedo, writes perturbed normal + roughness.
  // Projections with next to no weight are skipped (on walls and floors that is
  // two of the three).
  vec3 tri(sampler2D T, sampler2D Nm, sampler2D Hm, float sc, vec3 n, vec3 bw, inout vec3 N, inout float rough) {
    vec2 uvX = pW.zy * sc, uvY = pW.xz * sc, uvZ = pW.xy * sc;
    vec2 gxX = dFdx(uvX), gyX = dFdy(uvX), gxY = dFdx(uvY), gyY = dFdy(uvY), gxZ = dFdx(uvZ), gyZ = dFdy(uvZ);
    // relief on the dominant projection, close up only
    float fade = smoothstep(12.0, 5.0, distance(vW, cameraPosition));
    float pd = uPom * sc * fade;
    float cav = 1.0;
    if (pd > 0.0005) {
      vec3 Vw = normalize(cameraPosition - vW);
      vec3 r;
      if (bw.x >= bw.y && bw.x >= bw.z) { r = pom(Hm, uvX, gxX, gyX, vec2(Vw.z, Vw.y), abs(Vw.x), pd); uvX = r.xy; }
      else if (bw.y >= bw.z) { r = pom(Hm, uvY, gxY, gyY, vec2(Vw.x, Vw.z), abs(Vw.y), pd); uvY = r.xy; }
      else { r = pom(Hm, uvZ, gxZ, gyZ, vec2(Vw.x, Vw.y), abs(Vw.z), pd); uvZ = r.xy; }
      // the bottoms of the seams and pits catch less of anything
      cav = mix(1.0, mix(0.3, 1.0, smoothstep(0.0, 0.85, r.z)), fade * min(1.0, uPom * 50.0));
    }
    vec3 a = vec3(0.0);
    vec2 tX = vec2(0.0), tY = vec2(0.0), tZ = vec2(0.0);
    rough = 0.0;
    if (bw.x > 0.02) { vec4 nX = textureGrad(Nm, uvX, gxX, gyX); a += textureGrad(T, uvX, gxX, gyX).rgb * bw.x; tX = nX.xy * 2.0 - 1.0; rough += nX.b * bw.x; }
    if (bw.y > 0.02) { vec4 nY = textureGrad(Nm, uvY, gxY, gyY); a += textureGrad(T, uvY, gxY, gyY).rgb * bw.y; tY = nY.xy * 2.0 - 1.0; rough += nY.b * bw.y; }
    if (bw.z > 0.02) { vec4 nZ = textureGrad(Nm, uvZ, gxZ, gyZ); a += textureGrad(T, uvZ, gxZ, gyZ).rgb * bw.z; tZ = nZ.xy * 2.0 - 1.0; rough += nZ.b * bw.z; }
    vec3 sn = sign(n);
    N = normalize(n + (vec3(0.0, tX.y, tX.x * sn.x) * bw.x + vec3(tY.x * sn.y, 0.0, tY.y) * bw.y + vec3(tZ.x * sn.z, tZ.y, 0.0) * bw.z) * uBump);
    return a * cav;
  }

  void main() {
    pW = uLocal > 0.5 ? vO * uLocal : vW;
    vec3 n = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    #ifdef SURFACE
      // decals live on one face of a wall with no thickness: from behind they
      // must not show through it
      if (uPat > 7.5 && dot(n, V) < 0.0) discard;
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
        vec3 nb = uLocal > 0.5 ? normalize(vNo) : n;
        vec3 bw = pow(abs(nb), vec3(4.0));
        bw /= (bw.x + bw.y + bw.z);
        albedo = tri(uTex, uNrm, uHgt, uScale, n, bw, N, rough);
        if (uPat > 6.5) {
          float wob = (vnoise(vec3(vW.x * 3.0, 0.0, vW.z * 3.0)) - 0.5) * 0.015;
          if (vW.y < uSplit + wob) albedo = tri(uTex2, uNrm2, uHgt2, uScale2, n, bw, N, rough);
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
        float m = fbm(pW * 9.0);
        float veins = smoothstep(0.03, 0.0, abs(fbm(pW * 4.0 + 3.1) - 0.5)) * 0.6;
        albedo = mix(vec3(0.16, 0.13, 0.12), vec3(0.34, 0.29, 0.27), m) * (1.0 - veins * 0.7);
        float e = 0.01;
        // skin bump from a single noise octave (three were 3x the cost for detail
        // too fine to see at this scale)
        float h0 = vnoise(pW * 30.0);
        vec3 grad = vec3(vnoise((pW + vec3(e, 0, 0)) * 30.0) - h0, vnoise((pW + vec3(0, e, 0)) * 30.0) - h0, vnoise((pW + vec3(0, 0, e)) * 30.0) - h0) / e * 0.6;
        N = normalize(n - (grad - dot(grad, n) * n) * 0.02 * uBump);
        rough = mix(0.75, 0.3, uWet * smoothstep(0.35, 0.7, fbm(pW * 5.0 + 7.0)));
      } else {
        // glass
        albedo = vec3(0.03);
        rough = 0.05;
      }
    #endif

    vec3 acc = vec3(0.0);
    vec3 edge = vec3(0.0);
    for (int i = 0; i < MAXP; i++) {
          if (float(i) >= uN) break;
      vec4 P = uP[i];
      vec4 Q = uQ[i];
      if (Q.z <= 0.0) continue;
      // its waves stay hidden unless you are listening for them
      Q.z *= (uC[i].r > 0.8 && uC[i].g < 0.3) ? uListen : 1.0;
      if (Q.z <= 0.001) continue;
      float age = uTime - P.w;
      if (age < 0.0) continue;
      vec3 Lv = P.xyz - vW;
      float d = length(Lv);
      if (d > Q.x) continue;
      vec3 L = Lv / max(d, 1e-3);
      float r = age * Q.y;
      float tSince = age - d / Q.y;
      // gentle falloff: far surfaces fade out gradually instead of dropping off a cliff
      float f = pow(clamp(1.0 - d / Q.x, 0.0, 1.0), 0.7);
      float fr = (d - r) / 0.4;
      float front = exp(-fr * fr);
      // afterglow: a quick fade, then a long dim memory of the shape
      float trail = tSince > 0.0 ? exp(-tSince * Q.w) * 0.95 + exp(-tSince * Q.w * 0.38) * 0.05 : 0.0;
      // light colour: mostly cold white, a hint of the source's hue
      vec3 c = uC[i];
      c = mix(vec3(dot(c, vec3(0.3, 0.5, 0.2))), c, 0.4 + 0.4 * step(0.8, c.r - c.g));
      // the wave first draws the bare structure (edges, vertices); the
      // surface fills in a moment behind it
      float solid = smoothstep(0.0, 0.42, tSince);
      float wave = (front * 0.32 + trail * 0.75 * mix(0.18, 1.0, solid)) * f * Q.z;
      #ifdef SURFACE
        // wrapped diffuse + a little bounce: the side turned away is dim, not black,
        // and the edge between light and shade is soft
        float wl = dot(N, L) * 0.5 + 0.5;
        float dif = wl * wl * 0.8 + (dot(n, L) * 0.5 + 0.5) * 0.08 + 0.07;
        vec3 H = normalize(L + V);
        float shin = mix(90.0, 6.0, rough);
        float spec = pow(max(dot(N, H), 0.0), shin) * (1.0 - rough) * (1.0 + uWet * 2.0);
        float fres = uPat > 0.5 && uPat < 1.5 ? pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.5 : 0.0;
        acc += c * wave * (dif * albedo + spec * 0.5 + fres);
      #else
        float sketch = front + (tSince > 0.0 ? exp(-tSince * 5.5) * 0.85 : 0.0);
        edge += c * sketch * f * Q.z;
        acc += c * trail * f * Q.z * 0.15 * max(uBoost - 1.5, 0.0);
      #endif
    }

    // overlapping waves and surfaces right next to the source: roll off the
    // highlights instead of blowing them out
    #ifdef SURFACE
      acc = acc / (1.0 + max(max(acc.r, acc.g), acc.b) * 0.75);
    #endif
    float cd = distance(vW, cameraPosition);
    float fog = exp(-cd * 0.055);
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
      col = (acc * fog * 1.25 + litTerm) * uBoost * uTint;
    #else
      col = (edge * 0.3 + acc) * fog * uBoost * uTint;
    #endif
    // depth haze: distance drains contrast and colour into a cold murk
    float hz = 1.0 - exp(-max(cd - 2.0, 0.0) * 0.06);
    col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(0.82, 0.93, 1.08) * 0.85, hz * 0.55);
    col = col / (1.0 + col * 1.1);
    #ifdef SURFACE
      gl_FragColor = vec4(col, alpha);
    #else
      gl_FragColor = vec4(col, 1.0);
    #endif
  }
`;

const loader = new THREE.TextureLoader();
const texCache = {};
export let pomScale = 1; // 0 turns parallax off (low quality)
export function setRelief(k) {
  pomScale = k;
  for (const m of allMats) if (m.userData.relief !== undefined) m.uniforms.uPom.value = m.userData.relief * k;
}
const allMats = [];
function tex(name, color) {
  const kind = color === 'h' ? 'h' : color ? 'c' : 'n';
  const key = name + kind;
  if (texCache[key]) return texCache[key];
  const decal = name.startsWith('decal:');
  const t = loader.load(decal ? `tex/decals/${name.slice(6)}.png` : `tex/${name}_${kind}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = color === true ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return (texCache[key] = t);
}

// how deep the relief of each texture is, in metres (parallax from its height map)
const RELIEF = {
  brick: 0.0918, brick2: 0.0918, cfloor: 0.0612, conc3: 0.0551, grate: 0.0765, dplate: 0.0306, plates: 0.0367, plates2: 0.0367,
  tile: 0.0245, wtile: 0.0214, wtile2: 0.0214, btile: 0.0214, tile3: 0.0245, tile4: 0.0245, terrazzo: 0.0122,
  wall: 0.0367, ceil: 0.0306, conc2: 0.0428, bunker: 0.049, plaster: 0.0367, plaster2: 0.0367, plaster3: 0.0367, plaster4: 0.0367,
  paper: 0.0122, paper2: 0.0122, corr: 0.0612, boards: 0.0367, parquet: 0.0184, planks: 0.0428, oceil: 0.0367, rust: 0.0306, iron: 0.0245,
  carpet: 0.0122, carpet2: 0.0122, rug: 0.0122,
};
export function echoMaterial({ kind = 'surface', tint = 0xffffff, boost = 1, pat = 0, map = 'metal', scale = 0.5, bump = 1, wet = 0, map2 = null, scale2 = 0.5, split = 1.4, grime = 0 } = {}) {
  const surface = kind === 'surface';
  const relief = surface && pat !== 1 && pat !== 3 && pat !== 8 ? RELIEF[map] ?? 0 : 0;
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: surface ? { SURFACE: 1 } : {},
    uniforms: {
      uTime: shared.uTime,
      uP: shared.uP,
      uQ: shared.uQ,
      uC: shared.uC,
      uN: shared.uN,
      uListen: shared.uListen,
      uTint: { value: new THREE.Color(tint) },
      uBoost: { value: boost },
      uPat: { value: pat },
      uLit: { value: 0 },
      uLocal: { value: 0 },
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
      uHgt: { value: surface && relief > 0 ? tex(map, 'h') : null },
      uHgt2: { value: surface && relief > 0 ? tex(map2 || map, 'h') : null },
      uPom: { value: relief * pomScale },
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
  if (surface) {
    m.userData.relief = relief;
    allMats.push(m);
  }
  return m;
}

// Vertices of the edge lines as fine points: they flash where the wave front
// is and go out as the surface fills in.
export function echoPoints(geo, { tint = 0xffffff, boost = 1, size = 2.2 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uP: shared.uP, uQ: shared.uQ, uC: shared.uC, uN: shared.uN, uListen: shared.uListen, uTint: { value: new THREE.Color(tint) }, uBoost: { value: boost }, uSize: { value: size } },
    vertexShader: `
      #define MAXP ${MAXP}
      uniform vec4 uP[MAXP]; uniform vec4 uQ[MAXP]; uniform vec3 uC[MAXP]; uniform float uN; uniform float uListen;
      uniform float uTime; uniform float uSize;
      varying vec3 vCol;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec3 acc = vec3(0.0);
        if (distance(w.xyz, cameraPosition) > 24.0 || uN < 0.5) {
          // too far to show a point: skip the work entirely
          gl_PointSize = 0.0;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vCol = vec3(0.0);
          return;
        }
        for (int i = 0; i < MAXP; i++) {
          if (float(i) >= uN) break;
          vec4 P = uP[i]; vec4 Q = uQ[i];
          if (Q.z <= 0.0) continue;
          Q.z *= (uC[i].r > 0.8 && uC[i].g < 0.3) ? uListen : 1.0;
          if (Q.z <= 0.001) continue;
          float age = uTime - P.w;
          if (age < 0.0) continue;
          float d = distance(w.xyz, P.xyz);
          if (d > Q.x) continue;
          float fr = (d - age * Q.y) / 0.35;
          float ts = age - d / Q.y;
          float f = 1.0 - d / Q.x;
          vec3 c = mix(vec3(dot(uC[i], vec3(0.3, 0.5, 0.2))), uC[i], 0.5);
          acc += c * (exp(-fr * fr) + (ts > 0.0 ? exp(-ts * 7.0) * 0.7 : 0.0)) * f * Q.z;
        }
        vec4 mv = viewMatrix * w;
        vCol = acc * exp(-length(mv.xyz) * 0.07);
        gl_PointSize = clamp(uSize * 3.0 / -mv.z, 1.0, uSize) * (0.6 + min(1.0, length(acc)) * 0.6);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uTint; uniform float uBoost;
      varying vec3 vCol;
      void main() {
        if (dot(vCol, vCol) < 1e-4) discard;
        float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
        vec3 col = vCol * a * uBoost * uTint * 0.5;
        gl_FragColor = vec4(col / (1.0 + col), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, m);
  pts.frustumCulled = false;
  return pts;
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
      const life = q.x / q.y + 9 / q.w;
      const score = age / life - q.z * 0.1;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    shared.uP.value[best].set(pos.x, pos.y, pos.z, t);
    shared.uQ.value[best].set(radius, speed, strength, decay);
    shared.uC.value[best].copy(color);
    shared.uN.value = Math.max(shared.uN.value, best + 1);
  }

  update(dt) {
    this.time += dt;
    shared.uTime.value = this.time;
    const P = shared.uP.value, Q = shared.uQ.value, C = shared.uC.value;
    // retire finished pulses and pack the live ones at the front, so the shaders
    // only loop over what is actually lighting something
    let n = 0;
    for (let i = 0; i < MAXP; i++) {
      const q = Q[i];
      if (q.z <= 0) continue;
      const age = this.time - P[i].w;
      if (age > q.x / q.y + 9 / q.w) {
        q.z = 0;
        continue;
      }
      if (i !== n) {
        P[n].copy(P[i]);
        Q[n].copy(q);
        C[n].copy(C[i]);
        q.z = 0;
      }
      n++;
    }
    shared.uN.value = n;
  }

  clear() {
    for (let i = 0; i < MAXP; i++) shared.uQ.value[i].z = 0;
    shared.uN.value = 0;
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
export function setListen(k) {
  shared.uListen.value = k;
}

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
    uniforms: { uTime: shared.uTime, uP: shared.uP, uQ: shared.uQ, uC: shared.uC, uN: shared.uN, uListen: shared.uListen, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(9, 3.2, 9) } },
    vertexShader: `
      #define MAXP ${MAXP}
      uniform vec4 uP[MAXP]; uniform vec4 uQ[MAXP]; uniform vec3 uC[MAXP]; uniform float uN; uniform float uListen;
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
          if (float(i) >= uN) break;
          vec4 P = uP[i]; vec4 Q = uQ[i];
          if (Q.z <= 0.0) continue;
          Q.z *= (uC[i].r > 0.8 && uC[i].g < 0.3) ? uListen : 1.0;
          if (Q.z <= 0.001) continue;
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
