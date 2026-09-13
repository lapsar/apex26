/* ============================================================================
   СПРАВКА: КАК проходить самый медленный поворот трассы — и даёт ли он выигрыш.

   Появилась по вопросу владельца «ты говорил, что шпилька Канады — моё преимущество,
   а меня там постоянно обгоняют» (09.2026). Оказалось, что он прав, а прежняя оценка
   (`corner-gain.js`) завышала возможности игрока: она берёт его скорость из
   `playerCornerV`, то есть по радиусу `24/K + halfAt*0.8`, а такой дуги в развороте
   на 187° не существует — её надо ПРОЕХАТЬ, и коридор её не даёт.

   Эта справка считает время по ЗАДАННОЙ траектории формулами самого игрока
   (закон руля §5, тормоза 50 м/с², тяга 14 м/с², потолок MAXSPEED*grip) и сравнивает
   с тем же участком у соперника-лидера, посчитанным штатным `aiTarget`.
   Траектория подбирается перебором; линия, где радиус меньше `TURN_RMIN`, отвергается —
   круче выкрута колёс болид не повернёт.

   Чего она НЕ умеет: трафика, струи и того, что живой игрок рулит неточно. Разница
   меньше 0.2 с внутри её погрешности — там решает устройство, а не расчёт.

   Не пробник: порогов нет, ничего не заваливает, index.html не трогает.
   Запуск: node tools/corner-line.js [--diff=normal] [--track=Montreal]
   ========================================================================== */
'use strict';
const H = require('./harness');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const DIFF = arg('diff', 'normal'), ONLY = arg('track', '');

