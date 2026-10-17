import * as THREE from 'three';
import * as P from './props.js';
import { hospitalFrame } from './cave-style.js';

const V = (x,y,z) => new THREE.Vector3(x,y,z);
export const CAVE_MODEL_TYPES = ['traction-bed', 'suspended-bed', 'surgical-lamp', 'mineral-iv', 'dialysis-shrine', 'drain-pump', 'resonator', 'rib-arch', 'calcite-organ', 'collapsed-ward', 'ore-cart', 'cable-bundle'];

// Familiar hospital silhouettes continue below ground, with mineral growth and
// impossible placement carrying the change of location rather than a new style.
export function caveProp(B, type, x, y, z, angle = 0) {
  const F = B.at(x,y,z,angle), loose = { collide: false, walk: true };
  const box = (a,b,c,w,h,d,key,rot) => F.box(a,b,c,w,h,d,{...loose,key,rot});
  const cyl = (a,b,c,r,h,key,rot) => F.cyl(a,b,c,r,r,h,10,{...loose,key,rot});
  const rod = (a,b,r,key='copper') => {
    const p=V(...a), q=V(...b), d=q.clone().sub(p);
    const geo = new THREE.CylinderGeometry(r,r,d.length(),8);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),d.normalize()));
    F.geo(geo,...p.add(q).multiplyScalar(.5).toArray(),{...loose,key});
  };
  if (type === 'traction-bed' || type === 'suspended-bed') {
    P.bed(hospitalFrame(F),{messy:true});
    if(type==='suspended-bed') for(const a of [-.46,.46]) for(const c of [-.91,.91]) rod([a,1.35,c],[a*.8,5,c*.8],.012,'cable');
    else {
      rod([-.48,1.2,-.93],[-.48,2.3,-.93],.025);rod([-.48,2.3,-.93],[.48,2.3,.3],.025);
      cyl(.2,1.9,.05,.08,.3,'porcelain');
    }
  } else if(type==='surgical-lamp') {
    rod([0,0,0],[0,2.3,0],.035);rod([0,2.3,0],[.9,2.7,0],.04);rod([.9,2.7,0],[1.1,2.3,.2],.03);
    box(0,.1,0,.8,.12,.8,'corroded');
    F.geo(new THREE.SphereGeometry(.42,20,10,0,Math.PI*2,0,Math.PI/2),1.1,2.18,.2,{...loose,key:'enamel'});
    for(let k=0;k<6;k++){const a=k*Math.PI/3;cyl(1.1+Math.cos(a)*.25,2.15,.2+Math.sin(a)*.25,.065,.04,'calcite');}
  } else if(type==='mineral-iv') {
    P.ivStand(hospitalFrame(F));
    F.geo(new THREE.IcosahedronGeometry(.13,1),0,.09,0,{...loose,key:'calcite',scale:[1,.6,1]});
  } else if(type==='dialysis-shrine') {
    P.console_(hospitalFrame(F),.8);
    for(const a of [-.48,.48]){cyl(a,.85,0,.08,.75,'corroded');rod([a,.8,0],[a*1.3,.02,.45],.012,'cable');}
  } else if(type==='drain-pump') {
    box(0,.16,0,1.6,.3,1.1,'corroded');cyl(0,.65,0,.42,.85,'copper',[0,0,Math.PI/2]);
    box(.1,1.2,-.15,.6,.65,.4,'enamel');
    for(let k=0;k<7;k++)box(-.35+k*.1,.67,0,.025,.75,.85,'corroded');
    rod([-.9,.5,0],[-1.5,.5,0],.13);rod([-1.5,.5,0],[-1.5,0,0],.13);
  } else if(type==='resonator') {
    box(0,.12,0,1.8,.24,1.5,'sediment');box(0,1.05,0,.85,1.7,.5,'enamel');
    for(const a of [-.55,.55]){rod([a,1.1,0],[a,2.65,0],.06,'copper');}
    rod([-.55,2.65,0],[.55,2.65,0],.06,'copper');
    for(let k=0;k<9;k++)cyl(-.36+k*.09,1.25,0,.018,.9+Math.sin(k*.8)*.35,'porcelain');
    box(0,1.6,.28,.55,.26,.04,'mesh');
  } else if(type==='rib-arch') {
    for(let k=0;k<13;k++){
      const a=k*Math.PI/12,b=(k+1)*Math.PI/12;
      rod([Math.cos(a)*2.25,Math.sin(a)*3.1,0],[Math.cos(b)*2.25,Math.sin(b)*3.1,0],.075,'corroded');
      box(Math.cos(a)*2.25,Math.sin(a)*3.1,0,.16,.16,.18,'enamel',[0,0,a]);
    }
  } else if(type==='calcite-organ') {
    for(let k=0;k<11;k++){
      const h=1+Math.sin(k*1.71)**2*3.5;
      F.geo(new THREE.CylinderGeometry(.055,.11,h,9,4),k*.27-1.4,h/2,Math.sin(k)*.22,{...loose,key:k%3?'corroded':'calcite'});
      cyl(k*.27-1.4,h+.08,Math.sin(k)*.22,.07,.18,'copper');
    }
  } else if(type==='collapsed-ward') {
    box(0,1.5,0,3.85,3,.18,'wardwall');
    box(0,3.2,0,4,.18,1.4,'enamel',[0,0,.08]);
    for(let k=0;k<4;k++){box(k*.8-1.2,1.8,.2,.55,.8,.05,'mesh');box(k*.8-1.2,1.8,.25,.04,.84,.04,'copper');}
  } else if(type==='ore-cart') {
    box(0,.55,0,1.2,.7,1.6,'corroded');box(0,.92,0,1.05,.06,1.45,'gravel');
    for(const a of [-.65,.65])for(const c of [-.5,.5])cyl(a,.18,c,.18,.09,'copper',[0,0,Math.PI/2]);
  } else if(type==='cable-bundle') {
    for(let k=0;k<5;k++){
      const points=Array.from({length:15},(_,i)=>V(Math.sin(i*.5+k)*.12+k*.035,i*.25,Math.cos(i*.4+k)*.1));
      F.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.012,6,false),0,0,0,{...loose,key:k%2?'copper':'cable'});
    }
  }
}
