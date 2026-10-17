import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { echoMaterial } from './echo.js';
const V = (x,y,z) => new THREE.Vector3(x,y,z);
const add = (parent, geo, mat, p = [0,0,0], q = null) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(...p); if(q)m.quaternion.copy(q); parent.add(m); return m;
};
export function workMaterials(local = false) {
  const mats = {
    paint: echoMaterial({ map:'paint', scale:9, tint:0x72765a, boost:1.15 }),
    metal: echoMaterial({ map:'metal', scale:12, tint:0xb3a692, boost:1.1 }),
    rubber: echoMaterial({ map:'rubber', scale:14, tint:0x282a27, boost:1.05 }),
    ceramic: echoMaterial({ map:'plastic', scale:7, tint:0xe0d7bd, boost:1.15 }),
    fuel: echoMaterial({ map:'plastic', scale:5, tint:0xc6ac67, boost:1.15, wet:0.45 }),
  };
  for(const m of Object.values(mats)){m.uniforms.uLit.value=local?.16:.055;m.uniforms.uLocal.value=1;}
  if(local)mats.fuel.uniforms.uLit.value=.4;
  return mats;
}

export function createFuse(m) {
  const g = new THREE.Group(), q = new THREE.Quaternion().setFromAxisAngle(V(0,0,1),Math.PI/2);
  add(g,new THREE.CylinderGeometry(.027,.027,.125,20),m.ceramic,[0,0,0],q);
  for(const x of [-.072,.072]){
    add(g,new THREE.CylinderGeometry(.032,.032,.025,20),m.metal,[x,0,0],q);
    add(g,new THREE.BoxGeometry(.018,.018,.006),m.metal,[x,0,.029]);
  }
  add(g,new THREE.BoxGeometry(.045,.002,.026),m.rubber,[0,.027,0]);
  return g;
}

export function createFuelCan(m) {
  const g = new THREE.Group();
  add(g,new RoundedBoxGeometry(.23,.27,.125,3,.018),m.paint,[0,-.06,0]);
  add(g,new RoundedBoxGeometry(.20,.045,.11,2,.012),m.paint,[0,.082,0]);
  // Raised seam, pressed ribs, and an open handle that the fingers can enclose.
  for(const z of [-.064,.064]){
    for(const s of [-1,1]){const rib=add(g,new THREE.BoxGeometry(.012,.19,.005),m.paint,[s*.045,-.06,z]);rib.rotation.z=s*.5;}
  }
  for(const x of [-.055,.055])add(g,new THREE.CylinderGeometry(.011,.011,.07,12),m.paint,[x,.135,0]);
  const handle=add(g,new THREE.CylinderGeometry(.011,.011,.11,14),m.rubber,[0,.17,0]);handle.rotation.z=Math.PI/2;
  const axis=V(.65,.76,0).normalize(), q=new THREE.Quaternion().setFromUnitVectors(V(0,1,0),axis);
  add(g,new THREE.CylinderGeometry(.019,.023,.066,16),m.metal,[.12,.11,0],q);
  const spout=V(.12,.11,0).addScaledVector(axis,.033);
  g.cap=add(g,new THREE.CylinderGeometry(.024,.024,.018,18),m.rubber,spout.toArray(),q);
  g.spout=new THREE.Object3D();g.spout.position.copy(spout);g.add(g.spout);
  g.capHome=g.cap.position.clone();g.capAxis=axis;
  return g;
}

export class GeneratorProps {
  constructor(scene) {
    const m=workMaterials();this.group=new THREE.Group();scene.add(this.group);this.materials=m;
    this.sockets=[];this.fuses=[];
    for(let i=0;i<2;i++){
      const p=V(31.86+i*.28,1.43,8.94);this.sockets.push(p);
      const socket=add(this.group,new THREE.CylinderGeometry(.037,.037,.022,20),m.rubber,p.toArray());socket.rotation.x=Math.PI/2;
      const fuse=createFuse(m);fuse.position.copy(p);fuse.rotation.y=Math.PI/2;this.group.add(fuse);this.fuses.push(fuse);
    }
    this.funnel=V(31.82,1.12,9.01);
    add(this.group,new THREE.BoxGeometry(.3,.27,.14),m.paint,[31.82,.91,8.88]);
    add(this.group,new THREE.CylinderGeometry(.06,.02,.09,22,1,true),m.metal,[31.82,1.075,9.01]);
    this.can=createFuelCan(m);this.can.position.set(31.48,.65,9.16);this.group.add(this.can);
    add(this.group,new THREE.BoxGeometry(.33,.025,.36),m.metal,[31.48,.44,9.07]);
    this.lever=new THREE.Group();this.lever.position.set(32.43,1.0,8.96);this.group.add(this.lever);
    add(this.lever,new THREE.CylinderGeometry(.012,.012,.23,14),m.metal,[0,.115,0]);
    this.knob=add(this.lever,new THREE.CylinderGeometry(.022,.022,.13,16),m.rubber,[0,.23,0]);this.knob.rotation.z=Math.PI/2;
  }
  sync(flags,frame=null){
    this.fuses.forEach((o,i)=>o.visible=!!flags.powered||i<(flags.genInstalled||0));
    this.can.visible=!frame||!['uncap','pour','recap'].includes(frame.kind);
    const stroke=frame?.kind==='prime'?frame.time%1:0;
    const pull=THREE.MathUtils.smoothstep(stroke,.24,.62)*(1-THREE.MathUtils.smoothstep(stroke,.65,.96));
    this.lever.rotation.x=pull*.72;
    this.group.updateMatrixWorld(true);
  }
}
