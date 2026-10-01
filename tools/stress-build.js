#!/usr/bin/env node
/* ЗАМЕР ПОТОЛКА ОТРИСОВКИ НА УСТРОЙСТВЕ (10.2026).
   Собирает из index.html страницу tools/stress-test.html: та же игра, плюс сверху
   скрипт замера. Игра не меняется ни на байт — замер только оборачивает её функции.

   Что делает страница: по кнопке ставит гонку (Сильверстоун, Новичок, игрок последним
   на решётке, то есть всё поле перед камерой), ведёт болид автопилотом и по очереди
   доводит нагрузку: общее число вызовов отрисовки до 1700 (крошечные кубики, у каждого свой
   материал — как «новый цвет = вызов» в окружении) и лишние треугольники (один плотный
   шар). На каждой ступени 3 с привыкания и 15 с замера; в конце — таблица.

   Запуск: node tools/stress-build.js            -> tools/stress-test.html
           node tools/stress-build.js --artifact <путь>   -> вариант без <html>/<head>/<body>
                                                  (для публикации страницей claude.ai)
   Результаты замеров — docs/notes/performance.md. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(process.env.APEX_INDEX || path.join(ROOT, 'index.html'), 'utf8');

const STRESS = String.raw`
<style>
  #stz{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    background:rgba(11,14,19,.94);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));overflow-y:auto;
    -webkit-user-select:text;user-select:text;touch-action:pan-y;}
  #stz[hidden]{display:none!important;}
  #stz .box{width:100%;max-width:760px;display:flex;flex-direction:column;gap:12px;margin:auto;}
  #stz h1{margin:0;font-family:"Arial Narrow","Roboto Condensed",system-ui,sans-serif;font-weight:800;
    text-transform:uppercase;letter-spacing:.04em;font-size:26px;text-wrap:balance;}
  #stz .kick{font-size:11px;letter-spacing:.22em;color:var(--muted);text-transform:uppercase;}
  #stz p,#stz li{margin:0;font-size:14px;line-height:1.5;color:var(--text);max-width:66ch;}
  #stz ul{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:4px;}
  #stz .mut{color:var(--muted);}
  #stz button{appearance:none;border:0;border-radius:10px;padding:14px 22px;font-size:16px;font-weight:800;
    letter-spacing:.06em;text-transform:uppercase;background:var(--f1);color:#fff;cursor:pointer;align-self:flex-start;}
  #stz button.sec{background:var(--panel2);color:var(--text);border:1px solid var(--line);}
  #stz button:focus-visible{outline:2px solid var(--text);outline-offset:2px;}
  #stz .row{display:flex;gap:10px;flex-wrap:wrap;}
  #stz .tw{overflow-x:auto;border:1px solid var(--line);border-radius:8px;}
  #stz table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums;}
  #stz th,#stz td{padding:6px 9px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--line);}
  #stz th{color:var(--muted);font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase;}
  #stz td:first-child,#stz th:first-child{text-align:left;}
  #stz .pill{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:.04em;}
  #stz .ok{background:#123d22;color:#7fe0a0;} #stz .mid{background:#463a10;color:#f3d36b;} #stz .bad{background:#4a1515;color:#ff9a8f;}
  #stz pre{margin:0;font-size:11px;color:var(--muted);white-space:pre-wrap;word-break:break-word;}
  #stchip{position:fixed;z-index:9998;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 6px);
    background:rgba(11,14,19,.82);color:#EDEFF2;border:1px solid #2A313C;border-radius:99px;padding:4px 12px;
    font:600 12px system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums;pointer-events:none;white-space:nowrap;}
  #stchip[hidden]{display:none!important;}
</style>
<div id="stchip" hidden></div>
<div id="stz">
  <div class="box">
    <div class="kick">APEX '26 · замер на устройстве</div>
    <h1>Сколько вытянет это устройство</h1>
    <p>Страница сама проедет гонку на Сильверстоуне (вы стартуете последним, всё поле перед камерой)
       и будет ступенями доводить нагрузку: сначала вызовы отрисовки от 495 до 1700, потом лишние треугольники.
       Десять ступеней по 18 секунд, всего около 3,5 минут. В конце появится таблица.</p>
    <ul>
      <li>Зарядка больше 30 %, <b>режим энергосбережения выключен</b> — он режет игру до 30 кадров.</li>
      <li>Другие приложения закрыть, устройство держать <b>горизонтально</b>.</li>
      <li><b>Экран не трогать</b> до таблицы: болид ведёт автопилот, врезаться — нормально.</li>
      <li>Если экран гаснет сам — поставьте на время замера автоблокировку «Никогда».</li>
    </ul>
    <div class="row"><button id="stGo" type="button">Начать замер</button></div>
    <p class="mut">Сама игра в этой странице не изменена. Звук мотора будет — его можно убавить.</p>
  </div>
</div>
<script>
(function(){
  // calls — ОБЩЕЕ число вызовов в кадре, до которого кубики добирают игру. Прибавка (как было
  // в первой версии) плыла вместе с игрой: поле уезжало из кадра, и на iPhone «как в игре»
  // упало за замер с 447 до 172. tris — прибавка одним плотным шаром.
  const LEVELS=[
    {name:'495 (как в игре)',calls:495,tris:0},
    {name:'650 вызовов',calls:650,tris:0},
    {name:'800 вызовов',calls:800,tris:0},
    {name:'1000 вызовов',calls:1000,tris:0},
    {name:'1300 вызовов',calls:1300,tris:0},
    {name:'1700 вызовов',calls:1700,tris:0},
    {name:'495 + 200 тыс. треуг.',calls:495,tris:200000},
    {name:'495 + 500 тыс. треуг.',calls:495,tris:500000},
    {name:'495 + 1 млн треуг.',calls:495,tris:1000000},
    {name:'495, повтор',calls:495,tris:0}];
  const NBOX=1700;
  const SETTLE=3000, MEAS=15000, LEN=SETTLE+MEAS;
  const $=id=>document.getElementById(id), ov=$('stz'), chip=$('stchip');
  let stage='', stT=0, shown=0, lastCalls=0, lvl=-1, lvlT=0, rec=null, results=[], extra=null, boxes=[], blob=null, lastFrame=0, wake=null, hiddenSeen=false;

  // Автопилот — тот же, что у пробников (tools/harness.js): к осевой, тормоз по кривизне впереди.
  function drive(){
    const pr=project(player.x,player.z,player.hint),M=track.M;
    const ahead=Math.max(3,Math.round(3+player.speed*0.12)),tp=track.P[(pr.idx+ahead)%M];
    let dh=Math.atan2(tp.x-player.x,tp.z-player.z)-player.hdg;
    while(dh>Math.PI)dh-=2*Math.PI;while(dh<-Math.PI)dh+=2*Math.PI;
    const st=Math.max(-1,Math.min(1,-dh*2.4));
    controls.left=st<-0.12?1:0;controls.right=st>0.12?1:0;
    const ah=6+Math.round(player.speed*0.6);let kMax=0;
    for(let a=1;a<ah;a++){const k=Math.abs(track.K[(pr.idx+a)%M]);if(k>kMax)kMax=k;}
    const v=kMax<0.03?MAXSPEED*track.grip:Math.sqrt(DIFF_CORNERK[sel.diff]*24/kMax);
    if(player.speed>v+1){controls.gas=0;controls.brake=1;}
    else if(player.speed>v){controls.gas=0;controls.brake=0;}
    else{controls.gas=1;controls.brake=0;}
  }

  // Нагрузка. Кубики по 5 см в небе впереди камеры: на экране это точки, а для iPad —
  // полноценный вызов отрисовки каждый (свой материал, как «новый цвет» в окружении).
  function buildExtra(){
    extra=new THREE.Group();scene.add(extra);
    const g=new THREE.BoxGeometry(0.05,0.05,0.05);
    for(let i=0;i<NBOX;i++){
      const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({color:new THREE.Color().setHSL((i*0.618)%1,0.5,0.6)}));
      m.position.set(-6+(i%50)*0.24,5+Math.floor(i/50)*0.14,-30);m.visible=false;extra.add(m);boxes.push(m);}
  }
  function setBlob(tris){
    if(blob){extra.remove(blob);blob.geometry.dispose();blob.material.dispose();blob=null;}
    if(!tris)return;
    const w=1000,h=Math.max(2,Math.round(tris/(2*w))+1);   // шар: ~2*w*(h-1) треугольников
    blob=new THREE.Mesh(new THREE.SphereGeometry(0.8,w,h),new THREE.MeshLambertMaterial({color:0xdde3ea}));
    blob.position.set(4,6,-40);extra.add(blob);
  }
  function applyLevel(L){setBlob(L.tris);}
  // Каждый кадр: сколько вызовов дала сама игра в прошлом кадре — столько не хватает до цели.
  function topUp(){
    const L=LEVELS[lvl];if(!L)return;
    const game=lastCalls-shown-(blob?1:0);
    const want=Math.max(0,Math.min(NBOX,L.calls-game-(blob?1:0)));
    if(want!==shown){for(let i=Math.min(want,shown);i<Math.max(want,shown);i++)boxes[i].visible=i<want;shown=want;}
  }

  function median(a){if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length/2)];}
  function pct(a,p){if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(s.length*p))];}
  function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
  function finishLevel(){
    const L=LEVELS[lvl],iv=rec.iv,span=rec.last-rec.first;
    results.push({name:L.name,calls:Math.round(avg(rec.calls)),tris:Math.round(avg(rec.tris)),
      fps:span>0?(iv.length)/(span/1000):0,jank:iv.length?100*iv.filter(x=>x>25).length/iv.length:0,
      p95:pct(iv,0.95),gpuish:median(rec.rnd),frame:median(rec.upd),hidden:rec.hidden});
  }
  function nextLevel(now){
    if(lvl>=0)finishLevel();
    lvl++;
    if(lvl>=LEVELS.length){finish();return;}
    applyLevel(LEVELS[lvl]);lvlT=now;rec={iv:[],calls:[],tris:[],rnd:[],upd:[],first:0,last:0,hidden:false};
  }

  // Обёртки над функциями игры: сама игра не правится.
  const _update=update, _render=render;
  update=function(dt){
    if(stage==='run'&&phase==='race'&&lights.go)drive();
    const a=performance.now();_update(dt);
    if(stage==='run'&&rec&&a-lvlT>=SETTLE)rec.upd.push(performance.now()-a);
  };
  render=function(){
    if(extra){extra.position.copy(cam.position);extra.quaternion.copy(cam.quaternion);if(stage==='run')topUp();}
    const a=performance.now();_render();const b=performance.now();lastCalls=renderer.info.render.calls;
    if(stage!=='run')return;
    if(a-lvlT>=LEN){nextLevel(a);if(stage!=='run')return;}
    if(a-lvlT>=SETTLE&&rec){
      if(rec.first===0)rec.first=a;else rec.iv.push(a-lastFrame);
      rec.last=a;rec.rnd.push(b-a);
      rec.calls.push(renderer.info.render.calls);rec.tris.push(renderer.info.render.triangles);
      if(document.hidden||hiddenSeen){rec.hidden=true;hiddenSeen=false;}}
    lastFrame=a;
    const left=Math.max(0,Math.round((LEVELS.length*LEN-(a-stT))/1000));
    chip.textContent='Замер '+(lvl+1)+'/'+LEVELS.length+' · '+LEVELS[lvl].name+' · вызовов '+renderer.info.render.calls+
      ' · ещё '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0')+' · не трогайте экран';
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenSeen=true;});

  function poll(){
    if(stage==='quali'&&phase==='quali'&&typeof player!=='undefined'&&player&&performance.now()-stT>1200){
      beginQualiOutro();stage='qout';chip.textContent='Готовлю старт…';}
    else if(stage==='qout'&&$('s-quali').classList.contains('active')){startRace();stage='lights';chip.textContent='Огни…';}
    else if(stage==='lights'&&phase==='race'&&lights.go){
      buildExtra();stage='run';stT=performance.now();lvl=-1;nextLevel(stT);}
    if(stage&&stage!=='run'&&stage!=='done')setTimeout(poll,200);
  }

  function verdict(r){
    if(r.fps>=57&&r.jank<2)return '<span class="pill ok">плавно</span>';
    if(r.fps>=50&&r.jank<8)return '<span class="pill mid">заметно</span>';
    return '<span class="pill bad">рывки</span>';}
  function deviceLine(){
    let gpu='';try{const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
      gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}catch(e){}
    const c=renderer.domElement;
    return 'Экран '+c.width+'×'+c.height+' пикс. (×'+(window.devicePixelRatio||1)+'), '+(renderer.capabilities.isWebGL2?'WebGL2':'WebGL1')+', '+gpu+'\n'+navigator.userAgent;}
  function finish(){
    stage='done';chip.hidden=true;try{endLoop();}catch(e){}
    controls.left=controls.right=controls.gas=controls.brake=0;
    if(wake){try{wake.release();}catch(e){}wake=null;}
    const rows=results.map(r=>'<tr><td>'+r.name+(r.hidden?' *':'')+'</td><td>'+r.calls+'</td><td>'+(r.tris/1000).toFixed(0)+' тыс.</td><td>'+
      r.fps.toFixed(1)+'</td><td>'+r.jank.toFixed(1)+' %</td><td>'+r.p95.toFixed(1)+'</td><td>'+r.frame.toFixed(1)+'</td><td>'+r.gpuish.toFixed(1)+'</td><td>'+verdict(r)+'</td></tr>').join('');
    const txt=results.map(r=>[r.name,r.calls,r.tris,r.fps.toFixed(1),r.jank.toFixed(1),r.p95.toFixed(1),r.frame.toFixed(1),r.gpuish.toFixed(1)].join('\t')).join('\n')+'\n'+deviceLine();
    ov.innerHTML='<div class="box"><div class="kick">APEX \'26 · замер на устройстве</div><h1>Готово</h1>'+
      '<p><b>Сделайте снимок экрана этой таблицы и пришлите его мне.</b> Если таблица не влезает — два снимка или кнопка «Скопировать».</p>'+
      '<div class="tw"><table><thead><tr><th>Ступень</th><th>Вызовов</th><th>Треуг.</th><th>Кадр/с</th><th>Рывки</th><th>95 %, мс</th><th>Кадр, мс</th><th>Отрисовка, мс</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<p class="mut">Кадр/с — в среднем (предел экрана 60). Рывки — доля кадров дольше 25 мс. 95 % — 19 кадров из 20 не дольше этого. '+
      'Кадр, мс — сколько процессор тратит на кадр целиком (всё, что больше ~14 мс, грозит рывками). Отрисовка, мс — из них на раздачу поручений видеокарте. Safari округляет время до 1 мс; главное — кадр/с и рывки.'+
      (results.some(r=>r.hidden)?' * — на этой ступени страница уходила с экрана, число неточное.':'')+'</p>'+
      '<pre id="stTxt">'+deviceLine().replace(/</g,'&lt;')+'</pre>'+
      '<div class="row"><button id="stCopy" type="button" class="sec">Скопировать</button><button id="stAgain" type="button" class="sec">Ещё раз</button></div></div>';
    ov.hidden=false;
    $('stCopy').onclick=function(){const b=this;
      const ok=()=>{b.textContent='Скопировано';},fb=()=>{const s=window.getSelection(),r=document.createRange();r.selectNodeContents($('stTxt'));s.removeAllRanges();s.addRange(r);b.textContent='Выделено — скопируйте вручную';};
      try{navigator.clipboard.writeText(txt).then(ok,fb);}catch(e){fb();}};
    $('stAgain').onclick=()=>location.reload();
  }

  $('stGo').onclick=function(){
    ov.hidden=true;chip.hidden=false;chip.textContent='Строю трассу…';
    try{if(navigator.wakeLock)navigator.wakeLock.request('screen').then(w=>{wake=w;},()=>{});}catch(e){}
    sel.track=TRACKS.findIndex(t=>t.key==='Silverstone');sel.roster=0;selTeam=ROSTER[0].teamIdx;sel.custom='';sel.diff='easy';sel.laps=20;sel.view='cockpit';
    startWeekend();stage='quali';stT=performance.now();setTimeout(poll,200);
  };
})();
</script>
`;

let out = src.replace(/<title>[^<]*<\/title>/, '<title>Замер отрисовки APEX</title>');
const at = out.lastIndexOf('</body>');
if (at < 0) throw new Error('нет </body> в index.html');
out = out.slice(0, at) + STRESS + out.slice(at);

const ai = process.argv.indexOf('--artifact');
if (ai > 0) {
  // страница claude.ai сама оборачивает файл в <html><head><body> — свои теги убрать
  out = out.replace(/<!DOCTYPE html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/?head>\s*/gi, '')
           .replace(/<body[^>]*>/i, '').replace(/<\/body>\s*/i, '').replace(/<\/html>\s*$/i, '');
  fs.writeFileSync(process.argv[ai + 1], out);
  console.log('artifact ->', process.argv[ai + 1], out.length, 'bytes');
} else {
  const dst = path.join(__dirname, 'stress-test.html');
  fs.writeFileSync(dst, out);
  console.log('->', dst, out.length, 'bytes');
}
