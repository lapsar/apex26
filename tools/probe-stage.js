/* ============================================================================
   Пробник `stage` — ЭКРАН ЭТАПА ПЕРЕД КВАЛИФИКАЦИЕЙ (v1.16.99, идея ребёнка владельца)

   Что сторожит (на каждой трассе, включая скрытую Сузуку):
     1. путь из меню (startWeekend(true)): экран виден сразу, кнопка серая
        «Готовим трассу…» и до постройки мира не жмётся; мир построен — кнопка
        «На прогревочный круг →», точка на карте, квалификации ещё НЕТ;
        кнопка — экран уходит, идёт прогревочный круг; второе нажатие ничего не делает;
     2. содержимое: Гран-при и флаг из таблицы STAGE, длина круга, гонка (круги, км),
        режим, три сектора по track.spec.sectors (сумма = круг), поул ≈ —
        с точностью до десятой равен времени сильнейшего в поле без жребия
        и не дальше ±0.2 % (+0.05 с округления) от настоящего поула квалы;
     3. карта: три сектора, клетчатая линия старта, кружки 1-2-3 не ближе
        полутора толщин полотна к самой трассе;
     4. жребий: функции экрана не зовут Math.random (счётчиком), а следующее
        Math.random после уик-энда и всё поле квалы — те же, что у пути без экрана;
     5. путь без экрана (startWeekend()) — сразу квалификация, как до v1.16.99;
     6. Enter/пробел жмут кнопку только когда она готова.
   ========================================================================== */
'use strict';
const H = require('./harness');
const R = require('./report');

function weekend(T, withStage, seed) {
  const env = H.loadGame({ seed });
  env.evalIn(`sel.track=${T.idx};sel.roster=0;sel.diff='normal';sel.laps=5;sel.view='chase';selTeam=ROSTER[0].teamIdx;`);
  env.evalIn(`startWeekend(${withStage ? 'true' : ''});`);
  return env;
}

