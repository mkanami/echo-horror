import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Siege, SIEGE_TIME } from '../src/siege.js';
const V = (x, z) => new THREE.Vector3(x, 0, z);
function fixture() {
  const events = [], shutters = { A: false, B: false, C: false }, hints = [];
  const level = { setShutter: (k, v) => shutters[k] = v };
  const monster = { pos: V(36, 11), spawn(p) { this.pos.copy(p); }, goTo(p, state) { this.target=p.clone(); this.state=state; this.path=[p.clone()]; }, startChase() { this.state='chase'; } };
  const player = { pos: V(12, 8.5), vel: V(0, 0), keys: new Set(), stamina: 1 };
  const game = { hint: text => hints.push(text), onLiftStall: () => events.push('stall'), onLiftRestart: () => events.push('restart'), onLiftArrived: () => events.push('arrive') };
  const s = new Siege({ level, monster, player, game, audio: { play() {}, crash() {} }, ui: { show() {}, update() {} } });
  s.start();
  const step = seconds => { for(let n=Math.round(seconds*60);n>0;n--)s.update(1/60); };
  return { s, monster, player, events, shutters, hints, step };
}

test('lift stalls once, its progress waits for restart, and arrival waits for actual travel', () => {
  const f=fixture();f.step(38.1);assert.equal(f.s.stalled,true);assert.equal(f.s.t,38);assert.deepEqual(f.events,['stall']);
  f.step(12);assert.equal(f.s.t,38);assert.equal(f.s.arrived,false);
  assert.equal(f.s.restartLift(),true);assert.equal(f.s.restartLift(),false);f.step(SIEGE_TIME-38+0.1);
  assert.equal(f.s.arrived,true);assert.deepEqual(f.events,['stall','restart','arrive']);f.step(3);assert.deepEqual(f.events,['stall','restart','arrive']);
});

test('power creates a tradeoff between a closed shutter, switching and radar', () => {
  const f=fixture();assert.equal(f.s.toggle('A'),true);assert.equal(f.s.power,96);f.step(10);assert.ok(Math.abs(f.s.power-85)<.1);
  const ping=f.s.ping();assert.ok(ping.pos);assert.ok(f.s.power<78);const charge=f.s.power;assert.equal(f.s.ping(),null);assert.equal(f.s.power,charge);
  f.s.toggle('B');assert.deepEqual(f.shutters,{A:false,B:true,C:false});assert.equal(f.s.shut.A,false);
  f.s.toggle('B');const before=f.s.power;f.step(2);assert.ok(f.s.power>before+7.9);
});

test('an exhausted drive physically raises all shutters and recovers without a soft lock', () => {
  const f=fixture();f.s.toggle('A');f.s.power=.01;f.s.update(.1);assert.equal(f.s.powerLocked,true);assert.deepEqual(f.shutters,{A:false,B:false,C:false});
  assert.equal(f.s.toggle('B'),false);assert.equal(f.s.ping(),null);f.step(5.1);assert.equal(f.s.powerLocked,false);assert.equal(f.s.toggle('B'),true);
});

test('automatic hand bracing reduces damage, consumes strength, and requires contact with the correct shutter', () => {
  const plain=fixture(),braced=fixture();
  for(const f of [plain,braced]){f.s.toggle('A');f.s.phase='ram';f.s.route='A';f.s.ramT=9;f.s.hitT=0;}
  braced.player.braceContact={doorId:'shA'};braced.player.vel=V(2,0);plain.s.update(.1);braced.s.update(.1);
  assert.ok(100-plain.s.hp.A>=9);assert.ok(100-braced.s.hp.A<=4.2);assert.ok(braced.player.stamina<1);assert.equal(braced.s.bracing,true);
  for(const change of [p=>p.hidden={},p=>p.frozen=true,p=>p.fallT=1,p=>p.stamina=.01,p=>p.pos=V(6,6),p=>p.vel=V(0,2),p=>p.vel=V(-2,0),p=>p.running=true,p=>p.braceContact=null,p=>p.braceContact={doorId:'shB'},p=>p.pos=V(13.5,8.5)]){
    const f=fixture();f.player.braceContact={doorId:'shA'};change(f.player);assert.equal(f.s.isBracing('A'),false);
  }
});

