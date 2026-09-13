/* ============================================================================
   СПРАВКА — КОГДА И ГДЕ ИИ ИДЁТ В АТАКУ ОТНОСИТЕЛЬНО ТОЧКИ ТОРМОЖЕНИЯ
   (§10 п.16, «привязка манёвра к точке торможения»; НЕ пробник, порога нет).

   Пробник `aiover` считает, СКОЛЬКО обгонов; `overtake-anatomy` — ЧТО это
   за обгоны; эта справка отвечает на третий вопрос: успевает ли атакующий
   оказаться сбоку К ВХОДУ в поворот, или он весь манёвр делает уже внутри него.

   Что печатается по каждой защёлке атаки (`duel`):
     - сколько метров до ближайшего входа в поворот в момент захода;
     - где атакующий оказался НА ВХОДЕ: сдвиг вбок относительно цели, зазор вдоль
       дороги и «сбоку ли он» (корпуса перекрываются);
     - на какой стороне он идёт — ВНУТРЕННЕЙ для этого поворота или внешней;
     - сколько кадро-машин атака тратит вдали от любого торможения (> 150 м).

   Вход в поворот = первая точка впереди с |K| > 0.04 (порог сверен: даёт
   17 поворотов на Монце, 26 на Сильверстоуне, 24 на Монреале — то есть
   группирует шиканы, но не ловит шум прямой).

   Запуск: node tools/attack-timing.js [--laps=2] [--diff=normal] [--seeds=7,91]
   ========================================================================== */
'use strict';
const H = require('./harness');
const arg = (n, d) => { const p = process.argv.find(a => a.startsWith('--' + n + '=')); return p ? p.split('=').slice(1).join('=') : d; };
const LAPS = Number(arg('laps', 2));
const DIFF = arg('diff', 'normal');
const SEEDS = String(arg('seeds', '7,91')).split(',').map(Number);
const ONLY = arg('track', '');

const PROBE = `(function(){
  var dt=1/60, M=track.M, seg=track.length/M, KC=0.04, FAR=150;
  var live={}, done=[], farFrames=0, duelFrames=0, farLat=0, nearLat=0;
  function idx(c){return Math.floor(((c.u%1)+1)%1*M)%M;}
  /* метры до ближайшего входа в поворот; отрицательное — я уже в повороте */
  function toEntry(i){
    if(Math.abs(track.K[i])>KC){ // уже внутри: назад до входа
      for(var b=1;b<160;b++) if(Math.abs(track.K[(i-b+M)%M])<=KC) return -b*seg;
      return -999;}
    for(var a=1;a<400;a++){var j=(i+a)%M; if(Math.abs(track.K[j])>KC) return a*seg;}
    return 999;}
  function entryK(i){
    if(Math.abs(track.K[i])>KC)return track.K[i];
    for(var a=1;a<400;a++){var j=(i+a)%M; if(Math.abs(track.K[j])>KC) return track.K[j];}
    return 0;}
  __drive(Math.round(900/dt),dt,'auto',function(){
    for(var q=0;q<field.length;q++){var c=field[q]; if(c.retired)continue;
      var key=q, st=live[key];
      if(c.duel){
        duelFrames++;
        var i=idx(c), e=toEntry(i);
        var mv=(c.__lp===undefined)?0:Math.abs(c.lane-c.__lp);
        if(e>FAR){farFrames++;farLat+=mv;} else nearLat+=mv;
        if(e>FAR)0;
        if(!st||st.tgt!==c.duel){ // новая защёлка
          st=live[key]={tgt:c.duel, e0:e, dir:c.duelDir, k:entryK(i), armed:e>1, done:false};
        }
        if(st.armed&&!st.done&&e<=1&&e>-900){   // вот он, вход в поворот
          st.done=true;
          var t=st.tgt;
          done.push({e0:+st.e0.toFixed(0),
            dl:+(c.lane-t.lane).toFixed(2),
            dd:+(c.dist-t.dist).toFixed(1),
            side:st.dir, ins:(st.k>0?-1:1), inCorner:false});
        }
      } else if(st){ delete live[key]; }
      c.__lp=c.lane;
    }
    return !(phase===''||raceOver);
  });
  return {ev:done, farFrames:farFrames, duelFrames:duelFrames, farLat:farLat, nearLat:nearLat};
})()`;

