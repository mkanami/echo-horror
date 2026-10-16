import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { echo, COLORS, createDust } from './echo.js';
import { AudioEngine } from './audio.js';
import { Level } from './level.js';
import { Player } from './player.js';
import { Monster } from './monster.js';
import { INTRO, NOTES, TIPS, ENDING } from './story.js';
import { Siege, SIEGE_TIME } from './siege.js';
import { ViewModel } from './viewmodel.js';

const $ = (id) => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ render
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000);
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// view-model (hands + cane) drawn on top so it never clips into walls
const vm = new ViewModel();
const vmPass = new RenderPass(vm.scene, camera);
vmPass.clear = false;
vmPass.clearDepth = true;
composer.addPass(vmPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.6, 0.18);
composer.addPass(bloom);
const fx = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGlitch: { value: 0 },
    uWhite: { value: 0 },
    uFear: { value: 0 },
    uFlash: { value: 0 },
    uRes: { value: new THREE.Vector2(innerWidth, innerHeight) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uFear, uFlash, uGlitch, uWhite; uniform vec2 uRes; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      vec2 uv = vUv + c * dot(c,c) * uFear * 0.12;
      uv.x += sin(uv.y * 40.0 + uTime * 30.0) * 0.0015 * uFear * uFear;
      float band = floor(uv.y * 34.0) + floor(uTime * 24.0) * 7.0;
      uv.x += (rand(vec2(band, 1.0)) - 0.5) * 0.12 * uGlitch * step(0.62, rand(vec2(band, 2.0)));
      uv.y += (rand(vec2(floor(uTime * 24.0), 3.0)) - 0.5) * 0.03 * uGlitch;
      float ab = 0.0012 + uFear * 0.007 + uGlitch * 0.03;
      vec3 col = vec3(texture2D(tDiffuse, uv + c*ab).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c*ab).b);
      float vig = smoothstep(0.9, 0.18, length(c) * (1.0 + uFear * 0.6));
      col *= vig;
      col += (rand(vUv * uRes + fract(uTime * 7.13)) - 0.5) * (0.03 + uFear * 0.05);
      // grade: drained, cold, crushed blacks, like a damaged night-vision feed
      float gl = dot(col, vec3(0.3, 0.55, 0.15));
      // blood keeps its colour while everything else is drained
      float redness = smoothstep(0.015, 0.09, col.r - max(col.g, col.b));
      col = mix(vec3(gl), col, mix(0.45, 1.15, redness));
      col *= vec3(0.9, 0.98, 1.05);
      col = max(col - 0.01, 0.0) * 1.05;
      float lum = max(max(col.r, col.g), col.b);
      col = mix(col, vec3(lum * 1.4 + 0.25, 0.0, 0.0), uFlash * 0.8);
      col = mix(col, vec3(1.0, 0.92, 0.9) - col * 0.6, uWhite);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(fx);
const smaa = new SMAAPass(Math.max(1, innerWidth * renderer.getPixelRatio()), Math.max(1, innerHeight * renderer.getPixelRatio()));
composer.addPass(smaa);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  if (!innerWidth || !innerHeight) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  fx.uniforms.uRes.value.set(innerWidth, innerHeight);
});

// ------------------------------------------------------------------ world
const audio = new AudioEngine();
const level = new Level(scene);
const dust = createDust();
scene.add(dust);
audio.occlusion = (pos) => level.occlusion(camera.position, pos);

const game = {
  state: 'menu', // menu | play | paused | note | dying | dead | end
  flags: {},
  time: 0,
  deaths: 0,
  checkpoint: null,
  fear: 0,
  noise(pos, o) {
    echo.emit(pos, { radius: o.visual ?? o.radius, speed: o.speed ?? 11, strength: o.strength ?? 1, decay: o.decay ?? 0.8, color: o.color ?? COLORS.player });
    if (o.source && monster.active) monster.hear(pos, o.radius, o.source, o.kind, player.pos);
    if (o.source === 'player' && siege && siege.active) siege.heard(o.radius);
  },
  hint(text, dur = 4.5, urgent = false) {
    if (urgent) {
      hintQueue.length = 0;
      hintT = 0;
      $('hint').textContent = text;
      $('hint').style.opacity = 1;
      hintT = dur;
      return;
    }
    hintQueue.push({ text, dur });
  },
};

// timers that run on game time (frozen while paused or dead)
const timers = [];
const later = (sec, fn) => timers.push({ t: sec, fn });
function updateTimers(dt) {
  for (let i = timers.length - 1; i >= 0; i--) {
    timers[i].t -= dt;
    if (timers[i].t <= 0) {
      const f = timers[i].fn;
      timers.splice(i, 1);
      f();
    }
  }
}

const player = new Player(camera, level, audio, game);
player.vm = vm;
const monster = new Monster(scene, level, audio);
monster.onKill = () => die();

