import { ChangeDetectionStrategy, Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import type { BlockSummary } from '@silica-protocol/explorer-models';

interface BlockVisual {
  id: string;
  hash: string;
  txCount: number;
  timestamp: number;
  x: number;
  y: number;
  opacity: number;
  scale: number;
}

@Component({
  selector: 'block-visualizer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="visualizer" aria-label="Block production visualizer">
      <div class="visualizer__header">
        <div class="visualizer__title">
          <h1>Block Stream</h1>
          <p>Real-time block production</p>
        </div>
        <div class="visualizer__stats">
          <div class="stat">
            <span class="stat-value">{{ blocksPerSecond | number:'1.1-1' }}</span>
            <span class="stat-label">blocks/sec</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ totalBlocks }}</span>
            <span class="stat-label">total blocks</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ totalTransactions | number }}</span>
            <span class="stat-label">transactions</span>
          </div>
        </div>
      </div>

      <div class="visualizer__canvas" #canvas>
        <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" class="visualizer-svg">
          <defs>
            <linearGradient id="blockGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0ea5e9"/>
              <stop offset="100%" stop-color="#14b8a6"/>
            </linearGradient>
            <linearGradient id="blockGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.6"/>
              <stop offset="100%" stop-color="#14b8a6" stop-opacity="0.3"/>
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="intenseGlow">
              <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <g class="connections">
            <line
              *ngFor="let conn of connections"
              [attr.x1]="conn.x1"
              [attr.y1]="conn.y1"
              [attr.x2]="conn.x2"
              [attr.y2]="conn.y2"
              class="connection-line"
              [style.opacity]="conn.opacity"
            />
          </g>

          <g class="blocks">
            <g
              *ngFor="let block of displayedBlocks"
              class="block-group"
              [attr.transform]="'translate(' + block.x + ',' + block.y + ')'"
              [style.opacity]="block.opacity"
            >
              <rect
                class="block-glow"
                [attr.x]="-blockSize/2 - 4"
                [attr.y]="-blockSize/2 - 4"
                [attr.width]="blockSize + 8"
                [attr.height]="blockSize + 8"
                rx="8"
                fill="url(#blockGlow)"
                [style.filter]="'blur(8px)'"
              />
              <rect
                class="block"
                [attr.x]="-blockSize/2"
                [attr.y]="-blockSize/2"
                [attr.width]="blockSize"
                [attr.height]="blockSize"
                rx="6"
                fill="url(#blockGradient)"
                [attr.transform]="'rotate(' + (block.timestamp % 360) + ')'"
                [style.filter]="'url(#glow)'"
              />
              <text
                class="block-hash"
                [attr.x]="0"
                [attr.y]="0"
                text-anchor="middle"
                dominant-baseline="middle"
                fill="white"
                font-size="8"
              >{{ formatHash(block.hash) }}</text>
              <text
                class="block-tx"
                [attr.x]="0"
                [attr.y]="blockSize/2 + 12"
                text-anchor="middle"
                fill="#94a3b8"
                font-size="9"
              >{{ block.txCount }} tx{{ block.txCount !== 1 ? 's' : '' }}</text>
            </g>
          </g>
        </svg>

        <div class="visualizer__speed-lines" *ngIf="showSpeedLines">
          <div class="speed-line" *ngFor="let i of [1,2,3,4,5]"></div>
        </div>
      </div>

      <div class="visualizer__info">
        <p>Watch blocks being produced in real-time</p>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .visualizer {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        width: 100%;
        background: linear-gradient(180deg, rgba(14, 165, 233, 0.02) 0%, rgba(20, 184, 166, 0.02) 100%);
        border: 1px solid rgba(14, 165, 233, 0.15);
        border-radius: 20px;
        padding: 1.5rem;
        overflow: hidden;
      }

      .visualizer__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
      }

      .visualizer__title h1 {
        font-size: var(--h1-size);
        margin: 0;
        background: var(--gradient-h1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .visualizer__title p {
        margin: 0.25rem 0 0;
        color: var(--text-secondary);
        font-size: 0.9rem;
      }

      .visualizer__stats {
        display: flex;
        gap: 2rem;
      }

      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.15rem;
      }

      .stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        background: var(--gradient-h1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-family: 'JetBrains Mono', monospace;
      }

      .stat-label {
        font-size: 0.75rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .visualizer__canvas {
        position: relative;
        width: 100%;
        height: 300px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 16px;
        overflow: hidden;
      }

      .visualizer-svg {
        width: 100%;
        height: 100%;
      }

      .connection-line {
        stroke: url(#blockGradient);
        stroke-width: 2;
        stroke-linecap: round;
        fill: none;
      }

      .block-group {
        transition: transform 0.3s ease, opacity 0.3s ease;
        cursor: pointer;
      }

      .block-group:hover .block {
        filter: url(#intenseGlow);
      }

      .block {
        transition: all 0.2s ease;
      }

      .block-hash {
        font-family: 'JetBrains Mono', monospace;
        font-weight: 600;
        pointer-events: none;
      }

      .visualizer__speed-lines {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        overflow: hidden;
      }

      .speed-line {
        position: absolute;
        height: 2px;
        background: linear-gradient(90deg, transparent, #0ea5e9, transparent);
        animation: speedLine 1s linear infinite;
        opacity: 0.5;
      }

      .speed-line:nth-child(1) { top: 20%; animation-delay: 0s; animation-duration: 0.8s; }
      .speed-line:nth-child(2) { top: 40%; animation-delay: 0.2s; animation-duration: 1s; }
      .speed-line:nth-child(3) { top: 60%; animation-delay: 0.4s; animation-duration: 0.7s; }
      .speed-line:nth-child(4) { top: 80%; animation-delay: 0.1s; animation-duration: 0.9s; }
      .speed-line:nth-child(5) { top: 50%; animation-delay: 0.3s; animation-duration: 1.1s; }

      @keyframes speedLine {
        0% { left: 150%; width: 30%; }
        100% { left: -100%; width: 50%; }
      }

      .visualizer__info {
        text-align: center;
        color: var(--text-secondary);
        font-size: 0.85rem;
        margin: 0;
      }

      @media (max-width: 640px) {
        .visualizer__stats {
          gap: 1rem;
        }

        .stat-value {
          font-size: 1.2rem;
        }

        .visualizer__canvas {
          height: 250px;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlockVisualizerComponent implements OnInit, OnDestroy {
  displayedBlocks: BlockVisual[] = [];
  connections: Array<{x1: number; y1: number; x2: number; y2: number; opacity: number}> = [];
  
  width = 800;
  height = 300;
  blockSize = 40;
  
  blocksPerSecond = 0;
  totalBlocks = 0;
  totalTransactions = 0;
  showSpeedLines = true;
  
  private destroy$ = new Subject<void>();
  private blockTimes: number[] = [];
  private currentY = 0;
  private lastBlockTime = 0;

  constructor(private readonly data: ExplorerDataService) {}

  ngOnInit(): void {
    this.startVisualization();
    
    interval(100)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.update());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private startVisualization(): void {
    this.data.blocks$.pipe(takeUntil(this.destroy$)).subscribe(blocks => {
      if (blocks && blocks.length > 0) {
        const recentBlocks = blocks.slice(-20).reverse();
        this.displayedBlocks = recentBlocks.map((block, i) => ({
          id: String(block.height),
          hash: String(block.hash),
          txCount: Number(block.transactionCount) || 0,
          timestamp: Number(block.timestamp),
          x: this.width - (i * 60) - 50,
          y: this.height / 2 + (Math.random() - 0.5) * 80,
          opacity: 1,
          scale: 1
        }));
        this.totalBlocks = blocks.length;
        this.totalTransactions = blocks.reduce((sum, b) => sum + (Number(b.transactionCount) || 0), 0);
      }
    });
  }

  private spawnBlock(): void {
    this.data.blocks$.pipe(
      takeUntil(this.destroy$),
      map(blocks => blocks && blocks.length > 0 ? blocks[blocks.length - 1] : null)
    ).subscribe(latestBlock => {
      if (!latestBlock) return;
      
      const now = Date.now();
      const block: BlockVisual = {
        id: String(latestBlock.height),
        hash: String(latestBlock.hash),
        txCount: Number(latestBlock.transactionCount) || 0,
        timestamp: now,
        x: this.width + this.blockSize,
        y: this.height / 2 + (Math.random() - 0.5) * 100,
        opacity: 0,
        scale: 0.5
      };
      
      this.displayedBlocks.unshift(block);
      this.totalBlocks++;
      this.totalTransactions += block.txCount;
      this.blockTimes.push(now);
      
      if (this.blockTimes.length > 10) {
        this.blockTimes.shift();
      }
      this.calculateBps();
      this.lastBlockTime = now;
    });
  }

  private update(): void {
    const now = Date.now();
    
    this.data.blocks$.pipe(takeUntil(this.destroy$)).subscribe(blocks => {
      if (blocks && blocks.length > 0) {
        const latestBlock = blocks[blocks.length - 1];
        const latestBlockNum = Number(latestBlock.height);
        
        const existingIds = new Set(this.displayedBlocks.map(b => b.id));
        if (!existingIds.has(String(latestBlockNum))) {
          this.spawnBlockFromData(latestBlock);
        }
      }
    });
    
    this.displayedBlocks = this.displayedBlocks
      .map(block => {
        const age = now - block.timestamp;
        
        let newX = block.x - 2 - Math.random() * 2;
        let newY = block.y + (Math.random() - 0.5) * 1;
        
        newY += Math.sin(age / 500) * 0.5;
        
        let newOpacity = block.opacity;
        if (newOpacity < 1) {
          newOpacity = Math.min(1, newOpacity + 0.05);
        }
        
        if (newX < -50) {
          newOpacity = Math.max(0, newOpacity - 0.1);
        }
        
        let scale = block.scale;
        if (age < 1000) {
          scale = 1 + Math.sin(age / 100) * 0.1;
        }
        
        return {
          ...block,
          x: newX,
          y: Math.max(30, Math.min(this.height - 30, newY)),
          opacity: newOpacity,
          scale
        };
      })
      .filter(block => block.x > -100 && block.opacity > 0);
    
    this.updateConnections();
    this.showSpeedLines = this.blocksPerSecond > 1;
  }

  private spawnBlockFromData(block: BlockSummary): void {
    const now = Date.now();
    const visual: BlockVisual = {
      id: String(block.height),
      hash: String(block.hash),
      txCount: Number(block.transactionCount) || 0,
      timestamp: now,
      x: this.width + this.blockSize,
      y: this.height / 2 + (Math.random() - 0.5) * 100,
      opacity: 0,
      scale: 0.5
    };
    
    this.displayedBlocks.unshift(visual);
    this.totalBlocks++;
    this.totalTransactions += visual.txCount;
    this.blockTimes.push(now);
    
    if (this.blockTimes.length > 10) {
      this.blockTimes.shift();
    }
    this.calculateBps();
  }

  private updateConnections(): void {
    this.connections = [];
    
    const sorted = [...this.displayedBlocks].sort((a, b) => a.x - b.x);
    
    for (let i = 0; i < sorted.length - 1; i++) {
      const block = sorted[i];
      const nextBlock = sorted[i + 1];
      
      if (Math.abs(block.x - nextBlock.x) < 150 && Math.abs(block.y - nextBlock.y) < 80) {
        this.connections.push({
          x1: block.x + this.blockSize / 2,
          y1: block.y,
          x2: nextBlock.x - this.blockSize / 2,
          y2: nextBlock.y,
          opacity: 0.3 + Math.random() * 0.3
        });
      }
    }
  }

  private calculateBps(): void {
    if (this.blockTimes.length < 2) {
      this.blocksPerSecond = 2; // Default for demo
      return;
    }
    
    const oldest = this.blockTimes[0];
    const newest = this.blockTimes[this.blockTimes.length - 1];
    const duration = (newest - oldest) / 1000;
    
    if (duration > 0) {
      this.blocksPerSecond = this.blockTimes.length / duration;
    }
  }

  private generateHash(): string {
    const chars = '0123456789abcdef';
    let hash = '';
    for (let i = 0; i < 8; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  }

  formatHash(hash: string): string {
    return hash.substring(0, 6);
  }
}
