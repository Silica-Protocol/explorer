/* MockDataService
   - Emits simulated DAG blocks, links, reputation and election events
   - API: start(), stop(), onUpdate(cb), getSnapshot()
   - Designed so it can be replaced by a real API client (same interface)
*/
(function(window){
  function MockDataService(opts = {}) {
  this.opts = Object.assign({ interval: 140, maxTips: 200, initialCommittee: null, maxBlocks: 800 }, opts);
    this.running = false;
    this.blocks = [];
    this.links = [];
    this.tips = [];
  this.events = []; // transient event queue (vdf, finality, election)
    this.blockId = 1;
    this.subscribers = [];
    this._lastTick = performance.now();
    this.nextElectionTime = Date.now() + 60000; // schedule first election ~60s
    this.simStart = Date.now();
    this._baselineInterval = 140;
  }

  MockDataService.prototype._notify = function() {
  const snapshot = this.getSnapshot();
  this.subscribers.forEach(cb => cb(snapshot));
  // clear transient events after notify so they're delivered once
  this.events = [];
  };

  MockDataService.prototype.onUpdate = function(cb) {
    this.subscribers.push(cb);
  };

  MockDataService.prototype.getSnapshot = function() {
    return {
      blocks: this.blocks.slice(),
      links: this.links.slice(),
      tips: this.tips.slice(),
  now: performance.now(),
  events: this.events.slice(),
  nextElectionTime: this.nextElectionTime
    };
  };

  MockDataService.prototype.start = function() {
  if (this.running) return; this.running = true;
  // seed an initial committee immediately so UI is not empty
  if (this.opts.initialCommittee && Array.isArray(this.opts.initialCommittee)) {
    this.events.push({ time: Date.now(), type: 'election', committee: this.opts.initialCommittee.slice() });
  } else if (this.blocks.length < 8) {
    for (let i=0;i<8;i++) this._generateBlock();
    const sorted = this.blocks.slice(-400).sort((a,b)=>b.reputation-a.reputation);
    const committee = sorted.slice(0,8).map(n=>n.id);
    this.events.push({ time: Date.now(), type: 'election', committee: committee });
  } else {
    const sorted = this.blocks.slice(-400).sort((a,b)=>b.reputation-a.reputation);
    const committee = sorted.slice(0,8).map(n=>n.id);
    this.events.push({ time: Date.now(), type: 'election', committee: committee });
  }

  // start generation loop
  this._loop();
  // schedule election timer based on tempo-scaled period
  const period = this._computeElectionPeriodMs();
  this.nextElectionTime = Date.now() + period;
  if (this._electionInterval) clearInterval(this._electionInterval);
  this._electionInterval = setInterval(() => { this._runElection(); this._notify(); this.nextElectionTime = Date.now() + this._computeElectionPeriodMs(); }, period);
  };

  MockDataService.prototype.stop = function() { this.running = false; if (this._electionInterval) { clearInterval(this._electionInterval); this._electionInterval = null; } };

  // lightweight block generator
  MockDataService.prototype._loop = function() {
    if (!this.running) return;
    const now = performance.now();
    if (now - this._lastTick >= this.opts.interval) {
      this._lastTick = now;
      this._generateBlock();
      this._maybeFinalize();
      if (Math.random() < 0.06) this.events.push({ time: now, type: 'vdf' });
      this._notify();
    }
    // use setTimeout to control generation cadence without blocking RAF
    setTimeout(this._loop.bind(this), 8);
  };
  MockDataService.prototype._generateBlock = function() {
    const miningAlgorithms = ['kawpow','randomx','fah','boinc'];
    const teams = ['alpha','beta','gamma','delta'];
    const pick = arr => arr[Math.floor(Math.random()*arr.length)];

    const txCount = Math.floor(Math.random()*60)+1;
    const rep = Math.min(1, Math.max(0, 0.2 + Math.random()*0.8));
    const algo = pick(miningAlgorithms);
    const team = pick(teams);

    const parentId = this.tips.length ? this.tips[Math.floor(Math.random()*this.tips.length)] : null;
    const parentX = parentId ? (this.blocks.find(b=>b.id===parentId)||{x: window.innerWidth*0.6}).x : window.innerWidth*0.6;

    const node = {
      id: this.blockId++,
      x: parentX + (Math.random()*40 + 40),
      y: (window.innerHeight/2) + (Math.random()-0.5)* (window.innerHeight*0.55),
      miningAlgorithm: algo,
      validationTeam: team,
      transactionCount: txCount,
  reputation: rep,
  confirmationScore: 0,
      timestamp: Date.now()
    };
    this.blocks.push(node);
    if (parentId) this.links.push({ source: node.id, target: parentId });
    this.tips.push(node.id);
    if (this.tips.length > this.opts.maxTips) this.tips.shift();

    // prune old blocks to avoid unbounded growth and long-term jitter
    if (this.blocks.length > this.opts.maxBlocks) {
      const removeCount = this.blocks.length - this.opts.maxBlocks;
      const removed = this.blocks.splice(0, removeCount);
      const removedIds = new Set(removed.map(b => b.id));
      // drop links referencing removed blocks
      this.links = this.links.filter(l => !removedIds.has(l.source) && !removedIds.has(l.target));
      // trim tips that no longer exist
      this.tips = this.tips.filter(id => !removedIds.has(id));
      // adjust blockId? keep increasing to remain unique
    }
  };

  MockDataService.prototype._maybeFinalize = function() {
    // randomly finalize some older blocks
    if (this.blocks.length > 30 && Math.random() < 0.15) {
      // finalize earliest non-finalized by removing from active set
      const idx = Math.floor(Math.random()*Math.min(20, this.blocks.length/2));
      const b = this.blocks[idx];
      if (b) {
  b.finalized = true;
        // small rep reward
        b.reputation = Math.min(1, b.reputation + 0.03);
        // remove from tips if present
        this.tips = this.tips.filter(id => id !== b.id);
    // emit finality event
  this.events.push({ time: Date.now(), type: 'finality', blockId: b.id });
      }
    }
    // occasional mock election
    if (Math.random() < 0.02) {
      // boost a handful of high-rep nodes
      const sorted = this.blocks.slice(-400).sort((a,b)=>b.reputation-a.reputation);
      sorted.slice(0,8).forEach(n=> n.reputation = Math.min(1, n.reputation + 0.05));
    }
  };

  MockDataService.prototype._runElection = function() {
    // pick top reputation nodes from recent blocks and boost them
    if (this.blocks.length === 0) return;
    const windowSlice = this.blocks.slice(-400);
    windowSlice.sort((a,b)=>b.reputation - a.reputation);
    const committee = windowSlice.slice(0,8);
    committee.forEach(n => { n.reputation = Math.min(1, n.reputation + 0.05); n._is_delegate = true; });
    // update confirmationScore for recent blocks (naive: count how many tips they reference within window D)
    const D = 8;
    for (let i = Math.max(0, this.blocks.length - 200); i < this.blocks.length; i++){
      const b = this.blocks[i];
      // naive: set confirmationScore = min(8, random-ish based on tx and reputation)
      b.confirmationScore = Math.min(8, Math.floor((b.reputation||0)*6 + (b.transactionCount/10)));
    }
    // clear the delegate flag after short time
    setTimeout(()=> committee.forEach(n => { n._is_delegate = false; }), 20000);
    // emit election event
    this.events.push({ time: Date.now(), type: 'election', committee: committee.map(c=>c.id) });
    // reset next election time based on tempo
    this.nextElectionTime = Date.now() + this._computeElectionPeriodMs();
  };

  MockDataService.prototype._computeElectionPeriodMs = function(){
    // election period scales with sampling interval: faster interval -> shorter election period
    const interval = (this.opts && this.opts.interval) ? this.opts.interval : this._baselineInterval;
    const factor = this._baselineInterval / interval; // e.g., interval halved => factor=2
    const baseMs = 60000;
    const period = Math.max(1000, Math.round(baseMs / Math.max(0.0001, factor)));
    // but we want period shorter when factor>1: so period = baseMs / factor
    return Math.max(1000, Math.round(baseMs / Math.max(0.0001, factor)));
  };

  MockDataService.prototype.updateInterval = function(newInterval){
    // newInterval is ms per generated block
    this.opts.interval = newInterval;
    // restart election timer using new period
    const period = this._computeElectionPeriodMs();
    if (this._electionInterval) { clearInterval(this._electionInterval); }
    this.nextElectionTime = Date.now() + period;
    if (this.running) this._electionInterval = setInterval(() => { this._runElection(); this._notify(); this.nextElectionTime = Date.now() + this._computeElectionPeriodMs(); }, period);
  };

  window.MockDataService = MockDataService;
})(window);
