/* ============================================================================
   APEX '26 — scenery_builders.js  (билдеры окружения Сильверстоуна)
   Общие материалы по типу (склейка draw calls). r128-совместимо:
   без CapsuleGeometry / mergeBufferGeometries / OrbitControls.

   ЭКСПОРТ:
   • makeSceneryMats(THREE)        — общие материалы { crowd, struct, build, glass }
   • makeGrandstand(THREE,o,mats)  — ПРЯМАЯ трибуна (лицо на -Z, глубина +Z)
   • makeGrandstandArc(THREE,o,mats,helpers) — ДУГОВАЯ трибуна вдоль кромки
     поворота (полукругом): наклонная лента сидений + козырёк, один-два меша.
   • makeBuilding(THREE,o,mats)    — пит-билдинг/здание
   • buildSceneryObject(THREE,o,mats,helpers) — диспетчер: ставит объект по
     latLon и ориентирует. Маршрут по o.shape: 'arc' → дуговая, иначе прямая.

   helpers (даёт основной чат): {
     toXZ(lat,lon)->[x,z], nearestIndex(x,z)->i,
     track: { P:[Vector3], R:[Vector3], S:[number], M:int, length:number } }
============================================================================ */

// Процедурная текстура зрителей: ряды сидений, часть мест пустая, люди — резкие
// пиксели (NearestFilter, без размытия). Ни файлов, ни сети. 96x96 ≈ 32 чел. в ряд.
function makeCrowdTexture(THREE){
  if(typeof document==='undefined') return null;          // headless — работаем без текстуры
  // Все места заняты: пустых кресел не рисуем, только разные цвета одежды.
  const N=96, cv=document.createElement('canvas'); cv.width=cv.height=N;
  const g=cv.getContext('2d');
  g.fillStyle='#1a222c'; g.fillRect(0,0,N,N);
  const ROW=6, PAL=['#c9d2dc','#8fa3b8','#c86b5a','#d7b26a','#6f8f5e','#5b6f9c','#b6bcc4','#e2e6ea','#a2555f','#d0dae4','#7f93a8','#bf6350'];
  for(let y=0;y<N;y+=ROW){
    g.fillStyle='#141b23'; g.fillRect(0,y,N,1);           // ступень ряда
    for(let x=0;x<N;x+=3){
      // пустых мест нет — трибуны заполнены полностью
      g.fillStyle=PAL[(Math.random()*PAL.length)|0];
      g.fillRect(x,y+2,2,ROW-3);                           // корпус
      g.fillStyle='#e4cdb4'; g.fillRect(x,y+1,2,1);        // голова
    }
  }
  const t=new THREE.CanvasTexture(cv);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.magFilter=THREE.NearestFilter;                         // резкие пиксели, не мыло
  t.minFilter=THREE.LinearMipmapLinearFilter;
  return t;
}

function makeSceneryMats(THREE){
  const crowdTex=makeCrowdTexture(THREE);
  const boardTex=makeMarkerAtlas(THREE);
  return {
    // side:DoubleSide — ленты сидений/козырьков это открытые полосы; без этого
    // они видны только с одной стороны (сверху казались отсутствующими).
    crowd: new THREE.MeshLambertMaterial({map:crowdTex, vertexColors:true, side:THREE.DoubleSide}),
    struct:new THREE.MeshLambertMaterial({color:0x9aa0a6, side:THREE.DoubleSide}),
    build: new THREE.MeshLambertMaterial({color:0x8792a0}),   // здания — общий
    glass: new THREE.MeshLambertMaterial({color:0x3b3f45}),
    rail:  new THREE.MeshLambertMaterial({color:0xb5443c, side:THREE.DoubleSide}),
    board: new THREE.MeshBasicMaterial({map:boardTex, color:boardTex?0xffffff:0x14181d, side:THREE.DoubleSide})    // остекление
  };
}

// --- ПРЯМАЯ трибуна: пандус сидений поднимается ОТ трассы наружу ---
// Низ (y=0) у трассы (локальный -Z), верх (y=h) наружу (локальный +Z, глубина d).
// Зрители сверху смотрят вниз на полотно. Ничего не нависает над трассой.
function makeGrandstand(THREE,o,mats){
  const g=new THREE.Group(), w=o.w,h=o.h,d=o.d;
  // пандус: перед-низ у трассы (z=0, на pos), зад-верх наружу (z=+d)
  const a=[-w/2,0,0], b=[w/2,0,0], c=[w/2,h,d], e=[-w/2,h,d];
  const pos=[...a,...b,...c, ...a,...c,...e];
  const gs=new THREE.BufferGeometry(); gs.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); gs.computeVertexNormals();
  const seat=new THREE.Mesh(gs, mats.crowd); g.add(seat);
  const back=new THREE.Mesh(new THREE.BoxGeometry(w,h*0.5,0.6), mats.struct); back.position.set(0,h*0.75,d); g.add(back);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(w,0.4,d*0.5), mats.struct); roof.position.set(0,h+0.2,d*0.75); g.add(roof);
  return g;
}