const FNS = `
function __lineOf(pts){var M=track.M,seg=track.length/M,L=[];
  for(var i=0;i<M;i++){var S=i*seg,o=0;
    if(S<=pts[0][0])o=pts[0][1]; else if(S>=pts[pts.length-1][0])o=pts[pts.length-1][1];
    else for(var k=1;k<pts.length;k++){if(S<=pts[k][0]){
      var f=(S-pts[k-1][0])/(pts[k][0]-pts[k-1][0]); f=f*f*(3-2*f);
      o=pts[k-1][1]+(pts[k][1]-pts[k-1][1])*f;break;}}
    var lm=halfAt(i)+0.7; L.push(Math.max(-lm,Math.min(lm,o)));}
  for(var p=0;p<2;p++){var n=[];for(var i=0;i<M;i++)n[i]=(L[(i-1+M)%M]+2*L[i]+L[(i+1)%M])/4;
    for(var i=0;i<M;i++){var lm=halfAt(i)+0.7;L[i]=Math.max(-lm,Math.min(lm,n[i]));}}
  return L;}
/* Время игрока на участке по этой линии. Кривизна берётся окном +-3 точки: на сыром
   контуре (§9) одиночный всплеск иначе роняет весь профиль скорости. */
function __segTime(pts,S0,S1){
  var M=track.M,seg=track.length/M,off=__lineOf(pts),P=[];
  for(var i=0;i<M;i++)P.push({x:track.P[i].x+track.R[i].x*off[i],z:track.P[i].z+track.R[i].z*off[i]});
  var ds=[],hd=[];
  for(var i=0;i<M;i++){var a=P[i],b=P[(i+1)%M];ds.push(Math.hypot(b.x-a.x,b.z-a.z));hd.push(Math.atan2(b.x-a.x,b.z-a.z));}
  function vOf(r){var v=0.544*r; if(v>33.5)return Math.min(v,MAXSPEED*track.grip);
    v=-2+Math.sqrt(4+20.4*r); if(v>8)return Math.min(v,MAXSPEED*track.grip);
    return Math.min(1.7*r,MAXSPEED*track.grip);}
  var vl=[],R=[],bad=false;
  for(var i=0;i<M;i++){var d=hd[(i+3)%M]-hd[(i-3+M)%M];
    while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI;
    var arc=0; for(var j=-3;j<3;j++)arc+=ds[(i+j+M)%M];
    var r=Math.abs(d)>1e-6?arc/Math.abs(d):1e6; R.push(r);
    var S=i*seg; if(r<TURN_RMIN&&S>S0-200&&S<S1+50)bad=true;      // круче выкрута колёс не повернуть
    vl.push(vOf(r));}
  for(var p=0;p<6;p++)for(var n=0;n<M;n++){var i=(M-1-n+M)%M,j=(i+1)%M;
    var cap=Math.sqrt(vl[j]*vl[j]+2*50*ds[i]); if(vl[i]>cap)vl[i]=cap;}
  var i0=Math.round(S0/seg)%M,i1=Math.round(S1/seg)%M,top=MAXSPEED*track.grip;
  var v=vl[(i0-40+M)%M],t=0,vmin=1e9,path=0,Rmin=1e9;
  for(var k=-40;k<0;k++){var i=(i0+k+M)%M,dt=ds[i]/Math.max(v,5);          // разогнаться до входа
    if(v<vl[i])v=Math.min(vl[i],v+14*Math.max(0.14,1-0.85*v/top)*dt); else v=Math.max(vl[i],v-50*dt);}
  for(var k=0;;k++){var i=(i0+k)%M,dt=ds[i]/Math.max(v,5);
    if(v<vl[i])v=Math.min(vl[i],v+14*Math.max(0.14,1-0.85*v/top)*dt); else v=Math.max(vl[i],v-50*dt);
    t+=dt; path+=ds[i];
    if(v<vmin)vmin=v; if(R[i]<Rmin)Rmin=R[i];
    if(i===i1)break; if(k>M)break;}
  return {t:bad?1e6:t,bad:bad,vmin:vmin,vend:v,path:path,Rmin:Rmin};}
/* Тот же участок у соперника-лидера, его собственным правилом. */
function __aiSeg(S0,S1){
  var M=track.M,seg=track.length/M,i0=Math.round(S0/seg)%M,i1=Math.round(S1/seg)%M;
  var base=aiBase(0.98,DIFF_MUL[sel.diff]),ck=aiGrip(0.98,DIFF_GRIP[sel.diff]);
  var v=base*0.6,t=0,vmin=1e9;
  for(var k=-120;k<0;k++){var i=(i0+k+M)%M,ds=track.P[i].distanceTo(track.P[(i+1)%M]);
    var tg=aiTarget(i,v,base,ck),dt=ds/Math.max(v,5);
    if(v<tg)v+=Math.min(tg-v,13.5*Math.max(0.14,1-0.85*v/MAXSPEED)*dt); else v+=(tg-v)*Math.min(1,dt*3.0);}
  for(var k=0;;k++){var i=(i0+k)%M,ds=track.P[i].distanceTo(track.P[(i+1)%M]);
    var tg=aiTarget(i,v,base,ck),dt=ds/Math.max(v,5);
    if(v<tg)v+=Math.min(tg-v,13.5*Math.max(0.14,1-0.85*v/MAXSPEED)*dt); else v+=(tg-v)*Math.min(1,dt*3.0);
    t+=dt; if(v<vmin)vmin=v; if(i===i1)break; if(k>M)break;}
  return {t:t,vmin:vmin,vend:v};}
`;

