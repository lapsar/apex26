/* ============================================================================
   Пробник 7 — ИЗЛОМЫ ОТБОЙНИКА

   Мерится лента отбойника: точка барьера b(i) = P[i] + R[i]*sign*W[i] для
   индексов, где лента показана (V[i]). Излом — угол между соседними отрезками
   ленты. Порог 75°.

   Считаются только стыки ВИДИМОЙ ленты. Там, где ленты нет (в тесных апексах
   она складывалась бы сама на себя), разрыв закрыт прямой перемычкой
   wallBridges — она по построению прямая, а её стыки с лентой резкие
   специально: настоящий барьер идёт мимо шиканы, а не повторяет её.
   Углы этих стыков печатаются отдельной строкой, в зачёт не идут.

   Сузука и Монако скрыты из меню и барьер у них строится обобщённой
   buildWallProfile, без разметки настоящей линии барьера, — их лента
   складывается (CLAUDE.md §8 п.2, §9). Они меряются и печатаются, но
   пробник по ним не заваливается.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

const LIMIT = 75;                // градусов

const MEASURE = `(function(){
  var M=track.M, P=track.P, Rr=track.R, out=[];
  [[-1,track.WL,track.VL,'левый'],[1,track.WR,track.VR,'правый']].forEach(function(t){
    var sign=t[0], W=t[1], V=t[2], side=t[3];
    if(!W||!V){ out.push({side:side, missing:true}); return; }
    var pt=function(i){ return [P[i].x+Rr[i].x*sign*W[i], P[i].z+Rr[i].z*sign*W[i]]; };
    var ang=function(a,b,c){
      var v1x=b[0]-a[0], v1z=b[1]-a[1], v2x=c[0]-b[0], v2z=c[1]-b[1];
      var l1=Math.hypot(v1x,v1z), l2=Math.hypot(v2x,v2z);
      if(l1<1e-9||l2<1e-9) return null;
      return Math.acos(Math.max(-1,Math.min(1,(v1x*v2x+v1z*v2z)/(l1*l2))))*180/Math.PI;
    };
    var worst=0, at=-1, over=[], verts=0, hidden=0, brWorst=0, brAt=-1, bridges=0;
    for(var i=0;i<M;i++){
      if(!V[i]){ hidden++; continue; }
      var a=(i-1+M)%M, b=(i+1)%M;
      if(V[a]&&V[b]){                                   // стык двух видимых отрезков ленты
        var g=ang(pt(a),pt(i),pt(b));
        if(g===null) continue;
        verts++;
        if(g>${LIMIT}) over.push({i:i, deg:+g.toFixed(1)});
        if(g>worst){ worst=g; at=i; }
      }
    }
    // стыки лента↔перемычка: перемычка идёт от последней видимой точки до следующей
    for(var i=0;i<M;i++){
      if(V[i]||!V[(i-1+M)%M]) continue;
      var len=0; while(len<M && !V[(i+len)%M]) len++;
      var p0=(i-1+M)%M, p1=(i+len)%M;
      var A=pt(p0), B=pt(p1), d=Math.hypot(B[0]-A[0],B[1]-A[1]);
      if(d<0.5||d>140) continue;                        // такой разрыв игра не перекрывает
      bridges++;
      var g1=ang(pt((p0-1+M)%M),A,B), g2=ang(A,B,pt((p1+1)%M));
      [g1,g2].forEach(function(g){ if(g!==null&&g>brWorst){ brWorst=g; brAt=p0; } });
    }
    out.push({side:side, verts:verts, hidden:hidden, worst:+worst.toFixed(1), at:at,
              over:over.length, sample:over.slice(0,4), bridges:bridges,
              brWorst:+brWorst.toFixed(1), brAt:brAt});
  });
  return out;
})()`;

function run(opt) {
  opt = opt || {};
  const r = R.result(`Изломы отбойника — ни одного больше ${LIMIT}°`);

  for (let ti = 0; ti < 4; ti++) {
    const env = H.loadGame({ seed: opt.seed || 11 });
    H.setupWorld(env, { trackIdx: ti });
    const sides = env.evalIn(MEASURE);
    const name = env.evalIn('track.name');
    const hidden = env.evalIn(`!!TRACKS[${ti}].hidden`);

    for (const s of sides) {
      if (s.missing) { r.fail(`${name}: ${s.side} отбойник не построен`); continue; }
      const head = `${name.padEnd(12)} ${s.side.padEnd(7)} лента: ${s.verts} стыков, худший ${s.worst}° (i=${s.at}), `
        + `> ${LIMIT}°: ${s.over}; перемычек ${s.bridges}, стык с лентой до ${s.brWorst}°`;
      if (hidden) r.note(head + ' — скрытая трасса, в зачёт не идёт');
      else {
        r.line(head);
        if (s.over > 0) {
          r.fail(`${name} / ${s.side}: ${s.over} изломов больше ${LIMIT}° — `
            + s.sample.map(o => `i=${o.i} ${o.deg}°`).join(', '));
        }
      }
    }
  }
  if (r.ok) r.line('на Монце и Сильверстоуне лента отбойника не складывается');
  r.note('Сузука и Монако: барьер строится обобщённо, без разметки настоящей линии — известное ограничение (CLAUDE.md §9)');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
