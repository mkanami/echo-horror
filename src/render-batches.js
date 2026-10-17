import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Keep the original vertices, normals and material; only change submission
// boundaries so a corpse in another wing doesn't keep the whole map visible.
export function spatialBatches(geometries, cellSize = 16) {
  const cells = new Map(), center = new THREE.Vector3();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    geometry.boundingBox.getCenter(center);
    const key = `${Math.floor(center.x / cellSize)},${Math.floor(center.z / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(geometry);
  }
  return [...cells.values()].map(parts => {
    const merged = mergeGeometries(parts, false);
    // Weld only coincident attribute tuples, preserving hard normals/UV seams.
    const indexed = mergeVertices(merged, 1e-7);
    merged.dispose();
    indexed.computeBoundingBox();
    indexed.computeBoundingSphere();
    return indexed;
  });
}
