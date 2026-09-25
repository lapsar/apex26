/* Построенный барьер Хунгароринга ИЗ ИГРЫ (WL/WR/VL/VR по станциям осевой) в wall.json —
   чтобы plan.py нарисовал его поверх снимка красным: проверяется то, что построено,
   а не данные разметки (урок §8: «мерить построенную геометрию»). */
const fs=require('fs'),path=require('path');
const H=require(path.join(__dirname,'..','harness.js'));
const idx=H.tracks().findIndex(t=>t.key==='Hungaroring');
const env=H.setupWorld(H.loadGame(),{trackIdx:idx});
const o=env.evalIn(`({M:track.M,S:Array.from(track.S),HW:Array.from(track.HW),WL:Array.from(track.WL),WR:Array.from(track.WR),VL:Array.from(track.VL||[]),VR:Array.from(track.VR||[])})`);
fs.writeFileSync(path.join(__dirname,'wall.json'),JSON.stringify(o));
console.log('wall.json:',o.M,'станций');
