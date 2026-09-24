/* ============================================================================
   APEX '26 — run-all.js
   Общий прогон регрессионного чек-листа (CLAUDE.md §13).

       node tools/run-all.js
       node tools/run-all.js --only=pole,grid
       node tools/run-all.js --jobs=1          # по одному
       node tools/run-all.js --list

   Каждый пробник идёт в СВОЁМ процессе (run-one.js), до --jobs штук разом
   (по умолчанию — по числу ядер). Зёрна у пробников свои и в каждом процессе
   с нуля, поэтому числа те же, что при прогоне по одному (сверка — журнал 09.2026).
   Тяжёлые пробники запускаются первыми, чтобы не остаться хвостом в конце.
   Выдача печатается в прежнем порядке, когда все закончили; пока идут — строка
   «готов» на каждый.

   index.html только читается и никогда не меняется.
   ========================================================================== */
'use strict';

const os = require('os');
const path = require('path');
const { fork } = require('child_process');
const R = require('./report');

/* secs — сколько пробник шёл на v1.16.5 по одному (4 ядра облачной машины).
   Только для порядка запуска: тяжёлые вперёд. На результат не влияет. */
const PROBES = [
  { key: 'pole',      mod: './probe-pole-times.js',         secs: 27 },
  { key: 'quali',     mod: './probe-quali-spread.js',       secs: 15 },
  { key: 'race',      mod: './probe-race-finish.js',        secs: 118 },
  { key: 'outro',     mod: './probe-outro-autopilot.js',    secs: 160 },
  { key: 'overtake',  mod: './probe-start-overtake.js',     secs: 120 },
  { key: 'startsync', mod: './probe-start-sync.js',         secs: 64 },
  { key: 'grid',      mod: './probe-grid.js',               secs: 43 },
  { key: 'wall',      mod: './probe-wall-kinks.js',         secs: 31 },
  { key: 'solid',     mod: './probe-wall-solid.js',         secs: 41 },
  { key: 'materials', mod: './probe-materials.js',          secs: 42 },
  { key: 'load',      mod: './probe-scene-load.js',         secs: 62 },
  { key: 'print',     mod: './probe-track-fingerprint.js',  secs: 33 },
  { key: 'clear',     mod: './probe-scenery-clear.js',      secs: 156 },
  { key: 'neutral',   mod: './probe-neutralisation.js',     secs: 830 },
  { key: 'aiover',    mod: './probe-ai-overtakes.js',       secs: 235 },
  { key: 'charge',    mod: './probe-ai-charge.js',          secs: 977 },
  { key: 'traffic',   mod: './probe-player-traffic.js',     secs: 922 },
  { key: 'tower',     mod: './probe-tower.js',              secs: 998 },
  { key: 'fastlap',   mod: './probe-fastest-lap.js',        secs: 99 },
  { key: 'audio',     mod: './probe-audio-resume.js',       secs: 1 },
  { key: 'taps',      mod: './probe-tap-through.js',        secs: 0 },
  { key: 'dispose',   mod: './probe-scene-dispose.js',      secs: 19 },
];

/* Быстрая проверка правки окружения (цвета, реклама, трибуны, щиты):
   поломку на других трассах ловят именно они, гонки окружения не видят.
   Полный прогон перед выдачей сборки всё равно обязателен (docs/notes/checklist.md). */
const SCENERY = ['pole', 'print', 'load', 'materials', 'clear', 'wall', 'solid', 'dispose'];

function defaultJobs() {
  return os.availableParallelism ? os.availableParallelism() : os.cpus().length;
}

