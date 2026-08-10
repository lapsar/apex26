const fs=require('fs');const H=require(require('path').join(__dirname,'..','harness.js'));
const env=H.loadGame();const idx=H.tracks().findIndex(t=>t.key==='Montreal');
env.evalIn(`track=makeTrack(TRACKS[${idx}]);0`);
const T=env.evalIn(`(function(){var o={M:track.M,len:track.length,half:track.roadHalf,P:[],R:[],S:track.S.slice(),K:track.K.slice()};
for(var i=0;i<track.M;i++){o.P.push([track.P[i].x,track.P[i].z]);o.R.push([track.R[i].x,track.R[i].z]);}return JSON.stringify(o);})()`);
fs.writeFileSync(require('path').join(__dirname,'centerline.json'),T);
console.log('ok',JSON.parse(T).M,'точек');
