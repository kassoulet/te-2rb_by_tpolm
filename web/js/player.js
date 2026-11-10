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
// optional CRT pass (display only): the grey 640x480 render goes through a WebGL shader (barrel, bloom, scanlines, RGB mask, vignette); falls back to the 2D path without WebGL
const FS=`precision mediump float;uniform sampler2D u;uniform float k;varying vec2 v;
vec2 curve(vec2 p){p=p*2.-1.;p*=1.+dot(p.yx,p.yx)*vec2(.03,.04);return p*.5+.5;}
vec3 s(vec2 p){return texture2D(u,p).rgb;}
void main(){
  vec2 p=curve(v);if(p.x<0.||p.x>1.||p.y<0.||p.y>1.){gl_FragColor=vec4(0,0,0,1);return;}
  vec3 c=s(p);vec2 d=vec2(1./640.,1./480.)*1.5;
  vec3 b=(s(p+vec2(d.x,0.))+s(p-vec2(d.x,0.))+s(p+vec2(0.,d.y))+s(p-vec2(0.,d.y)))*.25;
  c=c*.85+b*b*.6;
  float sc=mix(.8,.6+.4*pow(abs(sin(p.y*480.*3.14159)),.6),k);
  float m=mod(floor(gl_FragCoord.x),3.);vec3 mask=vec3(.82)+k*vec3(.36)*vec3(m<1.,m>=1.&&m<2.,m>=2.)+(1.-k)*.12;   // k: scanline/mask strength, 0 below 1x source height (they would alias), 1 from 2x
  vec2 q=p*2.-1.;float vig=1.-.25*dot(q,q);
  gl_FragColor=vec4(pow(c*sc*mask*vig*1.1,vec3(1.1)),1.);
}`;
const cc=$('crt'),cbox=$('crtc');let gl=null,glTried=false,ku=null;
function crtInit(){
  glTried=true;gl=cc.getContext('webgl');if(!gl)return;
  const mk=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o;};
  const pr=gl.createProgram();gl.attachShader(pr,mk(gl.VERTEX_SHADER,'attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0,1);}'));
  gl.attachShader(pr,mk(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);
  if(!gl.getProgramParameter(pr,gl.LINK_STATUS)){gl=null;return;}
  gl.useProgram(pr);ku=gl.getUniformLocation(pr,'k');gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
  for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
}
function presentCrt(){
  const dpr=window.devicePixelRatio||1,w=Math.max(1,Math.round(cc.clientWidth*dpr)),h=Math.max(1,Math.round(cc.clientHeight*dpr));
  if(cc.width!==w||cc.height!==h){cc.width=w;cc.height=h;}
  gl.viewport(0,0,w,h);gl.uniform1f(ku,Math.max(0,Math.min(1,h/480-1)));gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}
function present(){
  if(cbox.checked&&!glTried)crtInit();
  const on=cbox.checked&&!!gl;cc.style.display=on?'block':'none';dv.style.display=on?'none':'block';
  if(on)return presentCrt();
  const dpr=window.devicePixelRatio||1,w=Math.max(1,Math.round(dv.clientWidth*dpr)),h=Math.max(1,Math.round(dv.clientHeight*dpr));
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
