// player.js - transport: music via libopenmpt (chiptune3); demo state = pure function of music position; pause + seek anywhere.
import {sceneAt} from './scenes.js';
const $=id=>document.getElementById(id);
const ctx=$('c').getContext('2d');
const dur=307.2;
let playing=false,tBase=0,wall0=0,cp=null,ac=null,started=false;
window.demoDbg={ac:()=>ac,cp:()=>cp};   // test hook
const now=()=>performance.now()/1000;
const cur=()=>playing?Math.min(dur,tBase+(now()-wall0)):tBase;
const fmt=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
function draw(t){const s=sceneAt(t);if(s)s.render(ctx,t-s.start);}
async function initAudio(){
  const {ChiptuneJsPlayer}=await import('../vendor/chiptune3.js');
  ac=new AudioContext();cp=new ChiptuneJsPlayer({context:ac,repeatCount:0,interpolationFilter:8});
  cp.gain.connect(ac.destination);
  await new Promise(r=>cp.onInitialized(r));
  const buf=await (await fetch('assets/te-2rx.xm')).arrayBuffer();
  cp.onProgress(m=>{if(playing&&Math.abs(m.pos-cur())>0.25){tBase=m.pos;wall0=now();}});   // lock visuals to the module clock
  cp.onEnded(()=>{playing=false;tBase=dur;sync();});
  cp.play(buf);
}
function sync(){$('pp').textContent=playing?'Pause':'Play';}
async function play(){
  if(!started){started=true;$('go').remove();await initAudio().catch(e=>console.error(e));tBase=0;}
  else if(cp)cp.unpause();
  if(tBase>=dur-0.05)seek(0);
  playing=true;wall0=now();ac&&ac.resume();sync();
}
function pause(){if(!playing)return;tBase=cur();playing=false;cp&&cp.pause();sync();}
function seek(t){t=Math.max(0,Math.min(dur-0.01,t));tBase=t;wall0=now();cp&&cp.setPos(t);draw(t);}
const toggle=()=>playing?pause():play();
$('pp').onclick=toggle;$('go').onclick=play;
$('b10').onclick=()=>seek(cur()-10);$('f10').onclick=()=>seek(cur()+10);
$('fs').onclick=()=>document.fullscreenElement?document.exitFullscreen():$('stage').requestFullscreen();
const sk=$('seek');let drag=false;sk.oninput=()=>{drag=true;seek(sk.value/10);};sk.onchange=()=>{drag=false;};
addEventListener('keydown',e=>{const k=e.key,big=e.shiftKey?10:5;
  if(k===' '){e.preventDefault();toggle();}else if(k==='ArrowLeft')seek(cur()-big);else if(k==='ArrowRight')seek(cur()+big);
  else if(k==='Home')seek(0);else if(k==='End')seek(dur-1);else if(k==='f'||k==='F')$('fs').click();});
function loop(){const t=cur();if(!drag)sk.value=Math.round(t*10);$('tm').textContent=fmt(t)+' / '+fmt(dur);if(playing)draw(t);requestAnimationFrame(loop);}
sk.max=Math.round(dur*10);window.demoReady=true;
$('go').textContent='Click or press Space to start (sound on)';
draw(0);loop();
