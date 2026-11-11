import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const shell = $('game-shell');
const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x89908a);
scene.fog = new THREE.FogExp2(0x7d8378, 0.021);
const camera = new THREE.PerspectiveCamera(73, innerWidth / innerHeight, 0.08, 100);
camera.position.set(0, 1.72, 7.5);
scene.add(camera);
const clock = new THREE.Clock();
const hemi = new THREE.HemisphereLight(0xbcc9c1, 0x34362b, 1.65);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffdfae, 3.2);
sun.position.set(-12, 19, 9); sun.castShadow = true;
sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
sun.shadow.camera.left = -34; sun.shadow.camera.right = 34; sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.035;
scene.add(sun);
const moonFill = new THREE.DirectionalLight(0x9cadbd, 1.1); moonFill.position.set(15, 8, -15); scene.add(moonFill);
const world = new THREE.Group(); scene.add(world);
const colliders = [];
const enemies = [];
const tracers = [];
let running = false, ended = false, health = 100, ammo = 30, reserve = 120, kills = 0;
let yaw = 0, pitch = 0, lastDamage = -99, reloadUntil = 0, lastShot = -99, recoil = 0, shake = 0;
let moveX = 0, moveY = 0, triggerDown = false, lookPointer = null;

function mat(color, roughness=0.85, metalness=0){ return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
function box(parent, name, size, material, pos, cast=true, receive=true){
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.name = name;
  mesh.position.set(...pos); mesh.castShadow = cast; mesh.receiveShadow = receive; parent.add(mesh); return mesh;
}
function cylinder(parent, radiusTop, radiusBottom, height, material, pos, segments=12, axis='y'){
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop,radiusBottom,height,segments),material);
  mesh.position.set(...pos); if(axis==='z') mesh.rotation.x=Math.PI/2; mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function makeTexture(base, accent, seed=3){
  const c=document.createElement('canvas'); c.width=256;c.height=256;const x=c.getContext('2d');
  x.fillStyle=base;x.fillRect(0,0,256,256);let n=seed;
  for(let i=0;i<1800;i++){n=(n*1664525+1013904223)>>>0;const px=n%256;n=(n*1664525+1013904223)>>>0;const py=n%256;const a=.025+((n>>>8)%30)/1000;x.fillStyle=`rgba(${accent},${a})`;x.fillRect(px,py,1+(n%4),1+(n%3));}
  for(let i=0;i<15;i++){n=(n*1664525+1013904223)>>>0;const yy=n%256;x.fillStyle=`rgba(18,20,16,${.04+(n%8)/100})`;x.fillRect(0,yy,256,1+(n%5));}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
}
const groundTexture=makeTexture('#777567','215,211,183',9);groundTexture.repeat.set(18,22);
const groundMat=new THREE.MeshStandardMaterial({map:groundTexture,roughness:1});
box(world,'dusty ground',[100,.25,100],groundMat,[0,-.16,-15],false,true);
const concrete=mat(0x77776b), stucco=new THREE.MeshStandardMaterial({color:0xb1a78e,map:makeTexture('#a89d83','225,218,191',27),roughness:.96});
const darkConcrete=mat(0x4c514b), rust=mat(0x665848), sandbag=mat(0x77765d), darkMetal=mat(0x242a27,.68,.62), metal=mat(0x525a54,.5,.75);
const warm= new THREE.PointLight(0xffa45a,17,18,2); warm.position.set(-5,5,-12);scene.add(warm);
const lamp= new THREE.PointLight(0xf9d99b,12,16,2);lamp.position.set(7,4,-21);scene.add(lamp);
function addBoxCollider(mesh){const p=mesh.position;const s=mesh.geometry.parameters;colliders.push({x:p.x,z:p.z,hx:s.width/2,hz:s.depth/2});}
// Compound walls and weathered architecture.
box(world,'left perimeter wall',[.7,5,45],stucco,[-18,2.4,-13]);
box(world,'right perimeter wall',[.7,5,45],stucco,[18,2.4,-13]);
box(world,'rear perimeter wall',[36,5,.7],stucco,[0,2.4,-35]);
box(world,'warehouse',[12,8,7],darkConcrete,[-9,3.8,-28]);
box(world,'warehouse roof',[12.5,.4,7.5],rust,[-9,7.95,-28]);
box(world,'warehouse loading door',[4,4,.12],mat(0x343b37),[-9,2,-24.42],false);
box(world,'warehouse awning',[6,.22,1.5],rust,[-9,4.35,-23.3]);
for(let i=0;i<3;i++){box(world,'door rib',[.13,3.8,.12],metal,[-11.05+i*2.05,2,-24.32],false);}
box(world,'control building',[8,7,8],stucco,[12,3.3,-29]);
box(world,'control roof',[8.7,.35,8.5],darkConcrete,[12,6.95,-29]);
box(world,'window',[.13,1.1,2.8],mat(0x313a3a,.35),[7.94,4.6,-29]);
box(world,'window',[.13,1.1,2.8],mat(0x313a3a,.35),[7.94,4.6,-25.5]);
// Container stack with corrugated ribs.
function container(x,z,color){
 const group=new THREE.Group();group.position.set(x,0,z);world.add(group);const body=box(group,'shipping container',[6,3,7],mat(color,.86,.24),[0,1.5,0]);
 for(let i=-5;i<=5;i++){box(group,'container corrugation',[.07,2.84,.07],mat(new THREE.Color(color).multiplyScalar(i%2?1.15:.8)),[i*.51,1.5,3.54],false);}
 for(const y of [.12,2.88])for(const xx of [-2.9,2.9])box(group,'corner casting',[.19,.2,.2],metal,[xx,y,3.55],false);
 colliders.push({x,z,hx:3.05,hz:3.55});
}
container(-10,-13,0x59645b);container(10,-11,0x665a48);container(1,-27,0x56605a);
// Protective barriers and sandbag cover.
function barrier(x,z,length=4){const m=box(world,'blast barrier',[length,1.25,.8],concrete,[x,.64,z]);addBoxCollider(m);for(let xx=-length/2+.18;xx<length/2;xx+=.5)box(world,'barrier seam',[.035,1.22,.81],darkConcrete,[x+xx,.64,z],false);}
barrier(-3,-8,4);barrier(5,-16,5);barrier(-6,-21,4);barrier(13,-6,3);
for(let i=0;i<5;i++){const m=cylinder(world,.34,.42,.55,sandbag,[-14+i*.55,.36,-5],8);m.rotation.z=Math.PI/2;}
// scattered drums, crates, cable spools and debris.
function crate(x,y,z,scale=1){const group=new THREE.Group();group.position.set(x,y,z);world.add(group);box(group,'crate body',[1.1*scale,.9*scale,1*scale],mat(0x62563f),[0,.45*scale,0]);for(let a=-1;a<=1;a++)box(group,'crate plank',[.04,.82*scale,1.02*scale],mat(0x877653),[a*.34*scale,.45*scale,.02],false);box(group,'crate top',[1.13*scale,.06,1.03*scale],mat(0x756344),[0,.91*scale,0]);colliders.push({x,z,hx:.6*scale,hz:.55*scale});}
crate(-14,0,-12,.85);crate(8,0,-7,.9);crate(14,0,-16,.9);crate(-2,0,-25,.8);
for(const [x,z] of [[-13,-19],[14,-10],[3,-24]]){cylinder(world,.48,.48,1.2,rust,[x,.62,z],16);cylinder(world,.49,.49,.08,metal,[x,1.19,z],16);cylinder(world,.49,.49,.08,metal,[x,.06,z],16);}
// Distant low skyline and antennas.
for(let i=0;i<12;i++){const x=-28+i*5.2;const h=5+(i*7%8);box(world,'distant blocks',[4,h,4],mat(i%2?0x777a72:0x626963),[x,h/2,-45],false);}
for(const [x,z] of [[-9,-28],[12,-29]]){cylinder(world,.06,.09,3,darkMetal,[x,9.3,z],8);for(let y=9;y<11;y+=.5)box(world,'antenna rung',[.45,.035,.035],metal,[x,y,z],false);}
// Procedural foggy searchlight shafts.
function beam(x,z){const g=new THREE.Mesh(new THREE.ConeGeometry(2.4,11,24,1,true),new THREE.MeshBasicMaterial({color:0xffe6b1,transparent:true,opacity:.055,depthWrite:false,side:THREE.DoubleSide}));g.position.set(x,6,z);g.rotation.x=Math.PI;world.add(g);}
beam(-5,-15);beam(8,-25);

