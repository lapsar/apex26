// w17.json (build.js) → tools/car-w17/w17-data.js: геометрия болида для index.html — позиции int16 (0.1 мм), нормали int8,
// индексы; сжатие meshoptimizer (вершины и индексы), base64. Игра распаковывает эталонным декодером на чистом JS (MIT).
import fs from 'fs';import {MeshoptEncoder} from 'meshoptimizer';
await MeshoptEncoder.ready;
const D=JSON.parse(fs.readFileSync(process.argv[2])),OUT=process.argv[3];
const res={};let total=0;
for(const lod in D.lods){res[lod]={};
 for(const k in D.lods[lod].L){const {p,n}=D.lods[lod].L[k];const nv=p.length/3,map=new Map(),P=[],N=[],I=[];
  for(let i=0;i<nv;i++){const q=[0,1,2].map(j=>Math.round(p[i*3+j]*10000)),r=[0,1,2].map(j=>Math.max(-127,Math.min(127,Math.round(n[i*3+j]*127))));const key=q.join()+'|'+r.join();
   let id=map.get(key);if(id===undefined){id=P.length/4;map.set(key,id);P.push(...q,0);N.push(...r,0);}I.push(id);}
  let V=P.length/4,ib=new Uint32Array(I);
  const [remap,uniq]=MeshoptEncoder.reorderMesh(ib,true,true);                       // индексы переписаны на месте, вершины — по remap
  const P2=new Int16Array(uniq*4),N2=new Int8Array(uniq*4);
  for(let v=0;v<V;v++){const w=remap[v];if(w===0xffffffff)continue;for(let j=0;j<4;j++){P2[w*4+j]=P[v*4+j];N2[w*4+j]=N[v*4+j];}}
  V=uniq;
  const ev=MeshoptEncoder.encodeVertexBuffer(new Uint8Array(P2.buffer),V,8),en=MeshoptEncoder.encodeVertexBuffer(new Uint8Array(N2.buffer),V,4),
        ei=MeshoptEncoder.encodeIndexBuffer(new Uint8Array(ib.buffer),ib.length,4);
  const b64=u=>Buffer.from(u).toString('base64');
  res[lod][k]={v:V,i:ib.length,P:b64(ev),N:b64(en),I:b64(ei)};total+=res[lod][k].P.length+res[lod][k].N.length+res[lod][k].I.length;
  console.log(lod,k,'тр.',ib.length/3,'вершин',V,'КБ',((res[lod][k].P.length+res[lod][k].N.length+res[lod][k].I.length)/1024).toFixed(0));}}
console.log('всего КБ',(total/1024).toFixed(0));
fs.writeFileSync(OUT,'const CAR_W17='+JSON.stringify(res)+';\n');
