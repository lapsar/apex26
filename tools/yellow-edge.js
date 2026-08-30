/* СПРАВКА (не пробник): управляемый опыт — что происходит НА ГРАНИЦЕ жёлтой зоны.
   Ключи: --kind=A|B|Q  --gap=35  --deep=0|1  --frac=0.45  --track=Monza  --seed=7
   A — игрок сзади, соперник впереди; B — наоборот; Q — очередь из трёх в зоне.
   --frac — держать игрока на этой доле его потолка (проверка порога «половина»).
   Потолок и правило дистанции NEUT_GAP накладываются на болид только тогда,
   когда В ЗОНЕ ОН САМ. Значит на въезде в зону передний уже ограничен, а задний ещё нет.
   Опыт A: игрок сзади и ещё вне зоны, соперник впереди уже в зоне.
   Опыт B: игрок в зоне, соперник сзади ещё вне её.
   Контроль: та же пара, но оба глубоко внутри зоны — там §4-bis обещает ноль. */
'use strict';
const H = require('./harness');

const SRC = `
function __arcIdx(a){var M=track.M,L=track.length;a=((a%L)+L)%L;
  var lo=0,hi=M-1;while(lo<hi){var mid=(lo+hi+1)>>1;if(track.S[mid]<=a)lo=mid;else hi=mid-1;}return lo;}
function __putPlayer(a,off,v){var i=__arcIdx(a),P=track.P[i],F=track.F[i],R2=track.R[i],e=a-track.S[i];
  player.x=P.x+F.x*e+R2.x*off;player.z=P.z+F.z*e+R2.z*off;player.hdg=Math.atan2(F.x,F.z);
  player.hint=i;player.prevIdx=i;player.lapLock=25;player.arcPrev=a;player.dist=a;player.speed=v;
  player.steerAmt=0;player.spdAvg=v;}
function __putAI(c,a,off,v){c.u=(((a/track.length)%1)+1)%1;c.dist=a;c.lane=off;c.speed=v;c.spdAvg=v;
  c.ovLock=null;c.duel=null;c.duelT=0;placeAI(c,0.0001);}
function __driveHold(n,dt,watch,frac){for(var f=0;f<n;f++){
  var s=__AP.steer();controls.left=s.st<-0.12?1:0;controls.right=s.st>0.12?1:0;
  if(frac){var nz=neutralAt(player.hint||0),want=playerFreeAt(player.hint||0)*(nz?neutShare(nz):1)*frac;
    controls.gas=player.speed<want?1:0;controls.brake=player.speed>want+0.5?1:0;}
  else {controls.gas=1;controls.brake=0;}
  update(dt);if(watch&&watch(f)===false)return f+1;}return n;}
`;

/* Цена жёлтого по времени: проезд двух секторов зоны под флагом против свободного.
   Один и тот же участок, один и тот же водитель, поле убрано с дороги. */
function costRun(T, seed, sector, withFlag) {
  const env = H.loadGame({ seed, file: FILE });
  H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 30 });
  H.startRaceAt(env, 11);
  H.lightsOut(env);
  env.evalIn(SRC, 'harness(edge)');
  return env.evalIn(`(function(){
    var dt=1/60, L=track.length, SEC=L/MARSHAL_SECTORS;
    field.forEach(function(c){c.retireAt=0;});
    __drive(Math.round(6/dt),dt,'auto');
    var z0=${sector}*SEC;
    // поле — за полкруга отсюда, чтобы никто не мешал: меряем чистую цену ограничения
    var live=field.filter(function(c){return !c.retired;});
    for(var i=0;i<live.length;i++)__putAI(live[i], z0-L*0.45+i*14, (i%2?1:-1)*2.5, 30);
    if(${withFlag}){var victim=live[0];
      __putAI(victim,(${sector}+1.5)*SEC,0,10); retireCar(victim);
      if(neutral.mode!=='yellow')return {skip:neutral.mode||'нет флага'};
      neutral.left=600;}                                  // флаг не должен погаснуть посреди замера
    var s0=z0-200, s1=z0+2*SEC;                           // разгон 200 м до зоны, финиш за её концом
    __putPlayer(s0,0,Math.min(playerFreeAt(__arcIdx(s0)),__AP.safeSpeed(__arcIdx(s0))));
    var t=0, off=0;
    // штатный автопилот, а не полный газ: на полном газу игрок вылетает в первом же повороте
    // и замер превращается в замер вылета
    for(var f=0;f<Math.round(60/dt);f++){
      __AP.drive();
      update(dt); t+=dt;
      var pr=project(player.x,player.z,player.hint);
      if(Math.abs(pr.off)>halfAt(pr.idx)+0.7)off++;
      if(player.dist>=s1)break;}
    return {t:+t.toFixed(2), off:off, done:player.dist>=s1};
  })()`);
}

