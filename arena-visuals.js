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
    dust: ['#d9c49a','#b8a17d','#f2dfb8'],
    ember: ['#ffdd8b','#ff873d','#ff513b'],
    frost: ['#efffff','#9defff','#6fc2ee'],
    neon: ['#6afff2','#8ba5ff','#d78cff'],
    shadow: ['#b6a3d9','#78649e','#45355c'],
    rainbow: ['#ff8a9b','#ffcf69','#7ce7d5','#9aa6ff'],
    sakura: ['#ffd3e5','#f49dc5','#d9a5ff'],
    circuit: ['#fff48a','#65fff0','#76bfff'],
    leaf: ['#c6ed9a','#81c989','#b0a86d'],
    leaftrail: ['#c6ed9a','#81c989','#b0a86d']
  });

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

    ctx.globalAlpha = .16;
    ctx.fillStyle = '#ffffff';
    for (let i=0;i<4;i++) {
      const dx=2+randomAt(seed,180+i)*(w-4), dy=2+randomAt(seed,190+i)*(h-4);
      ctx.fillRect(x+dx,y+dy,.65,.65);
    }
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
    const map={fire:'ember',ice:'shard',toxic:'bubble',lightning:'bolt',circuit:'bolt',void:'orb',pixel:'pixel',cosmic:'star',confetti:'confetti',plasma:'orb',standard:'spark',
      dust:'dust',ember:'ember',frost:'shard',neon:'spark',shadow:'smoke',rainbow:'star',sakura:'petal',circuit:'spark',leaf:'leaf',
      tombstone:'dust',stone:'shard',rocket:'ember',freeze:'shard',burst:'spark',flames:'ember'};
    return map[effect]||'spark';
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
      particles:[],bursts:[],decals:[],lastFrame:0,lastAmbient:0,raf:0,destroyed:false,
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
      const progress=clamp(burst.age/burst.life,0,1);
      const radius=burst.maxRadius*(1-Math.pow(1-progress,2));
      const alpha=1-progress;
      ctx.save();ctx.globalAlpha=alpha*.75;
      const glow=ctx.createRadialGradient(burst.x,burst.y,1,burst.x,burst.y,Math.max(4,radius*.9));
      glow.addColorStop(0,burst.color);glow.addColorStop(.25,burst.color+'88');glow.addColorStop(1,'rgba(20,10,10,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(burst.x,burst.y,Math.max(4,radius*.9),0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=burst.color;ctx.lineWidth=Math.max(1.2,2.5*(1-progress));ctx.beginPath();ctx.arc(burst.x,burst.y,Math.max(1,radius),0,Math.PI*2);ctx.stroke();
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
      for(let i=instance.particles.length-1;i>=0;i--){
        const p=instance.particles[i];p.age+=dt;
        p.vx*=Math.pow(.985,dt*60);p.vy+=p.gravity*dt;
        p.x+=p.vx*dt;p.y+=p.vy*dt;p.rotation+=p.spin*dt;
        if(p.age>=p.life||p.x<-24||p.x>m.width+24||p.y<-24||p.y>m.height+24){instance.particles.splice(i,1);continue;}
        drawParticle(ctx,p);
      }
      for(let i=instance.bursts.length-1;i>=0;i--){
        const burst=instance.bursts[i];burst.age+=dt;
        if(burst.age>=burst.life){instance.bursts.splice(i,1);continue;}
        drawBurst(burst,ctx);
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

      if(!instance.reducedMotion||instance.particles.length||instance.bursts.length) {
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
    instance.impact=function(index,effect='standard',palette=null){
      const point=instance.cellCenter(index),m=instance.metrics;if(!point||!m)return;
      const colors=Array.isArray(palette)&&palette.length?palette:(EFFECT_COLORS[effect]||EFFECT_COLORS.standard);
      const isCoarse=coarsePointer();
      const count=isCoarse?15:24;
      const kind=effectKind(effect);
      instance.bursts.push({x:point.x,y:point.y,age:0,life:.72,maxRadius:Math.min(m.cellWidth,m.cellHeight)*(isCoarse?2.8:3.8),color:colors[0]});
      for(let i=0;i<count;i++){
        const angle=Math.PI*2*i/count+(Math.random()-.5)*.35;
        const speed=effect==='void'?22+Math.random()*28:65+Math.random()*125;
        const p=createParticle(point.x,point.y,Math.cos(angle)*speed,Math.sin(angle)*speed-(effect==='fire'?24:0),1.5+Math.random()*3.4,colors[i%colors.length],.48+Math.random()*.75,kind);
        if(effect==='void'){p.vx=-p.vx*.35;p.vy=-p.vy*.35;p.spin=4;}
        if(effect==='ice'){p.gravity=48;p.size*=1.15;}
        if(effect==='fire'){p.gravity=-28;p.life+=.25;}
        if(effect==='toxic'){p.vy=-Math.abs(p.vy)*.55;p.gravity=-8;}
        if(effect==='lightning'){p.life=.18+Math.random()*.13;p.size*=1.5;}
        addParticle(p);
      }
      if(effect==='fire'||effect==='standard'||effect==='plasma'){
        for(let i=0;i<5;i++)addParticle(createParticle(point.x+(Math.random()-.5)*10,point.y+(Math.random()-.5)*10,(Math.random()-.5)*14,-12-Math.random()*22,5+Math.random()*8,'rgba(70,65,65,.55)',.9+Math.random()*.55,'smoke'));
      }
      if(effect==='tombstone')instance.decals.push({type:'tombstone',x:point.x,y:point.y});
      start();
    };
    instance.trail=function(fromIndex,toIndex,effect='dust',playerId=null){
      const from=instance.cellCenter(Number.isInteger(fromIndex)?fromIndex:toIndex),to=instance.cellCenter(toIndex);
      if(!to)return;
      const colors=EFFECT_COLORS[effect]||EFFECT_COLORS[effect==='neon'?'circuit':'dust'];
      const kind=effectKind(effect);
      for(let i=0;i<4;i++){
        const t=(i+1)/5,x=from&&to?mix(from.x,to.x,t):to.x,y=from&&to?mix(from.y,to.y,t):to.y;
        const p=createParticle(x+(Math.random()-.5)*3,y+(Math.random()-.5)*3,(Math.random()-.5)*12,-8-Math.random()*15,1.3+Math.random()*2,colors[i%colors.length],.42+Math.random()*.4,kind,playerId);
        p.alpha=.78;p.gravity=kind==='ember'?-10:kind==='shard'?14:0;addParticle(p);
      }
      start();
    };
    instance.eliminate=function(index,effect='standard'){
      if(effect==='tombstone'){instance.impact(index,'tombstone',EFFECT_COLORS.dust);return;}
      const mapped=effect==='freeze'?'ice':effect==='rocket'?'fire':effect==='shadow'?'void':effect==='burst'?'lightning':effect==='flames'?'fire':effect;
      instance.impact(index,mapped,EFFECT_COLORS[mapped]||null);
    };
    instance.clearPlayerTrails=function(playerId){
      instance.particles=instance.particles.filter(p=>p.playerId!==playerId);
    };
    instance.clearTransient=function(){
      instance.particles=[];instance.bursts=[];instance.decals=[];
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
    version: '1.0.0',
    themeIds: Object.freeze(Object.keys(THEMES)),
    effectIds: Object.freeze(Object.keys(EFFECT_COLORS)),
    resolveTheme,
    paintPreview,
    mount
  });
});
