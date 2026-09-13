/* ============================================================================
   ОПТИМИЗАТОР ГОНОЧНОЙ ЛИНИИ — быстрейшая линия игрока, а не кратчайшая.

   ЗАЧЕМ. Справка `lap-potential` и всё, что на неё опиралось, строили линию
   лапласовым сглаживанием, а оно минимизирует ДЛИНУ. Для поворота это не гоночная
   линия: в канадской петле она прижимается к внутренней кромке и даёт радиус 9 м
   при физическом пределе поворота 10.1 — траекторию, которую болид не проедет.
   На этом расчёт завысил «выигрываемость» Канады и занизил Сильверстоун, а владелец
   опроверг вывод на устройстве (§11, v1.15.79).

   ЧТО ДЕЛАЕТ. Ищет смещение от осевой в каждой точке круга так, чтобы круг игрока
   был наименьшим. Спуск идёт СГЛАЖЕННЫМИ БУГОРКАМИ трёх ширин (связка, поворот,
   апекс) с убывающей амплитудой: сдвиг ОДНОЙ точки всегда ломает линию, и
   оптимизатор, которому это разрешено, выигрывает время на изломе, а не на
   траектории (замер: сглаживание такой «быстрой» линии отнимало 4 с).

   ФИЗИКА БЕРЁТСЯ ИЗ ИГРЫ: предельная скорость на радиусе — закон руля игрока,
   сверенный с `playerCornerV` в каждой точке каждой трассы (`__RL.check()`);
   коридор — `halfAt(i)+0.7` (до этой границы держится полное сцепление,
   index.html `onRoad`); тормоза 50 м/с², тяга 14 — из `update`. Радиус круче
   `TURN_RMIN` объявляется непроходимым и штрафуется.

   ТРИ ВЕЩИ, КОТОРЫЕ ПРИШЛОСЬ СДЕЛАТЬ, ЧТОБЫ ОТВЕТ БЫЛ ЧЕСТНЫМ, — каждую нашёл замер:
     1) РАДИУС МЕРИТСЯ ДВУМЯ МЕРКАМИ СРАЗУ. Окно ±3 точки (24 м) — то, чем игра
        считает `track.K`, — в тесном повороте накрывает почти весь поворот и
        короткого колебания линии не видит: оптимизатор, которому дали только его,
        «выиграл» на Монце 13 с зубцами. Вторая мерка — окружность через три
        соседние точки. Берётся МЕНЬШИЙ радиус.
     2) ОПОРА СГЛАЖЕНА. Исходный контур разрежен и дёргается на одной точке (§9):
        у самой осевой Монцы настоящий местный радиус 9.3 м, то есть она сама
        непроезжаема. Пять проходов лёгкого сглаживания поднимают его до 12.6 м
        и двигают линию не больше чем на 1.7 м.
     3) КРАЙ КОРИДОРА ТОЖЕ СГЛАЖЕН, но только внутрь. Линия, прижатая к ломаному
        краю, наследует его изломы. Съеденную ширину печатает `legal()`.

   И ОДНА ОТВЕРГНУТАЯ ГИПОТЕЗА, чтобы её не предлагали заново: стартовать со ЛИНИИ
   МИНИМУМА КРИВИЗНЫ. Она считается лапласовым проксИ (вторая разность смещения) и
   в первой шикане Монцы уводит линию на внутреннюю кромку, где настоящий радиус
   получается около метра — 10 непроходимых точек, и спуск потом их не разгребает.
   Спуск от самой осевой приходит туда же, куда и должен, и без этой ямы.

   ЧЕГО НЕ УМЕЕТ. Это расчёт одиночного круга: ни трафика, ни струи, ни того, что
   живой игрок рулит неточно. Он говорит, на что способна машина на этой геометрии,
   а не какой круг проедет владелец.

   Не пробник: порогов нет, index.html не трогает.
   Запуск:  node tools/raceline.js [--track=Monza] [--passes=150]
            --stretch=S1,S2  разбор участка: где ехать, где тормозить
            --widen          расширение радиуса против формулы halfAt*0.8
   Как модуль:  require('./raceline').solve(env, {...}) -> {off, lap, vmin, Rmin, bad}
   ========================================================================== */