// ---- lift hall siege
const radarCtx = () => document.getElementById('radar-c').getContext('2d');
let radarT = 0, radarNode = null;
const siegeUI = {
  show(v) {
    $('siege').classList.toggle('hidden', !v);
    $('brief').classList.toggle('hidden', !v);
    if (v) later(14, () => $('brief').classList.add('hidden'));
    if (!v) $('radar').classList.add('hidden');
  },
  update(sg) {
    const p = Math.min(1, sg.t / SIEGE_TIME);
    $('sg-lift').style.width = `${p * 100}%`;
    $('sg-floor').textContent = sg.arrived ? 'ЗДЕСЬ' : `−${Math.max(1, Math.ceil(9 - p * 8))} ЯР.`;
    $('sg-power').style.width = `${sg.power}%`;
    $('sg-power').classList.toggle('low', sg.power < 20);
    $('sg-pw').textContent = sg.blackout ? '—' : `${Math.ceil(sg.power)}%`;
    $('sg-A').textContent = `ДВЕРЬ: ${sg.shut.A ? 'ЗАКРЫТА' : 'ОТКРЫТА'}`;
    $('sg-B').textContent = `ЛЮК: ${sg.shut.B ? 'ЗАКРЫТ' : 'ОТКРЫТ'}`;
    $('sg-A').classList.toggle('shut', sg.shut.A);
    $('sg-B').classList.toggle('shut', sg.shut.B);
    $('sg-A').textContent += ' [1]';
    $('sg-B').textContent += ' [2]';
    $('sg-warn').textContent = sg.warn === 'doorA' ? (sg.shut.A ? 'БЬЁТСЯ В ДВЕРЬ' : 'У ДВЕРИ') : sg.warn === 'ventB' ? (sg.shut.B ? 'БЬЁТСЯ В ЛЮК' : 'У ЛЮКА') : '';
  },
};
function drawRadar(node) {
  const c = radarCtx();
  c.clearRect(0, 0, 240, 240);
  // map x 2..32, z -2..20 onto the dial
  const X = (x) => 20 + ((x - 2) / 30) * 200, Y = (z) => 40 + ((z + 1) / 21) * 160;
  c.strokeStyle = '#2c4';
  c.lineWidth = 1.5;
  c.strokeRect(X(4), Y(3), X(13) - X(4), Y(13) - Y(3)); // hall
  c.strokeRect(X(13), Y(7), X(22) - X(13), Y(10) - Y(7)); // corridor
  c.strokeRect(X(22), Y(3), X(32) - X(22), Y(14) - Y(3)); // generator room
  c.setLineDash([4, 3]);
  c.strokeRect(X(7.05), Y(13), X(7.95) - X(7.05), Y(19) - Y(13)); // duct
  c.setLineDash([]);
  c.fillStyle = '#2c4';
  c.beginPath();
  c.arc(X(player.pos.x), Y(player.pos.z), 3, 0, 7);
  c.fill();
  if (node) {
    c.fillStyle = '#f33';
    c.shadowColor = '#f33';
    c.shadowBlur = 12;
    c.beginPath();
    c.arc(X(node.pos.x), Y(node.pos.z), 6, 0, 7);
    c.fill();
    c.shadowBlur = 0;
  }
}
let siege = null;
siege = new Siege({
  audio, level, game, player, monster, ui: siegeUI,
  onAttack: (pos) => {
    monster.spawn(pos.clone().setY(0), 'wander');
    monster.kill(player);
  },
});
game.onLiftArrived = () => liftArrive();
level.onShutter = (d, closed) => {
  const p = d.obj.position.clone();
  audio.play('door', p, { gain: 0.7, rate: closed ? 1.15 : 1.3, wet: 0.5 });
  later(closed ? 0.95 : 0.7, () => audio.play('slam', p, { gain: closed ? 0.6 : 0.3, rate: 1.2, wet: 0.6 }));
};

// ------------------------------------------------------------------ input
let sens = 1.4;
let pointerLocked = false;
let dragLook = false;
const canvas = renderer.domElement;

addEventListener('keydown', (e) => {
  player.keys.add(e.code);
  if (e.repeat) return;
  if (game.state === 'play') {
    if (e.code === 'KeyF') player.click();
    if (e.code === 'KeyC') player.crouch = !player.crouch;
    if (e.code === 'KeyE') interact();
    if (siege && siege.active && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
      $('brief').classList.add('hidden');
      if (e.code === 'Digit1') siege.toggle('A');
      if (e.code === 'Digit2') siege.toggle('B');
      if (e.code === 'Digit3') {
        const n = siege.ping();
        if (n) {
          radarNode = n;
          radarT = 3;
          $('radar').classList.remove('hidden');
        }
      }
    }
  } else if (game.state === 'note' && (e.code === 'KeyE' || e.code === 'Escape')) closeNote();
});
addEventListener('keyup', (e) => player.keys.delete(e.code));
addEventListener('blur', () => player.keys.clear());

canvas.addEventListener('mousedown', (e) => {
  if (game.state !== 'play' && game.state !== 'note') return;
  if (!pointerLocked) {
    lock();
    dragLook = true;
  }
  if (e.button === 0 && game.state === 'play' && pointerLocked) player.throwStone(scene);
  if (e.button === 2) player.keys.add('Mouse2');
});
addEventListener('mouseup', (e) => {
  if (e.button === 2) player.keys.delete('Mouse2');
  dragLook = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (game.state !== 'play' && game.state !== 'note') return;
  if (pointerLocked || dragLook) player.look(e.movementX, e.movementY, 0.0012 * sens);
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (!pointerLocked && (game.state === 'play' || game.state === 'note')) pause();
});

function lock() {
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (_) {}
}

$('sens').addEventListener('input', (e) => (sens = +e.target.value));