// --- ДУГОВАЯ трибуна: строится по точкам центра трассы на [fromS,toS] ---
// Наклонная лента сидений (низ у трассы, верх наружу на высоте h) следует
// изгибу поворота — визуально «полукругом». Плюс тонкий козырёк по верхней кромке.
function makeGrandstandArc(THREE,o,mats,helpers){
  const T=helpers.track, sign=(o.side==='R')?1:-1;
  const idx=[];
  for(let i=0;i<T.M;i++){ const s=T.S[i];
    let inside=(o.fromS<=o.toS)?(s>=o.fromS&&s<=o.toS):(s>=o.fromS||s<=o.toS);
    if(inside) idx.push(i);
  }
  idx.sort((a,b)=>((T.S[a]-o.fromS+T.length)%T.length)-((T.S[b]-o.fromS+T.length)%T.length));
  const h=o.h, d=o.d, ROOF=h+3.0;
  // 4 продольные линии: A — низ у трассы, B — верх сидений (сзади),
  // C — низ ЗАДНЕЙ стенки (на земле), Rf — передний край козырька.
  const A=[],B=[],C=[],Rf=[];
  for(const i of idx){ const P=T.P[i], R=T.R[i];
    const at=(off,y)=>new THREE.Vector3(P.x+R.x*sign*off, y, P.z+R.z*sign*off);
    A.push(at(o.off,0)); B.push(at(o.off+d,h)); C.push(at(o.off+d,0)); Rf.push(at(o.off+d*0.45,ROOF));
  }
  const g=new THREE.Group(), N=A.length;
  function strip(P1,P2,flip){ const v=[];
    for(let k=0;k<N-1;k++){ const a=P1[k],b=P2[k],c=P1[k+1],e=P2[k+1];
      if(flip) v.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z,  b.x,b.y,b.z, e.x,e.y,e.z, c.x,c.y,c.z);
      else     v.push(a.x,a.y,a.z, c.x,c.y,c.z, b.x,b.y,b.z,  b.x,b.y,b.z, c.x,c.y,c.z, e.x,e.y,e.z);
    } return v; }
  // --- сиденья: лента A->B. Детализация — текстурой (резкие зрители),
  // вершинный цвет ПОСТОЯНЕН внутри квада: лёгкая вариация тона, чтобы разбить
  // повторяемость тайла; размытия нет, «пустых» секций тоже нет.
  const sv=[],suv=[],sc=[],TILE=24.0;
  let cum=0;
  for(let k=0;k<N-1;k++){
    const a=A[k],b=B[k],c=A[k+1],e=B[k+1];
    const u0=cum/TILE; cum+=a.distanceTo(c); const u1=cum/TILE;
    sv.push(a.x,a.y,a.z, c.x,c.y,c.z, b.x,b.y,b.z,  b.x,b.y,b.z, c.x,c.y,c.z, e.x,e.y,e.z);
    suv.push(u0,0, u1,0, u0,1,  u0,1, u1,0, u1,1);
    const f=0.92+0.08*Math.random();               // лёгкая вариация освещённости,
                                                   // НЕ заполненность: трибуны полные
    for(let q=0;q<6;q++) sc.push(f,f,f*0.98);
  }
  const gs=new THREE.BufferGeometry();
  gs.setAttribute('position',new THREE.Float32BufferAttribute(sv,3));
  gs.setAttribute('uv',new THREE.Float32BufferAttribute(suv,2));
  gs.setAttribute('color',new THREE.Float32BufferAttribute(sc,3));
  gs.computeVertexNormals();
  g.add(new THREE.Mesh(gs, mats.crowd));
  // --- каркас: задняя стенка (перпендикулярно земле), козырёк, торцы ---
  const fv=[].concat(
    strip(C,B,true),          // задняя стенка от земли до верха сидений
    strip(B,Rf,false),        // козырёк над сиденьями
    strip(A,C,true)           // пол/цоколь под трибуной (закрывает низ)
  );
  // торцевые заглушки: треугольник A-C-B на каждом конце
  [[0,false],[N-1,true]].forEach(([k,inv])=>{
    const a=A[k],c=C[k],b=B[k];
    if(inv) fv.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z);
    else    fv.push(a.x,a.y,a.z, c.x,c.y,c.z, b.x,b.y,b.z);
  });
  const gf=new THREE.BufferGeometry();
  gf.setAttribute('position',new THREE.Float32BufferAttribute(fv,3));
  gf.computeVertexNormals();
  g.add(new THREE.Mesh(gf, mats.struct));
  return g;
}

