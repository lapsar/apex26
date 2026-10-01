/* ============================================================================
   ГЕНЕРАТОР ОПЫТНОЙ СБОРКИ «касание корпус против корпуса» (open-tasks/race-ai.md п.8,
   решение владельца 01.10.2026: вариант А — «если уж делать, то по-настоящему»).

   index.html не трогает: пишет копию, на которую натравливаются справки через APEX_INDEX
   (или --file у справок).

   ЧТО БЫЛО. Соперник — ТОЧКА в своём центре, игрок — прямоугольник 6.0 × 2.5 в своих осях.
   Выталкивание по оси меньшего проникновения В ОСЯХ ИГРОКА; «вдоль и назад» читается как
   въезд в зад: скорость = 0.94 скорости соседа. Отсюда два огреха (замер 30.09.2026,
   limitations.md): касание БОРТОМ наискосок читается как въезд в зад (до −22 м/с за кадр,
   2–7 раз за гонку) и соперник, зашедший наискосок сзади, сдвигает игрока вперёд (до 2 м
   за кадр); корпуса под углом заходят друг в друга углами.

   ЧТО СТАЛО. Оба — прямоугольники 6.0 × 2.5 (те же A и B), соперник — со своим НАСТОЯЩИМ
   поворотом кузова (mesh.rotation.y: дорога плюс доворот crab; у вставшего — его угол).
   Разделяющие оси — четыре стороны обоих корпусов; игрок выталкивается по оси наименьшего
   перекрытия. У параллельных корпусов оси совпадают с прежними, и при --rub=0 касание
   ровно прежнее. Цена — по направлению толчка относительно курса игрока:
     толкает НАЗАД (cos < −0.7)  — въехал ему в корму: прежнее правило (0.94 его скорости,
                                   у вставшего — половина своей);
     толкает ВБОК                — трение бортом: --rub м/с², пока касаются;
     толкает ВПЕРЁД (cos > 0.7)  — въехали в меня: только сдвиг, как и было.
   Соперника касание по-прежнему не двигает (ИИ — точка на осевой плюс полоса).

   ВЛИТО В ИГРУ в v1.16.19 вариантом `--rub=1 --scale=1` — к index.html новее v1.16.18
   генератор не применяется (образец уже заменён) и оставлен записью опыта.

   ЗАМЕР ВАРИАНТОВ (`tools/contact-audit.js`, Новичок, старт P22, 3 круга, 5 трасс × 4 зерна;
   «внахлёст» — кадры, где настоящие корпуса заходят друг в друга глубже 8 см, без «зажат»):
                         съедено м/с  рывков>5 (худший)  толчков вперёд  внахлёст  сумма времён
     v1.16.18                479        40 (22.2)            0            946      7455.6
     корпус, трение 0        470        32 (22.6)            1 (1.08 м)     0      7457.3
     корпус, трение 2        503        36 (22.4)            0              0      7458.9
     + цена по доле, тр. 0   435        23 (12.2)            3 (1.81 м)     0      7454.9
     + цена по доле, тр. 1   488        26 (15.8)            0              0      7455.6  <- выбран
     + цена по доле, тр. 2   489        26 (19.0)            0              0      7456.8
   Второй набор зёрен (13,23,42,64): v1.16.18 382 / 29 / 720 / 7453.1, выбранный 385 / 23 / 0 /
   7453.8 — гонка стоит игроку столько же (+0.03 с на гонку), как и просил владелец.
   ЗАБРАКОВАНО: «касание углом — отжать вбок» (`--glance=0.6`): машина, отжатая вбок, продолжает
   ехать вперёд и уходит в соседа глубже — внахлёст до 2.08 м, касание вдвое дольше.
   Цена по доле (`--scale=1`) лечит то же самое без перекосов: выталкивание остаётся честным,
   меняется только, сколько скорости снимает удар углом.

   Запуск: node tools/contact-build.js --out=/tmp/c.html [--rub=0] [--scale=1] [--glance=0]
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const OUT = arg('out', null); if (!OUT) throw new Error('нужен --out=<файл>');
const RUB = +arg('rub', 0);
const GLANCE = +arg('glance', 0);     // м: перекрытие ПОПЕРЁК, меньше которого «въезд в зад» читается как касание углом
const GCOST = +arg('gcost', 0.5);     // доля разницы скоростей, которую снимает касание углом (въезд в зад — вся и ещё 6 %)
const SCALE = arg('scale', '0') === '1';   // цена въезда в зад — по доле перекрытия ПОПЕРЁК (угол задел — малая, корма в корму — вся)

let src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function swap(from, to) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`образец найден ${n} раз, нужен ровно 1:\n${from}`);
  src = src.replace(from, to);
}

swap(`function carContacts(){
  {const s=Math.sin(player.hdg),co=Math.cos(player.hdg);const A=6.0,B=2.5;   // B = sum of half-widths: the car is 2.57 m across the wheels, so 1.9 let wheels pass through each other
   for(const c of field){const dx=player.x-c.x,dz=player.z-c.z;
     const lon=dx*s+dz*co, lat=dx*co-dz*s;const penL=A-Math.abs(lon),penW=B-Math.abs(lat);
     if(penL>0&&penW>0){
       if(penW<=penL){const dir=Math.sign(lat||1);player.x+=co*dir*penW;player.z-=s*dir*penW;}
       else{const dir=Math.sign(lon||1);player.x+=s*dir*penL;player.z+=co*dir*penL;
         const cs=c.retired?0:c.speed;if(dir<0&&player.speed>cs)player.speed=c.retired?player.speed*0.5:cs*0.94;}
       const now=performance.now();if(now-lastThud>240){lastThud=now;AUDIO.thud(0.5);}}}}
}`,
`const HULL_A=3.0, HULL_B=1.25, CONTACT_RUB=${RUB}, CONTACT_GLANCE=${GLANCE}, GLANCE_COST=${GCOST};
function carContacts(dt){
  const fx=Math.sin(player.hdg),fz=Math.cos(player.hdg),rx=fz,rz=-fx;
  for(const c of field){const dx=player.x-c.x,dz=player.z-c.z;
    if(dx*dx+dz*dz>42.25)continue;
    const hc=c.mesh.rotation.y,gx=Math.sin(hc),gz=Math.cos(hc),qx=gz,qz=-gx;
    let best=Infinity,nx=0,nz=0,apart=false,latO=Infinity,lx=0,lz=0;
    for(let k=0;k<4;k++){
      const ux=k===0?fx:k===1?rx:k===2?gx:qx, uz=k===0?fz:k===1?rz:k===2?gz:qz;
      const d=dx*ux+dz*uz;
      const o=HULL_A*(Math.abs(fx*ux+fz*uz)+Math.abs(gx*ux+gz*uz))
             +HULL_B*(Math.abs(rx*ux+rz*uz)+Math.abs(qx*ux+qz*uz))-Math.abs(d);
      if(o<=0){apart=true;break;}
      const sg=d<0?-1:1;
      if(k===1){latO=o;lx=ux*sg;lz=uz*sg;}
      if(o<best-1e-9){best=o;nx=ux*sg;nz=uz*sg;}}
    if(apart)continue;
    let along=nx*fx+nz*fz, glance=false;
    if(along<-0.7&&latO<=CONTACT_GLANCE){best=latO;nx=lx;nz=lz;along=0;glance=true;}
    player.x+=nx*best;player.z+=nz*best;
    const cs=c.retired?0:c.speed;
    if(glance){if(player.speed>cs)player.speed-=GLANCE_COST*(player.speed-cs);}
    else if(along<-0.7){if(player.speed>cs){const tgt=c.retired?player.speed*0.5:cs*0.94;
      const w=${SCALE?'Math.min(1,latO/HULL_B)':'1'};player.speed-=w*(player.speed-tgt);}}
    else if(along<=0.7&&CONTACT_RUB>0)player.speed=Math.max(0,player.speed-CONTACT_RUB*(dt||1/60)*0.5);
    const now=performance.now();if(now-lastThud>240){lastThud=now;AUDIO.thud(0.5);}}
}`);

swap(`field.forEach(c=>placeAI(c,dt));carContacts();carContacts();placePlayer(player);`,
     `field.forEach(c=>placeAI(c,dt));carContacts(dt);carContacts(dt);placePlayer(player);`);

fs.writeFileSync(OUT, src);
console.log(`опытная сборка «касание корпус против корпуса» (трение ${RUB} м/с²) -> ${OUT}`);
