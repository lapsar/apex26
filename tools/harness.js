/* ============================================================================
   APEX '26 — harness.js
   Запуск игры из index.html в Node без браузера.

   Устройство:
     • из index.html вынимается ТОЛЬКО игровой скрипт (тот, где есть makeTrack);
     • три.js берётся из npm (three@0.128.0) — ровно та версия, что вшита в файл;
     • отрисовщик THREE.WebGLRenderer подменяется пустышкой: картинка не нужна,
       нужны только расчёты;
     • браузерное окружение (document / window / rAF / performance / setTimeout)
       заменено заглушками;
     • скрипт выполняется в отдельном контексте vm, поэтому все его верхние
       let/const видны последующим вызовам evalIn() — это и есть доступ к
       внутренностям игры (track, player, field, update, estLapTime ...).

   index.html при этом только читается и никогда не меняется.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const THREE_REAL = require('three');

// по умолчанию — игра рядом с папкой tools; APEX_INDEX позволяет натравить
// пробники на другую сборку (например, на архивную копию для сверки)
const INDEX_HTML = process.env.APEX_INDEX
  ? path.resolve(process.env.APEX_INDEX)
  : path.join(__dirname, '..', 'index.html');

/* ---------- 1. вынуть игровой скрипт ---------- */
function extractGameScript(file) {
  const html = fs.readFileSync(file || INDEX_HTML, 'utf8');
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].includes('function makeTrack')) return m[1];
  }
  throw new Error('в ' + (file || INDEX_HTML) + ' не найден скрипт с function makeTrack');
}

/* ---------- 2. заглушка браузера ---------- */
function noop() {}
function chainNoop() { return this; }

function makeCtx2D() {
  const grad = { addColorStop: noop };
  const ctx = {
    canvas: null,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: 'left', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter',
    globalCompositeOperation: 'source-over', shadowBlur: 0, shadowColor: '#000',
    fillRect: noop, clearRect: noop, strokeRect: noop, rect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, ellipse: noop,
    fill: noop, stroke: noop, clip: noop,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, transform: noop,
    setTransform: noop, drawImage: noop, fillText: noop, strokeText: noop,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => null,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData: noop,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
  };
  return ctx;
}

function makeElement(doc, tag) {
  const classes = new Set();
  const children = [];
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    nodeType: 1,
    innerHTML: '', textContent: '', value: '',
    dataset: {},
    children,
    style: { setProperty: noop, removeProperty: noop, getPropertyValue: () => '' },
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      contains: c => classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
    },
    get childElementCount() { return children.length; },
    appendChild(c) { children.push(c); return c; },
    removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); return c; },
    insertBefore(c) { children.push(c); return c; },
    addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
    setAttribute: noop, removeAttribute: noop, getAttribute: () => '',
    focus: noop, blur: noop, click: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    _classes: classes,
  };
  if (el.tagName === 'CANVAS') {
    el.width = 300; el.height = 150;
    const c2d = makeCtx2D();
    c2d.canvas = el;
    el.getContext = kind => (kind === '2d' ? c2d : null);
    el.toDataURL = () => 'data:,';
  }
  return el;
}

function makeDocument() {
  const byId = new Map();
  const doc = {
    hidden: false,
    createElement: tag => makeElement(doc, tag),
    createElementNS: (ns, tag) => makeElement(doc, tag),
    createTextNode: t => ({ nodeType: 3, textContent: t }),
    getElementById(id) {                      // элементы выдаются по требованию и запоминаются
      let el = byId.get(id);
      if (!el) { el = makeElement(doc, 'div'); el.id = id; byId.set(id, el); }
      return el;
    },
    querySelector: sel => (/^meta\b/.test(sel) ? makeElement(doc, 'meta') : null),
    querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop,
    _byId: byId,
  };
  doc.documentElement = makeElement(doc, 'html');
  doc.body = makeElement(doc, 'body');
  doc.head = makeElement(doc, 'head');
  return doc;
}

/* ---------- 3. пустышка отрисовщика ---------- */
function makeRendererStub() {
  function WebGLRendererStub(params) {
    this.domElement = (params && params.canvas) || null;
    this.info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } };
    this.shadowMap = { enabled: false, type: 0 };
    this.outputEncoding = 0;
    this.calls = 0;
  }
  WebGLRendererStub.prototype.setPixelRatio = noop;
  WebGLRendererStub.prototype.setSize = noop;
  WebGLRendererStub.prototype.setClearColor = noop;
  WebGLRendererStub.prototype.setAnimationLoop = noop;
  WebGLRendererStub.prototype.compile = noop;
  WebGLRendererStub.prototype.dispose = noop;
  WebGLRendererStub.prototype.clear = noop;
  WebGLRendererStub.prototype.render = function () { this.calls++; };   // картинка не нужна
  WebGLRendererStub.prototype.getContext = () => null;
  return WebGLRendererStub;
}

