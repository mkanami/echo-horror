const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');

(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome',args:['--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.addInitScript(()=>localStorage.setItem('echo.quality','low'));
  const errors=[],missing=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(`${m.text()} ${m.location().url}`);});
  page.on('response',r=>{if(r.status()>=400)missing.push(`${r.status()} ${r.url()}`);});
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:4173/');
  await page.waitForFunction(()=>window.__game&&document.querySelector('#start').dataset.screen==='headphones',{timeout:120000});
  fs.mkdirSync(path.resolve('artifacts'),{recursive:true});
  console.log('loaded',await page.evaluate(()=>render_game_to_text()));
  const liftBefore=await page.evaluate(()=>{
    const g=window.__game,meshes=[];
    g.level.liftRoot.traverse(o=>{if(o.isMesh)meshes.push([o.uuid,o.geometry.uuid,o.material.uuid]);});
    return {root:g.level.liftRoot.uuid,meshes};
  });
  await page.locator('#enter-menu').click({force:true});
  await page.locator(process.env.LIFT_ONLY||process.env.BEDS_ONLY?'#play':'#chapter-two').click({force:true});
  await page.waitForFunction(()=>document.querySelector('#start').dataset.screen==='briefing',null,{timeout:120000});
  await page.locator('#begin-session').click({force:true});
  if(process.env.LIFT_ONLY||process.env.BEDS_ONLY){
    await page.waitForFunction(()=>window.__game.game.state==='play');
    if(process.env.BEDS_ONLY){
      const originalBed=await page.evaluate(()=>{
        const g=window.__game,p=g.player,it=g.level.items.find(it=>it.type==='locker'&&it.low);
        window.__freeze=true;window.requestAnimationFrame=()=>0;g.monster.despawn();
        p.reset(it.front,it.yaw+Math.PI);p.pitch=-.9;g.tick(3);
        const press=()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE'}));};
        press();g.tick(35);
        if(p.hidden!==it||g.camera.position.y>.4||g.vm.root.visible)throw new Error('Hospital bed hiding regressed');
        press();g.tick(35);
        if(p.hidden||p.pos.distanceTo(it.front)>.01||g.camera.position.y<1.5)throw new Error('Hospital bed exit regressed');
        return {enter:true,exit:true,lowCamera:true};
      });
      console.log('originalBed',JSON.stringify(originalBed));
    }
    const transition=await page.evaluate(()=>{
      const g=window.__game;window.__freeze=true;window.requestAnimationFrame=()=>0;
      g.player.reset({x:8.1,z:1.5},-Math.PI/2);g.game.flags.arrived=true;g.monster.despawn();
      g.level.setDoor('lift',true);g.level.updateDoors(2);
      const before=g.player.pos.clone();g.use(g.level.items.find(it=>it.type==='cab'));
      g.player.keys.add('KeyE');g.tick(100);g.player.keys.clear();
      const leaves=g.caveLevel.liftDoor.leaves;
      return {chapter:g.chapter.active,dx:g.player.pos.x-before.x,dz:g.player.pos.z-before.z,yaw:g.player.yaw,closed:Math.abs(Math.abs(leaves[0].obj.position.x-leaves[1].obj.position.x)-1.5)<1e-6};
    });
    console.log('transition',JSON.stringify(transition));
    if(!transition.chapter||!transition.closed||Math.abs(transition.dx-1)>.02||Math.abs(transition.dz-5.38)>.02)throw new Error('Original lift transition changed relative player position or left the hospital motor running');
  }
  await page.waitForFunction(()=>window.__game.chapter.active);
  const reused=await page.evaluate(before=>{
    const g=window.__game,meshes=[];
    g.caveLevel.liftRoot.traverse(o=>{if(o.isMesh)meshes.push([o.uuid,o.geometry.uuid,o.material.uuid]);});
    return {sameRoot:g.caveLevel.liftRoot===g.level.liftRoot&&before.root===g.caveLevel.liftRoot.uuid,sameMeshes:JSON.stringify(before.meshes)===JSON.stringify(meshes),sameDoors:g.caveLevel.liftDoor.leaves.every((leaf,i)=>leaf.obj===g.level.door('lift').leaves[i].obj)};
  },liftBefore);
  console.log('originalLift',JSON.stringify(reused));
  if(!reused.sameRoot||!reused.sameMeshes||!reused.sameDoors)throw new Error('The original lift asset was replaced or rebuilt');
  const style=await page.evaluate(()=>{
    const g=window.__game,luminous=[];
    g.chapter.root.traverse(o=>{
      if(!o.isMesh)return;
      for(const m of Array.isArray(o.material)?o.material:[o.material]){
        if(m.isMeshBasicMaterial&&m.color?.getHex()!==0||m.uniforms?.uLit?.value>0)luminous.push(o.uuid);
      }
    });
    const maps=new Set(Object.values(g.caveLevel.mat).map(m=>m.uniforms?.uTex?.value?.image?.src).filter(src=>src?.includes('/tex/cave/')));
    return {luminousWorldMeshes:luminous.length,newTextureSets:maps.size,separateTitle:!!document.querySelector('#chapter-title')};
  });
  console.log('style',JSON.stringify(style));
  if(style.luminousWorldMeshes||style.newTextureSets!==24||style.separateTitle)throw new Error('Chapter style differs from the hospital echo presentation or lost a new texture set');
  if(process.env.BEDS_ONLY){
    const beds=await page.evaluate(()=>{
      const g=window.__game,p=g.player,s=g.chapter.sequence,spots=g.caveLevel.items.filter(it=>it.type==='locker'&&it.low);
      window.__freeze=true;window.requestAnimationFrame=()=>0;
      s.phase='explore';s.opening=1;s.drained=false;g.chapter.applyState();g.chapter.spawned=true;g.monster.despawn();
      if(spots.length!==3||spots.some(it=>it.inside.y!==0))throw new Error('Suspended or wall beds became hiding places');
      const press=()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE'}));};
      const results=[];
      for(const it of spots){
        if(g.caveLevel.blockedPoint(it.front.x,it.front.z,.3)||g.caveLevel.isPit(it.front.x,it.front.z))throw new Error(`Unsafe exit at ${it.id}`);
        p.reset(it.front,it.yaw+Math.PI);p.pitch=-.9;g.tick(3);
        if(!document.querySelector('#prompt').textContent.includes('под кровать'))throw new Error(`Missing bed prompt at ${it.id}`);
        press();g.tick(35);
        if(p.hidden!==it||g.camera.position.y>.4||g.vm.root.visible||!document.querySelector('#slits').classList.contains('hidden'))throw new Error(`Low hiding view failed at ${it.id}`);
        if(document.querySelector('#prompt').textContent!=='[E] Вылезти')throw new Error('Hidden player lost the exit prompt');
        const inside=p.pos.clone();p.keys.add('KeyW');p.keys.add('KeyQ');g.tick(30);p.keys.clear();
        if(p.pos.distanceTo(inside)>1e-6||!p.holding)throw new Error('Hidden movement or breath holding differs from hospital behavior');
        p.look(9999,9999,.002);g.tick(1);
        if(Math.abs(p.yaw-it.yaw)>.451||Math.abs(p.pitch)>.351)throw new Error('Hiding look limits were lost');
        press();g.tick(40);
        if(p.hidden||p.pos.distanceTo(it.front)>.01||g.camera.position.y<1.5||!g.vm.root.visible||g.caveLevel.blockedPoint(p.pos.x,p.pos.z,.29))throw new Error(`Bed exit trapped the player at ${it.id}`);
        results.push({id:it.id,enter:true,exit:true,lowCamera:true,breathHold:true});
      }
      const it=spots[1];p.reset(it.front,it.yaw+Math.PI);p.pitch=-.9;g.tick(3);press();g.tick(35);
      p.keys.add('KeyQ');g.tick(2);
      g.monster.spawn(it.front,'sniff');g.monster.stateT=1.5;g.monster.suspicion=0;
      g.tick(35);
      if(g.game.state!=='play'||!p.hidden||g.monster.suspicion>.1)throw new Error('Held breath did not protect the hidden player');
      g.monster.stateT=1.5;g.monster.suspicion=.9;p.keys.delete('KeyQ');g.tick(10);
      if(g.monster.state!=='windup')throw new Error('A nearby suspicious monster cannot detect breathing under a cave bed');
      g.monster.despawn();press();g.tick(40);g.step(0);
      return {spots:results,suspendedBeds:g.caveLevel.modelCounts['suspended-bed'],wallBedsExcluded:true,monsterHearsBreathing:true};
    });
    console.log('caveBeds',JSON.stringify(beds));
    await page.screenshot({path:'artifacts/11-cave-beds.png'});
    if(errors.length||missing.length)throw new Error(JSON.stringify({errors,missing}));
    await browser.close();console.log('Hospital and cave bed hiding, safe exits, look, breathing and suspended-bed exclusion passed.');return;
  }
  if(process.env.VALVE_ONLY){
    const valve=await page.evaluate(()=>{
      const g=window.__game,s=g.chapter.sequence,p=g.player,wheel=g.caveLevel.valve;
      window.__freeze=true;window.requestAnimationFrame=()=>0;
      s.phase='explore';s.opening=1;s.drained=false;s.action=0;s.actionId=null;
      g.chapter.applyState();g.chapter.spawned=true;
      p.reset({x:13.5,z:25.5},Math.PI);g.tick(2);p.keys.add('KeyE');
      let samples=0,lastAngle=wheel.rotation.z,maxSlip=0,finalStep=0;
      for(let n=0;n<250;n++){
        g.tick(1);
        const turn=wheel.rotation.z-lastAngle;
        if(turn< -1e-7||turn>2/60+1e-7)throw new Error('Valve reversed or jumped away from the hand');
        if(s.drained){finalStep=turn;break;}
        if(g.vm.work?.kind!=='caveValve')throw new Error('Valve action lost its hand animation');
        const palm=g.vm.left.localToWorld(p.pos.clone().set(0,-.031,-.068));
        const rim=wheel.localToWorld(p.pos.clone().set(0,.2,0));
        const slip=palm.distanceTo(rim);maxSlip=Math.max(maxSlip,slip);
        if(slip>1e-5)throw new Error(`Hand rotates against the valve: ${slip}m slip`);
        lastAngle=wheel.rotation.z;samples++;
      }
      p.keys.clear();g.tick(10);
      if(!s.drained||Math.abs(wheel.rotation.z-8)>1e-7)throw new Error('Valve lost its final orientation');
      g.chapter.applyState();
      if(Math.abs(wheel.rotation.z-8)>1e-7)throw new Error('Checkpoint restore reset the valve orientation');
      g.step(0);
      return {samples,maxSlip,finalStep,angle:wheel.rotation.z,drained:s.drained};
    });
    console.log('valveSynchronization',JSON.stringify(valve));
    if(errors.length||missing.length)throw new Error(JSON.stringify({errors,missing}));
    await browser.close();console.log('Valve and hand rotate together through completion and checkpoint restore.');return;
  }
  if(process.env.LIFT_CONTROL_ONLY){
    const controls=await page.evaluate(()=>{
      const g=window.__game,p=g.player,s=g.chapter.sequence;
      window.__freeze=true;window.requestAnimationFrame=()=>0;
      if(s.phase!=='descent'||p.frozen)throw new Error('Elevator descent starts with controls locked');
      const start=p.pos.clone(),yaw=p.yaw,pitch=p.pitch;
      p.look(100,-60,.002);
      if(p.yaw===yaw||p.pitch===pitch)throw new Error('Mouse look is locked during descent');
      p.keys.add('KeyW');g.tick(20);p.keys.clear();
      const distance=p.pos.distanceTo(start);
      if(distance<.3||s.phase!=='descent')throw new Error('Cannot walk during descent');
      p.keys.add('KeyW');p.keys.add('KeyD');g.tick(180);p.keys.clear();
      if(p.pos.z>8.01||g.caveLevel.blockedPoint(p.pos.x,p.pos.z,.29))throw new Error('Player escaped the closed original elevator');
      g.tick(225);
      if(s.phase!=='stalled'||p.frozen)throw new Error('Controls are locked after the elevator stops');
      g.tick(130);
      const beforePry=p.yaw;p.look(80,40,.002);g.tick(1);
      if(s.phase!=='pry'||p.frozen||p.yaw===beforePry||p.lookTarget)throw new Error('Idle doors force the view before E is held');
      p.keys.add('KeyE');g.tick(50);
      if(!p.frozen||!p.lookTarget||!g.vm.work||s.opening<=0)throw new Error('Prying lost its stable two-handed pose');
      const lockedYaw=p.yaw;p.look(100,0,.002);
      if(p.yaw!==lockedYaw)throw new Error('Prying does not stabilize the camera');
      p.keys.clear();g.tick(1);
      const freeYaw=p.yaw;p.look(80,0,.002);
      if(p.frozen||p.yaw===freeYaw||p.lookTarget)throw new Error('Releasing E did not restore look controls');
      p.keys.add('KeyE');g.tick(240);p.keys.clear();
      if(s.phase!=='explore'||p.frozen||s.opening!==1)throw new Error('Original doors no longer open fully');
      p.keys.add('KeyW');g.tick(100);p.keys.clear();
      if(p.pos.z<9.5)throw new Error('Cannot exit after manual opening');
      g.step(0);
      return {walkedDuringDescent:distance,mouseLook:true,closedCabCollision:true,freeAfterStop:true,pryPose:true,releaseRestoresControls:true,exitZ:p.pos.z};
    });
    console.log('liftControls',JSON.stringify(controls));
    await page.screenshot({path:'artifacts/10-lift-controls.png'});
    if(errors.length||missing.length)throw new Error(JSON.stringify({errors,missing}));
    await browser.close();console.log('Elevator walking, mouse look, cab collision, manual opening and exit passed.');return;
  }
  await page.evaluate(()=>{window.__freeze=true;window.requestAnimationFrame=()=>0;window.__game.step(35);});
  await page.screenshot({path:'artifacts/01-descent.png'});
  const opening=await page.evaluate(()=>{
    const g=window.__game;g.game.state='play';g.step(545);
    const before=g.chapter.sequence.phase;
    g.player.keys.add('KeyE');g.step(140);
    const half={phase:g.chapter.sequence.phase,k:g.chapter.sequence.opening,left:g.vm.left.visible,right:g.vm.right.visible};
    return {before,half};
  });
  console.log('opening',JSON.stringify(opening));
  await page.screenshot({path:'artifacts/02-hands.png'});
  console.log('opened',await page.evaluate(()=>{const g=window.__game;g.step(145);g.player.keys.clear();return render_game_to_text();}));
  // Walk out using the actual player collision controller.
  const walked=await page.evaluate(()=>{
    const g=window.__game;g.player.keys.add('KeyW');g.step(100);g.player.keys.clear();
    return {x:g.player.pos.x,z:g.player.pos.z,blocked:g.caveLevel.blockedPoint(g.player.pos.x,g.player.pos.z,.29)};
  });
  console.log('walk',walked);
  if(walked.blocked||walked.z<9.5)throw new Error('Player could not walk out through the original lift doors');
  if(process.env.LIFT_ONLY){
    if(errors.length||missing.length)throw new Error(JSON.stringify({errors,missing}));
    await browser.close();console.log('Original lift transition, manual doors and exit passed.');return;
  }
  if(process.env.PIT_ONLY){
    const pursuit=await page.evaluate(()=>{
      const g=window.__game,results=[];g.chapter.spawned=true;
      const pairs=[[[25.5,27.5],[37.5,27.5]],[[37.5,27.5],[25.5,27.5]],[[31.5,21.5],[31.5,33.5]],[[31.5,33.5],[31.5,21.5]]];
      for(const [from,to]of pairs){
        g.player.reset({x:to[0],z:to[1]},0);
        g.monster.spawn(g.player.pos.clone().set(from[0],0,from[1]));g.monster.startChase();
        let frames=0;
        while(g.monster.pos.distanceTo(g.player.pos)>2.5&&frames<1200){
          const previous=g.monster.pos.clone();g.tick(1);frames++;
          if(g.caveLevel.isPit(g.monster.pos.x,g.monster.pos.z)||g.caveLevel.crossesPit(previous,g.monster.pos))throw new Error('Monster crossed the pit during pursuit');
          if(g.game.state!=='play'||g.monster.pos.y!==0)throw new Error('Pursuit left the ground or killed through the pit');
        }
        if(frames>=1200)throw new Error('Monster did not reach the opposite bank via a bypass');
        results.push({from,to,frames,distance:g.monster.pos.distanceTo(g.player.pos)});
      }
      g.monster.despawn();g.player.reset({x:26.4,z:27.5},-Math.PI/2);
      const deaths=g.game.deaths;
      g.player.keys.add('KeyW');let frames=0;
      while(!g.player.pitFall&&frames++<100)g.tick(1);
      g.player.keys.clear();
      if(!g.player.pitFall)throw new Error('Player was blocked at the pit lip');
      g.monster.onKill();
      if(g.game.state!=='play'||g.game.deaths!==deaths)throw new Error('Monster screamer replaced the fall');
      g.tick(18);const y=g.player.pos.y;
      if(y>=-.5||g.camera.position.y>=1)throw new Error('Camera did not descend with the body');
      g.game.state='paused';g.tick(120);
      if(g.player.pos.y!==y)throw new Error('Falling continued while paused');
      g.game.state='play';g.step(0);
      return {routes:results,fall:{x:g.player.pos.x,y,z:g.player.pos.z,deaths}};
    });
    console.log('pitPursuit',JSON.stringify(pursuit));
    await page.screenshot({path:'artifacts/08-pit-fall.png'});
    const death=await page.evaluate(()=>{
      const g=window.__game;g.tick(160);g.step(0);
      const result={mode:g.game.state,deaths:g.game.deaths,y:g.player.pos.y,tip:document.querySelector('#tip').textContent,visible:!document.querySelector('#death').classList.contains('hidden')};
      g.tick(300);
      if(result.mode!=='dead'||!result.visible||result.y!==-7||g.game.deaths!==result.deaths)throw new Error('Pit death did not latch exactly once');
      return result;
    });
    if(death.deaths!==pursuit.fall.deaths+1)throw new Error('Pit death was counted more than once');
    console.log('pitDeath',JSON.stringify(death));
    await page.screenshot({path:'artifacts/09-pit-death.png'});
    await page.locator('#retry').click({force:true});
    const retry=await page.evaluate(()=>{
      const g=window.__game;g.tick(30);g.step(0);
      return {mode:g.game.state,pitFall:!!g.player.pitFall,y:g.player.pos.y,cameraY:g.camera.position.y,opening:g.chapter.sequence.opening,safe:!g.caveLevel.isPit(g.player.pos.x,g.player.pos.z),loops:g.chapter.loops.length};
    });
    console.log('pitRetry',JSON.stringify(retry));
    if(retry.mode!=='play'||retry.pitFall||retry.y!==0||retry.cameraY<1.5||!retry.safe||retry.opening!==1||retry.loops!==3)throw new Error('Retry did not restore a safe cave checkpoint');
    if(errors.length||missing.length)throw new Error(JSON.stringify({errors,missing}));
    await browser.close();console.log('Pit pursuit, fatal fall, pause, single death and checkpoint retry passed.');return;
  }
  // Inspect authored vistas under a slow echo, using the original renderer.
  for(const [name,x,z,yaw,pitch]of [['03-receiver',12,14,-.7,-.15],['04-drain',12,24,Math.PI,-.1],['05-choir',25,26,-Math.PI/2,-.3],['06-ward',49,21,0,-.12]]){
    await page.evaluate(({x,z,yaw,pitch})=>{
      const g=window.__game;g.player.reset({x,z},yaw);g.player.pitch=pitch;g.game.state='play';
      g.echo.clear();g.echo.emit(g.player.pos.clone().setY(1.5),{radius:30,speed:40,strength:1.5,decay:.15});g.tick(55);
      // Camera cuts in this inspection must not retain another room's image.
      g.composer.passes.find(p=>p.uniforms?.damp).uniforms.damp.value=0;g.step(0);
    },{x,z,yaw,pitch});
    await page.screenshot({path:`artifacts/${name}.png`});
  }
  // Navigate to every action using the full collider-aware A* graph.
  console.log('routes',await page.evaluate(()=>{
    const g=window.__game;
    return g.caveLevel.stationItems.map(it=>({id:it.id,path:g.caveLevel.findPath({x:8.5,z:9.5},it.pos)?.length||0}));
  }));
  if(process.env.STYLE_ONLY){
    if(errors.length||missing.length)throw new Error(JSON.stringify({errors,missing}));
    await browser.close();console.log('Hospital style, new textures, original lift and cave vistas passed.');return;
  }
  // Reload from the actual persisted checkpoint, then verify Continue routes
  // into the cave and keeps the already opened door.
  await page.reload();
  await page.waitForFunction(()=>window.__game&&document.querySelector('#start').dataset.screen==='headphones');
  await page.locator('#enter-menu').click({force:true});
  await page.locator('#continue').click({force:true});
  await page.waitForFunction(()=>document.querySelector('#start').dataset.screen==='briefing');
  await page.locator('#begin-session').click({force:true});
  await page.waitForFunction(()=>window.__game.chapter.active);
  const restored=await page.evaluate(()=>{
    window.__freeze=true;window.requestAnimationFrame=()=>0;
    const g=window.__game;
    const home=g.player.pos.clone(),yaw=g.player.yaw;
    let probe=null;
    for(let z=1;z<55&&!probe;z++)for(let x=1;x<63&&!probe;x++){
      if(g.caveLevel.ceilAt(x,z)>=1.7&&g.level.ceilAt(x,z)<1.7)probe={x:x+.5,z:z+.5};
    }
    if(!probe)throw new Error('No independent chapter ceiling probe');
    g.player.reset(probe,0);g.player.crouch=true;
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyC'}));
    const stoodUp=!g.player.crouch;
    g.player.keys.clear();g.player.reset(home,yaw);
    return {phase:g.chapter.sequence.phase,opening:g.chapter.sequence.opening,world:g.player.level===g.caveLevel,stoodUp};
  });
  console.log('restore',JSON.stringify(restored));
  const complete=await page.evaluate(()=>{
    const g=window.__game, result=[];
    g.monster.despawn();g.chapter.spawned=true;
    for(const [id,duration]of [['valve',250],['resonator',190],['exit',130]]){
      const station=g.caveLevel.stationItems.find(it=>it.id===id),path=g.caveLevel.findPath(g.player.pos,station.pos);
      if(!path?.length)throw new Error(`No movement route to ${id}`);
      let frames=0;
      for(const point of path.slice(1)){
        while(Math.hypot(point.x-g.player.pos.x,point.z-g.player.pos.z)>.22){
          const dx=point.x-g.player.pos.x,dz=point.z-g.player.pos.z;
          g.player.yaw=Math.atan2(-dx,-dz);g.player.keys.add('KeyW');g.tick(1);g.player.keys.clear();
          if(++frames>5000)throw new Error(`Movement stuck en route to ${id} at ${g.player.pos.x}, ${g.player.pos.z}`);
        }
      }
      g.player.yaw=Math.atan2(g.player.pos.x-station.pos.x,g.player.pos.z-station.pos.z);
      g.player.pitch=0;g.tick(10);g.player.keys.add('KeyE');g.tick(duration);g.player.keys.clear();
      result.push({id,walkedFrames:frames,sequence:g.chapter.sequence.snapshot(),prompt:document.querySelector('#prompt').textContent,mode:g.game.state});
      if(id==='valve'){
        g.monster.onKill();g.tick(150);
        const died=g.game.state==='dead';document.querySelector('#retry').click();
        const restored=g.chapter.sequence.drained&&!g.chapter.sequence.tuned&&g.game.state==='play';
        if(!died||!restored||g.chapter.loops.length!==3)throw new Error('Cave death/retry did not preserve the drain checkpoint or duplicated audio loops');
        g.chapter.spawned=true;g.monster.despawn();
        result.push({deathRetry:true,drained:g.chapter.sequence.drained});
      }
    }
    g.step(0);
    return result;
  });
  console.log('complete',JSON.stringify(complete));
  console.log('errors',JSON.stringify(errors));console.log('missing',JSON.stringify(missing));
  await page.screenshot({path:'artifacts/07-end.png'});
  await browser.close();
  if(errors.length||missing.length||complete.at(-1).mode!=='end'||opening.before!=='pry'||restored.phase!=='explore'||restored.opening!==1||!restored.world||!restored.stoodUp)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
