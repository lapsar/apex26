/* ============================================================================
   Пробник 19 — ЗВУК ПОСЛЕ БЛОКИРОВКИ ЭКРАНА

   Жалоба владельца (09.2026): iPad, звук включён, игра на паузе. Экран гаснет
   сам или по кнопке; после разблокировки жмёшь «Пуск» — игра идёт, звука нет
   совсем, и не возвращают его ни кнопки громкости, ни выключатель звука в игре.
   Помогает только перезагрузка страницы.

   Причина в WebKit: на время блокировки AudioContext уходит в СВОЁ состояние
   'interrupted' (в стандарте его нет) и после разблокировки там и остаётся.
   Встречается и второй вариант, потяжелее: состояние снова 'running', а часы
   контекста стоят — то есть граф жив на вид, а звука нет; лечится только
   пересборкой контекста.

   Здесь оба варианта разыгрываются подделкой AudioContext, повторяющей это
   поведение, и проверяется одно: после «Пуска» контекст жив (running и часы
   идут) и двигатель подключён именно к нему. Плюс два свойства пересборки:
   контексты не накапливаются (старый закрыт) и выключенный звук остаётся
   выключенным.

   Пробник проверен на настоящей поломке: на v1.15.62 валится обоими случаями.
   ========================================================================== */
'use strict';

const H = require('./harness');
const R = require('./report');

/* Подделка AudioContext в духе WebKit.
   hard=false — resume() из 'interrupted' оживляет контекст (мягкий случай);
   hard=true  — resume() says 'running', а часы стоят (жёсткий случай). */
function makeFakeAC(hard) {
  let clock = { t: 0, frozen: false };
  const clocks = [clock];
  const node = () => ({
    gain: { value: 0, setTargetAtTime(v) { this.value = v; }, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; } },
    frequency: { value: 0, setTargetAtTime() {}, setValueAtTime() {} },
    Q: { value: 0 }, type: '', curve: null, oversample: '',
    playbackRate: { value: 1, setTargetAtTime() {} }, buffer: null, loop: false,
    connect() {}, disconnect() {}, start() {}, stop() {},
  });
  class AC {
    constructor() {
      this.state = 'running'; this.sampleRate = 48000; this.destination = node();
      this.onstatechange = null; this._clock = clock; AC.live.push(this); AC.made++;
    }
    get currentTime() { return this._clock.frozen ? this._clock.tFrozen : this._clock.t; }
    createGain() { return node(); }
    createBiquadFilter() { return node(); }
    createOscillator() { return node(); }
    createWaveShaper() { return node(); }
    createBufferSource() { return node(); }
    createBuffer(ch, n) { return { duration: n / 48000, getChannelData: () => new Float32Array(n) }; }
    decodeAudioData(buf, ok) { ok({ duration: 2.0 }); }
    resume() {
      if (this.state === 'closed') return Promise.resolve();
      this.state = 'running';                       // WebKit говорит «running» и в жёстком случае
      if (!hard) this._clock.frozen = false;
      if (this.onstatechange) this.onstatechange();
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
      const i = AC.live.indexOf(this); if (i >= 0) AC.live.splice(i, 1);
      return Promise.resolve();
    }
  }
  AC.live = []; AC.made = 0;
  AC.lock = () => { for (const c of AC.live) c.state = 'interrupted'; clock.frozen = true; clock.tFrozen = clock.t; };
  AC.tick = s => { for (const c of clocks) if (!c.frozen) c.t += s; };
  AC.newClock = () => { clock = { t: clock.t + 100, frozen: false }; clocks.push(clock); };  // у нового контекста свои, идущие часы
  return AC;
}

function stand(hard, file) {
  const env = H.loadGame(file ? { file } : {});
  const AC = makeFakeAC(hard);
  const g = env.evalIn('this');
  g.__AC = AC;
  env.evalIn('window.AudioContext=__AC;');
  env.timeouts.mode = 'defer';                      // сторож живости ждёт 0.4 с — время должно идти по-настоящему
  const flush = () => { const q = [...env.timeouts.pending.values()]; env.timeouts.pending.clear(); q.forEach(x => x.fn()); };
  const alive = () => env.evalIn(
    '(function(){var c=AUDIO.ctx;if(!c||c.state!=="running"||!AUDIO.engS)return false;' +
    'var t0=c.currentTime;__AC.tick(0.25);return c.currentTime>t0;})()');
  return { env, g, AC, flush, alive };
}

function run() {
  const r = R.result('Звук после блокировки экрана — контекст оживает при снятии паузы');

  for (const hard of [false, true]) {
    const kind = hard ? 'жёсткий (часы стоят)' : 'мягкий (interrupted)';
    const s = stand(hard);
    s.env.evalIn('AUDIO.init();AUDIO.resume();AUDIO.startEngine();');    // гонка идёт, звук есть
    s.AC.tick(1.0); s.flush();
    const before = s.alive();

    s.env.evalIn('AUDIO.stopEngine();AUDIO.stopScrape();');              // пауза: ровно это она делает со звуком
    s.AC.lock();                                                          // экран погас
    s.AC.newClock();
    s.env.evalIn('AUDIO.resume();AUDIO.startEngine();');                  // «Пуск» — жест пользователя
    s.AC.tick(0.5); s.flush(); s.AC.tick(0.5); s.flush();
    const after = s.alive();

    r.line(`${kind.padEnd(22)} до блокировки ${before ? 'звук есть' : 'ЗВУКА НЕТ'}` +
           `, после разблокировки ${after ? 'звук есть' : 'ЗВУКА НЕТ'}` +
           ` (контекстов создано ${s.AC.made})`);
    if (!before) r.fail(`${kind}: звука нет ещё до блокировки — стенд врёт, а не игра`);
    if (!after) r.fail(`${kind}: после разблокировки звука нет — ровно жалоба владельца`);
  }

  /* повторные блокировки: старый контекст обязан закрываться, mute — переживать пересборку */
  {
    const s = stand(true);
    s.env.evalIn('AUDIO.init();AUDIO.setMuted(true);AUDIO.startEngine();');
    let now = 0;
    for (let i = 0; i < 3; i++) {
      s.AC.tick(1); s.flush();
      s.env.evalIn('AUDIO.stopEngine();'); s.AC.lock(); s.AC.newClock();
      s.g.__now = (now += 3000);
      s.env.evalIn('Date.now=function(){return __now;};');               // между блокировками больше защиты в 2 с
      s.env.evalIn('AUDIO.resume();AUDIO.startEngine();');
      s.AC.tick(0.5); s.flush(); s.AC.tick(0.5); s.flush();
    }
    const live = s.AC.live.length, made = s.AC.made;
    const muted = s.env.evalIn('!!(AUDIO.muted&&AUDIO.master.gain.value===0)');
    r.line(`три блокировки подряд: живых контекстов ${live} из созданных ${made}, звук ${s.alive() ? 'есть' : 'НЕТ'}, выключатель ${muted ? 'держится' : 'СБРОСИЛСЯ'}`);
    if (live > 1) r.fail(`контексты накапливаются: ${live} живых — старый не закрывается`);
    if (!s.alive()) r.fail('после трёх блокировок звук не вернулся');
    if (!muted) r.fail('пересборка контекста включила звук, выключенный игроком');
  }

  r.note('стенд подделывает AudioContext; настоящий iPad им не заменяется — проверка на устройстве за владельцем');
  return r;
}

if (require.main === module) R.main(run);
module.exports = { run };
