/* ============================================================================
   Пробник `sectors` — СЕКТОРЫ КВАЛИФИКАЦИИ (v1.16.95, решения владельца 21.10.2026)

   Что сторожит (на каждой трассе, включая скрытую Сузуку):
     1. данные: две линии внутри круга, каждый сектор не короче 15 % круга;
     2. соперники: время на линиях растёт, сумма секторов = время круга (1e-9),
        и qualiLapTime с накоплением выдаёт ровно то же число, что без него
        (накопление не смеет менять якорь);
     3. прогрев: плашки нет, линии не засекаются;
     4. живой быстрый круг автопилотом: каждая линия засечена один раз, ровно
        там, где стоит (доля кадра — независимым секундомером пробника, 1e-6 с);
        на линии крупно время сектора и «СЕКТОР k», через SEC_FLASH — снова
        секундомер; цвет, разница с поулом и место — независимым пересчётом
        по полю (фиолетовый — быстрее всех, зелёный — не хуже десятого);
     5. финиш: секторы игрока в сумме дают время круга, в плашке — время
        круга и место как на решётке; на экране итогов — таблица «Ты / поул /
        разница» с теми же числами;
     6. круг со срезкой (Монако, ключ cuts): плашка серая, «КРУГ УДАЛЁН»,
        новая попытка — секторы с нуля; оба круга удалены — серым до итогов;
     7. показ не тянет Math.random.
   ========================================================================== */
'use strict';
const H = require('./harness');
const R = require('./report');

const SRC = `
var __S={
 box:function(){var e=document.getElementById('sbox'),h=e.innerHTML||'',m=/<div class="big( c(\\w))?">([^<]*)<\\/div>/.exec(h),
   lbl=[],re=/<span( class="c(\\w)")?>([^<]*)<\\/span>/g,x;while((x=re.exec(h.split('<div class="bar">')[0]))){lbl.push({c:x[2]||'',t:x[3]});}
   var bars=[],rb=/<i( class="b(\\w)")?><\\/i>/g;while((x=rb.exec(h)))bars.push(x[2]||'');
   var d=/ПОУЛ <b class="c(\\w)">([^<]*)<\\/b>/.exec(h),p=/class="pchip">P(\\d+)</.exec(h);
   return {on:e.classList.contains('on'),big:m?m[3]:null,bc:m?(m[2]||''):null,lbl:lbl,bars:bars,dc:d?d[1]:null,d:d?d[2]:null,p:p?+p[1]:null,cut:h.indexOf('КРУГ УДАЛЁН')>=0};},
 /* независимый пересчёт: длительность сектора k у соперника, цвет, разница и место */
 sec:function(r,k){return k===0?r.at[0]:k===1?r.at[1]-r.at[0]:r.time-r.at[1];},
 color:function(k,x){var n=0;qualiField.forEach(function(r){if(__S.sec(r,k)<x)n++;});return n===0?'P':n<10?'G':'Y';},
 pos:function(k,c){var at=function(r){return k<2?r.at[k]:r.time;},p=1;qualiField.forEach(function(r){if(at(r)<c)p++;});return {d:c-at(qualiField[0]),p:p};},
 sign:function(d){return (d<0?'\\u2212':'+')+Math.abs(d).toFixed(3);},
 arc:function(){var i=project(player.x,player.z,player.hint).idx;return track.S[i]+((player.x-track.P[i].x)*track.F[i].x+(player.z-track.P[i].z)*track.F[i].z);}
};`;

