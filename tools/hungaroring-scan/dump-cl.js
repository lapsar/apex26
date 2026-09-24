/* Осевая Хунгароринга ИЗ ИГРЫ в centerline.json: P, R (вправо по ходу), S, K, длина круга.
   Истина контура с v1.16.5 — TRACKDATA в index.html (сглаженный), а не
   hu-1986-center.geojson, поэтому время ↔ место считаем по построенной осевой.
   S здесь — метры от ЛИНИИ СТАРТА (sfShift уже применён, индекс 0 = старт).
   Игра отражает контур по X (ловушка №1, CLAUDE.md §8): laptime.py отражает обратно. */
const fs=require('fs'), path=require('path');
const H=require(path.join(__dirname,'..','harness.js'));
const env=H.loadGame();
const idx=H.tracks().findIndex(t=>t.key==='Hungaroring');
if(idx<0){console.error('Хунгароринга нет в TRACKS');process.exit(2);}
env.evalIn(`track=makeTrack(TRACKS[${idx}]);0`);
const o=JSON.parse(env.evalIn(`(function(){
  var o={M:track.M,len:track.length,half:track.roadHalf,P:[],R:[],S:track.S.slice(),K:track.K.slice()};
  for(var i=0;i<track.M;i++){o.P.push([track.P[i].x,track.P[i].z]);o.R.push([track.R[i].x,track.R[i].z]);}
  return JSON.stringify(o);})()`));
fs.writeFileSync(path.join(__dirname,'centerline.json'),JSON.stringify(o));
console.log('centerline.json: '+o.M+' точек, круг '+o.len.toFixed(1)+' м, полуширина '+o.half.toFixed(1)+' м');
