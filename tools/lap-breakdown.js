/* ============================================================================
   РАЗЛОЖЕНИЕ КРУГА ПО ТИПАМ УЧАСТКОВ — где именно игрок отыгрывает у поля

   ЗАЧЕМ. §10 п.22 спрашивает, откуда берётся разброс «выигрываемости» трасс:
   запас идеального круга игрока над поулом на Профи — Сильверстоун 11.6 с,
   Монца 5.8, Монреаль 3.3. Прежнее разложение снято ЛАПЛАСОВОЙ линией, то есть
   траекторией, которую болид не проедет, и вместе с ней рассыпалось (§11).
   Здесь то же разложение по БЫСТРЕЙШЕЙ линии из `raceline.js`.

   КАК СЧИТАЕТСЯ
     Игрок — профиль скорости по быстрейшей линии, той же физикой, что в raceline.
     Соперник-лидер (сила 0.98) — штатными `aiTarget`/`aiBase`/`aiGrip`, то есть
     формулы зовутся ПО ИМЕНИ, а не повторяются (урок §11 про lap-potential).
     Время ИИ делится на QUALI_PACE — тогда его сумма равна поулу из якоря.
     Сопоставление поточечное: отрезок [i,i+1] — одна и та же продольная станция
     трассы для обоих, хотя по земле они проезжают разное.

   ДВЕ САМОПРОВЕРКИ, без которых числам верить нельзя (печатаются при --check):
     сумма времён ИИ обязана совпасть с `estLapTime` до 1e-9, а сумма времён
     игрока — с кругом из `raceline`. Цикл интегрирования здесь свой (иначе
     не достать профиль скорости), и разойтись он может молча.

   ЛИНЕЙКА ТИПОВ. Участок классифицируется по радиусу ОСЕВОЙ (24/|K| — ровно то,
   чем меряет сама игра), потому что это свойство ТРАССЫ и линейка общая для обоих.
   Вторая таблица (--byline) — по радиусу самой линии игрока: она показывает, во что
   оптимизатор превращает повороты, но сравнивать ею двоих нельзя.

   Не пробник: порогов нет, эталонов не держит, index.html не трогает.
   Запуск:  node tools/lap-breakdown.js [--track=Monza] [--diff=hard] [--passes=150]
            --byline   вторая таблица: типы по радиусу линии игрока
            --check    печатать самопроверки
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');
const RL = require('./raceline');

/* Границы типов, метры радиуса осевой. 80 м — не круглое число: это измеренная
   точка равенства игрока и ИИ на Профи (§10 п.13). 300 — граница, за которой
   поворот перестаёт ограничивать вовсе и едется как прямая. */
const BANDS = [
  { name: 'прямая',        lo: Infinity, hi: Infinity },
  { name: 'R > 300',       lo: 300,      hi: Infinity },
  { name: 'быстрый 80-300',lo: 80,       hi: 300 },
  { name: 'средний 30-80', lo: 30,       hi: 80 },
  { name: 'медленный <30', lo: 0,        hi: 30 },
];

