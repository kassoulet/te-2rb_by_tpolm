// UI smoke test: start playback, check time advances, pause holds, seek jumps (headless Chrome, CDP)
import {spawn} from 'child_process';import fs from 'fs';import http from 'http';import path from 'path';import {fileURLToPath} from 'url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'../web');
const srv=http.createServer((q,r)=>{let p=path.join(root,q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}const m={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png'};r.writeHead(200,{'content-type':m[path.extname(p)]||'application/octet-stream'});r.end(d);});}).listen(0);
const ch=spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=9337','about:blank'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,2000));
const tabs=await (await fetch('http://localhost:9337/json')).json();const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
const errs=[];let id=0;const pend={};ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id])pend[d.id](d);if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error')errs.push('console.error '+JSON.stringify(d.params.args.map(a=>a.value||a.description)).slice(0,300));if(d.method==='Network.responseReceived'&&d.params.response.status>=400&&!d.params.response.url.endsWith('favicon.ico'))errs.push('HTTP '+d.params.response.status+' '+d.params.response.url);if(d.method==='Network.loadingFailed')errs.push('loadFailed '+d.params.errorText);if(d.method==='Runtime.exceptionThrown')console.log('EXC',JSON.stringify(d.params.exceptionDetails).slice(0,300));};
const send=(method,params={})=>new Promise(r=>{pend[++id]=r;ws.send(JSON.stringify({id,method,params}))});
const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result.result.value;
await send('Runtime.enable');await send('Network.enable');await send('Page.navigate',{url:`http://localhost:${srv.address().port}/index.html`});
for(let i=0;i<300&&!(await ev('window.demoReady===true'));i++)await new Promise(r=>setTimeout(r,200));
await ev(`(()=>{window.__puts=0;const o=CanvasRenderingContext2D.prototype.putImageData;CanvasRenderingContext2D.prototype.putImageData=function(...a){window.__puts++;return o.apply(this,a)}})()`);   // count canvas draws
const sl=()=>ev('document.getElementById("tm").textContent');
await ev('document.getElementById("pp").click()');await new Promise(r=>setTimeout(r,3000));console.log('after 3s play:',await sl());
await ev('document.getElementById("pp").click()');const a=await sl();await new Promise(r=>setTimeout(r,1500));console.log('paused holds:',a,await sl());
await ev('(()=>{const s=document.getElementById("seek");s.value=1000;s.dispatchEvent(new Event("input"));})()');await new Promise(r=>setTimeout(r,500));console.log('seek to 100s:',await sl());
await ev('document.getElementById("pp").click()');await new Promise(r=>setTimeout(r,2000));console.log('play from seek:',await sl());


// ---- golden screenshots through the player's own seek; canvas grey dumped to SHOTS dir, compared by tools/cmpshot.py
await ev('document.getElementById("pp").click()');   // pause: draws now only come from seeks
const SH=process.env.SHOTS||'/tmp/uishots';fs.mkdirSync(SH,{recursive:true});
const seekT=async t=>{const n0=await ev('window.__puts'),t0=performance.now();
  await ev(`(()=>{const s=document.getElementById("seek");s.value=${Math.round(t*10)};s.dispatchEvent(new Event("input"));})()`);
  for(let i=0;i<6000&&(await ev('window.__puts'))===n0;i++)await new Promise(r=>setTimeout(r,5));return performance.now()-t0;};
const shot=async t=>{const lat=await seekT(t);const b64=await ev('(()=>{const c=document.getElementById("c"),d=c.getContext("2d").getImageData(0,0,640,480).data,o=new Uint8Array(640*480);for(let i=0;i<o.length;i++)o[i]=d[4*i];let s="";for(let i=0;i<o.length;i+=8192)s+=String.fromCharCode.apply(null,o.subarray(i,i+8192));return btoa(s)})()');
  const k=Math.round(t*10);fs.writeFileSync(`${SH}/s${k}.raw`,Buffer.from(b64,'base64'));console.log(`seek ${t}s (k=${k}) latency ${lat.toFixed(0)} ms`);};
for(const t of [2,20,40,60,100,140,170,200,150,145,100,90,85,105,0.5,255,267.2,277.1,279.9,290,300.4])await shot(t);
// pause freezes the picture: play 1 s (visual+audio clock advance), pause, no more canvas draws and the time holds
await ev('document.getElementById("pp").click()');await new Promise(r=>setTimeout(r,2500));
console.log('audio playing:',await ev('window.demoDbg&&[demoDbg.ac().state,demoDbg.ac().currentTime]'),'time',await sl());
await new Promise(r=>setTimeout(r,1000));console.log('audio 1s later:',await ev('window.demoDbg&&[demoDbg.ac().state,demoDbg.ac().currentTime]'),'time',await sl());
await ev('document.getElementById("pp").click()');await new Promise(r=>setTimeout(r,300));const p1=await ev('window.__puts'),t1=await sl();
await new Promise(r=>setTimeout(r,1500));console.log('pause: no draws',await ev('window.__puts')===p1,'| time holds',t1,await sl(),'| ac',await ev('demoDbg.ac().state'));
console.log('ERRORS:',errs.length?errs:'none');
ch.kill();srv.close();
const r=spawn('python3',['-I',path.join(path.dirname(fileURLToPath(import.meta.url)),'cmpshot.py'),SH],{stdio:'inherit'});r.on('exit',c=>process.exit(c));
