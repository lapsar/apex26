/* СПРАВКА (не пробник, порога нет): ЧТО КАСАНИЕ С СОПЕРНИКОМ СТОИТ ИГРОКУ (01.10.2026).
   Автопилот, старт последним, гонка 3 круга, сходы выключены (флаги не путают счёт).
   carContacts оборачивается снаружи, поэтому справка мерит любую сборку одинаково:
     касание       — кадров, в которых contact сдвинул игрока;
     съедено       — сумма потерь скорости внутри carContacts за гонку, м/с;
     рывков >5     — кадров, где касание сняло больше 5 м/с разом (худший — в скобках);
     толчков вперёд — кадров, где касание сдвинуло игрока ВПЕРЁД по курсу больше 0.5 м;
     внахлёст      — кадров, где после разрешения НАСТОЯЩИЕ корпуса (6.04 × 2.57, каждый
                     в своих осях) всё ещё заходят друг в друга глубже 8 см — это видно глазом
                     (до 7 см — разница картинки 2.57 и касания 2.5, она заложена);
     зажат         — кадров, где игрок касается двоих с РАЗНЫХ боков: вытолкнуть некуда,
                     соперники касанием не двигаются; в «внахлёст» не идёт (01.10.2026: все
                     внахлёсты глубже 0.3 м на v1.16.18 оказались такими);
     время         — время гонки игрока, с; место — на финише.
   Ключи: --file=сборка.html  --seeds=7,91,3,5  --diff=easy  --tracks=Monza,...  --pos=22 */
'use strict';
const H = require('./harness');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const FILE = arg('file', '') || undefined, DIFF = arg('diff', 'easy'), POS = +arg('pos', 22);
const seeds = arg('seeds', '7,91,3,5').split(',').map(Number), only = arg('tracks', '');

function runOne(T, seed) {
  const env = H.loadGame({ seed, file: FILE });
  H.setupWeekend(env, { trackIdx: T.idx, diff: DIFF, laps: 3 });
  H.startRaceAt(env, POS); H.lightsOut(env);
  return env.evalIn(`(function(){
    field.forEach(function(c){c.retireAt=0;});
    var S={frames:0,lost:0,snaps:0,maxSnap:0,fwd:0,maxFwd:0,over:0,maxOver:0,pinned:0};
    // глубина взаимного проникновения НАСТОЯЩИХ корпусов (полуразмеры 3.02 × 1.285), 0 — не касаются
    function depth(c){var dx=player.x-c.x,dz=player.z-c.z;if(dx*dx+dz*dz>45)return 0;
      var a=player.hdg,b=c.mesh.rotation.y,ax=[[Math.sin(a),Math.cos(a)],[Math.cos(a),-Math.sin(a)],[Math.sin(b),Math.cos(b)],[Math.cos(b),-Math.sin(b)]],m=1e9;
      for(var k=0;k<4;k++){var ux=ax[k][0],uz=ax[k][1],d=Math.abs(dx*ux+dz*uz);
        var r=3.02*(Math.abs(ax[0][0]*ux+ax[0][1]*uz)+Math.abs(ax[2][0]*ux+ax[2][1]*uz))+1.285*(Math.abs(ax[1][0]*ux+ax[1][1]*uz)+Math.abs(ax[3][0]*ux+ax[3][1]*uz));
        var o=r-d;if(o<=0)return 0;if(o<m)m=o;}return m;}
    var orig=carContacts, inFrame=false, v0=0, x0=0, z0=0;
    carContacts=function(a){
      var vb=player.speed,xb=player.x,zb=player.z; orig(a);
      var dv=vb-player.speed; if(dv>0)S.lost+=dv;
      if(!inFrame){inFrame=true;v0=vb;x0=xb;z0=zb;}
      else{inFrame=false;                                   // второй проход кадра — итог кадра
        var moved=Math.hypot(player.x-x0,player.z-z0), drop=v0-player.speed;
        if(moved>1e-6||drop>1e-6)S.frames++;
        if(drop>5){S.snaps++;if(drop>S.maxSnap)S.maxSnap=drop;}
        var fw=(player.x-x0)*Math.sin(player.hdg)+(player.z-z0)*Math.cos(player.hdg);
        if(fw>0.5){S.fwd++;} if(fw>S.maxFwd)S.maxFwd=fw;
        // ЗАЖАТ — касается двоих с разных боков: только игрок сдвигается, и вытолкнуть
        // его некуда; это поведение соперников, а не правило касания, и в счёт «внахлёст» не идёт
        var dm=0,sides=0,ss=Math.sin(player.hdg),cc=Math.cos(player.hdg);
        for(var i=0;i<field.length;i++){var dd=depth(field[i]);if(dd>0){var lt=(field[i].x-player.x)*cc-(field[i].z-player.z)*ss;sides|=lt>0?1:2;}if(dd>dm)dm=dd;}
        if(sides===3){S.pinned++;}
        else{if(dm>0.08)S.over++; if(dm>S.maxOver)S.maxOver=dm;}}};
    var dt=1/60,n=0;while(!raceOver&&n<Math.round(480/dt)){__AP.drive();update(dt);n++;}
    var ord=cars.slice().sort(rankCmp);
    S.time=raceOver?raceTime:null; S.place=ord.indexOf(player)+1; return S;})()`);
}

const tot = {}; let runs = 0;
const add = (k, v) => { tot[k] = (tot[k] || 0) + v; };
for (const T of H.tracks(true)) {
  if (only && only.split(',').indexOf(T.name) < 0) continue;
  for (const seed of seeds) {
    const S = runOne(T, seed); runs++;
    console.log(`${T.name.padEnd(12)} з${String(seed).padStart(2)} · касание ${(S.frames / 60).toFixed(1)} с · съедено ${S.lost.toFixed(1)} м/с`
      + ` · рывков >5 ${S.snaps} (худший ${S.maxSnap.toFixed(1)}) · толчков вперёд ${S.fwd} (худший ${S.maxFwd.toFixed(2)} м)`
      + ` · внахлёст ${S.over} кадров (глубже всего ${S.maxOver.toFixed(2)} м) · зажат ${S.pinned} · время ${S.time === null ? '—' : S.time.toFixed(2)} · P${S.place}`);
    add('frames', S.frames); add('lost', S.lost); add('snaps', S.snaps); add('fwd', S.fwd); add('over', S.over); add('pinned', S.pinned);
    add('time', S.time || 0); add('place', S.place);
    tot.maxSnap = Math.max(tot.maxSnap || 0, S.maxSnap); tot.maxFwd = Math.max(tot.maxFwd || 0, S.maxFwd); tot.maxOver = Math.max(tot.maxOver || 0, S.maxOver);
  }
}
console.log(`\nИТОГО ${runs} гонок (${DIFF}, старт P${POS}): касание ${(tot.frames / 60).toFixed(1)} с · съедено ${tot.lost.toFixed(0)} м/с`
  + ` · рывков >5 ${tot.snaps} (худший ${tot.maxSnap.toFixed(1)}) · толчков вперёд ${tot.fwd} (худший ${tot.maxFwd.toFixed(2)} м)`
  + ` · внахлёст ${tot.over} кадров (глубже всего ${tot.maxOver.toFixed(2)} м) · зажат ${tot.pinned} · сумма времён ${tot.time.toFixed(2)} с · среднее место ${(tot.place / runs).toFixed(2)}`);