'use strict';

const H = require('./harness');

const EDGE = 0.7;          // на столько центр болида вправе заходить за кромку (index.html: onRoad)
const REF_SMOOTH = 5;      // проходов лёгкого сглаживания опоры — см. пункт 2 в шапке
const BUMPS = [30, 14, 6]; // полуширины пробного бугра в точках (шаг разбиения 4 м)
/* Уже шести не бывает намеренно: кривизна считается окном ±3 точки (24 м), и бугор
   короче него линия частично «прячет». Шесть точек в полуширину — это 48 м. */
const AMP0 = 1.5;          // начальная амплитуда бугра, метры
const DECAY = 0.965;       // на столько амплитуда убывает за проход
/* Проходов. Сходимость проверена: 150 против 400 расходятся на Монце на 0.03 с,
   150 против 60 — уже на 0.8 с. Меньше ста ставить нельзя, больше двухсот незачем. */
const PASSES = 150;

/* Всё, что считается по линии, живёт ВНУТРИ игры: так физика зовётся по имени
   и не может разойтись с index.html (урок §11 про lap-potential). */
const SRC = `
var __RL = {
  init: function(){ var M=track.M, i, p;
    this.M=M;
    /* опора: осевая, слегка сглаженная вбок */
    var b=new Float64Array(M);
    for(p=0;p<${REF_SMOOTH};p++){ var n=new Float64Array(M);
      for(i=0;i<M;i++){ var a=(i-1+M)%M, c=(i+1)%M;
        var d=(track.P[a].x-2*track.P[i].x+track.P[c].x)*track.R[i].x
             +(track.P[a].z-2*track.P[i].z+track.P[c].z)*track.R[i].z;
        n[i]=(b[a]+2*b[i]+b[c])/4 + d/4; }
      b=n; }
    this.b=b;
    this.L=new Float64Array(M);
    for(i=0;i<M;i++) this.L[i]=halfAt(i)+${EDGE};
    /* рабочий край: сперва съедается окном ±3 (убирает выступы наружу), потом
       сглаживается, потом берётся меньшее с настоящим — линия остаётся внутри
       полотна, но не повторяет его зубцы */
    var hi=new Float64Array(M), lo=new Float64Array(M);
    for(i=0;i<M;i++){ hi[i]=this.L[i]-b[i]; lo[i]=-this.L[i]-b[i]; }
    var eh=new Float64Array(M), el=new Float64Array(M);
    for(i=0;i<M;i++){ var mn=1e9, mx=-1e9;
      for(var d2=-3; d2<=3; d2++){ var j=(i+d2+M)%M;
        if(hi[j]<mn) mn=hi[j]; if(lo[j]>mx) mx=lo[j]; }
      eh[i]=mn; el[i]=mx; }
    for(p=0;p<3;p++){ var nh=new Float64Array(M), nl=new Float64Array(M);
      for(i=0;i<M;i++){ var a2=(i-1+M)%M, c2=(i+1)%M;
        nh[i]=(eh[a2]+2*eh[i]+eh[c2])/4; nl[i]=(el[a2]+2*el[i]+el[c2])/4; }
      eh=nh; el=nl; }
    this.H=new Float64Array(M); this.Lo=new Float64Array(M);
    for(i=0;i<M;i++){ this.H[i]=Math.min(eh[i],hi[i]); this.Lo[i]=Math.max(el[i],lo[i]); }
    return this; },

  hi: function(i){ return this.H[i]; },
  lo: function(i){ return this.Lo[i]; },
  clamp: function(i,v){ var h=this.H[i], l=this.Lo[i]; return v>h?h:(v<l?l:v); },
  pos1: function(off,i){ var d=this.b[i]+off[i];
    return {x:track.P[i].x+track.R[i].x*d, z:track.P[i].z+track.R[i].z*d}; },
  pos: function(off){ var M=this.M, P=[]; for(var i=0;i<M;i++) P.push(this.pos1(off,i)); return P; },

  /* Предельная скорость игрока на радиусе R — те же три строки, что в playerCornerV.
     Позвать её по имени нельзя: она принимает ИНДЕКС и сама добавляет к радиусу
     halfAt*0.8 (поправку «игрок срежет поворот»), а у нас траектория уже задана и
     поправка была бы посчитана дважды. Поэтому закон повторён — и тут же СВЕРЕН
     с игрой в check(). Брать вместо него aiCornerV нельзя: та умножает радиус
     на track.grip, а закон руля игрока этого не делает (§10 п.19). */
  vLim: function(R){ var top=MAXSPEED*track.grip, v;
    if(R<=4.7) v=1.7*R;
    else { v=-2+Math.sqrt(4+20.4*R); if(v>=33.5) v=0.544*R; }
    return Math.min(top,v); },
  check: function(){ var M=this.M, mx=0;
    for(var i=0;i<M;i++){ var K=Math.abs(track.K[i]); if(K<0.03) continue;
      var d=Math.abs(this.vLim(24/K+halfAt(i)*0.8)-playerCornerV(i)); if(d>mx) mx=d; }
    return mx; },

  /* ---- геометрия линии: длины отрезков, курсы и радиус ---------------------
     Радиус — МЕНЬШИЙ из двух мерок: окно ±3 точки (как track.K в игре) и окружность
     через три соседние точки. Зачем обе — пункт 1 в шапке файла. */
  geom: function(off){ var M=this.M, P=this.pos(off), ds=new Float64Array(M), hd=new Float64Array(M);
    for(var i=0;i<M;i++){ var a=P[i], b=P[(i+1)%M];
      ds[i]=Math.hypot(b.x-a.x,b.z-a.z); hd[i]=Math.atan2(b.x-a.x,b.z-a.z); }
    var R=new Float64Array(M);
    for(var i=0;i<M;i++) R[i]=this.radAt(P,ds,hd,i);
    return {P:P, ds:ds, hd:hd, R:R}; },
  radAt: function(P,ds,hd,i){ var M=this.M;
    var d=hd[(i+3)%M]-hd[(i-3+M)%M];
    while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI;
    var arc=0; for(var j=-3;j<3;j++) arc+=ds[(i+j+M)%M];
    var K=Math.abs(d)*24/Math.max(arc,1e-6);
    var Rw = K<0.03 ? 1e9 : 24/K;
    var a=P[(i-1+M)%M], b=P[i], c=P[(i+1)%M];
    var A=Math.hypot(b.x-a.x,b.z-a.z), B=Math.hypot(c.x-b.x,c.z-b.z), C=Math.hypot(c.x-a.x,c.z-a.z);
    var ar=Math.abs((b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z))/2;
    var R3 = ar<1e-9 ? 1e9 : A*B*C/(4*ar);
    return Math.min(Rw,R3); },

  /* время круга по готовой геометрии */
  time: function(g){ var M=this.M, ds=g.ds, top=MAXSPEED*track.grip;
    var vl=new Float64Array(M), Rmin=1e9, bad=0, i, p;
    for(i=0;i<M;i++){ var R=g.R[i];
      if(R<Rmin) Rmin=R;
      if(R<TURN_RMIN){ bad++; R=TURN_RMIN; }
      vl[i]=Math.min(top, this.vLim(R)); }
    /* назад по кругу: два прохода хватает — цепочка торможения распространяется
       за один, второй только замыкает круг. Корень берётся лишь там, где предел
       действительно ниже: на прямых это большая часть точек. */
    for(p=0;p<2;p++) for(var n=0;n<M;n++){ i=(M-1-n+M)%M; var j=(i+1)%M;
      var cap2=vl[j]*vl[j]+100*ds[i]; if(vl[i]*vl[i]>cap2) vl[i]=Math.sqrt(cap2); }
    var v=vl[0], t=0, vmin=1e9;
    for(p=0;p<2;p++){ t=0; vmin=1e9;
      for(i=0;i<M;i++){ var dt=ds[i]/Math.max(v,5);
        if(v<vl[i]) v=Math.min(vl[i], v+14*Math.max(0.14,1-0.85*v/top)*dt);
        else v=Math.max(vl[i], v-50*dt);
        if(v<vmin) vmin=v;
        t+=ds[i]/Math.max(v,5); } }
    /* непроходимая точка штрафуется, чтобы спуск сам от неё уходил,
       а не выдавал красивое время за то, чего болид не повернёт */
    return {t:t*ESTFUDGE + bad*0.5, raw:t*ESTFUDGE, vmin:vmin, Rmin:Rmin, bad:bad}; },
  lap: function(off){ return this.time(this.geom(off)); },

  /* ---- спуск -------------------------------------------------------------
     Пробный сдвиг — сглаженный бугор (приподнятый косинус) шириной 2W+1 точек.
     Геометрия пересчитывается ТОЛЬКО в затронутом окне: без этого проход по трассе
     стоил секунды, а их нужны сотни. */
  bump: function(off,k,W,a){ var M=this.M, out=off.slice();
    for(var d=-W; d<=W; d++){ var i=(k+d+M)%M, w=0.5*(1+Math.cos(Math.PI*d/(W+1)));
      out[i]=this.clamp(i, out[i]+a*w); }
    return out; },
  patch: function(g,off,k,W){ var M=this.M, i, d;
    var P=g.P.slice(), ds=Float64Array.from(g.ds), hd=Float64Array.from(g.hd), R=Float64Array.from(g.R);
    for(d=-W; d<=W; d++){ i=(k+d+M)%M; P[i]=this.pos1(off,i); }
    for(d=-W-1; d<=W; d++){ i=(k+d+M)%M; var a=P[i], b=P[(i+1)%M];
      ds[i]=Math.hypot(b.x-a.x,b.z-a.z); hd[i]=Math.atan2(b.x-a.x,b.z-a.z); }
    for(d=-W-5; d<=W+5; d++){ i=(k+d+M)%M; R[i]=this.radAt(P,ds,hd,i); }
    return {P:P, ds:ds, hd:hd, R:R}; },

  solve: function(passes){ var M=this.M, BUMPS=[${BUMPS.join(',')}];
    var off=new Array(M); for(var i=0;i<M;i++) off[i]=0;
    var g=this.geom(off), best=this.time(g).t, moved=0;
    for(var pass=0; pass<passes; pass++){
      var W=BUMPS[pass%BUMPS.length], amp=${AMP0}*Math.pow(${DECAY},pass);
      var stride=Math.max(3,W), k0=(pass*7)%stride;
      moved=0;
      for(var k=k0; k<M; k+=stride){
        for(var s=-1; s<=1; s+=2){
          var cand=this.bump(off,k,W,s*amp);
          var gc=this.patch(g,cand,k,W), t=this.time(gc).t;
          if(t<best-1e-6){ best=t; off=cand; g=gc; moved++; } } }
      if(moved===0 && amp<0.05) break; }
    var r=this.time(g); r.off=off; r.passes=pass; return r; },

  /* сколько ширины съедено сглаживанием края и не вышла ли линия за настоящее полотно */
  legal: function(off){ var M=this.M, out=0, eaten=0;
    for(var i=0;i<M;i++){ var d=Math.abs(this.b[i]+off[i]);
      if(d>this.L[i]+1e-9) out++;
      var e=Math.max((this.L[i]-this.b[i])-this.H[i], this.Lo[i]-(-this.L[i]-this.b[i]));
      if(e>eaten) eaten=e; }
    return {out:out, eaten:eaten}; }
}.init();`;

