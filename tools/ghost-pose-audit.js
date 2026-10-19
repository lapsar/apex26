/* ============================================================================
   Справка — ВСТАВШИЙ В СЛУЧАЙНОЙ ПОЗЕ: НИКТО НЕ СТОИТ ЗА НИМ (19.10.2026, v1.16.88)

   Разбитый ставится в n мест круга (шаг ~0.137 круга) со случайной полосой (0…1.05·hw, по очереди слева и справа) и углом кузова
   (±89°), когда к месту подъезжают; 70 с. Строка JSON на место: дольше всех стоял перед ним, глубже всех в его корпусе, скачок.
   Жёстче пробника pass: бывает и поперёк ровно посреди дороги. Замер 19.10.2026 (6 трасс × 6 мест, зёрна 200–205, + Монако
   100–105): v1.16.87 — 9 мест из 42 дольше 8 с (до 25 с); v1.16.88 — 1–2 (вставший поперёк точно по центру, к нему трое в ряд —
   limitations.md).
   Запуск: node tools/ghost-pose-audit.js <трасса> <n> <первое зерно>   (сборка — APEX_INDEX)
   ========================================================================== */
'use strict';
const H = require('./harness');
const [tname, nArg, s0Arg] = process.argv.slice(2), file = undefined;
const N = +nArg || 8, S0 = +s0Arg || 100;
const T = H.tracks(true).find(t => t.name === tname);
const out = [];
for (let k = 0; k < N; k++) {
  const seed = S0 + k;
  const env = H.loadGame({ seed, file });
  H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 3 });
  H.startRaceAt(env, 11);
  H.lightsOut(env);
  H.noRetirements(env);
  const r = env.evalIn(`(function(){var dt=1/60,M=track.M,L=track.length;
    var rnd=${seed}*7919%1000/1000;var iA=Math.floor(((rnd*0.618+${k}*0.137)%1)*M),uA=(iA+0.5)/M,hw=halfAt(iA);
    var side=(${k}%2)?1:-1,crab=((${seed}*31%100)/100-0.5)*3.1,frac=((${seed}*17%100)/100)*1.05;
    var ahead=function(c){return ((uA-c.u)%1+1)%1*L;};
    __drive(20*60,dt,'auto');
    for(var f=0;f<200*60&&!field.some(function(c){var a=ahead(c);return a>150&&a<250;});f++)__drive(1,dt,'auto');
    var v=field.slice().sort(function(a,b){return Math.min(ahead(a),L-ahead(a))-Math.min(ahead(b),L-ahead(b));}).pop();
    var hwc=carHalfWidth(crab),lane=side*frac*hw,wl=wallAt(iA,side)-hwc-0.15;if(Math.abs(lane)>wl)lane=side*wl;
    v.u=uA;v.lane=lane;v.crab=crab;v.speed=0;v.fail={kind:'crash'};v.err=null;v.spinPend=null;
    placeAI(v,0);retireCar(v,true);
    var stk=new Map(),worst=0,who='',pen=0,jump=0,near=0,passed=new Set();
    for(var f=0;f<70*60&&phase!=='';f++){var pl=new Map();field.forEach(function(c){pl.set(c,c.lane);});__drive(1,dt,'auto');
      for(var q=0;q<field.length;q++){var c=field[q];if(c.retired||(c.fail&&c.fail.on))continue;
        var d=Math.hypot(c.x-v.x,c.z-v.z);
        if(d<15)near++;
        if(!v.cleared&&d<14){var p=ghostPen(c,c.lane,0,v);if(p>pen)pen=p;}
        var dl=Math.abs(c.lane-pl.get(c));if(dl>jump&&dl<50)jump=dl;
        if(!v.cleared&&d<15&&c.speed<0.5&&!(Math.hypot(c.x-player.x,c.z-player.z)<8&&player.speed<0.5)){var t=(stk.get(c)||0)+dt;stk.set(c,t);if(t>worst){worst=t;who=c.code;}}
        else stk.set(c,0);}}
    return {S:Math.round(track.S[iA]),lane:+lane.toFixed(2),hw:hw,crab:+crab.toFixed(2),blk:v.blocking,worst:+worst.toFixed(1),who:who,pen:+pen.toFixed(2),jump:+jump.toFixed(2),near:near};})()`);
  out.push(r);
  console.log(JSON.stringify({ track: tname, seed, ...r }));
}