function lap(env, o) {
  // быстрый круг автопилотом; на каждом кадре — независимый секундомер линий и снимки плашки
  return env.evalIn(`(function(){var o={fails:[],cross:[],flash:[],after:[],warm:{on:0,at:0}},L=track.spec.sectors,dt=1/60;
    /* прогрев: до линии старта плашки нет */
    for(var f=0;f<60*200&&!player.started;f++){__AP.drive();update(dt);if(!player.started&&__S.box().on)o.warm.on++;}
    if(!player.started){o.fails.push('прогрев не кончился за 200 с');return o;}
    var prevArc=__S.arc(),prevT=player.lapT,seen=0,flashUntil=-1,cutDone=false;
    for(var f=0;f<60*240&&phase==='quali'&&!qualiOutro;f++){
      __AP.drive();var a0=player.arcPrev,t0=player.lapT;update(dt);
      var a1=player.arcPrev,dA=a1-a0;
      if(${o.cutAfter1 ? 'true' : 'false'}&&!cutDone&&qSec.at.length===1&&player.lapT>qSec.at[0]+1){player.lapCut=true;cutDone=true;renderSecBox();o.cutBox=__S.box();o.cutAt=qSec.at.slice();}
      while(seen<2&&dA>0&&dA<100&&a0<L[seen]&&a1>=L[seen]){   // наш секундомер: доля кадра по пройденной дуге
        var want=t0+dt*(L[seen]-a0)/dA,got=qSec.at[seen];
        o.cross.push({k:seen,want:want,got:got,n:qSec.at.length,arc0:a0,arc1:a1,box:__S.box()});seen++;flashUntil=player.lapT+SEC_FLASH;}
      if(seen>0&&flashUntil>0&&player.lapT>flashUntil+0.1){o.after.push(__S.box());flashUntil=-1;}
      if(player.lap>=1&&qSec&&qSec.at.length===0&&seen>0)seen=0;   // новая попытка после срезки
    }
    o.phase=phase;o.outro=qualiOutro;o.last=player.last;o.qSec=player.qSec;o.noTime=player.noTime;updateHUD();o.finBox=__S.box();   // в игре цикл крутится и во время итогов квалы
    o.grid=window.__grid?window.__grid.findIndex(function(g){return g.you;})+1:0;
    return o;})()`);
}

