// Отступы отбойника Монреаля (от осевой, по индексам той же осевой,
// что и в centerline.json) — опора для surface.py: где стена далеко,
// внутри неё лежит НАСТОЯЩИЙ вылет и его видно на снимке; где стена
// на минимуме, полоса до неё — наша выдумка, и мерить надо ЗА стеной.
const fs=require('fs'),path=require('path');
const H=require(path.join(__dirname,'..','harness.js'));
const idx=H.tracks().findIndex(t=>t.key==='Montreal');
const env=H.setupWorld(H.loadGame(),{trackIdx:idx});
const o=env.evalIn(`({M:track.M,S:Array.from(track.S),HW:Array.from(track.HW),WL:Array.from(track.WL),WR:Array.from(track.WR)})`);
fs.writeFileSync(path.join(__dirname,'wall.json'),JSON.stringify(o));
console.log('ok',o.M,'станций');
