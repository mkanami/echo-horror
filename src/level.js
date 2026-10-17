// НИИ-17 «Тишина»: grid-carved facility, architecture, props, collisions,
// navigation grid for the monster, and sound occlusion.
import * as THREE from 'three';
import { Builder, makeObject } from './builder.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { echoMaterial, echoPoints } from './echo.js';
import * as P from './props.js';
import { woodLeaf, steelLeaf, liftLeaf, doorFrame, ease } from './doors.js';

export const W = 64;
export const H = 56;
export const FLOOR = { TILE: 1, WATER: 2, GLASS: 3, METAL: 4, CARPET: 5 };

export const ROOMS = [];

// locker rows [x, z, ry, count, enterable indices]
export const LOCKER_ROWS = [
  [18.0, 26.28, 0, 10, [2, 5, 8]],
  [52.6, 32.28, 0, 3, [1]],
  [26.0, 13.72, Math.PI, 3, [0, 2]],
  [52.0, 21.72, Math.PI, 2, [0]],
  [2.6, 35.72, Math.PI, 3, [0, 2]],
  [10.85, 3.28, 0, 3, [1]], // lift hall: somewhere to go when it gets in
];

// decorative locked doors on walls: [x, z, nx, nz, plaque]
export const LOCKED = [
  [30, 35.3, 1, 0], [33, 41.1, -1, 0], [15.5, 29, 0, -1], [21.2, 29, 0, -1],
  [26.5, 22, 0, 1], [36.8, 34, 0, -1], [24, 32.2, 1, 0], [18.2, 7, 0, 1],
  [4, 5.2, 1, 0], [42.3, 26, 0, 1], [47.5, 29, 0, -1], [30, 20.2, 1, 0],
];