// НЕПРЕРЫВНОЕ ОГРАЖДЕНИЕ. rail.L / rail.R — замкнутые ломаные [lat,lon].
// L — внешняя граница круга, R — внутренняя. Два меша на всю трассу.
// Отдельных барьеров больше нет: там, где на трассе есть настоящий отбойник,
// ломаная просто проходит по нему — стык бесшовный по построению.
function makeRail(THREE,rail,mats,helpers){
  const g=new THREE.Group(), H=rail.height||1.15;
  ['L','R'].forEach(side=>{
    const pts=rail[side]; if(!pts||pts.length<2) return;
    const v=[];
    for(let k=0;k<pts.length;k++){
      const j=(k+1)%pts.length;
      const a=helpers.toXZ(pts[k][0],pts[k][1]), b=helpers.toXZ(pts[j][0],pts[j][1]);
      v.push(a[0],0,a[1], a[0],H,a[1], b[0],0,b[1],  a[0],H,a[1], b[0],H,b[1], b[0],0,b[1]);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mats.rail));
  });
  return g;
}


// ---------------------------------------------------------------------------
// ТАБЛИЧКИ РАССТОЯНИЯ ДО ПОВОРОТА
// 150/100/50 м. Ставятся только в зонах торможения, на бровке у края полотна,
// лицом навстречу, стоят ПРЯМО НА ЗЕМЛЕ (без стойки).
// Все панели — одна геометрия с атласом цифр, все стойки — одна геометрия:
// ИТОГО 2 draw calls на все таблички трассы.
// ---------------------------------------------------------------------------
function makeMarkerAtlas(THREE){
  if(typeof document==='undefined') return null;
  const N=128, CELL=32, cv=document.createElement('canvas'); cv.width=cv.height=N;
  const g=cv.getContext('2d');
  g.fillStyle='#ffffff'; g.fillRect(0,0,N,N);
  const LABEL=['150','100','50'];   // 3 строки атласа; 4-я не используется
  g.textAlign='center'; g.textBaseline='middle';
  for(let r=0;r<3;r++){
    g.fillStyle='#ffffff'; g.fillRect(0,r*CELL,N,CELL);           // белый щит
    g.strokeStyle='#111417'; g.lineWidth=3; g.strokeRect(2,r*CELL+2,N-4,CELL-4);
    g.fillStyle='#111417'; g.font='bold 23px system-ui,sans-serif';
    g.fillText(LABEL[r], N/2, r*CELL+CELL/2+1);                   // чёрные цифры
  }
  const t=new THREE.CanvasTexture(cv);
  t.magFilter=THREE.NearestFilter; t.minFilter=THREE.LinearFilter;  // без мипмапов:
  t.generateMipmaps=false;            // иначе соседние ячейки атласа подмешиваются
  return t;
}

function makeDistanceBoards(THREE,mk,mats,helpers){
  const g=new THREE.Group();
  const list=mk.markers||[], W=mk.panelW||1.6, H=mk.panelH||0.9;
  const Y0=(mk.baseY!==undefined?mk.baseY:0), PW=mk.postW||0;   // Y0=0 — щит стоит на земле
  const ROW={150:0,100:1,50:2}, ROWS=3;
  const pv=[],pu=[],sv=[];
  const T=helpers.track, NP=T.P.length;
  list.forEach(m=>{
    const [x,z]=helpers.toXZ(m.latLon[0],m.latLon[1]);
    const i=helpers.nearestIndex(x,z), j=(i+1)%NP;
    const fw=new THREE.Vector3(T.P[j].x-T.P[i].x,0,T.P[j].z-T.P[i].z).normalize();
    const lat=new THREE.Vector3(-fw.z,0,fw.x);            // поперёк трассы
    const a=[x-lat.x*W/2, Y0,      z-lat.z*W/2];
    const b=[x+lat.x*W/2, Y0,      z+lat.z*W/2];
    const c=[x+lat.x*W/2, Y0+H,    z+lat.z*W/2];
    const e=[x-lat.x*W/2, Y0+H,    z-lat.z*W/2];
    pv.push(...a,...b,...c, ...a,...c,...e);              // щит, лицом против хода
    // ВАЖНО: у CanvasTexture flipY=true, картинка переворачивается по вертикали.
    // Строка r канваса (сверху вниз) занимает v = [1-(r+1)/4 .. 1-r/4].
    const r=(ROW[m.dist]!==undefined?ROW[m.dist]:1);
    const v0=1-(r+1)/4+0.004, v1=1-r/4-0.004;
    pu.push(0,v0, 1,v0, 1,v1,  0,v0, 1,v1, 0,v1);
    if(PW>0 && Y0>0){                       // стойка нужна, только если щит поднят
      const hw=PW/2;
      const p0=[x-lat.x*hw,0,z-lat.z*hw], p1=[x+lat.x*hw,0,z+lat.z*hw];
      const p2=[x+lat.x*hw,Y0+0.05,z+lat.z*hw], p3=[x-lat.x*hw,Y0+0.05,z-lat.z*hw];
      sv.push(...p0,...p1,...p2, ...p0,...p2,...p3);
    }
  });
  if(pv.length){
    const gp=new THREE.BufferGeometry();
    gp.setAttribute('position',new THREE.Float32BufferAttribute(pv,3));
    gp.setAttribute('uv',new THREE.Float32BufferAttribute(pu,2));
    gp.computeVertexNormals();
    g.add(new THREE.Mesh(gp, mats.board));
    if(sv.length){
      const gs=new THREE.BufferGeometry();
      gs.setAttribute('position',new THREE.Float32BufferAttribute(sv,3));
      gs.computeVertexNormals();
      g.add(new THREE.Mesh(gs, mats.struct));
    }
  }
  return g;
}

