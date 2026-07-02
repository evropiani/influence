"use strict";

const CONFIG = {
  COLS:440, ROWS:300, CELL:14,
  NODE_COUNT:200, NODE_SPACING:9,
  START_R:4,
  ROUND_SECONDS:300,
  SPAWN_SECONDS:10,
  START_INFLUENCE:120,
  INCOME_PER_NODE:2.2,
  INCOME_PER_CELL:0.01,
  TRICKLE:1.5,
  CAP_BASE:100, CAP_PER_NODE:40,
  ENEMY_BASE:2, DEF_MAX:8, DEF_RATE:0.6,
  CAPTURE_NEUTRAL:22, CAPTURE_ENEMY:55,
  SUPPLY_RANGE:22, SUPPLY_FALLOFF:6, SUPPLY_MAX:12,
  ENTRENCH_SHADE:0.38,
  BASE_COST:300, BASE_PENALTY:0.30,
  WALL_COST:20, WALL_HP:25,
  FARM_COST:400, FARM_PERIOD:15, FARM_YIELD:120, CAP_PER_FARM:40,
  OUTPOST_COST:300, OUTPOST_PERIOD:12, OUTPOST_SHOTS:40, OUTPOST_RADIUS:16,
  OUTPOST_BEACHHEAD:2, OUTPOST_ERODE:2, OUTPOST_SUPPLY:true,
  BOMBARD_COST:250, BOMBARD_RADIUS:6, BOMBARD_COOLDOWN:25,
  OBSTACLES:true, OBSTACLE_CLUSTERS:42, OBSTACLE_LEN_MIN:12, OBSTACLE_LEN_MAX:40,
  OBSTACLE_THICK_MIN:1, OBSTACLE_THICK_MAX:2.6, OBSTACLE_NODE_GAP:3, OBSTACLE_INTERVAL:16,
  ZONE_PHASES:5, ZONE_CALM:85, ZONE_WARN:20, ZONE_SHRINK:15, ZONE_FACTOR:0.62, ZONE_FINAL:60,
  DEFAULT_PCT:50,
  ZOOM_MIN:0.28, ZOOM_MAX:1.7, ZOOM_START:0.7, PAN_KEY_SPEED:760,
  BOT_SKILL:0.6,
};

// Bot behaviour profiles per difficulty. skill drives budget/aggression; build enables farms/outposts;
// delay is the seconds between a bot's moves (lower = faster/harder).
const DIFFS = {
  easy:   { skill:0.32, build:false, farmChance:0,    outChance:0,    maxFarms:0, delay:[1.8,2.8] },
  normal: { skill:0.60, build:true,  farmChance:0.10, outChance:0.05, maxFarms:2, delay:[1.2,2.0] },
  hard:   { skill:0.86, build:true,  farmChance:0.24, outChance:0.15, maxFarms:4, delay:[0.8,1.4] },
};
let botCfg = DIFFS.normal;

const PALETTE = [
  { name:"Clay",  rgb:[192,86,75] }, { name:"Teal",  rgb:[58,143,134] },
  { name:"Gold",  rgb:[201,162,75] }, { name:"Indigo",rgb:[85,102,166] },
  { name:"Sage",  rgb:[111,148,87] }, { name:"Plum",  rgb:[138,90,134] },
  { name:"Ochre", rgb:[207,122,63] }, { name:"Steel", rgb:[78,125,153] },
];
let VIEW_W=1000, VIEW_H=667;
const COLS=CONFIG.COLS, ROWS=CONFIG.ROWS, CELL=CONFIG.CELL, N=COLS*ROWS;
const WORLD_W=COLS*CELL, WORLD_H=ROWS*CELL;
const BG="#1c2029";
const ROCK=[70,77,94], ROCK_STR="rgb(70,77,94)", ROCK_TOP="rgb(90,98,116)";

const display=document.getElementById("game"), ctx=display.getContext("2d");
const stage=document.getElementById("stage");
function resize(){
  const r=stage.getBoundingClientRect();
  VIEW_W=Math.max(320, Math.round(r.width));
  VIEW_H=Math.max(240, Math.round(r.height));
  display.width=VIEW_W; display.height=VIEW_H;
  clampCam();
}
addEventListener("resize", resize);
addEventListener("orientationchange", ()=>setTimeout(resize,150));
const mm=document.getElementById("minimap"), mctx=mm.getContext("2d");
const mmImg=mctx.createImageData(mm.width, mm.height);
const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const owner=new Int16Array(N);
const cellNode=new Int32Array(N);
const stamp=new Int32Array(N);
const defense=new Float32Array(N);
let gen=0;

let players=[];
let nodes=[];
let playerColors=[];
let playerShades=[];
let cam={x:0,y:0,zoom:CONFIG.ZOOM_START};
let running=false, timeLeft=0, lastT=0;
let commitPct=CONFIG.DEFAULT_PCT;
let flashes=[];
let setupSel={color:0, opponents:3, custom:null, mode:"timed", difficulty:"normal"};
const keys=new Set();
let lastCursorCell=null;
const wall=new Uint8Array(N);
const blocked=new Uint8Array(N);
let builds=[];
const structAt=new Map();
let phase="over";
let spawnLeft=0, playStart=0, obstacleTimer=0, bombardCd=0;
let buildMode=null;
let gameMode="timed";
let teamSize=2;
let zone={state:"idle"};   // The Zone mode: calm -> warn (red ring) -> shrink -> ... -> final
let wallWarned=false;

