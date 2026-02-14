import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ExplorerDataService } from '@app/services/explorer-data.service';

interface Token {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  holderCount: number;
  transferCount: number;
}

@Component({
  selector: 'tokens-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="tokens" aria-labelledby="tokens-heading">
      <header class="tokens__header">
        <div>
          <h1 id="tokens-heading">Token Explorer</h1>
          <p class="tokens__subtitle">CRC-20 tokens on Silica</p>
        </div>
      </header>

      <div *ngIf="loading" class="loading">Loading tokens...</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error">
        <section class="tokens__metrics" aria-label="Token statistics">
          <article class="metric-card metric-card--cyan">
            <h2>Total Tokens</h2>
            <p class="metric-value">{{ tokens.length }}</p>
            <span class="metric-label">CRC-20</span>
          </article>

          <article class="metric-card metric-card--teal">
            <h2>Total Transfers</h2>
            <p class="metric-value">{{ totalTransfers | number }}</p>
            <span class="metric-label">all time</span>
          </article>

          <article class="metric-card metric-card--green">
            <h2>Total Holders</h2>
            <p class="metric-value">{{ totalHolders | number }}</p>
            <span class="metric-label">addresses</span>
          </article>
        </section>

        <section class="tokens__list" aria-label="Token list">
          <div class="section-heading">
            <h2>All Tokens</h2>
            <p class="muted">CRC-20 tokens deployed on the network</p>
          </div>

          <div class="tokens-table" role="table">
            <div class="tokens-table__header" role="row">
              <span role="columnheader">Token</span>
              <span role="columnheader">Type</span>
              <span role="columnheader">Holders</span>
              <span role="columnheader">Transfers</span>
              <span role="columnheader">Total Supply</span>
            </div>

            <div
              *ngFor="let token of tokens"
              class="token-row"
              role="row"
              [routerLink]="['/token', token.address]"
            >
              <span role="cell" class="token-info">
                <span class="token-icon">{{ token.symbol.charAt(0) }}</span>
                <div class="token-details">
                  <span class="token-name">{{ token.name }}</span>
                  <span class="token-address">{{ formatAddress(token.address) }}</span>
                </div>
              </span>
              <span role="cell">
                <span class="token-type">{{ token.symbol }}</span>
              </span>
              <span role="cell">{{ token.holderCount | number }}</span>
              <span role="cell">{{ token.transferCount | number }}</span>
              <span role="cell">{{ formatSupply(token.totalSupply, token.decimals) }}</span>
            </div>

            <div *ngIf="tokens.length === 0" class="empty-state">
              No tokens found
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

      .tokens {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .tokens__header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 1.5rem;
        align-items: center;
      }

      h1 {
        font-size: var(--h1-size);
        margin: 0;
        background: var(--gradient-h1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .tokens__subtitle {
        margin: 0.25rem 0 0;
        color: var(--text-secondary);
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

      .tokens__metrics {
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

      .tokens-table {
        display: flex;
        flex-direction: column;
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        background: var(--panel-bg);
        overflow: hidden;
      }

      .tokens-table__header,
      .token-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 1.5fr;
        gap: 0.75rem;
        padding: 0.9rem 1.25rem;
        align-items: center;
      }

      .tokens-table__header {
        font-size: 0.8rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--panel-border);
        background: rgba(14, 165, 233, 0.03);
      }

      .token-row {
        border-bottom: 1px solid rgba(14, 165, 233, 0.08);
        transition: all 0.2s ease;
        cursor: pointer;
      }

      .token-row:last-child {
        border-bottom: none;
      }

      .token-row:hover {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(20, 184, 166, 0.05));
        transform: translateX(4px);
        box-shadow: inset 4px 0 0 rgba(14, 165, 233, 0.6);
      }

      .token-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .token-icon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(20, 184, 166, 0.2));
        color: #0ea5e9;
        font-weight: 700;
        font-size: 1rem;
      }

      .token-details {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }

      .token-name {
        font-weight: 600;
        font-size: 0.95rem;
      }

      .token-address {
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .token-type {
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.9rem;
        color: #0ea5e9;
      }

      .empty-state {
        padding: 3rem;
        text-align: center;
        color: var(--text-secondary);
      }

      @media (max-width: 960px) {
        .tokens-table__header,
        .token-row {
          grid-template-columns: 2fr 1fr 1fr;
        }

        .tokens-table__header span:nth-child(n + 4),
        .token-row span:nth-child(n + 4) {
          display: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TokensPageComponent implements OnInit {
  tokens: Token[] = [];
  totalTransfers = 0;
  totalHolders = 0;
  loading = true;
  error: string | null = null;

  constructor(private readonly data: ExplorerDataService) {}

  async ngOnInit(): Promise<void> {
    await this.loadTokens();
  }

  private async loadTokens(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const tokens = await this.data.fetchTokens(100).catch(() => []);

      this.tokens = tokens.map(t => ({
        address: t.address,
        name: t.name,
        symbol: t.symbol,
        decimals: t.decimals,
        totalSupply: parseFloat(t.total_supply),
        holderCount: t.holder_count,
        transferCount: t.transfer_count
      }));

      this.totalTransfers = this.tokens.reduce((sum, t) => sum + t.transferCount, 0);
      this.totalHolders = this.tokens.reduce((sum, t) => sum + t.holderCount, 0);

    } catch (err) {
      this.error = 'Failed to load tokens';
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
