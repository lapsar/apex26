/* ============================================================================
   APEX '26 — report.js
   Общий формат результата пробника и его печать.

   Пробник возвращает { name, ok, lines[], failures[], notes[] }:
     lines    — измеренное, печатается всегда;
     failures — что не сошлось; непустой список = пробник провален;
     notes    — известные оговорки (в зачёт не идут).
   ========================================================================== */
'use strict';

const OK = '✓', BAD = '✗';

function result(name) {
  return {
    name, lines: [], failures: [], notes: [],
    line(s) { this.lines.push(s); return this; },
    fail(s) { this.failures.push(s); return this; },
    note(s) { this.notes.push(s); return this; },
    get ok() { return this.failures.length === 0; },
  };
}

function printResult(r) {
  console.log(`\n${r.ok ? OK : BAD} ${r.name}`);
  for (const l of r.lines) console.log('    ' + l);
  for (const n of r.notes) console.log('    · ' + n);
  for (const f of r.failures) console.log('  ' + BAD + ' ' + f);
}

/** Запуск пробника как самостоятельной программы. */
function main(runFn, argv) {
  Promise.resolve()
    .then(() => runFn(parseArgs(argv || process.argv.slice(2))))
    .then(r => { printResult(r); process.exit(r.ok ? 0 : 1); })
    .catch(e => { console.error('\n' + BAD + ' пробник упал: ' + (e && e.stack || e)); process.exit(2); });
}

function parseArgs(list) {
  const o = { _: [] };
  for (const a of list) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) o[m[1]] = m[2] === undefined ? true : (/^-?\d+(\.\d+)?$/.test(m[2]) ? +m[2] : m[2]);
    else o._.push(a);
  }
  return o;
}

/** m:ss.mmm с округлением до миллисекунды — так записаны эталоны в CLAUDE.md. */
function lap(t) {
  if (!isFinite(t)) return '—';
  let ms = Math.round(t * 1000);
  const m = Math.floor(ms / 60000); ms -= m * 60000;
  const s = Math.floor(ms / 1000); ms -= s * 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

module.exports = { result, printResult, main, parseArgs, lap, OK, BAD };
