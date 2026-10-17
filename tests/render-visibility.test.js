import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {RoomVisibility} from '../src/room-visibility.js';import {spatialBatches} from '../src/render-batches.js';
const mock=(open)=>({open:(x,z)=>x>=0&&x<64&&z>=0&&z<56&&open(x,z)});
const cam=(x,z)=>({position:{x,z}});
const field=(v,x,z)=>v.cells[z*64+x];
test('portals keep a straight corridor and its walls visible',()=>{
 const v=new RoomVisibility(mock((x,z)=>x>=2&&x<=12&&z===5),[]);v.update(cam(2.5,5.5));
 for(let x=2;x<=12;x++)assert.equal(field(v,x,5),1);
 assert.equal(field(v,8,4),1);assert.equal(field(v,8,6),1);assert.equal(field(v,8,7),0);
});
test('portals cannot see around an opaque dogleg but update after moving through it',()=>{
 const v=new RoomVisibility(mock((x,z)=>(x>=2&&x<=8&&z===5)||(x===8&&z>=5&&z<=12)),[]);
 v.update(cam(2.5,5.5));assert.equal(field(v,8,12),0);
 v.update(cam(8.5,5.5));assert.equal(field(v,8,12),1);
});
test('visibility conservatively includes every cell reached by line-of-sight rays',()=>{
 const open=(x,z)=>(x>=2&&x<22&&z>=2&&z<20)&&!(x===10&&z<16&&z!==7)&&!(z===12&&x>12&&x!==16);
 const v=new RoomVisibility(mock(open),[]);
 for(const [x,z] of [[3.3,3.7],[10.5,7.5],[13.9,16.4],[16,12.5],[10,7]]){
  v.update(cam(x,z));
  for(let a=0;a<Math.PI*2;a+=.015){
   const dx=Math.cos(a),dz=Math.sin(a);let cx=Math.floor(x),cz=Math.floor(z);
   const sx=dx>0?1:-1,sz=dz>0?1:-1,tx=Math.abs(1/dx),tz=Math.abs(1/dz);
   let bx=(dx>0?cx+1-x:x-cx)*tx,bz=(dz>0?cz+1-z:z-cz)*tz;
   for(let step=0;step<100;step++){
    assert.equal(field(v,cx,cz),1,`visible ray ${x},${z} -> ${cx},${cz}`);if(!open(cx,cz))break;
    if(bx<bz){cx+=sx;bx+=tx;}else{cz+=sz;bz+=tz;}
   }
  }
 }
});
test('indexed batches preserve every original triangle position and hard normal',()=>{
 const gs=[new THREE.BoxGeometry(1,2,3).toNonIndexed(),new THREE.BoxGeometry(1,1,1).toNonIndexed().translate(25,0,0)];
 const batches=spatialBatches(gs);assert.equal(batches.length,2);
 batches.forEach((g,n)=>{assert.equal(g.index.count,gs[n].attributes.position.count);for(const name of ['position','normal'])for(let i=0;i<g.index.count;i++)for(let j=0;j<3;j++)assert.equal(g.attributes[name].array[g.index.array[i]*3+j],gs[n].attributes[name].array[i*3+j]);});
});
