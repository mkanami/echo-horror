import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GeneratorSequence, FUSE_ACTIONS } from '../src/interaction-sequence.js';
import { sampleWork } from '../src/work-motion.js';

test('generator preparation precedes exactly five audible strokes and completion',()=>{
  const s=new GeneratorSequence(),events=[],phases=new Set();
  while(!s.done){phases.add(s.frame.kind);events.push(...s.advance(1/60));}
  assert.deepEqual([...phases],['insertFuse','uncap','pour','recap','prime']);
  assert.deepEqual(events.filter(e=>!['capOpen','capClose','liquid'].includes(e.event)).map(e=>e.event),['insert','insert','fuel','pump','pump','pump','pump','pump']);
  assert.equal(events.filter(e=>e.event==='liquid').length,3);
  assert.deepEqual(events.filter(e=>e.event==='insert').map(e=>e.slot),[0,1]);
  assert.deepEqual(events.filter(e=>e.event==='pump').map(e=>e.index),[0,1,2,3,4]);
  assert.deepEqual(s.advance(100),[]);
});

test('a long frame cannot skip an installation or a priming impact',()=>{
  const s=new GeneratorSequence();const events=s.advance(100);
  assert.equal(events.length,13);assert.equal(s.done,true);
  assert.deepEqual(events.filter(e=>e.event==='pump').map(e=>e.index),[0,1,2,3,4]);
});

test('releasing E preserves completed preparation but not partial priming',()=>{
  const resumed=new GeneratorSequence({installed:1,fueled:true});
  assert.equal(resumed.frame.slot,1);
  assert.deepEqual(resumed.stages.map(s=>s.kind),['insertFuse','prime']);
  const prepared=new GeneratorSequence({installed:2,fueled:true});
  assert.equal(prepared.duration,5);assert.equal(prepared.frame.kind,'prime');
  assert.equal(prepared.advance(.61).length,0);
  assert.equal(prepared.advance(.02)[0].event,'pump');
  const retry=new GeneratorSequence({installed:2,fueled:true});
  assert.equal(retry.t,0);assert.deepEqual(retry.advance(.61),[]);
});

test('fuse inventory changes only after gripping and extraction, before stowing',()=>{
  for(const action of Object.values(FUSE_ACTIONS)){
    assert.ok(action.grip>0&&action.grip<action.commit&&action.commit<.9);
    assert.ok(action.duration*action.commit>.6);
  }
});

test('all work poses remain finite while looking up/down and turning',()=>{
  for(const pitch of [-1.2,0,1.2])for(const yaw of [0,1.5,-2.8]){
    const cam=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ')).setPosition(0,1.65,0).invert();
    for(const kind of ['unscrew','pickupFuse','insertFuse','uncap','pour','recap','prime'])for(const k of [0,.2,.4,.62,.82,1]){
      const p=sampleWork({kind,k,time:k*5,slot:0,target:new THREE.Vector3(-.1,1.1,-.7),normal:new THREE.Vector3(0,0,1)},cam);
      for(const pose of [p.left,p.right,p.fuse,p.can].filter(Boolean)){
        assert.ok(pose.pos.toArray().every(Number.isFinite),`${kind} position`);
        assert.ok(pose.q.toArray().every(Number.isFinite),`${kind} rotation`);
        assert.ok(Math.abs(pose.q.length()-1)<1e-6);
      }
      if(p.can)assert.ok(p.can.flow>=0&&p.can.flow<=1);
    }
  }
});

test('hands keep their position across fuse and can stage boundaries',()=>{
  const inv=new THREE.Matrix4().makeTranslation(0,-1.65,0),target=new THREE.Vector3(-.18,1.12,-.7),normal=new THREE.Vector3(0,0,1);
  const frame=(kind,k)=>sampleWork({kind,k,time:k*5,slot:0,target,normal},inv);
  const a=frame('insertFuse',1),b=frame('insertFuse',0),c=frame('uncap',0);
  assert.ok(a.left.pos.distanceTo(b.left.pos)<1e-6);
  assert.ok(b.left.pos.distanceTo(c.left.pos)<1e-6);
  for(const [from,to] of [['uncap','pour'],['pour','recap']]){
    const a=frame(from,1),b=frame(to,0);
    assert.ok(a.left.pos.distanceTo(b.left.pos)<1e-6,`${from}: left wrist`);
    assert.ok(a.right.pos.distanceTo(b.right.pos)<1e-6,`${from}: right wrist`);
    assert.ok(a.can.pos.distanceTo(b.can.pos)<1e-6,`${from}: can`);
    assert.ok(a.right.q.angleTo(b.right.q)<1e-6,`${from}: right rotation`);
  }
});
