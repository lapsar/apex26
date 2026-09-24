/* ============================================================================
   APEX '26 — run-one.js
   Один пробник в отдельном процессе; его запускает run-all.js.

       node tools/run-one.js ./probe-pole-times.js [--seed=…]

   Результат уходит родителю по IPC, а не в stdout: игра внутри vm может
   что-то печатать, и выдачу не надо разбирать. Без родителя — печатает сам.
   ========================================================================== */
'use strict';

const R = require('./report');

async function main() {
  const [mod, ...argv] = process.argv.slice(2);
  const opt = R.parseArgs(argv);
  let msg;
  try {
    const r = await require(mod).run(opt);
    msg = { result: { name: r.name, lines: r.lines, failures: r.failures, notes: r.notes } };
  } catch (e) {
    if (opt.trace) console.error(e && e.stack);
    msg = { error: String(e && e.message || e) };
  }
  msg.maxRssKb = process.resourceUsage().maxRSS;
  if (!process.send) {
    if (msg.result) R.printResult(Object.assign(R.result(msg.result.name), msg.result));
    else console.error(R.BAD + ' пробник упал: ' + msg.error);
    return msg.result && !msg.result.failures.length ? 0 : 1;
  }
  await new Promise(done => process.send(msg, done));
  return 0;
}

main().then(code => process.exit(code));