function profile(env, off, diff) {
  return env.evalIn(`(function(){
    var off=${JSON.stringify(off)}, M=__RL.M, g=__RL.geom(off), ds=g.ds, i, p, n;
    var top=MAXSPEED*track.grip;

    /* --- игрок по быстрейшей линии: тот же ход, что в __RL.time --- */
    var vl=new Float64Array(M), vloc=new Float64Array(M);
    for(i=0;i<M;i++){ var Rr=g.R[i]; vl[i]=vloc[i]=Math.min(top,__RL.vLim(Rr<TURN_RMIN?TURN_RMIN:Rr)); }
    for(p=0;p<2;p++) for(n=0;n<M;n++){ i=(M-1-n+M)%M; var j=(i+1)%M;
      var c2=vl[j]*vl[j]+100*ds[i]; if(vl[i]*vl[i]>c2) vl[i]=Math.sqrt(c2); }
    var v=vl[0], dtP=new Float64Array(M), vP=new Float64Array(M), lim=new Uint8Array(M), tp=0;
    for(p=0;p<2;p++){ tp=0;
      for(i=0;i<M;i++){ var dt=ds[i]/Math.max(v,5);
        if(v<vl[i]) v=Math.min(vl[i], v+14*Math.max(0.14,1-0.85*v/top)*dt);
        else v=Math.max(vl[i], v-50*dt);
        /* «держит поворот» — скорость упёрта в сцепление ЭТОЙ точки: не в потолок трассы,
           не в собственную тягу и НЕ в огибающую торможения перед апексом впереди.
           Последнее важно: без проверки vl<=vloc в категорию попадала вся зона торможения,
           и колонки описывали не апекс, а подход к нему. */
        lim[i] = (vloc[i]<top-0.01 && vl[i]<=vloc[i]+1e-6 && v<=vl[i]+1e-6) ? 1 : 0;
        vP[i]=v; dtP[i]=ds[i]/Math.max(v,5); tp+=dtP[i]; } }
    tp*=ESTFUDGE;

    /* --- лидер поля: формулы игры по имени --- */
    var base=aiBase(0.98,DIFF_MUL['${diff}']), ck=aiGrip(0.98,DIFF_GRIP['${diff}']);
    var capA=new Float64Array(M);
    for(i=0;i<M;i++){ var Kc=Math.abs(track.K[i]);
      capA[i] = Kc<0.03 ? base : Math.min(base, aiCornerV(24/Kc+halfAt(i)*0.8)*ck); }
    var dsA=new Float64Array(M);
    for(i=0;i<M;i++) dsA[i]=track.P[i].distanceTo(track.P[(i+1)%M]);
    var va=base*0.5, dtA=new Float64Array(M), vA=new Float64Array(M), ta=0;
    for(var L=0;L<2;L++){ ta=0;
      for(i=0;i<M;i++){ var tg=aiTarget(i,va,base,ck), d2=dsA[i]/Math.max(va,5);
        if(va<tg) va+=Math.min(tg-va,13.5*Math.max(0.14,1-0.85*va/MAXSPEED)*d2);
        else va+=(tg-va)*Math.min(1,d2*3.0);
        vA[i]=va; dtA[i]=dsA[i]/Math.max(va,5); ta+=dtA[i]; } }
    ta*=ESTFUDGE;

    var out={ tp:tp, ta:ta, refA:estLapTime(base,ck), refP:0, quali:QUALI_PACE,
              lenA:0, rows:[] };
    for(i=0;i<M;i++){
      var K=Math.abs(track.K[i]);
      out.lenA+=dsA[i];
      out.rows.push({ Rax: K<0.03 ? 1e9 : 24/K, Rln: Math.min(g.R[i],1e9),
                      Rai: K<0.03 ? 1e9 : 24/K + halfAt(i)*0.8,
                      dsA: dsA[i], dsP: ds[i], dtA: dtA[i], dtP: dtP[i], lim: lim[i],
                      capP: vloc[i], capA: capA[i],
                      vA: vA[i], vP: vP[i] });}
    return out;})()`);
}

function bucket(rows, key, quali) {
  const out = BANDS.map(b => ({ name: b.name, len: 0, dtA: 0, dtP: 0, lim: 0, wid: [], spd: [] }));
  for (const r of rows) {
    const Rr = r[key];
    let k = 0;
    if (Rr >= 1e8) k = 0;                       // прямая: K<0.03, игра сама её не ограничивает
    else if (Rr >= 300) k = 1;
    else if (Rr >= 80) k = 2;
    else if (Rr >= 30) k = 3;
    else k = 4;
    out[k].len += r.dsA; out[k].dtA += r.dtA / quali; out[k].dtP += r.dtP;
    /* и расширение радиуса, и скорость берутся ТОЛЬКО там, где предел поворота реально
       связывает игрока: медиана по всем точкам категории считает и те, где он едет мимо
       пологой дуги на потолке, и потому показывает обратное правде */
    if (r.lim) { out[k].lim += r.dtP; out[k].spd.push(r.vP);
                 if (r.capA > 1) out[k].wid.push(r.capP / r.capA); }
  }
  /* медиана, а не среднее: одна точка с ломаным контуром (§9) двигает среднее на разы */
  for (const b of out) {
    b.wid.sort((x, y) => x - y); b.med = b.wid.length ? b.wid[b.wid.length >> 1] : 0;
    b.spd.sort((x, y) => x - y); b.vm = b.spd.length ? b.spd[b.spd.length >> 1] : 0;
  }
  return out;
}

/* Вклад каждой способности: круг игрока, у которого ОДНА из них заменена на ту, что
   есть у соперника, против его же настоящего круга. Таблица выше говорит, где
   преимущество РЕАЛИЗУЕТСЯ (быстрый выход из поворота отыгрывается на прямой за ним
   и там же записывается), а эта — где оно РОЖДАЕТСЯ.
   Замена делается на линии игрока: право срезать поворот у него остаётся, изолируется
   ровно одна величина. Предел соперника берётся его же формулами, по имени. */