// ---- graphics quality
const QUALITY = {
  high: { pr: 1.5, smaa: true, dust: true, bloom: true },
  mid: { pr: 1.0, smaa: true, dust: true, bloom: true },
  low: { pr: 0.75, smaa: false, dust: false, bloom: false },
};
function applyQuality(q) {
  const Q = QUALITY[q] || QUALITY.high;
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
  composer.setPixelRatio ? composer.setPixelRatio(Math.min(devicePixelRatio, Q.pr)) : null;
  composer.setSize(innerWidth, innerHeight);
  smaa.enabled = Q.smaa;
  bloom.enabled = Q.bloom;
  dust.visible = Q.dust;
  document.querySelectorAll('.quality').forEach((el) => (el.value = q));
  try { localStorage.setItem('echo.quality', q); } catch (_) {}
}
let savedQ = 'high';
try { savedQ = localStorage.getItem('echo.quality') || 'high'; } catch (_) {}
document.querySelectorAll('.quality').forEach((el) => el.addEventListener('change', (e) => applyQuality(e.target.value)));

// ---- texture loading progress
THREE.DefaultLoadingManager.onProgress = (url, done, total) => {
  if (!audio.ready && $('play').disabled) $('play').textContent = `ЗАГРУЗКА ТЕКСТУР ${Math.round((done / total) * 100)}%`;
};
setTimeout(() => {
  if ($('play').disabled && !audio.ctx) {
    $('play').disabled = false;
    $('play').textContent = 'НАЧАТЬ';
  }
}, 20000);
THREE.DefaultLoadingManager.onLoad = () => {
  if (!audio.ready) {
    $('play').disabled = false;
    $('play').textContent = loadSave() ? 'НОВАЯ ИГРА' : 'НАЧАТЬ';
  }
};
$('vol').addEventListener('input', (e) => audio.setMaster(+e.target.value, 0.05));

// ------------------------------------------------------------------ UI
const hintQueue = [];
let hintT = 0;
function updateHint(dt) {
  hintT -= dt;
  if (hintT <= 0) {
    $('hint').style.opacity = 0;
    if (hintT < -0.8 && hintQueue.length) {
      const h = hintQueue.shift();
      $('hint').textContent = h.text;
      $('hint').style.opacity = 1;
      hintT = h.dur;
    }
  }
}

let lastRoom = null;
let locT = 0;
function updateLocation(dt) {
  const r = level.roomAt(player.pos.x, player.pos.z);
  if (r && r !== lastRoom) {
    lastRoom = r;
    if (!visited.has(r.name)) {
      $('location').textContent = r.name.toUpperCase();
      $('location').style.opacity = 1;
      locT = 2.5;
    }
    onEnterRoom(r.name);
  }
  locT -= dt;
  if (locT <= 0) $('location').style.opacity = 0;
}

function objective() {
  const f = game.flags;
  if (f.arrived) return 'Войди в лифт.';
  if (f.called) return 'Дождись лифта. Не дай ему войти в холл.';
  if (f.powered) return 'Лифтовый холл, запад от генераторной: вызвать лифт.';
  if (f.fuseA && f.fuseB) return 'Генераторная, север от атриума: поставить ПН-2 и запустить.';
  if (!f.readMap && !f.fuseA) return 'Выйти из медблока. Коридор — на север.';
  if (!f.fuseA) return 'ПН-2 — шкаф на дальней стене архива (запад).';
  if (!f.card && !f.labOpen) return 'Карта доступа — кабинет 9, за затопленным переходом (восток).';
  if (!f.fuseB) return 'Второй ПН-2 — бокс № 2 безэхового блока.';
  return '';
}

function updateHUD() {
  $('objective').textContent = objective();
  const bm = $('m-breath');
  bm.querySelector('i').style.width = `${player.breathCap * 100}%`;
  bm.classList.toggle('holding', player.holding);
  bm.classList.toggle('low', player.breathCap < 0.25);
  bm.style.opacity = player.holding || player.breathCap < 0.99 ? 1 : 0.25;
  const sm = $('m-stamina');
  sm.querySelector('i').style.width = `${player.stamina * 100}%`;
  sm.style.opacity = player.stamina < 0.99 ? 1 : 0.25;
  $('stones').textContent = player.stones ? `КАМНИ: ${player.stones}` : '';
  $('stance').textContent = player.holding ? 'НЕ ДЫШИШЬ' : player.crouch ? 'КРАДЁШЬСЯ' : '';
}

// ------------------------------------------------------------------ interaction
let focus = null;
const LAB_DOOR = V(54, 1.3, 24.6);

function findFocus() {
  if (player.hidden) return player.hidden;
  const cam = camera.position;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let best = null, bestScore = 0;
  for (const it of level.items) {
    if (it.taken) continue;
    const to = it.pos.clone().sub(cam);
    const d = to.length();
    if (d > 1.9) continue;
    const dot = to.normalize().dot(dir);
    const score = dot - d * 0.1;
    if ((dot > 0.82 || d < 0.75) && score > bestScore) {
      bestScore = score;
      best = it;
    }
  }
  const dl = level.door('lab');
  if (!best && dl.closed && cam.distanceTo(LAB_DOOR) < 2.0) best = { type: 'labdoor' };
  return best;
}

