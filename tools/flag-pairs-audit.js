/* СПРАВКА (не пробник, порога нет): ОТКУДА берутся спорные обгоны под флагами.
   `neutral-audit` отвечает «сколько», эта — «в каком положении пара вошла под флаг».
   Для каждой упорядоченной пары A,B запоминается момент, когда ОБА впервые оказались
   под ограничением (или флаг поднялся, когда оба уже в зоне), и зазор в этот момент
   d0 = A.dist - B.dist. Обгон — A вышел вперёд B больше чем на корпус (6.04 м), пока B
   под ограничением и держит темп (не ниже половины своего потолка за всю нейтрализацию),
   причём на входе A был ПОЗАДИ (d0 < 0): вернуть место, в котором вошёл, — не обгон.
   Обгон относится к одному из классов по d0:
     «сзади»   — d0 < -6.04: A догнал B уже под флагом (это правило NEUT_GAP обязано держать);
     «вровень» — |d0| <= 6.04 и A был позади: пара вошла под флаг, перекрываясь корпусами
                 (известная дыра §5: правило дистанции с такой парой ничего не может сделать);
   и ещё по тому, через сколько секунд после образования пары он случился.
   Спорным считается обгон, если жертва ехала быстрее NEUT_STOPPED в миг обгона И НИ РАЗУ
   не вставала, пока пара была рядом (итог «спорные»): объезжать вставшего правила разрешают.

   ЗАМЕР 30.09.2026, Норма, 7 зёрен, все видимые трассы, 25 заездов VSC + 28 жёлтых:
                         спорных   из них вровень / сзади   с игроком
       v1.16.17 (main)     35             35 / 0                9
       flag-order-build     8              8 / 0                4
   То есть дыра целиком в парах, вошедших под флаг вровень; прорывов сзади вопреки
   NEUT_GAP нет вовсе (все «сзади» в сыром счёте — объезд вставших).

   ТРИ ЛОВУШКИ МЕРКИ, все свои:
   (1) «побывал позади и вышел вперёд» засчитывал возврат СВОЕГО места: кто вошёл
       впереди, на миг отстал и вернул своё — не обгон (на main 52 из 118 были ими);
   (2) скорость жертвы в миг обгона не говорит, законен ли он: обгон начат, пока
       жертва стояла, а засчитан, когда она уже поехала (на опытной сборке 53 -> 8);
   (3) быстрый автопилот (`--fast=1`, как в neutral-audit) под VSC упирается в
       вставшего и стоит на 2 м/с весь флаг — поэтому по умолчанию штатный.
   Ключи: --mode=yellow|vsc  --seeds=7,91,3,5,13,23,42  --pos=11  --diff=normal  --fast=0
          --tracks=Monza,Miami  --file=другая/сборка.html  --list=1 (печатать каждый обгон) */
'use strict';
const H = require('./harness');
const PASS = 6.04;

const FASTAP = `
__AP.fast = function(){
  var s = this.steer();
  var M=track.M, ah=6+Math.round(player.speed*0.6), v=MAXSPEED*track.grip;
  for(var a=1;a<ah;a++){var vc=playerCornerV((s.idx+a)%M);
    var vv=Math.sqrt(vc*vc+2*(MAXSPEED/5)*a*(track.length/M));
    if(vv<v)v=vv;}
  if(player.speed>v+1.0){controls.gas=0;controls.brake=1;}
  else if(player.speed>v){controls.gas=0;controls.brake=0;}
  else{controls.gas=1;controls.brake=0;}
  return s;};
function __driveFast(n,dt){for(var f=0;f<n;f++){__AP.fast();if(phase==='')return f;update(dt);}return n;}
`;