function run() {
  const r = R.result('Секторы квалификации — линии, плашка, цвета, итоги');
  for (const T of H.tracks(false)) {
    const env = H.loadGame({ seed: 5 });
    H.setupWeekend(env, { trackIdx: T.idx, diff: 'easy', view: 'cockpit' });
    env.evalIn(SRC);
    const fail = m => r.fail(`${T.name}: ${m}`);

    /* 1–2. данные и поле */
    const d = env.evalIn(`(function(){var L=track.spec.sectors,o={L:L,len:track.length,bad:[]};if(!L)return o;
      qualiField.forEach(function(r){if(!r.at||!(r.at[0]>0&&r.at[1]>r.at[0]&&r.time>r.at[1]))o.bad.push(r.code+' линии не по порядку');
        var s=__S.sec(r,0)+__S.sec(r,1)+__S.sec(r,2);if(Math.abs(s-r.time)>1e-9)o.bad.push(r.code+' сумма '+s);});
      var sk=ROSTER[3].skill,c=[];o.same=qualiLapTime(sk,sel.diff)===qualiLapTime(sk,sel.diff,c);o.cumN=c.length;o.M=track.M;
      var cnt=0,keep=Math.random;Math.random=function(){cnt++;return keep();};
      player.started=true;qSec={at:[10,30],k:1,flash:2};for(var i=0;i<50;i++){renderSecBox();secStep(L[0]-5,10,1/60);}
      qSec=null;player.started=false;renderSecBox();Math.random=keep;o.rnd=cnt;o.offAfter=!document.getElementById('sbox').classList.contains('on');
      o.pole=[__S.sec(qualiField[0],0),__S.sec(qualiField[0],1),__S.sec(qualiField[0],2),qualiField[0].time,qualiField[0].code];return o;})()`);
    if (!d.L) { fail('нет ключа sectors'); continue; }
    const [a, b] = d.L, minSec = Math.min(a, b - a, d.len - b) / d.len;
    if (!(a > 0 && b > a && b < d.len)) fail(`линии не внутри круга: ${a} / ${b} при круге ${d.len.toFixed(0)}`);
    if (minSec < 0.15) fail(`самый короткий сектор ${(minSec * 100).toFixed(1)} % круга (< 15 %)`);
    d.bad.forEach(fail);
    if (!d.same) fail('qualiLapTime с накоплением даёт другое время — якорь сдвинулся бы');
    if (d.cumN !== d.M + 1) fail(`накопление: ${d.cumN} точек вместо ${d.M + 1}`);
    if (d.rnd) fail(`показ секторов тянет Math.random (${d.rnd} раз)`);
    if (!d.offAfter) fail('плашка не гаснет, когда быстрого круга нет');
    /* цвета на подставленных временах: автопилот медленный и даёт только жёлтый, поэтому границы проверяются числом */
    const cc = env.evalIn(`(function(){var o=[];for(var k=0;k<3;k++){var s=qualiField.map(function(r){return __S.sec(r,k);}).sort(function(a,b){return a-b;});
      o.push([secColor(k,s[0]-0.001),secColor(k,s[0]+0.001),secColor(k,s[9]),secColor(k,s[9]+0.001),secColor(k,s[20]+1)].join(''));}return o;})()`);
    cc.forEach((c, k) => { if (c !== 'PGGYY') fail(`цвет сектора ${k + 1} у границ: ${c} вместо PGGYY (быстрее всех / чуть хуже первого / ровно десятый / хуже десятого / хуже всех)`); });

    /* 3–5. прогрев и быстрый круг */
    env.timeouts.mode = 'defer';                              // итоги квалы — вручную, после проверки плашки на финише
    const o = lap(env, {});
    if (o.warm.on) fail(`плашка секторов видна на прогреве (${o.warm.on} кадров)`);
    o.fails.forEach(fail);
    if (o.cross.length !== 2) fail(`засечено линий ${o.cross.length} из 2`);
    o.cross.forEach(c => {
      if (c.n !== c.k + 1) fail(`линия ${c.k + 1}: в qSec ${c.n} отметок`);
      if (!(Math.abs(c.got - c.want) < 1e-6)) fail(`линия ${c.k + 1}: время ${c.got} вместо ${c.want.toFixed(6)}`);
      const x = c.k === 0 ? c.got : c.got - o.cross[0].got, want = x.toFixed(3);
      const col = env.evalIn(`__S.color(${c.k},${x})`), q = env.evalIn(`__S.pos(${c.k},${c.got})`);
      if (c.box.big !== want || c.box.bc !== col) fail(`линия ${c.k + 1}: крупно «${c.box.big}» цветом ${c.box.bc}, ждали «${want}» ${col}`);
      if (!c.box.lbl[c.k] || c.box.lbl[c.k].t !== 'СЕКТОР ' + (c.k + 1)) fail(`линия ${c.k + 1}: нет подписи «СЕКТОР ${c.k + 1}»`);
      if (c.box.bars[c.k] !== col) fail(`линия ${c.k + 1}: полоска ${c.box.bars[c.k]} вместо ${col}`);
      const ds = env.evalIn(`__S.sign(${q.d})`);
      if (c.box.d !== ds || c.box.p !== q.p || c.box.dc !== (q.d < 0 ? 'P' : 'Y')) fail(`линия ${c.k + 1}: «ПОУЛ ${c.box.d} P${c.box.p}», ждали «${ds} P${q.p}»`);
      r.note(`${T.name} линия ${c.k + 1} (${d.L[c.k]} м): сектор ${want} ${col}, поул ${ds}, P${q.p}`);
    });
    o.after.forEach((bx, i) => { if (!/^\d+(:\d\d)?\.\d$/.test(bx.big || '') || bx.lbl.some(l => /СЕКТОР/.test(l.t))) fail(`после SEC_FLASH (линия ${i + 1}) крупно «${bx.big}», а не секундомер`); });
    if (!o.outro) fail(`круг не закончился квалой (фаза «${o.phase}»)`);
    else {
      const s = o.qSec ? o.qSec[0] + o.qSec[1] + o.qSec[2] : NaN;
      if (!(Math.abs(s - o.last) < 1e-9)) fail(`секторы игрока ${o.qSec} не дают время круга ${o.last}`);
      const f = o.finBox, fl = env.evalIn(`fmt(${o.last})`), q = env.evalIn(`__S.pos(2,${o.last})`);
      if (f.big !== fl || f.bars.length !== 3 || f.bars.some(c => !c)) fail(`финиш: крупно «${f.big}», полоска ${f.bars.join(',')}`);
      if (f.p !== q.p || f.p !== o.grid) fail(`финиш: место в плашке P${f.p}, пересчёт P${q.p}, решётка P${o.grid}`);
      const cols = [0, 1, 2].map(k => env.evalIn(`__S.color(${k},${o.qSec[k]})`));
      if (f.bars.join('') !== cols.join('')) fail(`финиш: цвета ${f.bars.join('')} вместо ${cols.join('')}`);
      env.evalIn('(function(){var p=window.__pendingFlush;})()');
      for (const [, t] of env.timeouts.pending) if (typeof t.fn === 'function') t.fn();   // endQualiToResult
      env.timeouts.pending.clear();
      const tab = env.evalIn(`document.getElementById('qSec').innerHTML`);
      const need = o.qSec.map(x => x.toFixed(3)).concat([fl]);
      if (!/<table/.test(tab) || need.some(t => tab.indexOf(t) < 0)) fail(`итоги: нет таблицы секторов или чисел ${need.join(' ')}`);
      const ps = d.pole.slice(0, 3).map(x => x.toFixed(3));
      if (ps.some(t => tab.indexOf(t) < 0) || tab.indexOf(d.pole[4]) < 0) fail(`итоги: нет секторов поула ${d.pole[4]} ${ps.join(' ')}`);
      r.line(`${T.name.padEnd(12)} линии ${d.L.join(' / ')} м · круг ${fl} = ${o.qSec.map(x => x.toFixed(3)).join(' + ')} (${cols.join('')}) · `
        + `поул ${d.pole[4]} ${d.pole.slice(0, 3).map(x => x.toFixed(3)).join(' + ')} · P${f.p}`);
    }

    /* 6. срезка (только трассы с cuts): серым, новая попытка — с нуля, оба удалены — серым до итогов */
    if (env.evalIn('!!track.spec.cuts')) {
      const e2 = H.loadGame({ seed: 5 });
      H.setupWeekend(e2, { trackIdx: T.idx, diff: 'easy', view: 'cockpit' });
      e2.evalIn(SRC); e2.timeouts.mode = 'defer';
      const c = lap(e2, { cutAfter1: true });
      if (!c.cutBox || !c.cutBox.cut || c.cutBox.bars[0] !== 'X' || c.cutBox.lbl[0].c !== 'X') fail(`срезка: плашка не серая (${JSON.stringify(c.cutBox)})`);
      const second = c.cross.filter((x, i) => i >= 1);   // после срезки: вторая линия той же попытки — серым
      if (second[0] && (second[0].box.bc !== 'X' || !second[0].box.cut)) fail(`срезка: время второго сектора не серое (${second[0].box.bc})`);
      const re = e2.evalIn(`(function(){return {lap:player.lap,try:player.qTry,at:qSec.at.length,box:__S.box()};})()`);
      if (!c.outro && re.try !== 2) fail(`срезка: нет второй попытки (попытка ${re.try})`);
      r.note(`${T.name}: срезка после линии 1 — серым, «КРУГ УДАЛЁН»; вторая попытка: ${c.outro ? 'кончилась ' + (c.noTime ? 'без времени' : 'временем') : 'идёт, секторов ' + re.at}`);
      // оба круга удалены: последняя попытка тоже со срезкой — секторы серым до итогов
      const e3 = H.loadGame({ seed: 5 });
      H.setupWeekend(e3, { trackIdx: T.idx, diff: 'easy', view: 'cockpit' });
      e3.evalIn(SRC); e3.timeouts.mode = 'defer';
      const z = e3.evalIn(`(function(){player.qTry=TL_TRIES;return 0;})()`);
      const c3 = lap(e3, { cutAfter1: true });
      if (!c3.noTime || !c3.finBox.on || !c3.finBox.cut || c3.finBox.big !== '—') fail(`оба круга удалены: плашка ${JSON.stringify(c3.finBox)}, без времени ${c3.noTime}${z}`);
    }
  }
  r.note('цвета: P — быстрее всех соперников в секторе, G — не хуже десятого, Y — дальше, X — круг удалён');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
