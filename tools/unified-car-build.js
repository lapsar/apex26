/* ============================================================================
   ГЕНЕРАТОР ОПЫТНОЙ СБОРКИ «один болид на всех + поправка силы пилота».

   index.html НЕ трогает: читает его и пишет копию в указанный файл, чтобы
   пробники можно было натравить на неё через APEX_INDEX. Правки ровно пять,
   все текстовые и все проверяются на попадание — если игра ушла вперёд и
   строка не нашлась, скрипт падает, а не молча пишет прежний файл.

     1. DIFF_MUL и DIFF_GRIP становятся ОДНИМ набором чисел (коэффициент режима);
     2. aiBase — потолок игрока x коэффициент режима x поправка силы;
     3. aiGrip — та же поправка, тот же наклон (было 0.5 против 0.369 на прямой);
     4. AIBRAKE в aiTarget -> 50 (тормоза игрока) x тот же множитель;
     5. разгон 13.5 -> 14 (разгон игрока) x тот же множитель, в estLapTime и в гонке.

   Запуск: node tools/unified-car-build.js --out=/tmp/uni.html [--easy=0.90]
           [--normal=0.95] [--hard=0.975] [--k=0.35] [--scale=1|0]
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const OUT = arg('out', null); if (!OUT) throw new Error('нужен --out=<файл>');
const E = +arg('easy', 0.90), N = +arg('normal', 0.95), Hd = +arg('hard', 0.975);
const K = +arg('k', 0.35), SC = arg('scale', '1') === '1';
const F = SC ? '(cornerK)' : '1';                       // множитель тормозов и разгона

let src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let hits = 0;
function sub(re, to) { const n = (src.match(re) || []).length; if (!n) throw new Error('не найдено: ' + re); src = src.replace(re, to); hits += n; }

sub(/const DIFF_MUL=\{easy:[\d.]+,normal:[\d.]+,hard:[\d.]+\};/,
  `const DIFF_MUL={easy:${E},normal:${N},hard:${Hd}};`);
sub(/const DIFF_GRIP=\{easy:[\d.]+,normal:[\d.]+,hard:[\d.]+\};/,
  `const DIFF_GRIP={easy:${E},normal:${N},hard:${Hd}};`);
sub(/function aiBase\(skill,mul\)\{return [^}]+\}/,
  `function aiBase(skill,mul){return MAXSPEED*track.grip*mul*(1+(skill-0.98)*${K});}`);
sub(/function aiGrip\(skill,gf\)\{return [^}]+\}/,
  `function aiGrip(skill,gf){return gf*(1+(skill-0.98)*${K});}`);
sub(/2\*AIBRAKE\*a\*seg/, `2*(50*${F})*a*seg`);
sub(/13\.5\*Math\.max\(0\.14,1-0\.85\*v\/MAXSPEED\)/, `14*${F}*Math.max(0.14,1-0.85*v/MAXSPEED)`);
sub(/13\.5\*Math\.max\(0\.14,1-0\.85\*c\.speed\/MAXSPEED\)/,
  `14*${SC ? '(c.cornerK||1)' : '1'}*Math.max(0.14,1-0.85*c.speed/MAXSPEED)`);
sub(/<div class="verstamp">[^<]*<\/div>/, `<div class="verstamp">UNI D=${E}/${N}/${Hd} k=${K}${SC ? ' scaled' : ' fixed'}</div>`);

fs.writeFileSync(OUT, src);
console.log('опытная сборка: ' + OUT + '  (правок применено: ' + hits + ')');
