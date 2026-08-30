/* СПРАВКА (не пробник, порога нет): меняются ли места под ЖЁЛТЫМ флагом.
   Пробник `neutral` считает обгоны только в парах, где ОБА болида в зоне,
   и пары с игроком из счёта выбрасывает вовсе. Эта справка считает ВСЕ пары
   и печатает, в каком секторе был каждый в момент обгона — так видно и обгоны
   на границе зоны, и обгоны игрока.
   Заодно печатает мерку «держит ли темп»: долю фактической скорости от потолка,
   отдельно у игрока и у ИИ. Ключи:
     --seeds=7,91  --pos=11  --fast=0|1  --hc=0.62  --quiet=1
   --hc<1 — автопилот с гандикапом, грубая замена неопытному пилоту (ребёнку). */
'use strict';
const H = require('./harness');
const PASS = 6.04;

const FASTAP = `
// «ребёнок»: тот же автопилот, но целевая скорость умножена на HC — грубая замена
// неопытному пилоту (тормозит раньше, разгоняется не до конца)
var __HC=1;
__AP.kid=function(){var s=this.steer();
  controls.left=s.st<-0.12?1:0;controls.right=s.st>0.12?1:0;
  var v=this.safeSpeed(s.idx)*__HC;
  if(player.speed>v+1.0){controls.gas=0;controls.brake=1;}
  else if(player.speed>v){controls.gas=0;controls.brake=0;}
  else{controls.gas=1;controls.brake=0;}
  return s;};
function __driveKid(n,dt,watch){for(var f=0;f<n;f++){__AP.kid();if(phase==='')return f;update(dt);if(watch&&watch(f)===false)return f+1;}return n;}

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
function __driveFast(n,dt,watch){for(var f=0;f<n;f++){__AP.fast();if(phase==='')return f;update(dt);if(watch){if(watch(f)===false)return f+1;}}return n;}
`;

function runOne(T, seed, pos, fast, hc) {
  const env = H.loadGame({ seed });
  H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 3 });
  H.startRaceAt(env, pos);
  H.lightsOut(env);
  env.evalIn(FASTAP, 'harness(fastap)');
  return env.evalIn(`(function(){
    var dt=1/60, PASS=${PASS}; __HC=${hc}; var drv=${hc}<1?__AP.kid:${fast?'__AP.fast':'__AP.drive'};
    field.forEach(function(c){c.retireAt=0;});
    ${hc}<1?__driveKid(Math.round(12/dt),dt):${fast?'__driveFast':'__drive'}(Math.round(12/dt),dt${fast?'':",'auto'"});
    var victim=field[3]; victim.retireAt=victim.dist+1;
    var idxOf=function(c){return c.isPlayer?(player.hint||0):Math.floor(((c.u%1)+1)%1*track.M)%track.M;};
    var live=function(){return cars.filter(function(c){return !c.retired;});};
    var mode0='', n=0, max=Math.round(80/dt);
    var pairs=null, ev=[], rankY0=null, rankYEnd=null, yT=0, seen={}, capOver=0, capN=0, slowN=0, ratio=[], aiN=0, aiSlow=0, aiRatio=[];
    while(n<max && !raceOver){
      drv.call(__AP); update(dt); n++;
      var m=neutral.mode;
      if(!mode0&&m)mode0=m;
      if(m!=='yellow'){ if(m==='green')pairs=null; continue; }
      yT+=dt;
      var L=live(), nz={}, sp={}, pace={}, held={};
      for(var i=0;i<L.length;i++){var c=L[i], k=c.code;
        nz[k]=neutralAt(idxOf(c)); sp[k]=c.speed; pace[k]=paceAt(c); held[k]=sp[k]>=pace[k]*0.5;
        if(nz[k])seen[k]=n; }                                  // кадр, когда болид последний раз был в зоне
      var pnz=neutralAt(player.hint||0);
      if(pnz){capN++; if(player.speed>neutralCap(player.hint,player.speed,pnz)+3)capOver++;
              var pr_=paceAt(player); if(player.speed<pr_*0.5)slowN++; ratio.push(player.speed/Math.max(1,pr_));}
      for(var q=0;q<L.length;q++){var qc=L[q]; if(qc.isPlayer)continue; if(!nz[qc.code])continue;
        aiN++; if(qc.speed<pace[qc.code]*0.5)aiSlow++; aiRatio.push(qc.speed/Math.max(1,pace[qc.code]));}
      var ord=L.slice().sort(rankCmp), pi=ord.indexOf(player)+1;
      if(rankY0===null)rankY0=pi; rankYEnd=pi;
      if(!pairs){pairs={};
        for(var a=0;a<L.length;a++)for(var b=0;b<L.length;b++)if(a!==b)pairs[L[a].code+'>'+L[b].code]=L[a].dist-L[b].dist;
      } else {
        for(var a2=0;a2<L.length;a2++)for(var b2=0;b2<L.length;b2++){
          if(a2===b2)continue;
          var A=L[a2], B=L[b2], key=A.code+'>'+B.code, was=pairs[key];
          if(was===undefined){pairs[key]=A.dist-B.dist;continue;}
          var now=A.dist-B.dist;
          if(was<-PASS && now>PASS){ pairs[key]=now;
            var recent=function(k){return seen[k]!==undefined && (n-seen[k])*dt<4;};   // был в зоне в последние 4 с — то есть обгон шёл в зоне или у самой её кромки
            ev.push({t:+raceTime.toFixed(1), by:A.code, of:B.code, byP:!!A.isPlayer, ofP:!!B.isPlayer,
                     nzBy:nz[A.code], nzOf:nz[B.code], zBy:recent(A.code), zOf:recent(B.code),
                     held:held[B.code], vOf:+sp[B.code].toFixed(1), pOf:+pace[B.code].toFixed(1),
                     vBy:+sp[A.code].toFixed(1), pBy:+pace[A.code].toFixed(1)});
          } else if(now<was) pairs[key]=now;   // опорой служит САМОЕ заднее положение: иначе обгон никогда не поймать
        }
      }
    }
    return {mode0:mode0, yT:+yT.toFixed(1), rankY0:rankY0, rankYEnd:rankYEnd, ev:ev,
            capOver:capOver, capN:capN, slowN:slowN, aiN:aiN, aiSlow:aiSlow,
            aiMed:(function(){if(!aiRatio.length)return null;var a=aiRatio.slice().sort(function(x,y){return x-y;});return +a[a.length>>1].toFixed(2);})(),
            ratioMed:(function(){if(!ratio.length)return null;var a=ratio.slice().sort(function(x,y){return x-y;});return +a[a.length>>1].toFixed(2);})()};
  })()`);
}

