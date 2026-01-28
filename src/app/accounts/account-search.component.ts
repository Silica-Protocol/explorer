import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import type { TransactionHistoryResult } from '@silica-protocol/node-models';

interface AccountLookupState {
  readonly address: string;
  readonly balance: string;
  readonly nonce: number;
  readonly history: TransactionHistoryResult;
}

@Component({
  selector: 'account-search',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <section class="search-page" aria-labelledby="account-search-heading">
      <header class="search-page__header">
        <div>
          <h1 id="account-search-heading">Account Lookup</h1>
          <p class="muted">Fetch live balance and transaction history from the node.</p>
        </div>
      </header>

      <form class="search-form" (submit)="onSubmit($event)">
        <label for="account-address">Account address</label>
        <div class="search-form__row">
          <input
            id="account-address"
            type="text"
            autocomplete="off"
            placeholder="0x..."
            [formControl]="addressControl"
          />
          <button class="btn btn--primary" type="submit" [disabled]="loading">Search</button>
        </div>
        <p class="muted" *ngIf="error">{{ error }}</p>
      </form>

      <section *ngIf="state" class="result-card" aria-live="polite">
        <header class="result-card__header">
          <div>
            <h2>Account</h2>
            <p class="muted">{{ state.address }}</p>
          </div>
          <a [routerLink]="['/account', state.address]" class="link">Open detail</a>
        </header>

        <div class="result-card__grid">
          <article>
            <h3>Balance</h3>
            <p>{{ formatBalance(state.balance) }} CHRT</p>
          </article>
          <article>
            <h3>Nonce</h3>
            <p>{{ state.nonce }}</p>
          </article>
          <article>
            <h3>Transactions</h3>
            <p>{{ state.history.transactions.length }}</p>
          </article>
        </div>

        <section class="history" aria-label="Transaction history">
          <div class="history__header">
            <h3>Recent Transactions</h3>
            <button
              class="btn btn--ghost"
              type="button"
              (click)="loadMore()"
              [disabled]="loading || !state.history.has_more"
            >
              Load more
            </button>
          </div>

          <div class="history__list" *ngIf="state.history.transactions.length > 0; else empty">
            <a
              *ngFor="let tx of state.history.transactions"
              [routerLink]="['/transaction', tx.tx_id]"
            >
              <span>{{ tx.tx_id.slice(0, 12) }}…</span>
              <span>{{ tx.direction }}</span>
              <span>{{ tx.amount }}</span>
              <span>{{ tx.status }}</span>
            </a>
          </div>

          <ng-template #empty>
            <p class="muted">No transactions yet.</p>
          </ng-template>
        </section>
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

      .search-form {
        display: grid;
        gap: 0.75rem;
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 1.5rem;
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

      .history {
        display: grid;
        gap: 0.75rem;
      }

      .history__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
      }

      .history__list {
        display: grid;
        gap: 0.5rem;
      }

      .history__list a {
        display: grid;
        grid-template-columns: 1.2fr 0.6fr 0.6fr 0.6fr;
        gap: 0.75rem;
        padding: 0.7rem 0.9rem;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        background: rgba(255, 255, 255, 0.02);
        color: inherit;
        text-decoration: none;
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
      }

      .btn {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.04);
        color: inherit;
        border-radius: 999px;
        padding: 0.55rem 0.9rem;
        cursor: pointer;
      }

      .btn--primary {
        border-color: rgba(27, 220, 242, 0.45);
        background: rgba(27, 220, 242, 0.12);
      }

      .btn--ghost {
        background: rgba(255, 255, 255, 0.02);
      }

      .muted {
        color: var(--text-secondary);
      }

      .link {
        color: var(--accent);
        text-decoration: none;
      }

      @media (max-width: 720px) {
        .search-form__row {
          grid-template-columns: 1fr;
        }

        .history__list a {
          grid-template-columns: 1fr;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountSearchComponent {
  readonly addressControl = new FormControl('', { nonNullable: true });
  loading = false;
  error: string | null = null;
  state: AccountLookupState | null = null;

  constructor(private readonly data: ExplorerDataService) {}

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const address = this.addressControl.value.trim();
    if (!address) {
      this.error = 'Enter an account address.';
      return;
    }

    await this.loadAddress(address, true);
  }

  async loadMore(): Promise<void> {
    if (!this.state || !this.state.history.has_more || !this.state.history.next_cursor) {
      return;
    }

    await this.loadAddress(this.state.address, false, this.state.history.next_cursor);
  }

  private async loadAddress(address: string, reset: boolean, cursor?: string | null): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const [balance, history] = await Promise.all([
        this.data.fetchBalance(address),
        this.data.fetchTransactionHistory(address, 25, cursor ?? null)
      ]);

      const mergedHistory = !reset && this.state
        ? {
            ...history,
            transactions: [...this.state.history.transactions, ...history.transactions]
          }
        : history;

      this.state = {
        address: balance.address,
        balance: balance.balance,
        nonce: balance.nonce,
        history: mergedHistory
      };
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to fetch account.';
    } finally {
      this.loading = false;
    }
  }

  formatBalance(value: string): string {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return (numeric / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return value;
  }
}
