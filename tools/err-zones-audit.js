/* Справка: где соперник «ошибается» (errCorners) против того, где на самом деле тяжёлое торможение (13.10.2026).
   Владелец: «блокировки бывают в медленных поворотах уже после сброса скорости — шикана после тоннеля (вторая часть),
   предпоследний поворот Монако». Профиль скорости среднего соперника (сила 0.90, Норма) — правилом estLapTime (aiTarget),
   по нему для каждого поворота ошибок: скорость подхода, в повороте, сброс, длина торможения, где начинается дым
   (от начала торможения, м; минус — до него), скорость в точке решения (ERR_LEAD до входа) и в конце дыма (+52 м).
   «БЛОК» — мерка-предложение: в точке решения ≥200 км/ч и сбросить до поворота ещё ≥100 км/ч.
   Подход мерится назад от минимума скорости и у пар поворотов иногда врёт (Montreal S 2652, Hungaroring S 1037) —
   столбец «при решении» надёжнее. Игру не меняет.   node tools/err-zones-audit.js */
const H=require('./harness');
for(const T of H.tracks(true)){const env=H.loadGame({seed:7});H.setupWeekend(env,{trackIdx:T.idx,diff:'normal',laps:99});
 const o=env.evalIn(`(function(){var M=track.M,seg=track.length/M;
  // профиль скорости среднего соперника (сила 0.90, Норма) — правилом estLapTime, 2 круга
  var sk=0.90,base=MAXSPEED*track.grip*DIFF_MUL.normal*(0.5538+sk*0.32)/(0.5538+0.98*0.32),ck=DIFF_GRIP.normal*(1+(sk-0.98)*CORNER_SKILL);
  var v=base*0.5,V=new Float64Array(M);
  for(var lap=0;lap<2;lap++)for(var i=0;i<M;i++){var i2=(i+1)%M,ds=track.P[i].distanceTo(track.P[i2]),tg=aiTarget(i,v,base,ck),dt=ds/Math.max(v,5);
    if(v<tg)v+=Math.min(tg-v,13.5*Math.max(0.14,1-0.85*v/MAXSPEED)*dt);else v+=(tg-v)*Math.min(1,dt*3.0);V[i]=v;}
  var ec=errCorners(),out=[];
  for(var c=0;c<ec.list.length;c++){var C=ec.list[c],t=-1;for(var i=0;i<M;i++)if(ec.trig[i]===c){t=i;break;}
    var lead=Math.round(C.lead/seg),entry=(t+lead)%M,ap=C.ap;
    // минимум скорости около апекса, начало торможения — последний максимум перед ним (назад до 400 м)
    var vmin=1e9,imin=entry;for(var k=-lead;k<=Math.round(C.toEx/seg);k++){var j=(t+k+M)%M;if(V[j]<vmin){vmin=V[j];imin=j;}}
    var bs=imin;for(var k=1;k<Math.round(400/seg);k++){var j=(imin-k+M)%M,j1=(j+1)%M;if(V[j]>V[j1]+0.01)bs=j;else break;}var vmax=V[bs];
    var d=function(a,b){return ((b-a+M)%M)*seg;};
    var bLen=d(bs,imin);
    // окно дыма сейчас: от t+2 м до t+52 м; где оно относительно торможения
    out.push({S:Math.round(track.S[entry]),vIn:Math.round(vmax*3.6),vC:Math.round(vmin*3.6),drop:Math.round((vmax-vmin)*3.6),
      bLen:Math.round(bLen),smokeFrom:Math.round(((t-bs+M+M/2)%M-M/2)*seg+2),vAtDecision:Math.round(V[t]*3.6),vAtSmokeEnd:Math.round(V[(t+Math.round(52/seg))%M]*3.6),lock:(V[t]*3.6>=200&&(V[t]-vmin)*3.6>=100)});}
  return {name:track.spec.name,len:Math.round(track.length),list:out};})()`);
 console.log('\n'+o.name+' ('+o.len+' м): поворот (S входа) | подход км/ч | в повороте | сброс | торможение м | дым начинается от начала торможения, м | скорость при решении | в конце дыма');
 o.list.sort((a,b)=>a.S-b.S).forEach(x=>console.log(`  S ${x.S}\t${x.vIn}\t${x.vC}\t${x.drop}\t${x.bLen}\t${x.smokeFrom}\t${x.vAtDecision}\t${x.vAtSmokeEnd}\t${x.lock?'БЛОК':'—'}`));
 console.log('  итого: поворотов ошибок '+o.list.length+', с тяжёлым торможением '+o.list.filter(x=>x.lock).length);}