function run() {
  const r = R.result('Экран этапа — карта, флаг, цифры, кнопка, жребий не тронут');
  for (const T of H.tracks()) {
    const fail = m => r.fail(`${T.name}: ${m}`);
    /* 1. путь из меню */
    const env = weekend(T, true, 11);
    if (env.evalIn(`typeof stageGo!=='function'||typeof STAGE!=='object'`)) { fail('экрана этапа нет (сборка до v1.16.99)'); continue; }
    const s0 = env.evalIn(`(function(){var b=document.getElementById('stageGo');stageGo();
      return {show:document.getElementById('stage').classList.contains('show'),dis:!!b.disabled,txt:b.textContent,phase:phase,ok:stageOk};})()`);
    if (!s0.show) fail('экран этапа не виден до постройки мира');
    if (!s0.dis || s0.txt !== 'Готовим трассу…') fail(`кнопка до постройки: «${s0.txt}», disabled=${s0.dis}`);
    if (s0.phase === 'quali' || s0.ok) fail('кнопка сработала до постройки мира');
    env.flushRAF();   // кадр → setTimeout (немедленно) → мир построен
    const s1 = env.evalIn(`(function(){var b=document.getElementById('stageGo'),m=document.getElementById('stageMap').innerHTML,l=document.getElementById('stageL').innerHTML;
      return {show:document.getElementById('stage').classList.contains('show'),dis:!!b.disabled,txt:b.textContent,phase:phase,ok:stageOk,map:m,left:l,
        dot:/id="stageDot"/.test(m),key:track.spec.key,st:STAGE[track.spec.key]||null,len:track.length,L:track.spec.sectors,laps:sel.laps,
        best:(function(){var b=null;ROSTER.forEach(function(x,i){if(i!==sel.roster&&(!b||x.skill>b.skill))b=x;});return qualiLapTime(b.skill,sel.diff);})(),
        pts:(function(){var N=track.P.length,st=Math.max(1,Math.round(N/450)),a=[];for(var i=0;i<N;i+=st)a.push([-track.P[i].x,-track.P[i].z]);return a;})()};})()`);
    if (!s1.show) fail('экран ушёл сам, без кнопки');
    if (s1.dis || s1.txt !== 'На прогревочный круг →') fail(`кнопка после постройки: «${s1.txt}», disabled=${s1.dis}`);
    if (s1.phase === 'quali') fail('квалификация началась без кнопки');
    if (!s1.ok) fail('stageOk не взведён после постройки');
    if (!s1.dot) fail('нет бегущей точки после постройки');
    /* 2. содержимое */
    if (!s1.st) fail(`нет строки ${s1.key} в STAGE`);
    else {
      if (s1.left.indexOf(s1.st.gp) < 0) fail(`нет названия «${s1.st.gp}»`);
      if (!/<svg class="stflag"[^>]*style="height:calc\(5\.4\*var\(--u\)\);width:calc\([\d.]+\*var\(--u\)\)"/.test(s1.left)) fail('флаг без заданной высоты и ширины');
      if (s1.left.indexOf('<rect') < 0) fail('флаг пустой');
    }
    const num = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    if (s1.left.indexOf(num(s1.len) + ' м') < 0) fail(`нет длины круга ${num(s1.len)} м`);
    const km = (s1.len * s1.laps / 1000).toFixed(1).replace('.', ',');
    if (s1.left.indexOf(`${s1.laps} кругов · ${km} км`) < 0) fail(`нет «${s1.laps} кругов · ${km} км»`);
    if (s1.left.indexOf('>Норма<') < 0) fail('нет режима «Норма»');
    const secs = [s1.L[0], s1.L[1] - s1.L[0], s1.len - s1.L[1]];
    secs.forEach((l, i) => { if (s1.left.indexOf(`S${i + 1}</b>${num(l)} м`) < 0) fail(`нет сектора S${i + 1} ${num(l)} м`); });
    if (Math.abs(secs[0] + secs[1] + secs[2] - s1.len) > 1e-6) fail('секторы в сумме не дают круг');
    const pm = /≈ (\d+):(\d\d)\.(\d)</.exec(s1.left);
    const pole = pm ? +pm[1] * 60 + +pm[2] + +pm[3] / 10 : NaN;
    if (!pm) fail('нет «Поул ≈ м:сс.д»');
    else if (Math.abs(pole - s1.best) > 0.05 + 1e-9) fail(`поул ≈ ${pole.toFixed(1)} при расчётном ${s1.best.toFixed(3)}`);
    /* 3. карта */
    const nSeg = (s1.map.match(/stroke="#(E8364F|29B6F6|FFD23F)"/g) || []).length;
    if (nSeg !== 3) fail(`секторов на карте ${nSeg} вместо 3`);
    if ((s1.map.match(/fill="#111"/g) || []).length !== 4) fail('нет клетчатой линии старта');
    const sw = (() => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of s1.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return Math.max(x1 - x0, y1 - y0) * 0.016; })();
    const badges = [...s1.map.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="[\d.]+" fill="#(E8364F|29B6F6|FFD23F)"\/><text[^>]*>(\d)</g)];
    if (badges.length !== 3) fail(`кружков секторов ${badges.length} вместо 3`);
    let worst = 1e9;
    for (const b of badges) { const x = +b[1], y = +b[2]; for (const [px, py] of s1.pts) worst = Math.min(worst, Math.hypot(px - x, py - y)); }
    if (badges.length && worst < sw * 1.5) fail(`кружок сектора в ${(worst / sw).toFixed(2)} толщины полотна от трассы (< 1.5)`);
    /* жребий напрямую: функции экрана не тянут Math.random вовсе (сравнение путей ниже не видит того, что идёт в обоих) */
    const rn = env.evalIn(`(function(){var n=0,keep=Math.random;Math.random=function(){n++;return keep();};
      try{stageShow();stageMap(track,true);stagePoleTxt();stageFlag('gb');stageReady();}finally{Math.random=keep;}return n;})()`);
    if (rn) fail(`экран этапа тянет Math.random (${rn} раз)`);
    /* кнопка: экран уходит, идёт прогревочный круг; второе нажатие ничего не начинает заново */
    const s2 = env.evalIn(`(function(){var o={};
      stageGo();o.phase=phase;o.show=document.getElementById('stage').classList.contains('show');o.map=document.getElementById('stageMap').innerHTML;
      o.rnd=Math.random();o.field=qualiField.map(function(q){return q.code+':'+q.time.toFixed(9);}).join(',');
      var f=qualiField;stageGo();o.again=qualiField===f;return o;})()`);
    if (s2.phase !== 'quali') fail(`после кнопки фаза «${s2.phase}» вместо quali`);
    if (s2.show || s2.map) fail('экран этапа не ушёл после кнопки');
    if (!s2.again) fail('второе нажатие кнопки начало квалификацию заново');
    /* 4. жребий против пути без экрана; 5. путь без экрана — сразу квала */
    const env2 = weekend(T, false, 11);
    env2.flushRAF();
    const s3 = env2.evalIn(`(function(){return {phase:phase,show:document.getElementById('stage').classList.contains('show'),
      rnd:Math.random(),field:qualiField.map(function(q){return q.code+':'+q.time.toFixed(9);}).join(',')};})()`);
    if (s3.phase !== 'quali' || s3.show) fail(`путь без экрана: фаза «${s3.phase}», экран ${s3.show ? 'виден' : 'скрыт'} — должна сразу идти квала`);
    if (s3.field !== s2.field) fail('поле квалификации не то же, что без экрана — экран сдвинул жребий');
    if (s3.rnd !== s2.rnd) fail(`следующее Math.random ${s2.rnd} против ${s3.rnd} без экрана — экран тянет жребий`);
    const realPole = +s2.field.split(',').map(x => +x.split(':')[1]).sort((a, b) => a - b)[0];
    if (pm && Math.abs(pole - realPole) > realPole * 0.002 + 0.05) fail(`поул ≈ ${pole.toFixed(1)}, а в квале ${realPole.toFixed(3)} (дальше 0.2 %)`);
    r.line(`${T.name.padEnd(12)} ${s1.st ? s1.st.gp : '—'} · круг ${num(s1.len)} м · S ${secs.map(num).join(' / ')} · поул ≈ ${pm ? pm.slice(1, 3).join(':') + '.' + pm[3] : '—'} (в квале ${realPole.toFixed(3)}) · кружки от трассы ≥ ${(worst / sw).toFixed(1)} толщ.`);
  }
  /* 6. Enter до готовности не жмёт, после — жмёт (слушатель клавиатуры игры) */
  {
    const T = H.tracks(true)[0], env = weekend(T, true, 11);
    if (env.evalIn(`typeof stageGo!=='function'`)) return r;
    const FIRE = `(_listeners.keydown||[]).forEach(function(f){f({key:'Enter',target:{tagName:'DIV'},preventDefault:function(){}});});`;
    const k = env.evalIn(`(function(){${FIRE}return {before:phase};})()`);
    env.flushRAF();
    const k2 = env.evalIn(`(function(){${FIRE}return {after:phase,n:(_listeners.keydown||[]).length};})()`);
    if (!k2.n) r.note('слушатель клавиатуры недоступен в обвязке — Enter не проверен');
    else {
      if (k.before === 'quali') r.fail('Enter сработал до постройки мира');
      if (k2.after !== 'quali') r.fail(`Enter после постройки: фаза «${k2.after}» вместо quali`);
    }
  }
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
