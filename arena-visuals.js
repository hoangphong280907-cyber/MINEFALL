/* MINEFALL Arena Visuals v1
 * Procedural 2D material renderer and lightweight Canvas particle system.
 * No external runtime dependencies. Shared by offline and online match board.
 */
(function attachArenaVisuals(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MinefallArenaVisuals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildArenaVisuals() {
  'use strict';

  const THEMES = Object.freeze({
    'arena-standard': { label: 'Standard', detail: 'metal', base: ['#43545f','#202c35'], reveal: ['#d4d9d5','#9aa7a5'], zone: ['#8cc5ae','#477d69'], accent: '#9fb7c0', gap: '#10191f', ambient: 'dust' },
    'arena-lava': { label: 'Lava', detail: 'crack', base: ['#56332e','#211619'], reveal: ['#d8b8a9','#8c6258'], zone: ['#bd7652','#713c32'], accent: '#ff8b42', gap: '#180d10', ambient: 'ember' },
    'arena-neon': { label: 'Neon', detail: 'circuit', base: ['#252b62','#10162f'], reveal: ['#c8d2ed','#899ac9'], zone: ['#6566b7','#35336c'], accent: '#7a8cff', gap: '#090d20', ambient: 'spark' },
    'arena-frost': { label: 'Frost', detail: 'ice', base: ['#6897a8','#24465b'], reveal: ['#e7f7f9','#9fc6d3'], zone: ['#a6e2e8','#5e9fb3'], accent: '#c4f7ff', gap: '#102938', ambient: 'snow' },
    'arena-forest': { label: 'Forest', detail: 'moss', base: ['#465e4a','#1e3028'], reveal: ['#d0ddc7','#98b49a'], zone: ['#8ab99a','#46795d'], accent: '#9bd58b', gap: '#101e18', ambient: 'spore' },
    'arena-sunset': { label: 'Sunset', detail: 'strata', base: ['#74505a','#352a3b'], reveal: ['#f0d4c3','#c19a9d'], zone: ['#c88b78','#80556a'], accent: '#ffb07d', gap: '#211821', ambient: 'dust' },
    'arena-ocean': { label: 'Ocean', detail: 'caustic', base: ['#326779','#102c40'], reveal: ['#cbe5e7','#8db9c5'], zone: ['#61b5b9','#2d6c7c'], accent: '#82edf0', gap: '#071c2b', ambient: 'bubble' },
    'arena-toxic': { label: 'Toxic', detail: 'corrode', base: ['#596447','#263526'], reveal: ['#dce5bd','#a4b58a'], zone: ['#a4c45e','#597d3e'], accent: '#c8ef57', gap: '#141d14', ambient: 'bubble' },
    'arena-void': { label: 'Void', detail: 'rift', base: ['#51426e','#21182f'], reveal: ['#d9cde9','#a397c4'], zone: ['#957fc0','#57447f'], accent: '#b991ff', gap: '#120d1e', ambient: 'star' },
    'arena-sand': { label: 'Sand', detail: 'strata', base: ['#887653','#463a2a'], reveal: ['#eee1bf','#c8b78e'], zone: ['#d7bd7b','#92754a'], accent: '#efd18c', gap: '#282116', ambient: 'dust' },
    'arena-rose': { label: 'Rose', detail: 'petal', base: ['#79546d','#38263c'], reveal: ['#ecd7e3','#c09db8'], zone: ['#d49ab8','#875d89'], accent: '#ffc0df', gap: '#211522', ambient: 'petal' },
    'arena-cyber': { label: 'Cyber', detail: 'circuit', base: ['#28616b','#102631'], reveal: ['#cce7e5','#91bdc1'], zone: ['#56a6a1','#2d686d'], accent: '#61f2e3', gap: '#081820', ambient: 'spark' }
  });

  const EFFECT_COLORS = Object.freeze({
    standard: ['#fff0b0','#ffc65f','#ff754e','#b84a38'],
    stone: ['#e7e3d7','#a7a79f','#777d7b','#c8c4b7'],
    fire: ['#fff3a6','#ffb43d','#ff682f','#d93625'],
    ice: ['#f5ffff','#a9efff','#63c8f4','#8faeff'],
    toxic: ['#eeff9a','#b8ed55','#62cc6c','#d4ff86'],
    lightning: ['#ffffff','#fff18a','#8be9ff','#a5a5ff'],
    void: ['#f2dcff','#b38cff','#7856d8','#34214f'],
    pixel: ['#75ffd3','#70e8ff','#ff83dc','#ffe579'],
    cosmic: ['#ffffff','#c3b8ff','#85eaff','#f2a8ff'],
    confetti: ['#ff7b9c','#ffd166','#71e7d0','#b69cff'],
    plasma: ['#f7c9ff','#ca86ff','#7f84ff','#8efff6'],
    fireworks: ['#fff18b','#ff79c6','#77eaff','#f5f7ff'],
    coins: ['#fff0a6','#ffd34e','#c58c21','#fff7d1'],
    royal: ['#fff2a6','#ffd34e','#b87b1a','#ffffff'],
    prism: ['#ff647c','#ffbd59','#5cf0a5','#55d8ff','#b98bff'],
    tombstone: ['#f3e5c5','#c3b8a0','#87929b','#f8f2df'],
    stone: ['#f1e7d0','#b5b9b6','#7c858b','#d7ddd8'],
    rocket: ['#fff2a6','#ff9c4a','#ff5a48','#87eaff'],
    freeze: ['#f5ffff','#b6f1ff','#6fc7f5','#d7d0ff'],
    burst: ['#ffffff','#fff0a1','#8beaff','#ff9fd7'],
    flames: ['#fff2a6','#ffbd4a','#ff713c','#e63d4f'],
    dust: ['#d9c49a','#b8a17d','#f2dfb8'],
    ember: ['#ffdd8b','#ff873d','#ff513b'],
    frost: ['#efffff','#9defff','#6fc2ee'],
    neon: ['#6afff2','#8ba5ff','#d78cff'],
    shadow: ['#b6a3d9','#78649e','#45355c'],
    rainbow: ['#ff8a9b','#ffcf69','#7ce7d5','#9aa6ff'],
    sakura: ['#ffd3e5','#f49dc5','#d9a5ff'],
    circuit: ['#fff48a','#65fff0','#76bfff'],
    leaf: ['#c6ed9a','#81c989','#b0a86d']
  });

  const TRAIL_EFFECTS = Object.freeze(['dust','ember','frost','neon','shadow','rainbow','sakura','circuit','leaf','cosmic']);
  const ELIMINATION_EFFECTS = Object.freeze(['standard','tombstone','void','stone','pixel','rocket','freeze','lightning','shadow','burst']);
  const ACTION_FEEDBACK = Object.freeze(['step','dig','flag','unflag','reveal']);

  const instances = new WeakMap();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const coarsePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const mix = (a, b, amount) => a + (b - a) * amount;
  const hash = value => {
    let h = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const randomAt = (seed, offset = 0) => {
    let x = (seed + Math.imul(offset + 1, 0x9e3779b1)) >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };

  function resolveTheme(id) {
    const key = Object.prototype.hasOwnProperty.call(THEMES, id) ? id : 'arena-standard';
    return { id: key, ...THEMES[key] };
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawCrack(ctx, x, y, width, height, seed, color, glow) {
    const sx = x + width * (0.2 + randomAt(seed, 1) * 0.6);
    const sy = y + height * (0.15 + randomAt(seed, 2) * 0.7);
    const points = [[sx, sy]];
    let px = sx, py = sy;
    const count = 3 + Math.floor(randomAt(seed, 3) * 3);
    for (let i = 0; i < count; i++) {
      px = clamp(px + (randomAt(seed, 10 + i) - 0.5) * width * 0.58, x + 2, x + width - 2);
      py = clamp(py + (randomAt(seed, 20 + i) - 0.5) * height * 0.58, y + 2, y + height - 2);
      points.push([px, py]);
    }
    for (let pass = 0; pass < (glow ? 2 : 1); pass++) {
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]));
      ctx.strokeStyle = pass === 0 ? color : glow;
      ctx.lineWidth = pass === 0 ? 1.05 : 2.8;
      ctx.globalAlpha = pass === 0 ? 0.55 : 0.18;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawMaterial(ctx, x, y, w, h, theme, seed, time, isRevealed) {
    const alpha = isRevealed ? 0.34 : 0.82;
    ctx.save();
    ctx.globalAlpha = alpha;

    if (theme.detail === 'metal') {
      ctx.strokeStyle = '#d5e6ed'; ctx.globalAlpha *= 0.22; ctx.lineWidth = 0.6;
      ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
      for (const [ox, oy] of [[4,4],[w-4,4],[4,h-4],[w-4,h-4]]) {
        ctx.beginPath(); ctx.arc(x + ox, y + oy, 1.05, 0, Math.PI * 2);
        ctx.fillStyle = '#d9e4e8'; ctx.fill();
        ctx.beginPath(); ctx.arc(x + ox, y + oy, 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#26343d'; ctx.fill();
      }
      ctx.globalAlpha = alpha * 0.12;
      ctx.beginPath(); ctx.moveTo(x + 5, y + h * .32); ctx.lineTo(x + w - 5, y + h * .32); ctx.stroke();
    } else if (theme.detail === 'crack') {
      drawCrack(ctx, x, y, w, h, seed, '#130d10', '#ff7c32');
      if (randomAt(seed, 50) > 0.48) drawCrack(ctx, x + 2, y + 2, w - 4, h - 4, seed + 41, '#201014', '#ffb04a');
      const glow = ctx.createRadialGradient(x + w * .5, y + h * .5, 1, x + w * .5, y + h * .5, Math.max(w,h) * .48);
      glow.addColorStop(0, 'rgba(255,105,34,' + (0.10 + 0.035 * Math.sin(time / 700 + seed)) + ')');
      glow.addColorStop(1, 'rgba(255,105,34,0)');
      ctx.fillStyle = glow; ctx.globalAlpha = .44; roundedRect(ctx,x+1,y+1,w-2,h-2,2);ctx.fill();
    } else if (theme.detail === 'circuit') {
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.accent;
      ctx.globalAlpha = .24 + .08 * Math.sin(time / 500 + seed);
      const edge = 4 + randomAt(seed, 5) * 5;
      ctx.beginPath(); ctx.moveTo(x + edge, y + 4); ctx.lineTo(x + edge, y + h * .38); ctx.lineTo(x + w * .58, y + h * .38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w - 4, y + h * .72); ctx.lineTo(x + w * .62, y + h * .72); ctx.lineTo(x + w * .62, y + h - 4); ctx.stroke();
      for (const [cx,cy] of [[x+edge,y+4],[x+w*.58,y+h*.38],[x+w*.62,y+h*.72]]) {
        ctx.beginPath();ctx.arc(cx,cy,1.35,0,Math.PI*2);ctx.fillStyle=theme.accent;ctx.fill();
      }
    } else if (theme.detail === 'ice') {
      ctx.strokeStyle = '#e6ffff'; ctx.lineWidth = .7; ctx.globalAlpha = .3;
      drawCrack(ctx,x+2,y+2,w-4,h-4,seed,'#d6fbff',null);
      ctx.beginPath();ctx.moveTo(x+w*.18,y+h*.2);ctx.lineTo(x+w*.48,y+h*.08);ctx.lineTo(x+w*.77,y+h*.26);ctx.lineTo(x+w*.88,y+h*.58);ctx.stroke();
      ctx.globalAlpha = .13;ctx.fillStyle = '#ffffff';ctx.beginPath();ctx.moveTo(x+4,y+4);ctx.lineTo(x+w*.56,y+4);ctx.lineTo(x+4,y+h*.46);ctx.closePath();ctx.fill();
    } else if (theme.detail === 'moss') {
      for (let i=0;i<3;i++) {
        const mx=x+4+randomAt(seed,30+i)*Math.max(1,w-10), my=y+4+randomAt(seed,40+i)*Math.max(1,h-10);
        ctx.beginPath();ctx.ellipse(mx,my,2+randomAt(seed,50+i)*4,1.5+randomAt(seed,60+i)*2,randomAt(seed,70+i)*3,0,Math.PI*2);
        ctx.fillStyle=i%2?'#b1c786':'#244b35';ctx.globalAlpha=alpha*.34;ctx.fill();
      }
      ctx.globalAlpha=alpha*.22;ctx.strokeStyle='#17281d';ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(x+w*.12,y+h*.76);ctx.quadraticCurveTo(x+w*.4,y+h*.48,x+w*.8,y+h*.62);ctx.stroke();
    } else if (theme.detail === 'strata') {
      ctx.strokeStyle = theme.accent;ctx.lineWidth=.65;ctx.globalAlpha=.25;
      for(let i=0;i<3;i++){
        const yy=y+h*(.24+i*.22)+randomAt(seed,80+i)*3;
        ctx.beginPath();ctx.moveTo(x+3,yy);ctx.bezierCurveTo(x+w*.28,yy-3,x+w*.62,yy+3,x+w-3,yy-1);ctx.stroke();
      }
    } else if (theme.detail === 'caustic') {
      ctx.strokeStyle='#a9f9ee';ctx.lineWidth=.8;ctx.globalAlpha=.22+.08*Math.sin(time/900+seed);
      for(let i=0;i<2;i++){
        const cx=x+w*(.28+i*.42), cy=y+h*(.35+(i%2)*.3);
        ctx.beginPath();ctx.ellipse(cx,cy,w*.18,h*.10,randomAt(seed,90+i),0,Math.PI*1.75);ctx.stroke();
      }
    } else if (theme.detail === 'corrode') {
      for(let i=0;i<4;i++){
        const cx=x+randomAt(seed,100+i)*w,cy=y+randomAt(seed,110+i)*h,r=1+randomAt(seed,120+i)*3;
        ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle=i%2?'#15271a':'#c5d66a';ctx.globalAlpha=.13;ctx.fill();
      }
      ctx.globalAlpha=.24;ctx.strokeStyle='#1e2d1b';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x+4,y+h*.7);ctx.lineTo(x+w*.35,y+h*.52);ctx.lineTo(x+w*.7,y+h*.68);ctx.stroke();
    } else if (theme.detail === 'rift') {
      drawCrack(ctx,x,y,w,h,seed,'#171222','#b58cff');
      ctx.globalAlpha=.42;ctx.fillStyle='#eadbff';
      for(let i=0;i<2;i++){const sx=x+randomAt(seed,130+i)*w,sy=y+randomAt(seed,140+i)*h;ctx.fillRect(sx,sy,1.1,1.1);}
    } else if (theme.detail === 'petal') {
      ctx.strokeStyle='#ffd6e9';ctx.lineWidth=.7;ctx.globalAlpha=.2;
      const cx=x+w*(.25+randomAt(seed,150)*.5),cy=y+h*(.25+randomAt(seed,160)*.5);
      for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(cx,cy,2+i*1.8,1+i*.8,i*.9,0,Math.PI*1.7);ctx.stroke();}
    }

    ctx.globalAlpha=.085;ctx.strokeStyle='#f5fbff';ctx.lineWidth=.42;
    ctx.beginPath();ctx.moveTo(x+4,y+h-3.2);ctx.lineTo(x+w*.34,y+h-3.2);ctx.moveTo(x+w-4,y+3.2);ctx.lineTo(x+w-w*.34,y+3.2);ctx.stroke();
    ctx.globalAlpha=.16;ctx.fillStyle='#ffffff';
    for(let i=0;i<6;i++){const dx=2+randomAt(seed,180+i)*(w-4),dy=2+randomAt(seed,190+i)*(h-4);ctx.fillRect(x+dx,y+dy,.65,.65);}
    ctx.globalAlpha=.10;ctx.fillStyle='#07131a';
    for(let i=0;i<3;i++){const dx=3+randomAt(seed,210+i)*(w-6),dy=3+randomAt(seed,220+i)*(h-6);ctx.fillRect(x+dx,y+dy,1.2,.55);}
    ctx.restore();
  }

  function drawSurface(instance, time) {
    const ctx = instance.surfaceContext;
    const metrics = instance.metrics;
    if (!ctx || !metrics || !metrics.width || !metrics.height) return;
    const theme = resolveTheme(instance.theme);
    const cells = instance.cells || [];
    const size = instance.size;
    ctx.clearRect(0,0,metrics.width,metrics.height);
    ctx.fillStyle = theme.gap;ctx.fillRect(0,0,metrics.width,metrics.height);

    for(let i=0;i<size*size;i++){
      const cell=cells[i]||{};
      const row=Math.floor(i/size),col=i%size;
      const x=col*(metrics.cellWidth+metrics.gapX),y=row*(metrics.cellHeight+metrics.gapY);
      const exploded=!!cell.exploded;
      const zone=!!cell.zone;
      const revealed=!!(cell.revealed||cell.endRevealed);
      let colors=exploded?['#9e3e43','#351b24']:zone?theme.zone:revealed?theme.reveal:theme.base;
      const gradient=ctx.createLinearGradient(x,y,x+metrics.cellWidth,y+metrics.cellHeight);
      gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]);
      roundedRect(ctx,x+.25,y+.25,metrics.cellWidth-.5,metrics.cellHeight-.5,2.3);
      ctx.fillStyle=gradient;ctx.fill();
      ctx.strokeStyle=exploded?'#ff8e83':zone?theme.accent:'rgba(235,248,255,.14)';
      ctx.lineWidth=exploded?1.25:.55;ctx.stroke();
      if(!exploded) drawMaterial(ctx,x+1,y+1,metrics.cellWidth-2,metrics.cellHeight-2,theme,hash(theme.id+':'+i),time,revealed);
      if(cell.selected){ctx.strokeStyle='#ffd178';ctx.lineWidth=2;roundedRect(ctx,x+1,y+1,metrics.cellWidth-2,metrics.cellHeight-2,2);ctx.stroke();}
      if(cell.exploded){
        const glow=ctx.createRadialGradient(x+metrics.cellWidth/2,y+metrics.cellHeight/2,1,x+metrics.cellWidth/2,y+metrics.cellHeight/2,metrics.cellWidth*.9);
        glow.addColorStop(0,'rgba(255,235,180,.55)');glow.addColorStop(1,'rgba(255,70,70,0)');
        ctx.fillStyle=glow;ctx.fill();
      }
    }
  }

  function effectKind(effect) {
    const map={fire:'ember',ice:'shard',toxic:'bubble',lightning:'bolt',void:'orb',pixel:'pixel',cosmic:'star',confetti:'confetti',plasma:'orb',standard:'spark',dust:'dust',ember:'ember',frost:'shard',neon:'orb',shadow:'smoke',rainbow:'star',sakura:'petal',circuit:'bolt',leaf:'leaf',tombstone:'shard',stone:'shard',rocket:'ember',freeze:'shard',burst:'star',flames:'ember',fireworks:'star',coins:'spark',royal:'star',prism:'star'};
    return map[effect]||'spark';
  }

  function drawMotionStreak(ctx,streak) {
    const progress=clamp(streak.age/streak.life,0,1),fade=Math.pow(1-progress,.82);
    const x1=streak.x1,y1=streak.y1,x2=streak.x2,y2=streak.y2,dx=x2-x1,dy=y2-y1,len=Math.max(1,Math.hypot(dx,dy));
    const nx=-dy/len,ny=dx/len,cell=streak.cellSize||len*.7,size=Math.max(3,cell*.13);
    const colors=streak.colors||EFFECT_COLORS[streak.effect]||EFFECT_COLORS.dust,effect=streak.effect||'dust';
    const point=(t,offset=0,bend=0)=>({x:x1+dx*t+nx*(offset+Math.sin(Math.PI*t)*bend),y:y1+dy*t+ny*(offset+Math.sin(Math.PI*t)*bend)});
    const curve=(offset,bend,color,width,glow,alpha)=>{
      const a=point(0,offset,bend),c=point(.5,offset,bend*1.28),b=point(1,offset,bend);
      ctx.save();ctx.globalAlpha=alpha*fade;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=glow;ctx.shadowColor=color;
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(c.x,c.y,b.x,b.y);ctx.stroke();ctx.restore();
    };
    const glowDot=(x,y,r,color,alpha=1)=>{ctx.save();ctx.globalAlpha=alpha*fade;ctx.fillStyle=color;ctx.shadowBlur=r*3;ctx.shadowColor=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();};
    const diamond=(x,y,r,color,rotation=0)=>{ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.globalAlpha=.9*fade;ctx.fillStyle=color;ctx.shadowBlur=r*2.4;ctx.shadowColor=color;ctx.beginPath();ctx.moveTo(0,-r*1.55);ctx.lineTo(r*.58,0);ctx.lineTo(0,r*1.55);ctx.lineTo(-r*.58,0);ctx.closePath();ctx.fill();ctx.restore();};
    const leaf=(x,y,r,color,rotation)=>{ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.globalAlpha=.9*fade;ctx.fillStyle=color;ctx.shadowBlur=r*1.7;ctx.shadowColor=color;ctx.beginPath();ctx.moveTo(0,-r*1.45);ctx.quadraticCurveTo(r*1.25,-r*.55,0,r*1.45);ctx.quadraticCurveTo(-r*1.25,-r*.55,0,-r*1.45);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=Math.max(.5,r*.12);ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(0,r);ctx.stroke();ctx.restore();};
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    switch(effect){
      case 'dust':{
        for(let i=0;i<7;i++){const t=((i/7)+progress*.22)%1,p=point(t,(randomAt(streak.seed||1,i)-.5)*size*2,(i%2?1:-1)*size*.55),r=size*(.28+randomAt(streak.seed||1,i+20)*.48);glowDot(p.x,p.y,r,colors[i%colors.length],.82);}
        const tip=point(progress);glowDot(tip.x,tip.y,size*.72,colors[0],.72);
        for(let i=0;i<3;i++){const p=point((i+.5)/3);diamond(p.x,p.y,size*.38,colors[(i+1)%colors.length],progress*2+i);}break;
      }
      case 'ember':{
        curve(0,size*.34,colors[1]||colors[0],size*.46,size*2.2,.46);curve(0,size*.12,colors[0],size*.16,size*2.8,.95);
        for(let i=0;i<4;i++){const p=point((i+1)/5,(i%2?1:-1)*size*.26,size*.28);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-Math.atan2(dy,dx)+Math.PI/2+(i%2?.45:-.35));ctx.globalAlpha=fade*(.82-i*.1);ctx.fillStyle=colors[i%colors.length];ctx.shadowBlur=size*1.8;ctx.shadowColor=colors[0];ctx.beginPath();ctx.moveTo(0,-size*1.25);ctx.quadraticCurveTo(size*.8,-size*.15,0,size*.75);ctx.quadraticCurveTo(-size*.65,-size*.1,0,-size*1.25);ctx.fill();ctx.restore();}break;
      }
      case 'frost':{
        curve(0,0,colors[0],size*.13,size*1.5,.68);
        for(let i=0;i<4;i++){const p=point(.14+i*.23,(i%2?1:-1)*size*.22,size*.2);diamond(p.x,p.y,size*(.72+(i%2)*.18),colors[i%colors.length],Math.atan2(dy,dx)+progress*1.4+i);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(progress*1.2);ctx.strokeStyle='#fff';ctx.globalAlpha=.76*fade;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-size*.75,0);ctx.lineTo(size*.75,0);ctx.moveTo(0,-size*.75);ctx.lineTo(0,size*.75);ctx.stroke();ctx.restore();}
        const tip=point(1);ctx.save();ctx.globalAlpha=.75*fade;ctx.strokeStyle=colors[1]||colors[0];ctx.lineWidth=1.1;ctx.beginPath();ctx.arc(tip.x,tip.y,size*1.05,progress*2,Math.PI*1.7+progress*2);ctx.stroke();ctx.restore();break;
      }
      case 'neon':{
        curve(-size*.28,size*.38,colors[0],size*.16,size*2.8,.92);curve(size*.28,-size*.38,colors[1]||colors[0],size*.13,size*2.6,.88);
        const pulse=point(progress),a=point(.18,-size*.28,size*.38),b=point(.82,size*.28,-size*.38);glowDot(pulse.x,pulse.y,size*.64,colors[2]||colors[0],1);glowDot(a.x,a.y,size*.25,colors[1]||colors[0],.8);glowDot(b.x,b.y,size*.25,colors[0],.8);break;
      }
      case 'shadow':{
        curve(0,size*.22,colors[2]||colors[0],size*.34,size*2.1,.38);
        for(let i=0;i<3;i++){const p=point(.18+i*.28,(i-1)*size*.18,size*.28);ctx.save();ctx.translate(p.x,p.y);ctx.scale(.72+i*.09,.72+i*.09);ctx.globalAlpha=fade*(.58-i*.1);ctx.fillStyle=colors[i%colors.length];ctx.shadowBlur=size*1.9;ctx.shadowColor=colors[1]||colors[0];ctx.beginPath();ctx.arc(0,-size*.36,size*.28,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-size*.34,-size*.04);ctx.quadraticCurveTo(-size*.6,size*.58,0,size*.48);ctx.quadraticCurveTo(size*.6,size*.58,size*.34,-size*.04);ctx.closePath();ctx.fill();ctx.restore();}break;
      }
      case 'rainbow':{
        const rainbow=['#ff657e','#ffb94f','#f7ef6d','#70e59c','#5ddcf3','#9d91ff'];
        for(let i=0;i<rainbow.length;i++)curve((i-2.5)*size*.105,Math.sin(i*1.2)*size*.34,rainbow[i],size*.095,size*.8,.9);
        const p=point(progress);glowDot(p.x,p.y,size*.48,'#fff',.9);break;
      }
      case 'sakura':{
        curve(0,size*.28,colors[0],size*.1,size*.9,.24);
        for(let i=0;i<5;i++){const p=point((i/5+progress*.12)%1,Math.sin(i*2+progress*5)*size*.5,size*.42);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(progress*5+i*1.7);ctx.globalAlpha=fade*(.9-i*.08);ctx.fillStyle=colors[i%colors.length];ctx.shadowBlur=size*.9;ctx.shadowColor=colors[0];ctx.beginPath();ctx.ellipse(0,0,size*.32,size*.72,.25,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff0f7';ctx.lineWidth=.45;ctx.beginPath();ctx.moveTo(0,-size*.48);ctx.lineTo(0,size*.48);ctx.stroke();ctx.restore();}break;
      }
      case 'circuit':{
        const pts=[point(0),point(.22,size*.3),point(.42,-size*.34),point(.64,size*.28),point(.82,-size*.22),point(1)];
        ctx.save();ctx.globalAlpha=.96*fade;ctx.strokeStyle=colors[0];ctx.lineWidth=size*.13;ctx.shadowBlur=size*2.2;ctx.shadowColor=colors[1]||colors[0];ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.restore();
        for(let i=1;i<pts.length-1;i++)glowDot(pts[i].x,pts[i].y,size*.2,colors[i%colors.length],1);const tip=point(progress);glowDot(tip.x,tip.y,size*.5,'#fff',.95);break;
      }
      case 'leaf':{
        for(let i=0;i<5;i++){const p=point((i/5+progress*.16)%1,Math.sin(i*1.8+progress*4)*size*.54,size*.48);leaf(p.x,p.y,size*(.58+(i%2)*.18),colors[i%colors.length],Math.atan2(dy,dx)+i*1.3+progress*3);}break;
      }
      case 'cosmic':{
        curve(0,size*.48,colors[1]||colors[0],size*.07,size*.9,.58);
        for(let i=0;i<5;i++){const p=point(.12+i*.18,(i%2?1:-1)*size*.42,size*.42),r=size*(.22+(i%3)*.09);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(progress*1.8+i);ctx.globalAlpha=fade;ctx.strokeStyle=colors[i%colors.length];ctx.fillStyle=colors[i%colors.length];ctx.lineWidth=.8;ctx.shadowBlur=size*1.7;ctx.shadowColor=colors[i%colors.length];ctx.beginPath();ctx.moveTo(0,-r*1.7);ctx.lineTo(r*.35,-r*.35);ctx.lineTo(r*1.7,0);ctx.lineTo(r*.35,r*.35);ctx.lineTo(0,r*1.7);ctx.lineTo(-r*.35,r*.35);ctx.lineTo(-r*1.7,0);ctx.lineTo(-r*.35,-r*.35);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.arc(0,0,r*.2,0,Math.PI*2);ctx.fill();ctx.restore();}break;
      }
      default:curve(0,0,colors[0],size*.13,size,.8);
    }
    ctx.restore();
  }

  function drawEliminationEcho(ctx,mark) {
    const progress=clamp(mark.age/mark.life,0,1),fade=1-progress,cell=mark.cellSize||24,s=cell*1.08;
    const effect=mark.effect||'standard',colors=mark.colors||EFFECT_COLORS[effect]||EFFECT_COLORS.standard,pulse=.5+.5*Math.sin(mark.age*23);
    ctx.save();ctx.translate(mark.x,mark.y);
    // A central impact veil hides the mine sprite beneath the elimination choreography.
    if(progress<.72){
      const veil=ctx.createRadialGradient(0,0,cell*.035,0,0,s*(.92+progress*.34));
      veil.addColorStop(0,'rgba(5,11,17,.96)');
      veil.addColorStop(.38,'rgba(7,14,20,.86)');
      veil.addColorStop(.72,'rgba(7,14,20,.34)');
      veil.addColorStop(1,'rgba(7,14,20,0)');
      ctx.globalAlpha=(1-progress/.72)*.94;
      ctx.fillStyle=veil;ctx.beginPath();ctx.arc(0,0,s*(.92+progress*.34),0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=(1-progress/.72)*.42;ctx.strokeStyle=mark.color||colors[0];ctx.lineWidth=Math.max(1,cell*.055);
      ctx.shadowBlur=cell*.5;ctx.shadowColor=mark.color||colors[0];
      ctx.beginPath();ctx.arc(0,0,s*(.28+progress*.62),0,Math.PI*2);ctx.stroke();
    }
    if(progress<.3){ctx.globalAlpha=(1-progress/.3)*.74;ctx.strokeStyle=mark.color||'#fff';ctx.lineWidth=Math.max(1,cell*.055);ctx.beginPath();ctx.ellipse(0,0,s*(.34+progress*2.5),s*(.22+progress*1.4),0,0,Math.PI*2);ctx.stroke();}
    switch(effect){
      case 'standard':{
        ctx.globalAlpha=fade*.88;ctx.strokeStyle=colors[1]||colors[0];ctx.lineWidth=cell*.075;ctx.shadowBlur=cell*.8;ctx.shadowColor=colors[0];
        for(let r=0;r<2;r++){ctx.beginPath();ctx.arc(0,0,s*(.45+progress*(1.15+r*.45)),0,Math.PI*2);ctx.stroke();}
        ctx.globalAlpha=fade*.72;ctx.strokeStyle=colors[0];ctx.lineWidth=cell*.055;
        for(let i=0;i<12;i++){const a=i*Math.PI/6+progress*.2,r=s*(.55+progress*.9);ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);ctx.lineTo(Math.cos(a)*(r+s*.35),Math.sin(a)*(r+s*.35));ctx.stroke();}
        const core=ctx.createRadialGradient(0,0,1,0,0,s*.9);core.addColorStop(0,'rgba(255,255,255,.82)');core.addColorStop(.22,colors[0]+'99');core.addColorStop(1,colors[0]+'00');ctx.globalAlpha=fade*.72;ctx.fillStyle=core;ctx.beginPath();ctx.arc(0,0,s*.9,0,Math.PI*2);ctx.fill();break;
      }
      case 'tombstone':{
        const rise=s*(.75*(1-Math.pow(1-Math.min(1,mark.age/.42),3)));ctx.globalAlpha=fade*.88;ctx.translate(0,-rise);ctx.fillStyle='#8c999e';ctx.strokeStyle=colors[0];ctx.lineWidth=1.5;ctx.shadowBlur=cell*.65;ctx.shadowColor=colors[0];ctx.beginPath();ctx.moveTo(-s*.38,s*.42);ctx.lineTo(-s*.34,-s*.25);ctx.quadraticCurveTo(0,-s*.62,s*.34,-s*.25);ctx.lineTo(s*.38,s*.42);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#e9e5d5';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-s*.2,-s*.1);ctx.lineTo(s*.2,-s*.1);ctx.moveTo(0,-s*.23);ctx.lineTo(0,s*.02);ctx.stroke();ctx.fillStyle='#fff4d9';ctx.font='bold '+Math.max(6,cell*.23)+'px sans-serif';ctx.textAlign='center';ctx.fillText('RIP',0,s*.28);ctx.globalAlpha=fade*.55;ctx.strokeStyle=colors[2]||colors[0];ctx.beginPath();ctx.ellipse(0,s*.44,s*(.45+progress),s*.12,0,0,Math.PI*2);ctx.stroke();break;
      }
      case 'void':{
        ctx.globalAlpha=fade*.84;ctx.strokeStyle=colors[1]||colors[0];ctx.lineWidth=cell*.07;ctx.shadowBlur=cell;ctx.shadowColor=colors[0];
        for(let arm=0;arm<3;arm++){ctx.beginPath();for(let i=0;i<=36;i++){const t=i/36,a=t*Math.PI*4+progress*7+arm*Math.PI*2/3,r=s*(1.35-t*(.95+progress*.25)),x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}
        ctx.globalAlpha=fade*.52;ctx.strokeStyle=colors[2]||colors[1];ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,0,s*(.35+progress*.85),0,Math.PI*2);ctx.stroke();ctx.fillStyle=colors[3]||colors[0];ctx.globalAlpha=fade*.18;ctx.beginPath();ctx.arc(0,0,s*.3,0,Math.PI*2);ctx.fill();break;
      }
      case 'stone':{
        const radius=s*(.38+Math.min(progress*2,1)*.58);ctx.globalAlpha=fade*.8;ctx.fillStyle='#78858b';ctx.strokeStyle=colors[0];ctx.lineWidth=1.3;ctx.shadowBlur=cell*.45;ctx.shadowColor=colors[1]||colors[0];ctx.beginPath();for(let i=0;i<9;i++){const a=-Math.PI/2+i*Math.PI*2/8,r=radius*(i%2?.91:1.08),x=Math.cos(a)*r,y=Math.sin(a)*r;if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();ctx.stroke();ctx.globalAlpha=fade*.9;ctx.strokeStyle='#eef2e9';ctx.lineWidth=1;for(let i=0;i<4;i++){const a=i*Math.PI/2+progress*.2;ctx.beginPath();ctx.moveTo(Math.cos(a)*radius*.18,Math.sin(a)*radius*.18);ctx.lineTo(Math.cos(a+.18)*radius*.72,Math.sin(a+.18)*radius*.72);ctx.stroke();}break;
      }
      case 'pixel':{
        for(let i=0;i<14;i++){const a=i*Math.PI*2/14+(i%3)*.12,r=s*(.45+progress*(.8+(i%4)*.16));ctx.globalAlpha=fade*(.52+(i%3)*.14);ctx.fillStyle=colors[i%colors.length];ctx.fillRect(Math.cos(a)*r-cell*.09,Math.sin(a)*r-cell*.09,cell*(.11+(i%3)*.025),cell*(.11+(i%3)*.025));}
        ctx.globalAlpha=fade*.72;ctx.strokeStyle=colors[0];ctx.lineWidth=1;ctx.setLineDash([cell*.12,cell*.08]);ctx.beginPath();ctx.rect(-s*.45,-s*.45,s*.9,s*.9);ctx.stroke();ctx.setLineDash([]);break;
      }
      case 'rocket':{
        ctx.translate(0,-progress*s*2.25);ctx.rotate(-.12);ctx.globalAlpha=fade*.92;ctx.fillStyle='#e7eef3';ctx.strokeStyle=colors[1]||colors[0];ctx.lineWidth=1.25;ctx.shadowBlur=cell*.7;ctx.shadowColor=colors[1]||colors[0];ctx.beginPath();ctx.moveTo(0,-s*.62);ctx.quadraticCurveTo(s*.42,-s*.18,s*.24,s*.28);ctx.lineTo(-s*.24,s*.28);ctx.quadraticCurveTo(-s*.42,-s*.18,0,-s*.62);ctx.fill();ctx.stroke();ctx.fillStyle=colors[0];ctx.beginPath();ctx.arc(0,-s*.12,s*.1,0,Math.PI*2);ctx.fill();ctx.fillStyle=colors[2]||colors[1];ctx.beginPath();ctx.moveTo(-s*.15,s*.2);ctx.lineTo(0,s*(.62+Math.sin(mark.age*34)*.18));ctx.lineTo(s*.15,s*.2);ctx.fill();ctx.strokeStyle=colors[3]||colors[0];ctx.lineWidth=cell*.1;ctx.beginPath();ctx.moveTo(-s*.2,s*.4);ctx.lineTo(-s*.3,s*(1.1+progress));ctx.moveTo(s*.2,s*.4);ctx.lineTo(s*.3,s*(1.1+progress));ctx.stroke();break;
      }
      case 'freeze':{
        ctx.globalAlpha=fade*.76;ctx.strokeStyle=colors[1]||colors[0];ctx.lineWidth=cell*.06;ctx.shadowBlur=cell*.8;ctx.shadowColor=colors[0];for(let i=0;i<8;i++){const a=i*Math.PI/4+progress*.12,r=s*(.4+progress*.8);ctx.beginPath();ctx.moveTo(Math.cos(a)*s*.18,Math.sin(a)*s*.18);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);ctx.stroke();}ctx.globalAlpha=fade*.68;ctx.fillStyle='rgba(180,238,255,.14)';ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*.65,-s*.3);ctx.lineTo(s*.58,s*.55);ctx.lineTo(0,s);ctx.lineTo(-s*.58,s*.55);ctx.lineTo(-s*.65,-s*.3);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-s*.38,-s*.18);ctx.lineTo(s*.2,s*.32);ctx.lineTo(s*.42,-s*.42);ctx.moveTo(-s*.18,s*.48);ctx.lineTo(s*.1,-s*.12);ctx.stroke();break;
      }
      case 'lightning':{
        ctx.globalAlpha=fade*(.68+.3*pulse);ctx.strokeStyle='#fff';ctx.lineWidth=cell*.075;ctx.shadowBlur=cell*1.2;ctx.shadowColor=colors[1]||colors[0];for(let arm=0;arm<8;arm++){const a=arm*Math.PI/4+progress*.15;ctx.beginPath();let px=Math.cos(a)*s*.15,py=Math.sin(a)*s*.15;ctx.moveTo(px,py);for(let k=1;k<=4;k++){const r=s*(.25+k*.24),j=Math.sin(arm*7+k*11+mark.age*25)*s*.09;px=Math.cos(a)*r+Math.cos(a+Math.PI/2)*j;py=Math.sin(a)*r+Math.sin(a+Math.PI/2)*j;ctx.lineTo(px,py);}ctx.stroke();}break;
      }
      case 'shadow':{
        ctx.globalAlpha=fade*.65;ctx.strokeStyle=colors[1]||colors[0];ctx.lineWidth=cell*.12;ctx.shadowBlur=cell;ctx.shadowColor=colors[0];for(let arm=0;arm<4;arm++){const a=arm*Math.PI/2+progress*.65;ctx.beginPath();ctx.moveTo(Math.cos(a)*s*1.15,Math.sin(a)*s*1.15);ctx.quadraticCurveTo(Math.cos(a+1)*s*.55,Math.sin(a+1)*s*.55,Math.cos(a)*s*.12,Math.sin(a)*s*.12);ctx.stroke();}ctx.globalAlpha=fade*.3;ctx.fillStyle=colors[2]||colors[1];ctx.beginPath();ctx.ellipse(0,0,s*(.32+progress*.3),s*.24,0,0,Math.PI*2);ctx.fill();break;
      }
      case 'burst':{
        ctx.globalAlpha=fade*.8;ctx.strokeStyle=colors[0];ctx.lineWidth=cell*.055;ctx.shadowBlur=cell*1.6;ctx.shadowColor=colors[1]||colors[0];for(let i=0;i<16;i++){const a=i*Math.PI/8+progress*.12,inner=s*(.16+progress*.2),outer=s*(.75+Math.sin(i*4+mark.age*16)*.18+progress*.55);ctx.beginPath();ctx.moveTo(Math.cos(a)*inner,Math.sin(a)*inner);ctx.lineTo(Math.cos(a)*outer,Math.sin(a)*outer);ctx.stroke();}ctx.globalAlpha=fade*.8;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,s*(.16+progress*.1),0,Math.PI*2);ctx.fill();break;
      }
    }
    ctx.restore();
  }

  function drawToxicImpact(ctx,mark) {
    const progress=clamp(mark.age/mark.life,0,1),fade=Math.pow(1-progress,1.35);
    const cell=mark.cellSize||24,colors=mark.colors||['#eaff5b','#81e64b','#31c77a'];
    const seed=mark.seed||1;
    const rgba=(hex,alpha)=>{
      const value=String(hex).replace('#','');
      if(!/^[0-9a-f]{6}$/i.test(value))return 'rgba(125,235,72,'+alpha+')';
      return 'rgba('+parseInt(value.slice(0,2),16)+','+parseInt(value.slice(2,4),16)+','+parseInt(value.slice(4,6),16)+','+alpha+')';
    };
    ctx.save();ctx.translate(mark.x,mark.y);ctx.globalCompositeOperation='screen';

    // Corrosive puddle and broken hazard rings anchor the effect to the mine tile.
    const puddleRadius=cell*(.42+progress*.82);
    const puddle=ctx.createRadialGradient(0,cell*.12,1,0,cell*.12,puddleRadius);
    puddle.addColorStop(0,rgba(colors[1]||'#81e64b',.38*fade));
    puddle.addColorStop(.58,rgba(colors[2]||'#31c77a',.22*fade));
    puddle.addColorStop(1,rgba(colors[2]||'#31c77a',0));
    ctx.globalAlpha=1;ctx.fillStyle=puddle;ctx.beginPath();ctx.ellipse(0,cell*.12,puddleRadius,cell*(.18+progress*.11),0,0,Math.PI*2);ctx.fill();

    for(let ring=0;ring<3;ring++){
      const ringProgress=clamp(progress-ring*.11,0,1),radius=cell*(.36+ringProgress*(1.05+ring*.18));
      ctx.globalAlpha=fade*(.7-ring*.12);ctx.strokeStyle=colors[ring%colors.length];ctx.lineWidth=Math.max(1,cell*(.035-ring*.006));
      ctx.shadowBlur=cell*.28;ctx.shadowColor=colors[ring%colors.length];ctx.setLineDash([cell*(.12+ring*.035),cell*(.08+ring*.02)]);
      ctx.beginPath();ctx.ellipse(0,cell*.1,radius,radius*.34,0,progress*5+ring,Math.PI*1.82+progress*5+ring);ctx.stroke();
    }
    ctx.setLineDash([]);

    // Layered gas lobes rise and spread instead of using the generic circular burst.
    for(let i=0;i<7;i++){
      const offset=randomAt(seed,i+4),phase=i*Math.PI*2/7;
      const drift=progress*(.34+offset*.54);
      const x=Math.cos(phase+progress*.9)*cell*(.22+offset*.34+drift*.25);
      const y=-cell*(.08+drift*1.1)+Math.sin(phase*1.7)*cell*.08;
      const radius=cell*(.16+randomAt(seed,i+20)*.13)*(1+progress*.34);
      const cloud=ctx.createRadialGradient(x-radius*.16,y-radius*.18,1,x,y,radius*1.35);
      cloud.addColorStop(0,rgba(colors[i%colors.length],.42*fade));
      cloud.addColorStop(.48,rgba(colors[(i+1)%colors.length],.2*fade));
      cloud.addColorStop(1,rgba(colors[2]||'#31c77a',0));
      ctx.globalAlpha=1;ctx.fillStyle=cloud;ctx.beginPath();ctx.ellipse(x,y,radius*1.08,radius*.8,phase*.12,0,Math.PI*2);ctx.fill();
    }

    // Large, hollow acid bubbles climb through the cloud on staggered paths.
    for(let i=0;i<9;i++){
      const phase=randomAt(seed,i+40)*Math.PI*2;
      const travel=(progress*.92+randomAt(seed,i+60)*.72)%1;
      const x=Math.sin(phase+travel*4.2)*cell*(.18+randomAt(seed,i+80)*.66);
      const y=cell*.16-travel*cell*1.42;
      const radius=cell*(.055+randomAt(seed,i+100)*.075);
      ctx.globalAlpha=fade*(.45+.38*Math.sin(travel*Math.PI));
      ctx.strokeStyle=colors[(i+1)%colors.length];ctx.lineWidth=Math.max(1,cell*.024);
      ctx.shadowBlur=cell*.16;ctx.shadowColor=colors[1]||colors[0];
      ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=fade*.48;ctx.fillStyle='#f4ffbb';ctx.beginPath();ctx.arc(x-radius*.28,y-radius*.3,Math.max(.6,radius*.2),0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  function drawVictoryMark(ctx,mark) {
    const progress=clamp(mark.age/mark.life,0,1),fade=1-progress,cell=mark.cellSize||24;
    const radius=cell*(.2+progress*.86),rotation=progress*.85;
    ctx.save();ctx.translate(mark.x,mark.y);ctx.rotate(rotation);
    ctx.globalAlpha=fade*.68;ctx.strokeStyle=mark.color;ctx.shadowBlur=cell*.62*fade;ctx.shadowColor=mark.color;ctx.lineWidth=Math.max(1,cell*.045);
    ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=fade*.38;ctx.lineWidth=Math.max(.65,cell*.022);ctx.setLineDash([cell*.22,cell*.13]);
    ctx.beginPath();ctx.arc(0,0,radius*1.24,-progress*2.4,Math.PI*1.72-progress*2.4);ctx.stroke();ctx.setLineDash([]);
    ctx.globalAlpha=fade*.66;ctx.lineWidth=Math.max(.8,cell*.03);
    for(let i=0;i<8;i++){
      const angle=(Math.PI*2*i/8)-Math.PI/2,inner=radius*.78,outer=radius*(i%2===0?1.42:1.16);
      ctx.beginPath();ctx.moveTo(Math.cos(angle)*inner,Math.sin(angle)*inner);ctx.lineTo(Math.cos(angle)*outer,Math.sin(angle)*outer);ctx.stroke();
    }
    for(let i=0;i<4;i++){
      const angle=progress*2.2+i*Math.PI/2,orbit=radius*(1.16+Math.sin(progress*Math.PI*2+i)*.07),x=Math.cos(angle)*orbit,y=Math.sin(angle)*orbit,diamond=cell*(.055+.02*Math.sin(progress*Math.PI));
      ctx.save();ctx.translate(x,y);ctx.rotate(angle+progress*2);ctx.fillStyle=i%2?'#ffffff':mark.color;ctx.globalAlpha=fade*.82;
      ctx.shadowBlur=cell*.24;ctx.shadowColor=mark.color;ctx.beginPath();ctx.moveTo(0,-diamond*2);ctx.lineTo(diamond,0);ctx.lineTo(0,diamond*2);ctx.lineTo(-diamond,0);ctx.closePath();ctx.fill();ctx.restore();
    }
    ctx.globalAlpha=fade*.72;ctx.fillStyle='#ffffff';ctx.shadowBlur=cell*.5;ctx.shadowColor=mark.color;
    ctx.beginPath();ctx.arc(0,0,cell*(.07+.035*(1-progress)),0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function drawActionPulse(ctx,pulse) {
    const elapsed=pulse.age-(pulse.delay||0);
    if(elapsed<0)return;
    const progress=clamp(elapsed/pulse.life,0,1),fade=Math.pow(1-progress,1.18);
    const cell=pulse.cellSize||24,scale=cell*(.22+progress*1.2),color=pulse.color||'#b7fff3';
    ctx.save();ctx.translate(pulse.x,pulse.y);ctx.globalCompositeOperation='lighter';
    ctx.lineCap='round';ctx.lineJoin='round';

    if(pulse.kind==='step'){
      const radius=cell*(.16+progress*.58);
      ctx.globalAlpha=fade*.58;ctx.strokeStyle=color;ctx.lineWidth=Math.max(.7,cell*.026);
      ctx.shadowBlur=cell*.22;ctx.shadowColor=color;
      ctx.beginPath();ctx.ellipse(0,0,radius,radius*.68,0,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=fade*.3;ctx.lineWidth=Math.max(.55,cell*.018);
      for(let i=0;i<4;i++){
        const angle=i*Math.PI/2+progress*.18;
        ctx.beginPath();ctx.arc(0,0,radius*.78,angle,angle+.42);ctx.stroke();
      }
    }else if(pulse.kind==='dig'||pulse.kind==='reveal'){
      const strength=pulse.kind==='dig'?1:.56;
      ctx.globalAlpha=fade*.74*strength;ctx.strokeStyle=color;ctx.lineWidth=Math.max(.8,cell*.045);
      ctx.shadowBlur=cell*.36;ctx.shadowColor=color;
      ctx.beginPath();ctx.ellipse(0,0,scale,scale*.72,0,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=fade*.44*strength;ctx.lineWidth=Math.max(.6,cell*.022);
      ctx.beginPath();ctx.arc(0,0,scale*(.7+.12*Math.sin(progress*Math.PI*2)),progress*2.8,Math.PI*1.7+progress*2.8);ctx.stroke();
      if(pulse.kind==='dig'){
        ctx.globalAlpha=fade*.72;ctx.strokeStyle='#ffffff';ctx.lineWidth=Math.max(.7,cell*.025);
        for(let i=0;i<8;i++){
          const angle=i*Math.PI/4+progress*.22,inner=scale*1.12,outer=inner+cell*(.12*(1-progress));
          ctx.beginPath();ctx.moveTo(Math.cos(angle)*inner,Math.sin(angle)*inner);
          ctx.lineTo(Math.cos(angle)*outer,Math.sin(angle)*outer);ctx.stroke();
        }
        if(progress<.3){
          const flash=ctx.createRadialGradient(0,0,1,0,0,cell*.42);
          flash.addColorStop(0,'rgba(255,255,255,.72)');flash.addColorStop(1,'rgba(255,255,255,0)');
          ctx.globalAlpha=(1-progress/.3)*.76;ctx.fillStyle=flash;ctx.beginPath();ctx.arc(0,0,cell*.42,0,Math.PI*2);ctx.fill();
        }
      }else{
        ctx.globalAlpha=fade*.5;ctx.fillStyle=color;
        ctx.beginPath();ctx.moveTo(0,-cell*.13);ctx.lineTo(cell*.1,0);ctx.lineTo(0,cell*.13);ctx.lineTo(-cell*.1,0);ctx.closePath();ctx.fill();
      }
    }else if(pulse.kind==='flag'){
      const ease=1-Math.pow(1-progress,3),pole=cell*(.58+.38*ease);
      ctx.globalAlpha=fade*.82;ctx.strokeStyle='#f7fbff';ctx.lineWidth=Math.max(1,cell*.045);
      ctx.shadowBlur=cell*.32;ctx.shadowColor=color;
      ctx.beginPath();ctx.moveTo(0,cell*.48);ctx.lineTo(0,cell*.48-pole);ctx.stroke();
      ctx.globalAlpha=fade*.88;ctx.fillStyle=color;ctx.beginPath();
      ctx.moveTo(0,cell*.48-pole);ctx.quadraticCurveTo(cell*.28,cell*.48-pole-cell*.16,cell*.48,cell*.48-pole-cell*.04);
      ctx.quadraticCurveTo(cell*.28,cell*.48-pole+cell*.15,0,cell*.48-pole+cell*.12);ctx.closePath();ctx.fill();
      ctx.globalAlpha=fade*.42;ctx.strokeStyle=color;ctx.lineWidth=Math.max(.7,cell*.025);
      ctx.beginPath();ctx.arc(0,cell*.12,cell*(.48+progress*.72),-.12,Math.PI*1.72);ctx.stroke();
      if(progress<.5){ctx.globalAlpha=(1-progress*2)*.7;ctx.fillStyle='#fff';for(let i=0;i<3;i++){const a=-Math.PI*.8+i*.62;ctx.beginPath();ctx.arc(Math.cos(a)*cell*.58,Math.sin(a)*cell*.58,Math.max(.8,cell*.035),0,Math.PI*2);ctx.fill();}}
    }else if(pulse.kind==='unflag'){
      const radius=cell*(1.12-progress*.92);
      ctx.globalAlpha=fade*.76;ctx.strokeStyle=color;ctx.lineWidth=Math.max(.8,cell*.04);ctx.shadowBlur=cell*.3;ctx.shadowColor=color;
      ctx.setLineDash([cell*.12,cell*.09]);ctx.beginPath();ctx.arc(0,0,radius,progress*4,Math.PI*1.8+progress*4);ctx.stroke();ctx.setLineDash([]);
      ctx.globalAlpha=fade*.45;ctx.beginPath();ctx.moveTo(-cell*.24,-cell*.24);ctx.lineTo(cell*.24,cell*.24);ctx.moveTo(cell*.24,-cell*.24);ctx.lineTo(-cell*.24,cell*.24);ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticle(ctx,p) {
    const fade=clamp(1-p.age/p.life,0,1);
    const pulse=.7+.3*Math.sin((p.age/p.life)*Math.PI);
    ctx.save();ctx.globalAlpha=fade*p.alpha;
    ctx.translate(p.x,p.y);ctx.rotate(p.rotation||0);
    const s=p.size;
    if(p.kind==='ember'||p.kind==='spark'){
      ctx.strokeStyle=p.color;ctx.lineWidth=Math.max(.7,s*.35);ctx.beginPath();ctx.moveTo(-p.vx*.025,-p.vy*.025);ctx.lineTo(0,0);ctx.stroke();
      ctx.fillStyle=p.color;ctx.shadowBlur=p.kind==='ember'?s*2: s*3;ctx.shadowColor=p.color;ctx.beginPath();ctx.arc(0,0,Math.max(.7,s*.45),0,Math.PI*2);ctx.fill();
    } else if(p.kind==='bolt'){
      ctx.strokeStyle=p.color;ctx.lineWidth=Math.max(1,s*.48);ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=s*2.5;ctx.shadowColor=p.color;
      ctx.beginPath();ctx.moveTo(-s*.35,-s*1.8);ctx.lineTo(s*.2,-s*.55);ctx.lineTo(-s*.12,-s*.34);ctx.lineTo(s*.42,s*1.45);ctx.stroke();
      ctx.shadowBlur=0;ctx.lineWidth=Math.max(.55,s*.16);ctx.strokeStyle='#ffffff';ctx.beginPath();ctx.moveTo(-s*.35,-s*1.8);ctx.lineTo(s*.2,-s*.55);ctx.lineTo(-s*.12,-s*.34);ctx.lineTo(s*.42,s*1.45);ctx.stroke();
    } else if(p.kind==='snow'||p.kind==='shard'){
      ctx.fillStyle=p.color;ctx.shadowBlur=2;ctx.shadowColor=p.color;ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*.48,-s*.15);ctx.lineTo(s*.24,s);ctx.lineTo(-s*.45,s*.2);ctx.closePath();ctx.fill();
    } else if(p.kind==='bubble'){
      ctx.strokeStyle=p.color;ctx.lineWidth=Math.max(.7,s*.18);ctx.beginPath();ctx.arc(0,0,s,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.arc(-s*.28,-s*.3,Math.max(.6,s*.14),0,Math.PI*2);ctx.fill();
    } else if(p.kind==='dust'||p.kind==='smoke'){
      const radius=s*(p.kind==='smoke'?2.8:1.2);
      const g=ctx.createRadialGradient(0,0,0,0,0,radius);g.addColorStop(0,p.color);g.addColorStop(1,'rgba(30,30,30,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();
    } else if(p.kind==='petal'||p.kind==='leaf'){
      ctx.fillStyle=p.color;ctx.shadowBlur=2;ctx.shadowColor=p.color;ctx.beginPath();ctx.ellipse(0,0,s*.48,s*1.1,.3,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(0,-s*.8);ctx.lineTo(0,s*.8);ctx.stroke();
    } else if(p.kind==='pixel'||p.kind==='confetti'){
      ctx.fillStyle=p.color;ctx.fillRect(-s*.45,-s*.65,s*.9,s*1.3);
    } else if(p.kind==='orb'||p.kind==='star'){
      ctx.fillStyle=p.color;ctx.shadowBlur=s*2.5;ctx.shadowColor=p.color;ctx.beginPath();ctx.arc(0,0,s*.48,0,Math.PI*2);ctx.fill();
      if(p.kind==='star'){ctx.strokeStyle=p.color;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(-s,0);ctx.lineTo(s,0);ctx.moveTo(0,-s);ctx.lineTo(0,s);ctx.stroke();}
    }
    ctx.restore();
  }

  function createParticle(x,y,vx,vy,size,color,life,kind,playerId=null) {
    return {x,y,vx,vy,size,color,life,age:0,kind,alpha:.85,rotation:Math.random()*Math.PI*2,spin:(Math.random()-.5)*4,gravity:kind==='ember'||kind==='smoke'?-11:kind==='shard'||kind==='confetti'?38:0,playerId};
  }

  function createInstance(wrap, grid, options) {
    const surface=document.createElement('canvas');
    const fx=document.createElement('canvas');
    surface.className='arena-surface-canvas';surface.setAttribute('aria-hidden','true');
    fx.className='arena-fx-canvas';fx.setAttribute('aria-hidden','true');
    wrap.insertBefore(surface,grid);
    wrap.insertBefore(fx,grid.nextSibling);
    wrap.classList.add('arena-visual-active');
    grid.classList.add('arena-materialized');

    const instance={
      wrap,grid,surface,fx,surfaceContext:surface.getContext('2d',{alpha:true}),fxContext:fx.getContext('2d',{alpha:true}),
      theme:options.theme||'arena-standard',size:options.size||16,cells:options.cells||[],metrics:null,
      particles:[],bursts:[],streaks:[],pulses:[],toxicEffects:[],eliminations:[],victories:[],decals:[],lastFrame:0,lastAmbient:0,raf:0,destroyed:false,
      reducedMotion:!!(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches),
      resizeObserver:null
    };

    function resize() {
      if(instance.destroyed)return;
      const rect=grid.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      const coarse=coarsePointer();
      const dpr=Math.min(window.devicePixelRatio||1,coarse?1.25:1.65);
      const gapX=parseFloat(getComputedStyle(grid).columnGap)||1;
      const gapY=parseFloat(getComputedStyle(grid).rowGap)||gapX;
      instance.metrics={width:rect.width,height:rect.height,dpr,gapX,gapY,cellWidth:(rect.width-gapX*(instance.size-1))/instance.size,cellHeight:(rect.height-gapY*(instance.size-1))/instance.size};
      const pixelWidth=Math.max(1,Math.round(rect.width*dpr));
      const pixelHeight=Math.max(1,Math.round(rect.height*dpr));
      for(const canvas of [surface,fx]){
        if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;}
        canvas.style.width=rect.width+'px';canvas.style.height=rect.height+'px';
      }
      instance.surfaceContext.setTransform(dpr,0,0,dpr,0,0);
      instance.fxContext.setTransform(dpr,0,0,dpr,0,0);
      drawSurface(instance,performance.now());
      start();
    }

    function visible() {
      if(document.visibilityState==='hidden')return false;
      return grid.getBoundingClientRect().width>0&&grid.getBoundingClientRect().height>0;
    }

    function addParticle(particle) {
      const maximum=coarsePointer()?84:160;
      if(instance.particles.length>=maximum)instance.particles.splice(0,instance.particles.length-maximum+1);
      instance.particles.push(particle);
    }

    function ambientParticle(now) {
      const m=instance.metrics;if(!m)return;
      const theme=resolveTheme(instance.theme);
      const kind=theme.ambient;
      const x=Math.random()*m.width;
      const y=kind==='ember'?m.height+5:Math.random()*m.height;
      const speed=kind==='bubble'?-1:kind==='ember'?-1:kind==='snow'?1:kind==='dust'?.3:.55;
      const colors=kind==='ember'?['#ffca6a','#ff8a3d']:kind==='snow'?['#e8ffff','#a6e8fa']:kind==='bubble'?(theme.id==='arena-toxic'?['#d4ff72','#9eea55','#62cb8a']:['#b6f8f5','#78bdd0']):kind==='spore'?['#b5e29a','#e0eaa2']:kind==='spark'?['#77fff0','#b7a9ff']:kind==='star'?['#e4d5ff','#9e8cff','#85eaff']:kind==='petal'?['#ffd0e5','#f5a6c8']:['#e3d2a8','#bba27b'];
      const size=kind==='snow'?1.5+Math.random()*2.2:kind==='bubble'?2+Math.random()*3:1+Math.random()*2;
      const particle=createParticle(x,y,(Math.random()-.5)*8, speed*(10+Math.random()*20),size,colors[Math.floor(Math.random()*colors.length)],3+Math.random()*4,kind==='snow'?'snow':kind==='bubble'?'bubble':kind==='spore'?'orb':kind==='star'?'star':kind==='petal'?'petal':kind==='spark'?'spark':kind==='ember'?'ember':'dust');
      particle.alpha=kind==='spark'?.42:.34;particle.gravity=kind==='ember'?-4:kind==='snow'?2:0;
      particle.rotation=Math.random()*Math.PI*2;particle.spin=(Math.random()-.5)*.7;
      addParticle(particle);
    }

    function drawBurst(burst,ctx) {
      const age=burst.age-(burst.delay||0);if(age<0)return;
      const progress=clamp(age/burst.life,0,1),radius=burst.maxRadius*(1-Math.pow(1-progress,2)),alpha=1-progress;
      ctx.save();
      if(burst.halo!==false){
        ctx.globalAlpha=alpha*.58;
        const glow=ctx.createRadialGradient(burst.x,burst.y,1,burst.x,burst.y,Math.max(4,radius*.9));
        glow.addColorStop(0,burst.color);glow.addColorStop(.25,burst.color+'66');glow.addColorStop(1,'rgba(20,10,10,0)');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(burst.x,burst.y,Math.max(4,radius*.9),0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=alpha*.9;ctx.strokeStyle=burst.color;ctx.lineWidth=burst.width||Math.max(1.05,2.25*(1-progress));
      ctx.beginPath();ctx.arc(burst.x,burst.y,Math.max(1,radius),0,Math.PI*2);ctx.stroke();
      if(burst.halo!==false&&progress<.72){
        ctx.globalAlpha=alpha*.38;ctx.lineWidth=Math.max(.65,(burst.width||1.6)*.48);
        ctx.beginPath();ctx.arc(burst.x,burst.y,Math.max(1,radius*.68),0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
    }

    function render(now) {
      instance.raf=0;
      if(instance.destroyed||!visible())return;
      const dt=instance.lastFrame?clamp((now-instance.lastFrame)/1000,0,.05):.016;
      instance.lastFrame=now;
      const ctx=instance.fxContext,m=instance.metrics;
      if(!ctx||!m)return;
      ctx.clearRect(0,0,m.width,m.height);

      if(!instance.reducedMotion&&now-instance.lastAmbient>240&&instance.particles.length<(coarsePointer()?12:22)){
        ambientParticle(now);instance.lastAmbient=now;
      }
      for(let i=instance.streaks.length-1;i>=0;i--){
        const streak=instance.streaks[i];streak.age+=dt;
        if(streak.age>=streak.life){instance.streaks.splice(i,1);continue;}
        drawMotionStreak(ctx,streak);
      }
      for(let i=instance.pulses.length-1;i>=0;i--){
        const pulse=instance.pulses[i];pulse.age+=dt;
        if(pulse.age>=(pulse.delay||0)+pulse.life){instance.pulses.splice(i,1);continue;}
        drawActionPulse(ctx,pulse);
      }
      for(let i=instance.particles.length-1;i>=0;i--){
        const p=instance.particles[i];p.age+=dt;
        p.vx*=Math.pow(.985,dt*60);p.vy+=p.gravity*dt;
        p.x+=p.vx*dt;p.y+=p.vy*dt;p.rotation+=p.spin*dt;
        if(p.age>=p.life||p.x<-24||p.x>m.width+24||p.y<-24||p.y>m.height+24){instance.particles.splice(i,1);continue;}
        drawParticle(ctx,p);
      }
      for(let i=instance.bursts.length-1;i>=0;i--){
        const burst=instance.bursts[i];burst.age+=dt;
        if(burst.age>=(burst.delay||0)+burst.life){instance.bursts.splice(i,1);continue;}
        drawBurst(burst,ctx);
      }
      for(let i=instance.toxicEffects.length-1;i>=0;i--){
        const mark=instance.toxicEffects[i];mark.age+=dt;
        if(mark.age>=mark.life){instance.toxicEffects.splice(i,1);continue;}
        drawToxicImpact(ctx,mark);
      }
      // Draw eliminations after bomb impacts and particles so the death choreography stays in front.
      for(let i=instance.eliminations.length-1;i>=0;i--){
        const mark=instance.eliminations[i];mark.age+=dt;
        if(mark.age>=mark.life){instance.eliminations.splice(i,1);continue;}
        drawEliminationEcho(ctx,mark);
      }
      for(let i=instance.victories.length-1;i>=0;i--){
        const mark=instance.victories[i];mark.age+=dt;
        if(mark.age>=mark.life){instance.victories.splice(i,1);continue;}
        drawVictoryMark(ctx,mark);
      }
      for(const decal of instance.decals) {
        if(decal.type==='tombstone'){
          ctx.save();ctx.translate(decal.x,decal.y);ctx.globalAlpha=.82;
          ctx.fillStyle='#c3c3b5';ctx.strokeStyle='#4c5556';ctx.lineWidth=1.2;
          ctx.beginPath();ctx.moveTo(-7,7);ctx.lineTo(-6,-5);ctx.quadraticCurveTo(0,-13,6,-5);ctx.lineTo(7,7);ctx.closePath();ctx.fill();ctx.stroke();
          ctx.strokeStyle='#596365';ctx.beginPath();ctx.moveTo(-2,-4);ctx.lineTo(2,-4);ctx.moveTo(0,-6);ctx.lineTo(0,-2);ctx.stroke();
          ctx.restore();
        }
      }

      if(!instance.reducedMotion||instance.particles.length||instance.bursts.length||instance.streaks.length||instance.pulses.length||instance.toxicEffects.length||instance.eliminations.length||instance.victories.length) {
        instance.raf=requestAnimationFrame(render);
      }
    }

    function start() {
      if(instance.raf||instance.destroyed||!visible())return;
      instance.lastFrame=0;instance.raf=requestAnimationFrame(render);
    }

    instance.resize=resize;
    instance.setTheme=function(theme){
      const next=resolveTheme(theme).id;
      if(next!==instance.theme){instance.theme=next;drawSurface(instance,performance.now());start();}
    };
    instance.updateBoard=function(data={}){
      if(data.theme)instance.theme=resolveTheme(data.theme).id;
      if(Number.isInteger(data.size)&&data.size>=8&&data.size<=20)instance.size=data.size;
      if(Array.isArray(data.cells))instance.cells=data.cells;
      resize();
    };
    instance.cellCenter=function(index){
      const m=instance.metrics;if(!m||!Number.isInteger(index)||index<0||index>=instance.size*instance.size)return null;
      const row=Math.floor(index/instance.size),col=index%instance.size;
      return {x:col*(m.cellWidth+m.gapX)+m.cellWidth/2,y:row*(m.cellHeight+m.gapY)+m.cellHeight/2};
    };
    instance.feedback=function(index,kind='dig',playerColor=null){
      const point=instance.cellCenter(index),m=instance.metrics;
      if(!point||!m||!ACTION_FEEDBACK.includes(kind))return false;
      const coarse=coarsePointer(),cell=Math.min(m.cellWidth,m.cellHeight);
      const fallback=kind==='step'?'#d8f7ff':kind==='dig'?'#b9fff2':kind==='flag'?'#ffd36b':'#9bb9ca';
      const color=/^#[0-9a-f]{6}$/i.test(playerColor||'')?playerColor:fallback;
      const addPulse=(delay,life,variant=kind)=>instance.pulses.push({x:point.x,y:point.y,age:0,delay,life,kind:variant,color,cellSize:cell});
      if(kind==='reveal'){
        addPulse(0,.48,'reveal');
      }else if(kind==='step'){
        addPulse(0,.32,'step');
      }else if(kind==='dig'){
        addPulse(0,.68,'dig');addPulse(.12,.58,'dig');
        const count=coarse?5:9;
        for(let i=0;i<count;i++){
          const angle=Math.PI*2*i/count+(Math.random()-.5)*.18,speed=cell*(1.7+Math.random()*1.7);
          const particle=createParticle(point.x,point.y,Math.cos(angle)*speed,Math.sin(angle)*speed,Math.max(1.2,cell*.045),color,.28+Math.random()*.22,'spark');
          particle.alpha=.72;addParticle(particle);
        }
      }else{
        addPulse(0,kind==='flag'?.72:.56,kind);
        const count=coarse?4:7;
        for(let i=0;i<count;i++){
          const angle=kind==='flag'?-Math.PI*.85+i*.24:Math.PI*2*i/count;
          const speed=cell*(.85+Math.random()*1.15),particle=createParticle(point.x,point.y,Math.cos(angle)*speed,Math.sin(angle)*speed,Math.max(1.1,cell*.04),color,.28+Math.random()*.3,kind==='flag'?'spark':'dust');
          particle.gravity=kind==='flag'?-cell*1.2:0;particle.alpha=.78;addParticle(particle);
        }
      }
      const limit=coarse?72:112;
      if(instance.pulses.length>limit)instance.pulses.splice(0,instance.pulses.length-limit);
      start();return true;
    };
    instance.revealWave=function(origin,indices,playerColor=null){
      const m=instance.metrics,originPoint=instance.cellCenter(origin);
      if(!m||!originPoint||!Array.isArray(indices))return 0;
      const coarse=coarsePointer(),cell=Math.min(m.cellWidth,m.cellHeight);
      const color=/^#[0-9a-f]{6}$/i.test(playerColor||'')?playerColor:'#a8f4ed';
      const max=coarse?26:48,seen=new Set(),cells=[];
      for(const index of indices){
        if(!Number.isInteger(index)||index===origin||seen.has(index))continue;
        seen.add(index);const point=instance.cellCenter(index);if(!point)continue;
        const row=Math.floor(index/instance.size),col=index%instance.size;
        const originRow=Math.floor(origin/instance.size),originCol=origin%instance.size;
        cells.push({index,point,distance:Math.abs(row-originRow)+Math.abs(col-originCol)});
      }
      cells.sort((a,b)=>a.distance-b.distance||a.index-b.index);
      const pulses=cells.slice(0,max);
      for(const entry of pulses){
        instance.pulses.push({x:entry.point.x,y:entry.point.y,age:0,delay:Math.min(.42,entry.distance*.042),life:.48,kind:'reveal',color,cellSize:cell});
      }
      const limit=coarse?72:112;
      if(instance.pulses.length>limit)instance.pulses.splice(0,instance.pulses.length-limit);
      if(pulses.length)start();
      return pulses.length;
    };
    instance.impact=function(index,effect='standard',palette=null){
      const point=instance.cellCenter(index),m=instance.metrics;if(!point||!m)return false;
      const colors=Array.isArray(palette)&&palette.length?palette:(EFFECT_COLORS[effect]||EFFECT_COLORS.standard);
      const coarse=coarsePointer(),count=coarse?20:34,cell=Math.min(m.cellWidth,m.cellHeight),kind=effectKind(effect);
      instance.bursts.push({x:point.x,y:point.y,age:0,delay:0,life:.58,maxRadius:cell*(coarse?2.55:3.35),color:colors[0],width:2.8,halo:true});
      instance.bursts.push({x:point.x,y:point.y,age:0,delay:.085,life:.66,maxRadius:cell*(coarse?3.05:4.05),color:colors[1]||colors[0],width:1.15,halo:false});
      instance.bursts.push({x:point.x,y:point.y,age:0,delay:.035,life:.34,maxRadius:cell*.92,color:colors[2]||colors[0],width:1.6,halo:true});
      for(let i=0;i<count;i++){
        const angle=Math.PI*2*i/count+(Math.random()-.5)*.24;
        const speed=effect==='void'?20+Math.random()*34:effect==='toxic'?28+Math.random()*54:78+Math.random()*150;
        const p=createParticle(point.x,point.y,Math.cos(angle)*speed,Math.sin(angle)*speed-(effect==='fire'?32:0),1.7+Math.random()*3.7,colors[i%colors.length],.52+Math.random()*.8,kind);
        if(effect==='void'){p.vx=-p.vx*.38;p.vy=-p.vy*.38;p.spin=5;}
        if(effect==='ice'){p.gravity=54;p.size*=1.2;p.spin*=1.8;}
        if(effect==='fire'){p.gravity=-34;p.life+=.35;p.size*=1.15;}
        if(effect==='toxic'){p.vy=-Math.abs(p.vy)*.65;p.gravity=-10;p.life+=.3;}
        if(effect==='lightning'){p.life=.16+Math.random()*.16;p.size*=1.65;}
        if(effect==='pixel'){p.gravity=22;p.spin*=.5;}
        if(effect==='cosmic'||effect==='plasma'){p.spin*=2;p.life+=.25;}
        addParticle(p);
      }
      for(let i=0;i<(coarse?5:9);i++){
        const angle=Math.PI*2*(i+.5)/(coarse?5:9),speed=112+Math.random()*74;
        const p=createParticle(point.x,point.y,Math.cos(angle)*speed,Math.sin(angle)*speed,1+Math.random()*1.3,colors[(i+2)%colors.length],.25+Math.random()*.2,'spark');
        p.alpha=.9;addParticle(p);
      }
      if(effect==='fire'||effect==='standard'||effect==='plasma'){
        for(let i=0;i<5;i++)addParticle(createParticle(point.x+(Math.random()-.5)*10,point.y+(Math.random()-.5)*10,(Math.random()-.5)*14,-12-Math.random()*22,5+Math.random()*8,'rgba(70,65,65,.55)',.9+Math.random()*.55,'smoke'));
      }
      if(effect==='toxic'){
        instance.toxicEffects.push({x:point.x,y:point.y,age:0,life:1.12,cellSize:cell,colors,seed:hash('toxic:'+index+':'+Math.round(performance.now()))});
        const count=coarse?7:12;
        for(let i=0;i<count;i++){
          const angle=Math.PI*2*i/count+(Math.random()-.5)*.3;
          const speed=cell*(.45+Math.random()*1.1);
          const puff=createParticle(point.x+(Math.random()-.5)*cell*.3,point.y+(Math.random()-.5)*cell*.2,Math.cos(angle)*speed,-cell*(.55+Math.random()*1.25),cell*(.16+Math.random()*.15),colors[i%colors.length],.72+Math.random()*.48,'smoke');
          puff.gravity=-cell*.22;puff.alpha=.62;addParticle(puff);
        }
        for(let i=0;i<(coarse?6:10);i++){
          const x=point.x+(Math.random()-.5)*cell*.9,y=point.y+(Math.random()-.5)*cell*.55;
          const bubble=createParticle(x,y,(Math.random()-.5)*cell*.45,-cell*(.42+Math.random()*.82),cell*(.1+Math.random()*.075),colors[(i+1)%colors.length],.64+Math.random()*.5,'bubble');
          bubble.gravity=-cell*.12;bubble.alpha=.94;addParticle(bubble);
        }
      }
      if(effect==='tombstone')instance.decals.push({type:'tombstone',x:point.x,y:point.y});
      start();return true;
    };
    instance.trail=function(fromIndex,toIndex,effect='dust',playerId=null){
      const from=instance.cellCenter(Number.isInteger(fromIndex)?fromIndex:toIndex),to=instance.cellCenter(toIndex);if(!to)return false;
      const supported=TRAIL_EFFECTS.includes(effect)?effect:'dust',colors=EFFECT_COLORS[supported]||EFFECT_COLORS.dust,cell=Math.min(instance.metrics.cellWidth,instance.metrics.cellHeight);
      if(from)instance.streaks.push({x1:from.x,y1:from.y,x2:to.x,y2:to.y,age:0,life:supported==='shadow'?.72:supported==='cosmic'?.76:.62,effect:supported,colors,cellSize:cell,seed:hash(String(playerId)+':'+toIndex+':'+Math.round(performance.now())),playerId});
      const accentCount=supported==='dust'?3:supported==='sakura'||supported==='leaf'?2:4;
      for(let i=0;i<accentCount;i++){
        const t=(i+1)/(accentCount+1),x=from?mix(from.x,to.x,t):to.x,y=from?mix(from.y,to.y,t):to.y,kind=effectKind(supported),angle=(Math.random()-.5)*Math.PI;
        const particle=createParticle(x,y,Math.cos(angle)*(8+Math.random()*12),-5-Math.random()*12,Math.max(1.2,cell*.045+Math.random()*cell*.025),colors[i%colors.length],.3+Math.random()*.32,kind,playerId);
        particle.alpha=.62;particle.gravity=kind==='shard'?12:kind==='ember'?-8:kind==='petal'||kind==='leaf'?8:0;addParticle(particle);
      }
      start();return true;
    };
    instance.eliminate=function(index,effect='standard',playerColor=null){
      const point=instance.cellCenter(index),m=instance.metrics;if(!point||!m)return false;
      const supported=ELIMINATION_EFFECTS.includes(effect)?effect:'standard',colors=EFFECT_COLORS[supported]||EFFECT_COLORS.standard;
      const playerTint=/^#[0-9a-f]{6}$/i.test(playerColor||'')?playerColor:colors[0],coarse=coarsePointer(),cell=Math.min(m.cellWidth,m.cellHeight);
      instance.eliminations.push({x:point.x,y:point.y,age:0,life:supported==='rocket'?1.35:1.28,color:playerTint,colors,effect:supported,cellSize:cell});
      const count=coarse?17:28;
      for(let i=0;i<count;i++){
        const angle=Math.PI*2*i/count+(Math.random()-.5)*.22,inward=supported==='void'||supported==='shadow',radius=cell*(inward?1.05:.08);
        const speed=supported==='rocket'?32+Math.random()*36:supported==='lightning'?105+Math.random()*95:inward?26+Math.random()*42:48+Math.random()*92;
        const x=point.x+Math.cos(angle)*radius,y=point.y+Math.sin(angle)*radius;let vx=Math.cos(angle)*speed,vy=Math.sin(angle)*speed;
        if(inward){vx=-vx;vy=-vy;}if(supported==='rocket'){vx*=.24;vy=-Math.abs(vy)-42;}
        const particle=createParticle(x,y,vx,vy,Math.max(1.5,cell*(.045+Math.random()*.055)),colors[i%colors.length],supported==='lightning'?.2+Math.random()*.18:.52+Math.random()*.62,effectKind(supported));
        if(supported==='freeze'||supported==='stone'||supported==='tombstone'){particle.gravity=58;particle.spin*=2.2;}
        if(supported==='rocket'||supported==='flames'){particle.gravity=-36;particle.life+=.3;}
        if(supported==='void'||supported==='shadow'){particle.gravity=0;particle.spin=6;}
        if(supported==='pixel'){particle.gravity=12;particle.spin*=.45;}
        if(supported==='lightning'){particle.life=.16+Math.random()*.16;particle.size*=1.7;}
        if(supported==='burst'){particle.vy-=38;particle.spin*=2.4;}
        addParticle(particle);
      }
      if(supported==='tombstone')instance.decals.push({type:'tombstone',x:point.x,y:point.y});
      start();return true;
    };
    instance.celebrate=function(index,effect='confetti',palette=null,playerColor=null){
      const point=instance.cellCenter(index),m=instance.metrics;if(!point||!m)return false;
      const colors=Array.isArray(palette)&&palette.length?palette:(EFFECT_COLORS[effect]||EFFECT_COLORS.confetti);
      const tint=/^#[0-9a-f]{6}$/i.test(playerColor||'')?playerColor:colors[0],cell=Math.min(m.cellWidth,m.cellHeight);
      instance.victories.push({x:point.x,y:point.y,age:0,life:1.85,color:tint,cellSize:cell});
      const anchors=[
        {x:point.x,y:Math.max(cell*.9,point.y-cell*.8)},
        {x:clamp(point.x-cell*1.65,cell*.6,m.width-cell*.6),y:Math.max(cell*.7,point.y-cell*1.45)},
        {x:clamp(point.x+cell*1.65,cell*.6,m.width-cell*.6),y:Math.max(cell*.7,point.y-cell*1.3)}
      ];
      const coarse=coarsePointer();
      anchors.forEach((anchor,index)=>{
        const delay=index*.16,amount=coarse?9:13;
        instance.bursts.push({x:anchor.x,y:anchor.y,age:0,delay,life:.62,maxRadius:cell*(1.5+index*.18),color:colors[index%colors.length],width:1.5,halo:true});
        for(let i=0;i<amount;i++){
          const angle=Math.PI*2*i/amount+(Math.random()-.5)*.2,speed=44+Math.random()*82;
          const particle=createParticle(anchor.x,anchor.y,Math.cos(angle)*speed,Math.sin(angle)*speed-22,1.7+Math.random()*2.8,colors[(i+index)%colors.length],.48+Math.random()*.55,effectKind(effect));
          particle.gravity=effect==='coins'?48:effect==='fireworks'?8:effect==='flames'?-24:0;
          particle.spin*=1.8;addParticle(particle);
        }
      });
      start();return true;
    };
    instance.clearPlayerTrails=function(playerId){
      instance.particles=instance.particles.filter(p=>p.playerId!==playerId);
      instance.streaks=instance.streaks.filter(streak=>streak.playerId!==playerId);
    };
    instance.clearTransient=function(){
      instance.particles=[];instance.bursts=[];instance.streaks=[];instance.pulses=[];instance.toxicEffects=[];instance.eliminations=[];instance.victories=[];instance.decals=[];
      if(instance.fxContext&&instance.metrics)instance.fxContext.clearRect(0,0,instance.metrics.width,instance.metrics.height);
    };
    instance.destroy=function(){
      instance.destroyed=true;if(instance.raf)cancelAnimationFrame(instance.raf);
      if(instance.resizeObserver)instance.resizeObserver.disconnect();
      document.removeEventListener('visibilitychange',onVisibility);
      surface.remove();fx.remove();wrap.classList.remove('arena-visual-active');grid.classList.remove('arena-materialized');
      instances.delete(wrap);
    };
    function onVisibility(){if(document.visibilityState==='visible')start();}
    document.addEventListener('visibilitychange',onVisibility);
    if(typeof ResizeObserver!=='undefined'){instance.resizeObserver=new ResizeObserver(resize);instance.resizeObserver.observe(grid);}
    resize();
    return instance;
  }

  function paintPreview(canvas,themeId) {
    if(!canvas||typeof canvas.getContext!=='function')return false;
    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,rect.width||220),height=Math.max(1,rect.height||108);
    const dpr=Math.min((typeof devicePixelRatio==='number'?devicePixelRatio:1),1.5);
    canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));
    const ctx=canvas.getContext('2d');if(!ctx)return false;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const theme=resolveTheme(themeId),gap=3,cols=7,rows=3,pad=4;
    const tileW=(width-pad*2-gap*(cols-1))/cols,tileH=(height-pad*2-gap*(rows-1))/rows;
    ctx.fillStyle=theme.gap;ctx.fillRect(0,0,width,height);
    for(let i=0;i<cols*rows;i++){
      const x=pad+(i%cols)*(tileW+gap),y=pad+Math.floor(i/cols)*(tileH+gap),seed=hash(theme.id+':preview:'+i);
      const gradient=ctx.createLinearGradient(x,y,x+tileW,y+tileH);
      gradient.addColorStop(0,theme.base[0]);gradient.addColorStop(1,theme.base[1]);
      roundedRect(ctx,x,y,tileW,tileH,3);ctx.fillStyle=gradient;ctx.fill();
      ctx.strokeStyle='rgba(240,250,255,.22)';ctx.lineWidth=.7;ctx.stroke();
      drawMaterial(ctx,x+1,y+1,tileW-2,tileH-2,theme,seed,performance.now(),false);
    }
    const sheen=ctx.createLinearGradient(0,0,width,height*.85);
    sheen.addColorStop(0,'rgba(255,255,255,.14)');sheen.addColorStop(.42,'rgba(255,255,255,.015)');sheen.addColorStop(1,'rgba(0,0,0,.22)');
    ctx.fillStyle=sheen;ctx.fillRect(0,0,width,height);
    const vignette=ctx.createLinearGradient(0,0,0,height);
    vignette.addColorStop(0,'rgba(0,0,0,.05)');vignette.addColorStop(1,'rgba(0,0,0,.28)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
    return true;
  }

  function mount(wrap,grid,options={}) {
    if(!wrap||!grid||typeof document==='undefined')return null;
    let instance=instances.get(wrap);
    if(!instance||instance.destroyed){instance=createInstance(wrap,grid,options);instances.set(wrap,instance);}
    if(options.theme)instance.setTheme(options.theme);
    if(options.size&&options.size!==instance.size)instance.size=options.size;
    if(Array.isArray(options.cells))instance.updateBoard(options);
    return instance;
  }

  return Object.freeze({
    version: '1.2.0',
    themeIds: Object.freeze(Object.keys(THEMES)),
    effectIds: Object.freeze(Object.keys(EFFECT_COLORS)),
    trailEffectIds: TRAIL_EFFECTS,
    eliminationEffectIds: ELIMINATION_EFFECTS,
    actionFeedbackIds: ACTION_FEEDBACK,
    resolveTheme,
    paintPreview,
    mount
  });
});