const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith('--'+k+'='));return a?a.split('=')[1]:d;};
const seeds = arg('seeds','7,91,3,5,13,23,42').split(',').map(Number);
const poss  = arg('pos','11').split(',').map(Number);
const fast  = arg('fast','1')==='1';
const hc    = +arg('hc','1');
const quiet = arg('quiet','0')==='1';

let tot={all:0,zone:0,both:0,edge:0,pby:0,pof:0,heldv:0}, runs=0, lost=0, gained=0;
for (const T of H.tracks(true)) {
  for (const seed of seeds) for (const pos of poss) {
    const r = runOne(T, seed, pos, fast, hc);
    if (r.mode0 !== 'yellow') { console.log(`${T.name} зерно ${seed} P${pos}: ${r.mode0||'нет флага'} — пропуск`); continue; }
    runs++;
    const zev = r.ev.filter(e=>e.nzBy||e.nzOf);          // хотя бы один участник В ЗОНЕ в момент обгона
    const both = zev.filter(e=>e.nzBy&&e.nzOf).length, edge = zev.length-both;
    const pby = zev.filter(e=>e.byP).length, pof = zev.filter(e=>e.ofP).length;
    const heldv = zev.filter(e=>e.held).length;
    tot.all+=r.ev.length;tot.zone+=zev.length;tot.both+=both;tot.edge+=edge;tot.pby+=pby;tot.pof+=pof;tot.heldv+=heldv;
    if(r.rankYEnd>r.rankY0)lost++; if(r.rankYEnd<r.rankY0)gained++;
    console.log(`${T.name.padEnd(12)} зерно ${String(seed).padStart(2)} P${pos} · жёлтый ${r.yT} с · игрок ${r.rankY0}->${r.rankYEnd}`
      + `\n    ИГРОК в зоне ${r.capN} кадров: медиана доли от потолка ${r.ratioMed}, ниже половины ${(100*r.slowN/Math.max(1,r.capN)).toFixed(0)} % кадров`
      + `\n    ИИ   в зоне ${r.aiN} кадро-машин: медиана доли ${r.aiMed}, ниже половины ${(100*r.aiSlow/Math.max(1,r.aiN)).toFixed(0)} %`
      + ` · обгонов при участии зоны ${zev.length} (оба в зоне ${both}, один ${edge}; игрок обогнал ${pby}, игрока обогнали ${pof}, жертва держала темп ${heldv})`);
    if(!quiet) for (const e of zev)
      console.log(`    ${String(e.t).padStart(6)} с  ${e.by}${e.byP?'(ИГРОК)':''} обошёл ${e.of}${e.ofP?'(ИГРОК)':''}`
        + ` · сектор в момент обгона: обгонявший ${e.nzBy?'жёлтый':'ГОНКА'}, обгоняемый ${e.nzOf?'жёлтый':'ГОНКА'}`
        + ` · жертва ${e.vOf} м/с при потолке ${e.pOf} (${e.held?'ДЕРЖАЛА ТЕМП':'провалилась'})`);
  }
}
console.log(`\nИТОГО за ${runs} заездов (игрок ${hc<1?'автопилот с гандикапом '+hc:(fast?'быстрый':'штатный')+' автопилот'}):`);
console.log(`  обгонов всего ${tot.all}, из них с участием зоны ${tot.zone} · оба в зоне ${tot.both} · только один ${tot.edge}`);
console.log(`  игрок обогнал ${tot.pby} · игрока обогнали ${tot.pof} · жертва ДЕРЖАЛА темп в ${tot.heldv} случаях`);
console.log(`  место игрока за жёлтый: потерял в ${lost} заездах, отыграл в ${gained}`);
