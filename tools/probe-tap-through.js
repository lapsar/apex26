/* ============================================================================
   Пробник 20 — ТАП ПО КНОПКЕ ОБЯЗАН ДОХОДИТЬ

   Жалоба владельца (09.2026): после одной-двух гонок на экране итогов
   квалификации кнопки «В меню» и «Старт гонки» перестают нажиматься; помогает
   только перезагрузка страницы, и результаты квалификации теряются.

   Причина — гаситель двойного тапа: он отменял КАЖДЫЙ touchend, пришедший
   меньше чем через 0.4 с после предыдущего, а отменённый touchend не порождает
   клика. Хуже того, окно продлевалось и самим погашенным тапом, поэтому пока
   по кнопке жали чаще раза в 0.4 с (а именно так и жмут, когда «не работает»),
   она не могла сработать вовсе.

   Здесь проверяется правило, а не браузер: слушателям документа подаются
   касания, и требуется, чтобы тап по нажимаемому (кнопка, карточка, педаль,
   поле ввода, что угодно с onclick) НИКОГДА не отменялся, как бы часто по нему
   ни жали. Заодно проверяется, что сам гаситель жив: двойной тап по фону
   по-прежнему гасится, иначе вернётся зум, ломавший HUD в гонке.

   Пробник проверен на настоящей поломке: на v1.15.63 валится обеими проверками
   нажимаемого (кнопка и карточка), а на исправленной сборке чист.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

/* Узел страницы ровно в том объёме, в каком его читает разбор касаний. */
function el(tag, cls, opts) {
  const o = opts || {};
  return {
    tagName: tag.toUpperCase(), className: cls || '', parent: o.parent || null, onclick: o.onclick || null,
    closest(sel) {
      const parts = sel.split(',').map(s => s.trim()).filter(Boolean);
      for (let n = this; n; n = n.parent) {
        for (const p of parts) {
          if (p === '[onclick]') { if (n.onclick) return n; continue; }
          if (p[0] === '.') { if ((' ' + n.className + ' ').includes(' ' + p.slice(1) + ' ')) return n; continue; }
          if (n.tagName === p.toUpperCase()) return n;
        }
      }
      return null;
    },
  };
}

function stand(file) {
  const env = H.loadGame(file ? { file } : {});
  const lsn = env.evalIn('document')._listeners.touchend || [];
  let now = 10000;
  env.evalIn('this').__now = 0;
  const tap = (target, gap) => {                       // одно касание: пришло, отпущено
    now += gap;
    env.evalIn('this').__now = now;
    env.evalIn('Date.now=function(){return __now;};');
    const e = { type: 'touchend', target, touches: [], changedTouches: [target], defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; } };
    lsn.forEach(fn => { try { fn(e); } catch (err) { /* слушатель звука до жеста — не наше дело */ } });
    return e.defaultPrevented;
  };
  return { env, lsn, tap };
}

/* сколько тапов из n погашено, если жать через gap мс */
function series(s, makeTarget, n, gap) {
  let killed = 0;
  for (let i = 0; i < n; i++) if (s.tap(makeTarget(i), gap)) killed++;
  return killed;
}

function run(opts) {
  const file = opts && opts.file;
  const r = R.result('Тап по кнопке доходит: быстрые нажатия не гасятся');
  const s = stand(file);

  if (!s.lsn.length) { r.fail('на документе нет ни одного слушателя touchend — стенд не видит разбор касаний'); return r; }

  const btnPrim = () => el('button', 'btn primary');
  const btnGhost = () => el('button', 'btn ghost');
  const bothBtns = i => (i % 2 ? btnGhost() : btnPrim());
  const card = () => el('button', 'card');
  const padSmall = () => el('small', '', { parent: el('div', 'kb gas') });   // палец попадает в подпись внутри педали
  const ov = () => el('div', 'ico', { parent: el('div', '', { onclick: 'togglePause()' }) });
  const bg = () => el('div', 'screen active');                              // фон экрана — там гасить можно и нужно

  const cases = [
    ['«Старт гонки» подряд', btnPrim],
    ['«В меню» и «Старт гонки» вперемешку', bothBtns],
    ['карточка трассы', card],
    ['педаль газа', padSmall],
    ['плашка паузы (onclick)', ov],
  ];
  for (const [name, mk] of cases) {
    const killed = series(s, mk, 6, 150);
    r.line(`${name.padEnd(38)} 6 тапов через 150 мс -> погашено ${killed}`);
    if (killed) r.fail(`${name}: погашено ${killed} тапов из 6 — клик до кнопки не дойдёт`);
  }

  const bgKilled = series(s, bg, 6, 150);
  r.line(`${'фон экрана (гаситель зума)'.padEnd(38)} 6 тапов через 150 мс -> погашено ${bgKilled}`);
  if (!bgKilled) r.fail('двойной тап по фону не гасится — вернётся зум, сдвигавший HUD в гонке');

  const slow = series(s, btnPrim, 3, 900);
  r.line(`${'кнопка с паузой 900 мс'.padEnd(38)} 3 тапа -> погашено ${slow}`);
  if (slow) r.fail('гасится даже редкий тап по кнопке');

  return r;
}

if (require.main === module) R.main(run);
module.exports = { run };