// per-room surface materials: walls / floor / ceiling
const H_ = { wall: 'w_hosp', floor: 'f_tile', ceil: 'c_plaster' };
const SURF = {
  'Медблок': { wall: 'w_hosp', floor: 'f_tile4', ceil: 'c_office' },
  'Санузел': { wall: 'w_tile2', floor: 'f_tile3', ceil: 'c_plaster' },
  'Коридор Б': { wall: 'w_hosp2', floor: 'f_tile', ceil: 'c_plaster' },
  'Морг': { wall: 'w_tile', floor: 'f_tile3', ceil: 'c_plaster' },
  'Атриум': { wall: 'w_atrium', floor: 'f_terrazzo', ceil: 'c_concrete' },
  'Западный коридор': { wall: 'w_hosp', floor: 'f_boards', ceil: 'c_plaster' },
  'Архив': { wall: 'w_paper2', floor: 'f_parquet', ceil: 'c_office' },
  'Затопленный коридор': { wall: 'w_bunker', floor: 'f_water', ceil: 'c_plaster' },
  'Кабинет 9': { wall: 'w_paper', floor: 'f_water2', ceil: 'c_office' },
  'Шлюз': { wall: 'w_plates2', floor: 'f_conc3', ceil: 'c_concrete' },
  'Безэховый блок': { wall: 'w_iso', floor: 'f_glass', ceil: 'c_concrete' },
  'Служебный коридор': { wall: 'w_bunker', floor: 'f_grate', ceil: 'c_concrete' },
  'Генераторная': { wall: 'w_brick', floor: 'f_conc3', ceil: 'c_concrete' },
  'Переход': { wall: 'w_hosp2', floor: 'f_terrazzo', ceil: 'c_plaster' },
  'Лифтовый холл': { wall: 'w_hall', floor: 'f_rug', ceil: 'c_office' },
  'Лифт': { wall: 'w_plates', floor: 'f_dplate', ceil: 'c_concrete' },
  'Вентканал': { wall: 'w_steel2', floor: 'f_grate', ceil: 'c_concrete' },
  'Вентшахта': { wall: 'w_steel2', floor: 'f_grate', ceil: 'c_concrete' },
};

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.cells = new Uint8Array(W * H);
    this.ceil = new Float32Array(W * H);
    this.room = new Int8Array(W * H).fill(-1);
    this.doors = [];
    this.items = [];
    this.drips = [];
    this.sparks = [];
    this.triggers = [];
    this.layout();
    this.materials();
    this.buildArchitecture();
    this.buildProps();
    this.buildDynamic();
    this.buildDecals();
    this.buildCollision();
    this.buildNav();
  }

  // ---------------------------------------------------------------- layout
  carve(x, z, w, h, floor, ceil, name) {
    let id = -1;
    if (name) {
      id = ROOMS.length;
      ROOMS.push({ name, x, z, w, h });
    }
    for (let j = z; j < z + h; j++)
      for (let i = x; i < x + w; i++) {
        const k = j * W + i;
        this.cells[k] = floor;
        this.ceil[k] = ceil;
        if (id >= 0 || this.room[k] < 0) this.room[k] = id;
      }
  }

  layout() {
    const F = FLOOR;
    this.carve(26, 44, 12, 10, F.TILE, 3.2, 'Медблок');
    this.carve(38, 52, 1, 2, F.TILE, 2.4, null);
    this.carve(39, 50, 4, 4, F.TILE, 2.6, 'Санузел');
    this.carve(30, 34, 3, 10, F.TILE, 2.8, 'Коридор Б');
    this.carve(33, 38, 2, 2, F.TILE, 2.4, null);
    this.carve(35, 36, 8, 7, F.TILE, 2.8, 'Морг');
    this.carve(24, 22, 16, 12, F.TILE, 5.0, 'Атриум');
    this.carve(13, 26, 11, 3, F.TILE, 2.8, 'Западный коридор');
    this.carve(1, 17, 12, 19, F.CARPET, 4.0, 'Архив');
    this.carve(40, 26, 16, 3, F.WATER, 2.8, 'Затопленный коридор');
    this.carve(53, 29, 2, 3, F.WATER, 2.4, null);
    this.carve(50, 32, 11, 9, F.WATER, 3.0, 'Кабинет 9');
    this.carve(53, 22, 2, 4, F.TILE, 2.6, 'Шлюз');
    this.carve(44, 6, 18, 16, F.GLASS, 4.5, 'Безэховый блок');
    this.carve(30, 14, 4, 8, F.METAL, 3.0, 'Служебный коридор');
    this.carve(22, 3, 20, 11, F.METAL, 6.0, 'Генераторная');
    this.carve(13, 7, 9, 3, F.TILE, 2.8, 'Переход');
    this.carve(4, 3, 9, 10, F.TILE, 3.5, 'Лифтовый холл');
    this.carve(6, 0, 3, 3, F.METAL, 2.6, 'Лифт');
    // a crawl-only ventilation duct: morgue <-> flooded corridor, too low for the creature
    this.carve(41, 29, 1, 7, F.METAL, 1.25, 'Вентканал');
    // ventilation shaft from the generator room into the lift hall's hatch (the creature crawls it)
    this.carve(7, 13, 1, 3, F.METAL, 1.25, 'Вентшахта');
    this.carve(8, 15, 15, 1, F.METAL, 1.25, null);
    this.carve(22, 14, 1, 2, F.METAL, 1.25, null);
    // puddles in the morgue and corridor B
    for (const [i, j] of [[31, 41], [32, 41], [31, 42], [38, 39], [39, 39], [38, 40]]) this.cells[j * W + i] = F.WATER;
    // broken glass spilling into the airlock
    for (const [i, j] of [[53, 22], [54, 22], [53, 23]]) this.cells[j * W + i] = F.GLASS;
  }

  surf(i, j) {
    const r = this.room[j * W + i];
    return (r >= 0 && SURF[ROOMS[r].name]) || H_;
  }
  floorKey(i, j) {
    const t = this.cells[j * W + i];
    if (t === FLOOR.WATER) return 'f_water';
    if (t === FLOOR.GLASS) return 'f_glass';
    return this.surf(i, j).floor;
  }

  shaftCell(i, j) {
    return (i === 7 && j >= 13 && j <= 15) || (j === 15 && i >= 8 && i <= 22) || (i === 22 && j >= 14 && j <= 15);
  }

  open(i, j) {
    if (i < 0 || j < 0 || i >= W || j >= H) return false;
    return this.cells[j * W + i] > 0;
  }
  ceilAt(i, j) {
    return this.open(i, j) ? this.ceil[j * W + i] : 0;
  }
  floorAt(x, z) {
    const i = Math.floor(x), j = Math.floor(z);
    if (i < 0 || j < 0 || i >= W || j >= H) return 0;
    return this.cells[j * W + i];
  }
  roomAt(x, z) {
    const i = Math.floor(x), j = Math.floor(z);
    if (i < 0 || j < 0 || i >= W || j >= H) return null;
    const r = this.room[j * W + i];
    return r >= 0 ? ROOMS[r] : null;
  }

  // ------------------------------------------------------------- materials
  materials() {
    this.mat = {
      wall: echoMaterial({ map: 'wall', scale: 0.45, bump: 1.2 }),
      w_hosp: echoMaterial({ pat: 7, map: 'plaster', scale: 0.45, map2: 'paint', scale2: 0.5, split: 1.45, grime: 0.8 }),
      w_tile: echoMaterial({ pat: 7, map: 'plaster', scale: 0.45, map2: 'wtile', scale2: 0.55, split: 1.9, grime: 0.7 }),
      w_atrium: echoMaterial({ pat: 7, map: 'plaster', scale: 0.4, map2: 'brick2', scale2: 0.45, split: 1.25, grime: 0.6 }),
      w_paper: echoMaterial({ pat: 7, map: 'paper', scale: 0.5, map2: 'wood', scale2: 0.6, split: 0.95, grime: 0.6 }),
      w_concrete: echoMaterial({ map: 'wall', scale: 0.45, bump: 1.2, grime: 1 }),
      w_plates: echoMaterial({ map: 'plates', scale: 0.5, grime: 0.5 }),
      w_iso: echoMaterial({ pat: 7, map: 'wall', scale: 0.45, map2: 'corr', scale2: 0.5, split: 2.2, grime: 0.6 }),
      w_brick: echoMaterial({ map: 'brick', scale: 0.4, bump: 1.3, grime: 0.8 }),
      f_tile: echoMaterial({ map: 'tile', scale: 0.5, bump: 1.1, boost: 0.6 }),
      f_tile3: echoMaterial({ map: 'tile3', scale: 0.55, bump: 1.1, boost: 0.6 }),
      f_tile4: echoMaterial({ map: 'tile4', scale: 0.5, bump: 1.1, boost: 0.6 }),
      f_boards: echoMaterial({ map: 'boards', scale: 0.45, bump: 1.2, boost: 0.85 }),
      f_parquet: echoMaterial({ map: 'parquet', scale: 0.5, boost: 0.85 }),
      f_water2: echoMaterial({ map: 'parquet', scale: 0.5, pat: 1, wet: 1 }),
      f_conc3: echoMaterial({ map: 'conc3', scale: 0.4, bump: 1.2 }),
      f_rug: echoMaterial({ map: 'rug', scale: 0.6, boost: 0.8 }),
      w_hosp2: echoMaterial({ pat: 7, map: 'plaster4', scale: 0.45, map2: 'paint', scale2: 0.5, split: 1.5, grime: 0.8 }),
      w_tile2: echoMaterial({ pat: 7, map: 'plaster2', scale: 0.45, map2: 'wtile2', scale2: 0.7, split: 2.0, grime: 0.6 }),
      w_paper2: echoMaterial({ pat: 7, map: 'paper2', scale: 0.5, map2: 'wood', scale2: 0.6, split: 0.95, grime: 0.6 }),
      w_bunker: echoMaterial({ pat: 7, map: 'wall', scale: 0.45, map2: 'bunker', scale2: 0.5, split: 1.7, grime: 1 }),
      w_plates2: echoMaterial({ map: 'plates2', scale: 0.5, grime: 0.5 }),
      w_hall: echoMaterial({ pat: 7, map: 'plaster4', scale: 0.45, map2: 'pmetal2', scale2: 0.5, split: 1.3, grime: 0.6 }),
      w_steel2: echoMaterial({ map: 'steel2', scale: 0.6, grime: 0.6 }),
      pmetal2: echoMaterial({ map: 'pmetal2', scale: 0.8 }),
      steel2: echoMaterial({ map: 'steel2', scale: 0.9 }),
      metal3: echoMaterial({ map: 'metal3', scale: 0.9 }),
      chip: echoMaterial({ map: 'chip', scale: 1.2 }),
      boardsM: echoMaterial({ map: 'boards', scale: 0.9 }),
      corrM: echoMaterial({ map: 'corr', scale: 0.7 }),
      f_terrazzo: echoMaterial({ map: 'terrazzo', scale: 0.35, boost: 0.7 }),
      f_carpet: echoMaterial({ map: 'carpet', scale: 0.7, boost: 0.85 }),
      f_water: echoMaterial({ map: 'tile', scale: 0.5, pat: 1, wet: 1 }),
      f_glass: echoMaterial({ map: 'cfloor', scale: 0.4, pat: 3, boost: 0.8 }),
      f_cfloor: echoMaterial({ map: 'cfloor', scale: 0.4, bump: 1.2 }),
      f_grate: echoMaterial({ map: 'grate', scale: 0.6, bump: 1.4 }),
      f_dplate: echoMaterial({ map: 'dplate', scale: 0.8 }),
      c_office: echoMaterial({ map: 'oceil', scale: 0.3, boost: 0.45, grime: 0.4 }),
      c_plaster: echoMaterial({ map: 'ceil', scale: 0.4, boost: 0.8, grime: 0.3 }),
      c_concrete: echoMaterial({ map: 'wall', scale: 0.35, boost: 0.7, grime: 0.4 }),
      wood: echoMaterial({ map: 'wood', scale: 1.2 }),
      paint: echoMaterial({ map: 'paint', scale: 0.8 }),
      rust: echoMaterial({ map: 'rust', scale: 0.8, bump: 1.2 }),
      cloth: echoMaterial({ map: 'cloth', scale: 1.5, boost: 0.6, tint: 0xc8c2b8, grime: 0.6 }),
      cardboard: echoMaterial({ map: 'cardboard', scale: 1.5 }),
      paperw: echoMaterial({ map: 'paperw', scale: 3, boost: 1.1 }),
      rubber: echoMaterial({ map: 'rubber', scale: 1.5, wet: 0.4 }),
      iron: echoMaterial({ map: 'iron', scale: 1.2, bump: 1.2 }),
      pwood: echoMaterial({ map: 'pwood', scale: 0.9, boost: 3.0, tint: 0xfff2dc }),
      pwoodb: echoMaterial({ map: 'pwoodb', scale: 0.9 }),
      plates: echoMaterial({ map: 'plates', scale: 0.8 }),
      plastic: echoMaterial({ map: 'plastic', scale: 1.5, boost: 0.8 }),
      bplastic: echoMaterial({ map: 'bplastic', scale: 2 }),
      leather: echoMaterial({ map: 'leather', scale: 1.4 }),
      planks: echoMaterial({ map: 'planks', scale: 0.8 }),
      glassDark: (() => { const m = echoMaterial({ pat: 6, boost: 1.2 }); m.transparent = false; m.depthWrite = true; m.blending = THREE.NormalBlending; return m; })(),
      void: new THREE.MeshBasicMaterial({ color: 0x000000 }),
      ceil: echoMaterial({ map: 'ceil', scale: 0.4, boost: 0.8 }),
      [FLOOR.TILE]: echoMaterial({ map: 'tile', scale: 0.5, bump: 1.1, boost: 0.6 }),
      [FLOOR.WATER]: echoMaterial({ map: 'tile', scale: 0.5, pat: 1, wet: 1 }),
      [FLOOR.GLASS]: echoMaterial({ map: 'tile', scale: 0.5, pat: 3, boost: 0.6 }),
      [FLOOR.METAL]: echoMaterial({ map: 'grate', scale: 0.6, bump: 1.4 }),
      [FLOOR.CARPET]: echoMaterial({ map: 'carpet', scale: 0.7, boost: 0.85 }),
      prop: echoMaterial({ map: 'metal', scale: 0.9, bump: 0.8 }),
      flesh: echoMaterial({ pat: 5, boost: 1.0, wet: 0.3 }),
      soft: echoMaterial({ map: 'cloth', scale: 1.6, boost: 0.9, tint: 0xd8d4cc }),
      glass: echoMaterial({ pat: 6, boost: 1.0 }),
      item: echoMaterial({ map: 'metal', scale: 3, boost: 2.4, tint: 0xfff2c0 }),
      door: echoMaterial({ map: 'metal', scale: 0.6, boost: 1.0 }),
    };
    this.lineMat = {
      arch: echoMaterial({ kind: 'line', boost: 1.0 }),
      prop: echoMaterial({ kind: 'line', boost: 1.0 }),
      item: echoMaterial({ kind: 'line', boost: 3.5, tint: 0xfff2c0 }),
    };
  }

  // ---------------------------------------------------------- architecture
  buildArchitecture() {
    this.wallRuns = [];
    const groups = {}; // key -> {pos:[], nor:[]}
    const lines = [];
    const quad = (key, a, b, c, d, n) => {
      const g = (groups[key] ||= { pos: [], nor: [] });
      for (const v of [a, b, c, a, c, d]) {
        g.pos.push(v[0], v[1], v[2]);
        g.nor.push(n[0], n[1], n[2]);
      }
    };
    const outline = (a, b, c, d) => {
      for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]]) lines.push(...p, ...q);
    };

    // walls: returns [y0,y1] or null for face between open cell (i,j) and neighbour (ni,nj)
    const face = (i, j, ni, nj) => {
      const h = this.ceilAt(i, j);
      if (!this.open(ni, nj)) return [0, h];
      const hn = this.ceilAt(ni, nj);
      if (hn < h - 0.01) return [hn, h];
      return null;
    };

    // faces along x (north/south)
    for (const [dz, zOff, nz] of [[-1, 0, 1], [1, 1, -1]]) {
      for (let j = 0; j < H; j++) {
        let run = null;
        const flush = () => {
          if (!run) return;
          const z = j + zOff;
          const a = [run.x0, run.y0, z], b = [run.x1, run.y0, z], c = [run.x1, run.y1, z], d = [run.x0, run.y1, z];
          quad(run.k, a, b, c, d, [0, 0, nz]);
          outline(a, b, c, d);
          if (run.y0 === 0) this.wallRuns.push({ ax: 'x', a: run.x0, b: run.x1, at: z, n: nz, h: run.y1 });
          run = null;
        };
        for (let i = 0; i <= W; i++) {
          const f = i < W && this.open(i, j) ? face(i, j, i, j + dz) : null;
          const k = f ? this.surf(i, j).wall : null;
          if (f && run && run.y0 === f[0] && run.y1 === f[1] && run.k === k) run.x1 = i + 1;
          else {
            flush();
            if (f) run = { x0: i, x1: i + 1, y0: f[0], y1: f[1], k };
          }
        }
        flush();
      }
    }
    // faces along z (west/east)
    for (const [dx, xOff, nx] of [[-1, 0, 1], [1, 1, -1]]) {
      for (let i = 0; i < W; i++) {
        let run = null;
        const flush = () => {
          if (!run) return;
          const x = i + xOff;
          const a = [x, run.y0, run.z0], b = [x, run.y0, run.z1], c = [x, run.y1, run.z1], d = [x, run.y1, run.z0];
          quad(run.k, a, b, c, d, [nx, 0, 0]);
          outline(a, b, c, d);
          if (run.y0 === 0) this.wallRuns.push({ ax: 'z', a: run.z0, b: run.z1, at: x, n: nx, h: run.y1 });
          run = null;
        };
        for (let j = 0; j <= H; j++) {
          const f = j < H && this.open(i, j) ? face(i, j, i + dx, j) : null;
          const k = f ? this.surf(i, j).wall : null;
          if (f && run && run.y0 === f[0] && run.y1 === f[1] && run.k === k) run.z1 = j + 1;
          else {
            flush();
            if (f) run = { z0: j, z1: j + 1, y0: f[0], y1: f[1], k };
          }
        }
        flush();
      }
    }
    // floors & ceilings (row runs)
    for (let j = 0; j < H; j++) {
      let fr = null, cr = null;
      const flushF = () => {
        if (!fr) return;
        quad(fr.t, [fr.x0, 0, j], [fr.x0, 0, j + 1], [fr.x1, 0, j + 1], [fr.x1, 0, j], [0, 1, 0]);
        fr = null;
      };
      const flushC = () => {
        if (!cr) return;
        quad(cr.k, [cr.x0, cr.h, j], [cr.x1, cr.h, j], [cr.x1, cr.h, j + 1], [cr.x0, cr.h, j + 1], [0, -1, 0]);
        cr = null;
      };
      for (let i = 0; i <= W; i++) {
        const o = i < W && this.open(i, j);
        const t = o ? this.floorKey(i, j) : 0;
        const h = o ? this.ceil[j * W + i] : 0;
        const ck = o ? this.surf(i, j).ceil : 0;
        if (o && fr && fr.t === t) fr.x1 = i + 1;
        else { flushF(); if (o) fr = { t, x0: i, x1: i + 1 }; }
        if (o && cr && cr.h === h && cr.k === ck) cr.x1 = i + 1;
        else { flushC(); if (o) cr = { h, k: ck, x0: i, x1: i + 1 }; }
      }
      flushF();
      flushC();
    }

    const arch = new THREE.Group();
    for (const key in groups) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(groups[key].pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(groups[key].nor, 3));
      g.computeBoundingSphere();
      arch.add(new THREE.Mesh(g, this.mat[key]));
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    arch.add(new THREE.LineSegments(lg, this.lineMat.arch));
    arch.add(echoPoints(lg, { boost: 1.0 }));
    this.scene.add(arch);
  }

  // ----------------------------------------------------------------- props
  buildProps() {
    const B = (this.B = new Builder());
    const PI = Math.PI;

    // ===== architectural trim: baseboards, cornices, pilasters in tall halls
    for (const r of this.wallRuns) {
      const len = r.b - r.a, mid = (r.a + r.b) / 2;
      const place = (off, y, th, hgt, along = len, c = mid, key = 'paint') => {
        if (r.ax === 'x') B.box(c, y, r.at + r.n * off, along, hgt, th, { collide: false, key });
        else B.box(r.at + r.n * off, y, c, th, hgt, along, { collide: false, key });
      };
      place(0.015, 0.07, 0.03, 0.14, len, mid, 'wood');
      place(0.025, r.h - 0.06, 0.05, 0.12, len, mid, 'c_plaster');
      if (r.h >= 4 && len >= 4) {
        const n = Math.floor(len / 3);
        for (let k = 1; k < n + 0; k++) place(0.07, r.h / 2, 0.14, r.h, 0.36, r.a + (len / n) * k);
      }
    }

    // ===== wall clutter: radiators, conduits, junction boxes, bulkhead lamps, notices
    const CORR = ['Коридор Б', 'Западный коридор', 'Переход', 'Лифтовый холл', 'Атриум'];
    const HOSP = [...CORR, 'Медблок', 'Морг', 'Санузел', 'Кабинет 9', 'Архив'];
    const IND = ['Затопленный коридор', 'Служебный коридор', 'Генераторная', 'Шлюз', 'Безэховый блок'];
    for (const r of this.wallRuns) {
      const len = r.b - r.a;
      if (len < 1.6 || r.h < 2) continue;
      const ci = r.ax === 'x' ? Math.floor((r.a + r.b) / 2) : r.n > 0 ? r.at : r.at - 1;
      const cj = r.ax === 'x' ? (r.n > 0 ? r.at : r.at - 1) : Math.floor((r.a + r.b) / 2);
      const rm = this.room[cj * W + ci];
      const name = rm >= 0 ? ROOMS[rm].name : 'Коридор Б';
      // local frame: u along the wall, v out of the wall
      const at = (u, off) => (r.ax === 'x' ? [u, r.at + r.n * off] : [r.at + r.n * off, u]);
      const nearDoor = (u) => {
        const [x, z] = at(u, 0);
        return LOCKED.some((d) => Math.hypot(d[0] - x, d[1] - z) < 0.95);
      };
      const box = (u, y, off, su, sy, sv, key, rot = 0) => {
        if (nearDoor(u)) return;
        const [x, z] = at(u, off);
        if (r.ax === 'x') B.box(x, y, z, su, sy, sv, { collide: false, key, rot: [0, 0, rot] });
        else B.box(x, y, z, sv, sy, su, { collide: false, key, rot: [rot, 0, 0] });
      };
      const rodAlong = (u0, u1, y, off, rad, key) => {
        const [x0, z0] = at(u0, off), [x1, z1] = at(u1, off);
        B.pipe(x0, z0, x1, z1, y, rad, { key });
      };
      if (HOSP.includes(name) || IND.includes(name)) {
        // cable conduit near the ceiling with junction boxes
        const cy = Math.min(r.h - 0.35, 2.45);
        rodAlong(r.a + 0.05, r.b - 0.05, cy, 0.035, 0.018, 'rubber');
        if (len > 3) rodAlong(r.a + 0.05, r.b - 0.05, cy - 0.06, 0.03, 0.012, 'rust');
        for (let u = r.a + 1.2; u < r.b - 0.8; u += 2.6 + Math.random() * 2) {
          box(u, cy, 0.06, 0.16, 0.16, 0.07, 'paint');
        }
        // bulkhead lamps
        for (let u = r.a + 1.5; u < r.b - 1; u += 4.5) {
          if (nearDoor(u)) continue;
          const [x, z] = at(u, 0.06);
          B.cyl(x, Math.min(2.15, r.h - 0.6), z, 0.09, 0.1, 0.05, 16, { collide: false, key: 'rust', rot: r.ax === 'x' ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2] });
          const [x2, z2] = at(u, 0.1);
          B.add(new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [x2, Math.min(2.15, r.h - 0.6), z2], rot: r.ax === 'x' ? [r.n * Math.PI / 2, 0, 0] : [0, 0, -r.n * Math.PI / 2], collide: false, key: 'glass', lineKey: 'prop' });
        }
      }
      if (CORR.includes(name) && len > 3) {
        // cast-iron radiator
        const u = r.a + 1 + Math.random() * (len - 2.2);
        if (!nearDoor(u) && !nearDoor(u - 0.4) && !nearDoor(u + 0.6)) for (let k = 0; k < 10; k++) box(u - 0.36 + k * 0.08, 0.5, 0.09, 0.05, 0.55, 0.11, 'paint');
        if (!nearDoor(u) && !nearDoor(u - 0.4) && !nearDoor(u + 0.6)) {
          rodAlong(u - 0.42, u + 0.42, 0.24, 0.09, 0.022, 'paint');
          rodAlong(u - 0.42, u + 0.42, 0.76, 0.09, 0.022, 'paint');
          rodAlong(u + 0.42, u + 0.6, 0.24, 0.06, 0.02, 'rust');
        }
      }
      if (HOSP.includes(name)) {
        // notices, schedules, a torn poster
        const n = Math.floor(len / 3);
        for (let k = 0; k < n; k++) {
          if (Math.random() < 0.45) continue;
          const u = r.a + 0.5 + Math.random() * (len - 1);
          const big = Math.random() < 0.25;
          box(u, 1.35 + Math.random() * 0.3, 0.006, big ? 0.45 : 0.21, big ? 0.6 : 0.3, 0.004, 'paperw', (Math.random() - 0.5) * 0.15);
        }
      }
    }

    // ===== Медблок (x26-38, z44-54)
    for (const z of [45.3, 47.8, 50.3]) {
      P.bed(B.at(27.1, 0, z, PI / 2), { messy: z === 47.8 });
      P.bedside(B.at(26.35, 0, z + 1.25));
      P.curtain(B.at(28.2, 0, z + 1.25, PI / 2), 2.1, { folds: 8 });
      P.bed(B.at(36.9, 0, z, -PI / 2), { messy: z === 50.3 });
      P.bedside(B.at(37.6, 0, z - 1.25));
      P.curtain(B.at(35.8, 0, z - 1.25, PI / 2), 2.1, { folds: 8 });
    }
    P.ivStand(B.at(28.4, 0, 46.2));
    P.ivStand(B.at(35.4, 0, 49.4));
    P.ivStand(B.at(29.0, 0, 51.6), { fallen: true });
    P.desk(B.at(31.5, 0, 49.5, PI / 2), 1.6, 0.8);
    P.monitor(B.at(31.5, 0, 49.2, PI / 2));
    P.chair(B.at(30.6, 0, 49.6, -PI / 2));
    P.papers(B.at(32.5, 0, 50.5), 9, 1.2, 1.2);
    P.wheelchair(B.at(33.6, 0, 52.6), { fallen: true });
    for (const x of [27.5, 28.5, 33.5, 34.5]) P.cabinet(B.at(x, 0, 53.72, PI));
    P.sink(B.at(31.0, 0, 53.75, PI));
    P.vent(B.at(29, 3.18, 52));
    P.doorFrame(B.at(31.5, 0, 44), 3, 2.4, 3.2);

    // ===== Санузел (x39-43, z50-54)
    for (const x of [40, 41.2, 42.4]) {
      P.toilet(B.at(x, 0, 50.4));
      B.box(x + 0.6, 1.0, 51.0, 0.04, 2.0, 1.6);
    }
    P.sink(B.at(42.7, 0, 52.8, -PI / 2));
    P.sink(B.at(42.7, 0, 53.5, -PI / 2));
    P.lamp(B.at(41, 0, 52.5), 2.6, 0.3);

    // ===== Коридор Б (x30-33, z34-44)
    B.pipe(32.7, 34, 32.7, 44, 2.5, 0.09);
    B.pipe(32.45, 34, 32.45, 44, 2.6, 0.05);
    B.pipe(30.2, 34, 30.2, 44, 2.65, 0.04);
    P.gurney(B.at(30.55, 0, 41, 0.08), { body: true, bag: true });
    P.chair(B.at(32.2, 0, 36.5), { fallen: true });
    P.lamp(B.at(31.5, 0, 39), 2.8, 0.6);
    for (const z of [35.5, 42.5]) B.box(32.9, 1.6, z, 0.18, 0.5, 0.4);
    P.sign(B.at(31.5, 2.6, 34.17), 1.2, 0.25);
    P.doorFrame(B.at(31.5, 0, 34), 3, 2.4, 2.8);
    P.debris(B.at(31.6, 0, 38), 8, 1.2, 1.5);

    // ===== Морг (x35-43, z36-43)
    P.drawerWall(B.at(42.6, 0, 39.5, -PI / 2), 4, 3, { openIdx: 4 });
    P.opTable(B.at(37.3, 0, 38.0));
    P.corpse(B.at(0, 0, 0), 37.3, 0.95, 38.0, { sheet: true });
    P.opTable(B.at(37.3, 0, 41.0));
    P.gurney(B.at(40.0, 0, 42.0, PI / 2), { body: true, bag: true });
    P.lamp(B.at(37.3, 0, 38.0), 2.8, 0.7, { low: true });
    P.lamp(B.at(37.3, 0, 41.0), 2.8, 0.7, { low: true });
    P.sink(B.at(36.0, 0, 36.25));
    P.sink(B.at(37.0, 0, 36.25));
    B.box(38.9, 0.45, 41.0, 0.6, 0.9, 0.45);
    for (let i = 0; i < 6; i++) B.box(38.75 + i * 0.06, 0.92, 41.0, 0.02, 0.01, 0.2, { collide: false, edges: 0 });
    P.doorFrame(B.at(35, 0, 39, PI / 2), 2, 2.3, 2.8);

    // ===== Атриум (x24-40, z22-34, h5)
    B.cyl(32, 2.5, 28, 1.0, 1.0, 5, 16);
    B.cyl(32, 0.15, 28, 1.25, 1.25, 0.3, 16, { collide: false });
    B.cyl(32, 4.85, 28, 1.25, 1.25, 0.3, 16, { collide: false });
    // reception ring segment
    for (let a = -0.3; a < 1.9; a += 0.3) {
      const r = 3.0;
      B.box(32 + Math.cos(a) * r, 0.55, 28 + Math.sin(a) * r, 0.9, 1.1, 0.35, { rot: [0, -a + PI / 2, 0] });
    }
    P.monitor(B.at(33.6, 0.36, 30.0, 2.2));
    P.chair(B.at(33.2, 0, 29.2, 2.3), { fallen: true });
    P.bench(B.at(26.0, 0, 31.5));
    P.bench(B.at(26.0, 0, 24.5));
    P.bench(B.at(38.0, 0, 31.5));
    for (const [x, z] of [[24.6, 22.6], [39.4, 22.6], [24.6, 33.4], [39.4, 33.4]]) P.planter(B.at(x, 0, z));
    for (const [x, z, s] of [[38.5, 23.2, 0.9], [37.6, 23.1, 0.7], [38.5, 24.2, 0.8], [38.4, 23.3, 0.6]]) P.crate(B.at(x, 0, z), s, { ry: Math.random(), y: s === 0.6 ? 0.9 : 0 });
    // vending machine on its face
    B.box(25.5, 0.45, 27.0, 1.8, 0.9, 0.9, { rot: [0, 0.2, 0] });
    P.lamp(B.at(29, 0, 30), 5, 0.6);
    P.lamp(B.at(35, 0, 25), 5, 0.6);
    P.lamp(B.at(35, 0, 31), 5, 1.2);
    P.vent(B.at(28, 4.97, 25.0), 1.4, 1.0);
    // fallen ceiling panel + debris
    B.box(29.0, 0.4, 25.2, 1.4, 0.06, 1.0, { rot: [0.5, 0.3, 0.2], collide: false, key: 'c_office' });
    B.box(29.0, 0.5, 25.2, 1.2, 1.0, 0.8, { render: false });
    P.debris(B.at(28.5, 0, 25.0), 14, 1.4, 1.2);
    P.papers(B.at(31, 0, 31.5), 10, 3, 1.5);
    P.sign(B.at(30.0, 3.0, 22.05), 2.0, 0.4);
    P.doorFrame(B.at(32, 0, 22), 4, 2.6, 5);
    P.doorFrame(B.at(24, 0, 27.5, PI / 2), 3, 2.4, 5);
    P.doorFrame(B.at(40, 0, 27.5, PI / 2), 3, 2.4, 5);

    // ===== Западный коридор (x13-24, z26-29)
    for (const [x, z, ry, n] of LOCKER_ROWS) P.lockers(B.at(x, 0, z, ry), n);
    P.bench(B.at(18.0, 0, 27.15), 3.0);
    B.pipe(13, 28.75, 24, 28.75, 2.5, 0.08);
    B.pipe(13, 28.55, 24, 28.55, 2.6, 0.05);
    P.lamp(B.at(15.5, 0, 27.5), 2.8, 0.6);
    P.doorFrame(B.at(13, 0, 27.5, PI / 2), 3, 2.4, 2.8);

    // ===== Архив (x1-13, z17-36, carpet, h4)
    const rowsA = [18.6, 21.0, 23.4, 31.2, 33.6];
    rowsA.forEach((z, k) => {
      if (k % 2 === 0) {
        P.shelf(B.at(4.0, 0, z), 4.0, 3.2);
        P.shelf(B.at(9.6, 0, z), 3.6, 3.2);
      } else {
        P.shelf(B.at(6.6, 0, z), 6.4, 3.2);
      }
    });
    // perpendicular shelf walls to make a small maze
    P.shelf(B.at(11.5, 0, 22.2, PI / 2), 2.0, 3.2);
    P.shelf(B.at(2.0, 0, 32.4, PI / 2), 1.8, 3.2);
    // reading area
    P.desk(B.at(6.0, 0, 27.6), 1.8, 0.9);
    P.chair(B.at(6.0, 0, 28.4, PI));
    P.chair(B.at(4.6, 0, 27.0), { fallen: true });
    B.box(6.4, 0.8, 27.4, 0.3, 0.06, 0.4, { collide: false });
    P.lamp(B.at(6.0, 0, 27.6), 4.0, 1.6, { low: true });
    // toppled shelf
    B.box(3.0, 0.3, 27.6, 3.0, 0.5, 0.6, { rot: [0, 0.3, 0.08] });
    P.papers(B.at(3.5, 0, 28.5), 20, 2, 1.2);
    // fuse box on west wall
    B.box(1.12, 1.3, 18.0, 0.24, 0.7, 0.5);

    // ===== Затопленный коридор (x40-56, z26-29, water)
    B.pipe(40, 26.3, 56, 26.3, 2.45, 0.12);
    B.pipe(40, 26.6, 49, 26.6, 2.55, 0.06);
    // burst pipe: a cracked tee dripping into the water
    B.cyl(49.6, 2.3, 26.6, 0.07, 0.07, 0.3, 18, { key: 'rust', collide: false });
    B.cyl(49.6, 2.13, 26.6, 0.09, 0.07, 0.05, 18, { key: 'rust', collide: false });
    // a ceiling panel that came down and now floats in the water
    B.box(44.0, 0.03, 27.6, 1.0, 0.03, 0.9, { rot: [0.04, 0.5, 0.03], collide: false, key: 'c_office' });
    P.barrel(B.at(43.6, 0, 28.3), { fallen: true });
    P.crate(B.at(47.5, 0, 26.6), 0.7, { ry: 0.6 });
    // torn cable running down the wall into the water (it sparks)
    B.cyl(50.4, 1.2, 28.95, 0.015, 0.015, 2.3, 6, { key: 'rubber', collide: false, walk: true });
    P.cable(B.at(0, 0, 0), 50.4, 0.06, 28.95, 50.1, 0.02, 28.4, 0.0, 4);
    P.lamp(B.at(52, 0, 27.5), 2.8, 0.6);
    P.debris(B.at(46, 0, 27.5), 10, 4, 1);
    P.doorFrame(B.at(54, 0, 29, 0), 2, 2.2, 2.4);

    // ===== Кабинет Веры (x50-61, z32-41, water)
    P.desk(B.at(54, 0, 35, 0), 1.6, 0.8);
    P.monitor(B.at(54.2, 0, 34.8, 0));
    P.chair(B.at(54, 0, 35.9, PI), { fallen: true });
    P.desk(B.at(57.5, 0, 35, 0), 1.6, 0.8);
    P.chair(B.at(57.5, 0, 35.7, PI));
    P.desk(B.at(52.5, 0, 39.3, PI / 2), 1.4, 0.7);
    for (const z of [33, 34.0, 35.0, 36.0]) P.cabinet(B.at(60.7, 0, z, -PI / 2), 0.9, 1.4, 0.55, { glass: false });
    P.shelf(B.at(57, 0, 40.7), 4, 2.2, 0.4, { fill: 0.5 });
    B.box(55.5, 1.6, 32.03, 1.6, 1.0, 0.04, { collide: false }); // corkboard
    P.papers(B.at(55, 0, 37), 14, 3, 2);

    // ===== Шлюз (x53-55, z22-26)
    B.pipe(53.15, 22, 53.15, 26, 2.3, 0.06);
    B.box(54.9, 1.3, 24.6, 0.1, 0.25, 0.15, { collide: false }); // card reader

    // ===== Изолятор (x44-62, z6-22, glass, h4.5)
    for (const x of [50, 56]) B.box(x, 2.25, 8.0, 0.3, 4.5, 4.0);
    P.bars(B.at(47, 0, 10.05), 6, 3.2);
    B.box(47, 1.6, 10.0, 6, 3.2, 0.1, { key: 'glass', lineKey: 'prop' });
    P.bars(B.at(53, 0, 10.05), 6, 3.2, { gapFrom: -1.4, gapTo: 1.2, bent: true });
    P.bars(B.at(59, 0, 10.05), 6, 3.2);
    B.box(50.8, 1.6, 10.05, 1.6, 3.2, 0.12, { render: false });
    B.box(55.1, 1.6, 10.05, 1.8, 3.2, 0.12, { render: false });
    B.box(59, 1.6, 10.0, 6, 3.2, 0.1, { key: 'glass', lineKey: 'prop' });
    P.bed(B.at(46.5, 0, 7.4, PI / 2));
    P.bed(B.at(61.0, 0, 7.4, -PI / 2), { messy: true });
    P.debris(B.at(53, 0, 11.5), 22, 3, 1.5);
    // operating chair
    P.opTable(B.at(53, 0, 15.5, PI / 2));
    for (const dx of [-0.6, 0.6]) B.box(53 + dx, 1.0, 15.2, 0.12, 0.05, 0.3, { collide: false });
    P.lamp(B.at(53, 0, 15.5), 4.5, 1.8, { low: true });
    P.tank(B.at(46.2, 0, 18.5));
    P.tank(B.at(59.8, 0, 18.5), { body: false });
    P.tank(B.at(46.2, 0, 14.5), { body: true });
    P.console_(B.at(48.6, 0, 21.2, PI), 2.0);
    P.console_(B.at(58.4, 0, 21.2, PI), 2.0);
    P.chair(B.at(48.6, 0, 20.2), { fallen: true });
    P.cable(B.at(0, 0, 0), 48.6, 0.9, 20.9, 53, 0.02, 16.0, 0.0, 6);
    P.cable(B.at(0, 0, 0), 58.4, 0.9, 20.9, 53.6, 0.02, 15.8, 0.0, 6);
    B.pipe(44.2, 6, 44.2, 22, 4.0, 0.12);
    B.pipe(61.8, 6, 61.8, 22, 3.8, 0.1);
    P.papers(B.at(55, 0, 18.5), 12, 4, 2);
    P.sign(B.at(53, 3.4, 21.95, PI), 2.0, 0.4);
    P.doorFrame(B.at(54, 0, 22), 2, 2.4, 4.5);

    // ===== Служебный коридор (x30-34, z14-22, metal)
    B.pipe(30.25, 14, 30.25, 22, 2.5, 0.1);
    B.pipe(30.5, 14, 30.5, 22, 2.7, 0.06);
    B.pipe(33.7, 14, 33.7, 22, 2.6, 0.08);
    for (const z of [15.5, 19.5]) B.box(33.75, 1.2, z, 0.45, 1.8, 0.9);
    P.fan(B.at(30.05, 1.6, 17.5, PI / 2), 0.5);
    for (let z = 14.5; z < 22; z += 1.0) B.box(32, 0.005, z, 3.8, 0.01, 0.15, { collide: false, edges: 0, rot: [0, 0.6, 0] });
    P.lamp(B.at(32, 0, 18), 3, 0.6);
    P.doorFrame(B.at(32, 0, 14), 4, 2.6, 3);

    // ===== Генераторная (x22-42, z3-14, metal, h6)
    P.generator(B.at(32, 0, 7.2));
    for (const x of [24.5, 39.5]) P.fuelTank(B.at(x, 0, 4.4), 3.5);
    for (const [x, z] of [[26.6, 12.9], [27.3, 12.8], [26.9, 12.1], [41, 12.8]]) P.barrel(B.at(x, 0, z));
    P.barrel(B.at(40.3, 0, 12.7), { fallen: true });
    P.console_(B.at(38.5, 0, 11.3, PI), 2.2);
    P.fan(B.at(41.85, 3.5, 8.5, -PI / 2), 1.3);
    B.pipe(35.5, 6.4, 41.9, 6.4, 4.5, 0.25);
    B.pipe(22, 9, 28.8, 9, 4.0, 0.2);
    for (const x of [30, 32, 34]) B.box(x, 5.6, 7.2, 0.1, 0.8, 10.6, { collide: false });
    // row of switchgear cabinets along the west wall
    for (let k = 0; k < 3; k++) {
      const z = 4.15 + k * 1.05;
      B.box(22.35, 1.05, z, 0.6, 2.1, 1.0, { key: 'paint' });
      B.box(22.66, 1.3, z, 0.02, 1.5, 0.85, { collide: false, key: 'iron' });
      B.box(22.68, 1.3, z + 0.32, 0.04, 0.18, 0.04, { collide: false, key: 'bplastic' });
      B.box(22.67, 1.85, z, 0.01, 0.18, 0.3, { collide: false, key: 'paperw' });
    }
    B.pipe(22.4, 3.4, 22.4, 7.0, 2.3, 0.1, { key: 'rubber' });
    B.box(32, 1.3, 8.75, 0.8, 0.9, 0.12, { collide: false }); // fuse panel
    P.sign(B.at(32, 2.2, 8.74), 1.0, 0.3);
    for (const z of [5, 10]) P.lamp(B.at(27, 0, z), 6, 2);
    P.doorFrame(B.at(22, 0, 8.5, PI / 2), 3, 2.4, 6);

    // ===== Переход + Лифтовый холл
    B.pipe(13, 7.3, 22, 7.3, 2.5, 0.07);
    P.lamp(B.at(17, 0, 8.5), 2.8, 0.6);
    P.doorFrame(B.at(13, 0, 8.5, PI / 2), 3, 2.4, 3.5);
    P.bench(B.at(5.0, 0, 8.0, PI / 2), 2.0);
    P.bench(B.at(12.0, 0, 11.5), 1.8);
    P.planter(B.at(12.3, 0, 3.7));
    P.planter(B.at(4.7, 0, 12.3));
    B.box(10.5, 0.55, 11.6, 2.4, 1.1, 0.7); // counter
    P.monitor(B.at(10.0, 0.4, 11.6, PI));
    P.elevatorDoorFrame(B.at(7.5, 0, 3.0), 3, 2.4);
    B.box(9.55, 1.3, 3.06, 0.18, 0.3, 0.05, { collide: false }); // call panel
    P.papers(B.at(8, 0, 9), 6, 2, 2);
    // cab interior
    B.box(8.9, 1.3, 1.5, 0.05, 0.45, 0.25, { collide: false });
    B.box(6.05, 0.95, 1.5, 0.06, 0.04, 2.6, { collide: false });
    B.box(7.5, 0.95, 0.05, 2.6, 0.04, 0.06, { collide: false });

    // ===== ceilings
    for (const rm of ROOMS) {
      const ci = Math.floor(rm.x + rm.w / 2), cj = Math.floor(rm.z + rm.h / 2);
      const hgt = this.ceil[cj * W + ci];
      if (hgt < 2) continue;
      const kind = (SURF[rm.name] || H_).ceil;
      const x0 = rm.x, x1 = rm.x + rm.w, z0 = rm.z, z1 = rm.z + rm.h;
      const alongX = rm.w >= rm.h;
      if (kind === 'c_office') {
        // recessed fluorescent troffers on a grid, a few ceiling tiles missing
        for (let x = x0 + 1.2; x < x1 - 0.6; x += 2.4)
          for (let z = z0 + 1.2; z < z1 - 0.6; z += 2.4) {
            B.box(x, hgt - 0.03, z, 1.22, 0.06, 0.62, { collide: false, key: 'iron' });
            B.box(x, hgt - 0.065, z, 1.12, 0.012, 0.54, { collide: false, key: 'plastic', edges: 0 });
            if (Math.random() < 0.3) B.box(x, hgt - 0.07, z, 1.0, 0.004, 0.02, { collide: false, key: 'bplastic', edges: 0 });
          }
        for (let x = x0 + 0.3; x < x1 - 0.3; x += 0.6)
          for (let z = z0 + 0.3; z < z1 - 0.3; z += 0.6) {
            if (Math.random() > 0.05) continue;
            B.box(x, hgt - 0.004, z, 0.58, 0.004, 0.58, { collide: false, key: 'void', edges: 0 });
            // the tile itself lies on the floor below, cracked
            B.box(x + (Math.random() - 0.5) * 0.5, 0.012, z + (Math.random() - 0.5) * 0.5, 0.58, 0.016, 0.58, { collide: false, walk: true, key: 'c_office', rot: [0, Math.random() * 3, 0] });
          }
      } else if (kind === 'c_plaster') {
        // surface-mounted tube fittings down the middle, cable tray on hangers along one wall
        const n = alongX ? Math.floor(rm.w / 3) : Math.floor(rm.h / 3);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const x = alongX ? x0 + rm.w * t : x0 + rm.w / 2, z = alongX ? z0 + rm.h / 2 : z0 + rm.h * t;
          B.box(x, hgt - 0.07, z, alongX ? 1.25 : 0.16, 0.12, alongX ? 0.16 : 1.25, { collide: false, key: 'paint' });
          B.box(x, hgt - 0.135, z, alongX ? 1.15 : 0.1, 0.012, alongX ? 0.1 : 1.15, { collide: false, key: 'plastic', edges: 0 });
        }
        const off = 0.45;
        const ty = hgt - 0.28;
        // keep the tray clear of the existing pipe runs
        const zt = ['Затопленный коридор', 'Переход'].includes(rm.name) ? z1 - off : z0 + off;
        if (alongX) {
          B.box((x0 + x1) / 2, ty, zt, rm.w - 0.1, 0.05, 0.3, { collide: false, key: 'iron' });
          for (let x = x0 + 0.6; x < x1; x += 1.5) for (const dz of [-0.14, 0.14]) B.cyl(x, ty + 0.14, zt + dz, 0.008, 0.008, 0.28, 6, { collide: false, key: 'iron', edges: 0 });
        } else {
          B.box(x0 + off, ty, (z0 + z1) / 2, 0.3, 0.05, rm.h - 0.1, { collide: false, key: 'iron' });
          for (let z = z0 + 0.6; z < z1; z += 1.5) for (const dx of [-0.14, 0.14]) B.cyl(x0 + off + dx, ty + 0.14, z, 0.008, 0.008, 0.28, 6, { collide: false, key: 'iron', edges: 0 });
        }
      } else {
        // concrete slab: downstand beams across the short span, a ventilation duct along the long one
        const bd = hgt > 4 ? 0.5 : 0.32;
        if (alongX) for (let x = x0 + 2.5; x < x1 - 1; x += 3) B.box(x, hgt - bd / 2, (z0 + z1) / 2, 0.35, bd, rm.h, { collide: false, key: 'c_concrete' });
        else for (let z = z0 + 2.5; z < z1 - 1; z += 3) B.box((x0 + x1) / 2, hgt - bd / 2, z, rm.w, bd, 0.35, { collide: false, key: 'c_concrete' });
        if (rm.name === 'Атриум') for (let z = z0 + 3; z < z1 - 1; z += 3) B.box((x0 + x1) / 2, hgt - bd / 2, z, rm.w, bd, 0.35, { collide: false, key: 'c_concrete' });
        if (Math.min(rm.w, rm.h) >= 3 && rm.name !== 'Лифт') {
          const dy = hgt - bd - 0.3, sz = hgt > 4 ? 0.7 : 0.45;
          if (alongX) {
            const z = z0 + rm.h * 0.28;
            B.box((x0 + x1) / 2, dy, z, rm.w - 0.05, sz * 0.6, sz, { collide: false, key: 'iron' });
            for (let x = x0 + 1; x < x1; x += 2) B.box(x, dy + sz * 0.3 + 0.08, z, 0.03, 0.16 + bd, sz + 0.06, { collide: false, key: 'rust', edges: 0 });
            for (let x = x0 + 2.2; x < x1 - 1; x += 4.4) B.box(x, dy - sz * 0.3 - 0.01, z, 0.5, 0.02, 0.3, { collide: false, key: 'iron' });
          } else {
            const x = x0 + rm.w * 0.28;
            B.box(x, dy, (z0 + z1) / 2, sz, sz * 0.6, rm.h - 0.05, { collide: false, key: 'iron' });
            for (let z = z0 + 1; z < z1; z += 2) B.box(x, dy + sz * 0.3 + 0.08, z, sz + 0.06, 0.16 + bd, 0.03, { collide: false, key: 'rust', edges: 0 });
            for (let z = z0 + 2.2; z < z1 - 1; z += 4.4) B.box(x, dy - sz * 0.3 - 0.01, z, 0.3, 0.02, 0.5, { collide: false, key: 'iron' });
          }
        }
      }
    }

    // ===== lift hall defences: shutter housing over door A, vent hatch B, control panels
    B.box(12.9, 3.15, 8.5, 0.12, 0.7, 3.2, { collide: false, key: 'iron' });
    for (const z of [6.94, 10.06]) B.box(12.93, 1.4, z, 0.1, 2.8, 0.1, { collide: false, key: 'iron' });
    for (const [x, y, w, h] of [[7.5, 0.84, 1.0, 0.06], [7.5, 0.0, 1.0, 0.04], [7.0, 0.42, 0.05, 0.86], [8.0, 0.42, 0.05, 0.86]]) B.box(x, y, 12.97, w, h, 0.06, { collide: false, key: 'iron', walk: true });
    for (const x of [6.95, 8.05]) B.box(x, 1.0, 12.94, 0.05, 2.0, 0.05, { collide: false, key: 'iron', walk: true });
    // panels
    B.box(12.95, 1.3, 6.4, 0.06, 0.4, 0.3, { collide: false, key: 'paint' });
    B.box(6.5, 1.25, 12.95, 0.3, 0.4, 0.06, { collide: false, key: 'paint' });
    P.sign(B.at(12.96, 1.62, 6.4, -Math.PI / 2), 0.3, 0.1);
    P.sign(B.at(6.5, 1.57, 12.96, Math.PI), 0.3, 0.1);

    // ===== the dead from the orderly's log: palms pressed over their mouths
    P.corpse(B.at(0, 0, 0), 22.4, 0.0, 27.7, { pose: 'mouth', ry: 1.45 });
    P.corpse(B.at(0, 0, 0), 47.1, -0.04, 27.85, { pose: 'mouth', ry: 0.35 });
    P.corpse(B.at(0, 0, 0), 8.7, 0.0, 29.4, { pose: 'mouth', ry: -0.2 });

    // ===== duct mouths: torn-off grilles
    for (const [z, nz] of [[29.0, -1], [36.0, 1]]) {
      for (const x of [41.0, 42.0]) B.box(x, 0.62, z, 0.06, 1.25, 0.08, { collide: false, key: 'iron' });
      B.box(41.5, 1.22, z, 1.06, 0.06, 0.08, { collide: false, walk: true, key: 'iron' });
    }
    B.box(42.6, 0.02, 28.6, 0.9, 0.03, 1.1, { collide: false, walk: true, key: 'iron', rot: [0, 0.3, 0] });
    for (let k = 0; k < 6; k++) B.box(42.6 + Math.cos(0.3) * (k - 2.5) * 0.15, 0.04, 28.6 - Math.sin(0.3) * (k - 2.5) * 0.15, 0.02, 0.02, 1.0, { collide: false, walk: true, key: 'rust', rot: [0, 0.3, 0], edges: 0 });

    // ===== extra dressing (second pass)
    const R = Math.PI;
    // medbay
    P.medCart(B.at(33.8, 0, 46.0, 0.3));
    P.oxygenTanks(B.at(26.6, 0, 53.35, 0));
    P.screen(B.at(29.8, 0, 46.9, 0.2));
    P.wallClock(B.at(34.5, 2.4, 44.03, 0));
    P.mirror(B.at(31.0, 1.6, 53.96, R));
    // washroom
    P.mirror(B.at(42.97, 1.6, 53.15, -R / 2), 0.9, 0.6);
    P.drain(B.at(40.5, 0, 52.5));
    P.bucketMop(B.at(39.4, 0, 53.5));
    P.shower(B.at(39.15, 0, 52.2, R / 2));
    // corridor B
    P.wheelchair(B.at(32.3, 0, 43.1, 2.6));
    P.extinguisherBox(B.at(32.97, 0, 36.6, -R / 2));
    P.wallPhone(B.at(30.03, 0, 42.3, R / 2));
    // morgue
    P.drain(B.at(38.6, 0, 39.5));
    P.medCart(B.at(36.0, 0, 42.3, 0));
    // atrium
    P.couch(B.at(27.5, 0, 32.85, R));
    P.armchair(B.at(35.5, 0, 32.65, R + 0.3));
    P.armchair(B.at(37.25, 0, 32.3, R - 0.4));
    P.wallClock(B.at(35.5, 3.0, 22.03, 0));
    P.rubble(B.at(28.3, 0, 25.4), 34, 1.0, 0.8);
    // west corridor
    P.extinguisherBox(B.at(18.5, 0, 28.97, R));
    // archive
    P.filingCabinet(B.at(1.35, 0, 26.0, R / 2), { open: false });
    P.filingCabinet(B.at(1.35, 0, 28.9, R / 2), { open: true });
    P.typewriter(B.at(5.6, 0, 27.65, 0.1));
    // Vera's office
    P.armchair(B.at(59.2, 0, 39.6, -2.4));
    P.typewriter(B.at(52.5, 0, 39.55, R / 2));
    P.filingCabinet(B.at(50.4, 0, 33.2, R / 2), { open: true });
    P.wallClock(B.at(58.5, 2.3, 32.03, 0));
    // flooded corridor
    P.pallet(B.at(45.3, 0, 28.25, 0.25));
    // generator room
    for (const z of [4.6, 6.2, 11.4]) {
      B.cyl(41.75, 1.6, z, 0.06, 0.06, 3.2, 16, { key: 'rust', collide: false });
      P.valveWheel(B.at(41.55, 1.25, z, -R / 2));
    }
    P.pallet(B.at(24.5, 0, 9.9, 0.2));
    P.oxygenTanks(B.at(36.8, 0, 3.55, 0), 4);
    // service corridor
    B.cyl(30.18, 1.3, 16.0, 0.05, 0.05, 2.6, 16, { key: 'rust', collide: false });
    P.valveWheel(B.at(30.3, 1.35, 16.0, R / 2), 0.13);
    // lift lobby
    P.armchair(B.at(5.4, 0, 10.6, R / 2));
    P.wallClock(B.at(11.0, 2.4, 3.03, 0));
    // isolation
    P.oxygenTanks(B.at(60.6, 0, 13.5, -R / 2));
    P.medCart(B.at(55.6, 0, 17.2, 0.5));
    P.rubble(B.at(58.2, 0, 12.6), 24, 0.9, 0.6);
    // boarded-up doors
    for (const k of [4, 10]) {
      const [x, z, nx, nz] = LOCKED[k];
      P.boards(B.at(x + nx * 0.02, 0, z + nz * 0.02, Math.atan2(nx, nz)), 0.9, 2.05);
    }

    this.scene.add(B.build(this.mat, this.lineMat));
    this.colliders = B.colliders;
    this.audit = B.audit || [];

    // ambient emitters
    this.drips.push(
      { pos: new THREE.Vector3(31.2, 2.8, 41.5), t: 0, int: 1.7 },
      { pos: new THREE.Vector3(38.5, 2.8, 39.5), t: 0.5, int: 2.6 },
      { pos: new THREE.Vector3(3.5, 4.0, 29.5), t: 1, int: 3.1 },
      { pos: new THREE.Vector3(49.6, 1.2, 26.9), t: 0, int: 0.55 },
      { pos: new THREE.Vector3(44.5, 2.8, 28.0), t: 0, int: 2.2 },
      { pos: new THREE.Vector3(53.5, 3.0, 38.0), t: 0, int: 1.9 },
      { pos: new THREE.Vector3(59.0, 3.0, 33.5), t: 0, int: 2.8 },
      { pos: new THREE.Vector3(47.5, 4.5, 12.5), t: 0, int: 2.4 },
      { pos: new THREE.Vector3(42.5, 2.6, 53.2), t: 0, int: 1.5 },
      { pos: new THREE.Vector3(8.0, 3.5, 6.0), t: 0, int: 3.3 },
    );
    this.sparks.push(
      { pos: new THREE.Vector3(50.4, 0.25, 28.8), t: 0, int: 2.7 },
      { pos: new THREE.Vector3(33.7, 2.0, 19.5), t: 1, int: 4.3 },
      { pos: new THREE.Vector3(58.4, 1.5, 20.9), t: 2, int: 3.6 },
    );
  }

  // ---------------------------------------------------------------- decals
  buildDecals() {
    const sets = {};
    const put = (type, x, y, z, nx, ny, nz, size, rot = Math.random() * 6.28, sy = size) => {
      const g = new THREE.PlaneGeometry(size, sy);
      const n = new THREE.Vector3(nx, ny, nz).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const qr = new THREE.Quaternion().setFromAxisAngle(n, rot);
      g.applyQuaternion(q.premultiply(qr));
      g.translate(x + n.x * 0.006, y + n.y * 0.006, z + n.z * 0.006);
      (sets[type] ||= []).push(g);
    };
    const R = (a, b) => a + Math.random() * (b - a);
    const pick = (w) => {
      let t = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
      for (const k in w) if ((t -= w[k]) <= 0) return k;
      return Object.keys(w)[0];
    };
    const HOSPW = { leak: 2, crack: 2.5, mould: 1.5, blood_splat: 1, handprints: 0.8, claws: 0.7, stain: 0.6 };
    const INDW = { leak: 3.5, crack: 2.5, mould: 2, soot: 1, claws: 1 };
    // walls
    for (const r of this.wallRuns) {
      const len = r.b - r.a;
      const ci = r.ax === 'x' ? Math.floor((r.a + r.b) / 2) : r.n > 0 ? r.at : r.at - 1;
      const cj = r.ax === 'x' ? (r.n > 0 ? r.at : r.at - 1) : Math.floor((r.a + r.b) / 2);
      const rm = this.room[cj * W + ci];
      const name = rm >= 0 ? ROOMS[rm].name : '';
      if (r.h < 2) continue;
      const ind = ['Затопленный коридор', 'Служебный коридор', 'Генераторная', 'Шлюз', 'Безэховый блок', 'Лифт'].includes(name);
      const n = Math.max(1, Math.round(len / 2.2));
      for (let k = 0; k < n; k++) {
        const type = pick(ind ? INDW : HOSPW);
        const u = R(r.a + 0.4, r.b - 0.4);
        let size, y, rot = R(-0.25, 0.25), sy;
        if (type === 'leak') { size = R(0.9, 1.8); sy = size * R(1, 1.6); y = r.h - sy / 2; rot = 0; }
        else if (type === 'mould') { size = R(0.8, 1.6); y = R(0.2, 0.7); }
        else if (type === 'crack') { size = R(0.6, 1.4); y = R(0.4, r.h - 0.6); rot = R(0, 6.28); }
        else if (type === 'soot') { size = R(1, 2); y = R(0.6, 1.6); }
        else if (type === 'stain') { size = R(0.8, 1.4); y = R(1.5, r.h - 0.5); }
        else { size = R(0.5, 0.9); y = R(0.9, 1.6); }
        const nx = r.ax === 'z' ? r.n : 0, nz = r.ax === 'x' ? r.n : 0;
        const x = r.ax === 'x' ? u : r.at, z = r.ax === 'x' ? r.at : u;
        put(type, x, y, z, nx, 0, nz, size, rot, sy);
      }
    }
    // floors and ceilings
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        if (!this.open(i, j)) continue;
        const t = this.cells[j * W + i];
        if (Math.random() < 0.06 && t !== FLOOR.WATER) put('crack', i + Math.random(), 0, j + Math.random(), 0, 1, 0, R(0.6, 1.4));
        if (Math.random() < 0.03 && t !== FLOOR.WATER && t !== FLOOR.CARPET) put('stain', i + Math.random(), 0, j + Math.random(), 0, 1, 0, R(0.6, 1.2));
        if (Math.random() < 0.05) put('stain', i + Math.random(), this.ceil[j * W + i], j + Math.random(), 0, -1, 0, R(0.8, 1.8));
        if (Math.random() < 0.02) put('mould', i + Math.random(), this.ceil[j * W + i], j + Math.random(), 0, -1, 0, R(0.8, 1.6));
      }
    // the story in blood: drag marks, pools, hands, claws
    put('blood_drag', 34.2, 0, 39.0, 0, 1, 0, 1.0, Math.PI / 2, 3.0); // out of the morgue
    put('blood_drag', 31.6, 0, 37.0, 0, 1, 0, 0.9, 0.1, 2.6);
    put('blood_pool', 37.9, 0, 37.55, 0, 1, 0, 0.7);
    put('blood_pool', 28.6, 0, 26.2, 0, 1, 0, 1.6); // below the vent
    put('blood_splat', 29.3, 0, 24.6, 0, 1, 0, 1.4);
    put('blood_splat', 31.0, 2.0, 28.0, -1, 0, 0, 1.2); // atrium column
    put('blood_drag', 53.2, 0, 13.0, 0, 1, 0, 1.0, 0.25, 4.0); // out of the broken cell
    put('blood_pool', 53.0, 0, 8.3, 0, 1, 0, 1.4);
    put('claws', 50.15, 1.6, 8.0, 1, 0, 0, 1.0);
    put('claws', 55.85, 1.8, 7.5, -1, 0, 0, 1.0, 0.3);
    put('claws', 53, 1.7, 22.0, 0, 0, 1, 0.9);
    put('handprints', 53.02, 1.3, 23.2, 1, 0, 0, 0.8);
    put('handprints', 9.4, 1.3, 3.03, 0, 0, 1, 0.7, 0.2);
    put('blood_drag', 8.0, 0, 6.0, 0, 1, 0, 0.8, -0.4, 2.4); // towards the lift
    put('handprints', 30.03, 1.25, 36.3, 1, 0, 0, 0.75, -0.3);
    put('blood_splat', 26.03, 1.4, 49.0, 1, 0, 0, 1.0);
    put('blood_pool', 8.5, 0, 9.5, 0, 1, 0, 1.1);
    put('soot', 33.6, 1.2, 19.5, -1, 0, 0, 1.4); // around the sparking box
    put('soot', 50.4, 0, 27.9, 0, 1, 0, 1.2);
    put('claws', 20.0, 1.5, 29.0, 0, 0, -1, 0.9);

    const group = new THREE.Group();
    const wet = { blood_pool: 1, blood_drag: 0.8, blood_splat: 0.7, handprints: 0.6, leak: 0.5, mould: 0.3 };
    for (const type in sets) {
      const g = mergeGeometries(sets[type], false);
      const m = new THREE.Mesh(g, echoMaterial({ pat: 8, map: 'decal:' + type, wet: wet[type] || 0, boost: 1.0 }));
      m.renderOrder = 1;
      group.add(m);
    }
    this.scene.add(group);
  }

  // ------------------------------------------------------- items & doors
  buildDynamic() {
    const mat = this.mat.item, lm = this.lineMat.item;
    const paperMat = echoMaterial({ map: 'paperw', scale: 4, boost: 2.2, tint: 0xfff6e0 });
    const add = (type, pos, parts, extra = {}) => {
      const obj = makeObject(parts, type === 'note' ? paperMat : mat, lm);
      obj.position.copy(pos);
      this.scene.add(obj);
      const it = { type, pos: pos.clone(), obj, taken: false, ...extra };
      this.items.push(it);
      return it;
    };
    const paper = () => [{ geo: new THREE.BoxGeometry(0.21, 0.006, 0.297), rot: [0, 0.3, 0] }];
    const fuse = () => [
      { geo: new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), rot: [0, 0, Math.PI / 2] },
      { geo: new THREE.CylinderGeometry(0.045, 0.045, 0.03, 8), pos: [0.08, 0, 0], rot: [0, 0, Math.PI / 2] },
      { geo: new THREE.CylinderGeometry(0.045, 0.045, 0.03, 8), pos: [-0.08, 0, 0], rot: [0, 0, Math.PI / 2] },
    ];
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    add('note', V(36.25, 0.69, 50.15), paper(), { note: 0 });
    add('note', V(33.9, 1.13, 29.6), paper(), { note: 1 });
    add('note', V(38.9, 0.915, 41.2), paper(), { note: 2 });
    add('note', V(6.4, 0.77, 27.7), paper(), { note: 3 });
    add('note', V(57.3, 0.77, 34.9), paper(), { note: 4 });
    add('note', V(48.2, 1.12, 21.0), paper(), { note: 5 });
    add('note', V(42.55, 0.96, 52.8), paper(), { note: 6 });
    add('note', V(38.1, 1.13, 11.0), paper(), { note: 7 });
    add('note', V(11.2, 1.12, 11.55), paper(), { note: 8 });
    add('fuseA', V(1.3, 1.3, 18.0), fuse(), { name: 'предохранитель ПН-2' });
    add('card', V(54.5, 0.77, 34.7), [{ geo: new THREE.BoxGeometry(0.085, 0.004, 0.054) }], { name: 'карта доступа Ореховой' });
    add('fuseB', V(53.0, 0.05, 6.8), fuse(), { name: 'предохранитель ПН-2' });
    add('panel', V(32, 1.3, 8.85), [{ geo: new THREE.BoxGeometry(0.3, 0.3, 0.02) }]);
    add('call', V(9.55, 1.3, 3.1), [{ geo: new THREE.BoxGeometry(0.08, 0.08, 0.02) }]);
    add('cab', V(8.85, 1.3, 1.5), [{ geo: new THREE.BoxGeometry(0.02, 0.1, 0.1) }]);
    const stone = () => [{ geo: new THREE.IcosahedronGeometry(0.07, 0) }];
    for (const [x, z] of [[33.2, 46.2], [31.2, 36.0], [40.5, 37.2], [41.0, 38.0], [27.0, 29.0], [36.5, 24.5], [20.5, 28.4], [9.0, 29.5], [45.5, 28.4], [51.2, 33.0], [47.0, 13.0], [35.5, 12.8], [31.0, 19.5], [6.0, 10.0]])
      add('stone', V(x, 0.05, z), stone());

    // ---- doors
    const M = this.mat, LM = this.lineMat.prop;
    // double doors you can slam shut behind you (the creature smashes them)
    const SLAM = [
      { id: 'slamMorgue', plane: 'x', at: 35, a: 38, b: 40, open: 0 },
      { id: 'slamOffice', plane: 'z', at: 29, a: 53, b: 55, open: -Math.PI / 2 },
      { id: 'slamArchive', plane: 'x', at: 13, a: 26, b: 29, open: Math.PI },
    ];
    for (const sd of SLAM) {
      const w = (sd.b - sd.a) / 2;
      const door = { id: sd.id, kind: 'slam', closed: false, t: 1, hp: 3, broken: false, leaves: [], box: null };
      const ends = [[sd.a + 0.03, sd.plane === 'x' ? -Math.PI / 2 : 0], [sd.b - 0.03, sd.plane === 'x' ? Math.PI / 2 : Math.PI]];
      for (const [u, closedRot] of ends) {
        const lf = woodLeaf(M, LM, w - 0.03, 2.15, { window: true, mat: 'pwoodb' });
        if (sd.plane === 'x') lf.pivot.position.set(sd.at, 0, u);
        else lf.pivot.position.set(u, 0, sd.at);
        this.scene.add(lf.pivot);
        door.leaves.push({ pivot: lf.pivot, closedRot, openRot: sd.open });
      }
      door.boxClosed = sd.plane === 'x' ? { minX: sd.at - 0.08, maxX: sd.at + 0.08, minZ: sd.a, maxZ: sd.b } : { minX: sd.a, maxX: sd.b, minZ: sd.at - 0.08, maxZ: sd.at + 0.08 };
      door.center = sd.plane === 'x' ? new THREE.Vector3(sd.at, 1.2, (sd.a + sd.b) / 2) : new THREE.Vector3((sd.a + sd.b) / 2, 1.2, sd.at);
      this.doors.push(door);
      this.items.push({ type: 'slam', door: sd.id, pos: door.center.clone(), obj: new THREE.Object3D(), taken: false });
    }

    // rolling shutter A (corridor) and sliding hatch B (vent), lift hall
    const shA = new THREE.Group();
    const slab = (w, h) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, w), M.plates);
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), LM));
      g.add(m);
      for (let k = 1; k < Math.floor(h / 0.12); k++) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, w), M.iron);
        r.position.y = -h / 2 + k * 0.12;
        g.add(r);
      }
      return g;
    };
    shA.add(slab(3.0, 2.8));
    shA.position.set(12.97, 1.4, 8.5);
    this.scene.add(shA);
    this.doors.push({ id: 'shA', kind: 'shutter', closed: false, t: 0, obj: shA, y0: 1.4, rise: 2.75, speed: 0.9, box: null, boxClosed: { minX: 12.92, maxX: 13.02, minZ: 7, maxZ: 10 } });
    const shB = slab(1.0, 0.95);
    shB.rotation.y = Math.PI / 2;
    shB.position.set(7.5, 0.47, 12.955);
    this.scene.add(shB);
    this.doors.push({ id: 'shB', kind: 'shutter', closed: false, t: 0, obj: shB, y0: 0.47, rise: 1.0, speed: 1.3, box: null, boxClosed: { minX: 7, maxX: 8, minZ: 12.9, maxZ: 13.02 } });
    for (const [x, z, ry, n, idx] of LOCKER_ROWS)
      for (const i of idx) {
        const lx = (i - (n - 1) / 2) * 0.5;
        const c = Math.cos(ry), sn = Math.sin(ry);
        const W2 = (u, v) => new THREE.Vector3(x + u * c + v * sn, 0, z - u * sn + v * c);
        this.items.push({ type: 'locker', pos: W2(lx, 0.45).setY(1.1), inside: W2(lx, 0.02), front: W2(lx, 0.8), yaw: ry + Math.PI, obj: new THREE.Object3D(), taken: false });
      }
    this.items.push({ type: 'shutterA', pos: new THREE.Vector3(12.9, 1.3, 6.4), obj: new THREE.Object3D(), taken: false });
    this.items.push({ type: 'shutterB', pos: new THREE.Vector3(6.5, 1.25, 12.9), obj: new THREE.Object3D(), taken: false });
    this.items.push({ type: 'seismo', pos: new THREE.Vector3(10.0, 1.3, 11.4), obj: new THREE.Object3D(), taken: false });

    // airlock: two riveted steel leaves on hinges, swinging out into the corridor
    const lab = { id: 'lab', kind: 'hinge', closed: true, t: 0, box: { minX: 53, maxX: 55, minZ: 23.9, maxZ: 24.1 }, leaves: [] };
    for (const [hx, rot, dir] of [[53.02, 0, -1], [54.98, Math.PI, 1]]) {
      const lf = steelLeaf(M, LM, 0.96, 2.5);
      lf.pivot.position.set(hx, 0, 24);
      lf.pivot.rotation.y = rot;
      this.scene.add(lf.pivot);
      lab.leaves.push({ ...lf, closedRot: rot, dir });
    }
    this.doors.push(lab);
    // lift: brushed steel leaves sliding apart
    const lift = { id: 'lift', kind: 'slide', closed: true, t: 0, box: { minX: 6, maxX: 9, minZ: 2.9, maxZ: 3.1 }, leaves: [] };
    for (const s of [-1, 1]) {
      const g = liftLeaf(M, LM, 1.5, 2.4);
      g.position.set(7.5 + s * 0.75, 1.2, 3.02);
      this.scene.add(g);
      lift.leaves.push({ obj: g, base: 7.5 + s * 0.75, s });
    }
    this.doors.push(lift);
    // locked doors: frame + panelled leaf, rattle when tried
    LOCKED.forEach(([x, z, nx, nz], k) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = Math.atan2(nx, nz);
      g.add(doorFrame(M, LM, 0.9, 2.05, k % 3 === 2 ? 'pwoodb' : 'pwood'));
      const lf = woodLeaf(M, LM, 0.9, 2.05, { window: k % 2 === 0, mat: k % 3 === 2 ? 'pwoodb' : 'pwood' });
      lf.pivot.position.set(-0.45, 0, 0.035);
      g.add(lf.pivot);
      this.scene.add(g);
      g.updateMatrixWorld(true);
      const hp = new THREE.Vector3();
      lf.handle.getWorldPosition(hp);
      this.doors.push({ id: 'locked' + k, kind: 'locked', closed: false, t: 0, rattle: 0, pivot: lf.pivot, handle: lf.handle });
      this.items.push({ type: 'locked', door: 'locked' + k, pos: hp, obj: g, taken: false });
    });
  }

  door(id) {
    return this.doors.find((d) => d.id === id);
  }

  setDoor(id, open) {
    const d = this.door(id);
    d.closed = !open;
    d.target = open ? 1 : 0;
    this.buildNav();
  }

  updateDoors(dt) {
    for (const d of this.doors) {
      if (d.kind === 'locked') {
        if (d.rattle > 0) {
          d.rattle = Math.max(0, d.rattle - dt);
          const k = d.rattle / 0.6;
          d.handle.rotation.z = -0.55 * Math.abs(Math.sin(d.rattle * 22)) * k;
          d.pivot.rotation.y = Math.sin(d.rattle * 60) * 0.012 * k;
        }
        continue;
      }
      if (d.kind === 'slam') {
        const tg = d.closed ? 0 : 1;
        d.t += Math.sign(tg - d.t) * Math.min(Math.abs(tg - d.t), dt * (d.closed ? 3.2 : d.broken ? 4 : 1.3));
        const e = ease(d.t);
        for (const l of d.leaves) {
          const over = d.broken ? 0.25 * Math.sign(l.openRot - l.closedRot || 1) : 0;
          l.pivot.rotation.y = l.closedRot + (l.openRot + over - l.closedRot) * e + (d.shudder > 0 ? Math.sin(d.shudder * 70) * 0.03 * d.shudder : 0);
        }
        if (d.shudder > 0) d.shudder = Math.max(0, d.shudder - dt * 2);
        d.box = d.t < 0.5 && !d.broken ? d.boxClosed : null;
        continue;
      }
      if (d.kind === 'shutter') {
        const tg = d.closed ? 1 : 0;
        d.t += Math.sign(tg - d.t) * Math.min(Math.abs(tg - d.t), dt * d.speed);
        d.obj.position.y = d.y0 + d.rise * (1 - ease(d.t));
        if (d.boxClosed) d.box = d.t > 0.85 ? d.boxClosed : null;
        continue;
      }
      const target = d.closed ? 0 : 1;
      d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt * (d.kind === 'hinge' ? 0.45 : 0.6));
      const e = ease(d.t);
      if (d.kind === 'hinge') for (const l of d.leaves) l.pivot.rotation.y = l.closedRot + l.dir * 1.72 * e;
      if (d.kind === 'slide') for (const l of d.leaves) l.obj.position.x = l.base + l.s * 1.45 * e;
    }
  }

  toggleSlam(id) {
    const d = this.door(id);
    if (!d || d.broken) return null;
    d.closed = !d.closed;
    return d.closed;
  }

  // one blow of the creature; returns true when the door gives way
  bashDoor(d) {
    d.hp -= 1;
    d.shudder = 1;
    if (d.hp <= 0) {
      d.broken = true;
      d.closed = false;
      return true;
    }
    return false;
  }

  slamDoorAhead(pos) {
    for (const d of this.doors) {
      if (d.kind !== 'slam' || d.broken || !d.closed || d.t > 0.5) continue;
      if (Math.hypot(d.center.x - pos.x, d.center.z - pos.z) < 1.15) return d;
    }
    return null;
  }

  setShutter(which, closed) {
    const d = this.door(which === 'A' ? 'shA' : 'shB');
    if (d.closed === closed) return;
    d.closed = closed;
    // motor whine, then the slats bottom out
    this.onShutter && this.onShutter(d, closed);
  }

  rattle(id) {
    const d = this.door(id);
    if (d) d.rattle = 0.6;
  }

  // -------------------------------------------------------------- collision
  buildCollision() {
    // spatial hash per cell
    this.hash = Array.from({ length: W * H }, () => []);
    for (const c of this.colliders) {
      for (let j = Math.floor(c.minZ); j <= Math.floor(c.maxZ); j++)
        for (let i = Math.floor(c.minX); i <= Math.floor(c.maxX); i++)
          if (i >= 0 && j >= 0 && i < W && j < H) this.hash[j * W + i].push(c);
    }
  }

  // push circle (pos.x,pos.z,r) out of walls/props
  collide(pos, r) {
    for (let iter = 0; iter < 2; iter++) {
      const i0 = Math.floor(pos.x - r - 1), i1 = Math.floor(pos.x + r + 1);
      const j0 = Math.floor(pos.z - r - 1), j1 = Math.floor(pos.z + r + 1);
      const seen = new Set();
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          if (!this.open(i, j)) this._push(pos, r, i, i + 1, j, j + 1);
          else if (i >= 0 && j >= 0 && i < W && j < H)
            for (const c of this.hash[j * W + i]) {
              if (seen.has(c)) continue;
              seen.add(c);
              this._push(pos, r, c.minX, c.maxX, c.minZ, c.maxZ);
            }
        }
      for (const d of this.doors) if (d.box && (d.closed || d.kind === 'shutter' || d.kind === 'slam') && !(this._navBuild && d.kind === 'slam')) this._push(pos, r, d.box.minX, d.box.maxX, d.box.minZ, d.box.maxZ);
    }
  }

  _push(pos, r, minX, maxX, minZ, maxZ) {
    const cx = Math.max(minX, Math.min(pos.x, maxX));
    const cz = Math.max(minZ, Math.min(pos.z, maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * r;
      pos.z = cz + (dz / d) * r;
    } else {
      // centre inside box: push along smallest axis
      const l = pos.x - minX, rr = maxX - pos.x, t = pos.z - minZ, b = maxZ - pos.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) pos.x = minX - r;
      else if (m === rr) pos.x = maxX + r;
      else if (m === t) pos.z = minZ - r;
      else pos.z = maxZ + r;
    }
  }

  blockedPoint(x, z, r) {
    const p = { x, z };
    this.collide(p, r);
    return Math.abs(p.x - x) > 1e-3 || Math.abs(p.z - z) > 1e-3;
  }

  // ------------------------------------------------------------ navigation
  buildNav() {
    this._navBuild = true;
    const S = (this.navS = 0.25);
    const NW = (this.NW = W / S), NH = (this.NH = H / S);
    const grid = () => {
      const g = new Uint8Array(NW * NH);
      for (let j = 0; j < NH; j++)
        for (let i = 0; i < NW; i++) {
          const x = (i + 0.5) * S, z = (j + 0.5) * S;
          const ci = Math.floor(z) * W + Math.floor(x);
          const crawlOk = this.ceil[ci] >= 1.7 || this.shaftCell(Math.floor(x), Math.floor(z));
          g[j * NW + i] = this.open(Math.floor(x), Math.floor(z)) && crawlOk && !this.blockedPoint(x, z, 0.3) ? 1 : 0;
        }
      return g;
    };
    if (!this.navReach) {
      // connectivity with every door open: drops pockets enclosed by furniture
      const saved = this.doors.map((d) => d.closed);
      this.doors.forEach((d) => (d.closed = false));
      const all = grid();
      this.doors.forEach((d, k) => (d.closed = saved[k]));
      const reach = new Uint8Array(NW * NH);
      const s0 = Math.floor(50.6 / S) * NW + Math.floor(34.9 / S);
      const stack = [s0];
      reach[s0] = 1;
      while (stack.length) {
        const n = stack.pop();
        const x = n % NW, y = (n / NW) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const m = (y + dy) * NW + x + dx;
          if (x + dx < 0 || x + dx >= NW || y + dy < 0 || y + dy >= NH || reach[m] || !all[m]) continue;
          reach[m] = 1;
          stack.push(m);
        }
      }
      this.navReach = reach;
    }
    const g = grid();
    for (let k = 0; k < g.length; k++) g[k] &= this.navReach[k];
    this.nav = g;
    this._navBuild = false;
    // clearance from obstacles (m) — keeps the creature's bulk in the middle of corridors
    const D = new Float32Array(NW * NH);
    for (let k = 0; k < D.length; k++) D[k] = g[k] ? 1e4 : 0;
    const relax = (k, m, c) => { if (D[m] + c < D[k]) D[k] = D[m] + c; };
    for (let j = 0; j < NH; j++)
      for (let i = 0; i < NW; i++) {
        const k = j * NW + i;
        if (!D[k]) continue;
        if (i > 0) relax(k, k - 1, 1);
        if (j > 0) relax(k, k - NW, 1);
        if (i > 0 && j > 0) relax(k, k - NW - 1, 1.414);
        if (i < NW - 1 && j > 0) relax(k, k - NW + 1, 1.414);
      }
    for (let j = NH - 1; j >= 0; j--)
      for (let i = NW - 1; i >= 0; i--) {
        const k = j * NW + i;
        if (!D[k]) continue;
        if (i < NW - 1) relax(k, k + 1, 1);
        if (j < NH - 1) relax(k, k + NW, 1);
        if (i < NW - 1 && j < NH - 1) relax(k, k + NW + 1, 1.414);
        if (i > 0 && j < NH - 1) relax(k, k + NW - 1, 1.414);
      }
    for (let k = 0; k < D.length; k++) D[k] = Math.min(D[k], 40) * S;
    this.navDist = D;
  }

  // free space around a point (m from the nearest wall or furniture), as the creature feels it
  clearance(x, z) {
    if (!this.navDist) return 1;
    const [i, j] = this.navCell(x, z);
    if (i < 0 || j < 0 || i >= this.NW || j >= this.NH) return 0;
    return this.navDist[j * this.NW + i] + 0.3;
  }

  navCell(x, z) {
    return [Math.floor(x / this.navS), Math.floor(z / this.navS)];
  }
  walkable(i, j) {
    return i >= 0 && j >= 0 && i < this.NW && j < this.NH && this.nav[j * this.NW + i] === 1;
  }
  nearestWalkable(x, z) {
    const [ci, cj] = this.navCell(x, z);
    for (let r = 0; r < 14; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.walkable(ci + di, cj + dj)) return [ci + di, cj + dj];
        }
    return null;
  }

  findPath(from, to) {
    const a = this.nearestWalkable(from.x, from.z);
    const b = this.nearestWalkable(to.x, to.z);
    if (!a || !b) return null;
    const NW = this.NW;
    const start = a[1] * NW + a[0], goal = b[1] * NW + b[0];
    const g = new Float32Array(this.NW * this.NH).fill(Infinity);
    const came = new Int32Array(this.NW * this.NH).fill(-1);
    const closed = new Uint8Array(this.NW * this.NH);
    const heap = [];
    const push = (n, f) => {
      heap.push([f, n]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top[1];
    };
    const hfn = (n) => {
      const x = n % NW, y = (n / NW) | 0;
      const dx = Math.abs(x - b[0]), dy = Math.abs(y - b[1]);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    // an area scripted movement must route around (start/goal inside it disable it)
    let av = null;
    if (this.avoid) {
      const A = this.avoid, s = this.navS;
      av = [Math.floor(A.minX / s), Math.ceil(A.maxX / s), Math.floor(A.minZ / s), Math.ceil(A.maxZ / s)];
      const inA = (c) => c[0] >= av[0] && c[0] < av[1] && c[1] >= av[2] && c[1] < av[3];
      if (inA(a) || inA(b)) av = null;
    }
    g[start] = 0;
    push(start, hfn(start));
    let iter = 0;
    while (heap.length && iter++ < 90000) {
      const n = pop();
      if (n === goal) break;
      if (closed[n]) continue;
      closed[n] = 1;
      const x = n % NW, y = (n / NW) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (!this.walkable(nx, ny)) continue;
          if (dx && dy && (!this.walkable(x + dx, y) || !this.walkable(x, y + dy))) continue;
          if (av && nx >= av[0] && nx < av[1] && ny >= av[2] && ny < av[3]) continue;
          const m = ny * NW + nx;
          const cl = this.navDist ? this.navDist[m] : 1;
          const ng = g[n] + (dx && dy ? 1.414 : 1) * (1 + Math.max(0, 0.7 - cl) * 4);
          if (ng < g[m]) {
            g[m] = ng;
            came[m] = n;
            push(m, ng + hfn(m));
          }
        }
    }
    if (came[goal] < 0 && goal !== start) return null;
    const cellsPath = [];
    for (let n = goal; n !== -1; n = came[n]) {
      cellsPath.push(n);
      if (n === start) break;
    }
    cellsPath.reverse();
    const S = this.navS;
    const pts = cellsPath.map((n) => new THREE.Vector3(((n % NW) + 0.5) * S, 0, (((n / NW) | 0) + 0.5) * S));
    // string pulling
    const out = [pts[0]];
    let k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) {
        if (this.navLine(pts[k], pts[m])) { far = m; break; }
      }
      out.push(pts[far]);
      k = far;
    }
    return out;
  }

  navLine(a, b) {
    const d = a.distanceTo(b);
    const n = Math.ceil(d / 0.1);
    // don't shortcut along walls: a straight run must keep the clearance its ends have
    const need = this.navDist ? Math.min(0.6, this.clearance(a.x, a.z) - 0.3, this.clearance(b.x, b.z) - 0.3) - 0.05 : -1;
    for (let s = 1; s < n; s++) {
      const t = s / n;
      const [i, j] = this.navCell(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!this.walkable(i, j)) return false;
      if (need > 0 && this.navDist[j * this.NW + i] < need) return false;
    }
    return true;
  }

  randomWalkable(near = null, radius = 10, minDist = 0) {
    for (let tries = 0; tries < 200; tries++) {
      let x, z;
      if (near) {
        const a = Math.random() * Math.PI * 2, r = minDist + Math.random() * (radius - minDist);
        x = near.x + Math.cos(a) * r;
        z = near.z + Math.sin(a) * r;
      } else {
        x = Math.random() * W;
        z = Math.random() * H;
      }
      const [i, j] = this.navCell(x, z);
      if (this.walkable(i, j)) return new THREE.Vector3((i + 0.5) * this.navS, 0, (j + 0.5) * this.navS);
    }
    return null;
  }

  // ------------------------------------------------------------- occlusion
  // 0 = clear line, 1 = heavily blocked (≥3 wall cells or closed doors)
  occlusion(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / 0.35);
    let hits = 0;
    let lastSolid = false;
    for (let s = 1; s < n; s++) {
      const t = s / n;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const solid = !this.open(Math.floor(x), Math.floor(z));
      if (solid && !lastSolid) hits++;
      lastSolid = solid;
    }
    for (const dr of this.doors) {
      if (!dr.closed || !dr.box) continue;
      if (segBox(a, b, dr.box)) hits++;
    }
    return Math.min(1, hits / 2.5);
  }
}

function segBox(a, b, box) {
  // sample-based segment vs AABB
  const n = 24;
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) return true;
  }
  return false;
}
