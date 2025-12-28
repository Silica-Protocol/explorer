/* WebGLRenderer
   - Renders DAG nodes and links using WebGL point sprites and lines
   - Uses a CPU quadtree for spatial indexing (hit testing & LOD selection)
   - API: new WebGLRenderer(canvas, dataService, opts)
   - Methods: start(), stop(), onNodeHover(cb)
*/
(function(window){
  // Simple Quadtree for 2D points (loose, single capacity subdiv)
  function Quadtree(x,y,w,h,capacity){
    this.x = x; this.y = y; this.w = w; this.h = h; this.capacity = capacity || 8;
    this.points = [];
    this.divided = false;
  }
  Quadtree.prototype.insert = function(p){
    if (p.x < this.x || p.x > this.x + this.w || p.y < this.y || p.y > this.y + this.h) return false;
    if (this.points.length < this.capacity){ this.points.push(p); return true; }
    if (!this.divided) this.subdivide();
    return this.nw.insert(p) || this.ne.insert(p) || this.sw.insert(p) || this.se.insert(p);
  };
  Quadtree.prototype.subdivide = function(){
    const hw = this.w/2, hh = this.h/2;
    this.nw = new Quadtree(this.x, this.y, hw, hh, this.capacity);
    this.ne = new Quadtree(this.x+hw, this.y, hw, hh, this.capacity);
    this.sw = new Quadtree(this.x, this.y+hh, hw, hh, this.capacity);
    this.se = new Quadtree(this.x+hw, this.y+hh, hw, hh, this.capacity);
    this.divided = true;
    // move points into children
    const pts = this.points; this.points = [];
    for (let i=0;i<pts.length;i++) this.insert(pts[i]);
  };
  Quadtree.prototype.queryCircle = function(cx,cy,r,found){
    found = found || [];
    // quick AABB check
    const x0 = this.x, y0 = this.y, x1 = this.x+this.w, y1 = this.y+this.h;
    const closestX = Math.max(x0, Math.min(cx, x1));
    const closestY = Math.max(y0, Math.min(cy, y1));
    const dx = closestX - cx, dy = closestY - cy;
    if (dx*dx + dy*dy > r*r) return found;
    for (let i=0;i<this.points.length;i++){ const p=this.points[i]; const dx=p.x-cx, dy=p.y-cy; if (dx*dx+dy*dy <= r*r) found.push(p); }
    if (this.divided){ this.nw.queryCircle(cx,cy,r,found); this.ne.queryCircle(cx,cy,r,found); this.sw.queryCircle(cx,cy,r,found); this.se.queryCircle(cx,cy,r,found); }
    return found;
  };

  function compileShader(gl, src, type){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); gl.deleteShader(s); return null; } return s; }
  function createProgram(gl, vsSrc, fsSrc){ const vs = compileShader(gl, vsSrc, gl.VERTEX_SHADER); const fs = compileShader(gl, fsSrc, gl.FRAGMENT_SHADER); const p = gl.createProgram(); gl.attachShader(p,vs); gl.attachShader(p,fs); gl.linkProgram(p); if(!gl.getProgramParameter(p, gl.LINK_STATUS)){ console.error(gl.getProgramInfoLog(p)); return null; } return p; }

  function WebGLRenderer(canvas, dataService, opts){
    this.canvas = canvas;
    // try WebGL2 first, then WebGL, then experimental-webgl
    this.gl = null;
    try { this.gl = canvas.getContext('webgl2', { antialias: true }); this._isWebGL2 = !!this.gl; } catch(e) { this.gl = null; }
    if (!this.gl) {
      try { this.gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl'); } catch(e) { this.gl = null; }
      this._isWebGL2 = false;
    }
    if (!this.gl) {
      const err = new Error('WebGL not available. Enable hardware acceleration or use a WebGL-capable browser (try Chrome/Firefox with GPU acceleration).');
      try { if (window && typeof window.__webglInitFailed === 'function') window.__webglInitFailed(err.message); } catch(e) {}
      throw err;
    }
    this.dataService = dataService; this.opts = Object.assign({nodeRadius:6, maxPoints:5000}, opts);
    this.running = false; this._snapshot = {blocks:[], links:[]}; this._hoverCb = ()=>{}; this._mouse = {x:0,y:0};
  this._dpr = window.devicePixelRatio || 1;
  this.rollOffset = 20;
  this._targetRoll = 20;
  this._rollSpeed = 0.08;
  this._autoscrollLocked = false;
  // layout options for timeline mode
  this.layout = Object.assign({ gap: Math.max(28, Math.min(80, Math.floor((window.innerWidth||800)/20))), leftMargin: 40, lanes: 1, overlap: 0.4 }, (opts.layout||{}));

    // shaders
    const vs = "attribute vec2 a_pos; attribute float a_size; attribute vec4 a_color; uniform vec2 u_resolution; varying vec4 v_color; void main(){ vec2 zeroToOne = a_pos / u_resolution; vec2 clip = zeroToOne * 2.0 - 1.0; gl_Position = vec4(clip * vec2(1.0, -1.0), 0, 1); gl_PointSize = a_size; v_color = a_color; }";
    const fs = "precision mediump float; varying vec4 v_color; void main(){ vec2 c = gl_PointCoord - vec2(0.5); if(length(c) > 0.5) discard; gl_FragColor = v_color; }";
    this.program = createProgram(this.gl, vs, fs);
    this.a_pos = this.gl.getAttribLocation(this.program, 'a_pos');
    this.a_size = this.gl.getAttribLocation(this.program, 'a_size');
    this.a_color = this.gl.getAttribLocation(this.program, 'a_color');
    this.u_resolution = this.gl.getUniformLocation(this.program, 'u_resolution');

    // buffers
    this.posBuf = this.gl.createBuffer();
    this.sizeBuf = this.gl.createBuffer();
    this.colorBuf = this.gl.createBuffer();

    // link program (simple lines) - reuse same program but draw as LINES with size ignored

    // quadtree and mouse
    this._quadtree = null;
    this.canvas.addEventListener('mousemove', (e)=>{ const r=this.canvas.getBoundingClientRect(); const mx=(e.clientX-r.left); const my=(e.clientY-r.top); this._mouse.x = mx; this._mouse.y = my; });
    this.canvas.addEventListener('mouseleave', ()=>{ this._hoverCb(null); });

    // subscribe
  this.dataService.onUpdate(snap => { this._snapshot = snap; });
  }

  WebGLRenderer.prototype.onNodeHover = function(cb){ this._hoverCb = cb; };
  
  WebGLRenderer.prototype.setLayoutOptions = function(opts){
    if (!opts) return; Object.assign(this.layout, opts);
  };

  WebGLRenderer.prototype.setAutoscrollLocked = function(v){ this._autoscrollLocked = !!v; };

  WebGLRenderer.prototype.resetView = function(){ this.rollOffset = 20; this._targetRoll = 20; };
  WebGLRenderer.prototype.start = function(){ if (this.running) return; this.running = true; this._loop(); };
  WebGLRenderer.prototype.stop = function(){ this.running = false; };

  WebGLRenderer.prototype._loop = function(){ if (!this.running) return; this._render(); requestAnimationFrame(this._loop.bind(this)); };

  WebGLRenderer.prototype._buildIndex = function(width,height){
  // build quadtree from current snapshot; ensure bounds include all block coordinates
  const blocks = this._snapshot.blocks || [];
  if (!blocks.length) { this._quadtree = new Quadtree(0,0,Math.max(1,width),Math.max(1,height),8); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i=0;i<blocks.length;i++){ const b = blocks[i]; if (b.x < minX) minX = b.x; if (b.x > maxX) maxX = b.x; if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y; }
  // pad bounds slightly
  const pad = 40;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.max(maxX + pad, width);
  maxY = Math.max(maxY + pad, height);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  this._quadtree = new Quadtree(minX, minY, w, h, 8);
  for (let i=0;i<blocks.length;i++){ const b=blocks[i]; this._quadtree.insert({x: b.x, y: b.y, id: b.id, node: b}); }
  };

  WebGLRenderer.prototype._render = function(){
    const gl = this.gl; const cvs = this.canvas;
    // ensure canvas resolution matches size * dpr
    const cssW = Math.max(1, cvs.clientWidth); const cssH = Math.max(1, cvs.clientHeight);
    const dpr = this._dpr;
    if (cvs.width !== Math.floor(cssW*dpr) || cvs.height !== Math.floor(cssH*dpr)){
      cvs.width = Math.floor(cssW*dpr); cvs.height = Math.floor(cssH*dpr); gl.viewport(0,0,cvs.width,cvs.height);
    }

    const blocks = this._snapshot.blocks || [];
    const links = this._snapshot.links || [];

    // Layout: compute visual X (timeline) with fixed spacing and lanes, allow vertical overlap
    const gap = this.layout.gap || Math.max(28, Math.floor(cssW/20));
    const leftMargin = this.layout.leftMargin || 40;
    // compute lanes heuristically if not set
    let lanes = this.layout.lanes || Math.max(1, Math.floor(cssH / 80));
    lanes = Math.max(1, lanes);
    const overlap = (typeof this.layout.overlap === 'number') ? this.layout.overlap : 0.4;

    // Build visual positions for drawBlocks
    const pos = new Array(blocks.length);
    for (let i=0;i<blocks.length;i++){
      const idx = i;
      const vx = leftMargin + idx * gap;
      let vy;
      if (lanes <= 1) {
        // center with slight jitter derived from original y, scaled by overlap
        vy = Math.floor(cssH/2 + (blocks[i].y - (window.innerHeight/2 || 0)) * 0.12 * (1 - overlap));
      } else {
        const lane = idx % lanes;
        const pad = 40;
        vy = Math.floor(pad + lane * ((cssH - pad*2) / Math.max(1, lanes-1)));
        // allow slight overlap: move towards center by overlap factor
        const center = cssH/2;
        vy = Math.floor(vy + (center - vy) * overlap);
      }
      pos[i] = { x: vx, y: vy, id: blocks[i].id };
    }

    // compute target roll offset so newest visual node pushes from right edge
    if (!this._autoscrollLocked && blocks.length) {
      const maxVisualX = pos[blocks.length-1].x;
      const targetRaw = Math.max(0, maxVisualX - (cssW * 0.78));
      // only allow the target to increase (never scroll back left)
      this._targetRoll = Math.max(this._targetRoll || 0, targetRaw);
    }
    // smooth towards target
    this.rollOffset += (this._targetRoll - this.rollOffset) * this._rollSpeed;

    // LOD: determine how many points to draw based on maxPoints
    const maxPoints = this.opts.maxPoints || 5000;
    let drawBlocks = blocks;
    if (blocks.length > maxPoints){ // simple LOD: sample recent blocks
      drawBlocks = blocks.slice(-maxPoints);
    }

    // build quadtree for hit testing using visual coords
    // adapt _buildIndex behavior: create quadtree covering visual extents
    if (blocks.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i=0;i<pos.length;i++){ const p = pos[i]; if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
      const pad = 40;
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.max(maxX + pad, cssW); maxY = Math.max(maxY + pad, cssH);
      const wq = Math.max(1, maxX - minX); const hq = Math.max(1, maxY - minY);
      this._quadtree = new Quadtree(minX, minY, wq, hq, 8);
      for (let i=0;i<pos.length;i++){ const p = pos[i]; this._quadtree.insert({ x: p.x, y: p.y, id: p.id, node: blocks[i] }); }
    } else {
      this._quadtree = new Quadtree(0,0,Math.max(1,cssW),Math.max(1,cssH),8);
    }

    // upload buffers
    const n = drawBlocks.length;
    const posData = new Float32Array(n*2);
    const sizeData = new Float32Array(n);
    const colorData = new Float32Array(n*4);
  for (let i=0;i<n;i++){ const b=drawBlocks[i]; const layoutIndex = blocks.indexOf(b); const rawX = (layoutIndex >=0 && layoutIndex < pos.length) ? pos[layoutIndex].x : b.x; const rawY = (layoutIndex>=0 && layoutIndex < pos.length) ? pos[layoutIndex].y : b.y; const x = rawX - this.rollOffset; const y = rawY; posData[i*2]=x; posData[i*2+1]=y; sizeData[i]=Math.max(4, Math.min(24, this.opts.nodeRadius + (b.transactionCount||0)/6)); const g=Math.round(255*Math.min(1,b.reputation||0)); let rcol=255-g; let gcol=g; if (b._is_delegate) { rcol = 240; gcol = 200; } colorData[i*4]=rcol/255; colorData[i*4+1]=gcol/255; colorData[i*4+2]=120/255; colorData[i*4+3]=1.0; }

    // bind and enable attributes
    gl.useProgram(this.program);
    gl.uniform2f(this.u_resolution, cssW, cssH);

    // positions
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf); gl.bufferData(gl.ARRAY_BUFFER, posData, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(this.a_pos); gl.vertexAttribPointer(this.a_pos,2,gl.FLOAT,false,0,0);
    // sizes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuf); gl.bufferData(gl.ARRAY_BUFFER, sizeData, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(this.a_size); gl.vertexAttribPointer(this.a_size,1,gl.FLOAT,false,0,0);
    // colors
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuf); gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(this.a_color); gl.vertexAttribPointer(this.a_color,4,gl.FLOAT,false,0,0);

    // clear
    gl.clearColor(0.04,0.04,0.04,1.0); gl.clear(gl.COLOR_BUFFER_BIT);

    // draw links (simple cpu->gl lines) - draw only for drawn blocks
    // We'll draw links with canvas 2D overlay fallback if too complex; for now skip drawing links in WebGL to keep shader simple.

    // draw points
    gl.drawArrays(gl.POINTS, 0, n);

  // hover detection via quadtree: query small radius; mouse coords adjusted to visual space
  const radius = 16;
  const queryX = this._mouse.x + this.rollOffset;
  const found = this._quadtree.queryCircle(queryX, this._mouse.y, radius, []);
    if (found && found.length) {
      // pick closest
      let best = found[0]; let bestd = Infinity;
      for (let i=0;i<found.length;i++){ const p=found[i]; const dx=p.x-this._mouse.x, dy=p.y-this._mouse.y, d=dx*dx+dy*dy; if (d<bestd){ bestd=d; best=p; } }
      this._hoverCb(best.node);
    } else {
      this._hoverCb(null);
    }
  };

  window.WebGLRenderer = WebGLRenderer;
})(window);