function scenario(T, seed, sector, kind, gap, deep, frac) {
  const env = H.loadGame({ seed, file: FILE });
  H.setupWeekend(env, { trackIdx: T.idx, diff: 'normal', laps: 30 });
  H.startRaceAt(env, 11);
  H.lightsOut(env);
  env.evalIn(SRC, 'harness(edge)');
  return env.evalIn(`(function(){
    var dt=1/60, L=track.length, SEC=L/MARSHAL_SECTORS;
    field.forEach(function(c){c.retireAt=0;});
    __drive(Math.round(6/dt),dt,'auto');
    // поднять жёлтый в нужном секторе: сажаем жертву в сектор ${sector}+1, вне полотна
    var victim=field[10];
    var vArc=(${sector}+1.5)*SEC;
    __putAI(victim,vArc,0,10);
    retireCar(victim);
    if(neutral.mode!=='yellow')return {skip:neutral.mode||'нет флага'};
    var z0=${sector}*SEC;                              // начало жёлтой зоны (сектор ${sector} и следующий)
    var base=${deep} ? z0+SEC*0.9 : z0+25;             // где стоит СОПЕРНИК
    var rival=field.filter(function(c){return !c.retired;})[0];
    // все прочие — за полкруга отсюда, чтобы не мешали
    var others=field.filter(function(c){return !c.retired&&c!==rival;});
    for(var i=0;i<others.length;i++)__putAI(others[i], base-L*0.45+i*12, (i%2?1:-1)*2.5, 30);
    var pA, rA, queue=null;
    if('${kind}'==='Q'){                               // очередь под флагом: три соперника в зоне, игрок подъезжает снаружи
      queue=[rival].concat(others.slice(0,2));
      for(var q=0;q<queue.length;q++){var qa=base+q*16;
        __putAI(queue[q],qa,(q%2?1:-1)*1.2,aiTarget(__arcIdx(qa),40,queue[q].base,queue[q].cornerK||34)*YELLOW_PACE);}
      rA=base; pA=base-${gap};
    }
    else if('${kind}'==='A'){ rA=base; pA=base-${gap}; }
    else               { pA=base; rA=base-${gap}; }
    if(!queue)__putAI(rival,rA,0,aiTarget(__arcIdx(rA),40,rival.base,rival.cornerK||34)*(neutralAt(__arcIdx(rA))?YELLOW_PACE:1));
    __putPlayer(pA,0,playerFreeAt(__arcIdx(pA))*(neutralAt(__arcIdx(pA))?YELLOW_PACE:1)*(${frac}||1));
    var frac=${frac}; var g0=rival.dist-player.dist, gmin=g0, gend=g0, passed=false, off=0, wrap=false, nP0=neutralAt(player.hint), nR0=neutralAt(__arcIdx(rA));
    var pv=[],rv=[],slow=0,tot=0,nq=0;
    __driveHold(Math.round(8/dt),dt,function(f){
      if(neutralAt(player.hint||0)){tot++; if(player.speed<paceAt(player)*0.5)slow++;}
      if(queue){var np=0;for(var q2=0;q2<queue.length;q2++)if(player.dist-queue[q2].dist>6.04)np++;if(np>nq)nq=np;}
      var g=rival.dist-player.dist; if(Math.abs(g)>L*0.4)wrap=true;
      else {gend=g; if(g<gmin)gmin=g;
        if(g0>0 && g<-6.04)passed='игрок обогнал';
        if(g0<0 && g> 6.04)passed='обогнали игрока';}
      var pr=project(player.x,player.z,player.hint);
      if(Math.abs(pr.off)>halfAt(pr.idx)+0.7)off++;
      if(f%30===0){pv.push(+player.speed.toFixed(0));rv.push(+rival.speed.toFixed(0));}
      return neutral.mode==='yellow';},frac);
    return {g0:+g0.toFixed(1), gend:+gend.toFixed(1), gain:+(g0-gend).toFixed(1), passed:passed,
            nP0:nP0, nR0:nR0, off:off, wrap:wrap, pv:pv, rv:rv, slow:slow, tot:tot, nq:nq, queue:!!queue,
            K:+Math.abs(track.K[__arcIdx(z0)]).toFixed(3)};
  })()`);
}

