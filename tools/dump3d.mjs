// node tools/dump3d.mjs FIRST LAST  -> raw 640x480 grey frames (concatenated) of the TV scene on stdout; frame n = demo clock 7n
import {frame} from '../web/js/scenes_3d.js';
const [a, b] = process.argv.slice(2).map(Number);
for (let n = a; n <= b; n++) process.stdout.write(frame(7 * n));
