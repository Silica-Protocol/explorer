import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ExplorerDataService } from '@app/services/explorer-data.service';

interface TokenHolder {
  address: string;
  balance: number;
  percentage: number;
}

interface TokenTransfer {
  hash: string;
  from: string;
  to: string;
  value: number;
  timestamp: string;
}

@Component({
  selector: 'token-detail-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="token-detail" aria-labelledby="token-heading">
      <header class="token-detail__header">
        <div class="token-title">
          <span class="token-icon">{{ token?.symbol?.charAt(0) || '?' }}</span>
          <div>
            <h1 id="token-heading">{{ token?.name || 'Loading...' }}</h1>
            <p class="token-symbol">{{ token?.symbol }}</p>
          </div>
        </div>
        <a routerLink="/tokens" class="btn btn--back">← Back to Tokens</a>
      </header>

      <div *ngIf="loading" class="loading">Loading token data...</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error && token">
        <section class="token-detail__metrics" aria-label="Token statistics">
          <article class="metric-card metric-card--cyan">
            <h2>Total Supply</h2>
            <p class="metric-value">{{ formatSupply(token.totalSupply, token.decimals) }}</p>
            <span class="metric-label">{{ token.symbol }}</span>
          </article>

          <article class="metric-card metric-card--teal">
            <h2>Holders</h2>
            <p class="metric-value">{{ token.holderCount | number }}</p>
            <span class="metric-label">addresses</span>
          </article>

          <article class="metric-card metric-card--green">
            <h2>Transfers</h2>
            <p class="metric-value">{{ token.transferCount | number }}</p>
            <span class="metric-label">all time</span>
          </article>

          <article class="metric-card metric-card--purple">
            <h2>Decimals</h2>
            <p class="metric-value">{{ token.decimals }}</p>
            <span class="metric-label">precision</span>
          </article>
        </section>

        <section class="token-detail__info" aria-label="Token information">
          <div class="info-card">
            <h3>Contract Address</h3>
            <p class="address">{{ token.address }}</p>
          </div>
          <div class="info-card">
            <h3>Creator</h3>
            <p class="address">{{ formatAddress(token.creator) }}</p>
          </div>
          <div class="info-card">
            <h3>Deployed Block</h3>
            <p>{{ token.deployBlock | number }}</p>
          </div>
        </section>

        <section class="token-detail__holders" aria-label="Token holders">
          <div class="section-heading">
            <h2>Top Holders</h2>
            <p class="muted">Largest token holdings</p>
          </div>

          <div class="holders-table" role="table">
            <div class="holders-table__header" role="row">
              <span role="columnheader">Rank</span>
              <span role="columnheader">Address</span>
              <span role="columnheader">Balance</span>
              <span role="columnheader">Percentage</span>
            </div>

            <div *ngFor="let holder of holders; let i = index" class="holder-row" role="row">
              <span role="cell" class="rank">#{{ i + 1 }}</span>
              <span role="cell" class="address">{{ formatAddress(holder.address) }}</span>
              <span role="cell">{{ formatSupply(holder.balance, token.decimals) }} {{ token.symbol }}</span>
              <span role="cell">
                <div class="percentage-bar">
                  <div class="percentage-bar__fill" [style.width.%]="holder.percentage"></div>
                </div>
                <span class="percentage-value">{{ holder.percentage | number:'1.2-2' }}%</span>
              </span>
            </div>

            <div *ngIf="holders.length === 0" class="empty-state">
              No holders found
            </div>
          </div>
        </section>

        <section class="token-detail__transfers" aria-label="Recent transfers">
          <div class="section-heading">
            <h2>Recent Transfers</h2>
            <p class="muted">Latest token transfers</p>
          </div>

          <div class="transfers-table" role="table">
            <div class="transfers-table__header" role="row">
              <span role="columnheader">Transaction</span>
              <span role="columnheader">From</span>
              <span role="columnheader">To</span>
              <span role="columnheader">Value</span>
              <span role="columnheader">Time</span>
            </div>

            <div *ngFor="let transfer of transfers" class="transfer-row" role="row">
              <span role="cell">
                <a [routerLink]="['/transaction', transfer.hash]" class="tx-hash">{{ formatAddress(transfer.hash) }}</a>
              </span>
              <span role="cell" class="address">{{ formatAddress(transfer.from) }}</span>
              <span role="cell" class="address">{{ formatAddress(transfer.to) }}</span>
              <span role="cell">{{ formatSupply(transfer.value, token.decimals) }} {{ token.symbol }}</span>
              <span role="cell">{{ transfer.timestamp }}</span>
            </div>

            <div *ngIf="transfers.length === 0" class="empty-state">
              No transfers found
            </div>
          </div>
        </section>
      </ng-container>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .token-detail {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .token-detail__header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 1.5rem;
        align-items: center;
      }

      .token-title {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .token-icon {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(20, 184, 166, 0.2));
        color: #0ea5e9;
        font-weight: 700;
        font-size: 1.5rem;
      }

      h1 {
        font-size: var(--h1-size);
        margin: 0;
        background: var(--gradient-h1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .token-symbol {
        margin: 0.25rem 0 0;
        color: #0ea5e9;
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-weight: 500;
      }

      .btn {
        appearance: none;
        border: 1px solid rgba(14, 165, 233, 0.2);
        background: rgba(14, 165, 233, 0.05);
        color: inherit;
        border-radius: 999px;
        padding: 0.55rem 0.9rem;
        font-size: 0.9rem;
        line-height: 1;
        cursor: pointer;
        transition: all 0.2s ease;
        text-decoration: none;
      }

      .btn--back {
        border-color: rgba(14, 165, 233, 0.3);
        color: #0ea5e9;
      }

      .btn--back:hover {
        box-shadow: 0 4px 20px rgba(14, 165, 233, 0.3);
        border-color: rgba(14, 165, 233, 0.6);
        transform: translateY(-2px);
      }

      .loading, .error {
        padding: 2rem;
        text-align: center;
        color: var(--text-secondary);
        background: var(--panel-bg);
        border-radius: 18px;
        border: 1px solid var(--panel-border);
      }

      .error {
        color: #ef4444;
      }

      .section-heading {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .section-heading h2 {
        font-size: var(--h2-size);
        margin: 0;
      }

      .muted {
        color: var(--text-secondary);
        margin: 0;
      }

      .token-detail__metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 1rem;
      }

      .metric-card {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.05), rgba(20, 184, 166, 0.03));
        border: 1px solid rgba(14, 165, 233, 0.15);
        border-radius: 16px;
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
      }

      .metric-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        background: linear-gradient(180deg, #0ea5e9, #14b8a6);
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .metric-card:hover {
        transform: translateY(-4px);
        border-color: rgba(14, 165, 233, 0.4);
        box-shadow: 0 8px 24px rgba(14, 165, 233, 0.15);
      }

      .metric-card:hover::before {
        opacity: 1;
      }

      .metric-card--cyan::before { background: linear-gradient(180deg, #0ea5e9, #06b6d4); }
      .metric-card--teal::before { background: linear-gradient(180deg, #14b8a6, #0d9488); }
      .metric-card--green::before { background: linear-gradient(180deg, #22c55e, #16a34a); }
      .metric-card--purple::before { background: linear-gradient(180deg, #a855f7, #9333ea); }

      .metric-card h2 {
        font-size: var(--metric-label-size);
        color: var(--text-secondary);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0;
      }

      .metric-value {
        margin: 0;
        font-size: var(--metric-value-size);
        font-weight: 700;
        background: var(--gradient-h1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .metric-label {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .token-detail__info {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
      }

      .info-card {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.25rem;
      }

      .info-card h3 {
        margin: 0;
        font-size: 0.85rem;
        color: var(--text-secondary);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .info-card p {
        margin: 0.5rem 0 0;
        font-size: 0.95rem;
      }

      .info-card .address {
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.85rem;
        word-break: break-all;
      }

      .holders-table,
      .transfers-table {
        display: flex;
        flex-direction: column;
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        background: var(--panel-bg);
        overflow: hidden;
      }

      .holders-table__header,
      .transfer-row,
      .holder-row {
        display: grid;
        grid-template-columns: 60px 1.5fr 1.5fr 1fr;
        gap: 0.75rem;
        padding: 0.9rem 1.25rem;
        align-items: center;
      }

      .transfers-table__header,
      .transfer-row {
        display: grid;
        grid-template-columns: 1.2fr 1.2fr 1.2fr 1fr 1fr;
        gap: 0.75rem;
        padding: 0.9rem 1.25rem;
        align-items: center;
      }

      .holders-table__header,
      .transfers-table__header {
        font-size: 0.8rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--panel-border);
        background: rgba(14, 165, 233, 0.03);
      }

      .holder-row,
      .transfer-row {
        border-bottom: 1px solid rgba(14, 165, 233, 0.08);
        transition: all 0.2s ease;
      }

      .holder-row:last-child,
      .transfer-row:last-child {
        border-bottom: none;
      }

      .holder-row:hover,
      .transfer-row:hover {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(20, 184, 166, 0.05));
      }

      .rank {
        font-weight: 600;
        color: var(--text-secondary);
      }

      .address {
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.9rem;
      }

      .tx-hash {
        color: #0ea5e9;
        text-decoration: none;
      }

      .tx-hash:hover {
        text-decoration: underline;
      }

      .percentage-bar {
        width: 60px;
        height: 6px;
        background: rgba(14, 165, 233, 0.2);
        border-radius: 3px;
        overflow: hidden;
        display: inline-block;
        margin-right: 0.5rem;
      }

      .percentage-bar__fill {
        height: 100%;
        background: linear-gradient(90deg, #0ea5e9, #14b8a6);
        border-radius: 3px;
      }

      .percentage-value {
        font-size: 0.85rem;
        color: var(--text-secondary);
      }

      .empty-state {
        padding: 3rem;
        text-align: center;
        color: var(--text-secondary);
      }

      @media (max-width: 960px) {
        .holders-table__header,
        .holder-row {
          grid-template-columns: 50px 1fr 1fr;
        }

        .holders-table__header span:nth-child(4),
        .holder-row span:nth-child(4) {
          display: none;
        }

        .transfers-table__header,
        .transfer-row {
          grid-template-columns: 1fr 1fr 1fr;
        }

        .transfers-table__header span:nth-child(n + 4),
        .transfer-row span:nth-child(n + 4) {
          display: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TokenDetailPageComponent implements OnInit {
  token: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: number;
    holderCount: number;
    transferCount: number;
    creator: string;
    deployBlock: number;
  } | null = null;

  holders: TokenHolder[] = [];
  transfers: TokenTransfer[] = [];

  loading = true;
  error: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly data: ExplorerDataService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      await this.loadToken(address);
    } else {
      this.error = 'No token address provided';
      this.loading = false;
    }
    this.cdr.detectChanges();
  }

  private async loadToken(address: string): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const [token, holders, transfers] = await Promise.all([
        this.data.fetchToken(address).catch(() => null),
        this.data.fetchTokenHolders(address, 20).catch(() => []),
        this.data.fetchTokenTransfers(address, 20).catch(() => [])
      ]);

      if (token) {
        this.token = {
          address: token.address,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          totalSupply: parseFloat(token.total_supply),
          holderCount: token.holder_count,
          transferCount: token.transfer_count,
          creator: token.creator,
          deployBlock: token.deploy_block
        };
      }

      this.holders = holders.map(h => ({
        address: h.address,
        balance: parseFloat(h.balance),
        percentage: h.percentage
      }));

      this.transfers = transfers.map(t => ({
        hash: t.hash,
        from: t.from,
        to: t.to,
        value: parseFloat(t.value),
        timestamp: t.timestamp
      }));

      if (!token) {
        this.error = 'Token not found';
      }

    } catch (err) {
      this.error = 'Failed to load token data';
      console.error('Token load error:', err);
    } finally {
      this.loading = false;
    }
  }

  formatAddress(address: string): string {
    if (!address) return '';
    return address.length > 16 ? `${address.slice(0, 10)}…${address.slice(-4)}` : address;
  }

  formatSupply(value: number, decimals: number): string {
    if (!value && value !== 0) return '0';
    const divisor = Math.pow(10, decimals);
    const formatted = value / divisor;
    return formatted.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}