function promptFor(it) {
  if (!it) return '';
  const f = game.flags;
  switch (it.type) {
    case 'note': return '[E] Прочитать';
    case 'stone': return player.stones >= 5 ? 'Больше не унести' : '[E] Подобрать камень';
    case 'fuseA': case 'fuseB': case 'card': return `[E] Взять: ${it.name}`;
    case 'panel': return f.powered ? '' : f.fuseA && f.fuseB ? (hold && hold.it === it ? `Прокачка топлива ${Math.round((hold.t / 5) * 100)}% — громко` : '[держи E] Поставить ПН-2 и прокачать топливо') : 'Щиток генератора. Не хватает предохранителей.';
    case 'call': return f.called ? '' : f.powered ? '[E] Вызвать лифт' : 'Кнопка вызова. Нет питания.';
    case 'cab': return f.arrived ? '[E] Ехать наверх' : '';
    case 'labdoor': return f.card ? (hold && hold.it.type === 'labdoor' ? `Открываешь медленно… ${Math.round((hold.t / 2.5) * 100)}%` : '[держи E] Приложить карту и открыть тихо') : 'Шлюз заперт. Нужна карта доступа.';
    case 'locked': return '[E] Дёрнуть ручку';
    case 'locker': return player.hidden ? '[E] Выйти' : '[E] Спрятаться в шкафчик';
    case 'shutterA': return siege.active ? `[E] ${siege.shut.A ? 'Поднять' : 'Опустить'} заслонку двери` : 'Пульт заслонки. Без питания.';
    case 'shutterB': return siege.active ? `[E] ${siege.shut.B ? 'Открыть' : 'Закрыть'} люк вентиляции` : 'Пульт люка вентиляции. Без питания.';
    case 'seismo': return siege.active ? '[E] Сейсмодатчик (−2% питания)' : 'Сейсмодатчик. Экран мёртв.';
  }
  return '';
}

function take(it) {
  it.taken = true;
  it.obj.visible = false;
  audio.pickup();
  game.noise(it.pos.clone(), { radius: 1.6, visual: 1.5, source: 'player', kind: 'item', color: COLORS.item, strength: 0.6 });
}

// actions that take time: hold E
let hold = null;
const HOLD = {
  panel: { need: 5, ok: () => !game.flags.powered && game.flags.fuseA && game.flags.fuseB },
  labdoor: { need: 2.5, ok: () => game.flags.card },
};
function updateHold(dt) {
  if (!hold) return;
  if (focus !== hold.it && !(focus && hold.it.type === 'labdoor' && focus.type === 'labdoor')) {
    hold = null;
    return;
  }
  if (!player.keys.has('KeyE')) {
    hold = null;
    return;
  }
  hold.t += dt;
  hold.tick -= dt;
  if (hold.tick <= 0) {
    if (hold.it.type === 'panel') {
      // each pump of the priming lever clanks through the whole room
      hold.tick = 1.0;
      vm.reach();
      audio.play('metal_heavy', GEN_POS, { gain: 0.8, rate: 0.9 + Math.random() * 0.2, wet: 0.9 });
      game.noise(GEN_POS.clone(), { radius: 7, visual: 6, source: 'player', kind: 'door', color: COLORS.machine, strength: 0.8 });
    } else {
      hold.tick = 0.9;
      audio.play('door', LAB_DOOR, { gain: 0.18, rate: 0.7, wet: 0.4 });
      game.noise(LAB_DOOR.clone(), { radius: 2.2, visual: 2.5, source: 'player', kind: 'door', color: COLORS.player, strength: 0.4 });
    }
  }
  if (hold.t >= HOLD[hold.it.type].need) {
    const it = hold.it;
    hold = null;
    if (it.type === 'panel') startGenerator();
    else {
      level.setDoor('lab', true);
      game.flags.labOpen = true;
      audio.play('door', LAB_DOOR, { gain: 0.4, rate: 0.75, wet: 0.5 });
    }
  }
}

function interact() {
  const it = focus;
  if (!it) return;
  vm.reach();
  if (HOLD[it.type] && HOLD[it.type].ok()) {
    hold = { it, t: 0, tick: 0.25 };
    return;
  }
  const f = game.flags;
  switch (it.type) {
    case 'note':
      (game.flags.notes ||= {})[it.note] = true;
      openNote(it.note);
      if (it.note === 1) f.readMap = true;
      break;
    case 'stone':
      if (player.stones >= 5) return;
      it.taken = true;
      it.obj.visible = false;
      player.stones++;
      audio.impact(it.pos, 0.15);
      if (!f.stoneHint) {
        f.stoneHint = true;
        game.hint('Камень. [ЛКМ] — бросить туда, где ты не стоишь.');
      }
      break;
    case 'fuseA':
      take(it);
      f.fuseA = true;
      releaseMonster();
      break;
    case 'card':
      take(it);
      f.card = true;
      game.hint('Карта. Шлюз безэхового блока — в конце затопленного перехода.');
      saveCheckpoint();
      break;
    case 'fuseB':
      take(it);
      f.fuseB = true;
      game.hint('Оба ПН-2. Генераторная — к северу от атриума.');
      saveCheckpoint();
      break;
    case 'panel':
      if (!f.powered && f.fuseA && f.fuseB) startGenerator();
      break;
    case 'call':
      if (f.powered && !f.called) callElevator();
      break;
    case 'cab':
      if (f.arrived) ending();
      break;
    case 'locker':
      if (player.hidden) {
        player.unhide();
        $('slits').classList.add('hidden');
        audio.play('door', it.pos, { gain: 0.35, rate: 1.6, wet: 0.4 });
        game.noise(it.pos.clone(), { radius: 2.5, visual: 2, source: 'player', kind: 'door', color: COLORS.player, strength: 0.5 });
      } else {
        player.hide(it);
        $('slits').classList.remove('hidden');
        audio.play('door', it.pos, { gain: 0.3, rate: 1.7, wet: 0.4 });
        game.noise(it.pos.clone(), { radius: 2.2, visual: 2, source: 'player', kind: 'door', color: COLORS.player, strength: 0.5 });
        if (!f.lockerHint) {
          f.lockerHint = true;
          game.hint('В шкафчике дыхание глуше. Но если оно встанет вплотную — не дыши.', 5);
        }
      }
      break;
    case 'shutterA':
    case 'shutterB':
      if (siege.active) siege.toggle(it.type === 'shutterA' ? 'A' : 'B');
      break;
    case 'seismo':
      if (siege.active) {
        const n = siege.ping();
        if (n) {
          radarNode = n;
          radarT = 3;
          $('radar').classList.remove('hidden');
        }
      }
      break;

    case 'locked':
      level.rattle(it.door);
      audio.rattle(it.pos);
      game.noise(it.pos.clone(), { radius: 5.5, visual: 3.5, source: 'player', kind: 'door', color: COLORS.player, strength: 0.8 });
      if (!f.lockedHint) {
        f.lockedHint = true;
        game.hint('Заперто. Ручка грохнула на весь коридор.');
      }
      break;
    case 'labdoor':
      if (f.card) {
        level.setDoor('lab', true);
        f.labOpen = true;
        audio.door(LAB_DOOR);
        game.noise(LAB_DOOR.clone(), { radius: 9, visual: 10, source: 'player', kind: 'door', color: COLORS.machine });
      } else {
        audio.impact(LAB_DOOR, 0.3);
      }
      break;
  }
}

