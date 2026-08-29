/* ============================================================================
   Пробник 17 — БАШНЯ С ПОЗИЦИЯМИ НЕ МЕЛЬТЕШИТ

   Смотрит на ТОТ ЖЕ порядок строк, который игра рисует в башне (towerOrder),
   и считает:
     • перестановки строк за гонку;
     • «мельтешение» — пара строк поменялась и вернулась обратно за 3 с;
     • запас, с которым состоялась перестановка: насколько обгоняющий был
       впереди в момент смены строк.

   ЗАЧЕМ. Владелец увидел в гонке (08.2026), что его строка в башне меняется,
   когда соперник вылез вперёд «хотя бы на передний спойлер». Он прав, и это
   было устройство, а не случайность: dist меряется по ЦЕНТРУ болида, а строки
   сортировались без гистерезиса, поэтому идущие нос-в-хвост пересекали ноль
   десятками раз за гонку. На Монце это давало 142 перестановки за гонку,
   из них 25 «туда-обратно за 3 с»; строка игрока меняла место 29 раз, и в 28 %
   случаев соперник и через секунду не был впереди даже на корпус.

   ЧТО ПРОВЕРЯЕТСЯ. Строки меняются местами только когда обгоняющий прошёл
   на корпус (TOWER_HYST = 6.04 м), и мельтешения почти нет.

   Порог мельтешения грубый: он ловит возврат к сортировке без защёлки
   (там 15–25 за гонку), а не дрожание в пару штук. Проверен на архивной
   v1.15.47 — валится на всех трёх трассах.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const FLIP_MAX = 5;          // «туда-обратно за 3 с» за гонку на трассу
const BODY = 6.04;           // корпус болида
const MARGIN_MIN = 0.99 * BODY;   // допуск на кадр дискретизации

function run(opt) {
  opt = opt || {};
  const r = R.result('Башня с позициями: строка меняется только при обгоне на корпус');
  const seeds = opt.seeds ? String(opt.seeds).split(',').map(Number) : [7, 91, 13];
  const laps = opt.laps || 3;

  for (const T of H.tracks(true)) {
    let sw = 0, flip = 0, worst = 0, dur = 0, minMarg = Infinity, playerSw = 0, playerFlip = 0;
    for (const seed of seeds) {
      const env = H.loadGame({ seed });
      H.setupWeekend(env, { trackIdx: T.idx, diff: opt.diff || 'normal', laps });
      H.startRaceAt(env, 11);
      H.lightsOut(env);
      H.noRetirements(env);       // сход перекладывает строки по своему правилу — это другой раздел
      const o = env.evalIn(`(function(){
        var dt=1/60, N=cars.length, K=function(a,b){return a+'|'+b;};
        // на сборках до v1.15.48 защёлки нет — там башня и есть голая сортировка
        var ORD=(typeof towerOrder==='function')?towerOrder:function(){return cars.slice().sort(rankCmp);};
        var rank=function(){var o=ORD(), m=new Array(N);
          for(var i=0;i<o.length;i++) m[cars.indexOf(o[i])]=i; return m;};
        var pi=0; for(var i=0;i<N;i++) if(cars[i].isPlayer) pi=i;
        var pr=rank(), sign={}, last={}, cnt={}, a, b;
        for(a=0;a<N;a++)for(b=a+1;b<N;b++) sign[K(a,b)] = pr[a]<pr[b] ? 1 : -1;
        var sw=0, flip=0, worst=0, tEnd=0, minMarg=Infinity, psw=0, pflip=0, prank=pr[pi];
        __drive(Math.round(900/dt),dt,'auto',function(){
          tEnd=raceTime;
          var cur=rank();
          for(var a=0;a<N;a++)for(var b=a+1;b<N;b++){
            var k=K(a,b), s=cur[a]<cur[b] ? 1 : -1;
            if(s===sign[k]) continue;
            sign[k]=s; sw++;
            if(last[k]!==undefined&&raceTime-last[k]<3.0){flip++;cnt[k]=(cnt[k]||0)+1;if(cnt[k]>worst)worst=cnt[k];
              if(a===pi||b===pi) pflip++;}
            last[k]=raceTime;
            var m=Math.abs(cars[a].dist-cars[b].dist); if(m<minMarg) minMarg=m;}
          if(cur[pi]!==prank){ psw++; prank=cur[pi]; }
          return !(phase===''||raceOver);});
        return {sw:sw,flip:flip,worst:worst,t:tEnd,m:minMarg,psw:psw,pflip:pflip};})()`);
      sw += o.sw; flip += o.flip; dur += o.t; playerSw += o.psw; playerFlip += o.pflip;
      if (o.worst > worst) worst = o.worst;
      if (o.m < minMarg) minMarg = o.m;
    }
    const n = seeds.length;
    r.line(`${T.name.padEnd(12)} перестановок ${(sw / n).toFixed(0)} за гонку`
      + ` · мельтешения ${(flip / n).toFixed(1)} (${(100 * flip / Math.max(1, sw)).toFixed(0)} %)`
      + ` · худшая пара ${worst}`
      + ` · строка игрока ${(playerSw / n).toFixed(1)} смен, мельтешения ${(playerFlip / n).toFixed(1)}`
      + ` · наименьший запас ${isFinite(minMarg) ? minMarg.toFixed(2) + ' м' : '—'}`);
    if (flip / n > FLIP_MAX)
      r.fail(`${T.name}: башня мельтешит — ${(flip / n).toFixed(1)} перестановок «туда-обратно за 3 с»`
        + ` за гонку при пороге ${FLIP_MAX}`);
    if (isFinite(minMarg) && minMarg < MARGIN_MIN)
      r.fail(`${T.name}: строки поменялись местами при запасе ${minMarg.toFixed(2)} м`
        + ` — меньше корпуса (${BODY} м), значит защёлки нет`);
  }

  r.note('итог гонки считается честным rankCmp, защёлка — только показ');
  r.note('сходы выключены: сошедший переезжает вниз башни по своему правилу');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
