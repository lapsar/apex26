/* ============================================================================
   ПОТЕНЦИАЛ КРУГА ИГРОКА — «выигрывается ли эта трасса на этом режиме»

   Считает круг игрока, который едет идеально, и сопоставляет с полем.
   Не пробник: в чек-лист не входит, ничего не заваливает, эталонов не держит.

   КАК СЧИТАЕТСЯ
     1. Гоночная траектория — линия минимальной кривизны внутри коридора.
        Коридор берётся такой, какой в игре: центр болида держит полное
        сцепление до `halfAt(i)+0.7` (index.html: onRoad), а не до кромки.
        Линия ищется лапласовым сглаживанием с возвратом в коридор.
     2. Скорость в повороте — из ЗАКОНА РУЛЯ игрока, а не из выдуманного
        сцепления: `turn = 1.7*max(0.32, min(1, 12/(v+4)))`, боковое = v*turn.
        **0.32 здесь ПОЛ, а не спад.** Выше 33.5 м/с скорость поворота
        постоянна (0.544 рад/с), и боковое ускорение РАСТЁТ со скоростью:
        21.8 м/с² на 40 м/с, 32.6 на 60, 43.5 на 80. Радиус, который держит
        болид, — 0.544·R = v, то есть 110 м на 60 м/с и 147 м на 80 м/с.
        Первый вариант этого расчёта (08.2026) пол проглядел и считал по
        спадающей ветке — занижал игрока на 2–4 с на круге и объявил Монако
        и Сильверстоун непроходимыми. Это была ошибка расчёта, не игры.
     3. Разгон, торможение и потолок — формулами игрока из `update`.
     4. Соперники — штатной `estLapTime` по тем же трассе и режиму.

   ЧЕГО ОН НЕ УМЕЕТ — читать обязательно
     Линия минимальной кривизны НЕ равна линии минимального времени: в гонках
     разница обычно 1–2 %, то есть на круге в 100 с это ±2 с. Проверено
     здесь же: улучшение радиуса в повороте на 4 % даёт на Сильверстоуне ровно
     1 с. Значит **всё, что лежит в пределах пары секунд от поула, расчётом
     не решается** — там решает мастерство, и авторитет тут один: владелец
     на устройстве. Он же и поймал промах: на Сильверстоуне/Профи расчёт
     говорит «+2.1 с, недостижимо», а владелец там берёт поул и выигрывает,
     и ребёнок приезжал первым.

   Запуск:  node tools/lap-potential.js
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const ITER = 4000;          // сглаживаний траектории; на 40000 время меняется на 0.02 с
const BAND = 2.5;         // полоса, внутри которой расчёт не решает: см. шапку
const EDGE = -0.7;          // «отступ» коридора: минус = центр болида заходит за кромку, как в игре

function run() {
  const r = R.result('Потенциал круга игрока против поля (справка, не пробник)');
  for (const T of H.tracks()) {
    const env = H.loadGame();
    H.setupWorld(env, { trackIdx: T.idx });
    const g = env.evalIn(`(function(){
      var M=track.M, GR=track.grip;
      function vCorner(Rr){var v=0.544*Rr; if(v>33.5)return Math.min(v,MAXSPEED*GR);
        v=-2+Math.sqrt(4+20.4*Rr); if(v>8)return v; return 1.7*Rr;}
      function raceLine(){var Q=[];
        for(var i=0;i<M;i++)Q.push({x:track.P[i].x,z:track.P[i].z});
        for(var it=0;it<${ITER};it++){
          var nx=new Float64Array(M), nz=new Float64Array(M);
          for(var i=0;i<M;i++){var a=Q[(i-1+M)%M],b=Q[i],c=Q[(i+1)%M];
            nx[i]=(a.x+2*b.x+c.x)/4; nz[i]=(a.z+2*b.z+c.z)/4;}
          for(var i=0;i<M;i++){var lim=Math.max(0,halfAt(i)-(${EDGE}));
            var d=(nx[i]-track.P[i].x)*track.R[i].x+(nz[i]-track.P[i].z)*track.R[i].z;
            d=Math.max(-lim,Math.min(lim,d));
            Q[i]={x:track.P[i].x+track.R[i].x*d, z:track.P[i].z+track.R[i].z*d};}}
        return Q;}
      var Q=raceLine(), ds=[], hd=[];
      for(var i=0;i<M;i++){var a=Q[i],b=Q[(i+1)%M];
        ds.push(Math.hypot(b.x-a.x,b.z-a.z)); hd.push(Math.atan2(b.x-a.x,b.z-a.z));}
      var K=[], L=0;
      for(var i=0;i<M;i++){L+=ds[i];
        var d=hd[(i+3)%M]-hd[(i-3+M)%M];
        while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI;
        var arc=0; for(var j=-3;j<3;j++)arc+=ds[(i+j+M)%M];
        K.push(Math.abs(d)*24/Math.max(arc,1e-6));}
      var v=40,t=0;
      for(var lap=0;lap<3;lap++){t=0;
        for(var i=0;i<M;i++){
          var tg=MAXSPEED*GR, ah=6+Math.round(v*0.6);
          for(var a=1;a<ah;a++){var k=K[(i+a)%M]; if(k<0.03)continue;
            var vc=vCorner(24/k); if(vc>=tg)continue;
            var dist=0; for(var j=0;j<a;j++)dist+=ds[(i+j)%M];
            var vv=Math.sqrt(vc*vc+2*50*dist); if(vv<tg)tg=vv;}
          var dt=ds[i]/Math.max(v,5);
          if(v<tg)v+=Math.min(tg-v,14*Math.max(0.14,1-0.85*v/(MAXSPEED*GR))*dt);
          else v=Math.max(tg,v-50*dt);
          t+=ds[i]/Math.max(v,5);}}
      var out={lap:t, len:+L.toFixed(0), diffs:{}};
      ['easy','normal','hard'].forEach(function(d){
        var mul=DIFF_MUL[d], ck=DIFF_CORNERK[d];
        var rows=ROSTER.slice(0,22).map(function(q){
          return estLapTime(MAXSPEED*(0.5538+q.skill*0.32)*mul,ck);}).sort(function(a,b){return a-b;});
        out.diffs[d]={p1:rows[0], p22:rows[21], pos:rows.filter(function(x){return x<t;}).length+1};});
      return out;})()`);

    r.line(`${T.name.padEnd(12)} идеальный круг ${R.lap(g.lap)} по траектории ${g.len} м${T.hidden ? '  (трасса скрыта)' : ''}`);
    for (const d of ['easy', 'normal', 'hard']) {
      const e = g.diffs[d], dp = g.lap - e.p1;
      // ±2.5 с — не круглое число, а калибровка по факту: на Сильверстоуне/Профи
      // расчёт даёт +2.1 с, а владелец там берёт поул. Значит полоса неопределённости
      // не уже этого, и объявлять «недостижимо» внутри неё нельзя.
      const verdict = dp < -BAND ? 'поул уверенно' : dp < BAND ? 'на грани — решает мастерство' : 'по расчёту не хватает';
      r.line(`    ${d.padEnd(7)} поул ${R.lap(e.p1)} · игрок ${(dp > 0 ? '+' : '') + dp.toFixed(3)} · решётка P${e.pos} · ${verdict}`);
    }
  }
  r.note('погрешность расчёта — около ±2.5 с на круге: линия минимальной кривизны не равна линии минимального времени');
  r.note('всё, что ближе 2.5 с к поулу, расчётом не решается. Проверка на устройстве владельцем — единственный авторитет');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
