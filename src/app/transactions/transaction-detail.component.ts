import { ChangeDetectionStrategy, Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, ParamMap, RouterModule } from '@angular/router';
import { map, switchMap, of } from 'rxjs';
import { Observable } from 'rxjs';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import type { AttoValue } from '@shared/models/common';
import type { BlockSummary } from '@shared/models/block.model';
import type { TransactionDetails } from '@shared/models/transaction.model';

@Component({
  selector: 'transaction-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <ng-container *ngIf="viewModel$ | async">
      <section class="tx-detail" *ngIf="transaction; else notFound" aria-labelledby="tx-heading">
        <header class="tx-detail__header">
          <div>
            <p class="tx-detail__label">Transaction</p>
            <h1 id="tx-heading">{{ transaction.hash }}</h1>
            <p class="muted" *ngIf="transaction.blockHeight">Included in block {{ transaction.blockHeight | number }}</p>
            <p class="muted" *ngIf="!transaction.blockHeight">Block info unavailable</p>
          </div>
          <div class="tx-detail__status" [class.tx-detail__status--confirmed]="transaction.status === 'confirmed'">
            {{ transaction.status | titlecase }}
          </div>
        </header>

        <section class="tx-detail__grid" aria-label="Transaction overview">
          <article *ngIf="transaction.blockHash">
            <h2>Block</h2>
            <p><a [routerLink]="['/block', transaction.blockHash]">{{ transaction.blockHash }}</a></p>
          </article>
          <article class="tx-row">
            <span class="tx-row__item">
              <span class="tx-row__label">Value</span>
              <span class="tx-row__value">{{ formatCoins(transaction.value) }} CHRT</span>
            </span>
            <span class="tx-row__item">
              <span class="tx-row__label">Fee</span>
              <span class="tx-row__value">{{ formatCoins(transaction.fee) }} CHRT</span>
            </span>
            <span class="tx-row__item">
              <span class="tx-row__label">Timestamp</span>
              <span class="tx-row__value">{{ transaction.timestamp | date:'yyyy MMM dd, h:mm:ss a' }}</span>
            </span>
          </article>
          <article class="tx-address">
            <h2>From</h2>
            <p><a [routerLink]="['/account', transaction.from]">{{ transaction.from }}</a></p>
          </article>
          <article class="tx-address">
            <h2>To</h2>
            <p><a [routerLink]="['/account', transaction.to]">{{ transaction.to }}</a></p>
          </article>
          <article *ngIf="transaction.confirmations > 0">
            <h2>Confirmations</h2>
            <p>{{ transaction.confirmations }}</p>
          </article>
          <article *ngIf="transaction.memo">
            <h2>Memo</h2>
            <p>{{ transaction.memo }}</p>
          </article>
        </section>

        <section class="tx-detail__io" aria-label="Inputs and outputs" *ngIf="transaction.inputs.length > 0 || transaction.outputs.length > 0">
          <div class="io-column" *ngIf="transaction.inputs.length > 0">
            <h3>Inputs ({{ transaction.inputs.length }})</h3>
            <ul>
              <li *ngFor="let input of transaction.inputs">{{ input }}</li>
            </ul>
          </div>
          <div class="io-column" *ngIf="transaction.outputs.length > 0">
            <h3>Outputs ({{ transaction.outputs.length }})</h3>
            <ul>
              <li *ngFor="let output of transaction.outputs">{{ output }}</li>
            </ul>
          </div>
        </section>

        <section *ngIf="block" aria-label="Block summary" class="tx-detail__block">
          <h2>Block Summary</h2>
          <div class="block-summary">
            <div>
              <h3>Hash</h3>
              <p>{{ block.hash }}</p>
            </div>
            <div>
              <h3>Validator</h3>
              <p>{{ block.miner }}</p>
            </div>
            <div>
              <h3>Status</h3>
              <p>{{ block.status | titlecase }}</p>
            </div>
            <div>
              <h3>Transactions</h3>
              <p>{{ block.transactionCount }}</p>
            </div>
          </div>
        </section>
      </section>
    </ng-container>

    <ng-template #notFound>
      <section class="empty-state" aria-live="polite">
        <h1>Transaction not found</h1>
        <p>The requested transaction does not exist in the current dataset.</p>
        <a routerLink="/" class="btn">Back to overview</a>
      </section>
    </ng-template>

    <ng-template #loading>
      <section class="empty-state" aria-live="polite">
        <p>Loading transaction data…</p>
      </section>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .tx-detail {
        display: flex;
        flex-direction: column;
        gap: 2rem;
      }

      .tx-detail__header {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: center;
        padding: 1.5rem;
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        background: var(--panel-bg);
      }

      .tx-detail__label {
        margin: 0;
        color: var(--text-secondary);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.75rem;
      }

      .tx-detail__status {
        padding: 0.35rem 0.9rem;
        border-radius: 999px;
        border: 1px solid rgba(14, 165, 233, 0.2);
        background: rgba(14, 165, 233, 0.05);
        letter-spacing: 0.05em;
        font-size: 0.85rem;
        transition: all 0.3s ease;
      }

      .tx-detail__status--confirmed {
        border-color: rgba(14, 165, 233, 0.5);
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(20, 184, 166, 0.1));
        color: var(--accent);
        box-shadow: 0 0 15px rgba(14, 165, 233, 0.2);
      }

      .tx-detail__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 1rem;
      }

      .tx-row {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        grid-column: 1 / -1;
      }

      .tx-row__item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
        padding: 0.75rem;
        background: rgba(14, 165, 233, 0.03);
        border-radius: 12px;
        border: 1px solid rgba(14, 165, 233, 0.08);
      }

      .tx-row__label {
        font-size: 0.75rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .tx-row__value {
        font-size: 1.1rem;
        font-weight: 500;
      }

      .tx-address {
        grid-column: 1 / -1;
      }

      .tx-address p {
        word-break: break-all;
      }

      .tx-address a {
        color: var(--accent-light);
        text-decoration: none;
      }

      .tx-address a:hover {
        text-decoration: underline;
      }

      .tx-detail__grid article {
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        background: var(--panel-bg);
        padding: 1.25rem;
      }

      .tx-detail__grid h2,
      .tx-detail__grid p {
        margin: 0;
      }

      .tx-detail__grid h2 {
        color: var(--text-secondary);
        font-size: 0.9rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .tx-detail__grid p {
        margin-top: 0.45rem;
        word-break: break-all;
      }

      .tx-detail__io {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
      }

      .io-column {
        background: var(--panel-bg);
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        padding: 1.25rem;
      }

      .io-column h3 {
        margin-top: 0;
      }

      .io-column ul {
        margin: 0.75rem 0 0;
        padding-left: 1.1rem;
        display: grid;
        gap: 0.4rem;
      }

      .tx-detail__block {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 1.5rem;
        display: grid;
        gap: 1rem;
      }

      .block-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 1rem;
      }

      .block-summary div {
        border-radius: 14px;
        border: 1px solid rgba(14, 165, 233, 0.12);
        padding: 1rem;
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.04), rgba(20, 184, 166, 0.02));
        transition: all 0.3s ease;
      }

      .block-summary div:hover {
        border-color: rgba(14, 165, 233, 0.3);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(14, 165, 233, 0.1);
      }

      .muted {
        color: var(--text-secondary);
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
        transition: all 0.3s ease;
      }

      .btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(14, 165, 233, 0.25);
        border-color: rgba(14, 165, 233, 0.7);
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransactionDetailComponent {
  loading = true;
  transaction: TransactionDetails | undefined;
  block: BlockSummary | undefined;

  readonly viewModel$: Observable<{ transaction: TransactionDetails | undefined; block: BlockSummary | undefined; loading: boolean }> =
    this.route.paramMap.pipe(
      map((params: ParamMap) => params.get('hash')),
      switchMap((hash: string | null) => {
        this.loading = true;
        this.transaction = undefined;
        this.block = undefined;
        
        if (!hash) {
          this.loading = false;
          return of({ transaction: undefined, block: undefined, loading: false });
        }

        const cached = this.data.getTransactionDetails(hash as TransactionDetails['hash']);
        if (cached) {
          this.loading = false;
          this.transaction = cached;
          this.block = this.data.getBlockDetails(cached.blockHash);
          return of({ transaction: this.transaction, block: this.block, loading: false });
        }

        this.loadTransaction(hash);
        return of({ transaction: undefined, block: undefined, loading: true });
      })
    );

  constructor(private readonly route: ActivatedRoute, private readonly data: ExplorerDataService, private readonly cdr: ChangeDetectorRef) {}

  async loadTransaction(hash: string): Promise<void> {
    const tx = await this.data.fetchTransactionByHashFromNode(hash);
    this.loading = false;
    this.transaction = tx ?? undefined;
    if (this.transaction?.blockHash) {
      this.block = this.data.getBlockDetails(this.transaction.blockHash);
    }
    this.cdr.detectChanges();
  }

  formatCoins(value: AttoValue): string {
    const normalized = (value as number) / 1_000_000;
    return normalized.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}
