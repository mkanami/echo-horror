import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CaveLevel } from '../src/cave-level.js';
import { caveLayout, CAVE_SPAWN } from '../src/cave-layout.js';
import { Player } from '../src/player.js';
import { Monster } from '../src/monster.js';
import { PitFall } from '../src/pit-fall.js';

const V=(x,z)=>new THREE.Vector3(x,0,z);
function fixture(){
  const data=caveLayout();
  const level=Object.assign(Object.create(CaveLevel.prototype),{
    cells:data.cells,ceil:data.ceiling,pits:data.pits,zones:data.zones,
    spawn:CAVE_SPAWN,doors:[],colliders:[],drained:false,
  });
  level.buildCollision();
  const sounds=[];
  const audio={step(){sounds.push('step');},breath(){},gasp(){sounds.push('gasp');},monsterStep(){}};
  const game={state:'play',psychosis:0,noise(){},hint(){}};
  const player=new Player(new THREE.PerspectiveCamera(),level,audio,game);
  player.reset(V(26.4,27.5),-Math.PI/2);
  const monster=Object.assign(Object.create(Monster.prototype),{
    level,pos:V(26.69,27.5),state:'sniff',clock:0,stateT:0,suspicion:0,sniffCd:10,
    path:null,speed:0,assist:{speed:1},headWorld:V(26.69,27.5),audio,
    animate(){},sounds(){},
  });
  return {level,player,monster,game,sounds};
}

test('the player can cross the pit lip while monster collision still excludes it',()=>{
  const {level}=fixture();
  for(const z of [25.5,26.5,27.5,28.5]){
    const player=V(28.02,z),monster=player.clone();
    level.collidePlayer(player,.3);level.collide(monster,.3);
    assert.equal(player.x,28.02,'no invisible player barrier');
    assert.ok(monster.distanceTo(player)>.3,'monster retains its edge barrier');
  }
  const wall=V(2.01,2.5);level.collidePlayer(wall,.3);
  assert.ok(wall.x!==2.01||wall.z!==2.5,'real rock walls retain collision');
});

for(const fps of [30,60,144])test(`walking off the edge falls to impact at ${fps} fps; reset restores ground`,()=>{
  const {player:p,level,sounds}=fixture();
  p.keys.add('KeyW');
  for(let n=0;n<fps*2;n++)p.update(1/fps);
  assert.ok(p.pitFall?.impacted);
  assert.equal(p.pos.y,-7);assert.ok(p.camera.position.y<-5);
  assert.ok(level.isPit(p.pos.x,p.pos.z));assert.ok(p.frozen);
  assert.equal(sounds.filter(s=>s==='gasp').length,1);
  const atImpact=p.pos.clone(),steps=sounds.filter(s=>s==='step').length;
  p.keys.add('KeyS');p.keys.add('KeyE');p.click();
  for(let n=0;n<fps;n++)p.update(1/fps);
  assert.deepEqual(p.pos,atImpact);assert.equal(sounds.filter(s=>s==='step').length,steps);
  p.reset(CAVE_SPAWN,Math.PI);p.keys.clear();p.update(1/fps);
  assert.equal(p.pitFall,null);assert.equal(p.pos.y,0);assert.ok(p.camera.position.y>1.5);
  assert.equal(p.frozen,false);
});

test('gravity and horizontal momentum are frame-rate independent, with one latched impact',()=>{
  const results=[];
  for(const fps of [30,60,144]){
    const f=new PitFall(4.4,1.2);let x=0,z=0;
    for(let n=0;n<fps*2;n++){const d=f.advance(1/fps);x+=d.x;z+=d.z;}
    assert.ok(f.impacted);assert.equal(f.y,-7);
    const time=f.time;assert.deepEqual(f.advance(10),{x:0,z:0});assert.equal(f.time,time);
    results.push([x,z,time]);
  }
  for(const r of results)for(let n=0;n<3;n++)assert.ok(Math.abs(r[n]-results[0][n])<1e-10);
});

test('monster A* takes both bypasses and every smoothed segment stays off the pit',()=>{
  const {level}=fixture();level.buildNav();
  const pairs=[[V(25.5,27.5),V(37.5,27.5)],[V(31.5,21.5),V(31.5,33.5)]];
  for(const [from,to]of pairs){
    assert.ok(level.crossesPit(from,to));
    const path=level.findPath(from,to);assert.ok(path?.length>2);
    for(let i=1;i<path.length;i++)assert.equal(level.crossesPit(path[i-1],path[i]),false);
  }
});

test('pathless sniffing cannot creep into the pit',()=>{
  const {monster:m,level,game}=fixture();
  const player={pos:V(31,27.5),hidden:null,holding:false};
  for(let n=0;n<180;n++){
    m.update(1/60,player,game);
    assert.equal(level.isPit(m.pos.x,m.pos.z),false);
    assert.ok(m.pos.x<=26.700001);
  }
});

test('the monster edge guard rejects a displacement through the entire shaft',()=>{
  const {monster:m,level}=fixture();m.keepClear();
  const safe=m.pos.clone();
  for(const to of [V(31,27.5),V(37,27.5)]){
    m.pos.copy(to);m.keepClear();
    assert.deepEqual(m.pos,safe);
    assert.equal(level.isPit(m.pos.x,m.pos.z),false);
  }
});

test('a lunge stops at the pit, and an attempted attack across it replans around it',()=>{
  const {monster:m,level,game}=fixture();
  m.state='lunge';m.lunge={dir:V(1,0),t:0};
  for(let n=0;n<40;n++){
    m.update(1/60,{pos:V(40,27.5)},game);
    assert.equal(level.isPit(m.pos.x,m.pos.z),false);
  }
  assert.equal(m.state,'recover');assert.ok(m.pos.x<=26.700001);
  level.buildNav();
  assert.equal(m.startWindup(V(37,27.5)),false);
  assert.equal(m.state,'chase');assert.ok(m.path?.length);
  m.kill({pos:V(31,27.5),pitFall:{}});assert.equal(m.state,'chase');
});