function openNote(i) {
  audio.paper();
  $('note-title').textContent = NOTES[i].title;
  $('note-body').textContent = NOTES[i].body;
  $('note').classList.remove('hidden');
  game.state = 'note';
  player.frozen = true;
}
function closeNote() {
  $('note').classList.add('hidden');
  game.state = 'play';
  player.frozen = false;
  audio.paper();
}

// ------------------------------------------------------------------ story beats
const visited = new Set();
function onEnterRoom(name) {
  if (visited.has(name)) return;
  visited.add(name);
  const f = game.flags;
  if (name === 'Коридор Б' && !f.fuseA) {
    // something crawls in the ceiling above
    for (let i = 0; i < 6; i++)
      later((2500 + i * 650) / 1000, () => {
        if (game.state !== 'play') return;
        const p = V(31.5, 3.6, 36 + i * 1.1);
        audio.monsterStep(p, 0.4);
        echo.emit(p, { radius: 2.5, speed: 6, strength: 0.35, color: COLORS.monster });
      });
  }
  if (name === 'Морг' && !f.fuseA) {
    later(1.8, () => {
      const p = V(42.2, 1.2, 37.5);
      audio.slam(p);
      echo.emit(p, { radius: 9, speed: 10, strength: 1.3, color: COLORS.white });
    });
  }
  if (name === 'Атриум' && !f.readMap) {
    game.hint('Высокий зал. На стойке регистрации — бумаги.');
    later(3.0, () => audio.groan(V(32, 6, 10)));
  }
  if (name === 'Архив' && !f.fuseA) later(2.5, () => audio.whisper(V(3, 1.6, 20)));
  if (name === 'Затопленный коридор' && !f.waterHint) {
    f.waterHint = true;
    game.hint('Вода. Каждый шаг слышно вдвое дальше.');
  }
  if (name === 'Безэховый блок') game.hint('Боксы. Второй открыт изнутри.');
}

function releaseMonster() {
  game.hint('ПН-2, первый. Теперь — карта Ореховой.', 3.5);
  later(2.6, () => {
    const vent = V(28, 4.8, 25);
    audio.crash(vent);
    audio.monsterRoar(vent);
    echo.emit(vent, { radius: 34, speed: 13, strength: 1.4, decay: 0.5, color: COLORS.monster });
    monster.spawn(V(28, 0, 25.6), 'investigate');
    monster.goTo(V(14, 0, 27.5), 'investigate');
    game.hint('В атриуме что-то сорвалось с вентиляции. Тяжёлое. Живое.', 6);
    later(6.0, () => game.hint('Оно знает только звук. Подойдёт — замри и не дыши [Q].', 5));
    saveCheckpoint();
  });
}

let generator = null;
let genPulseT = 0;
let genNoiseT = 0;
const GEN_POS = V(32, 1.5, 8.6);

function startGenerator() {
  const f = game.flags;
  f.powered = true;
  audio.door(GEN_POS);
  if (!generator) generator = audio.createMachine(GEN_POS, { type: 'generator', gain: 1.0 });
  generator.setGain(1, 1.5);
  generator.spinUp(3.5);
  game.noise(GEN_POS.clone(), { radius: 30, visual: 26, source: 'machine', kind: 'machine', color: COLORS.machine, strength: 1.4 });
  monster.forcedTarget = V(30, 0, 11);
  game.hint('Генератор ожил. Девяносто децибел. Лифтовый холл — на запад.', 6);
  saveCheckpoint();
}

let lift = null;
const LIFT_POS = V(7.5, 1.4, 1.5);
function callElevator() {
  const f = game.flags;
  f.called = true;
  audio.ding(V(9.55, 1.3, 3.1));
  if (!lift) lift = audio.createMachine(LIFT_POS, { type: 'motor', gain: 0.3 });
  lift.setGain(1, 2);
  monster.despawn();
  monster.forcedTarget = null;
  saveCheckpoint();
  siege.start();
  game.hint('Лифт тронулся. Где-то внизу, очень глубоко.', 4, true);
}

function liftArrive() {
  const f = game.flags;
  f.arrived = true;
  level.setDoor('lift', true);
  audio.ding(V(7.5, 2.4, 3.2));
  if (lift) lift.setGain(0.15, 1);
  game.noise(V(7.5, 1.5, 3.3), { radius: 22, visual: 18, source: 'machine', kind: 'machine', color: COLORS.machine, strength: 1.3 });
  game.hint('Двери лифта открыты.', 4);
}

