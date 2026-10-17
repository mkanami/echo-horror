// Only a real ankle/shin-height contact can trip the player. Walls, tall
// furniture, overhead shelves and a near miss never count as a low obstacle.
export function findTripObstacle(level, before, next, radius = 0.31) {
  const dx = next.x - before.x, dz = next.z - before.z;
  const travel = Math.hypot(dx, dz);
  if (travel < 1e-6) return null;
  const width = level.NW && level.navS ? Math.round(level.NW * level.navS) : 64;
  const nearby = new Set();
  if (level.hash) {
    for (let z = Math.floor(Math.min(before.z, next.z) - radius); z <= Math.floor(Math.max(before.z, next.z) + radius); z++) {
      for (let x = Math.floor(Math.min(before.x, next.x) - radius); x <= Math.floor(Math.max(before.x, next.x) + radius); x++) {
        if (x >= 0 && x < width && z >= 0) for (const box of level.hash[z * width + x] || []) nearby.add(box);
      }
    }
  } else for (const box of level.colliders || []) nearby.add(box);
  for (const box of nearby) {
    if (!(box.minY <= 0.24 && box.maxY >= 0.16 && box.maxY <= 0.68)) continue;
    const x = Math.max(box.minX, Math.min(next.x, box.maxX));
    const z = Math.max(box.minZ, Math.min(next.z, box.maxZ));
    if (Math.hypot(next.x - x, next.z - z) > radius) continue;
    const bx = Math.max(box.minX, Math.min(before.x, box.maxX));
    const bz = Math.max(box.minZ, Math.min(before.z, box.maxZ));
    const distance = Math.hypot(before.x - bx, before.z - bz);
    if (distance < radius - 0.035) continue; // spawning/standing inside a prop
    const nx = (before.x - bx) / distance, nz = (before.z - bz) / distance;
    if ((dx * nx + dz * nz) / travel > -0.4) continue; // sliding along/away
    if (level.open && !level.open(Math.floor(x), Math.floor(z))) continue;
    // A low plinth under a solid cupboard is still a tall body collision.
    if ([...nearby].some(other => other !== box && other.minY < 1.35 && other.maxY > 0.8 && x >= other.minX - 0.02 && x <= other.maxX + 0.02 && z >= other.minZ - 0.02 && z <= other.maxZ + 0.02)) continue;
    return { box, point: { x, y: box.maxY, z }, normal: { x: nx, z: nz } };
  }
  return null;
}