// A custom low-profile service rifle, attached to the camera as a detailed first-person prop.
const gun=new THREE.Group();camera.add(gun);gun.visible=false;gun.scale.setScalar(.76);gun.position.set(.38,-.39,-.63);gun.rotation.set(-.04,-.025,-.02);
const polymer=mat(0x252b28,.72,.1), gunMetal=mat(0x444c48,.43,.78), edgeMetal=mat(0x69716a,.36,.78), rubber=mat(0x171b19,.95);
box(gun,'upper receiver',[.19,.13,.62],gunMetal,[0,0,-.28]);box(gun,'lower receiver',[.18,.16,.34],polymer,[0,-.12,-.22]);
box(gun,'handguard',[.22,.16,.54],polymer,[0,.005,-.69]);box(gun,'barrel',[.075,.075,.63],gunMetal,[0,.02,-1.2]);cylinder(gun,.055,.07,.17,edgeMetal,[0,.02,-1.56],12,'z');
box(gun,'stock',[.17,.17,.48],polymer,[0,-.04,.3]);box(gun,'stock pad',[.18,.19,.09],rubber,[0,-.04,.55]);
box(gun,'pistol grip',[.13,.24,.14],rubber,[0,-.25,-.11]).rotation.x=-.22;
box(gun,'magazine',[.14,.33,.2],polymer,[0,-.32,-.28]).rotation.x=-.12;
box(gun,'rail',[.09,.035,.78],gunMetal,[0,.11,-.65]);
for(let i=0;i<7;i++)box(gun,'rail slot',[.24,.018,.025],edgeMetal,[0,.105,-.43-i*.09],false);
box(gun,'optic mount',[.12,.08,.2],polymer,[0,.18,-.34]);box(gun,'optic',[.13,.13,.21],gunMetal,[0,.27,-.34]);cylinder(gun,.045,.045,.02,mat(0x5c7878,.15,.7),[0,.27,-.45],16,'z');
for(const z of [-.54,-.7,-.86,-1.02])box(gun,'handguard vent',[.226,.025,.035],rubber,[0,.04,z],false);
box(gun,'front sight',[.035,.13,.035],gunMetal,[0,.14,-1.3]);
const flash=new THREE.PointLight(0xffb866,0,4,2);flash.position.set(0,.01,-1.61);gun.add(flash);
const flashMesh=new THREE.Mesh(new THREE.ConeGeometry(.15,.43,8),new THREE.MeshBasicMaterial({color:0xffc15c,transparent:true,opacity:0}));flashMesh.rotation.x=-Math.PI/2;flashMesh.position.set(0,.01,-1.78);gun.add(flashMesh);

