/* ============================================================================
   Справка — ВИДИТ ЛИ ИГРОК СОШЕДШИЙ БОЛИД (21.10.2026, к v1.16.93)

   Владелец: в Монако сошедший после VSC увозят (v1.16.92, clearAway) — болид, вставший далеко впереди, игрок не видит
   вовсе: «сошёл, а его не видно было совсем, просто пропал». Гонка как в retire-stress-audit: Норма, игрок-автопилот с P11,
   шесть сходов по расписанию, 500 с. «Видел» — болид хоть раз ближе SEE_NEAR м к камере и в кадре (±66°, как retSeen),
   пока он не убран. Печатает строку JSON на гонку: сколько сошедших, сколько увидено; у каждого — S, на полотне ли,
   через сколько секунд после остановки убран, сколько стоял после конца VSC, ждал ли игрока (c.waitPl, v1.16.93),
   и сколько стоял под жёлтым после VSC.
   Запуск: node tools/wreck-seen-audit.js <трасса> <зёрна через запятую>   (сборка — APEX_INDEX)
   ========================================================================== */
'use strict';
const H = require('./harness');
const SEE_NEAR = 120;
const [tname, seedsArg] = process.argv.slice(2);
const T = H.tracks(true).find(t => t.name === (tname || 'Monaco'));
for (const seed of (seedsArg || '2,3,4,5').split(',').map(Number)) {
  const env = H.loadGame({ seed });
  H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 40 });
  H.startRaceAt(env, 11); H.lightsOut(env);
  env.evalIn(`(function(){var pool=field.slice(0,22);for(var k=0;k<6;k++){var c=pool[(k*7+3)%pool.length];c.retireAt=(0.6+k*0.7+Math.random()*0.3)*track.length;}})()`);
  const o = env.evalIn(`(function(){var dt=1/60,st=new Map(),vscEnd=null;
    for(var f=0;f<500*60&&phase!=='';f++){var was=neutral.mode;__drive(1,dt,'auto');
      if(was==='ending'&&neutral.mode!=='ending')vscEnd=raceTime;
      field.forEach(function(c){if(!c.retired||c.speed>0.1)return;var s=st.get(c);
        if(!s){s={code:c.code,S:Math.round(track.S[c.retiredIdx]),road:!!c.blockedRoad,stop:raceTime,seen:false,gone:null,afterVsc:null,wait:false,yel:0};st.set(c,s);}
        if(s.gone!==null)return;
        if(c.waitPl)s.wait=true;
        if(c.gone||c.cleared){s.gone=+(raceTime-s.stop).toFixed(1);return;}
        if(!vscOn()&&neutral.mode==='yellow'&&neutral.secs.indexOf(sectorAt(c.retiredIdx/track.M))>=0)s.yel+=dt;
        if(!vscOn()&&s.afterVsc===null&&vscEnd!==null&&vscEnd>s.stop)s.afterVsc=raceTime;
        var dx=c.x-cam.position.x,dz=c.z-cam.position.z,d=Math.hypot(dx,dz);
        if(d<${SEE_NEAR}){var e=cam.matrixWorld.elements,fx=-e[8],fz=-e[10],fl=Math.hypot(fx,fz)||1;if(d<8||(dx*fx+dz*fz)/(d*fl)>0.4)s.seen=true;}});}
    var cars=[];st.forEach(function(s){if(s.afterVsc!==null&&s.gone!==null)s.afterVsc=+(s.stop+s.gone-s.afterVsc).toFixed(1);else s.afterVsc=null;s.yel=+s.yel.toFixed(1);cars.push(s);});
    return cars;})()`);
  console.log(JSON.stringify({ seed, n: o.length, seen: o.filter(c => c.seen).length, cars: o }));
}
