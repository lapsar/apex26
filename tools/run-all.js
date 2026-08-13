/* ============================================================================
   APEX '26 — run-all.js
   Общий прогон регрессионного чек-листа (CLAUDE.md §13).

       node tools/run-all.js
       node tools/run-all.js --only=pole,grid
       node tools/run-all.js --list

   index.html только читается и никогда не меняется.
   ========================================================================== */
'use strict';

const R = require('./report');

const PROBES = [
  { key: 'pole',      mod: './probe-pole-times.js' },
  { key: 'quali',     mod: './probe-quali-spread.js' },
  { key: 'race',      mod: './probe-race-finish.js' },
  { key: 'outro',     mod: './probe-outro-autopilot.js' },
  { key: 'overtake',  mod: './probe-start-overtake.js' },
  { key: 'startsync', mod: './probe-start-sync.js' },
  { key: 'grid',      mod: './probe-grid.js' },
  { key: 'wall',      mod: './probe-wall-kinks.js' },
  { key: 'materials', mod: './probe-materials.js' },
  { key: 'load',      mod: './probe-scene-load.js' },
  { key: 'print',     mod: './probe-track-fingerprint.js' },
  { key: 'clear',     mod: './probe-scenery-clear.js' },
  { key: 'neutral',   mod: './probe-neutralisation.js' },
  { key: 'aiover',    mod: './probe-ai-overtakes.js' },
];

function main(argv) {
  const opt = R.parseArgs(argv);
  if (opt.list) {
    console.log('Пробники: ' + PROBES.map(p => p.key).join(', '));
    return 0;
  }
  const only = opt.only ? String(opt.only).split(',').map(s => s.trim()) : null;
  const chosen = only ? PROBES.filter(p => only.includes(p.key)) : PROBES;
  if (!chosen.length) { console.error('Ни один пробник не выбран: --only=' + opt.only); return 2; }

  console.log('APEX \'26 — регрессионный прогон');
  console.log('index.html читается как есть, ничего не переписывается.');

  const started = Date.now();
  const results = [];
  for (const p of chosen) {
    const t0 = Date.now();
    let r;
    try {
      r = require(p.mod).run(opt);
    } catch (e) {
      r = R.result(p.key);
      r.fail('пробник упал: ' + (e && e.message || e));
      if (opt.trace) console.error(e && e.stack);
    }
    r.secs = ((Date.now() - t0) / 1000).toFixed(1);
    r.key = p.key;
    results.push(r);
    R.printResult(r);
  }

  const failed = results.filter(r => !r.ok);
  console.log('\n' + '─'.repeat(72));
  console.log('ИТОГ  ' + (results.length - failed.length) + ' из ' + results.length
    + ' пробников прошли, ' + ((Date.now() - started) / 1000).toFixed(0) + ' с');
  for (const r of results) {
    console.log('  ' + (r.ok ? R.OK : R.BAD) + ' ' + r.key.padEnd(10) + r.secs.padStart(6) + ' с   ' + r.name);
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

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, PROBES };