function runOne(T, seed, pos, fast, mode) {
  const env = H.loadGame({ seed, file: FILE });
  H.setupWeekend(env, { trackIdx: T.idx, diff: DIFF, laps: 3 });
  H.startRaceAt(env, pos);
  H.lightsOut(env);
  env.evalIn(FASTAP, 'harness(fastap)');
  return env.evalIn(`(function(){
    var dt=1/60, PASS=${PASS}, drv=${fast ? '__AP.fast' : '__AP.drive'}, WANT='${mode}';
    field.forEach(function(c){c.retireAt=0;});
    ${fast ? '__driveFast' : '__drive'}(Math.round(12/dt),dt${fast ? '' : ",'auto'"});
    var victim=field[3];
    if(WANT==='vsc'){var bi=-1;
      for(var i=0;i<track.M&&bi<0;i++){for(var s2=-1;s2<=1;s2+=2){
        var sp=retireSpot({u:i/track.M,lane:s2*3}), ok=true;
        for(var k=-1;k<=1;k+=2){var ang=sp.base*k,hw2=carHalfWidth(ang),w=wallAt(sp.i,sp.side);
          var off2=Math.min(sp.hw+hw2+0.2,w-hw2); if(!(off2-hw2<sp.hw-0.05))ok=false;}
        if(ok){bi=i;break;}}}
      if(bi<0)return {skip:'нет узкого места'};
      victim.u=bi/track.M; victim.dist=track.S[bi]; retireCar(victim);}
    else victim.retireAt=victim.dist+1;
    var idxOf=function(c){return c.isPlayer?(player.hint||0):Math.floor(((c.u%1)+1)%1*track.M)%track.M;};
    var offOf=function(c){if(!c.isPlayer)return c.lane||0;var i=idxOf(c),P=track.P[i],R=track.R[i];return (player.x-P.x)*R.x+(player.z-P.z)*R.z;};
    var nm=function(c){return c.isPlayer?'ИГРОК':c.code;};
    var pairs={}, crawled={}, ev=[], mode0='', n=0, max=Math.round(80/dt), flagT=null;
    while(n<max&&!raceOver){
      drv.call(__AP); update(dt); n++;
      var m=neutral.mode; if(!mode0&&m)mode0=(m==='ending'?'vsc':m);
      var on=(WANT==='vsc')?(m==='vsc'||m==='ending'):(m==='yellow');
      if(!on){if(m==='green')pairs={};continue;}
      if(flagT===null)flagT=raceTime;
      var L=cars.filter(function(c){return !c.retired;}), nz={};
      for(var q=0;q<L.length;q++){var c=L[q], i2=idxOf(c), z=neutralAt(i2); nz[c.num]=z;
        if(z){var cap=(c.isPlayer?playerFreeAt(i2):c.free)*neutShare(z); if(c.speed<cap*0.5)crawled[c.num]=true;}}
      for(var a=0;a<L.length;a++){var A=L[a]; if(!nz[A.num])continue;
        for(var b=0;b<L.length;b++){if(a===b)continue; var B=L[b]; if(!nz[B.num])continue;
          var key=A.num+'>'+B.num, P=pairs[key], d=A.dist-B.dist;
          if(Math.abs(d)>300)continue;                    // другой виток
          if(!P){pairs[key]=P={d0:d,t0:raceTime,min:d,lat0:Math.abs(offOf(A)-offOf(B)),done:false,
                  onset:raceTime-flagT<0.05};continue;}
          if(d<P.min)P.min=d;
          /* A обязан был быть позади B НА ВХОДЕ: кто вошёл впереди, на миг отстал и вернул
             своё — не обгон. Первая редакция требовала лишь «побывал позади» и засчитывала
             такие возвраты: на v1.16.17 из 118 «обгонов» 52 были ими. */
          if(B.speed<NEUT_STOPPED)P.stopped=true;        // B вставал, пока пара рядом: объезжать вставшего правила разрешают
          if(P.done||d<=PASS||P.d0>=0)continue;
          P.done=true;
          ev.push({by:nm(A),of:nm(B),byP:!!A.isPlayer,ofP:!!B.isPlayer,
            cls:P.d0<-PASS?'сзади':'вровень', d0:+P.d0.toFixed(1), min:+P.min.toFixed(1), lat0:+P.lat0.toFixed(1),
            dt:+(raceTime-P.t0).toFixed(1), tf:+(raceTime-flagT).toFixed(1), onset:P.onset,
            ofNum:B.num, stopped:!!P.stopped, vOf:+B.speed.toFixed(1)});
        }}
    }
    ev.forEach(function(e){e.held=!crawled[e.ofNum];});
    return {mode0:mode0, ev:ev};
  })()`);
}

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const seeds = arg('seeds', '7,91,3,5,13,23,42').split(',').map(Number);
const pos = +arg('pos', '11');
const fast = arg('fast', '0') === '1';          // штатный автопилот, как в пробнике: быстрый упирается в вставшего под VSC
const mode = arg('mode', 'yellow');
const FILE = arg('file', '') || undefined;
const DIFF = arg('diff', 'normal');
const only = arg('tracks', '');
const list = arg('list', '0') === '1';

const tot = { runs: 0 }, add = (k) => { tot[k] = (tot[k] || 0) + 1; };
for (const T of H.tracks(true)) {
  if (only && only.split(',').indexOf(T.name) < 0) continue;
  let tr = {};
  for (const seed of seeds) {
    const r = runOne(T, seed, pos, fast, mode);
    if (r.skip || r.mode0 !== mode) { console.log(`${T.name} зерно ${seed}: ${r.skip || r.mode0 || 'нет флага'} — пропуск`); continue; }
    tot.runs++;
    for (const e of r.ev) {
      if (e.vOf >= 6) add('обгонов над едущим (≥6 м/с, мерка игры и neutral-audit)');
      if (e.vOf >= 6 && !e.stopped) add('…из них жертва НИ РАЗУ не вставала, пока пара рядом (спорные)');
      if (!e.held) { add('разрешённых (жертва проваливалась ниже половины потолка)');
        if (list) console.log(`  (разрешён) ${T.name} з${seed} +${e.tf} с: ${e.by} обошёл ${e.of} (${e.vOf} м/с), ${e.cls}, зазор на входе ${e.d0} м${e.stopped ? ' [жертва вставала]' : ''}`);
        continue; }
      const who = e.byP || e.ofP ? 'игрок' : 'ИИ-ИИ';
      const when = e.dt < 3 ? 'за 3 с' : 'позже';
      add(e.cls); add(e.cls + ' · ' + who); add(e.cls + ' · ' + when); add('трасса ' + T.name);
      if (e.onset) add(e.cls + ' · пара сложилась в миг подъёма флага');
      tr[e.cls] = (tr[e.cls] || 0) + 1;
      if (list) console.log(`  ${T.name} з${seed} +${e.tf} с: ${e.by} обошёл ${e.of} · ${e.cls}, зазор на входе ${e.d0} м`
        + `${e.stopped ? ' [жертва вставала]' : ''} (худший ${e.min}), вбок ${e.lat0} м, через ${e.dt} с после образования пары${e.onset ? ' (в миг флага)' : ''}`);
    }
  }
  console.log(`${T.name.padEnd(12)} спорных: сзади ${tr['сзади'] || 0}, вровень ${tr['вровень'] || 0}`);
}
console.log(`\nИТОГО ${mode === 'vsc' ? 'VSC' : 'жёлтый'}, ${DIFF}, заездов ${tot.runs}:`);
for (const k of Object.keys(tot).sort()) if (k !== 'runs') console.log(`  ${k}: ${tot[k]}`);
