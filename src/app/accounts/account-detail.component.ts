import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, ParamMap, RouterModule } from '@angular/router';
import { combineLatest, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import type { AttoValue } from '@shared/models/common';
import type { AccountActivitySnapshot } from '@shared/models/account.model';
import type { TransactionSummary } from '@shared/models/transaction.model';
import type { BlockSummary } from '@shared/models/block.model';

@Component({
  selector: 'account-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <ng-container *ngIf="viewModel$ | async as vm; else loading">
      <section class="account-detail" *ngIf="vm.snapshot; else notFound" aria-labelledby="account-heading">
        <header class="account-detail__header">
          <div>
            <p class="account-detail__label">Account</p>
            <h1 id="account-heading">{{ vm.snapshot.account.address }}</h1>
            <p class="muted">Last active: {{ vm.snapshot.account.lastSeen | date: 'medium' }}</p>
          </div>
        </header>

        <section aria-label="Account balances" class="account-detail__grid">
          <article>
            <h2>Available Balance</h2>
            <p>{{ formatCoins(vm.snapshot.account.balance) }} CHRT</p>
          </article>
          <article>
            <h2>Staked Balance</h2>
            <p>{{ formatCoins(vm.snapshot.account.stakedBalance) }} CHRT</p>
          </article>
          <article>
            <h2>Nonce</h2>
            <p>{{ vm.snapshot.account.nonce }}</p>
          </article>
          <article>
            <h2>Reputation</h2>
            <p>{{ vm.snapshot.account.reputation }}</p>
          </article>
        </section>

        <section class="account-detail__activity" aria-label="Recent activity">
          <div class="section-heading">
            <h2>Recent Transactions</h2>
            <p class="muted">Outbound / Inbound</p>
          </div>

          <div class="activity-columns">
            <article>
              <h3>Outbound ({{ vm.snapshot.outbound.length }})</h3>
              <ul>
                <li *ngFor="let tx of vm.snapshot.outbound; trackBy: trackByHash">
                  <a [routerLink]="['/transaction', tx.hash]">
                    {{ formatHash(tx.hash) }} · {{ formatCoins(tx.value) }} CHRT → {{ formatHash(tx.to) }}
                  </a>
                </li>
              </ul>
            </article>

            <article>
              <h3>Inbound ({{ vm.snapshot.inbound.length }})</h3>
              <ul>
                <li *ngFor="let tx of vm.snapshot.inbound; trackBy: trackByHash">
                  <a [routerLink]="['/transaction', tx.hash]">
                    {{ formatHash(tx.hash) }} · {{ formatCoins(tx.value) }} CHRT ← {{ formatHash(tx.from) }}
                  </a>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section class="account-detail__blocks" aria-label="Recent blocks">
          <div class="section-heading">
            <h2>Recent Blocks</h2>
            <p class="muted">{{ vm.snapshot.recentBlocks.length }} references</p>
          </div>

          <div class="block-list">
            <a *ngFor="let block of vm.snapshot.recentBlocks; trackBy: trackByBlock" [routerLink]="['/block', block.hash]">
              <span>{{ block.height | number }}</span>
              <span>{{ formatHash(block.hash) }}</span>
              <span>{{ block.timestamp | date: 'short' }}</span>
            </a>
          </div>
        </section>
      </section>
    </ng-container>

    <ng-template #notFound>
      <section class="empty-state" aria-live="polite">
        <h1>Account not found</h1>
        <p>The requested account is not present in the active dataset window.</p>
        <a routerLink="/" class="btn">Back to overview</a>
      </section>
    </ng-template>

    <ng-template #loading>
      <section class="empty-state" aria-live="polite">
        <p>Loading account data…</p>
      </section>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .account-detail {
        display: flex;
        flex-direction: column;
        gap: 2rem;
      }

      .account-detail__header {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 1.5rem;
      }

      .account-detail__label {
        margin: 0;
        color: var(--text-secondary);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.75rem;
      }

      .account-detail__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 1rem;
      }

      .account-detail__grid article {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 1.25rem;
      }

      .account-detail__grid h2 {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.9rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .account-detail__grid p {
        margin: 0.45rem 0 0;
      }

      .account-detail__activity {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 1.5rem;
        display: grid;
        gap: 1rem;
      }

      .section-heading {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }

      .activity-columns {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1.25rem;
      }

      article ul {
        list-style: none;
        margin: 0.5rem 0 0;
        padding: 0;
        display: grid;
        gap: 0.6rem;
      }

      article li a {
        display: inline-flex;
        gap: 0.4rem;
        text-decoration: none;
        color: inherit;
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
      }

      .account-detail__blocks {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 1.5rem;
        display: grid;
        gap: 1rem;
      }

      .block-list {
        display: grid;
        gap: 0.75rem;
      }

      .block-list a {
        display: grid;
        grid-template-columns: minmax(70px, auto) minmax(160px, 1fr) minmax(120px, auto);
        gap: 0.75rem;
        align-items: center;
        text-decoration: none;
        padding: 0.75rem 1rem;
        border-radius: 14px;
        border: 1px solid rgba(14, 165, 233, 0.1);
        background: rgba(14, 165, 233, 0.03);
        color: inherit;
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
        transition: all 0.2s ease;
      }

      .block-list a:hover,
      .block-list a:focus-visible {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.1), rgba(20, 184, 166, 0.06));
        border-color: rgba(14, 165, 233, 0.3);
        transform: translateX(4px);
        box-shadow: inset 3px 0 0 rgba(14, 165, 233, 0.6);
      }

      @media (max-width: 720px) {
        .block-list a {
          grid-template-columns: 1fr;
          gap: 0.35rem;
        }
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
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountDetailComponent {
  readonly viewModel$: Observable<{ snapshot: AccountActivitySnapshot | undefined }> = this.route.paramMap.pipe(
    map((params: ParamMap) => params.get('address')),
    switchMap((address: string | null) =>
      combineLatest([this.data.accounts$, this.data.recentTransactions$]).pipe(
        map(() => ({ snapshot: this.buildSnapshot(address) }))
      )
    )
  );

  constructor(private readonly route: ActivatedRoute, private readonly data: ExplorerDataService) {}

  trackByHash(_: number, tx: TransactionSummary): TransactionSummary['hash'] {
    return tx.hash;
  }

  trackByBlock(_: number, block: BlockSummary): BlockSummary['hash'] {
    return block.hash;
  }

  formatHash(value: string): string {
    return value.length > 12 ? `${value.slice(0, 12)}…${value.slice(-4)}` : value;
  }

  formatCoins(value: AttoValue): string {
    const normalized = (value as number) / 1_000_000;
    return normalized.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  private buildSnapshot(address: string | null): AccountActivitySnapshot | undefined {
    if (!address) {
      return undefined;
    }

    return this.data.getAccountSnapshot(address as AccountActivitySnapshot['account']['address']) ?? undefined;
  }
}