/** Найти быстрейшую линию. env — уже с построенной трассой (setupWorld). */
function solve(env, opt) {
  opt = opt || {};
  const passes = opt.passes === undefined ? PASSES : +opt.passes;
  if (!env.evalIn('typeof __RL')) env.evalIn(SRC, 'raceline(fns)');
  return env.evalIn(`__RL.solve(${passes})`);
}

/** Разбор участка: где ехать, где тормозить, с какой скоростью — от S1 до S2. */
function stretch(env, off, s1, s2) {
  return env.evalIn(`(function(){
    var off=${JSON.stringify(off)}, M=__RL.M, g=__RL.geom(off), ds=g.ds;
    var top=MAXSPEED*track.grip, vl=[], i, p;
    for(i=0;i<M;i++){ var R=g.R[i]; vl.push(Math.min(top,__RL.vLim(R<TURN_RMIN?TURN_RMIN:R))); }
    for(p=0;p<2;p++) for(var n=0;n<M;n++){ i=(M-1-n+M)%M; var j=(i+1)%M;
      var c2=vl[j]*vl[j]+100*ds[i]; if(vl[i]*vl[i]>c2) vl[i]=Math.sqrt(c2); }
    var v=vl[0], V=new Float64Array(M);
    for(p=0;p<2;p++) for(i=0;i<M;i++){ var dt=ds[i]/Math.max(v,5);
      if(v<vl[i]) v=Math.min(vl[i], v+14*Math.max(0.14,1-0.85*v/top)*dt);
      else v=Math.max(vl[i], v-50*dt);
      V[i]=v; }
    var out=[];
    for(i=0;i<M;i++){ var S=track.S[i];
      if(S<${s1}||S>${s2}) continue;
      out.push({S:Math.round(S), off:+(__RL.b[i]+off[i]).toFixed(2), hw:+halfAt(i).toFixed(1),
        v:+(V[i]*3.6).toFixed(0), R:+Math.min(g.R[i],9999).toFixed(0),
        brake: V[i]<V[(i-1+M)%M]-0.02 ? 1 : 0}); }
    return out;})()`);
}

