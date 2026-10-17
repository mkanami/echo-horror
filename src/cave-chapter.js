import * as THREE from 'three';
import { CaveSequence } from './cave-sequence.js';
import { CAVE_SPAWN } from './cave-layout.js';
import { echo, COLORS } from './echo.js';
import { valveRotation } from './work-motion.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const $=id=>document.getElementById(id);

export class CaveChapter {
  constructor({level,root,game,player,monster,audio,vm,save,complete,hide}) {
    Object.assign(this,{level,root,game,player,monster,audio,vm,onSave:save,onComplete:complete,onHide:hide});
    this.active=false;this.loops=[];
  }
  start(saved=null,entry=null) {
    this.active=true;this.sequence=new CaveSequence(saved?.sequence);
    const {player,level,game,monster,vm}=this;
    this.root.visible=true;level.mountOriginalLift();player.level=monster.level=level;
    monster.forcedTarget=null;monster.lures=[];monster.despawn();
    player.reset(saved?.pos||entry?.pos||CAVE_SPAWN,saved?.yaw??entry?.yaw??CAVE_SPAWN.yaw);
    player.pitch=entry?.pitch??0;
    player.keys.clear();
    player.stones=saved?.stones??5;vm.contactSolver=null;vm.work=null;
    game.flags.chapter='cave';game.state='play';game.fear=game.psychosis=0;
    this.pulseT=this.signalT=0;this.spawned=false;
    this.lastRoom=null;this.roomT=0;
    this.applyState();
    for(const l of this.loops)l.setGain(0,.01);
    if(this.audio.ready&&!this.motor){
      this.motor=this.audio.createLoop('loop_lift',V(8.5,1,6),.5,{ref:3,roll:.8});
      this.water=this.audio.createLoop('loop_water',V(13,1,27),.35,{ref:2,roll:1.1});
      this.resonator=this.audio.createLoop('loop_vent',V(49.5,1.2,17.5),.14,{ref:2,roll:1.2});
      this.loops=[this.motor,this.water,this.resonator];
    }
    if(this.audio.ready){
      this.motor.setGain(this.sequence.phase==='descent'?1:0,.1);
      this.water.setGain(this.sequence.drained?.12:1,.5);this.resonator.setGain(this.sequence.drained?.7:0,2);
    }
    $('end').classList.add('hidden');$('fade').style.transition='';$('fade').style.opacity=0;
    game.hint(saved?'Горизонт −11. Ты снова здесь.':'Лифт идёт вниз. Кнопки не отвечают.',4,true);
    if(!saved)this.onSave();
  }
  applyState(){
    const {level,sequence:s}=this;
    level.setLiftOpening(s.opening);level.drained=s.drained;
    level.water.position.y=s.drained?-.13:.018;
    level.valve.rotation.z=valveRotation(s.drained?4:s.action);
    level.exitGate.position.y=s.tuned?4.2:1.35;
    level.gateDoor.closed=!s.tuned;level.gateDoor.box=s.tuned?null:{...level.gateBox};
    this.player.frozen=s.phase==='complete';
    // Rebuild with the doorway open after the hands clear the obstruction.
    if(s.opening>=1)level.buildNav();
  }
  focus(camera){
    if(this.player.hidden)return this.player.hidden;
    if(this.sequence.phase==='pry')return {id:'doors',pos:V(8.5,1.4,8.4)};
    if(this.sequence.phase!=='explore')return null;
    const dir=V(0,0,0);camera.getWorldDirection(dir);
    return [...this.level.stationItems,...this.level.items.filter(it=>it.type==='locker'&&it.low)].find(it=>{
      const to=it.pos.clone().sub(camera.position),d=to.length();
      return d<2.2&&(d<.85||to.normalize().dot(dir)>.7);
    })||null;
  }
  interact(camera){
    const p=this.player;
    if(this.game.state!=='play'||this.sequence.phase!=='explore'||p.frozen||p.fallT>0||p.pitFall)return;
    const it=this.focus(camera);
    if(it?.type==='locker'&&it.low)this.onHide(it);
  }
  objective(){
    const s=this.sequence;
    if(s.phase==='descent')return 'Дождаться остановки лифта.';
    if(s.phase==='stalled')return 'Удержаться на ногах.';
    if(s.phase==='pry')return 'Удерживай [E], чтобы раздвинуть створки руками.';
    if(!s.drained)return 'Снять давление в дренажном коллекторе. Иди на звук воды.';
    if(!s.tuned)return 'Включить резонатор в палате за хором коек. Есть два обхода разлома.';
    return 'Пройти соляное горло и открыть нижнюю штольню.';
  }
  prompt(it){
    if(!it)return '';
    if(it.type==='locker')return this.player.hidden?'[E] Вылезти':'[E] Залезть под кровать';
    const s=this.sequence;
    const working=s.actionId===it.id;
    if(it.id==='doors')return this.player.keys.has('KeyE')?'Раздвигаешь створки… Держи E':'[держи E] Раздвинуть створки';
    if(it.id==='valve')return s.drained?'Давление снято.':working?'Вращаешь вентиль… Держи E':'[держи E] Открыть дренаж';
    if(it.id==='resonator')return !s.drained?'Нет питания. Контур затоплен.':s.tuned?'Контур работает.':working?'Настраиваешь контур… Держи E':'[держи E] Настроить резонатор';
    return s.tuned?working?'Открываешь затвор… Держи E':'[держи E] Открыть затвор':'Затвор заперт. Нужен сигнал из палаты 0.';
  }
  update(dt,camera){
    const {sequence:s,player:p,level,game,audio,vm}=this;
    if(p.pitFall){p.frozen=true;vm.work=null;return '';}
    const it=this.focus(camera), held=p.keys.has('KeyE')&&!!it&&it.type!=='locker';
    for(const event of s.advance(dt,held,it?.id))this.event(event);
    p.frozen=s.phase==='complete'||s.phase==='pry'&&held;
    vm.work=null;p.lookTarget=null;
    if(s.phase==='descent'){
      p.shake=.07;
      if(this.motor)this.motor.update();
    }
    if(s.phase==='pry'){
      if(held){
        p.yaw=Math.PI;p.pitch=0;
        p.lookTarget=V(8.5,1.45,8.4);p.pos.set(8.5,0,7.86);
        vm.work={kind:'pryLift',k:s.opening,time:s.time,target:V(8.5,1.36,8.36),normal:V(0,0,-1)};
        p.shake=.06;
      }
      level.setLiftOpening(s.opening);
    }
    if(s.phase==='explore'){
      const room=level.roomAt(p.pos.x,p.pos.z)?.name||'Каменная перемычка';
      if(room!==this.lastRoom){this.lastRoom=room;this.roomT=4;$('location').textContent=room;$('location').style.opacity=1;}
      this.roomT-=dt;if(this.roomT<=0)$('location').style.opacity=0;
      if(held&&it&&s.action>0){
        vm.work={kind:'caveValve',k:s.action/(it.id==='valve'?4:3),time:s.action,target:it.pos.clone(),normal:V(0,0,-1)};
        p.frozen=true;
      }
      level.valve.rotation.z=valveRotation(s.drained?4:s.action);
      level.water.position.y=THREE.MathUtils.damp(level.water.position.y,s.drained?-.13:.018,1,dt);
      level.exitGate.position.y=THREE.MathUtils.damp(level.exitGate.position.y,s.tuned?4.2:1.35,2,dt);
      const distance=Math.hypot(p.pos.x-8.5,p.pos.z-7);
      if(s.drained&&!this.spawned&&distance>12){
        this.spawned=true;
        const spawn=level.randomWalkable(p.pos,28,16);
        if(spawn){this.monster.spawn(spawn,'wander');this.monster.idleT=8;}
        game.hint('Из ствола ответили шаги. Оно тоже спустилось.',5,true);
      }
      this.signalT-=dt;
      if(s.drained&&this.signalT<=0){
        this.signalT=4;
        const source=s.tuned?V(50.5,1.2,47.8):V(49.5,1.5,17.5);
        if(source.distanceTo(camera.position)<7)echo.emit(source,{radius:1.1,speed:2.5,strength:.5,decay:1.5,color:COLORS.item});
      }
    }
    this.pulseT-=dt;
    if(this.pulseT<=0&&(s.phase==='descent'||s.phase==='pry'&&held)){
      this.pulseT=s.phase==='descent'?1.4:1.1;
      const at=V(8.5,1,8.3);
      echo.emit(at,{radius:s.phase==='descent'?7:4,speed:9,strength:.7,decay:1.2,color:COLORS.machine});
      if(held&&s.phase==='pry')audio.scratch(at);
    }
    return this.prompt(it);
  }
  event(event){
    const {audio,player:p,game,level}=this;
    if(event==='crash'){
      if(this.motor)this.motor.setGain(0,.03);
      audio.play('slam',V(8.5,2,7),{gain:1.2,rate:.65,wet:.8});p.shake=1.6;
      echo.emit(V(8.5,.3,7),{radius:18,speed:30,strength:2,decay:1.2,color:COLORS.machine});
      game.hint('Лифт встал. Привод дверей не отвечает.',4,true);
    }
    if(event==='pry')game.hint('Подцепить створки пальцами. Удерживай [E].',5,true);
    if(event==='opened'){
      p.frozen=false;p.lookTarget=null;level.setLiftOpening(1);level.buildNav();
      audio.door(V(8.5,1,8.4));game.hint('Слышно воду. Где-то впереди работает насос.',4,true);this.onSave();
    }
    if(event==='valve'){
      level.drained=true;if(this.water)this.water.setGain(.12,2);
      if(this.resonator)this.resonator.setGain(.7,2);
      audio.play('metal_heavy',V(13.5,.5,27),{gain:.8,rate:.6,wet:.9});
      game.hint('Вода уходит. Питание подано в палату 0.',4,true);this.onSave();
    }
    if(event==='resonator'){
      level.gateDoor.closed=false;level.gateDoor.box=null;level.buildNav();
      audio.ding(V(49.5,2,17.5));
      echo.emit(V(49.5,1,17.5),{radius:18,speed:9,strength:1.1,decay:1.2,color:COLORS.machine});
      game.hint('Затвор в соляном горле поднялся. Уходи в нижнюю штольню.',5,true);this.onSave();
    }
    if(event==='exit'){
      this.monster.despawn();for(const l of this.loops)l.setGain(0,2);
      this.onComplete();
    }
  }
  snapshot(){return {sequence:this.sequence.snapshot(),pos:{x:this.player.pos.x,z:this.player.pos.z},yaw:this.player.yaw,stones:this.player.stones};}
}
