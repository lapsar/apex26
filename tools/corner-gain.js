/* ============================================================================
   СПРАВКА: «выходишь из поворота и влетаешь в зад сопернику» — почему.
   Вопрос владельца после заездов на v1.15.78 (09.2026).

   Считает, сколько игрок выигрывает у соперника за ОДИН самый медленный поворот
   круга, если оба подошли к нему вровень. Разгон тут почти ни при чём: за 3 с
   после апекса набегает 1-2 м. Решают тормоза (50 против AIBRAKE=44) и скорость
   в апексе, которая на лёгких режимах у соперника ниже по замыслу.

   Не пробник: порогов нет, index.html не трогает.
   Запуск: node tools/corner-gain.js
   ========================================================================== */
'use strict';
const H = require('./harness');

for (const T of H.tracks(true)) {
  const env = H.loadGame();
  H.setupWorld(env, { trackIdx: T.idx });
  for (const d of ['easy', 'normal', 'hard']) {
    const r = env.evalIn(`(function(){
      var M=track.M, seg=track.length/M, top=MAXSPEED*track.grip;
      var kmax=0,ki=0; for(var i=0;i<M;i++){var k=Math.abs(track.K[i]); if(k>kmax){kmax=k;ki=i;}}
      var ck=aiGrip(0.98,DIFF_GRIP['${d}']), base=aiBase(0.98,DIFF_MUL['${d}']);
      // цель в точке j — минимум по поворотам впереди с учётом СВОИХ тормозов
      function target(j,who){
        var t = who==='p' ? top : base, ah=60;
        for(var a=0;a<ah;a++){var q=(j+a)%M, K=Math.abs(track.K[q]); if(K<0.03)continue;
          var vc = who==='p' ? playerCornerV(q) : aiCornerV(24/K+halfAt(q)*0.8)*ck;
          if(vc>=t)continue;
          var br = who==='p' ? 50 : AIBRAKE;
          var v=Math.sqrt(vc*vc+2*br*a*seg); if(v<t)t=v;}
        return t;}
      function run(who){                      // 400 м до апекса и 200 после
        var j0=(ki-100+M)%M, v=target(j0,who), s=0, apex=0;
        for(var n=0;n<150;n++){var j=(j0+n)%M, tg=target(j,who);
          var dt=seg/Math.max(v,5);
          if(v<tg) v+=Math.min(tg-v, (who==='p'?14:13.5)*Math.max(0.14,1-0.85*v/(who==='p'?top:MAXSPEED))*dt);
          else v=Math.max(tg, v-(who==='p'?50:AIBRAKE)*dt);
          if(n===100) apex=v;
          s+=dt;}
        return {t:s, apex:apex, v:v};}
      var p=run('p'), a=run('a');
      return {vp:p.apex*3.6, va:a.apex*3.6, dt:a.t-p.t, vout:p.v};})()`);
    console.log(T.name.padEnd(12) + d.padEnd(8) +
      'в апексе ты ' + r.vp.toFixed(0) + ' км/ч, он ' + r.va.toFixed(0) +
      ' · за один такой поворот ты выигрываешь ' + r.dt.toFixed(2) + ' с' +
      ' (' + (r.dt * r.vout).toFixed(0) + ' м на выходе)');
  }
}