function sensitivity(env, off, diff) {
  return env.evalIn(`(function(){
    var off=${JSON.stringify(off)}, M=__RL.M, g=__RL.geom(off), ds=g.ds, i, p, n;
    var top=MAXSPEED*track.grip;
    var base=aiBase(0.98,DIFF_MUL['${diff}']), ck=aiGrip(0.98,DIFF_GRIP['${diff}']);

    function band(i){ var K=Math.abs(track.K[i]); if(K<0.03) return 0;
      var Rr=24/K; return Rr>=300?1:Rr>=80?2:Rr>=30?3:4; }
    function aiCap(i){ var K=Math.abs(track.K[i]);
      if(K<0.03) return base;
      return Math.min(base, aiCornerV(24/K+halfAt(i)*0.8)*ck); }

    /* cat — какой тип участков отдать пределу соперника (-1 = ни один);
       brake/acc/den — чьи тормоза, тяга и знаменатель спада тяги */
    /* где игрока держит предел САМОЙ точки — считается один раз, тем же способом,
       что в profile: нужно, чтобы разделить вклад на апекс и на спрямлённую часть */
    var vloc=new Float64Array(M), vlb=new Float64Array(M), isApex=new Uint8Array(M);
    for(i=0;i<M;i++){ var R0=g.R[i]; vloc[i]=vlb[i]=Math.min(top,__RL.vLim(R0<TURN_RMIN?TURN_RMIN:R0)); }
    for(p=0;p<2;p++) for(n=0;n<M;n++){ i=(M-1-n+M)%M; var jj=(i+1)%M;
      var cc=vlb[jj]*vlb[jj]+100*ds[i]; if(vlb[i]*vlb[i]>cc) vlb[i]=Math.sqrt(cc); }
    (function(){ var v=vlb[0];
      for(p=0;p<2;p++) for(i=0;i<M;i++){ var dt=ds[i]/Math.max(v,5);
        if(v<vlb[i]) v=Math.min(vlb[i], v+14*Math.max(0.14,1-0.85*v/top)*dt);
        else v=Math.max(vlb[i], v-50*dt);
        isApex[i]=(vloc[i]<top-0.01 && vlb[i]<=vloc[i]+1e-6 && v<=vlb[i]+1e-6)?1:0; } })();

    /* only: 0 — вся категория, 1 — только апексы, 2 — только там, где игрок спрямил */
    function lap(cat, brake, acc, den, only){
      var vl=new Float64Array(M);
      for(i=0;i<M;i++){ var Rr=g.R[i];
        var swap = (cat===-2 || (cat>=0 && band(i)===cat))
                && (!only || (only===1 ? isApex[i] : !isApex[i]));
        vl[i] = swap ? aiCap(i) : Math.min(top,__RL.vLim(Rr<TURN_RMIN?TURN_RMIN:Rr)); }
      for(p=0;p<2;p++) for(n=0;n<M;n++){ i=(M-1-n+M)%M; var j=(i+1)%M;
        var c2=vl[j]*vl[j]+2*brake*ds[i]; if(vl[i]*vl[i]>c2) vl[i]=Math.sqrt(c2); }
      var v=vl[0], t=0;
      for(p=0;p<2;p++){ t=0;
        for(i=0;i<M;i++){ var dt=ds[i]/Math.max(v,5);
          if(v<vl[i]) v=Math.min(vl[i], v+acc*Math.max(0.14,1-0.85*v/den)*dt);
          else v=Math.max(vl[i], v-brake*dt);
          t+=ds[i]/Math.max(v,5); } }
      return t*ESTFUDGE; }

    var mine=lap(-1,50,14,top,0), out={ mine:mine, cats:[], apex:[], flat:[] };
    for(var c=0;c<5;c++){ out.cats.push(lap(c,50,14,top,0)-mine);
      out.apex.push(lap(c,50,14,top,1)-mine); out.flat.push(lap(c,50,14,top,2)-mine); }
    out.brake=lap(-1,AIBRAKE,14,top,0)-mine;
    out.acc=lap(-1,50,13.5,MAXSPEED,0)-mine;
    /* соперник, посаженный на ЛИНИЮ игрока: все способности его, траектория чужая.
       Разница с поулом и есть цена самой линии — то, что нельзя приписать способностям. */
    out.all=lap(-2,AIBRAKE,13.5,MAXSPEED,0)-mine;
    return out;})()`);
}