function makeBuilding(THREE,o,mats){
  const g=new THREE.Group(), w=o.w,h=o.h,d=o.d;
  const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mats.build); body.position.set(0,h/2,d/2); g.add(body);
  const gl=new THREE.Mesh(new THREE.BoxGeometry(w*0.98,h*0.42,0.5), mats.glass); gl.position.set(0,h*0.24,-0.02); g.add(gl);
  return g;
}

// --- ДИСПЕТЧЕР ---
function buildSceneryObject(THREE,o,mats,helpers){
  if(o.shape==='arc'){                       // дуговая — уже в мировых координатах
    const g=makeGrandstandArc(THREE,o,mats,helpers);
    return g;
  }
  const g=(o.kind==='pit'||o.kind==='building')? makeBuilding(THREE,o,mats) : makeGrandstand(THREE,o,mats);
  const [x,z]=helpers.toXZ(o.latLon[0],o.latLon[1]);
  g.position.set(x,0,z);
  // ОРИЕНТАЦИЯ ПО ХОРДЕ СВОЕГО УЧАСТКА [atS±min(w/2,55)]. Берём индекс по atS
  // (СВОЯ нога трассы), НЕ по nearestIndex(x,z): у смещённой позиции ближайшей
  // может оказаться чужая нога (петля Loop, параллельная прямая), и трибуну
  // развернёт по чужому участку. Кап 55 м — чтобы длинная трибуна не ловила
  // изгиб соседнего поворота.
  const T=helpers.track, P=T.P, n=P.length, Sar=T.S, LEN=T.length;
  function idxAtS(s){ s=((s%LEN)+LEN)%LEN; let bi=0,bd=1e18;
    for(let k=0;k<n;k++){ const dd=Math.abs(((Sar[k]-s+LEN/2)%LEN)-LEN/2); if(dd<bd){bd=dd;bi=k;} } return bi; }
  const anchor=(o.atS!=null)? idxAtS(o.atS) : helpers.nearestIndex(x,z);
  const half=Math.min(o.w/2,55);
  function march(sg){ let k=anchor,acc=0; while(acc<half){ const m=(k+sg+n)%n; acc+=P[k].distanceTo(P[m]); k=m; if(k===anchor)break; } return k; }
  const A=P[march(-1)], B=P[march(1)];
  const dir=new THREE.Vector3(B.x-A.x,0,B.z-A.z).normalize();
  const up=new THREE.Vector3(0,1,0);
  let out=new THREE.Vector3(x-P[anchor].x,0,z-P[anchor].z).normalize();
  out.sub(dir.clone().multiplyScalar(out.dot(dir))).normalize();
  // makeBasis требует ПРАВУЮ тройку. (dir,up,out) правая только для объектов
  // с одной стороны трассы; с другой это отражение, и setFromRotationMatrix
  // возвращает мусор — объект разворачивает поперёк полотна. Разворачиваем dir,
  // чтобы третья ось по-прежнему смотрела наружу: коробка симметрична, вид тот же.
  const zA=new THREE.Vector3().crossVectors(dir,up);
  if(zA.dot(out)<0){ dir.negate(); zA.negate(); }
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir,up,zA));
  return g;
}
