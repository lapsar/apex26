/* ============================================================================
   ГЕНЕРАТОР ОПЫТНОЙ СБОРКИ «порядок пары под флагом» (open-tasks/race-ai.md п.17,
   известная дыра §5 ядра: пара, УЖЕ идущая бок о бок).

   ВЛИТО В ИГРУ в v1.16.18 (решение владельца 30.09.2026) — к index.html новее v1.16.17
   генератор НЕ применяется (образцы уже заменены) и оставлен как запись опыта: пять
   вариантов, на которых выбрано правило. Единственное отличие игры от варианта 5 —
   сброс порядка по |raceTime - t|: raceTime обнуляется с новой гонкой.

   index.html не трогает: пишет копию, на которую натравливаются пробники через
   APEX_INDEX. Правка одна и живёт в neutBlocker — правиле дистанции под флагом,
   которое и так общее для игрока и соперников.

   ЧТО БЫЛО. «Кто впереди» решается КАЖДЫЙ КАДР проекцией на направление дороги.
   У пары, идущей вровень, это подбрасывание монеты: кто на сантиметр высунулся,
   тот впереди и свободен, а второй держится за ним. Дальше выигрывает тот, у кого
   свой потолок выше (сила пилота), и пара «расходится» — это и есть спорный обгон.
   Замер 09.2026 (`flag-pairs-audit`, v1.16.17): 92 % спорных обгонов — пары,
   вошедшие под флаг, перекрываясь корпусами; прорывов сзади вопреки NEUT_GAP нет.

   ЧТО СТАЛО. Порядок пары ЗАПОМИНАЕТСЯ, когда машины сошлись под флагом ближе
   NEUT_PAIR=15 м по трассе, и дальше не пересчитывается:
     - защёлкнутый позади держится за передним по старому правилу, а если вылез
       вперёд, пока корпуса перекрываются, — сбрасывает, чтобы вернуть место
       (та же NEUT_RECOVER, 3 м/с на метр);
     - защёлкнутый впереди соседа не видит вовсе — поэтому пара НЕ запирается
       насмерть, как «связка вровень» v1.15.7x (там держали ОБА);
     - вышел вперёд на целый корпус — место за ним: сосед сзади в той же полосе,
       а объезжать под флагом ИИ не умеет (защёлка атаки снята), и требование
       «отдай» заперло бы обоих (замер: игрок полз 2 м/с, варианты 1-2);
     - разошлись дальше 15 м по трассе — порядок забыт, при новом сближении
       ставится заново по факту. Без этого пары ловили машины с СОСЕДНЕГО участка
       трассы (Монреаль, петля после шпильки: лидеры в 150 м по дистанции едут
       в метрах от игрока навстречу) — вариант 2;
     - вставшего (NEUT_STOPPED) объезжать можно по-прежнему; кто его физически
       обошёл, пока он стоял, тот и впереди, когда он поедет. Сброс защёлки при
       каждой остановке (вариант 4) возвращал монетку: в очереди все на миг
       проседают ниже 6 м/с.

   Запуск: node tools/flag-order-build.js --out=/tmp/flag-order.html
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const OUT = arg('out', null); if (!OUT) throw new Error('нужен --out=<файл>');
const PAIR = +arg('pair', 15);        // м по трассе: ближе — пара, порядок держится

let src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function swap(from, to) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`образец найден ${n} раз, нужен ровно 1:\n${from}`);
  src = src.replace(from, to);
}

swap(`  const fs=st.f;
  for(const c of cars){`,
`  const fs=st.f;
  let ovCap=1e9;
  if(raceTime-NEUT_ORD.t>0.5)NEUT_ORD.m={};NEUT_ORD.t=raceTime;   // порядок пар живёт одну нейтрализацию, как и пол
  for(const c of cars){`);

swap(`    if(c.speed<NEUT_STOPPED)continue;`,
`    const ok_=me.num<c.num?me.num+'_'+c.num:c.num+'_'+me.num;
    if(c.speed<NEUT_STOPPED){                            // вставшего объезжать можно: кто его физически обошёл, тот и впереди
      if(NEUT_ORD.m[ok_]===c.num){const f0=track.F[carIdx(me)];
        if((c.x-me.x)*f0.x+(c.z-me.z)*f0.z<=0)NEUT_ORD.m[ok_]=me.num;}
      continue;}`);

swap(`    const f=track.F[carIdx(me)],dx=c.x-me.x,dz=c.z-me.z;
    if(dx*f.x+dz*f.z<=0)continue;                        // физически сзади
    const g=Math.hypot(dx,dz);`,
`    const f=track.F[carIdx(me)],dx=c.x-me.x,dz=c.z-me.z, pj=dx*f.x+dz*f.z;
    if(Math.abs(ga)>NEUT_PAIR)delete NEUT_ORD.m[ok_];   // разошлись по трассе — порядок пары больше не держим
    else{
      if(NEUT_ORD.m[ok_]===undefined)NEUT_ORD.m[ok_]=pj>0?c.num:me.num;   // кто впереди, когда пара сошлась под флагом
      if(NEUT_ORD.m[ok_]!==c.num)continue;               // он защёлкнут позади меня — не держит меня, где бы ни был
      if(pj<=0){
        if(pj<-CAR_LEN){NEUT_ORD.m[ok_]=me.num;continue;}  // вышел на целый корпус: он у меня в хвосте, а объезжать под флагом не умеет
        const cp=Math.max(0,c.speed-NEUT_RECOVER*(1-pj));   // вылез вперёд, корпуса перекрыты — отдать место
        if(cp<ovCap)ovCap=cp;continue;}}
    if(pj<=0)continue;                                   // физически сзади
    const g=Math.hypot(dx,dz);`);

swap(`  if(!best)return null;
  /* Пол — тот зазор`,
`  if(!best)return ovCap<1e9?ovCap:null;
  /* Пол — тот зазор`);

swap(`  const m=bg-NEUT_GAP;
  if(m>=0)return neutBleedBack(best.speed,m);
  return Math.max(0,best.speed-NEUT_RECOVER*Math.max(0,floor-bg));}`,
`  const m=bg-NEUT_GAP;
  if(m>=0)return Math.min(ovCap,neutBleedBack(best.speed,m));
  return Math.min(ovCap,Math.max(0,best.speed-NEUT_RECOVER*Math.max(0,floor-bg)));}
let NEUT_ORD={t:-1,m:{}};
const NEUT_PAIR=${PAIR};`);

fs.writeFileSync(OUT, src);
console.log(`опытная сборка «порядок пары под флагом» (пара ближе ${PAIR} м) -> ${OUT}`);
