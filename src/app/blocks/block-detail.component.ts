import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, ParamMap, RouterModule } from '@angular/router';
import { map, switchMap, catchError, startWith } from 'rxjs/operators';
import { Observable, from, of } from 'rxjs';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import { formatBlockHeight, formatHash, formatTimestamp } from '@shared/util/format';
import type { AttoValue } from '@shared/models/common';
import type { BlockDetails } from '@shared/models/block.model';
import type { TransactionSummary } from '@shared/models/transaction.model';

type BlockHash = BlockDetails['hash'];

@Component({
  selector: 'block-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <ng-container *ngIf="viewModel$ | async as vm">
      <ng-container *ngIf="vm.loading; else content">
        <section class="empty-state" aria-live="polite">
          <p>Loading block data…</p>
        </section>
      </ng-container>
      <ng-template #content>
        <section class="block-detail" *ngIf="vm.block; else notFound" aria-labelledby="block-heading">
          <header class="block-detail__header">
            <div>
              <p class="block-detail__label">Block</p>
              <h1 id="block-heading">
                <span class="block-formatted">{{ formatBlockHeight(vm.block.height) }}</span>
                <span class="block-raw">#{{ vm.block.height | number }}</span>
              </h1>
              <p class="block-timestamp">{{ formatTimestamp(vm.block.timestamp) }}</p>
            </div>
            <div class="block-detail__status" [class.block-detail__status--finalized]="vm.block.status === 'finalized'">
              {{ vm.block.status | titlecase }}
            </div>
          </header>

          <section class="block-detail__overview" aria-label="Block details">
            <article>
              <h2>Block Hash</h2>
              <p class="hash-value">{{ vm.block.hash }}</p>
            </article>
            <article>
              <h2>Parent Hash</h2>
              <p *ngIf="vm.block.parentHash; else noParent" class="hash-value">
                <a [routerLink]="['/block', vm.block.parentHash]">{{ vm.block.parentHash }}</a>
              </p>
              <ng-template #noParent><span class="muted">Genesis (no parent)</span></ng-template>
            </article>
            <article>
              <h2>Validator</h2>
              <p class="hash-value">{{ vm.block.miner }}</p>
            </article>
            <article>
              <h2>Transactions</h2>
              <p>{{ vm.block.transactionCount }}</p>
            </article>
            <article>
              <h2>Total Value</h2>
              <p>{{ formatCoins(vm.block.totalValue) }} CHRT</p>
            </article>
          </section>

          <section aria-label="Transactions" class="transactions">
            <div class="section-heading">
              <h2>Transactions</h2>
              <p class="muted">{{ vm.transactions.length }} entries</p>
            </div>

            <div class="transaction-table" role="table">
              <div class="transaction-table__header" role="row">
                <span role="columnheader">Hash</span>
                <span role="columnheader">From</span>
                <span role="columnheader">To</span>
                <span role="columnheader">Value</span>
                <span role="columnheader">Fee</span>
              </div>

              <a
                *ngFor="let tx of vm.transactions; trackBy: trackByHash"
                class="transaction-row"
                role="row"
                [routerLink]="['/transaction', tx.hash]"
              >
                <span role="cell" class="hash">{{ formatHash(tx.hash) }}</span>
                <span role="cell">{{ formatHash(tx.from) }}</span>
                <span role="cell">{{ formatHash(tx.to) }}</span>
                <span role="cell">{{ formatCoins(tx.value) }} CHRT</span>
                <span role="cell">{{ formatCoins(tx.fee) }} SILICA</span>
              </a>
            </div>
          </section>
        </section>
      </ng-template>
    </ng-container>

    <ng-template #notFound>
      <section class="empty-state" aria-live="polite">
        <h1>Block not found</h1>
        <p>We were unable to locate that block in the current ledger window.</p>
        <a routerLink="/" class="btn">Return to overview</a>
      </section>
    </ng-template>

    <ng-template #loading>
      <section class="empty-state" aria-live="polite">
        <p>Loading block data…</p>
      </section>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .block-detail {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .block-detail__header {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: center;
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 1.5rem;
      }

      .block-detail__label {
        margin: 0;
        color: var(--text-secondary);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.75rem;
      }

      .block-detail__header h1 {
        margin: 0.25rem 0 0;
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .block-formatted {
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--accent);
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
      }

      .block-raw {
        font-size: 0.85rem;
        color: var(--text-secondary);
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
      }

      .block-timestamp {
        margin: 0.5rem 0 0;
        color: var(--text-secondary);
        font-size: 0.9rem;
      }

      .block-detail__hash {
        margin: 0.5rem 0 0;
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
        color: var(--text-secondary);
      }

      .block-detail__status {
        padding: 0.35rem 0.9rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.04);
        letter-spacing: 0.05em;
        font-size: 0.85rem;
      }

      .block-detail__status--finalized {
        border-color: rgba(91, 197, 135, 0.55);
        background: rgba(91, 197, 135, 0.16);
        color: var(--success);
      }

      .block-detail__overview {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1rem;
      }

      .block-detail__overview article {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 1.25rem;
        min-width: 0;
      }

      .block-detail__overview h2 {
        margin: 0;
        font-size: 0.8rem;
        color: var(--text-secondary);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .block-detail__overview p {
        margin: 0.45rem 0 0;
        font-size: 1rem;
        word-break: break-all;
        overflow-wrap: break-word;
      }

      .hash-value {
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
        font-size: 0.85rem;
      }

      .hash-value a {
        color: var(--accent);
        text-decoration: none;
      }

      .hash-value a:hover {
        text-decoration: underline;
      }

      .transactions {
        background: var(--panel-bg);
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .section-heading {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }

      .section-heading h2 {
        margin: 0;
      }

      .muted {
        color: var(--text-secondary);
      }

      .transaction-table {
        display: flex;
        flex-direction: column;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        overflow: hidden;
      }

      .transaction-table__header,
      .transaction-row {
        display: grid;
        grid-template-columns: 2fr 1.5fr 1.5fr 120px 100px;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        align-items: center;
      }

      .transaction-table__header {
        font-size: 0.75rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--text-secondary);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .transaction-row {
        text-decoration: none;
        color: inherit;
        border-bottom: 1px solid rgba(14, 165, 233, 0.08);
        transition: all 0.2s ease;
      }

      .transaction-row:last-of-type {
        border-bottom: none;
      }

      .transaction-row:hover,
      .transaction-row:focus-visible {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.1), rgba(20, 184, 166, 0.06));
        transform: translateX(4px);
        box-shadow: inset 3px 0 0 rgba(14, 165, 233, 0.6);
      }

      .transaction-row .hash {
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
        font-size: 0.85rem;
      }

      .empty-state {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 2rem;
        display: grid;
        gap: 1rem;
        justify-items: start;
      }

      .btn {
        display: inline-flex;
        padding: 0.65rem 1.25rem;
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(20, 184, 166, 0.12));
        border: 1px solid rgba(14, 165, 233, 0.5);
        color: var(--accent);
        text-decoration: none;
        font-weight: 600;
        letter-spacing: 0.02em;
      }

      @media (max-width: 960px) {
        .transaction-table__header,
        .transaction-row {
          grid-template-columns: 1.6fr 1fr 1fr;
        }

        .transaction-table__header span:nth-child(n + 4),
        .transaction-row span:nth-child(n + 4) {
          display: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlockDetailComponent {
  readonly viewModel$: Observable<{ block: BlockDetails | undefined; transactions: readonly TransactionSummary[]; loading: boolean }> =
    this.route.paramMap.pipe(
      map((params: ParamMap) => params.get('hash')),
      switchMap((hash: string | null) => {
        if (!hash) {
          return of({ block: undefined, transactions: [], loading: false });
        }

        const cached = this.data.getBlockDetails(hash as BlockHash);
        if (cached) {
          return of({ block: cached, transactions: cached.transactions ?? [], loading: false });
        }

        return from(this.loadBlock(hash)).pipe(
          map((block: BlockDetails | null) => ({
            block: block ?? undefined,
            transactions: block?.transactions ?? [],
            loading: false
          })),
          startWith({ block: undefined, transactions: [], loading: true }),
          catchError(() => of({ block: undefined, transactions: [], loading: false }))
        );
      })
    );

  constructor(private readonly route: ActivatedRoute, private readonly data: ExplorerDataService) {}

  async loadBlock(hashOrNumber: string): Promise<BlockDetails | null> {
    const isNumber = /^\d+$/.test(hashOrNumber);

    if (isNumber) {
      return await this.data.fetchBlockByNumber(parseInt(hashOrNumber, 10));
    }
    return await this.data.fetchBlockByHash(hashOrNumber);
  }

  trackByHash(_: number, tx: TransactionSummary): TransactionSummary['hash'] {
    return tx.hash;
  }

  formatHash = formatHash;
  formatBlockHeight = formatBlockHeight;
  formatTimestamp = formatTimestamp;

  formatCoins(value: AttoValue): string {
    const normalized = Number(value);
    return normalized.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
}
