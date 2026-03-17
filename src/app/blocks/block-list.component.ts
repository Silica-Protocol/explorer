import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import { formatBlockHeight, formatHash } from '@shared/util/format';
import type { BlockSummary, Hash, UnixMs } from '@silica-protocol/explorer-models';

@Component({
  selector: 'block-list',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  template: `
    <div class="block-list" role="table" aria-label="Recent blocks">
      <div class="block-list__header" role="row">
        <span role="columnheader">Height</span>
        <span role="columnheader">Hash</span>
        <span role="columnheader">Txs</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Validator</span>
        <span role="columnheader">Time</span>
        <span class="block-search" role="none">
          <form class="block-search__form" (submit)="onSearchSubmit($event)">
            <input
              type="text"
              [formControl]="blockSearchControl"
              placeholder="Block # or hash"
              aria-label="Search block by height or hash"
            />
            <button type="submit">Go</button>
          </form>
        </span>
        <span class="filter-toggle">
          <label class="filter-toggle__label">
            <input
              type="checkbox"
              [checked]="hideEmptyBlocks"
              (change)="hideEmptyBlocks = $any($event.target).checked"
            />
            <span>Hide empty</span>
          </label>
        </span>
      </div>

      <ng-container *ngIf="blocks$ | async as blocks">
        <ng-container *ngIf="getFilteredBlocks(blocks) as filteredBlocks">
          <a
            *ngFor="let block of filteredBlocks; trackBy: trackByHash"
          class="block-row"
          role="row"
          [routerLink]="['/block', block.hash]"
        >
          <span role="cell" class="height">
            <span class="height__formatted">{{ formatBlockHeight(block.height) }}</span>
            <span class="height__raw">#{{ block.height | number }}</span>
          </span>
          <span role="cell" class="hash">{{ formatHash(block.hash) }}</span>
          <span role="cell">{{ block.transactionCount }}</span>
          <span role="cell">
            <span class="status" [class.status--finalized]="block.status === 'finalized'">
              {{ block.status === 'finalized' ? 'Finalized' : 'Pending' }}
            </span>
          </span>
          <span role="cell" class="validator">{{ formatValidator(block.miner) }}</span>
          <span role="cell">{{ formatTime(block.timestamp) }}</span>
          </a>
        </ng-container>
      </ng-container>

      <div class="load-more" *ngIf="hasMore$ | async">
        <button
          class="load-more__button"
          (click)="loadMore()"
          [disabled]="loadingMore$ | async"
        >
          {{ (loadingMore$ | async) ? 'Loading...' : 'Load More Blocks' }}
        </button>
      </div>
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
        grid-template-columns: 130px 1.4fr 60px 100px 1fr 100px;
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

      .filter-toggle {
        justify-self: end;
      }

      .block-search {
        justify-self: end;
      }

      .block-search__form {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }

      .block-search__form input {
        width: min(240px, 34vw);
        padding: 0.35rem 0.55rem;
        border-radius: 8px;
        border: 1px solid rgba(14, 165, 233, 0.2);
        background: rgba(14, 165, 233, 0.05);
        color: var(--text-primary);
        font-size: 0.8rem;
      }

      .block-search__form button {
        padding: 0.35rem 0.7rem;
        border-radius: 8px;
        border: 1px solid rgba(14, 165, 233, 0.35);
        background: rgba(14, 165, 233, 0.12);
        color: var(--accent-light);
        font-size: 0.78rem;
        cursor: pointer;
      }

      .filter-toggle__label {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        cursor: pointer;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-secondary);
        user-select: none;
      }

      .filter-toggle__label input {
        width: 14px;
        height: 14px;
        accent-color: var(--accent);
        cursor: pointer;
      }

      .block-row {
        text-decoration: none;
        color: inherit;
        border-bottom: 1px solid rgba(14, 165, 233, 0.08);
        transition: all 0.2s ease;
      }

      .block-row:last-of-type {
        border-bottom: none;
      }

      .block-row:hover,
      .block-row:focus-visible {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(20, 184, 166, 0.05));
        transform: translateX(4px);
        box-shadow: inset 4px 0 0 rgba(14, 165, 233, 0.6);
      }

      .hash {
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
        font-size: 0.9rem;
      }

      .height {
        display: flex;
        flex-direction: column;
        line-height: 1.3;
      }

      .height__formatted {
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-primary);
        letter-spacing: 0.02em;
      }

      .height__raw {
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
        font-size: 0.7rem;
        color: var(--text-secondary);
        opacity: 0.7;
      }

      .validator {
        min-width: 0;
      }

      .status {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        gap: 0.25rem;
        padding: 0.12rem 0.6rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
        font-size: 0.78rem;
        text-transform: capitalize;
        color: var(--accent);
        box-sizing: border-box;
      }

      .status--finalized {
        color: var(--success);
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(34, 197, 94, 0.12));
        border: 1px solid rgba(34, 197, 94, 0.3);
        box-shadow: 0 0 10px rgba(34, 197, 94, 0.15);
      }

      .load-more {
        display: flex;
        justify-content: center;
        padding: 1.5rem;
        border-top: 1px solid var(--panel-border);
      }

      .load-more__button {
        padding: 0.75rem 2rem;
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--text-primary);
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .load-more__button:hover:not(:disabled) {
        background: var(--accent);
        border-color: var(--accent);
        color: white;
      }

      .load-more__button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      @media (max-width: 960px) {
        .block-list__header,
        .block-row {
          grid-template-columns: 1fr 1.6fr 1fr 80px;
        }

        .block-list__header span:nth-child(n + 4),
        .block-row span:nth-child(n + 4) {
          display: none;
        }

        .filter-toggle {
          display: none;
        }

        .block-search {
          display: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlockListComponent {
  readonly blocks$: Observable<readonly BlockSummary[]> = this.data.blocks$;
  readonly hasMore$ = this.data.hasMoreBlocks$;
  readonly loadingMore$ = this.data.loadingMoreBlocks$;
  readonly blockSearchControl = new FormControl('', { nonNullable: true });
  hideEmptyBlocks = false;

  constructor(private readonly data: ExplorerDataService, private readonly router: Router) {}

  async loadMore(): Promise<void> {
    await this.data.loadMoreBlocks();
  }

  trackByHash(_: number, block: BlockSummary): Hash {
    return block.hash;
  }

  getFilteredBlocks(blocks: readonly BlockSummary[] | null): readonly BlockSummary[] {
    if (!blocks) return [];
    return this.hideEmptyBlocks ? blocks.filter((b) => Number(b.transactionCount) > 0) : blocks;
  }

  onSearchSubmit(event: Event): void {
    event.preventDefault();
    const term = this.blockSearchControl.value.trim();
    if (!term) {
      return;
    }
    void this.router.navigate(['/block', term]);
  }

  formatHash(hash: Hash): string {
    const value = hash as string;
    return `${value.slice(0, 10)}…${value.slice(-6)}`;
  }

  formatBlockHeight = formatBlockHeight;

  formatValidator(validator: string): string {
    return validator;
  }

  formatTime(timestamp: UnixMs): string {
    const difference = Date.now() - (timestamp as number);
    const seconds = Math.floor(difference / 1000);
    if (seconds < 0) {
      return 'now';
    }
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
