import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import type { GetTransactionResult as NodeGetTransactionResult } from '@silica-protocol/node-models';

@Component({
  selector: 'transaction-search',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <section class="search-page" aria-labelledby="tx-search-heading">
      <header class="search-page__header">
        <div>
          <h1 id="tx-search-heading">Transaction Search</h1>
          <p class="muted">Look up a transaction by hash, including pending/queued status.</p>
        </div>
      </header>

      <form class="search-form" (submit)="onSubmit($event)">
        <label for="tx-hash">Transaction hash</label>
        <div class="search-form__row">
          <input
            id="tx-hash"
            type="text"
            autocomplete="off"
            placeholder="0x..."
            [formControl]="hashControl"
          />
          <button class="btn btn--primary" type="submit" [disabled]="loading">Search</button>
        </div>
        <p class="muted" *ngIf="error">{{ error }}</p>
      </form>

      <section *ngIf="result" class="result-card" aria-live="polite">
        <header class="result-card__header">
          <div>
            <h2>Result</h2>
            <p class="muted">Status: {{ result.status | titlecase }}</p>
          </div>
          <a *ngIf="result.tx_id" [routerLink]="['/transaction', result.tx_id]" class="link">Open detail</a>
        </header>

        <div class="result-card__grid">
          <article>
            <h3>Hash</h3>
            <p>{{ result.tx_id }}</p>
          </article>
          <article *ngIf="result.sender">
            <h3>From</h3>
            <p>{{ result.sender }}</p>
          </article>
          <article *ngIf="result.recipient">
            <h3>To</h3>
            <p>{{ result.recipient }}</p>
          </article>
          <article *ngIf="result.amount !== undefined">
            <h3>Amount</h3>
            <p>{{ result.amount }}</p>
          </article>
          <article *ngIf="result.fee !== undefined">
            <h3>Fee</h3>
            <p>{{ result.fee }}</p>
          </article>
          <article *ngIf="result.nonce !== undefined">
            <h3>Nonce</h3>
            <p>{{ result.nonce }}</p>
          </article>
          <article *ngIf="result.timestamp">
            <h3>Timestamp</h3>
            <p>{{ result.timestamp }}</p>
          </article>
          <article *ngIf="result.message">
            <h3>Message</h3>
            <p>{{ result.message }}</p>
          </article>
        </div>
      </section>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .search-page {
        display: grid;
        gap: 1.5rem;
      }

      .search-page__header h1 {
        margin: 0;
      }

      .muted {
        color: var(--text-secondary);
      }

      .search-form {
        display: grid;
        gap: 0.75rem;
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 1.5rem;
      }

      .search-form label {
        font-size: 0.9rem;
        color: var(--text-secondary);
      }

      .search-form__row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 0.75rem;
      }

      .search-form input {
        padding: 0.75rem 1rem;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.04);
        color: inherit;
      }

      .result-card {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 1.5rem;
        display: grid;
        gap: 1rem;
      }

      .result-card__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
      }

      .result-card__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
      }

      .result-card__grid article {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 14px;
        padding: 1rem;
      }

      .result-card__grid h3 {
        margin: 0;
        font-size: 0.85rem;
        text-transform: uppercase;
        color: var(--text-secondary);
        letter-spacing: 0.04em;
      }

      .result-card__grid p {
        margin: 0.35rem 0 0;
        word-break: break-all;
      }

      .btn {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.04);
        color: inherit;
        border-radius: 999px;
        padding: 0.6rem 1rem;
        cursor: pointer;
      }

      .btn--primary {
        border-color: rgba(27, 220, 242, 0.45);
        background: rgba(27, 220, 242, 0.12);
      }

      .link {
        color: var(--accent);
        text-decoration: none;
      }

      @media (max-width: 640px) {
        .search-form__row {
          grid-template-columns: 1fr;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransactionSearchComponent {
  readonly hashControl = new FormControl('', { nonNullable: true });
  loading = false;
  error: string | null = null;
  result: NodeGetTransactionResult | null = null;

  constructor(private readonly data: ExplorerDataService) {}

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const hash = this.hashControl.value.trim();
    if (!hash) {
      this.error = 'Enter a transaction hash.';
      return;
    }

    this.loading = true;
    this.error = null;
    this.result = null;

    try {
      this.result = await this.data.fetchTransactionByHash(hash);
      if (this.result.status === 'not_found') {
        this.error = this.result.message ?? 'Transaction not found.';
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to fetch transaction.';
    } finally {
      this.loading = false;
    }
  }
}
