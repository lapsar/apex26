import fs from 'fs';import {MeshoptEncoder} from 'meshoptimizer';
await MeshoptEncoder.ready;
const D=JSON.parse(fs.readFileSync(process.argv[2]));
for(const name in D){let raw=0,enc=0,tri=0,vtx=0;
 for(const k in D[name]){const {p,n}=D[name][k];const nv=p.length/3,map=new Map(),P=[],N=[],I=[];
  for(let i=0;i<nv;i++){const q=[0,1,2].map(j=>Math.round(p[i*3+j]*10000)),r=[0,1,2].map(j=>Math.round(n[i*3+j]*127));const key=q.join()+'|'+r.join();
   let id=map.get(key);if(id===undefined){id=P.length/4;map.set(key,id);P.push(...q,0);N.push(...r,0);}I.push(id);}
  const V=P.length/4;let pb=new Int16Array(P),nb=new Int8Array(N);let ib=new Uint32Array(I);
  {const [remap,uniq]=MeshoptEncoder.reorderMesh(ib,true,true);const P2=new Int16Array(uniq*4),N2=new Int8Array(uniq*4);
   for(let v=0;v<V;v++){const w=remap[v];if(w===0xffffffff)continue;for(let j=0;j<4;j++){P2[w*4+j]=pb[v*4+j];N2[w*4+j]=nb[v*4+j];}}
   pb.set(P2.subarray(0,Math.min(P2.length,pb.length)));nb.set(N2.subarray(0,Math.min(N2.length,nb.length)));}
  raw+=pb.byteLength+nb.byteLength+(V<65536?2:4)*I.length;
  const ev=MeshoptEncoder.encodeVertexBuffer(new Uint8Array(pb.buffer),V,8),en=MeshoptEncoder.encodeVertexBuffer(new Uint8Array(nb.buffer),V,4),ei=MeshoptEncoder.encodeIndexBuffer(new Uint8Array(ib.buffer),I.length,4);
  enc+=ev.length+en.length+ei.length;tri+=I.length/3;vtx+=V;}
 const b64=x=>Math.ceil(x/3)*4;
 console.log(name,'тр.',tri,'вершин',vtx,'без сжатия',(b64(raw)/1024).toFixed(0)+' КБ','со сжатием',(b64(enc)/1024).toFixed(0)+' КБ');}
