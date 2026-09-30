/* ============================================================================
   ТЕСТОВАЯ КОПИЯ ДЛЯ ВЛАДЕЛЬЦА: «флаги гарантированы» (30.09.2026).

   Зачем. Правку v1.16.18 (порядок пары под флагом) владелец не может проверить на
   устройстве: сход в гонке случается не всегда (45 % гонок без схода), жёлтый
   накрывает 2 сектора из 12, VSC — только если болид встал на полотне, а оказаться
   под флагом вровень с соперником — редкость в квадрате. Эта копия не продукт и
   не версия: index.html не трогается, копия отдаётся файлом и в archive/ не идёт.

   Что в копии иначе, чем в игре (больше ничего):
     1. Как только игрок ПОРАВНЯЛСЯ с соперником (корпуса перекрыты вдоль дороги, между
        центрами меньше 5 м), встаёт соперник в 80–300 м впереди и поднимается VSC, даже
        если болид встал вне полотна. Правка v1.16.18 работает ровно в этот миг: подъехать
        вровень УЖЕ под флагом не даёт и старое правило дистанции. Не поравнялся к концу
        первого круга — флаг всё равно поднимается.
     2. Со второго круга — то же ещё раз, но флаг выбирается как в игре (обычно жёлтый):
        жёлтый с болидом на полотне оставил бы его там до финиша — маршалы убирают
        только после VSC. Не поравнялся к 2.2 круга — поднимается всё равно.
     Штатные случайные сходы остаются. Сход не случается, пока горит другой флаг.
     3. Игрок стартует ПОСЛЕДНИМ, как бы ни проехал квалификацию: с поула на Новичке
        он уезжает от поля, и вровень под флагом оказаться не с кем (замер автопилотом:
        с 11-го места 0 с рядом с соперником под флагом на всех пяти трассах).
     4. В углу вместо номера версии — «ТЕСТ ФЛАГОВ».

   Запуск: node tools/flag-test-build.js --out=<файл.html> [--src=archive/v1.16.17.html]
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const OUT = arg('out', null); if (!OUT) throw new Error('нужен --out=<файл>');

const SRC = arg('src', path.join(__dirname, '..', 'index.html'));   // другая сборка — для сверки (archive/v1.16.17.html)
let src = fs.readFileSync(SRC, 'utf8');
function swap(from, to) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`образец найден ${n} раз, нужен ровно 1:\n${from}`);
  src = src.replace(from, to);
}
const ver = (src.match(/<div class="verstamp">(v[\d.]+)<\/div>/) || [])[1];
if (!ver) throw new Error('не найден номер версии');

swap(`<div class="verstamp">${ver}</div>`, `<div class="verstamp">${ver} · ТЕСТ ФЛАГОВ</div>`);

swap(`  raiseNeutral(blocking?'vsc':'yellow',c);}`,
`  raiseNeutral(__ft.kind||(blocking?'vsc':'yellow'),c);}
/* ТЕСТ ФЛАГОВ (tools/flag-test-build.js): сход впереди игрока в 80–300 м по трассе. */
let __ft={stage:0,kind:null};
function __flagTest(){
  if(__ft.stage>1||neutral.mode)return;
  const L=track.length, pd=player.dist;
  const from=__ft.stage===0?0.15:1.15, late=__ft.stage===0?1.0:2.2;
  if(pd<from*L)return;
  let side=false;const f=track.F[player.hint||0];              // поравнялся ли игрок с кем-нибудь
  for(const c of field){if(c.retired)continue;
    if(Math.abs((c.x-player.x)*f.x+(c.z-player.z)*f.z)<CAR_LEN&&Math.hypot(c.x-player.x,c.z-player.z)<5){side=true;break;}}
  if(!side&&pd<late*L)return;
  let pick=null;
  for(const c of field){if(c.retired)continue;const g=c.dist-pd;
    if(g>80&&g<300&&(!pick||g<pick.dist-pd))pick=c;}
  if(!pick)return;
  __ft.kind=__ft.stage===0?'vsc':null;__ft.stage++;
  retireCar(pick);__ft.kind=null;}`);

swap(`  const __oidx=new Map();__order.forEach((o,i)=>__oidx.set(o,i));
  for(const c of field){if(c.retired)continue;`,
`  const __oidx=new Map();__order.forEach((o,i)=>__oidx.set(o,i));
  if(phase==='race'&&lights.go&&!raceOver)__flagTest();
  for(const c of field){if(c.retired)continue;`);

swap(`const yt=isFinite(player.best)?player.best:estLapTime(aiBase(0.80,diffMul),cornerKb)*1.25;`,
`const yt=Math.max(estLapTime(aiBase(0.80,diffMul),cornerKb)*1.25,isFinite(player.best)?player.best:0);   // ТЕСТ ФЛАГОВ: старт последним`);

// новая гонка — сценарий заново
swap(`retireCount=0;
  flPend=null;`,`retireCount=0;__ft={stage:0,kind:null};
  flPend=null;`);

fs.writeFileSync(OUT, src);
console.log(`тестовая копия «флаги гарантированы» (${ver}) -> ${OUT}`);
