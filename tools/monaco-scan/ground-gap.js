/* Справка (v1.16.34): дома и коробки Монако не висят над склоном. По ПОСТРОЕННОЙ геометрии:
   низ стены дома (самая низкая вершина меша домов в точке контура) против видимой земли под ней
   (луч вниз в сетку земли); у обобщённых коробок — низ коробки против земли под её углами.
   Земля — нижняя огибающая рельефа: на склоне она на метры ниже reliefY.
   node tools/monaco-scan/ground-gap.js        APEX_INDEX=файл — другая сборка */
'use strict';
const H = require('../harness');
const env = H.loadGame({ seed: 3 });
const ti = H.tracks().find(t => t.key === 'Monaco').idx;
H.setupWorld(env, { trackIdx: ti });
const out = env.evalIn(`(function(){
  let gr=null;scene.traverse(o=>{if(o.isMesh&&o.userData.reliefDone&&o.geometry.index&&!gr)gr=o;});
  const rc=new THREE.Raycaster(),dn=new THREE.Vector3(0,-1,0);
  const gy=(x,z)=>{rc.set(new THREE.Vector3(x,900,z),dn);const h=rc.intersectObject(gr);return h.length?h[0].point.y:null;};
  // меш домов: вершинный цвет, Lambert, двусторонний — тот, где лежат контуры track.tunnelBld
  let bm=null;const p0=track.tunnelBld[0].pts[0];
  scene.traverse(o=>{if(bm||!o.isMesh||!o.material.vertexColors||o.material.side!==THREE.DoubleSide)return;
    const pa=o.geometry.attributes.position;for(let i=0;i<pa.count;i++)if(Math.abs(pa.getX(i)-p0[0])<0.02&&Math.abs(pa.getZ(i)-p0[1])<0.02){bm=o;break;}});
  const pa=bm.geometry.attributes.position,grid=new Map(),key=(x,z)=>Math.round(x*20)+':'+Math.round(z*20);
  for(let i=0;i<pa.count;i++){const k=key(pa.getX(i),pa.getZ(i)),y=pa.getY(i);if(!grid.has(k)||grid.get(k)>y)grid.set(k,y);}
  const res=[];
  for(const B of track.tunnelBld){let worst=-1e9,n=0;
    for(const p of B.pts){if(tunnelOver(p[0],p[1])!=null)continue;const y=grid.get(key(p[0],p[1])),g=gy(p[0],p[1]);if(y==null||g==null)continue;n++;
      worst=Math.max(worst,y-g);}
    res.push({name:B.o.name,gap:+worst.toFixed(2),n});}
  // обобщённые коробки: склеены в один меш материала #8b93a0 — углы коробок по вершинам
  let box=null;scene.traverse(o=>{if(o.isMesh&&o.material.color&&o.material.color.getHexString()==='8b93a0'&&!o.material.vertexColors)box=o;});
  let bw=-1e9,bn=0;if(box){const q=box.geometry.attributes.position,lo=new Map();
    for(let i=0;i<q.count;i++){const k=key(q.getX(i),q.getZ(i)),y=q.getY(i);if(!lo.has(k)||lo.get(k)>y)lo.set(k,y);}
    lo.forEach((y,k)=>{const [a,b]=k.split(':').map(Number),g=gy(a/20,b/20);if(g==null)return;bn++;bw=Math.max(bw,y-g);});}
  return {res,bw:+bw.toFixed(2),bn};})()`);
let bad = 0;
out.res.forEach(o => { const b = o.gap > 0.05; if (b) bad++; console.log((b ? '✗ ' : '  ') + o.name.padEnd(28) + ' низ стены над землёй: ' + o.gap + ' м (точек контура ' + o.n + ')'); });
console.log((out.bw > 0.05 ? '✗ ' : '  ') + 'обобщённые коробки'.padEnd(28) + ' низ над землёй: ' + out.bw + ' м (углов ' + out.bn + ')');
if (out.bw > 0.05) bad++;
console.log(bad ? 'висят над землёй: ' + bad : 'ни дом, ни коробка не висят над видимой землёй (худший низ — под ней)');
