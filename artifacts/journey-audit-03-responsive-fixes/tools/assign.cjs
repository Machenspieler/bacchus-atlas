const fs=require('fs'),path=require('path');const {start,sleep,OUT}=require('./lib3.cjs');
const V=fs.readFileSync(path.join(OUT,'state','exported-state-more-environments.json'),'utf8');
(async()=>{const k=await start(1280,720);const {p,A}=k;await k.freshAt(1280,720,V);const [cx,cy]=await k.pos('center');await k.putCell('57,-3',1.0,cx-100,cy);await k.clickHex('57,-3',900);
const body=()=>A(()=>document.querySelector('[data-j2-i="hexEnvBody"]').textContent.replace(/\s+/g,' ').trim().slice(0,70));
const before=await body();await p.click('[data-j2-hexenv="change"]');await sleep(700);
const btns=await A(()=>Array.from(document.querySelectorAll('.j2-hexenv-list button')).map(b=>b.textContent.trim().slice(0,30)+'|'+(b.closest('li,div')||{}).textContent.slice(0,30)));
// scroll list to bottom then outer to bottom via wheel handoff, then click the 3rd row's assign button
const t=await A(()=>{const b=document.querySelectorAll('.j2-hexenv-list button')[2];b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,name:b.closest('li,div').textContent.slice(0,40)};});
await p.mouse.click(t.x,t.y);await sleep(600);
const out={before,btns:btns.slice(0,4),clicked:t.name,after:await body(),log:k.consoleLines};
fs.writeFileSync(path.join(OUT,'logs','f3-assign.json'),JSON.stringify(out,null,1));console.log(JSON.stringify(out));await k.close();})();
