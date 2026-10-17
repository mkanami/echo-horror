import * as THREE from 'three';
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const {smoothstep:ss,lerp}=THREE.MathUtils;
const grip=V(0,-.031,-.068);
const qAxis=(axis,angle)=>new THREE.Quaternion().setFromAxisAngle(axis,angle);
function handQ(fingers,back){const z=fingers.clone().normalize().negate(),y=back.clone().addScaledVector(z,-back.dot(z)).normalize(),x=new THREE.Vector3().crossVectors(y,z);return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));}
const wrist=(point,q,pose='fuseGrip')=>({pos:point.clone().sub(grip.clone().applyQuaternion(q)),q,pose});
const rest=V(-.24,-.48,-.24);

export const valveRotation = time => time * 2;

// Authored first-person keyframes. Props and palms are sampled from the same
// transform, so an object cannot move ahead of the fingers holding it.
export function sampleWork(frame,camInv){
  const {kind,k}=frame, target=frame.target.clone().applyMatrix4(camInv);
  const normal=(frame.normal||V(0,0,1)).clone().transformDirection(camInv);
  const up=V(0,1,0).transformDirection(camInv);
  if(kind==='pryLift'){
    const side=up.clone().cross(normal).normalize(),spread=.035+k*.72;
    const palms=[-1,1].map(sign=>{
      const q=handQ(up.clone(),normal.clone());
      return wrist(target.clone().addScaledVector(side,sign*spread).addScaledVector(normal,.045),q,k<.04?'edge':'flat');
    });
    return {left:palms[0],right:palms[1],stage:'створки'};
  }
  if(kind==='caveValve'){
    const side=up.clone().cross(normal).normalize();
    const q=handQ(up.clone(),normal.clone());
    const angle=valveRotation(frame.time);
    const at=target.clone().addScaledVector(side,Math.sin(angle)*.2).addScaledVector(up,Math.cos(angle)*.2);
    return {left:wrist(at,q,'handle'),right:wrist(target.clone().addScaledVector(side,.22),q,'flat'),stage:'контур'};
  }
  if(kind==='unscrew'||kind==='pickupFuse'){
    const mounted=kind==='unscrew',gripAt=mounted?.22:.34,pullAt=mounted?.64:.4;
    const twistT=THREE.MathUtils.clamp((k-.24)/.4,0,1);
    const cycle=twistT*2.5,phase=cycle%1;
    const stroke=ss(phase,0,.72)*(1-ss(phase,.78,1));
    const axis=mounted?normal:V(1,0,0);
    const base=new THREE.Quaternion().setFromUnitVectors(V(1,0,0),axis);
    const totalTurn=mounted?(Math.floor(cycle)+ss(phase,0,.72))*.85:0;
    const propQ=qAxis(axis,totalTurn).multiply(base);
    const q=qAxis(axis,mounted?stroke*.85:0).multiply(base);
    const pull=ss(k,pullAt,.84),away=ss(k,.91,1);
    const p=target.clone().addScaledVector(normal,ss(k,.57,.7)*.09).lerp(V(-.13,-.17,-.42),pull).add(V(0,-away*.48,away*.12));
    const regrip=mounted&&k>.24&&k<.64&&phase>.76;
    const left=wrist(p,q,k<gripAt?'open':regrip?'relaxed':'fuseGrip');
    left.pos.lerp(rest,1-ss(k,0,gripAt));
    return {left,fuse:{pos:p,q:propQ,visible:k>=gripAt&&k<.98},stage:mounted?'выкручивание':'подъём'};
  }
  if(kind==='insertFuse'){
    const q=new THREE.Quaternion().setFromUnitVectors(V(1,0,0),normal).multiply(qAxis(V(1,0,0),-ss(k,.56,.82)*.65));
    const p=rest.clone().add(grip.clone().applyQuaternion(q)).lerp(V(-.15,-.18,-.38),ss(k,0,.18)).lerp(target.clone().addScaledVector(normal,.14),ss(k,.2,.5));
    p.addScaledVector(normal,-ss(k,.5,.82)*.14);
    const left=wrist(p,q);left.pos.lerp(rest,ss(k,.83,1));
    return {left,fuse:{pos:p,q,visible:k<.82},stage:`установка ${frame.slot+1}`};
  }
  if(['uncap','pour','recap'].includes(kind)){
    const pouring=kind==='pour';
    const tilt=pouring?ss(k,0,.23)*(1-ss(k,.82,1)):0;
    const q=qAxis(V(0,0,1),-tilt*1.85).multiply(qAxis(V(1,0,0),tilt*.12));
    const spout=V(.1415,.135,0);
    const base=V(-.08,-.2,-.56),over=target.clone().addScaledVector(up,.17).add(V(0,0,.025)).sub(spout.clone().applyQuaternion(q));
    const p=base.clone().lerp(over,tilt);
    const pocket=rest.clone().sub(V(0,.17,0)).add(grip.clone().applyQuaternion(handQ(V(.15,0,-1),V(0,1,.1))));
    if(kind==='uncap')p.lerp(pocket,1-ss(k,0,.28));
    if(kind==='recap')p.lerp(pocket,ss(k,.72,1));
    const lq=q.clone().multiply(handQ(V(.15,0,-1),V(0,1,.1)));
    const supportQ=q.clone().multiply(handQ(V(1,.1,-.25),V(0,-1,.12)));
    const lAnchor=V(0,.17,0).lerp(V(-.035,-.195,.02),tilt);
    const left=wrist(lAnchor.applyQuaternion(q).add(p),lq.slerp(supportQ,tilt),tilt>.5?'open':'handle');
    let right;
    const capAway=kind==='uncap'?ss(k,.55,.9):kind==='recap'?1-ss(k,.1,.5):1;
    const capP=spout.clone().addScaledVector(V(.65,.76,0).normalize(),capAway*.075).applyQuaternion(q).add(p);
    if(!pouring){
      const twist=(kind==='uncap'?1:-1)*ss(k,.28,.62)*1.6;
      const rq=q.clone().multiply(handQ(V(-.85,.1,-.2),V(.1,.4,1))).multiply(qAxis(V(0,0,1),twist));
      right=wrist(capP,rq,'fuseGrip');
    }else{
      const capQ=q.clone().multiply(handQ(V(-.85,.1,-.2),V(.1,.4,1))).multiply(qAxis(V(0,0,1),1.6*(1-ss(k,.6,.85))));
      const rq=capQ.slerp(q.clone().multiply(handQ(V(-.15,0,-1),V(0,1,.1))),tilt);
      const anchor=spout.clone().addScaledVector(V(.65,.76,0).normalize(),.075).lerp(V(0,.17,0),tilt);
      right=wrist(anchor.applyQuaternion(q).add(p),rq,'handle');
    }
    return {left,right,can:{pos:p,q,capAway,capVisible:!pouring,flow:pouring?ss(k,.2,.28)*(1-ss(k,.78,.86)):0,end:target},stage:kind};
  }
  if(kind==='prime'){
    const q=new THREE.Quaternion().setFromUnitVectors(V(1,0,0),V(1,0,0).transformDirection(camInv));
    const right=wrist(target,q,'handle'),rightRest=V(.24,-.48,-.24);
    right.pos.lerp(rightRest,1-ss(frame.time,0,.24));
    right.pos.lerp(rightRest,ss(frame.time,4.82,5));
    return {left:{pos:rest.clone(),q:handQ(V(.15,0,-1),V(0,1,.1)),pose:'relaxed'},right,stage:`качок ${Math.min(5,Math.floor(frame.time)+1)}`};
  }
  return null;
}
