import * as THREE from 'three';

// The hospital's authored cab, in its original world coordinates. Keeping its
// existing meshes and materials avoids a second interpretation of the lift.
export const LIFT_BOUNDS={minX:5.65,maxX:9.35,minY:-.15,maxY:3.15,minZ:-.15,maxZ:3.25};
export const LIFT_OFFSET=new THREE.Vector3(1,0,5.38);

export function insideLift(x,y,z){
  const b=LIFT_BOUNDS;
  return x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY&&z>=b.minZ&&z<=b.maxZ;
}

export function takeLiftSurfaces(surfaces){
  const selected={};
  for(const [key,geometries]of Object.entries(surfaces)){
    const keep=[];
    for(const geometry of geometries){
      geometry.computeBoundingBox();const b=geometry.boundingBox;
      if(insideLift(b.min.x,b.min.y,b.min.z)&&insideLift(b.max.x,b.max.y,b.max.z)){
        (selected[key]||=[]).push(geometry);
      }else keep.push(geometry);
    }
    surfaces[key]=keep;
    if(!keep.length)delete surfaces[key];
  }
  return selected;
}

export function moveLiftCollider(box){
  return {...box,minX:box.minX+LIFT_OFFSET.x,maxX:box.maxX+LIFT_OFFSET.x,minZ:box.minZ+LIFT_OFFSET.z,maxZ:box.maxZ+LIFT_OFFSET.z};
}