const rand=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const rgbStr=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a==null?1:a})`;
const mix=(a,b,t)=>[Math.round(a[0]+(b[0]-a[0])*t),Math.round(a[1]+(b[1]-a[1])*t),Math.round(a[2]+(b[2]-a[2])*t)];
const hexToRgb=h=>{h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];};
const dispName=p=> p.tag ? `[${p.tag}] ${p.name}` : p.name;
const ENTRENCH_LEVELS=5;
const capOf=pl=>CONFIG.CAP_BASE + pl.nodeCount*CONFIG.CAP_PER_NODE + (pl.farmCount||0)*CONFIG.CAP_PER_FARM;
const enemyCost=idx=>CONFIG.ENEMY_BASE + Math.ceil(defense[idx]);
const sameTeam=(a,b)=> a>=0 && b>=0 && players[a].team===players[b].team;   // FFA gives each player their own team
function supplyPenalty(cx,cy,pIdx){
  let bd2=Infinity;
  for(const nd of nodes){ if(!(nd.owner===pIdx || sameTeam(nd.owner,pIdx))) continue; const dx=nd.cx-cx,dy=nd.cy-cy,d2=dx*dx+dy*dy; if(d2<bd2)bd2=d2; }
  if(CONFIG.OUTPOST_SUPPLY){ for(const b of builds){ if(!b.alive||b.type!=="outpost"||!(b.owner===pIdx||sameTeam(b.owner,pIdx))) continue; const dx=b.cx-cx,dy=b.cy-cy,d2=dx*dx+dy*dy; if(d2<bd2)bd2=d2; } }
  if(bd2===Infinity) return 0;
  const over=Math.sqrt(bd2)-CONFIG.SUPPLY_RANGE;
  return over<=0?0:Math.min(CONFIG.SUPPLY_MAX, Math.floor(over/CONFIG.SUPPLY_FALLOFF));
}

const heap=[];
function hpush(d2,idx){ const e=[d2,idx]; heap.push(e); let i=heap.length-1;
  while(i>0){ const p=(i-1)>>1; if(heap[p][0]<=heap[i][0])break; const t=heap[p];heap[p]=heap[i];heap[i]=t; i=p; } }
function hpop(){ const top=heap[0], last=heap.pop();
  if(heap.length){ heap[0]=last; let i=0, n=heap.length;
    for(;;){ let l=2*i+1,r=2*i+2,s=i; if(l<n&&heap[l][0]<heap[s][0])s=l; if(r<n&&heap[r][0]<heap[s][0])s=r;
      if(s===i)break; const t=heap[s];heap[s]=heap[i];heap[i]=t; i=s; } }
  return top; }

function seedCandidate(c,r,tx,ty,pIdx){
  if(c<0||r<0||c>=COLS||r>=ROWS) return;
  const ni=r*COLS+c;
  if(owner[ni]===pIdx || stamp[ni]===gen || blocked[ni]) return;
  stamp[ni]=gen;
  const dx=c-tx, dy=r-ty;
  hpush(dx*dx+dy*dy, ni);
}
function expandToward(pIdx, tx, ty, budgetCap){
  budgetCap=Math.floor(budgetCap);
  if(budgetCap<1) return 0;
  gen++; heap.length=0;
  for(let idx=0;idx<N;idx++){
    if(owner[idx]!==pIdx) continue;
    const c=idx%COLS, r=(idx/COLS)|0;
    seedCandidate(c-1,r,tx,ty,pIdx); seedCandidate(c+1,r,tx,ty,pIdx);
    seedCandidate(c,r-1,tx,ty,pIdx); seedCandidate(c,r+1,tx,ty,pIdx);
  }
  let budget=budgetCap, spent=0;
  while(heap.length && budget>=1){
    const idx=hpop()[1];
    if(owner[idx]===pIdx) continue;
    if(owner[idx]>=0 && sameTeam(owner[idx],pIdx)) continue;   // never take a teammate's land
    const c=idx%COLS, r=(idx/COLS)|0;
    const enemy = owner[idx]>=0;
    const wallHp = enemy ? wall[idx] : 0;                  // wall stores remaining durability
    let cost = (enemy ? enemyCost(idx) : 1) + supplyPenalty(c,r,pIdx) + wallHp;
    if(budget<cost){
      // Not enough to take a walled cell outright: the leftover chips the wall instead (cracks show).
      if(wallHp>0 && budget>=1){ const dmg=Math.min(Math.floor(budget),wallHp); wall[idx]-=dmg; budget-=dmg; spent+=dmg; }
      continue;
    }
    const prev=owner[idx];
    owner[idx]=pIdx; defense[idx]=0; if(wall[idx]) wall[idx]=0; budget-=cost; spent+=cost;
    players[pIdx].cells++; if(prev>=0) players[prev].cells--;
    const s=structAt.get(idx); if(s){ s.alive=false; structAt.delete(idx); if(s.type==="farm") players[s.owner].farmCount--; }
    const nIdx=cellNode[idx]; if(nIdx>=0) captureNode(nIdx,pIdx);
    seedCandidate(c-1,r,tx,ty,pIdx); seedCandidate(c+1,r,tx,ty,pIdx);
    seedCandidate(c,r-1,tx,ty,pIdx); seedCandidate(c,r+1,tx,ty,pIdx);
  }
  players[pIdx].influence -= spent;
  return spent;
}
function captureNode(nIdx, newOwner){
  const nd=nodes[nIdx], prev=nd.owner;
  if(prev===newOwner) return;
  const wasBase=nd.base;
  if(wasBase){ nd.base=false; if(prev>=0){ players[prev].hasBase=false; players[prev].baseIdx=-1; } if(prev===0) flash("Base lost — income −30%"); }
  nd.owner=newOwner;
  if(prev>=0) players[prev].nodeCount--;
  players[newOwner].nodeCount++;
  players[newOwner].influence += (prev>=0?CONFIG.CAPTURE_ENEMY:CONFIG.CAPTURE_NEUTRAL);
  if(!reduceMotion) flashes.push({cx:nd.cx, cy:nd.cy, t:0, rgb:players[newOwner].rgb, big:wasBase});
}
function makeBase(nIdx, pIdx){
  const pl=players[pIdx], nd=nodes[nIdx];
  if(pl.hasBase || nd.owner!==pIdx) return false;
  if(defense[nd.cy*COLS+nd.cx] < CONFIG.DEF_MAX) return false;
  if(pl.influence < CONFIG.BASE_COST) return false;
  pl.influence -= CONFIG.BASE_COST;
  nd.base=true; pl.hasBase=true; pl.baseIdx=nIdx;
  if(!reduceMotion) flashes.push({cx:nd.cx, cy:nd.cy, t:0, rgb:pl.rgb, big:true});
  return true;
}

function clearGrid(){ owner.fill(-1); cellNode.fill(-1); stamp.fill(0); defense.fill(0); wall.fill(0); blocked.fill(0); gen=0; nodes=[]; flashes=[]; builds=[]; structAt.clear(); }
function farFromNodes(cx,cy,minD){ for(const nd of nodes){ const dx=nd.cx-cx,dy=nd.cy-cy; if(dx*dx+dy*dy<minD*minD) return false; } return true; }
function scatterNeutralNodes(){
  let guard=0;
  while(nodes.filter(n=>n.owner<0).length < CONFIG.NODE_COUNT && guard < CONFIG.NODE_COUNT*80){
    guard++;
    const cx=(rand(3,COLS-3))|0, cy=(rand(3,ROWS-3))|0;
    if(owner[cy*COLS+cx]!==-1 || blocked[cy*COLS+cx]) continue;
    if(!farFromNodes(cx,cy,CONFIG.NODE_SPACING)) continue;
    nodes.push({cx,cy,owner:-1});
  }
}
// Impassable rock barriers: they block expansion (routes flow around them) and can't be owned,
// so players can't cheaply snipe straight across the map at a distant node or rival.
function stampObstacle(cx,cy,r){
  const rr=Math.max(1,r|0);
  for(let dr=-rr;dr<=rr;dr++) for(let dc=-rr;dc<=rr;dc++){
    if(dc*dc+dr*dr>rr*rr) continue;
    const c=cx+dc, ry=cy+dr;
    if(c<1||ry<1||c>=COLS-1||ry>=ROWS-1) continue;
    const i=ry*COLS+c;
    if(owner[i]!==-1 || blocked[i]) continue;                    // never overwrite claimed land or zone void
    if(cellNode[i]>=0) continue;                                 // never bury a node
    if(!farFromNodes(c,ry,CONFIG.OBSTACLE_NODE_GAP)) continue;   // keep nodes reachable
    blocked[i]=1;
  }
}
function drawBarrier(cx,cy){
  const len=(rand(CONFIG.OBSTACLE_LEN_MIN,CONFIG.OBSTACLE_LEN_MAX))|0;
  const thick=rand(CONFIG.OBSTACLE_THICK_MIN,CONFIG.OBSTACLE_THICK_MAX);
  let x=cx, y=cy, ang=rand(0,Math.PI*2);
  for(let s=0;s<len;s++){
    stampObstacle(Math.round(x),Math.round(y),Math.round(thick));
    if(Math.random()<0.25) ang+=rand(-0.6,0.6);                  // gentle wander so barriers curve
    x+=Math.cos(ang); y+=Math.sin(ang);
    if(x<2||y<2||x>=COLS-2||y>=ROWS-2) break;
  }
}
function scatterObstacles(){
  if(!CONFIG.OBSTACLES) return;
  for(let k=0;k<CONFIG.OBSTACLE_CLUSTERS;k++) drawBarrier(rand(6,COLS-6), rand(6,ROWS-6));
}
function spawnDynamicObstacle(){
  if(!CONFIG.OBSTACLES) return;
  for(let t=0;t<24;t++){
    const cx=(rand(6,COLS-6))|0, cy=(rand(6,ROWS-6))|0, i=cy*COLS+cx;
    if(owner[i]!==-1 || blocked[i] || cellNode[i]>=0) continue;  // only sprout on open ground
    if(!farFromNodes(cx,cy,CONFIG.OBSTACLE_NODE_GAP+1)) continue;
    drawBarrier(cx,cy);
    if(!reduceMotion) flashes.push({cx,cy,t:0,rgb:[130,138,155],big:true});
    return;
  }
}
// ---- The Zone mode ----------------------------------------------------------------------------
// blocked[i]===2 marks "zone void": mechanically identical to rock (impassable, unownable) but
// rendered as scorched dead ground. The playable area is a circle that periodically collapses
// toward a RANDOM point inside itself; whatever falls outside is crushed — land, walls,
// structures, and nodes (owners lose the node's cap and income, so hugging the edge is a gamble).
function voidOutside(c){
  const r2=c.r*c.r;
  for(let i=0;i<N;i++){
    if(blocked[i]===2) continue;
    const dx=i%COLS-c.cx, dy=((i/COLS)|0)-c.cy;
    if(dx*dx+dy*dy<=r2) continue;
    const prev=owner[i];
    if(prev>=0){ players[prev].cells--; owner[i]=-1; }
    wall[i]=0; defense[i]=0; blocked[i]=2;
    const s=structAt.get(i); if(s){ s.alive=false; structAt.delete(i); if(s.type==="farm") players[s.owner].farmCount--; }
    const ni=cellNode[i]; if(ni>=0){ crushNode(ni); cellNode[i]=-1; }
  }
}
function crushNode(ni){
  const nd=nodes[ni]; if(nd.dead) return;
  nd.dead=true;
  if(nd.owner>=0){ const p=players[nd.owner]; p.nodeCount--;
    if(nd.base){ nd.base=false; p.hasBase=false; p.baseIdx=-1; if(nd.owner===0) flash("Your base was crushed by the zone!"); } }
  nd.owner=-1;
}
function pickNextZone(){
  const nr=zone.cur.r*CONFIG.ZONE_FACTOR;
  const maxD=(zone.cur.r-nr)*0.85, a=rand(0,Math.PI*2), d=rand(0,maxD);
  zone.next={cx:zone.cur.cx+Math.cos(a)*d, cy:zone.cur.cy+Math.sin(a)*d, r:nr};
}
function stepZone(dt){
  zone.timer-=dt;
  if(zone.state==="calm"){
    if(zone.timer<=0){ pickNextZone(); zone.state="warn"; zone.timer=CONFIG.ZONE_WARN; flash("The zone is moving — 20s"); }
  } else if(zone.state==="warn"){
    if(zone.timer<=0){ zone.state="shrink"; zone.timer=CONFIG.ZONE_SHRINK; zone.from={...zone.cur}; flash("The zone is collapsing!"); }
  } else if(zone.state==="shrink"){
    const t=1-Math.max(0,zone.timer)/CONFIG.ZONE_SHRINK;
    zone.cur={ cx:zone.from.cx+(zone.next.cx-zone.from.cx)*t,
               cy:zone.from.cy+(zone.next.cy-zone.from.cy)*t,
               r: zone.from.r +(zone.next.r -zone.from.r )*t };
    voidOutside(zone.cur);
    if(zone.timer<=0){
      zone.cur={...zone.next}; zone.next=null; zone.phase++;
      if(zone.phase>=CONFIG.ZONE_PHASES){ zone.state="final"; zone.timer=CONFIG.ZONE_FINAL; flash("Final zone — most ground wins!"); }
      else { zone.state="calm"; zone.timer=CONFIG.ZONE_CALM; }
    }
  } else if(zone.state==="final"){
    if(zone.timer<=0){ endRound(topPlayer()); }
  }
}
function fillDisc(cx,cy,R,pIdx){
  for(let dr=-R;dr<=R;dr++) for(let dc=-R;dc<=R;dc++){
    if(dc*dc+dr*dr>R*R) continue;
    const c=cx+dc, r=cy+dr; if(c<0||r<0||c>=COLS||r>=ROWS) continue;
    const i=r*COLS+c; if(owner[i]!==-1||blocked[i]) continue;
    owner[i]=pIdx; players[pIdx].cells++;
  }
}
function computeColors(){
  playerColors=players.map(p=>rgbStr(p.rgb));
  playerShades=players.map(p=>{ const a=[]; for(let l=0;l<ENTRENCH_LEVELS;l++){ a.push(rgbStr(mix(p.rgb,[0,0,0],(l/(ENTRENCH_LEVELS-1))*CONFIG.ENTRENCH_SHADE))); } return a; });
}
function rebuildCellNode(){ cellNode.fill(-1); for(let i=0;i<nodes.length;i++){ const nd=nodes[i]; cellNode[nd.cy*COLS+nd.cx]=i; } }
function starPath(cx,cy,rO,rI,pts,rot){ ctx.beginPath();
  for(let i=0;i<pts*2;i++){ const rr=(i&1)?rI:rO, a=rot+i*Math.PI/pts, x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
  ctx.closePath(); }
function hslToRgb(h,s,l){ h=((h%360)+360)%360/360; const a=s*Math.min(l,1-l);
  const f=n=>{ const k=(n+h*12)%12; return Math.round(255*(l - a*Math.max(-1,Math.min(k-3,9-k,1)))); };
  return [f(0),f(8),f(4)]; }
function makeBotColors(count, usedPreset){
  const out=[];
  if(count<=PALETTE.length){
    const pool = usedPreset ? PALETTE.filter((_,i)=>i!==setupSel.color) : PALETTE.slice();
    for(let i=0;i<count;i++) out.push({name:pool[i].name, rgb:pool[i].rgb});
  } else {
    for(let i=0;i<count;i++){ const hue=(i*137.508+40)%360; out.push({name:"Bot "+(i+1), rgb:hslToRgb(hue,0.42,0.55)}); }
  }
  return out;
}
function paintWall(cx,cy){
  if(phase!=="play") return;
  if(cx<0||cy<0||cx>=COLS||cy>=ROWS) return;
  const idx=cy*COLS+cx;
  if(owner[idx]!==0 || wall[idx] || cellNode[idx]>=0 || structAt.has(idx)) return;
  if(players[0].influence < CONFIG.WALL_COST){ if(!wallWarned){ flash(`Need ${CONFIG.WALL_COST} influence`); wallWarned=true; } return; }
  wall[idx]=CONFIG.WALL_HP; players[0].influence -= CONFIG.WALL_COST;
}
function placeBuild(cx,cy,type){
  if(phase!=="play") return;
  if(cx<0||cy<0||cx>=COLS||cy>=ROWS){ flash("Place inside your territory"); return; }
  const idx=cy*COLS+cx;
  if(owner[idx]!==0){ flash("Must be your territory"); return; }
  if(cellNode[idx]>=0 || wall[idx] || structAt.has(idx)){ flash("That spot is occupied"); return; }
  const cost = type==="farm"?CONFIG.FARM_COST:CONFIG.OUTPOST_COST;
  if(players[0].influence < cost){ flash(`Need ${cost} influence`); return; }
  players[0].influence -= cost;
  const b={cx,cy,type,owner:0,acc:0,alive:true}; builds.push(b); structAt.set(idx,b);
  if(type==="farm") players[0].farmCount++;
  if(!reduceMotion) flashes.push({cx,cy,t:0,rgb:players[0].rgb,big:true});
  flash(type==="farm"?"Farm built · +"+CONFIG.FARM_YIELD+"/"+CONFIG.FARM_PERIOD+"s":"Outpost built · forward supply");
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0, t=a[i]; a[i]=a[j]; a[j]=t; } }
function outpostFire(b){
  const own=b.owner, R=CONFIG.OUTPOST_RADIUS, R2=R*R;
  const enemyCells=[], emptyCells=[];
  for(let dy=-R;dy<=R;dy++) for(let dx=-R;dx<=R;dx++){
    if(dx*dx+dy*dy>R2) continue;
    const cx=b.cx+dx, cy=b.cy+dy;
    if(cx<0||cy<0||cx>=COLS||cy>=ROWS) continue;
    const idx=cy*COLS+cx;
    if(blocked[idx]||cellNode[idx]>=0) continue;
    const prev=owner[idx];
    if(prev===own || (prev>=0 && sameTeam(prev,own))) continue;   // outposts spare teammates
    (prev>=0?enemyCells:emptyCells).push(idx);
  }
  shuffle(enemyCells); shuffle(emptyCells);
  const claim=idx=>{ const prev=owner[idx];
    owner[idx]=own; defense[idx]=CONFIG.OUTPOST_BEACHHEAD; if(wall[idx]) wall[idx]=0;
    if(prev>=0) players[prev].cells--; players[own].cells++;
    const s=structAt.get(idx); if(s){ s.alive=false; structAt.delete(idx); if(s.type==="farm") players[s.owner].farmCount--; } };
  let shots=CONFIG.OUTPOST_SHOTS, i=0;
  for(; i<enemyCells.length && shots>0; i++){ claim(enemyCells[i]); shots--; }   // eat into enemies first
  for(let j=0; j<emptyCells.length && shots>0; j++){ claim(emptyCells[j]); shots--; }
  for(; i<enemyCells.length; i++){ const idx=enemyCells[i]; if(defense[idx]>0) defense[idx]=Math.max(0,defense[idx]-CONFIG.OUTPOST_ERODE); } // soften the rest
  if(own===0 && !reduceMotion) flashes.push({cx:b.cx,cy:b.cy,t:0,rgb:players[0].rgb});
}
// Bombard: an aimed strike that blasts a neutral crater out of RIVAL territory within your supply
// reach — strips their cells, entrenchment and structures so you can pour into the gap. On cooldown.
function bombard(cx,cy,own){
  const R=CONFIG.BOMBARD_RADIUS, R2=R*R;
  for(let dy=-R;dy<=R;dy++) for(let dx=-R;dx<=R;dx++){
    if(dx*dx+dy*dy>R2) continue;
    const c=cx+dx, r=cy+dy; if(c<0||r<0||c>=COLS||r>=ROWS) continue;
    const idx=r*COLS+c;
    const prev=owner[idx];
    if(prev<0 || prev===own || blocked[idx] || cellNode[idx]>=0) continue;   // only rival land, spare nodes
    if(sameTeam(prev,own)) continue;                                          // bombs spare teammates
    owner[idx]=-1; defense[idx]=0; if(wall[idx]) wall[idx]=0;
    players[prev].cells--;
    const s=structAt.get(idx); if(s){ s.alive=false; structAt.delete(idx); if(s.type==="farm"&&players[s.owner]) players[s.owner].farmCount--; }
  }
  if(!reduceMotion){ flashes.push({cx,cy,t:0,rgb:[224,138,60],big:true}); flashes.push({cx,cy,t:0,rgb:[224,138,60]}); }
}
function tryBombard(cx,cy){
  if(phase!=="play") return;
  const me=players[0]; if(!me.alive) return;
  if(cx<0||cy<0||cx>=COLS||cy>=ROWS){ flash("Aim on the map"); return; }
  if(bombardCd>0){ flash(`Bomb recharging · ${Math.ceil(bombardCd)}s`); return; }
  if(me.influence<CONFIG.BOMBARD_COST){ flash(`Need ${CONFIG.BOMBARD_COST} influence`); return; }
  if(supplyPenalty(cx,cy,0)>0){ flash("Target out of supply range"); return; }
  me.influence-=CONFIG.BOMBARD_COST; bombardCd=CONFIG.BOMBARD_COOLDOWN;
  bombard(cx,cy,0); flash("Bombs away!");
}
function spawnCellFree(cx,cy){
  if(cx<0||cy<0||cx>=COLS||cy>=ROWS) return false;
  if(blocked[cy*COLS+cx]) return false;
  const md=CONFIG.START_R+1;
  for(const nd of nodes){ const dx=nd.cx-cx,dy=nd.cy-cy; if(dx*dx+dy*dy < md*md) return false; }
  return true;
}
function assignSpawns(){
  const margin=CONFIG.START_R+3;
  const spawns=[];
  const place=(sepv)=>{ spawns.length=0;
    for(let i=0;i<players.length;i++){ let ok=false;
      for(let t=0;t<500 && !ok;t++){
        const cx=(rand(margin,COLS-margin))|0, cy=(rand(margin,ROWS-margin))|0;
        if(!spawnCellFree(cx,cy)) continue;
        let good=true; for(const s of spawns){ const dx=s.cx-cx,dy=s.cy-cy; if(dx*dx+dy*dy<sepv*sepv){ good=false; break; } }
        if(good){ spawns.push({cx,cy}); ok=true; }
      }
      if(!ok) return false;
    }
    return true;
  };
  // Only enforce a minimum safe separation (starting discs shouldn't overlap) so spawns stay
  // genuinely scattered and vary between rounds, rather than being pushed maximally apart.
  const minSep=CONFIG.START_R*2+2;
  if(!place(minSep)) place(CONFIG.START_R*2);
  for(let i=0;i<players.length;i++) players[i]._spawn = spawns[i] || {cx:(rand(margin,COLS-margin))|0, cy:(rand(margin,ROWS-margin))|0};
}
function trySetSpawn(cx,cy){
  if(phase!=="spawn") return;
  if(cx<0||cy<0||cx>=COLS||cy>=ROWS){ flash("Pick a spot on the map"); return; }
  if(!spawnCellFree(cx,cy)){ flash("Too close to a node"); return; }
  const sep=CONFIG.START_R*2;
  for(let i=1;i<players.length;i++){ const s=players[i]._spawn; const dx=s.cx-cx,dy=s.cy-cy; if(dx*dx+dy*dy<sep*sep){ flash("Too close to another spawn"); return; } }
  players[0]._spawn={cx,cy}; players[0]._spawnSet=true; flash("Spawn set");
}
function beginPlay(){
  players.forEach(pl=>{ const s=pl._spawn; const bi=nodes.length;
    blocked[s.cy*COLS+s.cx]=0;                                    // never let a barrier sit on a base
    nodes.push({cx:s.cx,cy:s.cy,owner:pl.idx,base:true}); pl.nodeCount=1; pl.hasBase=true; pl.baseIdx=bi;
    fillDisc(s.cx,s.cy,CONFIG.START_R,pl.idx); });
  rebuildCellNode();
  phase="play"; playStart=performance.now(); lastT=performance.now();
  spawnHint.style.display="none"; setBuildMode(null); setBuildEnabled(true);
}
function newRound(){
  clearGrid();
  setBuildMode(null); setBuildEnabled(false);
  players.forEach(pl=>{ pl.cells=0; pl.nodeCount=0; pl.farmCount=0; pl.alive=true; pl.influence=CONFIG.START_INFLUENCE; pl._next=0; pl.hasBase=false; pl.baseIdx=-1; pl._spawnSet=false; });
  if(gameMode==="zone"){
    zone={state:"calm", phase:0, timer:CONFIG.ZONE_CALM, cur:{cx:COLS/2, cy:ROWS/2, r:Math.min(COLS,ROWS)/2-4}, next:null, from:null};
    voidOutside(zone.cur);                                   // circular battlefield from the start
  } else zone={state:"idle"};
  scatterNeutralNodes();
  rebuildCellNode();
  scatterObstacles();
  obstacleTimer=CONFIG.OBSTACLE_INTERVAL; bombardCd=0;
  assignSpawns();
  computeColors();
  const h=players[0]._spawn;
  cam.zoom=CONFIG.ZOOM_START;
  cam.x=(h.cx+0.5)*CELL - (VIEW_W/cam.zoom)/2;
  cam.y=(h.cy+0.5)*CELL - (VIEW_H/cam.zoom)/2;
  clampCam();
  timeLeft=CONFIG.ROUND_SECONDS;
  buildScoreboard();
  phase="spawn"; spawnLeft=CONFIG.SPAWN_SECONDS; running=true; lastT=performance.now();
  spawnHint.style.display="";
}

const botDelay=()=>{ const d=botCfg.delay; return (d[0]+Math.random()*(d[1]-d[0]))*1000; };
// Drop a farm or outpost on one of the bot's own cells. farm -> quiet interior; outpost -> a frontier
// cell touching non-owned ground, so it projects supply and pressure toward enemies.
function botPlaceBuild(pl, type, frontier){
  const cost = type==="farm"?CONFIG.FARM_COST:CONFIG.OUTPOST_COST;
  if(pl.influence<cost) return false;
  const anchors=nodes.filter(n=>n.owner===pl.idx);   // search near owned nodes, not the whole map
  if(!anchors.length) return false;
  for(let t=0;t<80;t++){
    const a=anchors[(Math.random()*anchors.length)|0];
    const c=a.cx+((rand(-7,7))|0), r=a.cy+((rand(-7,7))|0);
    if(c<0||r<0||c>=COLS||r>=ROWS) continue;
    const idx=r*COLS+c;
    if(owner[idx]!==pl.idx || cellNode[idx]>=0 || wall[idx] || blocked[idx] || structAt.has(idx)) continue;
    if(frontier){
      const touchesFront =
        (c>0        && owner[idx-1]!==pl.idx && !blocked[idx-1]) ||
        (c<COLS-1   && owner[idx+1]!==pl.idx && !blocked[idx+1]) ||
        (r>0        && owner[idx-COLS]!==pl.idx && !blocked[idx-COLS]) ||
        (r<ROWS-1   && owner[idx+COLS]!==pl.idx && !blocked[idx+COLS]);
      if(!touchesFront) continue;
    }
    pl.influence-=cost;
    const b={cx:c,cy:r,type,owner:pl.idx,acc:0,alive:true}; builds.push(b); structAt.set(idx,b);
    if(type==="farm") pl.farmCount++;
    return true;
  }
  return false;
}
function botTurn(pl, now){
  const skill=botCfg.skill;
  if(!pl.hasBase && pl.influence>=CONFIG.BASE_COST){
    for(let ni=0;ni<nodes.length;ni++){ const nd=nodes[ni];
      if(nd.owner===pl.idx && defense[nd.cy*COLS+nd.cx]>=CONFIG.DEF_MAX){ makeBase(ni,pl.idx); pl._next=now+botDelay(); return; } }
  }
  if(botCfg.build && pl.hasBase){
    if(pl.farmCount<botCfg.maxFarms && pl.influence>=CONFIG.FARM_COST*1.3 && Math.random()<botCfg.farmChance){
      if(botPlaceBuild(pl,"farm",false)){ pl._next=now+botDelay(); return; } }
    else if(pl.influence>=CONFIG.OUTPOST_COST*1.4 && Math.random()<botCfg.outChance){
      if(botPlaceBuild(pl,"outpost",true)){ pl._next=now+botDelay(); return; } }
  }
  let sx=0,sy=0,k=0; for(const nd of nodes) if(nd.owner===pl.idx){ sx+=nd.cx; sy+=nd.cy; k++; }
  if(k===0){ pl._next=now+1000; return; }
  sx/=k; sy/=k;
  // Nearest non-owned node; harder bots will press an enemy node when one is closest.
  let best=null, bd=Infinity;
  for(const nd of nodes){ if(nd.dead || nd.owner===pl.idx || sameTeam(nd.owner,pl.idx)) continue; const dx=nd.cx-sx,dy=nd.cy-sy,d=dx*dx+dy*dy; if(d<bd){bd=d;best=nd;} }
  const pct=0.4+skill*0.4;
  const budget=Math.ceil(pl.influence*pct);
  if(best && budget>=1) expandToward(pl.idx, best.cx, best.cy, budget);
  pl._next = now + botDelay();
}

function step(dt){
  for(let i=0;i<N;i++){ if(owner[i]>=0){ const d=defense[i]+CONFIG.DEF_RATE*dt; defense[i]=d>CONFIG.DEF_MAX?CONFIG.DEF_MAX:d; } }

  const now=performance.now();
  for(const pl of players){ if(!pl.isHuman && pl.alive && now>=pl._next) botTurn(pl,now); }

  for(const b of builds){ if(!b.alive) continue; b.acc+=dt;
    if(b.type==="farm"){ if(b.acc>=CONFIG.FARM_PERIOD){ b.acc-=CONFIG.FARM_PERIOD; players[b.owner].influence+=CONFIG.FARM_YIELD; if(!reduceMotion) flashes.push({cx:b.cx,cy:b.cy,t:0,rgb:players[b.owner].rgb}); } }
    else { if(b.acc>=CONFIG.OUTPOST_PERIOD){ b.acc-=CONFIG.OUTPOST_PERIOD; outpostFire(b); } } }

  if(CONFIG.OBSTACLES){ obstacleTimer-=dt; if(obstacleTimer<=0){ obstacleTimer=CONFIG.OBSTACLE_INTERVAL; spawnDynamicObstacle(); } }
  if(bombardCd>0) bombardCd=Math.max(0,bombardCd-dt);

  for(const pl of players){ if(!pl.alive) continue;
    let inc=pl.nodeCount*CONFIG.INCOME_PER_NODE + pl.cells*CONFIG.INCOME_PER_CELL + CONFIG.TRICKLE;
    if(!pl.hasBase) inc*=(1-CONFIG.BASE_PENALTY);
    const cap=capOf(pl);
    if(pl.influence<cap) pl.influence=Math.min(cap, pl.influence+inc*dt); }

  for(const pl of players){ if(pl.alive && pl.cells<=0) pl.alive=false; }

  const sp=CONFIG.PAN_KEY_SPEED*dt/cam.zoom;
  if(keys.has("w")||keys.has("arrowup")) cam.y-=sp;
  if(keys.has("s")||keys.has("arrowdown")) cam.y+=sp;
  if(keys.has("a")||keys.has("arrowleft")) cam.x-=sp;
  if(keys.has("d")||keys.has("arrowright")) cam.x+=sp;
  if(keys.size) clampCam();

  for(let i=flashes.length-1;i>=0;i--){ flashes[i].t+=dt; if(flashes[i].t>0.6) flashes.splice(i,1); }

  if(!players[0].alive){ endRound(topPlayer()); return; }
  if(gameMode==="team"){
    const t0=players.some(p=>p.team===0&&p.alive), t1=players.some(p=>p.team===1&&p.alive);
    if(!t0||!t1){ endRound(topTeamPlayer(t0?0:1)); return; }
  }
  const aliveP=players.filter(p=>p.alive);
  if(aliveP.length<=1){ endRound(aliveP[0]||null); return; }
  if(gameMode==="zone"){ stepZone(dt); if(phase==="over") return; }
  if(gameMode==="timed"||gameMode==="team"){ timeLeft-=dt; if(timeLeft<=0){ timeLeft=0; endRound(gameMode==="team"?topTeamPlayer(leadingTeam()):topPlayer()); } }
}
function topPlayer(){ let best=players[0]; for(const p of players) if(p.cells>best.cells) best=p; return best; }
const teamCells=t=>players.reduce((a,p)=>a+(p.team===t?p.cells:0),0);
const leadingTeam=()=>teamCells(0)>=teamCells(1)?0:1;
function topTeamPlayer(t){ let best=null; for(const p of players) if(p.team===t&&(!best||p.cells>best.cells)) best=p; return best||players[0]; }

function clampCam(){
  const vw=VIEW_W/cam.zoom, vh=VIEW_H/cam.zoom, m=240;
  cam.x = vw>=WORLD_W+2*m ? (WORLD_W-vw)/2 : clamp(cam.x,-m,WORLD_W-vw+m);
  cam.y = vh>=WORLD_H+2*m ? (WORLD_H-vh)/2 : clamp(cam.y,-m,WORLD_H-vh+m);
}

const pointers=new Map(); let pinchPrev=null;
function evScreen(e){ const r=display.getBoundingClientRect();
  return { sx:(e.clientX-r.left)*(VIEW_W/r.width), sy:(e.clientY-r.top)*(VIEW_H/r.height) }; }
function cellFromScreen(sx,sy){ const wx=cam.x+sx/cam.zoom, wy=cam.y+sy/cam.zoom;
  return { cx:Math.floor(wx/CELL), cy:Math.floor(wy/CELL) }; }

display.addEventListener("pointerdown", e=>{
  e.preventDefault(); display.setPointerCapture(e.pointerId);
  const {sx,sy}=evScreen(e);
  const p={sx0:sx,sy0:sy,x:sx,y:sy,camX:cam.x,camY:cam.y,moved:false,paint:false,ctrl:e.ctrlKey};
  pointers.set(e.pointerId,p);
  if(pointers.size>=2){ pinchPrev=null; for(const q of pointers.values()) q.paint=false; }
  else if(phase==="play" && (buildMode==="wall" || e.ctrlKey)){
    p.paint=true; wallWarned=false; const cc=cellFromScreen(sx,sy); paintWall(cc.cx,cc.cy);
  }
  display.classList.add("grabbing");
});
display.addEventListener("pointermove", e=>{
  const {sx,sy}=evScreen(e); const p=pointers.get(e.pointerId); if(p){ p.x=sx; p.y=sy; }
  lastCursorCell=cellFromScreen(sx,sy);
  if(pointers.size===1 && p){
    if(p.paint){ p.moved=true; const cc=cellFromScreen(sx,sy); paintWall(cc.cx,cc.cy); return; }
    const dx=p.x-p.sx0, dy=p.y-p.sy0;
    if(!p.moved && Math.hypot(dx,dy)>8) p.moved=true;
    if(p.moved){ cam.x=p.camX-dx/cam.zoom; cam.y=p.camY-dy/cam.zoom; clampCam(); }
  } else if(pointers.size===2){
    const a=[...pointers.values()];
    const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
    const mx=(a[0].x+a[1].x)/2, my=(a[0].y+a[1].y)/2;
    if(pinchPrev){
      const wx=cam.x+mx/cam.zoom, wy=cam.y+my/cam.zoom;
      cam.zoom=clamp(cam.zoom*(d/pinchPrev.d),CONFIG.ZOOM_MIN,CONFIG.ZOOM_MAX);
      cam.x=wx-mx/cam.zoom; cam.y=wy-my/cam.zoom;
      cam.x-=(mx-pinchPrev.mx)/cam.zoom; cam.y-=(my-pinchPrev.my)/cam.zoom;
      clampCam();
    }
    pinchPrev={d,mx,my};
  }
});
function endPointer(e){
  const wasSingle = pointers.size===1;
  const p=pointers.get(e.pointerId);
  if(p && wasSingle && !p.moved){
    const {cx,cy}=cellFromScreen(p.x,p.y);
    if(phase==="spawn"){ trySetSpawn(cx,cy); }
    else if(phase==="play" && !p.paint){
      const me=players[0];
      if(me.alive){
        if(buildMode==="farm"){ placeBuild(cx,cy,"farm"); }
        else if(buildMode==="outpost"){ placeBuild(cx,cy,"outpost"); }
        else if(buildMode==="bombard"){ tryBombard(cx,cy); }
        else {
          let handled=false;
          if(!me.hasBase && cx>=0&&cy>=0&&cx<COLS&&cy<ROWS){
            const ni=cellNode[cy*COLS+cx];
            if(ni>=0 && nodes[ni].owner===0 && defense[cy*COLS+cx]>=CONFIG.DEF_MAX){
              handled=true;
              if(me.influence>=CONFIG.BASE_COST){ makeBase(ni,0); flash("New base established"); }
              else flash(`Need ${CONFIG.BASE_COST} influence for a base`);
            }
          }
          if(!handled){
            const budget=Math.ceil(me.influence*commitPct/100);
            if(budget<1) flash("Not enough influence");
            else { const got=expandToward(0,cx,cy,budget); if(got===0) flash("Can't push there yet"); }
          }
        }
      }
    }
  }
  pointers.delete(e.pointerId);
  if(pointers.size<2) pinchPrev=null;
  if(pointers.size===0) display.classList.remove("grabbing");
}
display.addEventListener("pointerup", endPointer);
display.addEventListener("pointercancel", endPointer);
display.addEventListener("wheel", e=>{
  e.preventDefault(); const {sx,sy}=evScreen(e);
  const wx=cam.x+sx/cam.zoom, wy=cam.y+sy/cam.zoom;
  cam.zoom=clamp(cam.zoom*(e.deltaY<0?1.12:1/1.12),CONFIG.ZOOM_MIN,CONFIG.ZOOM_MAX);
  cam.x=wx-sx/cam.zoom; cam.y=wy-sy/cam.zoom; clampCam();
},{passive:false});
const HOTKEYS={ "1":"wall", "2":"farm", "3":"outpost", "4":"bombard" };
addEventListener("keydown", e=>{
  const t=e.target;
  if(t && t.tagName==="INPUT" && t.type!=="range") return;   // don't hijack typing in name/tag/number fields
  const k=e.key.toLowerCase();
  if(phase==="play" && !e.repeat && HOTKEYS[k]){ const m=HOTKEYS[k]; setBuildMode(buildMode===m?null:m); return; }
  keys.add(k);
});
addEventListener("keyup",   e=>{ keys.delete(e.key.toLowerCase()); });

function mmJump(e){ const r=mm.getBoundingClientRect();
  const wx=(e.clientX-r.left)/r.width*WORLD_W, wy=(e.clientY-r.top)/r.height*WORLD_H;
  cam.x=wx-(VIEW_W/cam.zoom)/2; cam.y=wy-(VIEW_H/cam.zoom)/2; clampCam(); }
mm.addEventListener("pointerdown", e=>{ e.preventDefault(); mm.setPointerCapture(e.pointerId); mmJump(e); });
mm.addEventListener("pointermove", e=>{ if(e.buttons||e.pressure>0) mmJump(e); });

function render(){
  ctx.fillStyle=BG; ctx.fillRect(0,0,VIEW_W,VIEW_H);

  const cw=CELL*cam.zoom;
  const c0=Math.max(0,Math.floor(cam.x/CELL)), r0=Math.max(0,Math.floor(cam.y/CELL));
  const c1=Math.min(COLS-1,Math.ceil((cam.x+VIEW_W/cam.zoom)/CELL));
  const r1=Math.min(ROWS-1,Math.ceil((cam.y+VIEW_H/cam.zoom)/CELL));
  const inset=cw*0.16, wsz=cw*0.68;
  for(let r=r0;r<=r1;r++){
    const base=r*COLS, sy=(r*CELL-cam.y)*cam.zoom;
    for(let c=c0;c<=c1;c++){
      const idx=base+c, ow=owner[idx];
      if(ow<0){
        if(blocked[idx]===1){
          const sx=(c*CELL-cam.x)*cam.zoom;
          ctx.fillStyle=ROCK_STR; ctx.fillRect(sx, sy, cw+1, cw+1);
          if(cw>=5){ ctx.fillStyle=ROCK_TOP; ctx.fillRect(sx, sy, cw+1, Math.max(1,cw*0.18)); } // top-light edge for a solid, blocky read
        } else if(blocked[idx]===2){
          const sx=(c*CELL-cam.x)*cam.zoom;
          ctx.fillStyle="rgb(24,14,17)"; ctx.fillRect(sx, sy, cw+1, cw+1);                      // zone void: scorched dead ground
        }
        continue;
      }
      const sx=(c*CELL-cam.x)*cam.zoom;
      const dfn=defense[idx];
      const lvl=dfn<=0?0:Math.min(ENTRENCH_LEVELS-1,(dfn/CONFIG.DEF_MAX*(ENTRENCH_LEVELS-1))|0);
      ctx.fillStyle=playerShades[ow][lvl];
      ctx.fillRect(sx, sy, cw+1, cw+1);
      if(wall[idx]){
        ctx.fillStyle="#cdd2db"; ctx.fillRect(sx+inset, sy+inset, wsz, wsz);
        ctx.fillStyle="rgba(20,24,32,0.5)"; ctx.fillRect(sx+inset, sy+cw*0.47, wsz, Math.max(1,cw*0.08));
        const dmg=1-wall[idx]/CONFIG.WALL_HP;
        if(dmg>0 && cw>=4){                                  // cracks appear as durability drops
          ctx.strokeStyle="rgba(20,24,32,0.85)"; ctx.lineWidth=Math.max(1,cw*0.07); ctx.beginPath();
          ctx.moveTo(sx+inset+wsz*0.15, sy+inset+wsz*0.1); ctx.lineTo(sx+inset+wsz*0.5, sy+inset+wsz*0.55);
          if(dmg>0.34){ ctx.moveTo(sx+inset+wsz*0.9, sy+inset+wsz*0.2); ctx.lineTo(sx+inset+wsz*0.45, sy+inset+wsz*0.7); }
          if(dmg>0.67){ ctx.moveTo(sx+inset+wsz*0.3, sy+inset+wsz*0.95); ctx.lineTo(sx+inset+wsz*0.6, sy+inset+wsz*0.45); }
          ctx.stroke();
        }
      }
    }
  }

  ctx.strokeStyle="rgba(255,255,255,0.12)"; ctx.lineWidth=1.5;
  ctx.strokeRect((0-cam.x)*cam.zoom,(0-cam.y)*cam.zoom, WORLD_W*cam.zoom, WORLD_H*cam.zoom);

  for(const f of flashes){
    const wx=(f.cx+0.5)*CELL, wy=(f.cy+0.5)*CELL;
    const rad=(CELL*(f.big?3:1.5) + f.t*CELL*(f.big?34:22))*cam.zoom;
    ctx.strokeStyle=rgbStr(f.rgb,0.55*(1-f.t/0.6)); ctx.lineWidth=f.big?3:2;
    ctx.beginPath(); ctx.arc((wx-cam.x)*cam.zoom,(wy-cam.y)*cam.zoom,rad,0,Math.PI*2); ctx.stroke();
  }

  const sg=Math.max(4,cw*0.5);
  for(const b of builds){ if(!b.alive) continue;
    const sx=((b.cx+0.5)*CELL-cam.x)*cam.zoom, sy=((b.cy+0.5)*CELL-cam.y)*cam.zoom;
    if(sx<-20||sy<-20||sx>VIEW_W+20||sy>VIEW_H+20) continue;
    if(b.type==="farm"){
      ctx.fillStyle="#79c05a"; ctx.fillRect(sx-sg,sy-sg,sg*2,sg*2);
      ctx.strokeStyle="rgba(255,255,255,0.92)"; ctx.lineWidth=2; ctx.strokeRect(sx-sg,sy-sg,sg*2,sg*2);
      ctx.strokeStyle="rgba(20,40,20,0.55)"; ctx.lineWidth=Math.max(1,sg*0.22);
      ctx.beginPath(); ctx.moveTo(sx-sg*0.5,sy-sg); ctx.lineTo(sx-sg*0.5,sy+sg); ctx.moveTo(sx+sg*0.5,sy-sg); ctx.lineTo(sx+sg*0.5,sy+sg); ctx.stroke();
    } else {
      ctx.fillStyle="#e08a3c"; ctx.beginPath();
      ctx.moveTo(sx,sy-sg*1.15); ctx.lineTo(sx+sg,sy+sg*0.8); ctx.lineTo(sx-sg,sy+sg*0.8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle="rgba(255,255,255,0.92)"; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle="rgba(255,255,255,0.92)"; ctx.beginPath(); ctx.arc(sx,sy+sg*0.15,sg*0.28,0,Math.PI*2); ctx.fill();
    }
  }

  const R=Math.max(4, cw*0.42);
  const noBase=players[0] && !players[0].hasBase && phase==="play";
  const tnow=performance.now();
  for(const nd of nodes){
    if(nd.dead) continue;
    const sx=((nd.cx+0.5)*CELL-cam.x)*cam.zoom, sy=((nd.cy+0.5)*CELL-cam.y)*cam.zoom;
    if(sx<-20||sy<-20||sx>VIEW_W+20||sy>VIEW_H+20) continue;
    if(nd.owner<0){
      ctx.strokeStyle="rgba(231,233,238,0.55)"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(sx,sy,R,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle="rgba(231,233,238,0.22)"; ctx.beginPath(); ctx.arc(sx,sy,R*0.42,0,Math.PI*2); ctx.fill();
    } else if(nd.base){
      starPath(sx,sy,R*1.7,R*0.72,5,-Math.PI/2);
      ctx.fillStyle=rgbStr(players[nd.owner].rgb); ctx.fill();
      ctx.strokeStyle="rgba(255,255,255,0.95)"; ctx.lineWidth=2.5; ctx.stroke();
      ctx.fillStyle="rgba(255,255,255,0.92)"; ctx.beginPath(); ctx.arc(sx,sy,R*0.3,0,Math.PI*2); ctx.fill();
    } else {
      ctx.fillStyle=rgbStr(players[nd.owner].rgb); ctx.beginPath(); ctx.arc(sx,sy,R,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="rgba(255,255,255,0.85)"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(sx,sy,R,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle="rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(sx,sy,R*0.34,0,Math.PI*2); ctx.fill();
    }
    if(noBase && nd.owner===0 && !nd.base && defense[nd.cy*COLS+nd.cx]>=CONFIG.DEF_MAX){
      const pulse=reduceMotion?1:(0.55+0.45*Math.sin(tnow*0.006));
      ctx.strokeStyle=rgbStr([231,233,238],0.9*pulse); ctx.lineWidth=2; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.arc(sx,sy,R*2.0,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  if(phase==="spawn"){
    for(let i=0;i<players.length;i++){ const s=players[i]._spawn; if(!s) continue;
      const sx=((s.cx+0.5)*CELL-cam.x)*cam.zoom, sy=((s.cy+0.5)*CELL-cam.y)*cam.zoom;
      if(sx<-30||sy<-30||sx>VIEW_W+30||sy>VIEW_H+30) continue;
      const col=players[i].rgb, rr=Math.max(5,cw*0.62);
      if(i===0){
        const pulse=reduceMotion?1:(0.6+0.4*Math.sin(tnow*0.006));
        ctx.strokeStyle=rgbStr(col,0.5); ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(sx,sy,CONFIG.START_R*CELL*cam.zoom,0,Math.PI*2); ctx.stroke();
        starPath(sx,sy,rr*1.5*pulse,rr*0.62*pulse,5,-Math.PI/2);
        ctx.fillStyle=rgbStr(col); ctx.fill();
        ctx.strokeStyle="#fff"; ctx.lineWidth=2.5; ctx.stroke();
      } else {
        ctx.fillStyle=rgbStr(col,0.9); ctx.beginPath(); ctx.arc(sx,sy,rr,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle="rgba(255,255,255,0.8)"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(sx,sy,rr,0,Math.PI*2); ctx.stroke();
      }
    }
  }

  if(gameMode==="zone" && zone.next && (zone.state==="warn"||zone.state==="shrink")){
    const pulse=reduceMotion?0.9:(0.65+0.35*Math.sin(tnow*0.008));
    const zx=(zone.next.cx*CELL-cam.x)*cam.zoom, zy=(zone.next.cy*CELL-cam.y)*cam.zoom;
    ctx.strokeStyle=`rgba(205,62,52,${pulse})`; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(zx,zy,zone.next.r*CELL*cam.zoom,0,Math.PI*2); ctx.stroke();
  }

  if(lastCursorCell && pointers.size===0){
    const {cx,cy}=lastCursorCell;
    if(cx>=0&&cy>=0&&cx<COLS&&cy<ROWS){
      if(buildMode==="bombard" && phase==="play"){
        const ok = bombardCd<=0 && players[0].influence>=CONFIG.BOMBARD_COST && supplyPenalty(cx,cy,0)<=0;
        const col = ok ? [224,138,60] : [192,86,75];
        const ccx=((cx+0.5)*CELL-cam.x)*cam.zoom, ccy=((cy+0.5)*CELL-cam.y)*cam.zoom;
        ctx.strokeStyle=rgbStr(col,0.9); ctx.lineWidth=2; ctx.setLineDash([6,5]);
        ctx.beginPath(); ctx.arc(ccx,ccy,CONFIG.BOMBARD_RADIUS*CELL*cam.zoom,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle=rgbStr(col,0.16); ctx.fill();
      }
      ctx.strokeStyle = buildMode ? rgbStr([207,122,63],0.85) : (phase==="spawn" ? rgbStr(players[0].rgb,0.8) : "rgba(231,233,238,0.5)");
      ctx.lineWidth=1.5;
      ctx.strokeRect((cx*CELL-cam.x)*cam.zoom,(cy*CELL-cam.y)*cam.zoom,cw,cw);
    }
  }

  drawMinimap();
}
function drawMinimap(){
  const d=mmImg.data;
  for(let my=0;my<mm.height;my++){
    const cy=Math.min(ROWS-1,(my/mm.height*ROWS)|0), row=cy*COLS;
    for(let mx=0;mx<mm.width;mx++){
      const cx=Math.min(COLS-1,(mx/mm.width*COLS)|0);
      const ci=row+cx, ow=owner[ci]; const col=ow<0?(blocked[ci]===2?[24,14,17]:blocked[ci]?ROCK:[36,42,54]):players[ow].rgb;
      const k=(my*mm.width+mx)*4; d[k]=col[0];d[k+1]=col[1];d[k+2]=col[2];d[k+3]=255;
    }
  }
  mctx.putImageData(mmImg,0,0);
  const scx=mm.width/WORLD_W, scy=mm.height/WORLD_H;
  if(gameMode==="zone" && zone.next && (zone.state==="warn"||zone.state==="shrink")){
    mctx.strokeStyle="rgba(215,70,58,0.95)"; mctx.lineWidth=1.5;
    mctx.beginPath(); mctx.ellipse(zone.next.cx*CELL*scx, zone.next.cy*CELL*scy, zone.next.r*CELL*scx, zone.next.r*CELL*scy, 0, 0, Math.PI*2); mctx.stroke();
  }
  mctx.strokeStyle="rgba(231,233,238,0.85)"; mctx.lineWidth=1;
  mctx.strokeRect(cam.x*scx, cam.y*scy, (VIEW_W/cam.zoom)*scx, (VIEW_H/cam.zoom)*scy);
}

let pills=[], compactSB=false, sbYou=null, sbAlive=null, sbTop=null;
function buildScoreboard(){
  const sb=document.getElementById("scoreboard"); sb.innerHTML="";
  compactSB = players.length>10;
  if(!compactSB){
    pills=players.map(pl=>{ const el=document.createElement("div"); el.className="pill";
      el.innerHTML=`<span class="chip" style="background:${rgbStr(pl.rgb)}"></span><span class="name">${escapeHTML(dispName(pl))}</span><span class="pct">0%</span>`;
      sb.appendChild(el); return {el, pct:el.querySelector(".pct")}; });
  } else {
    pills=[];
    const el=document.createElement("div"); el.className="sbc";
    el.innerHTML=`<span class="chip"></span><span class="sbk">You</span><span class="sbv" id="sbYou">0%</span><span class="sbsep">·</span><span class="sbk">Alive</span><span class="sbv" id="sbAlive">0</span><span class="sbsep">·</span><span class="sbk">Top</span><span class="sbv" id="sbTop">0%</span>`;
    sb.appendChild(el);
    el.querySelector(".chip").style.background=rgbStr(players[0].rgb);
    sbYou=el.querySelector("#sbYou"); sbAlive=el.querySelector("#sbAlive"); sbTop=el.querySelector("#sbTop");
  }
}
const clockEl=document.getElementById("clock"), infV=document.querySelector("#influence .v"),
      incV=document.getElementById("incomeV"), budgetV=document.getElementById("budgetV"),
      cellInfo=document.getElementById("cellInfo"), baseInfo=document.getElementById("baseInfo"),
      spawnHint=document.getElementById("spawnHint");
function drawClock(){
  if(gameMode==="zone"){ const s=Math.max(0,Math.ceil(zone.timer)), m=(s/60)|0, ss=s%60;
    clockEl.textContent=`${m}:${ss<10?"0":""}${ss}`; clockEl.classList.toggle("warn", zone.state==="warn"||zone.state==="shrink"); }
  else if(gameMode==="royale"){ const el=Math.max(0,(performance.now()-playStart)/1000), m=Math.floor(el/60), s=Math.floor(el%60);
    clockEl.textContent=`${m}:${s<10?"0":""}${s}`; clockEl.classList.remove("warn"); }
  else { const m=Math.floor(timeLeft/60), s=Math.floor(timeLeft%60);
    clockEl.textContent=`${m}:${s<10?"0":""}${s}`; clockEl.classList.toggle("warn",timeLeft<=20); }
}
function updateSpawnHUD(){
  const n=Math.ceil(spawnLeft);
  spawnHint.textContent = players[0]._spawnSet ? `Spawn set — starting in ${n}s (tap to move)` : `Choose your spawn — tap an empty spot · ${n}s`;
  infV.textContent=`${Math.floor(players[0].influence)}`;
  const m=Math.floor(spawnLeft/60), s=Math.floor(spawnLeft%60);
  clockEl.textContent=`${m}:${s<10?"0":""}${s}`; clockEl.classList.toggle("warn",spawnLeft<=3);
}
function updateHUD(){
  if(!compactSB){
    for(let i=0;i<players.length;i++){
      pills[i].pct.textContent=Math.round(players[i].cells/N*100)+"%";
      pills[i].el.classList.toggle("dead",!players[i].alive);
    }
  } else {
    let alive=0, top=0; for(const p of players){ if(p.alive)alive++; const pc=p.cells/N; if(pc>top)top=pc; }
    sbYou.textContent=Math.round(players[0].cells/N*100)+"%"; sbAlive.textContent=alive; sbTop.textContent=Math.round(top*100)+"%";
  }
  drawClock();
  const me=players[0];
  infV.textContent=`${Math.floor(me.influence)} / ${capOf(me)}`;
  let inc=me.nodeCount*CONFIG.INCOME_PER_NODE + me.cells*CONFIG.INCOME_PER_CELL + CONFIG.TRICKLE;
  if(!me.hasBase) inc*=(1-CONFIG.BASE_PENALTY);
  incV.textContent=inc.toFixed(1);
  budgetV.textContent=Math.ceil(me.influence*commitPct/100);
  bombBtn.textContent = bombardCd>0 ? `Bomb ${Math.ceil(bombardCd)}s` : `Bomb ${CONFIG.BOMBARD_COST}`;
  bombBtn.classList.toggle("cooling", bombardCd>0);
  if(me.hasBase){ baseInfo.className="ok"; }
  else {
    let eligible=false;
    for(const nd of nodes){ if(nd.owner===0 && !nd.base && defense[nd.cy*COLS+nd.cx]>=CONFIG.DEF_MAX){ eligible=true; break; } }
    baseInfo.className="";
    baseInfo.textContent = eligible ? `No base · tap a glowing node to rebuild (${CONFIG.BASE_COST})`
                                    : `No base · −30% income · entrench a node first`;
  }
  if(lastCursorCell){
    const {cx,cy}=lastCursorCell;
    if(cx>=0&&cy>=0&&cx<COLS&&cy<ROWS){
      const idx=cy*COLS+cx, ow=owner[idx], pen=supplyPenalty(cx,cy,0);
      if(blocked[idx]) cellInfo.textContent="barrier · impassable";
      else if(ow===0) cellInfo.textContent = wall[idx]?`your wall · ${wall[idx]}/${CONFIG.WALL_HP}`:"your land";
      else if(ow<0) cellInfo.textContent=`empty · ${1+pen}/cell`;
      else cellInfo.textContent=`enemy · ${enemyCost(idx)+wall[idx]+pen}/cell`;
    } else cellInfo.textContent="";
  }
}
function escapeHTML(s){ return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

let flashTimer=0; const flashEl=document.getElementById("flash");
function flash(msg){ flashEl.textContent=msg; flashEl.classList.add("show"); clearTimeout(flashTimer);
  flashTimer=setTimeout(()=>flashEl.classList.remove("show"),1400); }

const pctEl=document.getElementById("pct"), pctV=document.getElementById("pctV");
pctEl.addEventListener("input",()=>{ commitPct=+pctEl.value; pctV.textContent=commitPct+"%"; });

const overlay=document.getElementById("overlay"), oTitle=document.getElementById("otitle"),
      oSub=document.getElementById("osub"), oSetup=document.getElementById("setup"),
      oStandings=document.getElementById("standings"), oBtn=document.getElementById("obtn"),
      nameIn=document.getElementById("nameIn"), tagIn=document.getElementById("tagIn");
tagIn.addEventListener("input",()=>{ tagIn.value=tagIn.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,3); });
function buildSetup(){
  const sw=document.getElementById("swatches"); sw.innerHTML="";
  PALETTE.forEach((p,i)=>{ const b=document.createElement("button");
    b.className="sw"+(setupSel.custom==null && i===setupSel.color?" sel":""); b.style.background=rgbStr(p.rgb); b.title=p.name;
    b.setAttribute("aria-label","Colour "+p.name);
    b.onclick=()=>{ setupSel.color=i; setupSel.custom=null; [...sw.children].forEach(c=>c.classList.remove("sel")); b.classList.add("sel"); };
    sw.appendChild(b); });
  const cwrap=document.createElement("span"); cwrap.className="customwrap"+(setupSel.custom!=null?" sel":""); cwrap.title="Custom colour (hex)";
  const cust=document.createElement("input"); cust.type="color"; cust.className="sw"; cust.id="customSw";
  cust.value=setupSel.custom||"#d0876f"; cust.setAttribute("aria-label","Custom colour");
  cust.addEventListener("input",()=>{ setupSel.custom=cust.value; [...sw.children].forEach(c=>c.classList.remove("sel")); cwrap.classList.add("sel"); });
  const pen=document.createElement("span"); pen.className="pen"; pen.textContent="✎";
  cwrap.appendChild(cust); cwrap.appendChild(pen); sw.appendChild(cwrap);

  const op=document.getElementById("opps"); op.innerHTML="";
  const num=document.createElement("input"); num.type="number"; num.id="oppIn"; num.className="numin";
  num.min="1"; num.max="99"; num.step="1"; num.value=String(setupSel.opponents);
  num.disabled = setupSel.mode==="team2"||setupSel.mode==="team3";   // team sizes are fixed
  num.addEventListener("input",()=>{ let v=parseInt(num.value,10); if(isNaN(v))return; v=Math.max(1,Math.min(99,v)); setupSel.opponents=v; });
  num.addEventListener("blur",()=>{ let v=parseInt(num.value,10); if(isNaN(v))v=1; v=Math.max(1,Math.min(99,v)); setupSel.opponents=v; num.value=String(v); });
  op.appendChild(num);

  const df=document.getElementById("diff"); df.innerHTML="";
  [["easy","Easy"],["normal","Normal"],["hard","Hard"]].forEach(([val,lab])=>{ const b=document.createElement("button");
    b.className="seg"+(setupSel.difficulty===val?" sel":""); b.textContent=lab;
    b.onclick=()=>{ setupSel.difficulty=val; [...df.children].forEach(c=>c.classList.remove("sel")); b.classList.add("sel"); };
    df.appendChild(b); });

  const md=document.getElementById("mode"); md.innerHTML="";
  [["timed","Classic"],["royale","Battle royale"],["zone","The Zone"],["team2","2v2"],["team3","3v3"]].forEach(([val,lab])=>{ const b=document.createElement("button");
    b.className="seg"+(setupSel.mode===val?" sel":""); b.textContent=lab;
    b.onclick=()=>{ setupSel.mode=val; [...md.children].forEach(c=>c.classList.remove("sel")); b.classList.add("sel");
      num.disabled = val==="team2"||val==="team3"; };
    md.appendChild(b); });
}
function showSetup(){
  oTitle.textContent="Influence";
  oSub.innerHTML="Spend influence to claim land — it goes into cells one-for-one. Pick a spawn, then <b>tap toward where you want to grow</b>. Empty land is cheap; enemy land costs more the longer it's held. Capture <b>nodes</b> for income, guard your <b>base</b>, and spend influence on <b>walls, farms, outposts and bombs</b> from the bottom bar (keys <b>1–4</b>). Most ground when the clock runs out — or last one standing in battle royale.<div style=\"margin-top:12px\"><a class=\"howto\" href=\"index.html\">How to play</a></div>";
  oSetup.style.display=""; oStandings.innerHTML=""; oBtn.textContent="Start";
  overlay.classList.remove("hidden"); buildSetup();
}
function startFromSetup(){
  const sel=setupSel.mode||"timed";
  gameMode = (sel==="team2"||sel==="team3") ? "team" : sel;
  teamSize = sel==="team3" ? 3 : 2;
  botCfg=DIFFS[setupSel.difficulty]||DIFFS.normal;
  const usedPreset=setupSel.custom==null;
  const humanRgb = usedPreset ? PALETTE[setupSel.color].rgb : hexToRgb(setupSel.custom);
  const mkP=(idx,name,tag,rgb,isHuman,team)=>({idx, name, tag, rgb, isHuman, team,
    influence:0, alive:true, cells:0, nodeCount:0, farmCount:0, hasBase:false, baseIdx:-1, _next:0, _spawn:null, _spawnSet:false});
  players=[];
  if(gameMode==="team"){
    // Teammates share one colour; the enemy team gets the palette colour furthest from it.
    let eRgb=PALETTE[0].rgb, bd=-1;
    for(const p of PALETTE){ const d=(p.rgb[0]-humanRgb[0])**2+(p.rgb[1]-humanRgb[1])**2+(p.rgb[2]-humanRgb[2])**2; if(d>bd){bd=d;eRgb=p.rgb;} }
    players.push(mkP(0,(nameIn.value.trim()||"Player"),(tagIn.value||""),humanRgb,true,0));
    for(let i=1;i<teamSize;i++) players.push(mkP(i,"Ally "+i,"",humanRgb,false,0));
    for(let i=0;i<teamSize;i++) players.push(mkP(teamSize+i,"Enemy "+(i+1),"",eRgb,false,1));
  } else {
    const opp=Math.max(1,Math.min(99,setupSel.opponents||1));
    const botDefs=makeBotColors(opp, usedPreset);
    players.push(mkP(0,(nameIn.value.trim()||"Player"),(tagIn.value||""),humanRgb,true,0));
    for(let i=1;i<=opp;i++){ const d=botDefs[i-1]; players.push(mkP(i,d.name,"",d.rgb,false,i)); }
  }
  overlay.classList.add("hidden"); oSetup.style.display="none";
  commitPct=+pctEl.value;
  newRound();
}
const wallBtn=document.getElementById("wallBtn"), farmBtn=document.getElementById("farmBtn"), outBtn=document.getElementById("outBtn"), bombBtn=document.getElementById("bombBtn");
function setBuildMode(m){ buildMode=m;
  wallBtn.classList.toggle("on",m==="wall"); farmBtn.classList.toggle("on",m==="farm"); outBtn.classList.toggle("on",m==="outpost"); bombBtn.classList.toggle("on",m==="bombard"); }
function setBuildEnabled(on){ [wallBtn,farmBtn,outBtn,bombBtn].forEach(b=>{ b.disabled=!on; }); }
wallBtn.addEventListener("click",()=>setBuildMode(buildMode==="wall"?null:"wall"));
farmBtn.addEventListener("click",()=>setBuildMode(buildMode==="farm"?null:"farm"));
outBtn.addEventListener("click",()=>setBuildMode(buildMode==="outpost"?null:"outpost"));
bombBtn.addEventListener("click",()=>setBuildMode(buildMode==="bombard"?null:"bombard"));
function endRound(winner){
  running=false; phase="over"; spawnHint.style.display="none"; setBuildMode(null); setBuildEnabled(false);
  const ranked=[...players].sort((a,b)=>b.cells-a.cells);
  let teamRows="";
  if(gameMode==="team"){
    const myWin = winner && players[winner.idx].team===0 && players[0].alive;
    if(myWin){ oTitle.textContent="Your team wins"; oSub.textContent="Held the most ground together."; }
    else if(!players[0].alive){ oTitle.textContent="Eliminated"; oSub.textContent="All your territory was taken."; }
    else { oTitle.textContent = winner ? "Enemy team wins" : "Draw"; oSub.textContent="Better luck next round."; }
    const c0=teamCells(0), c1=teamCells(1);
    teamRows =
      `<div class="row"><span class="chip" style="background:${rgbStr(players[0].rgb)}"></span><span class="nm">Your team</span><span class="vv">${Math.round(c0/N*100)}%</span></div>`+
      `<div class="row"><span class="chip" style="background:${rgbStr(players[players.length-1].rgb)}"></span><span class="nm">Enemy team</span><span class="vv">${Math.round(c1/N*100)}%</span></div>`;
  }
  else if(winner&&winner.isHuman){ oTitle.textContent="You win";
    oSub.textContent = gameMode==="royale" ? "Last one standing."
                     : gameMode==="zone"   ? "You outlasted the zone."
                     : "Most ground held when the clock stopped."; }
  else if(!players[0].alive){ oTitle.textContent="Eliminated"; oSub.textContent = gameMode==="zone" ? "The zone got you." : "All your territory was taken."; }
  else { oTitle.textContent=(winner?dispName(winner)+" wins":"Draw"); oSub.textContent="Better luck next round."; }
  oSetup.style.display="none";
  const top=ranked.slice(0,20);
  oStandings.innerHTML=teamRows+top.map(p=>`<div class="row"><span class="chip" style="background:${rgbStr(p.rgb)}"></span><span class="nm">${escapeHTML(dispName(p))}</span><span class="vv">${Math.round(p.cells/N*100)}%</span></div>`).join("")
    + (ranked.length>20?`<div class="row"><span class="nm" style="opacity:.55">…and ${ranked.length-20} more</span></div>`:"");
  oBtn.textContent="Play again"; overlay.classList.remove("hidden");
}
oBtn.addEventListener("click",()=>{
  if(oSetup.style.display!=="none" && oBtn.textContent==="Start") startFromSetup();
  else { overlay.classList.add("hidden"); newRound(); }
});

function frame(now){
  if(phase==="spawn"){ let dt=(now-lastT)/1000; lastT=now; if(dt>0.25)dt=0.25; spawnLeft-=dt; if(spawnLeft<=0){ spawnLeft=0; beginPlay(); } else updateSpawnHUD(); }
  else if(phase==="play" && running){ let dt=(now-lastT)/1000; lastT=now; if(dt>0.1)dt=0.1; step(dt); updateHUD(); }
  render();
  requestAnimationFrame(frame);
}

players=[{idx:0,name:"Player",tag:"",rgb:PALETTE[0].rgb,isHuman:true,team:0,influence:0,alive:true,cells:0,nodeCount:0,farmCount:0,hasBase:false,baseIdx:-1,_next:0,_spawn:null,_spawnSet:false}];
clearGrid(); scatterNeutralNodes(); rebuildCellNode(); computeColors();
resize();
cam.x=WORLD_W/2-(VIEW_W/cam.zoom)/2; cam.y=WORLD_H/2-(VIEW_H/cam.zoom)/2; clampCam();
phase="over"; spawnHint.style.display="none"; setBuildEnabled(false);
buildScoreboard(); showSetup();
requestAnimationFrame(frame);