function run() {
  const r = R.result('Разложение круга по типам участков (справка, не пробник)');
  const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
  const only = arg('track', ''), dsel = arg('diff', 'hard');
  const diffs = dsel === 'all' ? ['easy', 'normal', 'hard'] : [dsel];
  const passes = +arg('passes', 0) || undefined;
  const byLine = process.argv.includes('--byline');
  const check = process.argv.includes('--check');

  for (const T of H.tracks()) {
    if (only && T.name.toLowerCase().indexOf(only.toLowerCase()) < 0) continue;
    const env = H.loadGame();
    H.setupWorld(env, { trackIdx: T.idx });
    env.evalIn(RL.SRC, 'raceline(fns)');
    const chk = env.evalIn('__RL.check()');
    if (chk > 1e-9) r.fail(`${T.name}: закон руля в raceline разошёлся с playerCornerV на ${chk}`);
    /* линия строится ОДИН раз на трассу: она свойство геометрии и физики игрока,
       а режим меняет только соперника */
    const line = RL.solve(env, { passes });
    if (line.bad) r.fail(`${T.name}: линия непроходима в ${line.bad} точках — разложение недостоверно`);

    for (const diff of diffs) {
      const g = profile(env, line.off, diff);
      const dA = Math.abs(g.ta - g.refA), dP = Math.abs(g.tp - line.raw);
      if (dA > 1e-9) r.fail(`${T.name}/${diff}: ход ИИ разошёлся с estLapTime на ${dA.toExponential(2)} с`);
      if (dP > 1e-9) r.fail(`${T.name}/${diff}: ход игрока разошёлся с raceline на ${dP.toExponential(2)} с`);

      const pole = g.ta / g.quali, gain = pole - g.tp;
      r.line('');
      r.line(`${T.name}${T.hidden ? ' (скрыта)' : ''} · ${diff} · поул ${R.lap(pole)} · игрок ${R.lap(g.tp)}`
        + ` · запас ${gain >= 0 ? '+' : ''}${gain.toFixed(2)} с`
        + (check ? `   [сверка: ИИ ${dA.toExponential(1)}, игрок ${dP.toExponential(1)}]` : ''));
      r.line('     тип участка        доля круга    поле      игрок    отыграл   предел   держит   в апексе');
      for (const b of bucket(g.rows, 'Rax', g.quali)) {
        if (b.len < 1) continue;
        const d = b.dtA - b.dtP;
        r.line(`     ${b.name.padEnd(17)} ${(100 * b.len / g.lenA).toFixed(1).padStart(5)} %`
          + `${b.dtA.toFixed(2).padStart(10)} с${b.dtP.toFixed(2).padStart(9)} с`
          + `${(d >= 0 ? '+' : '') + d.toFixed(2)}`.padStart(10)
          + (b.med ? `    x${b.med.toFixed(2)}` : '         ')
          + `${(100 * b.lim / Math.max(b.dtP, 1e-9)).toFixed(0).padStart(6)} %`
          + (b.vm ? `${b.vm.toFixed(0).padStart(7)} м/с` : ''));
      }
      const sn = sensitivity(env, line.off, diff);
      r.line('     — чем этот запас СОЗДАН: столько игрок потеряет, отдав одну свою способность сопернику');
      const names = BANDS.map(b => b.name);
      let sum = 0;
      sn.cats.forEach((d, k) => { if (Math.abs(d) < 0.005) return; sum += d;
        r.line(`     ${('предел в «' + names[k] + '»').padEnd(29)} ${((d >= 0 ? '+' : '') + d.toFixed(2) + ' с').padStart(8)}`
          + `   из них в апексе ${((sn.apex[k] >= 0 ? '+' : '') + sn.apex[k].toFixed(2)).padStart(6)}`
          + `, где спрямил ${((sn.flat[k] >= 0 ? '+' : '') + sn.flat[k].toFixed(2)).padStart(6)}`); });
      sum += sn.brake + sn.acc;
      r.line(`     ${'тормоза 50 -> AIBRAKE'.padEnd(29)} ${'+' + sn.brake.toFixed(2)} с`);
      r.line(`     ${'тяга 14 -> 13.5 и знаменатель'.padEnd(29)} ${'+' + sn.acc.toFixed(2)} с`);
      const dline = gain - sn.all;
      r.line(`     ${'все способности сразу'.padEnd(29)} ${'+' + sn.all.toFixed(2)} с`
        + `   + сама линия ${(dline >= 0 ? '+' : '') + dline.toFixed(2)} = запас ${gain.toFixed(2)} с`);

      if (byLine) {
        r.line('     — то же, но тип по радиусу ЛИНИИ игрока (сравнивать двоих ею нельзя):');
        for (const b of bucket(g.rows, 'Rln', g.quali)) {
          if (b.len < 1) continue;
          r.line(`     ${b.name.padEnd(17)} ${(100 * b.len / g.lenA).toFixed(1).padStart(5)} %`
            + `${b.dtA.toFixed(2).padStart(10)} с${b.dtP.toFixed(2).padStart(9)} с`);
        }
      }
    }
  }
  r.note('тип участка — по радиусу ОСЕВОЙ (24/|K|), то есть свойство трассы: линейка общая для игрока и поля');
  r.note('«отыграл» — время поля минус время игрока на этих отрезках; поле приведено к поулу делением на QUALI_PACE');
  r.note('это идеальный одиночный круг: ни трафика, ни струи, ни неточного руления');
  return r;
}

module.exports = { run };
if (require.main === module) R.main(run);