/* ---------- 4. детерминированный Math.random ---------- */
function seededRandom(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* ---------- 5. загрузка игры ---------- */
/**
 * loadGame({seed, width, height, file}) -> env
 *   env.evalIn(code)    — выполнить код внутри игры (видит все её let/const)
 *   env.run(code)       — то же самое, псевдоним
 *   env.flushRAF()      — выполнить накопленные requestAnimationFrame-колбэки
 *   env.timeouts        — управление setTimeout: .mode = 'immediate' | 'defer'
 *   env.THREE           — three.js с подменённым WebGLRenderer
 */
function loadGame(opts) {
  opts = opts || {};
  const code = extractGameScript(opts.file);

  const THREE = Object.create(THREE_REAL);      // копия-обёртка: настоящий модуль не портим
  THREE.WebGLRenderer = makeRendererStub();

  const document = makeDocument();

  /* rAF: очередь, которую пробник разбирает вручную */
  const rafQueue = new Map();
  let rafId = 0;
  const requestAnimationFrame = cb => { const id = ++rafId; rafQueue.set(id, cb); return id; };
  const cancelAnimationFrame = id => { rafQueue.delete(id); };

  /* setTimeout: по умолчанию срабатывает немедленно (см. README) */
  const timeouts = { mode: 'immediate', pending: new Map(), _id: 0 };
  const setTimeoutStub = (fn, ms) => {
    const id = ++timeouts._id;
    if (timeouts.mode === 'immediate') { if (typeof fn === 'function') fn(); }
    else timeouts.pending.set(id, { fn, ms });
    return id;
  };
  const clearTimeoutStub = id => { timeouts.pending.delete(id); };

  let vclock = 0;                               // виртуальные часы: performance.now()

  const sandbox = {
    THREE,
    document,
    console,
    performance: { now: () => vclock },
    requestAnimationFrame, cancelAnimationFrame,
    setTimeout: setTimeoutStub, clearTimeout: clearTimeoutStub,
    setInterval: () => 0, clearInterval: noop,          // мигание фонарей в меню игре не нужно
    addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
    scrollTo: noop, alert: noop,
    innerWidth: opts.width || 1280,
    innerHeight: opts.height || 800,
    devicePixelRatio: 2,
    visualViewport: undefined,
    AudioContext: undefined, webkitAudioContext: undefined,   // звука в пробниках нет
    navigator: { userAgent: 'node', maxTouchPoints: 0 },
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    Buffer, Uint8Array, Float32Array, Float64Array, Uint8ClampedArray, Int32Array, Map, Set,
    __rng: seededRandom(opts.seed === undefined ? 20260421 : opts.seed),
  };

  const context = vm.createContext(sandbox);
  vm.runInContext('this.window=this;this.self=this;this.globalThis=this;Math.random=__rng;', context);

  const evalIn = (src, name) => vm.runInContext(src, context, { filename: name || 'apex26' });

  evalIn(code, 'index.html(game)');

  const env = {
    THREE, document, context, sandbox, timeouts,
    evalIn, run: evalIn,
    get virtualTime() { return vclock; },
    advance(ms) { vclock += ms; },
    flushRAF() {
      const batch = [...rafQueue.entries()];
      rafQueue.clear();
      for (const [, cb] of batch) cb(vclock);
      return batch.length;
    },
    clearRAF() { rafQueue.clear(); },
    reseed(seed) { sandbox.__rng = seededRandom(seed); evalIn('Math.random=__rng;'); },
    runTimeouts() {
      const batch = [...timeouts.pending.entries()];
      timeouts.pending.clear();
      for (const [, t] of batch) if (typeof t.fn === 'function') t.fn();
      return batch.length;
    },
  };

  installAutopilot(env);
  return env;
}

/* ---------- 6. автопилот игрока ---------- *
   Живёт внутри игры (быстрее, чем ходить через границу vm на каждом кадре).
   Проецирует машину на трассу, смотрит вперёд на несколько точек, доворачивает
   к осевой и тормозит по максимальной кривизне впереди.                       */
const AUTOPILOT_SRC = `
var __AP = {
  // руль: цель — осевая линия на несколько точек вперёд
  steer: function(){
    var pr = project(player.x, player.z, player.hint);
    var M = track.M;
    var ahead = Math.max(3, Math.round(3 + player.speed * 0.12));
    var tp = track.P[(pr.idx + ahead) % M];
    var want = Math.atan2(tp.x - player.x, tp.z - player.z);
    var dh = want - player.hdg;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    return { idx: pr.idx, off: pr.off, st: Math.max(-1, Math.min(1, -dh * 2.4)) };
  },
  // газ/тормоз: самая крутая кривизна в поле зрения задаёт безопасную скорость
  safeSpeed: function(idx){
    var M = track.M, ah = 6 + Math.round(player.speed * 0.6), kMax = 0;
    for (var a = 1; a < ah; a++) {
      var k = Math.abs(track.K[(idx + a) % M]);
      if (k > kMax) kMax = k;
    }
    if (kMax < 0.03) return MAXSPEED * track.grip;
    return Math.sqrt(DIFF_CORNERK[sel.diff] * 24 / kMax);
  },
  drive: function(){
    var s = this.steer();
    controls.left  = s.st < -0.12 ? 1 : 0;
    controls.right = s.st >  0.12 ? 1 : 0;
    var v = this.safeSpeed(s.idx);
    if (player.speed > v + 1.0) { controls.gas = 0; controls.brake = 1; }
    else if (player.speed > v)  { controls.gas = 0; controls.brake = 0; }
    else                        { controls.gas = 1; controls.brake = 0; }
    return s;
  },
  idle: function(){ controls.left = controls.right = controls.gas = controls.brake = 0; }
};
// __drive(n, dt, mode, watch)
//   mode: 'auto' — автопилот рулит, 'idle' — руки прочь (машина стоит)
//   watch: необязательная функция(кадр) внутри игры, вызывается после каждого update
function __drive(n, dt, mode, watch){
  for (var f = 0; f < n; f++) {
    if (mode === 'idle') __AP.idle(); else __AP.drive();
    if (phase === '') return f;
    update(dt);
    if (watch) { var r = watch(f); if (r === false) return f + 1; }
  }
  return n;
}
`;

function installAutopilot(env) { env.evalIn(AUTOPILOT_SRC, 'harness(autopilot)'); }

/* ---------- 7. типовые сценарии ---------- */

/**
 * Довести игру до состояния «мир построен, квалификация начата».
 * trackIdx — индекс в TRACKS (скрытые трассы тоже доступны).
 */
function setupWeekend(env, o) {
  o = o || {};
  const trackIdx = o.trackIdx === undefined ? 0 : o.trackIdx;
  const rosterIdx = o.rosterIdx === undefined ? 0 : o.rosterIdx;
  env.evalIn(`
    sel.track=${trackIdx}; sel.roster=${rosterIdx};
    sel.diff=${JSON.stringify(o.diff || 'normal')};
    sel.laps=${o.laps === undefined ? 1 : o.laps};
    sel.view=${JSON.stringify(o.view || 'chase')};
    selTeam=ROSTER[sel.roster].teamIdx;
    startWeekend();
  `);
  env.flushRAF();      // startWeekend откладывает buildWorld на один кадр
  env.clearRAF();      // игровой цикл дальше крутим сами, через __drive
  return env;
}

/**
 * Построить только мир трассы — без болида игрока и без квалификации.
 * Ровно та часть startWeekend, что предшествует созданию игрока.
 */
function setupWorld(env, o) {
  o = o || {};
  const trackIdx = o.trackIdx === undefined ? 0 : o.trackIdx;
  env.evalIn(`
    sel.track=${trackIdx}; sel.roster=0; sel.diff=${JSON.stringify(o.diff || 'normal')};
    camMode='chase'; initThree(); clearScene();
    track=makeTrack(TRACKS[sel.track]); track.refLap=track.length/(MAXSPEED*0.85);
    buildWorld();
  `);
  return env;
}

/**
 * Собрать решётку так, чтобы игрок оказался на позиции pos (1..22), и стартовать гонку.
 * Использует штатный beginQualiOutro: решётка строится ровно так же, как в игре.
 */
function startRaceAt(env, pos) {
  const p = Math.max(1, Math.min(22, pos || 1));
  env.evalIn(`
    (function(){
      var qf = qualiField;
      player.best = ${p <= 21 ? `qf[${p - 1}].time - 0.001` : `qf[20].time + 1.0`};
      beginQualiOutro();          // строит window.__grid; таймер сразу закрывает квалификацию
      qualiOutro=false; raceOutro=false;
      startRace();
    })();
  `);
  return env.evalIn('gridPos');
}

/** Погасить фонари немедленно — без ожидания пятисекундной последовательности. */
function lightsOut(env) {
  env.evalIn(`lights.t=0;lights.seq=5;lights.offAt=0.0001;lights.go=true;lights.hide=0;raceTime=0;`);
}

/** Убрать запланированные сходы: они мешают пробникам, которые считают машины. */
function noRetirements(env) {
  env.evalIn(`field.forEach(function(c){c.retireAt=0;});`);
}

module.exports = {
  loadGame, extractGameScript, setupWeekend, setupWorld, startRaceAt, lightsOut, noRetirements,
  seededRandom, INDEX_HTML,
};
