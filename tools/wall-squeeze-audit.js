/* СПРАВКА (не пробник, порога нет): КОЛЕСО ЗА БОРТОМ В БОРЬБЕ (v1.16.30, 02.10.2026).
   Владелец: «колесо в борьбе повисло сквозь борт» (Монако, один из первых правых поворотов).
   Автопилот пробников к стенам не прижимается (0 таких кадров), поэтому здесь НАЖИМНОЙ водитель:
   тот же руль, но цель — точка в стороне от осевой, по очереди 0, +5.2, −5.2, +4, −4 м
   (по 4 с каждая), скорость 0.97 безопасной. Он жмётся к стенам, а соперники рядом жмут его.
   После ВСЕГО кадра (физика → соперники → carContacts ×2 → …) меряется:
     за бортом     — кадров, где угол болида (колёса, концы крыльев — те же 8 точек, что
                     у проверки отбойника) стоит дальше ЛИНИИ СТЕНЫ (W, видимый борт;
                     проверка держит на 0.35 м ближе); в скобках — из них в кадр, где
                     касание с соперником сдвинуло игрока;
     внахлёст      — кадров, где настоящие корпуса (6.04 × 2.57) заходят друг в друга глубже 8 см.
   Ключи: --file=сборка.html  --seeds=7,91,3,5  --diff=easy  --pos=12  --laps=3  --tracks=Monaco|all
   Сборки сравнивать двумя запусками (файл выбирается при require). */
'use strict';
const H = require('./harness');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const FILE = arg('file', '') || undefined, DIFF = arg('diff', 'easy'), POS = +arg('pos', 12), LAPS = +arg('laps', 3);
const seeds = arg('seeds', '7,91,3,5').split(',').map(Number), only = arg('tracks', 'Monaco');
for (const T of H.tracks(true)) {
  if (only !== 'all' && only.split(',').indexOf(T.name) < 0) continue;
  for (const seed of seeds) {
    const env = H.loadGame({ seed, file: FILE });
    H.setupWeekend(env, { trackIdx: T.idx, diff: DIFF, laps: LAPS });
    H.startRaceAt(env, POS); H.lightsOut(env);
    const S = env.evalIn(`(function(){
      field.forEach(function(c){c.retireAt=0;});
      var S={n:0,poke:0,cont:0,deep:0,worst:0,ws:0,ov:0,ovw:0};
      var corners=[[1.05,2.0],[-1.05,2.0],[1.05,-1.7],[-1.05,-1.7],[1.0,3.25],[-1.0,3.25],[0.78,-2.55],[-0.78,-2.55]];
      var orig=carContacts,moved=false;
      carContacts=function(a){var x=player.x,z=player.z;orig(a);if(Math.hypot(player.x-x,player.z-z)>1e-6)moved=true;};
      function beyond(){var s=Math.sin(player.hdg),co=Math.cos(player.hdg),m=-9;
        for(var k=0;k<8;k++){var wc=corners[k],wx=player.x+wc[0]*co+wc[1]*s,wz=player.z-wc[0]*s+wc[1]*co;
          var pw=project(wx,wz,player.hint),W=(pw.off>=0?track.WR:track.WL)[pw.idx],e=Math.abs(pw.off)-W;if(e>m)m=e;}return m;}
      function overlap(){var dm=0;for(var q=0;q<field.length;q++){var c=field[q],dx=player.x-c.x,dz=player.z-c.z;if(dx*dx+dz*dz>45)continue;
          var a=player.hdg,b=c.mesh.rotation.y,ax=[[Math.sin(a),Math.cos(a)],[Math.cos(a),-Math.sin(a)],[Math.sin(b),Math.cos(b)],[Math.cos(b),-Math.sin(b)]],m=1e9;
          for(var k=0;k<4;k++){var ux=ax[k][0],uz=ax[k][1],d=Math.abs(dx*ux+dz*uz);
            var r=3.02*(Math.abs(ax[0][0]*ux+ax[0][1]*uz)+Math.abs(ax[2][0]*ux+ax[2][1]*uz))+1.285*(Math.abs(ax[1][0]*ux+ax[1][1]*uz)+Math.abs(ax[3][0]*ux+ax[3][1]*uz));
            if(r-d<m)m=r-d;}if(m>dm)dm=m;}return dm;}
      var dt=1/60,n=0,OFFS=[0,5.2,-5.2,4,-4];
      function drive(){var off=OFFS[Math.floor(n/240)%5],pr=project(player.x,player.z,player.hint),M=track.M,
          j=(pr.idx+Math.max(3,Math.round(3+player.speed*0.12)))%M,tp=track.P[j],R=track.R[j];
        var dh=Math.atan2(tp.x+R.x*off-player.x,tp.z+R.z*off-player.z)-player.hdg;
        while(dh>Math.PI)dh-=2*Math.PI;while(dh<-Math.PI)dh+=2*Math.PI;var st=Math.max(-1,Math.min(1,-dh*2.4));
        controls.left=st<-0.12?1:0;controls.right=st>0.12?1:0;var v=__AP.safeSpeed(pr.idx)*0.97;
        if(player.speed>v+1){controls.gas=0;controls.brake=1;}else if(player.speed>v){controls.gas=0;controls.brake=0;}else{controls.gas=1;controls.brake=0;}}
      while(!raceOver&&n<Math.round(600/dt)){drive();moved=false;update(dt);n++;
        if(!lights.go)continue;S.n++;var e=beyond(),o=overlap();
        if(o>0.08)S.ov++;if(o>S.ovw)S.ovw=o;
        if(e>0){S.poke++;if(moved)S.cont++;if(e>0.3)S.deep++;if(e>S.worst){S.worst=e;S.ws=Math.round(track.S[player.hint]);}}}
      return S;})()`);
    console.log(`${T.name.padEnd(12)} з${String(seed).padStart(2)} · кадров ${S.n} · за бортом ${S.poke} (в кадр касания ${S.cont}), глубже 0.3 м ${S.deep}, худший ${S.worst.toFixed(2)} м`
      + (S.poke ? ` у S ${S.ws}` : '') + ` · внахлёст ${S.ov} кадров, глубже всего ${S.ovw.toFixed(2)} м`);
  }
}