function makeEnemy(x,z,index){
 const root=new THREE.Group();root.position.set(x,0,z);world.add(root);root.userData={index,alive:true,hp:100,attack:1.2+Math.random()*1.8,phase:Math.random()*6,homeX:x,homeZ:z};
 const gear=mat([0x343c35,0x3e4035,0x454239,0x303a38,0x4a4435][index%5]);const pants=mat(index%2?0x383c34:0x4a4437);const skin=mat(0x92725a);const web=mat(0x252a25);const band=mat(0x88794d);const boot=mat(0x242722);
 const torso=box(root,'torso',[.62,.76,.34],gear,[0,1.23,0]);torso.userData.enemy=root;
 const vest=box(root,'plate carrier',[.66,.47,.12],web,[0,1.31,-.2]);vest.userData.enemy=root;
 for(let k=0;k<3;k++)box(root,'mag pouch',[.13,.18,.1],band,[-.2+k*.2,1.16,-.28],false);
 const head=cylinder(root,.17,.2,.28,skin,[0,1.79,0],12);head.userData.enemy=root;
 const helmet=cylinder(root,.205,.18,.15,web,[0,1.94,0],12);helmet.userData.enemy=root;
 box(root,'helmet brim',[.36,.055,.28],web,[0,1.89,-.06]).userData.enemy=root;
 for(const side of [-1,1]){
  const arm=box(root,'sleeve',[.2,.55,.23],gear,[side*.43,1.31,-.02]);arm.rotation.z=side*-.13;arm.userData.enemy=root;
  const hand=box(root,'glove',[.16,.14,.16],skin,[side*.48,1.02,-.1]);hand.userData.enemy=root;
  const leg=box(root,'leg',[.23,.7,.27],pants,[side*.18,.47,.04]);leg.userData.enemy=root;
  box(root,'knee pad',[.25,.18,.07],web,[side*.18,.48,-.12]).userData.enemy=root;
  box(root,'combat boot',[.25,.14,.39],boot,[side*.18,.09,-.02]).userData.enemy=root;
 }
 // Distinct rifle held across chest, with visible stock and muzzle.
 box(root,'enemy rifle',[.12,.12,.8],darkMetal,[.33,1.13,-.31]).rotation.x=-.14;
 box(root,'enemy stock',[.12,.13,.24],polymer,[.18,1.18,-.05]);box(root,'enemy magazine',[.09,.19,.12],polymer,[.33,.98,-.25]);
 root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 enemies.push(root);return root;
}
const enemySpawns=[[-9,-9],[-1,-14],[9,-19],[-11,-26],[13,-26]];
enemySpawns.forEach((p,i)=>makeEnemy(p[0],p[1],i));

