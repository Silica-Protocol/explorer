/* CanvasRenderer
   - Renders blocks & links from a data service onto a single canvas for performance
   - API: new CanvasRenderer(canvas, dataService, options)
   - start()/stop(), setViewport(), onNodeHover(cb)
*/
(function(window){
  function CanvasRenderer(canvas, dataService, opts={}){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dataService = dataService;
    this.running = false;
  this.rollOffset = 20;
  this._targetRoll = 20;
  this._rollSpeed = 0.08; // smoothing factor (higher => snappier scroll)
  this._autoscrollLocked = false;
  this.layout = Object.assign({ gap: 20, leftMargin: 48, lanes: 7, overlap: 0.25 }, (opts.layout||{}));
    this.options = Object.assign({maxNodes: 1000, nodeRadius:6}, opts);
    this._snapshot = { blocks: [], links: [], tips: [] };
    this._hoverCb = ()=>{};
    this._mouse = {x:0,y:0};
    this._hitIndex = null;

    // subscribe to data updates
    this.dataService.onUpdate(snap => { this._snapshot = snap; });

    // mouse events
    canvas.addEventListener('mousemove', (e)=>{
      const rect = canvas.getBoundingClientRect();
      this._mouse.x = e.clientX - rect.left;
      this._mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener('mouseleave', ()=>{ this._hoverCb(null); this._hitIndex = null; });
  }

  CanvasRenderer.prototype.start = function(){ if (this.running) return; this.running = true; this._loop(); };
  CanvasRenderer.prototype.stop = function(){ this.running = false; };

  CanvasRenderer.prototype.onNodeHover = function(cb){ this._hoverCb = cb; };

  CanvasRenderer.prototype.setLayoutOptions = function(opts){ if (!opts) return; Object.assign(this.layout, opts); };
  CanvasRenderer.prototype.setAutoscrollLocked = function(v){ this._autoscrollLocked = !!v; };
  CanvasRenderer.prototype.resetView = function(){ this.rollOffset = 20; this._targetRoll = 20; };

  CanvasRenderer.prototype.highlightCommittee = function(ids){
    // mark nodes in snapshot for brief highlight
    if (!this._snapshot || !this._snapshot.blocks) return;
    const set = new Set(ids);
    this._snapshot.blocks.forEach(b => { if (set.has(b.id)) b._is_delegate = true; });
    // clear after 15s
    setTimeout(()=>{ this._snapshot.blocks.forEach(b=>b._is_delegate=false); }, 15000);
  };

  CanvasRenderer.prototype._loop = function(){ if (!this.running) return; this._render(); requestAnimationFrame(this._loop.bind(this)); };

  CanvasRenderer.prototype._render = function(){
    const ctx = this.ctx; const cvs = this.canvas;
    const w = cvs.width; const h = cvs.height;
    ctx.clearRect(0,0,w,h);

    const blocks = this._snapshot.blocks || [];
    const links = this._snapshot.links || [];

  // Layout: use configured layout values so UI controls (if any) take effect
    const gap = (this.layout && this.layout.gap) ? this.layout.gap : Math.max(32, Math.floor(cvs.clientWidth / 20));
    const leftMargin = (this.layout && this.layout.leftMargin) ? this.layout.leftMargin : 48;
    const count = blocks.length;
  const posX = new Map();
  const posY = new Map();
    // lanes and overlap driven by layout controls
    const lanes = Math.max(1, (this.layout && this.layout.lanes) ? this.layout.lanes : 1);
    const overlap = Math.max(0, Math.min(1, (this.layout && this.layout.overlap) ? this.layout.overlap : 0.25));
    const pad = 40;
    const laneHeight = (cvs.clientHeight - pad*2) / Math.max(1, lanes - 1 || 1);
  for (let i = 0; i < count; i++){
      const b = blocks[i];
      const idx = i; // chronological
      const vx = leftMargin + idx * gap;
      posX.set(b.id, vx);
      if (lanes <= 1) {
        // center line with slight vertical jitter based on stored y
        posY.set(b.id, Math.floor(cvs.clientHeight/2 + (b.y - (window.innerHeight/2 || 0)) * 0.08));
      } else {
        const lane = idx % lanes;
        // base vy for lane
        const baseVy = Math.floor(pad + lane * (laneHeight));
        // overlap pulls nodes toward center: compute offset from lane center
        const laneCenter = pad + (laneHeight * 0.5) + lane * laneHeight;
        const jitter = Math.floor((b.y - window.innerHeight/2) * 0.03);
        const vy = Math.floor(baseVy + (laneCenter - baseVy) * overlap + jitter * overlap);
        posY.set(b.id, vy);
      }
    }

    // compute target roll offset so newest visual node pushes from right edge
    if (count) {
      const maxVisualX = posX.get(blocks[count-1].id);
      const targetRaw = Math.max(0, maxVisualX - (cvs.clientWidth * 0.78));
      // only allow the target to increase (never scroll back left)
      this._targetRoll = Math.max(this._targetRoll || 0, targetRaw);
    }
    // smooth towards target
    this.rollOffset += (this._targetRoll - this.rollOffset) * this._rollSpeed;

    // draw links with age-based fading (recent links highlighted)
    // build id->index and id->block maps for fast lookup
    const idToIndex = new Map(); const idToBlock = new Map();
    for (let i=0;i<blocks.length;i++){ idToIndex.set(blocks[i].id, i); idToBlock.set(blocks[i].id, blocks[i]); }
    ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = '#bfc7cc';
    // limit link rendering to recent window to reduce overdraw
    const recentWindow = Math.min(blocks.length, 400);
    const fadeWindow = 28; // widen window so links fade less abruptly
    for (let i=links.length-1;i>=0;i--){
      const l = links[i];
      const s = idToBlock.get(l.source);
      const t = idToBlock.get(l.target);
      if (!s||!t) continue;
      const sx = (posX.has(s.id) ? posX.get(s.id) : s.x) - this.rollOffset;
      const sy = (posY.has(s.id) ? posY.get(s.id) : s.y);
      const tx = (posX.has(t.id) ? posX.get(t.id) : t.x) - this.rollOffset;
      const ty = (posY.has(t.id) ? posY.get(t.id) : t.y);
      const srcIdx = idToIndex.has(s.id) ? idToIndex.get(s.id) : 0;
      const age = blocks.length - srcIdx; // 1 = newest
      // skip very old links
      if (age > recentWindow) continue;
      const alpha = Math.max(0.12, Math.min(0.95, 1 - ((age-1) / fadeWindow)));
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.globalAlpha = alpha * 0.95; ctx.stroke();
    }
    ctx.globalAlpha = 1.0; ctx.restore();

  // store layout maps for hover checks when paused
  this._lastLayout = { posX: posX, posY: posY, blocksSnapshot: blocks.slice() };

    // draw nodes (fixed-size squared cards, uniform aesthetic color)
    const rBase = this.options.nodeRadius;
    let hitFound = null;
  const fixedSize = this.options.nodeSize || 48;
    const halfFixed = Math.floor(fixedSize/2);
    const nodeFill = this.options.nodeFill || '#2b6f5f';
    const nodeText = this.options.nodeText || '#ffffff';
    for (let i=0;i<blocks.length;i++){
      const b = blocks[i];
      const rawX = posX.has(b.id) ? posX.get(b.id) : b.x;
      const rawY = posY.has(b.id) ? posY.get(b.id) : b.y;
      const x = Math.floor(rawX - this.rollOffset);
      const y = Math.floor(rawY);
      // fixed-size square with rounded corners
      ctx.save(); ctx.beginPath(); const rad = 6;
      roundedRect(ctx, x-halfFixed, y-halfFixed, fixedSize, fixedSize, rad);
      ctx.fillStyle = nodeFill; ctx.fill();
      ctx.lineWidth = b._is_delegate ? 3 : 1; ctx.strokeStyle = b._is_delegate ? '#ffd86b' : '#0b0b0b'; ctx.stroke(); ctx.restore();

      // show Confirmation Score inside square (replace reputation)
      const conf = (typeof b.confirmationScore !== 'undefined') ? b.confirmationScore : Math.round((b.reputation||0)*8);
      ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle = nodeText; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      // top small label: id truncated if room
      const idText = String(b.id).slice(-4);
      ctx.fillStyle = nodeText; ctx.strokeText(idText, x, y - 8); ctx.fillText(idText, x, y - 8);
      // center: Confirmation Score
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(String(conf), x, y + 4); ctx.fillText(String(conf), x, y + 4);

      // tx count tiny at bottom-right
      ctx.font = '10px JetBrains Mono, monospace'; ctx.textAlign='right'; ctx.textBaseline='bottom'; ctx.strokeText(String(b.transactionCount), x + halfFixed - 4, y + halfFixed - 4); ctx.fillText(String(b.transactionCount), x + halfFixed - 4, y + halfFixed - 4);

      // hit test using fixed square bounds
      if (this._mouse.x >= x - halfFixed && this._mouse.x <= x + halfFixed && this._mouse.y >= y - halfFixed && this._mouse.y <= y + halfFixed) {
        hitFound = b;
      }
    }

    // helper: roundedRect
    function roundedRect(ctx, x, y, w, h, r) {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    // hover callback
    if (hitFound) {
      if (!this._hitIndex || this._hitIndex.id !== hitFound.id) {
        this._hitIndex = hitFound; this._hoverCb(hitFound);
      }
    } else if (this._hitIndex) {
      this._hitIndex = null; this._hoverCb(null);
    }
  };

  CanvasRenderer.prototype.setTempo = function(tempo){
    // tempo: numeric multiplier (e.g., 0.25, 1, 2, 3) — map to roll smoothing speed
    const t = Math.max(0.25, Number(tempo) || 1);
    this._rollSpeed = Math.min(0.35, 0.06 * t);
  };

  // public pick method: returns node under given canvas coords using last layout
  CanvasRenderer.prototype.pickAt = function(px, py){
    if (!this._lastLayout) return null;
    const posX = this._lastLayout.posX;
    const posY = this._lastLayout.posY;
    const blocks = this._lastLayout.blocksSnapshot || [];
    for (let i=blocks.length-1;i>=0;i--) {
      const b = blocks[i];
      const rawX = posX.has(b.id) ? posX.get(b.id) : b.x;
      const rawY = posY.has(b.id) ? posY.get(b.id) : b.y;
      const x = Math.floor(rawX - this.rollOffset);
      const y = Math.floor(rawY);
  const size = this.options.nodeSize || 48;
  const half = Math.floor(size/2);
  if (px >= x-half && px <= x+half && py >= y-half && py <= y+half) return b;
    }
    return null;
  };

  window.CanvasRenderer = CanvasRenderer;
})(window);
