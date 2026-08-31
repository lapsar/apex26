/* ============================================================================
   Пробник 18 — ПОКАЗ ЛУЧШЕГО КРУГА ГОНКИ (плашка + значок «БК»)

   Рекорд круга меняет владельца ВСПЫШКАМИ: все 22 болида пересекают линию
   почти одновременно. Замер 08.2026 (3 трассы × 5 зёрен, гонка 3 круга) дал
   2–6 смен владельца за гонку, до трёх за 0.9 с подряд. Показывать каждую
   значило бы гнать плашки очередью, поэтому показ ждёт FL_HOLD = 3 с и берёт
   последнего владельца вспышки; значок «БК» в башне загорается тем же
   движением (решение владельца), поэтому оба смотрят на flShown.

   Здесь проверяется ровно это поведение — числами, а не глазами:
     1. в гонке плашка показывается и её не больше, чем смен рекорда;
     2. вспышка из трёх рекордов подряд даёт ОДНУ плашку, и по последнему;
     3. под нейтрализацией плашки нет (флаг важнее), но значок загорается;
     4. после клетчатого флага новых плашек нет, значок по-прежнему живёт.

   Картинку проверяет не он, а tools/shot-hud.js.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const SEED = 7;

/* Наблюдение за показом: возвращает счётчики за прогон в N кадров.
   Всё читается прямо из переменных игры — DOM-заглушка харнесса башню
   не строит, а флаговую панель отдаёт как innerHTML. */
const WATCH = `function(frames,dt,drive){
  var plates=0,changes=0,last=-1,prevPlate=false,dur=0,maxDur=0,badText=0,underFlag=0;
  for(var f=0;f<frames;f++){
    if(drive)__AP.drive();
    update(dt);
    if(isFinite(fastestLap.time)&&fastestLap.time!==last){last=fastestLap.time;changes++;}
    var on=(typeof flPlate!=='undefined')&&flPlate>0;
    if(on&&!prevPlate){plates++;dur=0;
      var h=document.getElementById('flagpanel').innerHTML||'';
      if(h.indexOf('ЛУЧШИЙ КРУГ ГОНКИ')<0){                 // плашки нет — значит её перебил флаг
        if(h.indexOf('ЖЁЛТЫЙ')>=0||h.indexOf('VSC')>=0)underFlag++; else badText++;}
      else if(h.indexOf(fmt(flShown.time))<0)badText++;      // названо не то время
    }
    if(on)dur+=dt; else if(prevPlate)maxDur=Math.max(maxDur,dur);
    prevPlate=on;
    if(phase===''||raceOver)break;
  }
  if(prevPlate)maxDur=Math.max(maxDur,dur);
  return {plates:plates,changes:changes,maxDur:+maxDur.toFixed(2),badText:badText,underFlag:underFlag,
          shown:(typeof flShown!=='undefined'&&flShown)?{t:+flShown.time.toFixed(3),who:flShown.name,you:!!flShown.you}:null};
}`;

function racePrep(trackIdx, laps) {
  const env = H.loadGame({ seed: SEED });
  H.setupWeekend(env, { trackIdx, diff: 'normal', laps: laps || 1 });
  H.startRaceAt(env, 11);
  H.lightsOut(env);
  H.noRetirements(env);                       // сход поднял бы флаг и увёл плашку — это отдельный раздел
  if (env.evalIn(`typeof flPlate`) === 'undefined') return null;
  return env;
}

