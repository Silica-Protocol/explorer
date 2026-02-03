import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, ParamMap, RouterModule } from '@angular/router';
import { map, switchMap } from 'rxjs/operators';
import { combineLatest, Observable } from 'rxjs';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import type { AttoValue } from '@shared/models/common';
import type { BlockSummary } from '@shared/models/block.model';
import type { TransactionDetails } from '@shared/models/transaction.model';

@Component({
  selector: 'transaction-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <ng-container *ngIf="viewModel$ | async as vm; else loading">
      <section class="tx-detail" *ngIf="vm.transaction; else notFound" aria-labelledby="tx-heading">
        <header class="tx-detail__header">
          <div>
            <p class="tx-detail__label">Transaction</p>
            <h1 id="tx-heading">{{ vm.transaction.hash }}</h1>
            <p class="muted">Included in block {{ vm.transaction.blockHeight | number }}</p>
          </div>
          <div class="tx-detail__status" [class.tx-detail__status--confirmed]="vm.transaction.status === 'confirmed'">
            {{ vm.transaction.status | titlecase }}
          </div>
        </header>

        <section class="tx-detail__grid" aria-label="Transaction overview">
          <article>
            <h2>Timestamp</h2>
            <p>{{ vm.transaction.timestamp | date: 'medium' }}</p>
          </article>
          <article>
            <h2>Block</h2>
            <p><a [routerLink]="['/block', vm.transaction.blockHash]">{{ vm.transaction.blockHash }}</a></p>
          </article>
          <article>
            <h2>Value</h2>
            <p>{{ formatCoins(vm.transaction.value) }} CHRT</p>
          </article>
          <article>
            <h2>Fee</h2>
            <p>{{ formatCoins(vm.transaction.fee) }} CHRT</p>
          </article>
          <article>
            <h2>From</h2>
            <p>{{ vm.transaction.from }}</p>
          </article>
          <article>
            <h2>To</h2>
            <p>{{ vm.transaction.to }}</p>
          </article>
          <article>
            <h2>Confirmations</h2>
            <p>{{ vm.transaction.confirmations }}</p>
          </article>
          <article *ngIf="vm.transaction.memo">
            <h2>Memo</h2>
            <p>{{ vm.transaction.memo }}</p>
          </article>
        </section>

        <section class="tx-detail__io" aria-label="Inputs and outputs">
          <div class="io-column">
            <h3>Inputs ({{ vm.transaction.inputs.length }})</h3>
            <ul>
              <li *ngFor="let input of vm.transaction.inputs">{{ input }}</li>
            </ul>
          </div>
          <div class="io-column">
            <h3>Outputs ({{ vm.transaction.outputs.length }})</h3>
            <ul>
              <li *ngFor="let output of vm.transaction.outputs">{{ output }}</li>
            </ul>
          </div>
        </section>

        <section *ngIf="vm.block" aria-label="Block summary" class="tx-detail__block">
          <h2>Block Summary</h2>
          <div class="block-summary">
            <div>
              <h3>Hash</h3>
              <p>{{ vm.block.hash }}</p>
            </div>
            <div>
              <h3>Miner</h3>
              <p>{{ vm.block.miner }}</p>
            </div>
            <div>
              <h3>Status</h3>
              <p>{{ vm.block.status | titlecase }}</p>
            </div>
            <div>
              <h3>Transactions</h3>
              <p>{{ vm.block.transactionCount }}</p>
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
  readonly viewModel$: Observable<{ transaction: TransactionDetails | undefined; block: BlockSummary | undefined }> =
    this.route.paramMap.pipe(
      map((params: ParamMap) => params.get('hash')),
      switchMap((hash: string | null) =>
        combineLatest([this.data.recentTransactions$, this.data.blocks$]).pipe(
          map(() => this.buildViewModel(hash))
        )
      )
    );

  constructor(private readonly route: ActivatedRoute, private readonly data: ExplorerDataService) {}

  formatCoins(value: AttoValue): string {
    const normalized = (value as number) / 1_000_000;
    return normalized.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  private buildViewModel(hash: string | null): {
    transaction: TransactionDetails | undefined;
    block: BlockSummary | undefined;
  } {
    if (!hash) {
      return { transaction: undefined, block: undefined };
    }

    const transaction = this.data.getTransactionDetails(hash as TransactionDetails['hash']) ?? undefined;
    const block = transaction ? this.data.getBlockDetails(transaction.blockHash) ?? undefined : undefined;
    return { transaction, block };
  }
}
