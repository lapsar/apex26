/* ============================================================================
   ОПЫТНАЯ СБОРКА СО СГЛАЖЕННЫМ КОНТУРОМ ОДНОЙ ТРАССЫ (09.2026)

   Зачем. У Хунгароринга (bacinger/hu-1986) точки в поворотах стоят через
   ~10 м и каждая сбита вбок на полметра-метр: сплайн проходит через каждую,
   осевая виляет, кромка и поребрик «прыгают» (tools/contour-wobble.js).

   Как. Сглаживание Таубина (шаг +0.5, затем −0.53) — оно не стягивает
   повороты внутрь, как простое усреднение с соседями. Вес соседа — обратно
   расстоянию до него. Точки посреди прямых (оба соседних отрезка длиннее
   PIN м) не двигаются — там шума нет, а сглаживание только спрямило бы
   прямую (точка №0 Хунгароринга без этого уходила на 2.3 м). Сдвиг любой
   точки ограничен CAP м. Число и порядок точек те же — `sfShift` и всё,
   что считается по индексам, остаются на своих местах.

   Запуск:
     node tools/contour-smooth.js <из.html> <в.html> <Ключ> [проходов=5] [CAP=1.0] [PIN=40]
   Меняет ТОЛЬКО массив pts указанной трассы в строке TRACKDATA (остальные
   трассы — байт в байт). Исходный файл не трогает.
   ========================================================================== */
'use strict';
const fs = require('fs');
const [, , src, dst, key, itersA, capA, pinA] = process.argv;
if (!src || !dst || !key) { console.error('usage: contour-smooth.js from.html to.html Key [iters] [cap] [pin]'); process.exit(2); }
const iters = +itersA || 5, cap = +capA || 1.0, PIN = +pinA || 40;

const html = fs.readFileSync(src, 'utf8');
const lines = html.split('\n');
const li = lines.findIndex(l => l.startsWith('const TRACKDATA='));
const line = lines[li];
// вырезаем ровно "Ключ":{"pts":[...]: остальной текст строки не трогаем
const head = JSON.stringify(key) + ':{"pts":';
const at = line.indexOf(head);
if (at < 0) throw new Error('нет трассы ' + key);
const from = at + head.length;
let depth = 0, to = from;
for (; to < line.length; to++) { const c = line[to]; if (c === '[') depth++; else if (c === ']') { depth--; if (depth === 0) { to++; break; } } }
const p0 = JSON.parse(line.slice(from, to));

const dup = p0.length > 1 && p0[0][0] === p0[p0.length - 1][0] && p0[0][1] === p0[p0.length - 1][1];
const n = dup ? p0.length - 1 : p0.length;
let p = p0.slice(0, n).map(q => q.slice());
const seg = (i, k) => Math.hypot(p0[i][0] - p0[k][0], p0[i][1] - p0[k][1]);
const pinned = [];
for (let j = 0; j < n; j++) pinned.push(Math.min(seg(j, (j - 1 + n) % n), seg(j, (j + 1) % n)) > PIN);

function step(f) {
  const q = p.map(x => x.slice());
  for (let j = 0; j < n; j++) {
    if (pinned[j]) continue;
    const a = p[(j - 1 + n) % n], b = p[j], c = p[(j + 1) % n];
    const wa = 1 / Math.hypot(a[0] - b[0], a[1] - b[1]), wc = 1 / Math.hypot(c[0] - b[0], c[1] - b[1]);
    q[j] = [b[0] + f * ((wa * a[0] + wc * c[0]) / (wa + wc) - b[0]), b[1] + f * ((wa * a[1] + wc * c[1]) / (wa + wc) - b[1])];
  }
  p = q;
}
for (let k = 0; k < iters; k++) { step(0.5); step(-0.53); }

let mx = 0, sum = 0, over = 0;
for (let j = 0; j < n; j++) {
  let d = Math.hypot(p[j][0] - p0[j][0], p[j][1] - p0[j][1]);
  if (d > cap) { const f = cap / d; p[j] = [p0[j][0] + (p[j][0] - p0[j][0]) * f, p0[j][1] + (p[j][1] - p0[j][1]) * f]; d = cap; over++; }
  mx = Math.max(mx, d); sum += d;
}
p = p.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
if (dup) p.push(p[0].slice());
const txt = '[' + p.map(q => '[' + q.map(v => v.toFixed(1)).join(',') + ']').join(',') + ']';
lines[li] = line.slice(0, from) + txt + line.slice(to);
fs.writeFileSync(dst, lines.join('\n'));
console.log(`${key}: ${n} точек, закреплено ${pinned.filter(x => x).length}, упёрлись в CAP ${over}; ` +
  `сдвиг средний ${(sum / n).toFixed(2)} м, наибольший ${mx.toFixed(2)} м`);
