import * as THREE from 'three';
import { Level, W, H, ROOMS, FLOOR } from './level.js';
import { Builder } from './builder.js';
import { echoMaterial } from './echo.js';
import { LIFT_OFFSET, moveLiftCollider } from './lift-asset.js';
import { caveLayout, CAVE_SPAWN, CAVE_ZONES, CAVE_STATIONS } from './cave-layout.js';
import { caveProp, CAVE_MODEL_TYPES } from './cave-props.js';
import { caveSurface, hospitalFrame } from './cave-style.js';
import * as P from './props.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V = (x,y,z) => new THREE.Vector3(x,y,z);
const hash = (x,y,z=0) => { const n=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return n-Math.floor(n); };
const KEYS = ['basalt','limestone','shale','calcite','wetrock','flowstone','breccia','salt','clay','silt','gravel','algae','ceramic','ochretile','porcelain','copper','corroded','enamel','mesh','cable','gauze','canvas','sediment','fossil'];

export class CaveLevel extends Level {
  layout() {
    const data=caveLayout(W,H), first=ROOMS.length;
    this.spawn=CAVE_SPAWN;
    this.cells=data.cells;this.ceil=data.ceiling;this.pits=data.pits;
    this.room=new Int8Array(W*H).fill(-1);
    CAVE_ZONES.forEach(r=>ROOMS.push({name:r.name,x:r.x-r.rx,z:r.z-r.rz,w:r.rx*2,h:r.rz*2}));
    for(let i=0;i<this.room.length;i++)if(data.zones[i]>=0)this.room[i]=first+data.zones[i];
    this.zones=data.zones;
  }
  shaftCell() { return false; }
  isPit(x,z) {
    const i=Math.floor(x),j=Math.floor(z);
    return i>=0&&j>=0&&i<W&&j<H&&this.pits[j*W+i]===1;
  }
  crossesPit(from,to) {
    const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.1));
    for(let n=0;n<=steps;n++){
      const t=n/steps;
      if(this.isPit(from.x+(to.x-from.x)*t,from.z+(to.z-from.z)*t))return true;
    }
    return false;
  }
  materials() {
    this.mat={};
    for(const key of KEYS) {
      this.mat[key]=echoMaterial(caveSurface(key));
    }
    for(const key of ['clay','silt','ochretile','sediment','shale'])this.mat[`floor_${key}`]=echoMaterial({...caveSurface(key),scale:.5,boost:.6});
    this.mat.wardwall=echoMaterial({pat:7,map:'cave/limestone',scale:.45,map2:'cave/ceramic',scale2:.55,split:1.45,grime:.8});
    this.mat.prop=this.mat.corroded;this.mat.item=this.mat.calcite;
  }
  roofAt(x,z) {
    let h=3.1;
    for(const r of CAVE_ZONES){
      const d=((x-r.x)/r.rx)**2+((z-r.z)/r.rz)**2;
      h=Math.max(h,3.1+(r.height-3.1)*Math.exp(-d*.55));
    }
    if(this.ceilAt(Math.floor(x),Math.floor(z))<1.7&&this.open(Math.floor(x),Math.floor(z)))return 1.45;
    return h+Math.sin(x*3.7+z*2.9)*.12;
  }
  rockPatch(B, points, nx, nz, key, roof=false) {
    const [a,b,c,d]=points, geo=new THREE.PlaneGeometry(1,1,4,5), p=geo.attributes.position;
    for(let k=0;k<p.count;k++) {
      const u=p.getX(k)+.5,v=p.getY(k)+.5;
      const q=V(...a).lerp(V(...b),u).lerp(V(...d).lerp(V(...c),u),v);
      const baseX=q.x,baseZ=q.z;
      const top=this.roofAt(baseX,baseZ);
      if(roof)q.y=top;
      else if(a[1]>=0)q.y=v*top;
      // At corners both faces sample the same outward vector. This keeps the
      // cave watertight instead of opening black seams between displaced cells.
      let ox=0,oz=0;
      for(const [dx,dz]of [[-.08,0],[.08,0],[0,-.08],[0,.08],[-.08,-.08],[.08,-.08],[-.08,.08],[.08,.08]]){
        if(!this.open(Math.floor(baseX+dx),Math.floor(baseZ+dz))){ox+=dx;oz+=dz;}
      }
      const length=Math.hypot(ox,oz);
      const n=Math.sin(baseX*2.7+q.y*1.7+baseZ*.9)*.5+Math.sin(baseZ*5.1-q.y*2.3)*.25;
      const displacement=(.16+(n+1)*.14+Math.sin(Math.PI*Math.max(0,q.y)/Math.max(1,top))*.24)*Math.min(1,Math.abs(q.y)*2);
      if(length>.001){q.x+=ox/length*displacement;q.z+=oz/length*displacement;}
      p.setXYZ(k,q.x,q.y,q.z);
    }
    geo.computeVertexNormals();B.add(geo,{key,collide:false,walk:true});geo.dispose();
  }
  buildArchitecture() {
    const B=new Builder();
    for(let z=1;z<H-1;z++)for(let x=1;x<W-1;x++) {
      if(!this.open(x,z))continue;
      const k=z*W+x, h=this.roofAt(x+.5,z+.5), zone=this.zones[k];
      const key=zone===2?'wetrock':zone===3?'shale':zone===4?'limestone':zone===5?'salt':'basalt';
      const floor=`floor_${zone===2?'silt':zone===4?'ochretile':zone===5?'sediment':zone===3?'shale':'clay'}`;
      const cabCell=x>=7&&x<10&&z>=5&&z<9;
      if(!cabCell)B.box(x+.5,-.1,z+.5,1,.2,1,{key:floor,collide:false,walk:true});
      else if(z===8)B.box(x+.5,-.1,8.69,1,.2,.62,{key:floor,collide:false,walk:true});
      this.rockPatch(B,[[x,h,z],[x+1,h,z],[x+1,h,z+1],[x,h,z+1]],0,0,key,true);
      for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        if(this.open(x+dx,z+dz))continue;
        let a,b;
        if(dx){a=[x+(dx>0?1:0),0,z];b=[a[0],0,z+1];}
        else{a=[x,0,z+(dz>0?1:0)];b=[x+1,0,a[2]];}
        const pit=zone===3&&x+dx>=27&&x+dx<=34&&z+dz>=22&&z+dz<=31;
        const bottom=pit?-8:0, top=pit?0:h;
        a[1]=b[1]=bottom;
        this.rockPatch(B,[a,b,[b[0],top,b[2]],[a[0],top,a[2]]],-dx,-dz,key);
        if(hash(x,z)>.65&&zone!==0&&!pit) {
          const height=.6+hash(z,x)*2;
          B.add(new THREE.ConeGeometry(.18+hash(x,z)*.3,height,7,3),{pos:[x+.5+dx*.3,h-height/2,z+.5+dz*.3],rot:[Math.PI,0,0],key:hash(z,x)>.5?'calcite':'flowstone',collide:false,walk:true});
        }
      }
      if(zone===2&&hash(x,z)>.87)this.drips.push({pos:V(x+.5,.03,z+.5),t:hash(x,z)*4,int:3+hash(z,x)*4});
    }
    // Continuous black water, with stone islands that remain navigable.
    const water=echoMaterial({map:'cave/algae',pat:1,wet:1,scale:.5,boost:.65});
    const pool=new THREE.Mesh(new THREE.CircleGeometry(6.2,56),water);
    pool.rotation.x=-Math.PI/2;pool.scale.y=1.05;pool.position.set(13,.018,27);this.scene.add(pool);
    this.water=pool;
    this.colliders=B.colliders;
    this.scene.add(B.build(this.mat,{}));
  }
  buildProps() {
    const B=new Builder();this.modelCounts={};
    const put=(type,x,y,z,a=0)=>{
      caveProp(B,type,x,y,z,a);this.modelCounts[type]=(this.modelCounts[type]||0)+1;
      const size={'traction-bed':[1.05,2.05,1.35],'dialysis-shrine':[1.1,.65,1.8],'ore-cart':[1.3,1.6,1],'collapsed-ward':[3.8,.3,3.2]}[type];
      if(y===0&&size){
        const [w,d,h]=size,rx=(Math.abs(Math.cos(a))*w+Math.abs(Math.sin(a))*d)/2,rz=(Math.abs(Math.sin(a))*w+Math.abs(Math.cos(a))*d)/2;
        this.colliders.push({minX:x-rx,maxX:x+rx,minZ:z-rz,maxZ:z+rz,minY:0,maxY:h});
      }
      if(type==='traction-bed'&&y===0){
        const at=(distance,height=0)=>V(x+Math.sin(a)*distance,height,z+Math.cos(a)*distance);
        this.items.push({id:`caveBed${this.items.length}`,type:'locker',low:true,
          pos:at(.95,.42),inside:at(-.15),front:at(1.8),yaw:a+Math.PI,
          obj:new THREE.Object3D(),taken:false});
      }
    };
    put('collapsed-ward',10,0,16,.45);put('cable-bundle',8.2,2,12);
    put('ore-cart',16,0,16,-.5);put('calcite-organ',8.7,0,22,.5);
    put('drain-pump',13.5,0,26.9,Math.PI);put('surgical-lamp',9,0,26,1.2);
    put('traction-bed',9.5,0,30,.3);put('traction-bed',15.8,0,23.7,-.4);
    put('dialysis-shrine',16.3,0,29.6,-.7);put('mineral-iv',9.8,0,28.6);
    for(let i=0;i<9;i++){
      const a=i*Math.PI*2/9;
      put('suspended-bed',31+Math.cos(a)*4.9,3.2+Math.sin(i*1.7)*1.4,27+Math.sin(a)*6.2,a);
    }
    // Beds bolted to a vertical wall: the ward continues ninety degrees up.
    for(let i=0;i<3;i++){
      const prop=new Builder();caveProp(prop,'traction-bed',0,0,0);
      const g=prop.build(this.mat,{});g.position.set(39,3+i*2.3,26);g.rotation.z=Math.PI/2;this.scene.add(g);
      this.modelCounts['traction-bed']++;
    }
    for(let i=0;i<5;i++)put('rib-arch',39.5+i*2.1,0,20.5-i*.45,Math.PI/2);
    put('resonator',49.5,0,17.5);put('collapsed-ward',49,0,13,Math.PI);
    put('dialysis-shrine',53,0,17);put('surgical-lamp',46.3,0,17,-1);
    put('mineral-iv',52.6,0,20.2);put('traction-bed',46,0,20.8,.25);
    put('calcite-organ',44,0,35,1.2);put('calcite-organ',49,0,38.3,-.5);
    put('ore-cart',51.5,0,32,.5);put('cable-bundle',54,0,26);
    put('collapsed-ward',48.7,0,49.8,.1);put('dialysis-shrine',53,0,47.5);
    for(let i=0;i<6;i++)put('mineral-iv',40.5+i*.8,0,34.5+Math.sin(i)*.6);
    const dress=(fn,x,z,angle=0,...args)=>fn(hospitalFrame(B.at(x,0,z,angle)),...args);
    dress(P.bedside,10.5,30.5);dress(P.bedside,46.9,21.8);
    dress(P.medCart,16.8,26.5,-.2);dress(P.oxygenTanks,52.5,20.5,0,2);
    dress(P.bench,9.1,14.5,.35,1.8);dress(P.wheelchair,15.7,15.5,.3,{fallen:true});
    dress(P.screen,7.8,25.3,.25,1.2);dress(P.bucketMop,16.8,31);
    dress(P.sink,50.6,13.8,Math.PI);P.wallClock(hospitalFrame(B.at(49.6,2.2,13.4)));
    for(const [x,z]of [[11,17],[15,24],[45,20],[51,48]])dress(P.papers,x,z,0,5,.7,.6);
    for(const [x,z]of [[10,16],[17,31],[49,14],[48,48]])dress(P.rubble,x,z,0,12,.65,.6);
    for(const [x,z,h]of [[11,16,4],[14.5,24,4.5],[48,18,4],[46,36,3.6]])P.danglingLamp(hospitalFrame(B.at(x,0,z)),h,1.2,.3);
    B.pipe(7.4,18,9.3,22,2.2,.06,{key:'corroded',collide:false,walk:true});
    B.pipe(51.5,21.5,53.5,26,2.3,.07,{key:'corroded',collide:false,walk:true});
    this.sparks.push({pos:V(9.3,2.2,22),t:2,int:6},{pos:V(53.5,2.3,26),t:3,int:7});
    // Rock shelves, broken ceramic fragments, mineral clusters: deterministic.
    for(let i=0;i<240;i++){
      const x=3+hash(i,7)*55,z=10+hash(i,11)*41;
      if(!this.open(Math.floor(x),Math.floor(z)))continue;
      const edge=[[-1,0],[1,0],[0,-1],[0,1]].some(([a,b])=>!this.open(Math.floor(x)+a,Math.floor(z)+b));
      if(!edge)continue;
      const h=.15+hash(i,18)*.6;
      B.add(new THREE.IcosahedronGeometry(1,1),{pos:[x,h*.35,z],scale:[.3+hash(i,21)*.4,h,.2+hash(i,23)*.4],key:['breccia','fossil','calcite','salt'][i%4],collide:false,walk:true});
    }
    // Props use explicit coarse movement volumes; small details stay visual.
    this.colliders.push(
      {minX:12.6,maxX:14.4,minZ:26.6,maxZ:27.7,minY:0,maxY:1.6},
      {minX:48.6,maxX:50.4,minZ:17.1,maxZ:18.3,minY:0,maxY:2.7},
      {minX:8.8,maxX:10.2,minZ:29,maxZ:31.3,minY:0,maxY:1.3},
      {minX:45.2,maxX:46.9,minZ:20,maxZ:22,minY:0,maxY:1.3},
    );
    this.scene.add(B.build(this.mat,{}));
    this.assetStats={materials:KEYS.length,maps:KEYS.length*3,modelTypes:CAVE_MODEL_TYPES.length,models:Object.values(this.modelCounts).reduce((a,b)=>a+b,0)};
  }
  buildDynamic() {
    // Portal into the next shaft; opens only when the two stations are set.
    const gate=new THREE.Mesh(new THREE.BoxGeometry(2.5,2.7,.17),this.mat.copper);
    gate.position.set(50.5,1.35,47.8);this.scene.add(gate);this.exitGate=gate;
    this.gateBox={minX:49.25,maxX:51.75,minZ:47.7,maxZ:47.9};
    this.gateDoor={id:'caveExit',kind:'slide',closed:true,box:{...this.gateBox},leaves:[]};
    this.doors.push(this.gateDoor);
    const disc=new THREE.Mesh(new THREE.TorusGeometry(.26,.035,8,24),this.mat.copper);
    disc.position.set(13.5,1.18,26.35);this.scene.add(disc);this.valve=disc;
    for(let i=0;i<4;i++){
      const bar=new THREE.Mesh(new THREE.BoxGeometry(.49,.025,.025),this.mat.copper);bar.rotation.z=i*Math.PI/4;disc.add(bar);
    }
    this.stationItems=CAVE_STATIONS.map(s=>({...s,pos:V(s.x,s.id==='valve'?1.18:1.4,s.id==='valve'?26.35:s.id==='resonator'?18.35:47.6)}));
  }
  bindOriginalLift(hospital){
    this.liftRoot=hospital.liftRoot;
    this.originalLift=hospital.door('lift');
    this.liftDoor={...this.originalLift,id:'caveLift',leaves:this.originalLift.leaves,closed:true,t:0,box:moveLiftCollider(this.originalLift.box)};
    this.doors.push(this.liftDoor);
    this.colliders.push(...hospital.liftColliders.map(moveLiftCollider));
    this.buildCollision();this.navReach=null;this.buildNav();
  }
  mountOriginalLift(){
    this.scene.add(this.liftRoot);
    this.liftRoot.position.copy(LIFT_OFFSET);
    this.liftRoot.traverse(obj=>{obj.visible=true;});
  }
  buildDecals() {
    const B=new Builder();
    for(const [x,y,z]of [[8.5,2.8,8.65],[13.5,1.7,27.2],[49,2.7,13.2],[50.5,3.1,47.7]])P.sign(hospitalFrame(B.at(x,y,z)),.8,.3);
    this.scene.add(B.build(this.mat,{}));
    const sets={},materials={};
    for(const type of ['leak','crack','mould','blood_drag','stain'])materials[type]=echoMaterial({pat:8,map:`decal:${type}`,wet:type==='blood_drag'?.8:.4,boost:1});
    for(const [type,x,z,size,angle]of [['blood_drag',11,22,1.5,.2],['stain',15,30,1.8,.8],['mould',47,20,1.1,.6],['blood_drag',48,22,1.2,-.4],['stain',49,44,1.6,.5],['crack',12,16,1.1,.4]]){
      const g=new THREE.PlaneGeometry(size,size);g.rotateX(-Math.PI/2);g.rotateY(angle);
      g.translate(x,.008,z);(sets[type]||=[]).push(g);
    }
    for(const [x,z,angle]of [[10,16,.45],[49,13,Math.PI],[48.7,49.8,.1]]){
      const transform=new THREE.Matrix4().makeRotationY(angle).setPosition(x,0,z);
      const leak=new THREE.PlaneGeometry(.9,1.8);leak.translate(-.8,1.6,.105);leak.applyMatrix4(transform);(sets.leak||=[]).push(leak);
      const mould=new THREE.PlaneGeometry(1,.6);mould.translate(.6,.35,.11);mould.applyMatrix4(transform);(sets.mould||=[]).push(mould);
    }
    for(const [type,geometries]of Object.entries(sets)){
      const mesh=new THREE.Mesh(mergeGeometries(geometries,false),materials[type]);
      mesh.renderOrder=1;this.scene.add(mesh);geometries.forEach(g=>g.dispose());
    }
  }
  setLiftOpening(k) {
    const d=this.liftDoor;d.t=k;d.closed=k<1;
    for(const leaf of d.leaves)leaf.obj.position.x=leaf.base+leaf.s*k*.72;
    d.box=k>=.98?null:{minX:8.5-(1-k)*1.5,maxX:8.5+(1-k)*1.5,minZ:8.25,maxZ:8.55};
  }
  updateDoors() {} // The chapter sequence, not the hospital motor, drives leaves.
  floorAt(x,z) { return this.drained&&this.zones[Math.floor(z)*W+Math.floor(x)]===2?FLOOR.TILE:super.floorAt(x,z); }
}
