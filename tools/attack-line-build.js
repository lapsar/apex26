/* ============================================================================
   ГЕНЕРАТОР ОПЫТНОЙ СБОРКИ — «привязка манёвра к точке торможения» (§10 п.16).

   index.html НЕ трогает: пишет копию, на которую натравливаются пробники
   и справки через APEX_INDEX.

   ЗАЧЕМ. Замер (`tools/attack-timing.js`, 09.2026) на нетронутой v1.15.79:
     - атака защёлкивается в медиане за 48 м до входа в поворот — это 0.8 с,
       за которые сместиться вбок физически нельзя;
     - К ВХОДУ в поворот атакующий идёт сбоку лишь в 7 % случаев;
     - сторона выбирается «где просторнее» и оказывается внутренней в 52 %,
       то есть подбрасыванием монеты;
     - на Монце 35 % кадро-машин атаки приходятся на места дальше 150 м
       от любого торможения — там манёвр не нужен и только размазывает поле.

   ТРИ КЛЮЧА, каждый включается отдельно, чтобы мерить их порознь:

   --side=inside   сторона атаки — ВНУТРЕННЯЯ для поворота, к которому подъезжаем,
                   а не «где просторнее». `freeSide` оставлен сторожем: если
                   внутренняя занята чужим болидом, он по-прежнему уведёт наружу.
                   Пока болид ещё не сместился (меньше 1 м от своей линии), сторона
                   пересматривается — иначе выбранная за 200 м до поворота устареет.
                   ПОСЛЕ смещения сторона не меняется: метание вбок-назад — это
                   ровно дефект v1.15.45 (ловушка 2).

   --hold=N        пока до входа в поворот больше N метров (или поворота впереди
                   не видно), атакующий ДЕРЖИТ СТРОЙ — едет по своей линии, в струе,
                   и не расходится вбок. Манёвр начинается на подходе.
                   Объезд вставшего (`ovLock`, `crawler`) из-под этого выведен:
                   на нём держится расшивка затора (v1.15.41).

   --snap=R        на подходе поперечный ход ускоряется до R в секунду (обычный
                   0.5+eff*1.2 ≈ 1.7, то есть 2.6 м за полторы секунды и 90 м пути).
                   Без этого «быть внутри к входу» недостижимо: защёлка случается
                   за 48 м. Жёсткий потолок 8 м/с вбок и доворот кузова не тронуты.

   --holdall=1     то же держание строя, но и для НЕзащёлкнутого смещения. Это уже
                   проверялось в v1.15.78 («согласование обеих веток») и собирало
                   поле в колонну на Монце — ключ оставлен, чтобы это перемерить,
                   а не чтобы им пользоваться.

   Запуск: node tools/attack-line-build.js --out=/tmp/a.html --side=inside --hold=120 --snap=3
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const OUT = arg('out', null); if (!OUT) throw new Error('нужен --out=<файл>');
const SIDE = arg('side', '') === 'inside';
const HOLD = +arg('hold', '0');
const SNAP = +arg('snap', '0');
const HOLDALL = arg('holdall', '0') === '1';
const REACH = +arg('reach', '0');       // на подходе к повороту атака защёлкивается с большего зазора, чем обычные 20 м
const REACHWIN = +arg('reachwin', '200');// ...если вход в поворот ближе этого
const ATKB = +arg('atkbrake', '1');     // во сколько раз позже тормозит тот, кто пошёл в атаку
const ATKC = +arg('atkcost', '1');      // и во сколько раз хуже он при этом проходит апекс — плата за поздний тормоз
const KC = +arg('kc', '0.04');          // |K| входа в поворот; порог сверен — 17/26/24 поворота на Монце/Сильверстоуне/Монреале
const LOOK = +arg('look', '60');        // на сколько точек вперёд искать вход (60 x 4 м = 240 м)

let src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function sub(re, to) { if (!re.test(src)) throw new Error('не найдено: ' + re); src = src.replace(re, to); }

/* helper: сколько ТОЧЕК до ближайшего входа в поворот впереди.
   -1 — я уже в повороте (манёвр пора заканчивать, а не начинать),
   -2 — впереди на всю дальность обзора поворота нет (чистая прямая). */
