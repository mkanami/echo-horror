// Grid cells are movement space; displaced rock surfaces stay outside it.
export const CAVE_SPAWN = { x: 8.5, z: 6.4, yaw: Math.PI };
export const CAVE_STATIONS = [
  { id: 'valve', x: 13.5, z: 26.5, name: 'Дренажный коллектор' },
  { id: 'resonator', x: 49.5, z: 17.5, name: 'Палата, которой нет' },
  { id: 'exit', x: 50.5, z: 46.5, name: 'Нижняя штольня' },
];
export const CAVE_ZONES = [
  { name: 'Ствол · ниже −9', x: 8.5, z: 7, rx: 3, rz: 4, height: 3.4 },
  { name: 'Каменный приёмник', x: 13, z: 15, rx: 6, rz: 5, height: 6 },
  { name: 'Затопленная перевязочная', x: 13, z: 27, rx: 7, rz: 7, height: 7 },
  { name: 'Хор пустых коек', x: 31, z: 27, rx: 10, rz: 10, height: 12 },
  { name: 'Палата, которой нет', x: 49, z: 18, rx: 7, rz: 6, height: 8 },
  { name: 'Соляное горло', x: 46, z: 36, rx: 7, rz: 5, height: 5 },
  { name: 'Нижняя штольня', x: 50, z: 46, rx: 5, rz: 5, height: 6 },
];
const links = [
  [[8, 9], [10, 13], [13, 15]],
  [[13, 15], [10, 19], [13, 27]],
  [[13, 27], [20, 30], [24, 29]],
  [[35, 22], [40, 19], [49, 18]],
  [[36, 32], [39, 36], [46, 36]],
  [[49, 18], [54, 25], [52, 30], [46, 36]],
  [[46, 36], [46, 41], [50, 46]],
  // A quiet, crouched bypass rejoins the choir behind the beds.
  [[14, 31], [17, 37], [23, 39], [28, 35]],
];

export function caveLayout(width = 64, height = 56) {
  const cells = new Uint8Array(width * height), ceiling = new Float32Array(width * height);
  const zones = new Int8Array(width * height).fill(-1), pits = new Uint8Array(width * height);
  function carve(x, z, rx, rz, roof, zone = -1) {
    for (let j = Math.max(1, Math.floor(z-rz)); j <= Math.min(height-2, Math.ceil(z+rz)); j++) {
      for (let i = Math.max(1, Math.floor(x-rx)); i <= Math.min(width-2, Math.ceil(x+rx)); i++) {
        const d = ((i+.5-x)/rx)**2 + ((j+.5-z)/rz)**2;
        if (d > 1) continue;
        const n = j*width+i;
        cells[n] = zone === 2 ? 2 : 1;
        ceiling[n] = Math.max(ceiling[n], roof - d*.8);
        if (zone >= 0) zones[n] = zone;
      }
    }
  }
  CAVE_ZONES.forEach((r, i) => carve(r.x, r.z, r.rx, r.rz, r.height, i));
  links.forEach((points, route) => {
    for (let k = 1; k < points.length; k++) {
      const a = points[k-1], b = points[k], length = Math.hypot(b[0]-a[0], b[1]-a[1]);
      for (let s = 0; s <= length*4; s++) {
        const t = s/(length*4);
        carve(a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, route === 7 ? 1.25 : 2, route === 7 ? 1.25 : 2, route === 7 ? 1.45 : 3.8);
      }
    }
  });
  // No floor here. Keep these cells out of the monster's navigation graph.
  for (let z = 22; z <= 31; z++) for (let x = 27; x <= 34; x++) {
    if (((x+.5-31)/3.6)**2 + ((z+.5-27)/4.5)**2 < 1) {
      cells[z*width+x] = 0; ceiling[z*width+x] = 0; pits[z*width+x] = 1;
    }
  }
  return { cells, ceiling, zones, pits };
}