const raycaster=new THREE.Raycaster();raycaster.far=65;
function showToast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.classList.remove('show'),1700);}
function updateHUD(){ const shownHealth=Math.round(health);$('ammo-current').textContent=String(ammo).padStart(2,'0');$('ammo-reserve').textContent=String(reserve).padStart(3,'0');$('health-value').textContent=shownHealth;$('health-bar').style.width=shownHealth+'%';$('health-bar').style.background=shownHealth<30?'#cf735b':'#a6be81';$('objective-detail').textContent=`Neutralize hostiles · ${kills} / ${enemies.length}`; }
function fire(){
 const now=clock.elapsedTime;if(!running||ended||now-lastShot<.12||now<reloadUntil)return;
 if(ammo<=0){if(reserve>0)reload();else showToast('NO AMMUNITION');return;}
 lastShot=now;ammo--;recoil=Math.min(recoil+.065,.15);shake=.02;flash.intensity=25;flashMesh.material.opacity=.95;setTimeout(()=>{flash.intensity=0;flashMesh.material.opacity=0},48);
 $('reticle').classList.add('firing');setTimeout(()=>$('reticle').classList.remove('firing'),65);
 raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
 const targets=[];for(const e of enemies)if(e.userData.alive)e.traverse(o=>{if(o.isMesh)targets.push(o)});
 const hits=raycaster.intersectObjects(targets,false);
 if(hits.length){const target=hits[0].object.userData.enemy;if(target?.userData.alive){
   target.userData.hp-=Math.random()<.2?68:42;
   const marker=$('hit-marker');marker.classList.add('show');setTimeout(()=>marker.classList.remove('show'),120);
   if(target.userData.hp<=0){target.userData.alive=false;kills++;target.userData.deathAt=now;target.userData.deathDirection=(target.position.x-camera.position.x)>0?1:-1;showToast(kills===enemies.length?'COMPOUND SECURED':'HOSTILE NEUTRALIZED');if(kills===enemies.length)setTimeout(completeMission,1300);}
 }}
 updateHUD();
}
function reload(){if(!running||reloadUntil>clock.elapsedTime||ammo===30||reserve<=0)return;reloadUntil=clock.elapsedTime+1.25;$('reload-indicator').classList.add('show');setTimeout(()=>{$('reload-indicator').classList.remove('show');if(running){const count=Math.min(30-ammo,reserve);ammo+=count;reserve-=count;updateHUD();}},1250);}
function completeMission(){if(ended)return;ended=true;running=false;$('result-hits').textContent=String(kills).padStart(2,'0');$('result-health').textContent=health+'%';$('result-screen').classList.remove('hidden');document.exitPointerLock?.();}
function damage(){if(!running||ended)return;health=Math.max(0,health-7);lastDamage=clock.elapsedTime;$('damage-flash').classList.add('show');setTimeout(()=>$('damage-flash').classList.remove('show'),180);updateHUD();if(health<=0){health=0;updateHUD();running=false;showToast('OPERATOR DOWN');setTimeout(()=>{ended=true;$('result-panel')?.classList; $('result-screen').classList.remove('hidden');document.querySelector('.result-panel h2').innerHTML='MISSION<br><em>FAILED</em>';document.querySelector('.result-panel p').innerHTML='Operator down. The compound remains hostile.';$('again-button').querySelector('span').textContent='REDEPLOY';},1000);}}
function makeTracer(from,to,color=0xffad6a){const g=new THREE.BufferGeometry().setFromPoints([from,to]);const m=new THREE.LineBasicMaterial({color,transparent:true,opacity:.9});const line=new THREE.Line(g,m);scene.add(line);tracers.push({line,at:clock.elapsedTime});}
function enemyFire(enemy){const start=enemy.position.clone().add(new THREE.Vector3(0,1.3,0));const end=camera.position.clone().add(new THREE.Vector3((Math.random()-.5)*1.8,(Math.random()-.5)*1.2,0));makeTracer(start,end,0xe68c55);if(Math.random()<.36)damage();}

