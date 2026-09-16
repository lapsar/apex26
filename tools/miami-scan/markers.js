/* Щиты торможения Майами: считает СТРОКИ РАЗМЕТКИ по нынешней линии барьера.

   Зачем скрипт, а не руки: щит и отбойник заданы РАЗНЫМИ данными, но связаны
   геометрически, и на этом в проекте обожглись дважды (CLAUDE.md §8, v1.15.20
   и v1.15.52 — правка барьера проехала сквозь щиты). У Майами барьер пока
   ОБОБЩЁННЫЙ: сдвинешь `runoff` в spec — и все девять щитов надо пересчитать.
   Тогда достаточно снова запустить этот скрипт и вставить его вывод.

   ПРАВИЛО ПОСАДКИ (то же, что у Монреаля, v1.15.24): latLon задаёт СТОЙКУ,
   она стоит на 0.30 м ЗА отбойником, полотно свешивается от неё к трассе.
   Сторона — ВНЕШНЯЯ по отношению к повороту, к которому щит ведёт (проверено
   по Монреалю: у левой Senna S щиты справа, у правой шпильки — слева).

   ОТКУДА ЗОНЫ. Не на глаз: тормозные эпизоды сняты с телеметрии F1 (openf1.org,
   поул 2026) и совмещены с нашей осевой — см. brakepoints.py. Настоящих
   торможений с высокой скорости на круге три: T1, T11, T17. Дистанции 150/100/50
   отсчитываются назад от точки поворота из официальных данных F1 (те же, что
   в map-plan.js), и это сходится с замером: реальный тормоз включается у щита
   «100» в T1 и T11 и у «150» в T17, где скорость выше всего.

   node tools/miami-scan/markers.js
*/
const path=require('path');
const H=require(path.join(__dirname,'..','harness.js'));

// S точки поворота по НАШЕЙ осевой (map-plan.js, CORNERS) и сторона поворота
const ZONES=[
  {corner:'Turn 1',  atCorner:378,  turn:'правый'},
  {corner:'Turn 11', atCorner:3129, turn:'левый'},
  {corner:'Turn 17', atCorner:4921, turn:'левый'},
];
const DIST=[150,100,50];
const BEHIND=0.30;                       // на столько стойка уходит за барьер

const env=H.loadGame();
const idx=H.tracks().findIndex(t=>t.key==='Miami');
env.evalIn(`track=makeTrack(TRACKS[${idx}]);buildWidth();track.wallOff=track.roadHalf+Math.min(track.runoff,14);buildWallProfile();0`);
const D=JSON.parse(env.evalIn(`(function(){
  var o={M:track.M,len:track.length,S:Array.from(track.S),HW:Array.from(track.HW),
         WL:Array.from(track.WL),WR:Array.from(track.WR),P:[],R:[]};
  for(var i=0;i<track.M;i++){o.P.push([track.P[i].x,track.P[i].z]);o.R.push([track.R[i].x,track.R[i].z]);}
  var g=SCEN_ORIGIN['Miami']; o.geo={lat0:g.lat0,lon0:g.lon0,mlon:g.mlon};
  return JSON.stringify(o);})()`));
const {M,len,S,HW,WL,WR,P,R,geo}=D;
const idxAtS=s=>Math.round((((s%len)+len)%len)/len*M)%M;
const toDeg=(x,z)=>[geo.lat0+z/110540, geo.lon0-x/geo.mlon];

const f=(x,n)=>x.toFixed(n);
console.log('  markers: { panelW:1.6, panelH:1.2, baseY:1.15, postW:0.14, postSide:\'outer\', markers: [');
for(const z of ZONES){
  const side=(z.turn==='правый')?'L':'R';     // щит с ВНЕШНЕЙ стороны поворота
  for(const d of DIST){
    const s=((z.atCorner-d)%len+len)%len, i=idxAtS(s);
    const wall=(side==='L'?WL[i]:WR[i]);
    const off=wall+BEHIND, sgn=(side==='L')?-1:1;
    const x=P[i][0]+R[i][0]*sgn*off, zz=P[i][1]+R[i][1]*sgn*off;
    const [lat,lon]=toDeg(x,zz);
    console.log(`    {corner:'${z.corner}', dist:${d}, atS:${Math.round(S[i])}, side:'${side}', off:${f(off,2)}, latLon:[${f(lat,6)},${f(lon,6)}]},`
      +`   // барьер ${f(wall,2)} м, кромка ${f(HW[i],1)} м`);
  }
}
console.log('  ]},');
