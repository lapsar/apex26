/* Осевая и ПОСТРОЕННЫЙ барьер Монако ИЗ ИГРЫ в wall.json: P, R (вправо по ходу), S, K, HW,
   WL/WR/VL/VR по станциям, HY — высота полотна рельефа (v1.16.33) — для plan.py (рисует стену поверх снимка красным) и barrier.py.
   Мерить построенное, а не данные разметки (CLAUDE.md §8). S — от линии старта.
   APEX_INDEX=файл — опытная сборка (как у пробников). */
const fs=require('fs'),path=require('path');
const H=require(path.join(__dirname,'..','harness.js'));
const idx=H.tracks().findIndex(t=>t.key==='Monaco');
const env=H.setupWorld(H.loadGame(),{trackIdx:idx});
const o=JSON.parse(env.evalIn(`(function(){
  var o={M:track.M,len:track.length,half:track.roadHalf,P:[],R:[],S:Array.from(track.S),K:Array.from(track.K),HW:Array.from(track.HW),
    WL:Array.from(track.WL),WR:Array.from(track.WR),VL:Array.from(track.VL||[]),VR:Array.from(track.VR||[]),
    HY:track.relief?Array.from(track.relief.HY):[]};
  for(var i=0;i<track.M;i++){o.P.push([track.P[i].x,track.P[i].z]);o.R.push([track.R[i].x,track.R[i].z]);}
  return JSON.stringify(o);})()`));
fs.writeFileSync(path.join(__dirname,process.argv[2]||'wall.json'),JSON.stringify(o));
console.log((process.argv[2]||'wall.json')+': '+o.M+' станций, круг '+o.len.toFixed(1)+' м');