function ending() {
  game.state = 'end';
  clearSave();
  siege.stop();
  player.frozen = true;
  level.setDoor('lift', false);
  audio.door(V(7.5, 1.5, 3));
  if (lift) lift.setGain(1, 1);
  monster.despawn();
  $('fade').style.opacity = 1;
  setTimeout(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    $('hud').classList.add('hidden');
    $('end').classList.remove('hidden');
    $('end-text').innerHTML = ENDING.map((l, i) => `<p style="animation-delay:${1 + i * 2.2}s">${l}</p>`).join('');
    const mins = Math.floor(game.time / 60), secs = Math.floor(game.time % 60);
    const found = Object.keys(game.flags.notes || {}).length;
    $('end-stats').textContent = `КОНЕЦ · время ${mins}:${String(secs).padStart(2, '0')} · смертей: ${game.deaths} · записок: ${found} из ${NOTES.length}`;
    // scratching on the cab roof
    for (let i = 0; i < 12; i++)
      setTimeout(() => {
        audio.scratch(V(camera.position.x + (Math.random() - 0.5), camera.position.y + 1.4, camera.position.z + (Math.random() - 0.5)));
      }, 9000 + i * 700 + Math.random() * 300);
    setTimeout(() => audio.monsterCroak(V(camera.position.x, camera.position.y + 1.6, camera.position.z), 0.5), 15500);
    setTimeout(() => lift && lift.setGain(0, 3), 18000);
  }, 2000);
}

// ------------------------------------------------------------------ checkpoints & death
function saveCheckpoint() {
  game.cpDeaths = 0;
  applyAssist();
  game.checkpoint = {
    pos: player.pos.clone(),
    yaw: player.yaw,
    flags: JSON.parse(JSON.stringify(game.flags)),
    stones: player.stones,
    taken: level.items.map((it) => it.taken),
    monster: monster.active ? { pos: monster.pos.clone() } : null,
    forced: monster.forcedTarget ? monster.forcedTarget.clone() : null,
  };
  const c = game.checkpoint;
  try {
    localStorage.setItem('echo.save', JSON.stringify({
      v: 1, pos: { x: c.pos.x, z: c.pos.z }, yaw: c.yaw, flags: c.flags, stones: c.stones, taken: c.taken,
      monster: c.monster ? { x: c.monster.pos.x, z: c.monster.pos.z } : null,
      forced: c.forced ? { x: c.forced.x, z: c.forced.z } : null, time: game.time, deaths: game.deaths,
    }));
  } catch (_) {}
}

let scare = null;
function applyAssist() {
  // after the 2nd death at the same spot the creature listens and moves a little worse
  const d = game.cpDeaths || 0;
  const k = d >= 4 ? 0.75 : d >= 2 ? 0.88 : 1;
  monster.assist.hear = k;
  monster.assist.speed = 0.5 + k * 0.5;
  siege.assist = k;
}

function die() {
  if (game.state === 'dying') return;
  game.cpDeaths = (game.cpDeaths || 0) + 1;
  applyAssist();
  $('slits').classList.add('hidden');
  if (siege.active) siege.stop();
  game.state = 'dying';
  game.deaths++;
  player.frozen = true;
  player.holding = false;
  monster.startScare(camera);
  scare = { t: 0, baseFov: camera.fov, cut: false };
  audio.scream();
  echo.emit(camera.position.clone(), { radius: 6, speed: 40, strength: 2.5, decay: 0.4, color: COLORS.monster });
}

function updateScare(dt) {
  if (!scare) return;
  scare.t += dt;
  const t = scare.t;
  player.lookTarget = (monster.mouthWorld || monster.headWorld).clone();
  // zoom punch into the face + violent shake
  camera.fov = THREE.MathUtils.lerp(camera.fov, t < 0.9 ? 46 : scare.baseFov, Math.min(1, dt * 18));
  camera.updateProjectionMatrix();
  const k = t < 0.9 ? 0.06 : 0;
  camera.position.add(V((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k));
  camera.rotateZ((Math.random() - 0.5) * k * 2);
  // the creature is fully lit for a split second, strobing
  const strobe = Math.floor(t * 18) % 2 === 0;
  const lit = t < 0.9 ? (strobe ? 1.4 : 0.35) : 0;
  monster.body.mats[0].uniforms.uLit.value = lit;
  monster.body.mats[1].uniforms.uLit.value = lit * 0.6;
  fx.uniforms.uGlitch.value = t < 0.9 ? (strobe ? 0.9 : 0.25) : 0;
  fx.uniforms.uWhite.value = t < 0.07 ? 1 : 0;
  flash = t < 0.9 ? (strobe ? 0.9 : 0.2) : 0;
  // hard cut: black + silence
  if (t > 0.9 && !scare.cut) {
    scare.cut = true;
    audio.cut();
    $('fade').style.transition = 'none';
    $('fade').style.opacity = 1;
  }
  if (t > 2.3) {
    scare = null;
    game.state = 'dead';
    camera.fov = 72;
    camera.updateProjectionMatrix();
    fx.uniforms.uGlitch.value = 0;
    $('tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    $('death').classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    audio.setMaster(0.15, 0.3);
  }
}

function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem('echo.save') || 'null');
    if (!d || d.v !== 1 || d.taken.length !== level.items.length) return null;
    return {
      pos: V(d.pos.x, 0, d.pos.z), yaw: d.yaw, flags: d.flags, stones: d.stones, taken: d.taken,
      monster: d.monster ? { pos: V(d.monster.x, 0, d.monster.z) } : null,
      forced: d.forced ? V(d.forced.x, 0, d.forced.z) : null, time: d.time || 0, deaths: d.deaths || 0,
    };
  } catch (_) {
    return null;
  }
}
const clearSave = () => {
  try { localStorage.removeItem('echo.save'); } catch (_) {}
};

