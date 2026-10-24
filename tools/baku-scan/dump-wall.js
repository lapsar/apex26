/* Осевая и ПОСТРОЕННЫЙ барьер Баку ИЗ ИГРЫ в wall.json (порт monaco-scan/dump-wall.js): P, R (вправо по ходу), S, K, HW,
   WL/WR/VL/VR по станциям, ST — следы трибун, GAPS — ломаные стены в разрывах ленты (v1.17.9) — для city.py (Старый город, v1.17.3). Мерить построенное, а не данные (CLAUDE.md §8).
   APEX_INDEX=файл — опытная сборка (как у пробников).
    node dump-wall.js [файл.json]   */
const fs=require('fs'),path=require('path');
const H=require(path.join(__dirname,'..','harness.js'));
const idx=H.tracks().findIndex(t=>t.key==='Baku');
const env=H.setupWorld(H.loadGame(),{trackIdx:idx});
const o=JSON.parse(env.evalIn(`(function(){
  var o={M:track.M,len:track.length,half:track.roadHalf,P:[],R:[],S:Array.from(track.S),K:Array.from(track.K),HW:Array.from(track.HW),
    WL:Array.from(track.WL),WR:Array.from(track.WR),VL:Array.from(track.VL||[]),VR:Array.from(track.VR||[]),ST:standFootprints(),GAPS:[]};
  [[-1,track.WL,track.VL,'L'],[1,track.WR,track.VR,'R']].forEach(function(q){var sg=q[0],W=q[1],V=q[2];if(!V)return;   // ломаные стены в разрывах ленты (карманы path, v1.17.9)
    for(var i=0;i<track.M;i++){if(V[i]||!V[(i-1+track.M)%track.M])continue;var len=0;while(len<track.M&&!V[(i+len)%track.M])len++;
      o.GAPS.push({side:q[3],from:(i-1+track.M)%track.M,to:(i+len)%track.M,pocket:!!(track.gapPathAt&&track.gapPathAt[q[3]][i]>=0),path:spanPath(sg,W,i,len)});}});
  for(var i=0;i<track.M;i++){o.P.push([track.P[i].x,track.P[i].z]);o.R.push([track.R[i].x,track.R[i].z]);}
  return JSON.stringify(o);})()`));
fs.writeFileSync(path.join(__dirname,process.argv[2]||'wall.json'),JSON.stringify(o));
console.log((process.argv[2]||'wall.json')+': '+o.M+' станций, круг '+o.len.toFixed(1)+' м');
