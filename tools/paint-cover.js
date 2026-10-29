/* Справка: видна ли краска и покрытие выездов (материал tint) на трассе с рельефом (v1.17.18; скриншоты владельца 29.10.2026 —
   «стыки краски» и «снова пропала краска» в Баку). Строит мир в vm, затем:
   (1) ЗАКРЫТО — точки внутри каждого треугольника краски шагом STEP м: есть ли над ней (до 0.6 м) треугольник другого меша
       (асфальт полотна, обочины, кармана, земля города…) — площадь по местам S и по мешам;
   (2) ПОРЕБРИК — точки поребрика, над которыми краска (или вровень, ближе 2 мм): на склоне она выходила поверх него зубцами;
   (3) ЩЕЛИ — вершины краски, совпадающие в плане (до 1 мм), но разной высоты: ступенька между соседними треугольниками,
       сквозь неё виден асфальт под краской (длина рёбер со ступенькой больше 3 мм).
   Полотно (0.020) над краской у самой кромки — нарочно (край краски прячется под ним и под поребриком 0.9 м): точки ближе EDGE=1 м к кромке
   не в счёт;
   поребрик и белые линии над краской — тоже нарочно.
     node tools/paint-cover.js [Baku] [--step=0.3] [--xz]      APEX_INDEX=файл — опытная сборка   */