function restoreCheckpoint() {
  const c = game.checkpoint;
  timers.length = 0;
  scare = null;
  camera.fov = 72;
  camera.updateProjectionMatrix();
  fx.uniforms.uGlitch.value = 0;
  fx.uniforms.uWhite.value = 0;
  game.flags = JSON.parse(JSON.stringify(c.flags));
  player.reset(c.pos, c.yaw);
  player.stones = c.stones;
  level.items.forEach((it, i) => {
    it.taken = c.taken[i];
    it.obj.visible = !it.taken;
  });
  level.setDoor('lab', !!game.flags.labOpen);
  level.setDoor('lift', !!game.flags.arrived);
  monster.forcedTarget = c.forced ? c.forced.clone() : null;
  if (c.monster) {
    // put it somewhere far from the player
    let p = level.randomWalkable(player.pos, 28, 16) || c.monster.pos;
    if (game.flags.called) p = level.randomWalkable(V(32, 0, 9), 4) || p;
    monster.spawn(p, 'wander');
    monster.idleT = 3;
  } else monster.despawn();
  if (game.flags.powered && !generator) generator = audio.createMachine(GEN_POS, { type: 'generator', gain: 1.0 });
  if (game.flags.called && !lift) lift = audio.createMachine(LIFT_POS, { type: 'motor', gain: 0.3 });
  if (generator) generator.setGain(game.flags.powered ? 1 : 0, 0.5);
  if (lift) lift.setGain(game.flags.called ? 1 : 0, 0.5);
  siege.stop();
  level.setShutter('A', false);
  level.setShutter('B', false);
  if (game.flags.called && !game.flags.arrived) {
    monster.despawn();
    siege.start();
  }
  echo.clear();
  game.fear = 0;
  flash = 0;
  lastRoom = null;
  $('death').classList.add('hidden');
  $('fade').style.opacity = 0;
  setTimeout(() => ($('fade').style.transition = ''), 50);
  audio.setMaster(+$('vol').value, 1);
  game.state = 'play';
  lock();
  setTimeout(() => player.click(), 400);
}

$('retry').addEventListener('click', restoreCheckpoint);

// ------------------------------------------------------------------ menus
function pause() {
  if (game.state === 'note') closeNote();
  if (game.state !== 'play') return;
  game.state = 'paused';
  $('pause').classList.remove('hidden');
  if (audio.ctx) audio.ctx.suspend();
}
function resume() {
  $('pause').classList.add('hidden');
  game.state = 'play';
  if (audio.ctx) audio.ctx.resume();
  lock();
}
$('resume').addEventListener('click', resume);

$('intro').innerHTML = INTRO.map((l, i) => `<p style="animation-delay:${0.4 + i * 0.9}s">${l}</p>`).join('');

function boot(fromSave) {
  if (!audio.ready) {
    $('play').disabled = true;
    $('play').textContent = 'ЗАГРУЗКА ЗВУКА…';
    audio.init((p) => ($('play').textContent = `ЗАГРУЗКА ЗВУКА ${Math.round(p * 100)}%`)).then(() => {
      $('play').disabled = false;
      $('play').textContent = 'НАЧАТЬ';
      startGame(fromSave);
    });
    return;
  }
  startGame(fromSave);
}
$('play').addEventListener('click', () => {
  clearSave();
  boot(false);
});
$('continue').addEventListener('click', () => boot(true));
$('restart').addEventListener('click', () => {
  clearSave();
  location.reload();
});
$('again').addEventListener('click', () => {
  clearSave();
  location.reload();
});
if (loadSave()) $('continue').classList.remove('hidden');


let waterLoop = null;
function startGame(fromSave = false) {
  if (!waterLoop) {
    waterLoop = audio.createLoop('loop_water', V(49.6, 1.6, 26.8), 0.55, { ref: 1.5, roll: 1.2 });
    waterLoop.setGain(1, 2);
  }
  audio.ctx.resume();
  $('start').classList.add('hidden');
  $('hud').classList.remove('hidden');
  const saved = fromSave ? loadSave() : null;
  if (saved) {
    game.checkpoint = saved;
    game.time = saved.time;
    game.deaths = saved.deaths;
    restoreCheckpoint();
    game.hint('Ты снова здесь. Ничего не изменилось.', 4, true);
    return;
  }
  player.reset(V(34.9, 0, 50.6), 0.55);
  game.state = 'play';
  game.time = 0;
  saveCheckpoint();
  lock();
  const tut = [
    ['Темно. Как всегда.', 3.5],
    ['[F] — стук тростью. Звук ляжет на стены.', 5],
    ['Шаги тоже рисуют — и тоже слышны. [WASD]', 5],
    ['На кровати рядом — лист бумаги. [E]', 5],
    ['[C] — красться: тише, но и мир меньше.', 5],
  ];
  tut.forEach(([t, d]) => game.hint(t, d));
}