function run(opt) {
  opt = opt || {};
  const r = R.result('Лучший круг гонки: плашка и значок «БК»');
  const tracks = H.tracks(true);

  /* ---- 1. ЖИВАЯ ГОНКА ---- */
  let missing = false;
  for (const T of tracks) {
    const env = racePrep(T.idx, opt.laps || 1);
    if (!env) { missing = true; break; }
    const u = env.evalIn(`(${WATCH})(Math.round(300*60),1/60,true)`);
    r.line(`${T.name.padEnd(12)} смен рекорда ${u.changes} · плашек ${u.plates} · дольше всего висела ${u.maxDur} с`
      + (u.shown ? ` · значок у ${u.shown.who} ${R.lap ? R.lap(u.shown.t) : u.shown.t}` : ' · значок не горит'));
    if (!u.plates) r.fail(`${T.name}: за гонку рекорд менялся ${u.changes} раз, а плашка не показалась ни разу`);
    if (u.plates > u.changes) r.fail(`${T.name}: плашек ${u.plates} при ${u.changes} сменах рекорда`);
    if (u.badText) r.fail(`${T.name}: ${u.badText} раз плашка назвала не то, что держит значок`);
    if (u.maxDur > 3.6) r.fail(`${T.name}: плашка висела ${u.maxDur} с вместо 3`);
    if (!u.shown) r.fail(`${T.name}: значок «БК» не загорелся ни у кого`);
  }
  if (missing) {
    r.fail('в сборке нет показа лучшего круга гонки (переменной flPlate) — плашка и значок «БК» отсутствуют');
    return r;
  }

  /* ---- 2. ВСПЫШКА: три рекорда подряд — одна плашка ---- */
  {
    const env = racePrep(0, 1);
    const u = env.evalIn(`(function(){
      var dt=1/60;
      for(var f=0;f<60*8;f++){__AP.drive();update(dt);}      // разъехаться, чтобы рекорд ставился не в свалке
      var names=['ALPHA','BRAVO','CHARLIE'],out=[];
      var c=field[0];
      for(var i=0;i<3;i++){
        fastestLap={time:60-i*0.4,name:names[i],team:'TEAM',color:'#fff',you:false,car:c};
        out.push((${WATCH})(Math.round(0.4*60),dt,true));     // следующий рекорд через 0.4 с — внутри окна ожидания
      }
      var tail=(${WATCH})(Math.round(6*60),dt,true);
      var plates=out.reduce(function(a,b){return a+b.plates;},0)+tail.plates;
      return {plates:plates,shown:flShown?flShown.name:null,t:flShown?+flShown.time.toFixed(1):null};
    })()`);
    r.line(`вспышка из трёх рекордов за 0.8 с · плашек ${u.plates} · значок у ${u.shown} ${u.t}`);
    if (u.plates !== 1) r.fail(`вспышка из трёх рекордов дала ${u.plates} плашек вместо одной`);
    if (u.shown !== 'CHARLIE') r.fail(`после вспышки показан «${u.shown}» вместо последнего рекордсмена`);
  }

  /* ---- 3. ПОД НЕЙТРАЛИЗАЦИЕЙ ПЛАШКИ НЕТ, ЗНАЧОК ЕСТЬ ---- */
  {
    const env = racePrep(0, 1);
    const u = env.evalIn(`(function(){
      var dt=1/60;
      for(var f=0;f<60*8;f++){__AP.drive();update(dt);}
      neutral={mode:'vsc',left:60,secs:[],cars:[]};            // VSC накрывает весь круг: плашка флага горит всегда
      fastestLap={time:59.5,name:'DELTA',team:'TEAM',color:'#fff',you:false,car:field[0]};
      var u=(${WATCH})(Math.round(6*60),dt,true);
      var h=document.getElementById('flagpanel').innerHTML||'';
      // «действует ли нейтрализация» спрашиваем у самой игры, а не у панели: если панель
      // перебита плашкой рекорда, по её тексту выйдет «флага не было» — то есть пробник
      // объявит раздел недостоверным ровно в том случае, ради которого он и написан
      return {plates:u.plates,underFlag:u.underFlag,vsc:vscOn(),panel:h.indexOf('VSC')>=0,shown:flShown?flShown.name:null};
    })()`);
    r.line(`под VSC · плашек ${u.plates} (перебито флагом ${u.underFlag}) · панель показывает ${u.panel ? 'VSC' : 'НЕ VSC'} · значок у ${u.shown}`);
    if (!u.vsc) r.fail('раздел 3 недостоверен: нейтрализация не действовала, проверять было нечего');
    else if (u.plates !== u.underFlag || !u.panel)
      r.fail(`под нейтрализацией плашка лучшего круга перебила флаг: панель показывала ${u.panel ? 'VSC' : 'рекорд'}, не перебито ${u.plates - u.underFlag} из ${u.plates}`);
    if (u.shown !== 'DELTA') r.fail(`под нейтрализацией значок «БК» не перешёл к новому рекордсмену (показан «${u.shown}»)`);
  }

  /* ---- 4. ПОСЛЕ КЛЕТЧАТОГО ФЛАГА ПЛАШЕК НЕТ ---- */
  {
    const env = racePrep(0, 1);
    const u = env.evalIn(`(function(){
      var dt=1/60;
      for(var f=0;f<60*8;f++){__AP.drive();update(dt);}
      raceOver=true;raceOutro=true;                            // так же, как после finishRace
      fastestLap={time:58.5,name:'ECHO',team:'TEAM',color:'#fff',you:true,car:player};
      var plates=0,prev=false;
      for(var f=0;f<Math.round(8*60);f++){update(dt);var on=flPlate>0;if(on&&!prev)plates++;prev=on;}
      return {plates:plates,shown:flShown?flShown.name:null};
    })()`);
    r.line(`после клетчатого флага · плашек ${u.plates} · значок у ${u.shown}`);
    if (u.plates) r.fail(`после финиша показана плашка лучшего круга (${u.plates})`);
    if (u.shown !== 'ECHO') r.fail(`после финиша значок «БК» не перешёл к новому рекордсмену (показан «${u.shown}»)`);
  }

  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