function pct(a, b) { return (100 * a / Math.max(1, b)).toFixed(0) + ' %'; }
function med(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }

let TOT = { ev: 0, inside: 0, alongside: 0, wide: 0, far: 0, duel: 0, e0: [] };
for (const T of H.tracks(true)) {
  if (ONLY && T.name !== ONLY) continue;
  let ev = [], far = 0, duel = 0, farLat = 0, nearLat = 0;
  for (const seed of SEEDS) {
    const env = H.loadGame({ seed });
    H.setupWeekend(env, { trackIdx: T.idx, diff: DIFF, laps: LAPS });
    H.startRaceAt(env, 11); H.lightsOut(env); H.noRetirements(env);
    const r = env.evalIn(PROBE);
    ev = ev.concat(r.ev); far += r.farFrames; duel += r.duelFrames; farLat += r.farLat; nearLat += r.nearLat;
  }
  const inside = ev.filter(e => e.side === e.ins).length;
  const along = ev.filter(e => Math.abs(e.dd) < 6.04).length;
  const wide = ev.filter(e => Math.abs(e.dl) > 1.5).length;
  /* «занял позицию» — мягкая мерка, и она ближе к жизни, чем «сбоку»: в настоящей
     гонке атакующий ко входу обычно ещё чуть позади, но УЖЕ на внутренней и уже
     разведён вбок; довершает он обгон в апексе и на выходе. */
  const got = ev.filter(e => e.side === e.ins && Math.abs(e.dl) > 1.5 && Math.abs(e.dd) < 12).length;
  const e0 = ev.map(e => e.e0);
  console.log(`${T.name.padEnd(12)} защёлок, доживших до входа в поворот: ${ev.length}`);
  console.log(`   до входа в момент захода: медиана ${med(e0)} м (четверть ниже ${med(e0.slice().sort((a,b)=>a-b).slice(0,Math.max(1,e0.length>>1)))} м)`);
  console.log(`   НА ВХОДЕ: сбоку (корпуса перекрываются) ${along} = ${pct(along, ev.length)} · отошёл вбок >1.5 м ${wide} = ${pct(wide, ev.length)}`);
  console.log(`   сторона ВНУТРЕННЯЯ для этого поворота: ${inside} = ${pct(inside, ev.length)}`);
  console.log(`   ЗАНЯЛ ПОЗИЦИЮ к входу (внутри, разведён вбок, отстаёт меньше 2 корпусов): ${got} = ${pct(got, ev.length)}`);
  console.log(`   атака вдали от любого торможения (>150 м): ${pct(far, duel)} кадро-машин из ${duel}`);
  console.log(`   поперечный ход ПОД АТАКОЙ: вдали от торможения ${farLat.toFixed(0)} м, на подходе и в повороте ${nearLat.toFixed(0)} м`);
  console.log('');
  TOT.ev += ev.length; TOT.inside += inside; TOT.alongside += along; TOT.wide += wide; TOT.got = (TOT.got||0)+got; TOT.far += far; TOT.duel += duel; TOT.farLat = (TOT.farLat||0)+farLat; TOT.nearLat = (TOT.nearLat||0)+nearLat; TOT.e0 = TOT.e0.concat(e0);
}
console.log(`ИТОГО: защёлок ${TOT.ev} · до входа медиана ${med(TOT.e0)} м · сбоку на входе ${pct(TOT.alongside, TOT.ev)}`
  + ` · вбок >1.5 м ${pct(TOT.wide, TOT.ev)} · внутренняя сторона ${pct(TOT.inside, TOT.ev)} · вдали от торможения ${pct(TOT.far, TOT.duel)}`);