module.exports = { solve, SRC, stretch };

if (require.main === module) {
  const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
  const only = arg('track', ''), passes = +arg('passes', PASSES);
  if (process.argv.includes('--widen')) {
    /* Насколько быстрейшая линия расширяет радиус в поворотах круче R=80 м по осевой,
       против того, что даёт сопернику формула halfAt*0.8 (§10 п.22). Прежние числа
       этого замера сняты лапласовой линией и оказались перевёрнуты. */
    console.log('  трасса        доля круга R<80   настоящая линия   формула halfAt*0.8');
    for (const T of H.tracks()) {
      if (only && T.name.toLowerCase().indexOf(only.toLowerCase()) < 0) continue;
      const env = H.loadGame();
      H.setupWorld(env, { trackIdx: T.idx, diff: 'hard' });
      env.evalIn(SRC, 'raceline(fns)');
      const r = solve(env, { passes });
      const d = env.evalIn(`(function(){
        var off=${JSON.stringify(r.off)}, g=__RL.geom(off), M=__RL.M, n=0, s=0, f=0;
        for(var i=0;i<M;i++){ var K=Math.abs(track.K[i]); if(K<0.03) continue;
          var Rc=24/K; if(Rc>=80) continue;
          n++; s+=Math.min(g.R[i],4*Rc)/Rc; f+=(Rc+halfAt(i)*0.8)/Rc; }
        return {n:n, tot:M, line:s/Math.max(1,n), form:f/Math.max(1,n)};})()`);
      console.log('  ' + T.name.padEnd(13) + (100 * d.n / d.tot).toFixed(1).padStart(8) + ' %'
        + ('x' + d.line.toFixed(2)).padStart(18) + ('x' + d.form.toFixed(2)).padStart(20));
    }
    return;
  }
  const seg = arg('stretch', '');
  if (seg) {
    /* Разбор одного участка — то, ради чего оптимизатор и заводился: сказать словами,
       где ехать и где тормозить. Печатается смещение от осевой, местный радиус
       и скорость на быстрейшей линии. */
    const [s1, s2] = seg.split(',').map(Number);
    const T = H.tracks().find(t => !only || t.name.toLowerCase().indexOf(only.toLowerCase()) >= 0);
    const env = H.loadGame();
    H.setupWorld(env, { trackIdx: T.idx, diff: 'hard' });
    env.evalIn(SRC, 'raceline(fns)');
    const r = solve(env, { passes });
    console.log(`  ${T.name}, участок ${s1}..${s2} м. Смещение: минус — левее осевой, плюс — правее.`);
    console.log('     S    смещение (полуширина)   радиус    скорость');
    for (const q of stretch(env, r.off, s1, s2)) {
      console.log('  ' + String(q.S).padStart(4) + '   ' + q.off.toFixed(2).padStart(6) + ' м  (±'
        + q.hw.toFixed(1) + ')' + String(q.R).padStart(9) + ' м' + String(q.v).padStart(9) + ' км/ч'
        + (q.brake ? '   тормоз' : ''));
    }
    return;
  }
  console.log('Быстрейшая линия игрока — расчёт одиночного круга, без трафика и струи\n');
  console.log('  трасса        осевая   лапласова   быстрейшая   выигрыш   узкий R   мин. v   поул (Профи)');
  for (const T of H.tracks()) {
    if (only && T.name.toLowerCase().indexOf(only.toLowerCase()) < 0) continue;
    const env = H.loadGame();
    H.setupWorld(env, { trackIdx: T.idx, diff: 'hard' });
    env.evalIn(SRC, 'raceline(fns)');
    const chk = env.evalIn('__RL.check()');
    if (chk > 1e-9) console.log(`  ВНИМАНИЕ: закон руля разошёлся с playerCornerV на ${chk} м/с`);
    const mid = env.evalIn('__RL.lap(new Array(__RL.M).fill(0))');
    /* лапласова линия — та самая, на которой стоит lap-potential; печатается
       для сравнения вместе с числом непроходимых точек */
    const lapl = env.evalIn(`(function(){
      var M=__RL.M, Q=[];
      for(var i=0;i<M;i++)Q.push({x:track.P[i].x,z:track.P[i].z});
      for(var it=0;it<4000;it++){ var nx=new Float64Array(M), nz=new Float64Array(M);
        for(var i=0;i<M;i++){ var a=Q[(i-1+M)%M],b=Q[i],c=Q[(i+1)%M];
          nx[i]=(a.x+2*b.x+c.x)/4; nz[i]=(a.z+2*b.z+c.z)/4; }
        for(var i=0;i<M;i++){ var lim=halfAt(i)+${EDGE};
          var d=(nx[i]-track.P[i].x)*track.R[i].x+(nz[i]-track.P[i].z)*track.R[i].z;
          d=Math.max(-lim,Math.min(lim,d));
          Q[i]={x:track.P[i].x+track.R[i].x*d,z:track.P[i].z+track.R[i].z*d}; } }
      var off=[]; for(var i=0;i<M;i++)
        off.push((Q[i].x-track.P[i].x)*track.R[i].x+(Q[i].z-track.P[i].z)*track.R[i].z-__RL.b[i]);
      return __RL.lap(off);})()`);
    const r = solve(env, { passes });
    const pole = env.evalIn(`(function(){var ts=ROSTER.slice(0,22).map(function(d){return qualiLapTime(d.skill,'hard');});
      return Math.min.apply(null,ts);})()`);
    const leg = env.evalIn(`__RL.legal(${JSON.stringify(r.off)})`);
    console.log('  ' + T.name.padEnd(13) + mid.raw.toFixed(2).padStart(7) + lapl.raw.toFixed(2).padStart(11)
      + (lapl.bad ? '!' : ' ') + r.raw.toFixed(2).padStart(11) + (r.bad ? '!' : ' ')
      + (mid.raw - r.raw).toFixed(2).padStart(9) + r.Rmin.toFixed(1).padStart(10) + ' м'
      + (r.vmin * 3.6).toFixed(0).padStart(7) + ' км/ч' + pole.toFixed(2).padStart(12) + ' с'
      + (T.hidden ? '   (скрыта)' : ''));
    if (lapl.bad) console.log(`      лапласова линия непроходима в ${lapl.bad} точках (узкий радиус ${lapl.Rmin.toFixed(1)} м при пределе ${env.evalIn('TURN_RMIN')}) — её время справочное`);
    if (leg.out) console.log(`      ОШИБКА: линия вышла за полотно в ${leg.out} точках`);
    if (leg.eaten > 0.05) console.log(`      край коридора сглажен, съедено до ${leg.eaten.toFixed(2)} м ширины (шиканы)`);
  }
  console.log('\n  «!» — на линии есть точки круче выкрута колёс; время такой линии недостижимо.');
  console.log('  Осевая и лапласова линия даны для сравнения: первая — как едет разметка,');
  console.log('  вторая — линия минимальной ДЛИНЫ, на которой стоит справка lap-potential.');
}
