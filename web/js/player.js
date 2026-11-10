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
// sharp-bilinear upscale: the 640x480 render is first scaled by an integer factor with nearest neighbour, then bilinear-filtered down to the display size
// (crisp pixels, only the pixel edges are blended; no blur, no uneven pixel widths)
const cv=$('c'),dv=$('d'),dctx=dv.getContext('2d'),big=document.createElement('canvas'),bctx=big.getContext('2d');
// optional CRT (display only): CSS overlay (scanlines + faint vignette) over #d. The band period is an integer k of device px per source row (no moire):
// with CRT on, #d is sized to k*480 device px high (k=floor(available/480)), 4:3, centred; k<2 -> unavailable (checkbox greyed, normal picture).
const cbox=$('crtc'),ov=$('ov'),stage=$('stage'),SRC=480;
// scanline bands as a 1:1 device-pixel image (a CSS tile of k/dpr px is fractional at dpr 1.25 and beats): band i = 40% clear, then a ramp to 33% black
let bk='';const bands=(k,H)=>{const key=k+'x'+H;if(bk.key===key)return bk.url;const c=document.createElement('canvas');c.width=1;c.height=H;const g=c.getContext('2d'),d=g.createImageData(1,H);
  for(let r=0;r<H;r++){const v=((r%k)+.5)/k;d.data[4*r+3]=v<.4?0:Math.round(255*.33*(v-.4)/.6);}
  g.putImageData(d,0,0);bk={key,url:`"${c.toDataURL()}"`};return bk.url;};
function present(){
  const dpr=window.devicePixelRatio||1,cw=stage.clientWidth,ch=stage.clientHeight;
  const kk=Math.floor(Math.min(ch,cw*3/4)*dpr/SRC+1e-6),on=cbox.checked&&kk>=2;
  cbox.disabled=kk<2;cbox.parentNode.title=kk<2?'CRT needs a window at least 2x the source height (960 device px)':'C';
  const place=(e,l,t,w,h)=>{e.style.cssText=on?`position:absolute;left:${l}px;top:${t}px;width:${w}px;height:${h}px`:'';};
  let w,h;
  if(on){
    const W=kk*640,H=kk*SRC,sr=stage.getBoundingClientRect(),ox=sr.left+stage.clientLeft,oy=sr.top+stage.clientTop;   // snap the picture's origin to a whole device pixel (stage origin may be fractional)
    const l=Math.round(ox*dpr+(cw*dpr-W)/2)/dpr-ox,t=Math.round(oy*dpr+(ch*dpr-H)/2)/dpr-oy;
    place(dv,l,t,W/dpr,H/dpr);place(ov,l,t,W/dpr,H/dpr);
    ov.style.cssText+=`;display:block;pointer-events:none;image-rendering:pixelated;background:radial-gradient(ellipse at center,transparent 60%,rgba(0,0,0,.15)),url(${bands(kk,H)});background-size:100% 100%;background-repeat:no-repeat`;
    w=W;h=H;
  }else{place(dv);ov.style.cssText='display:none';w=Math.max(1,Math.round(dv.clientWidth*dpr));h=Math.max(1,Math.round(dv.clientHeight*dpr));}
  if(dv.width!==w||dv.height!==h){dv.width=w;dv.height=h;}
  const k=Math.max(1,Math.ceil(w/cv.width));
  if(big.width!==cv.width*k){big.width=cv.width*k;big.height=cv.height*k;}
  bctx.imageSmoothingEnabled=false;bctx.drawImage(cv,0,0,big.width,big.height);
  dctx.imageSmoothingEnabled=true;dctx.imageSmoothingQuality='high';dctx.drawImage(big,0,0,w,h);
}
try{cbox.checked=localStorage.te2rbCrt==='1';}catch(e){}
cbox.onchange=()=>{try{localStorage.te2rbCrt=cbox.checked?'1':'0';}catch(e){}present();};
window.addEventListener('resize',present);
document.addEventListener('fullscreenchange',()=>setTimeout(present,50));
function draw(t){const s=sceneAt(t);Promise.resolve(s&&s.render(ctx,t-s.start)).then(present);}   // render may be async: present once the canvas holds the frame (else the display is a frame late, and a paused seek shows the previous picture)
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
  else if(k==='Home')seek(0);else if(k==='End')seek(dur-1);else if(k==='f'||k==='F')$('fs').click();else if(k==='c'||k==='C'){cbox.checked=!cbox.checked;cbox.onchange();}});
function loop(){const t=cur();if(!drag)sk.value=Math.round(t*10);$('tm').textContent=fmt(t)+' / '+fmt(dur);if(playing)draw(t);requestAnimationFrame(loop);}
sk.max=Math.round(dur*10);window.demoReady=true;
$('go').textContent='Click or press Space to start (sound on)';
draw(0);loop();