const path = require('path');
const H = require(path.join(__dirname, 'harness.js'));
const key = process.argv.slice(2).find(a => !a.startsWith('--')) || 'Baku';
const STEP = +(process.argv.find(a => a.startsWith('--step=')) || '--step=0.3').slice(7);
const idx = H.tracks().findIndex(t => t.key === key);
const env = H.setupWorld(H.loadGame(), { trackIdx: idx });
const out = JSON.parse(env.evalIn(`(function(STEP,EDGE){
  var PM=track.paintMat;if(!PM){scene.traverse(function(o){if(!PM&&o.isMesh&&o.material&&o.material.vertexColors&&o.material.map&&o.material.side===THREE.DoubleSide&&o.material.type==='MeshLambertMaterial')PM=o.material;});}
  field.forEach(function(c){c.mesh.visible=false;});if(player&&player.mesh)player.mesh.visible=false;
  scene.updateMatrixWorld(true);
  var C=4,cells=new Map(),T=[],names=[],v=new THREE.Vector3(),paint=[],kerbT=[];
  function vis(o){for(var p=o;p;p=p.parent)if(p.visible===false)return false;return true;}
  scene.traverse(function(o){if(!o.isMesh||!vis(o))return;var g=o.geometry,pa=g.attributes.position;if(!pa)return;
    var ix=g.index?g.index.array:null,n=ix?ix.length:pa.count,P=new Float64Array(pa.count*3);
    for(var i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i).applyMatrix4(o.matrixWorld);P[i*3]=v.x;P[i*3+1]=v.y;P[i*3+2]=v.z;}
    var isP=o.material===PM,mid=names.length;
    var isK=!isP&&o.material&&o.material.map&&o.material.map.image&&o.material.map.image.width===32&&o.material.map.image.height===16;
    if(!isP&&o.material&&(o.material.type==='MeshBasicMaterial'||isK)&&!isK)return;   // белые линии над краской — нарочно
    var m=o.material,col=m&&m.color?m.color.getHexString():'-';
    names.push((o===track.reliefAsphalt||(track.reliefAsphalt&&track.reliefAsphalt.children&&track.reliefAsphalt.children.indexOf(o)>=0)?'асфальт(reliefAsphalt) ':'')+(m?m.type:'')+' #'+col+(m&&m.map?' map':'')+(m&&m.vertexColors?' vc':'')+' v'+pa.count);
    for(var t=0;t<n;t+=3){var a=(ix?ix[t]:t)*3,b=(ix?ix[t+1]:t+1)*3,c=(ix?ix[t+2]:t+2)*3;
      var tr=[[P[a],P[a+1],P[a+2]],[P[b],P[b+1],P[b+2]],[P[c],P[c+1],P[c+2]]];
      var ux=tr[1][0]-tr[0][0],uy=tr[1][1]-tr[0][1],uz=tr[1][2]-tr[0][2],wx=tr[2][0]-tr[0][0],wy=tr[2][1]-tr[0][1],wz=tr[2][2]-tr[0][2];
      var nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx,nl=Math.hypot(nx,ny,nz);if(nl<1e-9||Math.abs(ny)/nl<0.3)continue;   // стены лучу сверху не мешают
      if(isP){paint.push(tr);continue;}
      if(isK){kerbT.push(tr);continue;}   // поребрик над краской — нарочно; наоборот — дефект (ниже)
      var id=T.length;T.push(tr);names[mid+'_']=1;T[id].m=mid;
      var x0=Math.floor(Math.min(tr[0][0],tr[1][0],tr[2][0])/C),x1=Math.floor(Math.max(tr[0][0],tr[1][0],tr[2][0])/C),
          z0=Math.floor(Math.min(tr[0][2],tr[1][2],tr[2][2])/C),z1=Math.floor(Math.max(tr[0][2],tr[1][2],tr[2][2])/C);
      if((x1-x0)*(z1-z0)>400)continue;   // огромные плиты (море, земля вдали) — не над краской
      for(var aa=x0;aa<=x1;aa++)for(var bb=z0;bb<=z1;bb++){var k=aa*65536+bb;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(id);}}});
  function above(x,z,y){var L=cells.get(Math.floor(x/C)*65536+Math.floor(z/C));if(!L)return -1;var best=-1,by=1e9;
    for(var q=0;q<L.length;q++){var tr=T[L[q]],a=tr[0],b=tr[1],c=tr[2],d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-12)continue;
      var u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,w=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d,e=1-u-w;
      if(u<-1e-7||w<-1e-7||e<-1e-7)continue;var yy=u*a[1]+w*b[1]+e*c[1];if(yy>y+0.0005&&yy<y+0.6&&yy<by){by=yy;best=tr.m;}}
    return best;}
  function below(x,z,y){var L=cells.get(Math.floor(x/C)*65536+Math.floor(z/C));if(!L)return null;var by=null;
    for(var q=0;q<L.length;q++){var tr=T[L[q]],a=tr[0],b=tr[1],c=tr[2],d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-12)continue;
      var u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,w=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d,e=1-u-w;
      if(u<-1e-7||w<-1e-7||e<-1e-7)continue;var yy=u*a[1]+w*b[1]+e*c[1];if(names[tr.m].indexOf('reliefAsphalt')>=0&&yy<=y+0.0005&&yy>y-0.3&&(by===null||yy>by))by=yy;}
    return by;}
  var gaps=[],hig={},hix=[];
  // ближайшая станция и отступ от осевой (для «у кромки» и для S)
  var G=new Map(),GC=20;for(var i=0;i<track.M;i++){var k=Math.floor(track.P[i].x/GC)*65536+Math.floor(track.P[i].z/GC);if(!G.has(k))G.set(k,[]);G.get(k).push(i);}
  function near(x,z){var bi=-1,bd=1e18,cx=Math.floor(x/GC),cz=Math.floor(z/GC);for(var a=-2;a<=2;a++)for(var b=-2;b<=2;b++){var L=G.get((cx+a)*65536+cz+b);if(!L)continue;
      for(var q=0;q<L.length;q++){var p=track.P[L[q]],dd=(p.x-x)*(p.x-x)+(p.z-z)*(p.z-z);if(dd<bd){bd=dd;bi=L[q];}}}return bi<0?null:[bi,Math.sqrt(bd)];}
  var hid={},byM={},total=0,hidA=0;
  for(var t=0;t<paint.length;t++){var tr=paint[t],a=tr[0],b=tr[1],c=tr[2];
    var area=Math.abs((b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]))/2;if(area<1e-6)continue;total+=area;
    var L=Math.max(Math.hypot(b[0]-a[0],b[2]-a[2]),Math.hypot(c[0]-a[0],c[2]-a[2]),Math.hypot(c[0]-b[0],c[2]-b[2])),N=Math.max(2,Math.ceil(L/STEP)),cnt=0,pts=[];
    for(var i=0;i<=N;i++)for(var j=0;j<=N-i;j++){var u=(i+1/3)/(N+1),w=(j+1/3)/(N+1);if(u+w>1)continue;var e=1-u-w;pts.push([u*a[0]+w*b[0]+e*c[0],u*a[1]+w*b[1]+e*c[1],u*a[2]+w*b[2]+e*c[2]]);}
    var wA=area/pts.length;
    for(var q=0;q<pts.length;q++){var p=pts[q],m=above(p[0],p[2],p[1]);if(m<0){var bl=below(p[0],p[2],p[1]);if(bl!==null){gaps.push(p[1]-bl);if(p[1]-bl>0.03){if(hix.length<400)hix.push([+p[0].toFixed(1),+p[2].toFixed(1),+(p[1]-bl).toFixed(3),+(p[1]-(track.relief?reliefY(p[0],p[2]):0)).toFixed(3)]);var nr0=near(p[0],p[2]);var s0=nr0?Math.round(track.S[nr0[0]]/10)*10:-1;hig[s0]=(hig[s0]||0)+wA;}}continue;}var nr=near(p[0],p[2]);
      if(nr&&nr[1]<track.HW[nr[0]]+EDGE)continue;   // у кромки под полотном — нарочно
      var s=nr?Math.round(track.S[nr[0]]/10)*10:-1;hidA+=wA;var bm=byM[names[m]]||(byM[names[m]]={a:0,s:{}});bm.a+=wA;bm.s[s]=(bm.s[s]||0)+wA;hid[s]=(hid[s]||0)+wA;}}
  // краска над поребриком: точки поребрика, над которыми треугольник краски
  var PC=new Map();paint.forEach(function(tr,id){var x0=Math.floor(Math.min(tr[0][0],tr[1][0],tr[2][0])/C),x1=Math.floor(Math.max(tr[0][0],tr[1][0],tr[2][0])/C),
      z0=Math.floor(Math.min(tr[0][2],tr[1][2],tr[2][2])/C),z1=Math.floor(Math.max(tr[0][2],tr[1][2],tr[2][2])/C);
    for(var aa=x0;aa<=x1;aa++)for(var bb=z0;bb<=z1;bb++){var k=aa*65536+bb;if(!PC.has(k))PC.set(k,[]);PC.get(k).push(id);}});
  var kerbA=0,kerbHid=0,kerbS={};
  kerbT.forEach(function(tr){var a=tr[0],b=tr[1],c=tr[2],area=Math.abs((b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]))/2;if(area<1e-6)return;kerbA+=area;
    var N=6,pts=[];for(var i=0;i<=N;i++)for(var j=0;j<=N-i;j++){var u=(i+1/3)/(N+1),w=(j+1/3)/(N+1);if(u+w>1)continue;var e=1-u-w;pts.push([u*a[0]+w*b[0]+e*c[0],u*a[1]+w*b[1]+e*c[1],u*a[2]+w*b[2]+e*c[2]]);}
    pts.forEach(function(p){var L=PC.get(Math.floor(p[0]/C)*65536+Math.floor(p[2]/C));if(!L)return;
      for(var q=0;q<L.length;q++){var t=paint[L[q]],A=t[0],B=t[1],Cc=t[2],d=(B[2]-Cc[2])*(A[0]-Cc[0])+(Cc[0]-B[0])*(A[2]-Cc[2]);if(Math.abs(d)<1e-12)continue;
        var u=((B[2]-Cc[2])*(p[0]-Cc[0])+(Cc[0]-B[0])*(p[2]-Cc[2]))/d,w=((Cc[2]-A[2])*(p[0]-Cc[0])+(A[0]-Cc[0])*(p[2]-Cc[2]))/d,e=1-u-w;
        if(u<-1e-7||w<-1e-7||e<-1e-7)continue;var yy=u*A[1]+w*B[1]+e*Cc[1];
        if(yy>p[1]-0.002&&yy<p[1]+0.5){kerbHid+=area/pts.length;var nr=near(p[0],p[2]);var s=nr?Math.round(track.S[nr[0]]/10)*10:-1;kerbS[s]=(kerbS[s]||0)+area/pts.length;break;}}});});
  // щели: вершины краски в одной точке плана с разной высотой
  var W=new Map();paint.forEach(function(tr){tr.forEach(function(p){var k=Math.round(p[0]*1000)+'_'+Math.round(p[2]*1000);var r=W.get(k);if(!r)W.set(k,r=[p[1],p[1],p[0],p[2]]);r[0]=Math.min(r[0],p[1]);r[1]=Math.max(r[1],p[1]);});});
  var cracks={},nc=0,maxc=0,cxz=[];W.forEach(function(r){var d=r[1]-r[0];if(d>0.003){nc++;if(d>0.02)cxz.push([+r[2].toFixed(1),+r[3].toFixed(1),+(d*100).toFixed(1)]);maxc=Math.max(maxc,d);var nr=near(r[2],r[3]);var s=nr?Math.round(track.S[nr[0]]/10)*10:-1;cracks[s]=(cracks[s]||0)+1;}});
  gaps.sort(function(a,b){return a-b;});var gq=function(f){return gaps.length?gaps[Math.min(gaps.length-1,Math.floor(f*gaps.length))]:0;};
  return JSON.stringify({kerbA:kerbA,kerbHid:kerbHid,kerbS:kerbS,hix:hix,hig:hig,gap:[gq(0.5),gq(0.99),gq(1)],ntri:paint.length,total:total,hidA:hidA,byM:byM,hid:hid,nc:nc,maxc:maxc,cracks:cracks,cxz:cxz,nv:W.size,relief:!!track.relief});})(${STEP},${process.env.EDGE||1.0})`));
