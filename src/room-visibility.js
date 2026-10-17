// Conservative 2D portal visibility through the carved level. Height, doors and
// props never close a portal here: they still render/occlude normally. This only
// rejects entire static batches hidden by the permanent floor-plan walls.
export class RoomVisibility {
  constructor(level, objects) {
    this.level=level;this.objects=objects;this.lastX=Infinity;this.lastZ=Infinity;
    this.cells=new Uint8Array(64*56);this.enabled=true;
    this.stats={visible:0,total:objects.length};
  }
  update(camera) {
    if(!this.enabled){this.objects.forEach(o=>o.visible=true);return;}
    const {x,z}=camera.position;
    if(Math.abs(x-this.lastX)<1e-6&&Math.abs(z-this.lastZ)<1e-6)return;
    this.lastX=x;this.lastZ=z;this.cells.fill(0);
    const sx=Math.floor(x),sz=Math.floor(z);
    if(!this.level.open(sx,sz)){this.objects.forEach(o=>o.visible=true);return;}
    const coverage=new Map(),queue=[[sx,sz,-Math.PI,Math.PI]];
    const angular=(ax,az,bx,bz)=>{
      // Crossings directly beneath the camera must stay open in every direction.
      if(Math.hypot(ax-x,az-z)<1e-5||Math.hypot(bx-x,bz-z)<1e-5)return [[-Math.PI,Math.PI]];
      let a=Math.atan2(az-z,ax-x),b=Math.atan2(bz-z,bx-x);
      if(a>b)[a,b]=[b,a];
      return b-a>Math.PI?[[-Math.PI,a],[b,Math.PI]]:[[a,b]];
    };
    for(let index=0;index<queue.length;index++){
      const [cx,cz,lo,hi]=queue[index];if(cx<0||cx>=64||cz<0||cz>=56)continue;
      const key=cz*64+cx;this.cells[key]=1;
      if(!this.level.open(cx,cz))continue;
      const covered=coverage.get(key)||[];
      let pending=[[lo,hi]];
      for(const [a,b]of covered){const next=[];for(const [l,h]of pending){if(b<=l||a>=h)next.push([l,h]);else{if(l<a)next.push([l,a]);if(h>b)next.push([b,h]);}}pending=next;}
      if(!pending.length)continue;
      covered.push(...pending);coverage.set(key,covered);
      // Cell edges are portals. Intersect their angular windows with the
      // incoming window; turning around an opaque corner cannot widen it.
      for(const [nx,nz,ax,az,bx,bz]of [
        [cx-1,cz,cx,cz,cx,cz+1],[cx+1,cz,cx+1,cz,cx+1,cz+1],
        [cx,cz-1,cx,cz,cx+1,cz],[cx,cz+1,cx,cz+1,cx+1,cz+1],
      ])for(const [a,b]of angular(ax,az,bx,bz))for(const [l,h]of pending){const low=Math.max(l,a),high=Math.min(h,b);if(high-low>1e-7)queue.push([nx,nz,low,high]);}
    }
    let visible=0;
    for(const obj of this.objects){
      const b=obj.geometry.boundingBox;
      let seen=false;
      // One-cell halo keeps coplanar wall faces, protrusions and doorway trim.
      for(let rz=Math.max(0,Math.floor(b.min.z)-1);rz<=Math.min(55,Math.floor(b.max.z)+1)&&!seen;rz++)for(let rx=Math.max(0,Math.floor(b.min.x)-1);rx<=Math.min(63,Math.floor(b.max.x)+1);rx++)if(this.cells[rz*64+rx]){seen=true;break;}
      obj.visible=seen;if(seen)visible++;
    }
    this.stats.visible=visible;
  }
}