const keys=new Set();window.addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='KeyR'){e.preventDefault();reload();}if(e.code==='Escape'){e.preventDefault();if(running)pauseGame();else if(!$('pause-screen').classList.contains('hidden'))resumeGame();}});
window.addEventListener('keyup',e=>keys.delete(e.code));
function startGame(){if(ended){location.reload();return;}running=true;gun.visible=true;$('intro-screen').classList.add('hidden');$('pause-screen').classList.add('hidden');$('result-screen').classList.add('hidden');$('hud').classList.add('active');if(!mobile)canvas.requestPointerLock?.();}
function pauseGame(){if(!running)return;running=false;gun.visible=false;$('pause-screen').classList.remove('hidden');document.exitPointerLock?.();}
function resumeGame(){if(ended)return;running=true;gun.visible=true;$('pause-screen').classList.add('hidden');if(!mobile)canvas.requestPointerLock?.();}
$('start-button').addEventListener('click',startGame);$('resume-button').addEventListener('click',resumeGame);$('again-button').addEventListener('click',()=>location.reload());
document.addEventListener('pointerlockchange',()=>{if(!mobile&&running&&document.pointerLockElement!==canvas)pauseGame();});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&running){yaw-=e.movementX*.0022;pitch-=e.movementY*.0022;pitch=THREE.MathUtils.clamp(pitch,-1.1,1.1);}});
canvas.addEventListener('click',()=>{if(running&&!mobile&&!document.pointerLockElement)canvas.requestPointerLock?.();});
window.addEventListener('mousedown',e=>{if(e.button===0&&running&&!mobile)triggerDown=true;});window.addEventListener('mouseup',()=>triggerDown=false);
canvas.addEventListener('pointerdown',e=>{if(mobile&&running&&e.clientX>innerWidth*.35){lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{if(mobile&&lookPointer?.id===e.pointerId&&running){yaw-=(e.clientX-lookPointer.x)*.004;pitch-=(e.clientY-lookPointer.y)*.004;lookPointer.x=e.clientX;lookPointer.y=e.clientY;pitch=THREE.MathUtils.clamp(pitch,-1.1,1.1);}});
canvas.addEventListener('pointerup',e=>{if(e.pointerId===lookPointer?.id)lookPointer=null;});
const stickZone=$('stick-zone'),stickKnob=$('stick-knob');let stickId=null,stickCenter=null;
stickZone.addEventListener('pointerdown',e=>{e.preventDefault();stickId=e.pointerId;stickZone.setPointerCapture(stickId);const r=stickZone.getBoundingClientRect();stickCenter={x:r.left+r.width/2,y:r.top+r.height/2,r:r.width*.35};moveStick(e);});
function moveStick(e){if(stickId!==e.pointerId||!stickCenter)return;const dx=e.clientX-stickCenter.x,dy=e.clientY-stickCenter.y,len=Math.hypot(dx,dy),scale=Math.min(1,stickCenter.r/Math.max(1,len));moveX=dx/Math.max(1,len)*scale;moveY=dy/Math.max(1,len)*scale;stickKnob.style.left=`${50+moveX*35}%`;stickKnob.style.top=`${50+moveY*35}%`;}
stickZone.addEventListener('pointermove',moveStick);function resetStick(e){if(e.pointerId!==stickId)return;stickId=null;stickCenter=null;moveX=moveY=0;stickKnob.style.left='50%';stickKnob.style.top='50%';}stickZone.addEventListener('pointerup',resetStick);stickZone.addEventListener('pointercancel',resetStick);
$('fire-button').addEventListener('pointerdown',e=>{e.preventDefault();triggerDown=true;fire();});$('fire-button').addEventListener('pointerup',()=>triggerDown=false);$('fire-button').addEventListener('pointercancel',()=>triggerDown=false);$('reload-button').addEventListener('pointerdown',e=>{e.preventDefault();reload();});

function canMove(x,z){if(x<-16.8||x>16.8||z>7.5||z<-32.5)return false;for(const c of colliders){if(Math.abs(x-c.x)<c.hx+.32&&Math.abs(z-c.z)<c.hz+.32)return false;}return true;}
function update(dt){if(!running)return;
 const now=clock.elapsedTime;camera.rotation.order='YXZ';camera.rotation.set(pitch+recoil,yaw,0);recoil*=Math.pow(.001,dt);shake*=Math.pow(.0001,dt);camera.position.x+= (Math.random()-.5)*shake;camera.position.y=1.72+Math.sin(now*8)*Math.min(.009,Math.hypot(moveX,moveY)*.009)+(Math.random()-.5)*shake;
 let forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-moveY;let strafe=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+moveX;
 const mag=Math.hypot(forward,strafe);if(mag>1){forward/=mag;strafe/=mag;}const speed=4.2*dt;const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*strafe)*speed;const dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*strafe)*speed;
 if(canMove(camera.position.x+dx,camera.position.z))camera.position.x+=dx;if(canMove(camera.position.x,camera.position.z+dz))camera.position.z+=dz;
 if(triggerDown&&now-lastShot>.13)fire();
 if(now-lastDamage>7&&health<100){health=Math.min(100,health+dt*4);updateHUD();}
 let nearest=99;for(const e of enemies){const d=e.position.distanceTo(camera.position);if(e.userData.alive){nearest=Math.min(nearest,d);e.userData.attack-=dt;
  // Subtle repositioning keeps firefights dynamic without teleporting enemies.
  const ud=e.userData;if(d<20&&d>7){const side=Math.sin(now*.55+ud.phase)*.002;e.position.x=THREE.MathUtils.clamp(ud.homeX+Math.sin(now*.22+ud.phase)*.3,-16,16)+side;}
  e.rotation.y=Math.atan2(camera.position.x-e.position.x,camera.position.z-e.position.z);
  if(d<30&&ud.attack<=0){ud.attack=2.1+Math.random()*2.2;enemyFire(e);}
 }else if(e.userData.deathAt){const age=now-e.userData.deathAt;e.rotation.z=e.userData.deathDirection*Math.min(1,age*1.6);e.position.y=-Math.min(.85,age*.55);}}
 $('threat-label').classList.toggle('visible',nearest<18&&kills<enemies.length);
 for(let i=tracers.length-1;i>=0;i--){if(now-tracers[i].at>.12){scene.remove(tracers[i].line);tracers.splice(i,1);}}
}
function animate(){requestAnimationFrame(animate);const dt=Math.min(.04,clock.getDelta());update(dt);renderer.render(scene,camera);}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.5:2));renderer.setSize(innerWidth,innerHeight,false);});
if(mobile){$('input-note').textContent='LEFT STICK MOVE  ·  DRAG TO AIM  ·  FIRE BUTTON SHOOTS';$('controls-hint').style.display='none';}
updateHUD();
animate();
setTimeout(()=>$('loading-screen').classList.add('done'),700);
