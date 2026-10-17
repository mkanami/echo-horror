// Game-time state only: pausing never consumes the descent or a held action.
export class CaveSequence {
  constructor(saved = {}) {
    this.phase=saved.phase||'descent';this.time=0;
    this.opening=saved.opening||0;this.drained=!!saved.drained;
    this.tuned=!!saved.tuned;this.action=0;this.actionId=null;
  }
  advance(dt, held = false, target = null) {
    if(!Number.isFinite(dt)||dt<0)return [];
    const events=[];
    this.time+=dt;
    if(this.phase==='descent'&&this.time>=7){this.phase='stalled';this.time=0;events.push('crash');}
    else if(this.phase==='stalled'&&this.time>=2){this.phase='pry';this.time=0;events.push('pry');}
    if(this.phase==='pry'){
      // A ratchet holds completed movement; releasing E withdraws the hands.
      if(held&&target==='doors')this.opening=Math.min(1,this.opening+dt/4.5);
      if(this.opening>=1){this.phase='explore';this.time=0;events.push('opened');}
    }else if(this.phase==='explore'){
      const duration={valve:4,resonator:3,exit:2}[target];
      const allowed=target==='valve'?!this.drained:target==='resonator'?this.drained&&!this.tuned:target==='exit'?this.drained&&this.tuned:false;
      if(!held||!allowed){this.action=0;this.actionId=null;}
      else {
        if(this.actionId!==target)this.action=0;
        this.actionId=target;this.action+=dt;
        if(this.action>=duration){
          this.action=0;this.actionId=null;
          if(target==='valve')this.drained=true;
          if(target==='resonator')this.tuned=true;
          if(target==='exit')this.phase='complete';
          events.push(target);
        }
      }
    }
    return events;
  }
  snapshot(){return {phase:this.phase,opening:this.opening,drained:this.drained,tuned:this.tuned};}
}