for (const T of H.tracks(true)) {
  if (ONLY && T.name.toLowerCase().indexOf(ONLY.toLowerCase()) < 0) continue;
  const env = H.loadGame();
  H.setupWorld(env, { trackIdx: T.idx, diff: DIFF });
  env.evalIn(FNS, 'corner-line(fns)');
  // самый медленный поворот круга и границы участка вокруг него
  const g = env.evalIn(`(function(){var M=track.M,seg=track.length/M,kmax=0,ki=0;
    for(var i=0;i<M;i++){var k=Math.abs(track.K[i]); if(k>kmax){kmax=k;ki=i;}}
    var S=ki*seg;
    return {S:+S.toFixed(0),R:+(24/kmax).toFixed(1),len:track.length,
            S0:+Math.max(0,S-240).toFixed(0), S1:+Math.min(track.length-8,S+860).toFixed(0)};})()`);
  const mk = o => [[g.S0 - 70, 0], [o.sIn, o.oIn], [o.sAp, o.oAp], [o.sOut, o.oOut], [g.S1 - 100, 0]];
  const run = p => env.evalIn('__segTime(' + JSON.stringify(p) + ',' + g.S0 + ',' + g.S1 + ')');
  const hw = env.evalIn(`halfAt(${Math.round(g.S / (g.len / env.evalIn('track.M')))}%track.M)`);
  const E = hw + 0.7;
  let cur = { sIn: g.S - 130, oIn: -E, sAp: g.S + 12, oAp: E * 0.9, sOut: g.S + 130, oOut: -E * 0.85 };
  let best = run(mk(cur)).t;
  const GRID = {
    sIn: [g.S - 200, g.S - 160, g.S - 130, g.S - 100, g.S - 70],
    oIn: [-E, -E * 0.8, -E * 0.6, -E * 0.35, 0],
    sAp: [g.S - 20, g.S - 8, g.S + 4, g.S + 16, g.S + 30, g.S + 45],
    oAp: [E * 0.4, E * 0.6, E * 0.8, E * 0.92, E],
    sOut: [g.S + 70, g.S + 100, g.S + 130, g.S + 160, g.S + 200],
    oOut: [-E, -E * 0.8, -E * 0.5, -E * 0.25, 0],
  };
  for (let pass = 0; pass < 5; pass++) for (const k of Object.keys(GRID)) for (const v of GRID[k]) {
    const c = Object.assign({}, cur); c[k] = v;
    if (c.sIn >= c.sAp || c.sAp >= c.sOut) continue;
    const r = run(mk(c)); if (r.t < best) { best = r.t; cur = c; }
  }
  const opt = run(mk(cur)), axis = run([[g.S0 - 70, 0], [g.S1 - 100, 0]]);
  const ai = env.evalIn('__aiSeg(' + g.S0 + ',' + g.S1 + ')');
  const sign = x => (x >= 0 ? '+' : '') + x.toFixed(2);
  console.log(T.name + ' / ' + DIFF + '  —  самый медленный поворот на S=' + g.S +
    ' (радиус осевой ' + g.R + ' м), участок ' + g.S0 + '..' + g.S1 + ' м');
  console.log('   ты идеально    ' + opt.t.toFixed(2) + ' с   в повороте ' + (opt.vmin * 3.6).toFixed(0) +
    ' км/ч, радиус линии ' + opt.Rmin.toFixed(0) + ' м, путь ' + opt.path.toFixed(0) + ' м');
  console.log('   ты по осевой   ' + axis.t.toFixed(2) + ' с   в повороте ' + (axis.vmin * 3.6).toFixed(0) +
    ' км/ч, радиус ' + axis.Rmin.toFixed(0) + ' м, путь ' + axis.path.toFixed(0) + ' м');
  console.log('   соперник       ' + ai.t.toFixed(2) + ' с   в повороте ' + (ai.vmin * 3.6).toFixed(0) + ' км/ч');
  console.log('   → идеально ' + sign(opt.t - ai.t) + ' с к сопернику, по осевой ' + sign(axis.t - ai.t) +
    ' с;  цена неидеальной линии ' + (axis.t - opt.t).toFixed(2) + ' с');
  console.log('   линия: заход S=' + cur.sIn + ' на ' + cur.oIn.toFixed(1) + ' м, апекс S=' + cur.sAp +
    ' на ' + cur.oAp.toFixed(1) + ' м, выход S=' + cur.sOut + ' на ' + cur.oOut.toFixed(1) + ' м  (+ вправо)');
  console.log('');
}
