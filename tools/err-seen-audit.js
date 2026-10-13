/* Справка: сколько ошибок соперников видит игрок и почему за ошибкой «тянется» несколько болидов вне линии (13.10.2026).
   Владелец (v1.16.74, Монако, 3 круга): «по 1–2 ошибки на каждом круге; у Казино машины после ошибок едут подряд —
   на скриншоте 4 машины не на траектории, а облако видно у одной». Гонка: игрок-автопилот с позиции --pos (по умолчанию 20),
   Норма, --laps круга, зёрна --seeds. Считается:
     • ошибок за гонку всего и по поворотам; «на глазах» — началась ближе 150 м впереди игрока;
     • кадры, когда в 150 м перед игроком видно ≥2 болидов вне обычного коридора (|lane| > hw·0.62): кто из них сам в ошибке
       (errPh>0), кто возвращается после неё (err ещё есть, errPh=0), кто объезжает или стоит рядом (без err);
     • повторные ошибки одного поворота подряд (две машины в одном и том же месте за 10 с);
     • «свита» ошибки: сколько ДРУГИХ болидов побывало вне коридора в 60 м позади ошибающегося, пока он в ошибке;
     • перестановки: расстояние Кендалла между порядком соперников, когда лидер закончил 1-й круг, и на финише.
   Сравнение сборок: --files=archive/v1.16.73.html,index.html. Игру не меняет.
     node tools/err-seen-audit.js --track=Monaco --laps=3 --seeds=1,2,3,4,5,6,7,8 */
'use strict';
const H = require('./harness');
const path = require('path');
const A = {}; process.argv.slice(2).forEach(a => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) A[m[1]] = m[2]; });
const files = (A.files || 'index.html').split(',');
const seeds = (A.seeds || '1,2,3,4,5,6,7,8').split(',').map(Number);
const laps = +(A.laps || 3), pos = +(A.pos || 20), tname = A.track || 'Monaco';
for (const f of files) {
  const tot = { err: 0, seen: 0, by: {}, multi: 0, frames: 0, kinds: { own: 0, back: 0, other: 0 }, rep: 0, laps: 0 };
  for (const sd of seeds) {
    const env = H.loadGame({ seed: sd, file: path.resolve(__dirname, '..', f) });
    const T = H.tracks(true).find(t => t.name === tname);
    H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: laps });
    H.startRaceAt(env, pos); H.lightsOut(env); H.noRetirements(env);
    const o = env.evalIn(`(function(){var dt=1/60,M=track.M,errs=[],last={},multi=0,frames=0,k={own:0,back:0,other:0},rep=0;
      var ec=errCorners(),suite=0,nE=0,t1=null,ord=function(){return field.filter(function(c){return c!==player;}).slice().sort(function(a,b){return b.dist-a.dist;}).map(function(c){return c.num;});};
      for(var f=0;f<60*60*12&&phase==='race'&&!player.finished;f++){__AP.drive();update(dt);frames++;
        var off=[];for(var i=0;i<field.length;i++){var c=field[i];if(c===player||c.retired)continue;
          if(c.err&&c.err!==c.__e){c.__e=c.err;var dx=c.x-player.x,dz=c.z-player.z,iu=Math.floor(((c.u%1)+1)%1*M)%M,F=track.F[iu];
            var ahead=dx*F.x+dz*F.z,S=Math.round(track.S[iu]);var key=-1;for(var q=0;q<ec.list.length;q++)if(Math.abs(((track.S[ec.list[q].ap]-S)%track.length+track.length)%track.length)<200){key=Math.round(track.S[ec.list[q].ap]);break;}
            errs.push({S:key,seen:ahead>0&&Math.hypot(dx,dz)<150});c.__suite={};nE++;
            if(last[key]!==undefined&&raceTime-last[key]<10)rep++;last[key]=raceTime;}
          var iu2=Math.floor(((c.u%1)+1)%1*M)%M,hw=halfAt(iu2),F2=track.F[iu2],ah=(c.x-player.x)*F2.x+(c.z-player.z)*F2.z;
          if(ah>0&&ah<150&&Math.abs(c.lane)>hw*0.62)off.push(c);
          if(Math.abs(c.lane)>hw*0.62)for(var j=0;j<field.length;j++){var e2=field[j];if(e2===c||e2===player||!e2.err||!e2.__suite)continue;var bk=Math.hypot(e2.x-c.x,e2.z-c.z);if(bk<60&&c.dist<e2.dist)e2.__suite[c.num]=1;}}
        if(!t1&&Math.max.apply(null,field.map(function(c){return c===player?0:c.dist;}))>=track.length)t1=ord();
        if(off.length>=2){multi++;off.forEach(function(c){if(c.errPh>0)k.own++;else if(c.err)k.back++;else k.other++;});}}
      var sum=0;field.forEach(function(c){if(c.__suite)sum+=Object.keys(c.__suite).length;});var t2=ord(),kd=0;if(t1){var p2={};t2.forEach(function(n,i){p2[n]=i;});for(var a=0;a<t1.length;a++)for(var b=a+1;b<t1.length;b++)if(p2[t1[a]]>p2[t1[b]])kd++;}
      return {suite:sum,nE:nE,kd:kd,errs:errs,multi:multi,frames:frames,k:k,rep:rep,lap:player.lap};})()`);
    tot.err += o.errs.length; tot.seen += o.errs.filter(e => e.seen).length; tot.multi += o.multi; tot.frames += o.frames; tot.rep += o.rep; tot.suite = (tot.suite || 0) + o.suite; tot.kd = (tot.kd || 0) + o.kd;
    for (const kk in o.k) tot.kinds[kk] += o.k[kk];
    o.errs.forEach(e => tot.by[e.S] = (tot.by[e.S] || 0) + 1);
  }
  const n = seeds.length;
  console.log(`\n${f} — ${tname}, ${laps} кр., Норма, игрок-автопилот с P${pos}, зёрен ${n}`);
  console.log(`  ошибок за гонку ${(tot.err / n).toFixed(1)} (${(tot.err / n / laps).toFixed(1)} на круг); на глазах игрока ${(tot.seen / n).toFixed(1)} (${(tot.seen / n / laps).toFixed(2)} на круг)`);
  console.log(`  по поворотам (S апекса: ошибок за гонку): ` + Object.keys(tot.by).sort((a, b) => a - b).map(s => s + ': ' + (tot.by[s] / n).toFixed(1)).join(', '));
  console.log(`  тот же поворот, вторая ошибка за 10 с: ${(tot.rep / n).toFixed(1)} за гонку`);
  console.log(`  свита: другие болиды вне коридора в 60 м позади ошибающегося — ${tot.err ? (tot.suite / tot.err).toFixed(2) : '—'} на ошибку`);
  console.log(`  перестановок соперников с конца 1-го круга до финиша: ${(tot.kd / n).toFixed(1)}`);
  const kn = tot.kinds.own + tot.kinds.back + tot.kinds.other || 1;
  console.log(`  ≥2 болидов вне коридора в 150 м перед игроком: ${(100 * tot.multi / tot.frames).toFixed(1)} % времени; из них сами в ошибке ${(100 * tot.kinds.own / kn).toFixed(0)} %, возвращаются после ошибки ${(100 * tot.kinds.back / kn).toFixed(0)} %, без ошибки (объезд, бок о бок) ${(100 * tot.kinds.other / kn).toFixed(0)} %`);
}
