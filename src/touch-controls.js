// Pointer capture keeps each thumb independent: moving, looking and holding E
// can overlap. Every exit path releases held keys, including interrupted touches.
export function createTouchControls({player,game,look,pause,closeNote,throwItem,siege,mapPoint}) {
  const root=document.getElementById('touch-controls');
  const rotate=document.getElementById('rotate-device');
  const coarse=matchMedia('(pointer: coarse)');
  let enabled=coarse.matches,mode='',stickId=null,lookId=null,lastLook=null;
  const symbols={
    KeyF:'M6 3l10 15M5 3h3M15 18l3 3M9 19l-2 2M18 13l3-1',
    KeyE:'M8 20V10a2 2 0 014 0v3-8a2 2 0 014 0v9l2-3a2 2 0 013 2l-3 7H8l-4-7a2 2 0 013-2l1 1',
    KeyQ:'M11 3v7L8 7C5 7 3 12 3 17s6 5 8 1M13 3v7l3-3c3 0 5 5 5 10s-6 5-8 1M8 21L20 3',
    KeyV:'M8 17c0 4 5 4 6 0 1-3 5-4 5-9a7 7 0 00-14 0M9 9a3 3 0 016 0c0 3-4 3-4 6M2 12v4M22 10v7',
    KeyC:'M11 5a2 2 0 104 0 2 2 0 00-4 0M13 9l-5 4 6 2 3 6M8 13l-3 7h6M12 10l5 3h4',
    ShiftLeft:'M13 4a2 2 0 104 0 2 2 0 00-4 0M14 8l-3 6 5 3 2 5M11 14l-4 6H3M12 10l-4-1-3 4M14 9l3 3h4',
    Tab:'M12 3v3M12 18v3M3 12h3M18 12h3M8 8l8 8M8 16l8-8',
    throw:'M3 19l5-3 3 4M8 16C5 2 18 1 20 11M17 8l3 3 2-4',
    pause:'M8 5v14M16 5v14',close:'M5 5l14 14M19 5L5 19',
    Digit4:'M3 13h3l3-7 5 14 3-9h4',
  };
  for(const button of root.querySelectorAll('button')){
    const name=button.dataset.key||button.dataset.action,label=button.textContent;
    if(symbols[name])button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${symbols[name]}"/></svg><span>${label}</span>`;
  }
  const pointers=new Map(),held=new Map();
  const stick=root.querySelector('.touch-stick'),thumb=root.querySelector('.touch-thumb');
  const key=(code,down)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));
  const release=()=>{
    for(const code of held.values())key(code,false);
    held.clear();pointers.clear();stickId=lookId=null;lastLook=null;
    player.touchMove={x:0,y:0};thumb.style.transform='translate(0,0)';
    root.querySelectorAll('.pressed').forEach(o=>o.classList.remove('pressed'));
  };
  const brief=document.getElementById('brief'),originalBrief=brief.innerHTML;
  const setEnabled=()=>{
    enabled=coarse.matches;document.body.classList.toggle('touch-device',enabled);release();
    brief.innerHTML=enabled?'<h4>ДОЖДИСЬ ЛИФТА</h4><p><b>1</b> — переход, <b>2</b> — люк, <b>3</b> — дверь слева. Закрыт один вход.</p><p>Упрись в заслонку лицом. У люка — <b>ТИХО</b>. В передышках открывай: привод восстановится. <b>ДАТЧИК</b> тратит питание.</p>':originalBrief;
    document.querySelector('#note .close').textContent=enabled?'Время идёт. Закрыть — кнопка справа сверху.':'[E] закрыть · время идёт';
  };
  coarse.addEventListener('change',setEnabled);setEnabled();
  const updateStick=(event)=>{
    const point=mapPoint(event),r=stick.getBoundingClientRect(),radius=r.width*.34;
    let x=(point.x-r.left-r.width/2)/radius,y=(point.y-r.top-r.height/2)/radius;
    const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
    player.touchMove={x:Math.abs(x)<.1?0:x,y:Math.abs(y)<.1?0:y};
    thumb.style.transform=`translate(${x*radius}px,${y*radius}px)`;
  };
  document.addEventListener('pointerdown',e=>{
    if(!enabled||!['play','note'].includes(game.state)||e.pointerType!=='touch')return;
    const point=mapPoint(e),hit=document.elementFromPoint(point.x,point.y);
    const button=hit?.closest('#touch-controls button');
    const onStick=hit?.closest('.touch-stick');
    if(button){
      e.preventDefault();e.stopImmediatePropagation();button.setPointerCapture(e.pointerId);pointers.set(e.pointerId,button);button.classList.add('pressed');
      const action=button.dataset.action,code=button.dataset.key;
      if(action==='pause')pause();else if(action==='close')closeNote();else if(action==='throw')throwItem();else if(code){held.set(e.pointerId,code);key(code,true);}
    }else if(onStick&&game.state==='play'&&stickId===null){
      e.preventDefault();e.stopImmediatePropagation();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e);
    }else if(game.state==='play'&&lookId===null){
      e.preventDefault();lookId=e.pointerId;lastLook={x:e.clientX,y:e.clientY};e.target.setPointerCapture?.(e.pointerId);
    }
  },true);
  document.addEventListener('pointermove',e=>{
    if(e.pointerId===stickId){e.preventDefault();updateStick(e);}
    else if(e.pointerId===lookId&&lastLook){e.preventDefault();look(e.clientX-lastLook.x,e.clientY-lastLook.y);lastLook={x:e.clientX,y:e.clientY};}
  },{passive:false,capture:true});
  const end=e=>{
    if(e.pointerId===stickId){stickId=null;player.touchMove={x:0,y:0};thumb.style.transform='translate(0,0)';}
    if(e.pointerId===lookId){lookId=null;lastLook=null;}
    const code=held.get(e.pointerId);if(code){key(code,false);held.delete(e.pointerId);}
    pointers.get(e.pointerId)?.classList.remove('pressed');pointers.delete(e.pointerId);
  };
  for(const name of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(name,end,true);
  root.addEventListener('click',e=>e.preventDefault());
  addEventListener('blur',release);addEventListener('resize',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  // The note itself scrolls naturally; game look does not run while reading it.
  let noteY=null;
  document.addEventListener('touchstart',e=>{if(enabled&&game.state==='note'&&!e.target.closest('#touch-controls'))noteY=e.touches[0]?.clientY;},{passive:true});
  document.addEventListener('touchmove',e=>{if(noteY===null||game.state!=='note')return;const y=e.touches[0]?.clientY;if(y===undefined)return;e.preventDefault();document.querySelector('#note .paper').scrollTop+=noteY-y;noteY=y;document.dispatchEvent(new Event('scroll'));},{passive:false});
  document.addEventListener('touchend',()=>noteY=null);
  return {
    get enabled(){return enabled;},release,
    update(){
      const portrait=enabled&&innerHeight>innerWidth;
      rotate.classList.toggle('hidden',!portrait);
      if(portrait&&game.state==='play')pause();
      if(mode!==game.state){mode=game.state;release();}
      root.classList.toggle('hidden',!enabled||portrait||!['play','note'].includes(mode));
      root.classList.toggle('reading',mode==='note');
      root.querySelector('.touch-siege').classList.toggle('hidden',!siege.active||mode!=='play');
      root.querySelector('[data-key="KeyC"]').classList.toggle('selected',player.crouch);
      for(const [code,active] of [['KeyQ',player.holding],['KeyV',player.listening]])root.querySelector(`[data-key="${code}"]`).classList.toggle('selected',!!active);
    },
  };
}