/** Один пробник в отдельном процессе. Всегда разрешается, даже если процесс упал. */
function runChild(p, argv) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const out = [];
    let msg = null;
    const child = fork(path.join(__dirname, 'run-one.js'), [p.mod, ...argv],
      { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout.on('data', d => out.push(d));
    child.stderr.on('data', d => out.push(d));
    child.on('message', m => { msg = m; });
    child.on('exit', (code, signal) => {
      let r;
      if (msg && msg.result) {
        r = Object.assign(R.result(msg.result.name), {
          lines: msg.result.lines, failures: msg.result.failures, notes: msg.result.notes });
      } else {
        r = R.result(p.key);
        r.fail('пробник упал: ' + (msg && msg.error
          || ('процесс вышел ' + (signal ? 'по сигналу ' + signal : 'с кодом ' + code))));
      }
      r.key = p.key;
      r.secs = ((Date.now() - t0) / 1000).toFixed(1);
      r.memGb = msg && msg.maxRssKb ? msg.maxRssKb / 1048576 : null;
      r.output = Buffer.concat(out).toString();
      resolve(r);
    });
  });
}

async function main(argv) {
  const opt = R.parseArgs(argv);
  if (opt.list) {
    console.log('Пробники: ' + PROBES.map(p => p.key).join(', '));
    console.log('Быстрая проверка окружения: --only=' + SCENERY.join(','));
    return 0;
  }
  const only = opt.only ? String(opt.only).split(',').map(s => s.trim()) : null;
  const chosen = only ? PROBES.filter(p => only.includes(p.key)) : PROBES;
  if (!chosen.length) { console.error('Ни один пробник не выбран: --only=' + opt.only); return 2; }
  const jobs = Math.max(1, Math.min(chosen.length, Math.floor(+opt.jobs || defaultJobs())));
  const pass = argv.filter(a => !/^--(only|jobs)(=|$)/.test(a));

  console.log('APEX \'26 — регрессионный прогон');
  console.log('index.html читается как есть, ничего не переписывается.');
  console.log(`Пробников ${chosen.length}, разом до ${jobs}.`);

  const started = Date.now();
  const queue = chosen.slice().sort((a, b) => b.secs - a.secs);
  const byKey = {};
  let done = 0;
  async function worker() {
    for (let p; (p = queue.shift());) {
      const r = await runChild(p, pass);
      byKey[p.key] = r;
      done++;
      console.log(`  ${r.ok ? R.OK : R.BAD} готов ${p.key.padEnd(10)}${r.secs.padStart(7)} с`
        + `   (${done}/${chosen.length}, прошло ${((Date.now() - started) / 60000).toFixed(1)} мин)`);
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker));

  const results = chosen.map(p => byKey[p.key]);
  for (const r of results) {
    if (r.output.trim()) process.stdout.write('\n' + r.output.replace(/\s+$/, '') + '\n');
    R.printResult(r);
  }

  const failed = results.filter(r => !r.ok);
  console.log('\n' + '─'.repeat(72));
  console.log('ИТОГ  ' + (results.length - failed.length) + ' из ' + results.length
    + ' пробников прошли, ' + ((Date.now() - started) / 1000).toFixed(0) + ' с'
    + (jobs > 1 ? ` (разом до ${jobs})` : ''));
  for (const r of results) {
    console.log('  ' + (r.ok ? R.OK : R.BAD) + ' ' + r.key.padEnd(10) + r.secs.padStart(6) + ' с'
      + (r.memGb ? (r.memGb.toFixed(1) + ' ГБ').padStart(8) : ' '.repeat(8))
      + '   ' + r.name);
  }
  if (failed.length) {
    console.log('\nНЕ СОШЛОСЬ:');
    for (const r of failed) {
      console.log('  ' + R.BAD + ' ' + r.name);
      for (const f of r.failures) console.log('      – ' + f);
    }
    console.log('\nПроверка на устройстве владельцем всё равно обязательна: автотесты её не заменяют.');
    return 1;
  }
  console.log('\nВсё сошлось. Проверка на устройстве владельцем всё равно обязательна.');
  return 0;
}

if (require.main === module) main(process.argv.slice(2)).then(code => process.exit(code));
module.exports = { main, PROBES, SCENERY };