// ------------------------------------------------------------------ ambient world
let groanT = 20;
let loopT = 0;
function updateAmbient(dt) {
  const cp = camera.position;
  // keep loop occlusion in sync as the listener moves
  loopT -= dt;
  if (loopT <= 0) {
    loopT = 0.25;
    for (const l of [waterLoop, generator, lift]) if (l) l.update();
  }
  for (const d of level.drips) {
    d.t -= dt;
    if (d.t <= 0) {
      d.t = d.int * (0.7 + Math.random() * 0.6);
      const dist = d.pos.distanceTo(cp);
      if (dist < 22) {
        audio.drip(d.pos);
        echo.emit(V(d.pos.x, 0.02, d.pos.z), { radius: 2.4, speed: 3.5, strength: 0.55, decay: 1.4, color: COLORS.drip });
      }
    }
  }
  for (const s of level.sparks) {
    s.t -= dt;
    if (s.t <= 0) {
      s.t = s.int * (0.5 + Math.random());
      if (s.pos.distanceTo(cp) < 25) {
        audio.spark(s.pos);
        echo.emit(s.pos, { radius: 3.5, speed: 12, strength: 1.1, decay: 2.0, color: COLORS.spark });
      }
    }
  }
  // key items softly hum so they can be found
  for (const it of level.items) {
    if (it.taken || ['stone', 'locked', 'shutterA', 'shutterB', 'seismo', 'locker'].includes(it.type)) continue;
    it.hum = (it.hum ?? Math.random() * 4) - dt;
    if (it.hum <= 0) {
      it.hum = 3.5 + Math.random();
      if (it.pos.distanceTo(cp) < 7) echo.emit(it.pos, { radius: 1.1, speed: 2.5, strength: 0.5, decay: 1.5, color: COLORS.item });
    }
  }
  groanT -= dt;
  if (groanT <= 0) {
    groanT = 25 + Math.random() * 30;
    const p = level.randomWalkable(player.pos, 30, 15);
    if (p) {
      p.y = 2;
      if (Math.random() < 0.7) audio.groan(p);
      else audio.whisper(p);
    }
  }
  // machines
  if (game.flags.powered) {
    genPulseT -= dt;
    if (genPulseT <= 0) {
      genPulseT = 1.4;
      echo.emit(GEN_POS, { radius: 13, speed: 9, strength: 0.7, decay: 1.2, color: COLORS.machine });
    }
    genNoiseT -= dt;
    if (genNoiseT <= 0) {
      genNoiseT = 9;
      if (monster.active && monster.state === 'wander') monster.hear(GEN_POS, 26, 'machine', 'machine', player.pos);
    }
  }
}

// ------------------------------------------------------------------ fear & heartbeat
let heartT = 0;
let flash = 0;
function updateFear(dt) {
  let target = 0;
  if (monster.active) {
    const d = monster.pos.distanceTo(V(player.pos.x, 0, player.pos.z));
    const st = monster.state;
    const k = st === 'hunt' ? 1 : st === 'windup' || st === 'lunge' ? 1.4 : st === 'sniff' ? 1.2 : 0.75;
    target = Math.max(0, 1 - d / 15) * k;
  }
  if (game.state === 'dying') target = 1.5;
  game.fear += (Math.min(1.5, target) - game.fear) * Math.min(1, dt * 1.5);
  heartT -= dt;
  if (heartT <= 0 && game.fear > 0.12) {
    const bpm = 62 + game.fear * 95;
    heartT = 60 / bpm;
    audio.heartbeat(Math.min(1, game.fear));
  }
  if (heartT <= 0) heartT = 0.5;
  if (audio.ctx) audio.setAmbience(0.12 * (1 - Math.min(1, game.fear) * 0.6));
  flash = Math.max(0, flash - dt * 0.8);
  fx.uniforms.uFear.value = Math.min(1.2, game.fear * 0.8 + (player.holding ? 0.15 : 0));
  fx.uniforms.uFlash.value = flash;
}

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, clock.getDelta());
  if (!window.__freeze) tick(rdt);
  if (innerWidth > 0 && innerHeight > 0) composer.render();
}
function tick(dt) {
  fx.uniforms.uTime.value += dt;
  const live = game.state === 'play' || game.state === 'note' || game.state === 'dying';
  if (live) {
    game.time += dt;
    echo.update(dt);
    player.update(dt, scene);
    vm.root.visible = game.state !== 'dying' && !player.hidden;
    vm.update(dt, camera, player);
    monster.update(dt, player, game);
    if (game.state === 'dying') updateScare(dt);
    level.updateDoors(dt);
    updateAmbient(dt);
    updateFear(dt);
    updateTimers(dt);
    updateHold(dt);
    if (siege.active) siege.update(dt);
    if (radarT > 0) {
      radarT -= dt;
      drawRadar(radarNode);
      if (radarT <= 0) $('radar').classList.add('hidden');
    }
    dust.material.uniforms.uCam.value.copy(camera.position);
    audio.setListener(camera);
    if (game.state === 'play') {
      focus = findFocus();
      $('prompt').textContent = promptFor(focus);
      $('crosshair').classList.toggle('focus', !!focus);
    } else $('prompt').textContent = '';
    updateHint(dt);
    updateLocation(dt);
    updateHUD();
  } else if (game.state === 'end') {
    echo.update(dt);
  }
}
applyQuality(savedQ);
frame();

// debug handle
window.__siege = siege;
window.__game = {
  game, player, monster, level, echo, audio, camera,
  tick(n = 1, dt = 1 / 60) {
    for (let i = 0; i < n; i++) tick(dt);
  },
  use(it) {
    focus = it;
    interact();
  },
  step(n = 1, dt = 1 / 60) {
    for (let i = 0; i < n; i++) tick(dt);
    composer.render();
  },
};