sub(/function freeSide\(c,base,cur,hw\)\{/,
`const ATK_KC=${KC}, ATK_LOOK=${LOOK};
function entryAheadPts(i){const M=track.M;
  if(Math.abs(track.K[i])>ATK_KC)return -1;
  for(let a=1;a<=ATK_LOOK;a++){if(Math.abs(track.K[(i+a)%M])>ATK_KC)return a;}
  return -2;}
function freeSide(c,base,cur,hw){`);

/* общие локальные величины подхода — считаются один раз на болид за кадр */
sub(/    const crawler=!!c\.ahd&&c\.ahd\.speed<c\.pace\*0\.5;/,
`    const __eA=entryAheadPts(iu), __eD=__eA>0?__eA*(track.length/track.M):(__eA===-1?0:1e9);
    const __eS=__eA>0?-Math.sign(track.K[(iu+__eA)%track.M]):0;
    const crawler=!!c.ahd&&c.ahd.speed<c.pace*0.5;`);

/* 0. ЗАХОДИТЬ РАНЬШЕ. Замер: защёлка случается за 48 м до входа, а внутренняя сторона
      к этому моменту занята гоночной линией самого обороняющегося — ограничитель полосы
      (hw*0.62) пускает атакующего внутрь лишь на 1.4 м вместо 2.6. Внутреннюю надо брать
      ПОКА ОНА СВОБОДНА, то есть на прямой: там гоночная линия проходит по осевой.
      Поэтому на подходе к торможению право на атаку даётся с большего зазора. */
if (REACH > 0) {
  sub(/    if\(!c\.duel&&!c\.ovLock&&!na&&!crawler&&!afterApex&&c\.ahd&&c\.gp<20&&raceTime>c\.react\+2\.0/,
`    if(!c.duel&&!c.ovLock&&!na&&!crawler&&!afterApex&&c.ahd&&c.gp<((__eA>0&&__eD<${REACHWIN})?${REACH}:20)&&raceTime>c.react+2.0`);
}

/* 1. сторона атаки */
if (SIDE) {
  sub(/      c\.duel=c\.ahd;c\.duelT=DUEL_TIME;c\.duelDir=freeSide\(c,c\.ahd\.lane,c\.ovSide,hw\);\}/,
`      c.duel=c.ahd;c.duelT=DUEL_TIME;c.duelDir=freeSide(c,c.ahd.lane,__eS||c.ovSide,hw);}
    else if(c.duel&&__eS&&Math.abs(c.lane-line)<1.0)c.duelDir=freeSide(c,c.duel.lane,__eS,hw);`);
}

/* 2. держать строй вдали от торможения */
const HOLD_EXPR = HOLD > 0 ? `(__eD>${HOLD}&&!crawler&&!c.ovLock)` : 'false';
if (HOLD > 0) {
  sub(/      else if\(c\.duel===c\.ahd\)ov=c\.duelDir;/,
`      else if(c.duel===c.ahd){ov=c.duelDir;if(${HOLD_EXPR})off=0;}
      else if(${HOLDALL ? HOLD_EXPR : 'false'})off=0;`);
  sub(/    else if\(c\.duel&&!c\.ovLock\)want=c\.duel\.lane\+c\.duelDir\*2\.6;/,
`    else if(c.duel&&!c.ovLock&&!${HOLD_EXPR})want=c.duel.lane+c.duelDir*2.6;`);
}

/* 3. успеть сместиться к входу */
if (SNAP > 0) {
  sub(/    let nl=c\.lane\+\(mix-c\.lane\)\*Math\.min\(1,dt\*\(0\.5\+eff\*1\.2\+\(c\.errPh\?2\.2:0\)\)\);/,
`    const __snap=(c.duel&&!c.ovLock&&__eA>0&&__eD<Math.max(30,c.speed*2.0))?${SNAP}:0;
    let nl=c.lane+(mix-c.lane)*Math.min(1,dt*Math.max(__snap,0.5+eff*1.2+(c.errPh?2.2:0)));`);
}

/* 4. САМ ПРИЁМ: атакующий тормозит позже и платит за это апексом.
      Без платы это просто более быстрый болид, а не размен. Приём уже был написан
      в v1.15.78 (`overtake-build.js --atkbrake`), но на фоне из 40 % атак его не было
      видно вовсе; теперь атака редка (22-30 %), и мерить его надо заново — так и
      записано в §10 п.16. Под флагом не действует: там обгон закрыт правилом дистанции. */
if (ATKB !== 1 || ATKC !== 1) {
  sub(/function aiTarget\(iu,speed,base,cornerK\)\{/, 'function aiTarget(iu,speed,base,cornerK,brk){');
  sub(/const v=Math\.sqrt\(vc\*vc\+2\*AIBRAKE\*a\*seg\);/, 'const v=Math.sqrt(vc*vc+2*(brk||AIBRAKE)*a*seg);');
  sub(/    let free=aiTarget\(iu,c\.speed,c\.base\*em\*\(1\+\(tf\?TOW_GAIN\*tf\.tow:0\)\),\(c\.cornerK\|\|34\)\*em\*\(1-\(tf\?DIRTY_LOSS\*tf\.dirty:0\)\)\);/,
`    let free=aiTarget(iu,c.speed,c.__ab=c.base*em*(1+(tf?TOW_GAIN*tf.tow:0)),c.__ak=(c.cornerK||34)*em*(1-(tf?DIRTY_LOSS*tf.dirty:0)));`);
  /* ВСТАВЛЯТЬ НАДО ПОСЛЕ nz/na, а не на строке `let target=free`: там они ещё
     не объявлены, и сборка падает с ReferenceError на первом же кадре. */
  sub(/    const na=neutAhead\(iu,c\.speed\);/,
`    const na=neutAhead(iu,c.speed);
    if(c.duel&&!nz&&!na)target=aiTarget(iu,c.speed,c.__ab,c.__ak*${ATKC},AIBRAKE*${ATKB});`);
}

fs.writeFileSync(OUT, src);
console.error(`опытная сборка: ${OUT} (сторона ${SIDE ? 'ВНУТРЬ' : 'как есть'}, строй ${HOLD || 'нет'}${HOLDALL ? ' + незащёлкнутые' : ''}, подтяг ${SNAP || 'нет'}, тормоз x${ATKB}, апекс x${ATKC})`);
