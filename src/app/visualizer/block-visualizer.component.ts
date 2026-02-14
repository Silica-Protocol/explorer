import { ChangeDetectionStrategy, Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ExplorerDataService } from '@app/services/explorer-data.service';

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
        0% { left: -100%; width: 50%; }
        100% { left: 150%; width: 30%; }
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
    for (let i = 0; i < 15; i++) {
      this.spawnBlock(true);
    }
  }

  private spawnBlock(initial = false): void {
    const now = Date.now();
    const hash = this.generateHash();
    
    const block: BlockVisual = {
      id: `block-${now}-${Math.random()}`,
      hash,
      txCount: Math.floor(Math.random() * 50) + 1,
      timestamp: now,
      x: initial ? this.width / 2 + (Math.random() - 0.5) * 200 : -this.blockSize,
      y: this.height / 2 + (Math.random() - 0.5) * 100,
      opacity: initial ? 1 : 0,
      scale: initial ? 1 : 0.5
    };
    
    this.displayedBlocks.push(block);
    this.totalBlocks++;
    this.totalTransactions += block.txCount;
    
    if (!initial) {
      this.blockTimes.push(now);
      if (this.blockTimes.length > 10) {
        this.blockTimes.shift();
      }
      this.calculateBps();
    }
    
    this.lastBlockTime = now;
  }

  private update(): void {
    const now = Date.now();
    
    // Spawn new blocks based on block time (faster for demo)
    if (now - this.lastBlockTime > 500) {
      this.spawnBlock();
    }
    
    // Update existing blocks
    this.displayedBlocks = this.displayedBlocks
      .map(block => {
        const age = now - block.timestamp;
        
        // Move blocks to the right
        let newX = block.x + 2 + Math.random() * 2;
        let newY = block.y + (Math.random() - 0.5) * 1;
        
        // Gentle wave motion
        newY += Math.sin(age / 500) * 0.5;
        
        // Fade in new blocks
        let newOpacity = block.opacity;
        if (newOpacity < 1) {
          newOpacity = Math.min(1, newOpacity + 0.05);
        }
        
        // Fade out old blocks
        if (newX > this.width + 50) {
          newOpacity = Math.max(0, newOpacity - 0.1);
        }
        
        // Pulse effect for newer blocks
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
      .filter(block => block.x < this.width + 100 && block.opacity > 0);
    
    // Update connections
    this.updateConnections();
    
    // Update speed lines
    this.showSpeedLines = this.blocksPerSecond > 1;
  }

  private updateConnections(): void {
    this.connections = [];
    
    for (let i = 0; i < this.displayedBlocks.length - 1; i++) {
      const block = this.displayedBlocks[i];
      const nextBlock = this.displayedBlocks[i + 1];
      
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