console.log(key + (out.relief ? ' (рельеф)' : '') + `: краска и покрытие ${out.total.toFixed(0)} м², закрыто ${out.hidA.toFixed(2)} м²`);
Object.entries(out.byM).sort((a, b) => b[1].a - a[1].a).forEach(([k, v]) => console.log('  ' + v.a.toFixed(2).padStart(9) + ' м²  ' + k + '  (S ' + Object.keys(v.s).sort((a, b) => a - b).join(',') + ')'));
const hs = Object.entries(out.hid).filter(e => e[1] > 0.05).sort((a, b) => +a[0] - +b[0]);
if (hs.length) console.log('  по S (м²): ' + hs.map(([s, a]) => s + ':' + a.toFixed(2)).join('  '));
console.log('треугольников краски ' + out.ntri + `; над асфальтом под ней: медиана ${(out.gap[0] * 100).toFixed(1)} см, 99 % — ${(out.gap[1] * 100).toFixed(1)}, наибольший ${(out.gap[2] * 100).toFixed(1)}`);
const hg = Object.entries(out.hig).filter(e => e[1] > 0.5).sort((a, b) => +a[0] - +b[0]);
if (hg.length) console.log('  выше асфальта на 3 см и больше, по S (м²): ' + hg.map(([s, a]) => s + ':' + a.toFixed(1)).join('  '));
console.log(`поребрик ${out.kerbA.toFixed(0)} м², под краской или вровень с ней (ближе 2 мм) ${out.kerbHid.toFixed(2)} м²`);
const ks = Object.entries(out.kerbS).filter(e => e[1] > 0.02).sort((a, b) => +a[0] - +b[0]);
if (ks.length) console.log('  по S (м²): ' + ks.map(([s, a]) => s + ':' + a.toFixed(2)).join('  '));
console.log(`щели: вершин в одной точке плана с разной высотой ${out.nc} из ${out.nv}, наибольшая ${(out.maxc * 100).toFixed(1)} см`);
const cs = Object.entries(out.cracks).sort((a, b) => +a[0] - +b[0]);
if (cs.length) console.log('  по S (вершин): ' + cs.map(([s, n]) => s + ':' + n).join('  '));
if (process.argv.includes('--xz')) console.log('  выше асфальта (x, z, над асфальтом, над рельефом): ' + out.hix.filter((c, i) => i % 10 === 0).map(c => c.join(',')).join('  '));
if (process.argv.includes('--xz')) console.log('  ступеньки больше 2 см (x, z, см): ' + out.cxz.map(c => c.join(',')).join('  '));
