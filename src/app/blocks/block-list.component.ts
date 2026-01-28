import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import type { BlockSummary, Hash, UnixMs } from '@silica-protocol/explorer-models';

@Component({
  selector: 'block-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="block-list" role="table" aria-label="Recent blocks">
      <div class="block-list__header" role="row">
        <span role="columnheader">Height</span>
        <span role="columnheader">Hash</span>
        <span role="columnheader">Transactions</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Miner</span>
        <span role="columnheader">Time</span>
      </div>

      <ng-container *ngIf="blocks$ | async as blocks">
        <a
          *ngFor="let block of blocks; trackBy: trackByHash"
          class="block-row"
          role="row"
          [routerLink]="['/block', block.hash]"
        >
          <span role="cell">{{ block.height | number }}</span>
          <span role="cell" class="hash">{{ formatHash(block.hash) }}</span>
          <span role="cell">{{ block.transactionCount }}</span>
          <span role="cell">
            <span class="status" [class.status--finalized]="block.status === 'finalized'">
              {{ block.status === 'finalized' ? 'Finalized' : 'Pending' }}
            </span>
          </span>
          <span role="cell" class="miner">{{ formatMiner(block.miner) }}</span>
          <span role="cell">{{ formatTime(block.timestamp) }}</span>
        </a>
      </ng-container>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .block-list {
        display: flex;
        flex-direction: column;
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        background: var(--panel-bg);
        overflow: hidden;
      }

      .block-list__header,
      .block-row {
        display: grid;
        grid-template-columns: 100px 1.6fr 120px 140px 1.2fr 140px;
        gap: 0.5rem;
        padding: 0.9rem 1.2rem;
        align-items: center;
      }

      .block-list__header {
        font-size: 0.8rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--panel-border);
      }

      .block-row {
        text-decoration: none;
        color: inherit;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        transition: background-color 140ms ease, transform 140ms ease;
      }

      .block-row:last-of-type {
        border-bottom: none;
      }

      .block-row:hover,
      .block-row:focus-visible {
        background: rgba(102, 227, 255, 0.06);
        transform: translateY(-1px);
      }

      .hash {
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
        font-size: 0.9rem;
      }

      .miner {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.12rem 0.6rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
        font-size: 0.78rem;
        text-transform: capitalize;
        color: var(--accent);
      }

      .status--finalized {
        color: var(--success);
        background: rgba(91, 197, 135, 0.16);
      }

      @media (max-width: 960px) {
        .block-list__header,
        .block-row {
          grid-template-columns: 1fr 1.6fr 1fr;
          grid-template-rows: repeat(2, auto);
        }

        .block-list__header span:nth-child(n + 4) {
          display: none;
        }

        .block-row span:nth-child(4),
        .block-row span:nth-child(5),
        .block-row span:nth-child(6) {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlockListComponent {
  readonly blocks$: Observable<readonly BlockSummary[]> = this.data.blocks$;

  constructor(private readonly data: ExplorerDataService) {}

  trackByHash(_: number, block: BlockSummary): Hash {
    return block.hash;
  }

  formatHash(hash: Hash): string {
    const value = hash as string;
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
  }

  formatMiner(miner: string): string {
    return miner.length > 16 ? `${miner.slice(0, 16)}…` : miner;
  }

  formatTime(timestamp: UnixMs): string {
    const difference = Date.now() - (timestamp as number);
    const seconds = Math.floor(difference / 1000);
    if (seconds < 60) {
      return `${seconds}s ago`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
