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

fs.writeFileSync(OUT, src);
console.error(`опытная сборка: ${OUT} (сторона ${SIDE ? 'ВНУТРЬ' : 'как есть'}, строй ${HOLD || 'нет'}${HOLDALL ? ' + незащёлкнутые' : ''}, подтяг ${SNAP || 'нет'})`);
