import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Builder } from '../src/builder.js';
import { elevatorDoorFrame } from '../src/props.js';
import { insideLift, takeLiftSurfaces, moveLiftCollider, LIFT_OFFSET } from '../src/lift-asset.js';

test('the complete original lift frame is retained without rebuilding its geometry',()=>{
  const builder=new Builder();elevatorDoorFrame(builder.at(7.5,0,3),3,2.4);
  const original=Object.values(builder.surfaces).flat();
  const captured=takeLiftSurfaces(builder.surfaces);
  assert.equal(Object.values(captured).flat().length,original.length);
  assert.ok(Object.values(captured).flat().every(g=>original.includes(g)));
  assert.equal(Object.keys(builder.surfaces).length,0);
});

test('lift surface extraction preserves the original attributes and leaves the hospital outside it',()=>{
  const floor=new THREE.PlaneGeometry(3,3);floor.rotateX(-Math.PI/2);floor.translate(7.5,0,1.5);
  const outside=new THREE.BoxGeometry(1,1,1);outside.translate(20,1,20);
  const surfaces={floor:[floor],prop:[outside]},position=floor.attributes.position;
  const selected=takeLiftSurfaces(surfaces);
  assert.equal(selected.floor[0],floor);assert.equal(selected.floor[0].attributes.position,position);
  assert.deepEqual(surfaces.prop,[outside]);
  assert.ok(insideLift(7.5,2.6,1.5));
});

test('moving cab collision bounds never mutates the hospital door or changes its dimensions',()=>{
  const original={minX:6,maxX:9,minZ:2.9,maxZ:3.1,minY:0,maxY:2.4};
  const copy={...original},moved=moveLiftCollider(original);
  assert.deepEqual(original,copy);
  assert.equal(moved.maxX-moved.minX,3);
  assert.ok(Math.abs(moved.minZ-(2.9+LIFT_OFFSET.z))<1e-8);
  assert.equal(moved.maxY,2.4);
});
