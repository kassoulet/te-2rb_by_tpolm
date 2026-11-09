// scenes.js - scene registry. scene = {start,end,render(ctx,t)}; t = music seconds. Everything is a pure function of t.
// Frame is 640x480 (shown at 4:3 CSS aspect).
import {scenes as s3d} from './scenes_3d.js';
import {scenes as s2d} from './scenes_2d.js';   // frames 0..1199 (non-3D layers); must stay before s3d, whose 'teevee' scene overlaps it
export const W=640,H=480;
export const SCENES=[
  ...s2d,
  ...s3d,
  {name:'bx(+z:',start:0,end:307.2,render(ctx,t){ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);}},   // placeholder
];
export const sceneAt=t=>SCENES.find(s=>t>=s.start&&t<s.end)||null;
