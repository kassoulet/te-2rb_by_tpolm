// node dump2d.mjs FIRST LAST: raw 640x480 greys of web/js/scenes_2d.js frames (no 3D layers except the TV), to stdout
import {frame} from '../web/js/scenes_2d.js';
const [a, b] = process.argv.slice(2).map(Number);
for (let k = a; k <= b; k++) process.stdout.write(Buffer.from(await frame(k)));