test('later pressure is faster and hits harder; death assistance applies to both', () => {
  const early=fixture(),late=fixture(),assisted=fixture();late.s.elapsed=60;assisted.s.elapsed=60;assisted.s.assist=.75;
  for(const f of [early,late,assisted]){f.s.go('A');f.s.toggle('A');f.s.phase='ram';f.s.ramT=9;f.s.hitT=0;f.s.update(.01)}
  assert.ok(late.monster.scriptSpeed>early.monster.scriptSpeed);assert.ok(assisted.monster.scriptSpeed<late.monster.scriptSpeed);
  assert.ok(late.s.hp.A<early.s.hp.A);assert.ok(assisted.s.hp.A>late.s.hp.A);
});

test('one mid-stage feint stays at the real entrance then takes an actual path to the other', () => {
  const f=fixture();f.s.elapsed=30;f.s.go('A');f.s.toggle('A');f.monster.pos.set(14.1,0,8.5);const before=f.monster.pos.clone();
  f.s.update(.01);assert.equal(f.s.phase,'feint');assert.equal(f.monster.pos.distanceTo(before),0);assert.equal(f.s.monsterInHall,false);
  f.step(2.2);assert.equal(f.s.phase,'approach');assert.equal(f.s.route,'C');assert.equal(f.monster.pos.distanceTo(before),0);assert.ok(f.monster.path.length);
  f.monster.pos.set(2.9,0,8.5);f.s.toggle('C');f.s.update(.01);assert.equal(f.s.phase,'ram');
});

test('breaking a late shutter still enters physically instead of teleporting to the hall', () => {
  const f=fixture();f.s.elapsed=60;f.s.go('A');f.monster.pos.set(14.1,0,8.5);f.s.toggle('A');f.s.phase='ram';f.s.ramT=9;f.s.hitT=0;f.s.hp.A=1;f.s.update(.01);
  assert.equal(f.s.phase,'squeeze');assert.equal(f.s.monsterInHall,false);assert.equal(f.shutters.A,false);assert.ok(f.monster.path.length);
});

test('radar cannot be spammed or used after the siege stops',()=>{const f=fixture();assert.ok(f.s.ping());f.step(5.1);assert.ok(f.s.ping());f.s.stop();assert.equal(f.s.ping(),null);assert.equal(f.s.toggle('A'),false);});

test('the third entrance participates in the shared motor and has its own automatic brace',()=>{
  const f=fixture();f.s.toggle('A');f.s.toggle('C');assert.deepEqual(f.shutters,{A:false,B:false,C:true});
  f.player.pos=V(4.55,8.5);f.player.braceContact={doorId:'shC'};assert.equal(f.s.isBracing('C'),true);
  f.player.braceContact={doorId:'shA'};assert.equal(f.s.isBracing('C'),false);
  f.s.elapsed=30;f.s.go('A');assert.equal(f.s.nextRoute(),'C');
  f.s.go('C');f.s.toggle('B');assert.deepEqual(f.shutters,{A:false,B:true,C:false});
});

test('a repeat attack physically backs away and gives time to repair and recover',()=>{
  const f=fixture();f.s.elapsed=60;f.s.go('A');f.monster.pos.set(14.1,0,8.5);f.s.toggle('A');
  f.s.phase='ram';f.s.ramT=.01;f.s.hitT=9;f.s.hp.A=25;f.s.nextRoute=()=> 'A';
  f.player.stamina=.1;f.player.braceContact={doorId:'shA'};f.s.update(.02);
  assert.equal(f.s.phase,'recoil');assert.ok(f.monster.target.x>14.1);assert.equal(f.s.monsterInHall,false);
  const hp=f.s.hp.A,stamina=f.player.stamina;f.step(3);
  assert.equal(f.s.phase,'recoil');assert.ok(f.s.hp.A>hp+29);assert.equal(f.player.stamina,stamina);
  f.monster.pos.copy(f.monster.target);f.step(.5);assert.equal(f.s.phase,'approach');assert.equal(f.s.route,'A');
});
