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
   касания, и требуется, чтобы тап по тому, что живёт КЛИКОМ (кнопка, карточка,
   поле ввода, что угодно с onclick), НИКОГДА не отменялся, как бы часто по нему
   ни жали.

   Обратная сторона проверяется тем же пробником: педали (`.kb`) обязаны
   остаться ПОД гасителем, и фон тоже. Гаситель ставился против двух вещей —
   зума по двойному тапу, сдвигавшего HUD, и залипания педали (после касания
   браузер шлёт совместимостные мышиные события, и педаль ловит их вторым
   pointerdown). Клик педали не нужен вовсе, поэтому выводить её из-под
   гасителя нельзя.

   Пробник проверен на настоящей поломке: на v1.15.63 валится четырьмя
   проверками кликаемого, а на исправленной сборке чист.

   РАЗДЕЛ 2 (v1.15.73). Цель касания бывает ТЕКСТОВЫМ УЗЛОМ — так делает WebKit,
   и у текстового узла нет `closest`. Кнопка «Ещё заезд» состоит из текста, палец
   попадает именно в него, и правило v1.15.64 считало такой тап негасимым только
   на бумаге: на устройстве кнопки экрана итогов снова переставали нажиматься.

   РАЗДЕЛ 3 (v1.15.73). Кнопка руля не имеет права остаться нажатой, если под ней
   нет пальца. Парность pointerdown/pointerup WebKit держит не всегда (системный
   жест у нижней кромки экрана уводит касание, и pointerup не приходит вовсе),
   а залипшая кнопка руля означает, что руль перестал слушаться и болид едет
   в стену. Проверяется правило игры: состояние кнопок обязано сходиться
   со списком живых касаний в каждом touch-событии.
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
    ['плашка паузы (onclick)', ov],
  ];
  for (const [name, mk] of cases) {
    const killed = series(s, mk, 6, 150);
    r.line(`${name.padEnd(38)} 6 тапов через 150 мс -> погашено ${killed}`);
    if (killed) r.fail(`${name}: погашено ${killed} тапов из 6 — клик до кнопки не дойдёт`);
  }

  /* Педаль — наоборот: она живёт на pointerdown/pointerup, клик ей не нужен, а гаситель
     держит от неё совместимостные мышиные события, из-за которых педаль и залипала.
     Вывести её из-под гасителя значит вернуть то залипание. */
  const padKilled = series(s, padSmall, 6, 150);
  r.line(`${'педаль газа (защита от залипания)'.padEnd(38)} 6 тапов через 150 мс -> погашено ${padKilled}`);
  if (!padKilled) r.fail('педаль выведена из-под гасителя — вернётся залипание газа и тормоза');

  const bgKilled = series(s, bg, 6, 150);
  r.line(`${'фон экрана (гаситель зума)'.padEnd(38)} 6 тапов через 150 мс -> погашено ${bgKilled}`);
  if (!bgKilled) r.fail('двойной тап по фону не гасится — вернётся зум, сдвигавший HUD в гонке');

  const slow = series(s, btnPrim, 3, 900);
  r.line(`${'кнопка с паузой 900 мс'.padEnd(38)} 3 тапа -> погашено ${slow}`);
  if (slow) r.fail('гасится даже редкий тап по кнопке');

  /* Раздел 2. WebKit отдаёт целью касания текстовый узел, а у него нет closest —
     и кнопка, состоящая из одного текста, переставала считаться нажимаемой. */
  const txtBtn = () => ({ nodeType: 3, textContent: 'Ещё заезд', parentElement: btnPrim() });
  const txtPad = () => ({ nodeType: 3, textContent: 'GAS', parentElement: el('div', 'kb gas') });
  const txtKilled = series(s, txtBtn, 6, 150);
  r.line(`${'текст внутри кнопки (цель WebKit)'.padEnd(38)} 6 тапов через 150 мс -> погашено ${txtKilled}`);
  if (txtKilled) r.fail(`текст внутри кнопки: погашено ${txtKilled} тапов из 6 — «Ещё заезд» и «В меню» не нажмутся`);
  const txtPadKilled = series(s, txtPad, 6, 150);
  r.line(`${'текст внутри педали'.padEnd(38)} 6 тапов через 150 мс -> погашено ${txtPadKilled}`);
  if (!txtPadKilled) r.fail('педаль вышла из-под гасителя через текстовый узел — вернётся залипание газа');

  stuck(r, file);
  return r;
}

/* Раздел 3: кнопка руля обязана отпускаться, как только под ней нет пальца. */
function stuck(r, file) {
  const env = H.loadGame(file ? { file } : {});
  const pads = env.evalIn('document')._pads;
  const win = env.evalIn('this')._listeners || {};
  const ctl = () => env.evalIn('controls');
  const pad = c => pads.find(p => p.dataset.c === c);
  const mid = c => { const q = pad(c).getBoundingClientRect(); return { x: (q.left + q.right) / 2, y: (q.top + q.bottom) / 2 }; };
  const press = (c, id) => { const m = mid(c);
    (pad(c)._listeners.pointerdown || []).forEach(fn => fn({ pointerId: id, clientX: m.x, clientY: m.y, preventDefault() {} })); };
  const touches = list => ({ touches: list.map(c => { const m = mid(c); return { clientX: m.x, clientY: m.y }; }), preventDefault() {} });
  const fire = (type, ev) => (win[type] || []).forEach(fn => fn(ev));
  const held = () => ['left', 'right', 'gas', 'brake'].filter(c => ctl()[c]);

  if (!(win.touchstart || []).length) r.line(`${'сверка с живыми пальцами'.padEnd(38)} окно не слушает touchstart`);

  press('left', 7);                                   // палец лёг на руль
  if (!ctl().left) { r.fail('нажатие кнопки руля не доходит до игры — стенд негоден'); return; }
  fire('touchstart', touches(['left']));              // тот же палец подтверждён списком касаний
  r.line(`${'палец на руле подтверждён списком'.padEnd(38)} держится: ${held().join(',') || '—'}`);
  if (!ctl().left) r.fail('живое удержание руля снимается сверкой — руль будет обрываться посреди поворота');

  fire('touchstart', touches(['left', 'gas']));        // второй палец на газ, руль всё ещё держат
  press('gas', 8);
  if (!(ctl().left && ctl().gas)) r.fail('два пальца одновременно не держатся');

  // pointerup для руля ПОТЕРЯН (ровно то, что делает системный жест iPad): остался только газ
  fire('touchmove', touches(['gas']));
  r.line(`${'pointerup руля потерян, палец на газе'.padEnd(38)} держится: ${held().join(',') || '—'}`);
  if (ctl().left) r.fail('кнопка руля осталась нажатой без пальца — руль перестанет слушаться, болид уедет в стену');
  if (!ctl().gas) r.fail('сверка сняла газ, под которым палец есть');

  fire('touchend', { touches: [], preventDefault() {} });
  if (held().length) r.fail('после снятия всех пальцев кнопки остались нажатыми');

  // тот же указатель не может держать две кнопки сразу
  press('left', 9); press('right', 9);
  r.line(`${'один указатель на двух кнопках'.padEnd(38)} держится: ${held().join(',') || '—'}`);
  if (ctl().left && ctl().right) r.fail('повторный pointerdown с тем же id залипил прежнюю кнопку — руль зажат в обе стороны');
  fire('touchend', { touches: [], preventDefault() {} });
  if (held().length) r.fail('после снятия всех пальцев кнопки остались нажатыми');
}

if (require.main === module) R.main(run);
module.exports = { run };