const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith('--'+k+'='));return a?a.split('=')[1]:d;};
const FILE = (process.argv.find(x=>x.startsWith('--file='))||'').split('=')[1] || undefined;
const kind = arg('kind','A'), gap = +arg('gap','35'), deep = arg('deep','0')==='1', frac = +arg('frac','0');
const only = arg('track',''), seed=+arg('seed','7');

if (kind==='T') {                                   // цена жёлтого по времени
  for (const T of H.tracks(true)) {
    if (only && T.name!==only) continue;
    console.log(`\n${T.name} · зерно ${seed} · цена проезда двух секторов зоны`);
    let sum=0, n=0, worst=0;
    for (let sct=0;sct<12;sct++){
      const a=costRun(T,seed,sct,false), b=costRun(T,seed,sct,true);
      if(a.skip||b.skip||!a.done||!b.done||a.off||b.off){
        console.log(`  сектор ${String(sct).padStart(2)}: ${b.skip||a.skip||(a.off||b.off?'игрок вылетел с трассы':'не доехал')} — не в счёт`);continue;}
      const d=+(b.t-a.t).toFixed(2); n++; sum+=d; if(d>worst)worst=d;
      console.log(`  сектор ${String(sct).padStart(2)}: свободно ${a.t} с, под флагом ${b.t} с · дороже на ${d>=0?'+':''}${d} с`);
    }
    console.log(`  в среднем +${(sum/Math.max(1,n)).toFixed(2)} с, худший случай +${worst.toFixed(2)} с`);
  }
} else
for (const T of H.tracks(true)) {
  if (only && T.name!==only) continue;
  console.log(`\n${T.name} · зерно ${seed} · опыт ${kind} · зазор ${gap} м · ${deep?'оба глубоко в зоне':'граница зоны'}`+(frac?` · игрок едет ${Math.round(frac*100)} % своего потолка`:''));
  let n=0, sum=0, passes=0;
  for (let s=0;s<12;s++){
    const r = scenario(T, seed, s, kind, gap, deep, frac);
    if (r.skip){console.log(`  сектор ${String(s).padStart(2)}: ${r.skip} — пропуск`);continue;}
    if (r.off||r.wrap){console.log(`  сектор ${String(s).padStart(2)}: ${r.off?'игрок вылетел с трассы':'круг замкнулся'} — не в счёт`);continue;}
    n++; sum+=r.gain; if(r.queue?r.nq:r.passed)passes+=r.queue?r.nq:1;
    console.log(`  сектор ${String(s).padStart(2)} (кривизна ${r.K}) · зона: игрок ${r.nP0?'ДА':'нет'}, соперник ${r.nR0?'ДА':'нет'}`
      + ` · зазор ${r.g0} -> ${r.gend} м${r.tot?` · ниже половины потолка ${r.slow}/${r.tot} кадров`:''}${r.queue?` · ОБОГНАЛ ${r.nq} из 3`:''}${r.passed&&!r.queue?'  ← '+r.passed.toUpperCase():''}`
      + (r.off?` · вне полотна ${r.off} кадров`:''));
  }
  console.log(`  ИТОГО обгонов ${passes} на ${n} раскладов`);
}
