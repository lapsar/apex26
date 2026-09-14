/* Осевая Майами из игры в centerline.json: P, R, S, K плюс геопривязка.
   Привязку кладём сюда же, чтобы развёртка не держала константы у себя:
   игра строит мир как x = -(lon-lon0)*mlon, z = (lat-lat0)*110540 (отражение
   по X — ловушка №1 проекта, CLAUDE.md §7). */
const fs=require('fs'), path=require('path');
const H=require(path.join(__dirname,'..','harness.js'));
const env=H.loadGame();
const idx=H.tracks().findIndex(t=>t.key==='Miami');
if(idx<0){console.error('Майами нет в TRACKS');process.exit(2);}
env.evalIn(`track=makeTrack(TRACKS[${idx}]);0`);
const T=env.evalIn(`(function(){
  var o={M:track.M,len:track.length,half:track.roadHalf,P:[],R:[],S:track.S.slice(),K:track.K.slice()};
  for(var i=0;i<track.M;i++){o.P.push([track.P[i].x,track.P[i].z]);o.R.push([track.R[i].x,track.R[i].z]);}
  return JSON.stringify(o);})()`);
const o=JSON.parse(T);
// центр контура — тот же, что в переводе градусов в метры (среднее по точкам без замыкающей)
o.geo={lat0:25.9576216,lon0:-80.2377515,mlon:111320*Math.cos(25.9576216*Math.PI/180),mlat:110540};
fs.writeFileSync(path.join(__dirname,'centerline.json'),JSON.stringify(o));
console.log('centerline.json: %d точек, круг %.1f м, полуширина %.1f м',o.M,o.len,o.half);
