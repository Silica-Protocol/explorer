import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ExplorerDataService } from '@app/services/explorer-data.service';

interface BridgeTx {
  id: string;
  type: 'deposit' | 'withdraw';
  sourceChain: string;
  destinationChain: string;
  sender: string;
  recipient: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  timestamp: string;
  txHash: string;
}

interface BridgeStats {
  totalDeposits: number;
  totalWithdraws: number;
  activeTransfers: number;
  supportedChains: string[];
}

interface PrivacyMetrics {
  totalShielded: number;
  totalUnshielded: number;
  activeShieldedAccounts: number;
  pendingOperations: number;
}

interface PrivacyOperation {
  id: string;
  type: 'shield' | 'unshield' | 'transfer';
  sender: string;
  recipient: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  timestamp: string;
}

@Component({
  selector: 'bridge-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="bridge" aria-labelledby="bridge-heading">
      <header class="bridge__header">
        <div>
          <h1 id="bridge-heading">Bridge & Privacy</h1>
          <p class="bridge__subtitle">Cross-chain transfers and shielded transactions</p>
        </div>
      </header>

      <div *ngIf="loading" class="loading">Loading bridge data...</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error">
        <!-- Cross-Chain Bridge Section -->
        <section class="bridge__section" aria-label="Cross-chain bridge">
          <div class="section-heading">
            <h2>Cross-Chain Bridge</h2>
            <p class="muted">Transfer assets between chains</p>
          </div>

          <section class="bridge__metrics" aria-label="Bridge statistics">
            <article class="metric-card metric-card--cyan">
              <h2>Total Deposits</h2>
              <p class="metric-value">{{ formatCoins(stats.totalDeposits) }}</p>
              <span class="metric-label">CHERT</span>
            </article>

            <article class="metric-card metric-card--teal">
              <h2>Total Withdraws</h2>
              <p class="metric-value">{{ formatCoins(stats.totalWithdraws) }}</p>
              <span class="metric-label">CHERT</span>
            </article>

            <article class="metric-card metric-card--green">
              <h2>Active Transfers</h2>
              <p class="metric-value">{{ stats.activeTransfers }}</p>
              <span class="metric-label">pending</span>
            </article>

            <article class="metric-card metric-card--purple">
              <h2>Supported Chains</h2>
              <p class="metric-value">{{ stats.supportedChains.length }}</p>
              <span class="metric-label">networks</span>
            </article>
          </section>

          <section class="bridge__chains" aria-label="Supported chains">
            <div class="section-heading">
              <h3>Supported Networks</h3>
            </div>
            <div class="chains-list">
              <div *ngFor="let chain of stats.supportedChains" class="chain-badge">
                {{ chain }}
              </div>
            </div>
          </section>

          <section class="bridge__transactions" aria-label="Bridge transactions">
            <div class="section-heading">
              <h3>Recent Bridge Transactions</h3>
            </div>

            <div class="bridge-table">
              <div class="bridge-table__header">
                <span>Type</span>
                <span>Route</span>
                <span>Sender</span>
                <span>Recipient</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Time</span>
              </div>

              <div *ngFor="let tx of transactions" class="bridge-row">
                <span>
                  <span class="tx-type" [attr.data-type]="tx.type">
                    {{ tx.type | titlecase }}
                  </span>
                </span>
                <span class="route">
                  {{ tx.sourceChain }} → {{ tx.destinationChain }}
                </span>
                <span class="address">{{ formatAddress(tx.sender) }}</span>
                <span class="address">{{ formatAddress(tx.recipient) }}</span>
                <span class="amount">{{ formatCoins(tx.amount) }} CHERT</span>
                <span>
                  <span class="status-badge" [attr.data-status]="tx.status">
                    {{ tx.status | titlecase }}
                  </span>
                </span>
                <span class="time">{{ tx.timestamp }}</span>
              </div>

              <div *ngIf="transactions.length === 0" class="empty-state">
                No bridge transactions found
              </div>
            </div>
          </section>
        </section>

        <!-- Privacy / Shielded Pool Section -->
        <section class="bridge__section" aria-label="Privacy pool">
          <div class="section-heading">
            <h2>Privacy Pool</h2>
            <p class="muted">Shielded transactions using zero-knowledge proofs</p>
          </div>

          <section class="bridge__metrics" aria-label="Privacy metrics">
            <article class="metric-card metric-card--cyan">
              <h2>Total Shielded</h2>
              <p class="metric-value">{{ formatCoins(privacyMetrics.totalShielded) }}</p>
              <span class="metric-label">CHERT</span>
            </article>

            <article class="metric-card metric-card--teal">
              <h2>Total Unshielded</h2>
              <p class="metric-value">{{ formatCoins(privacyMetrics.totalUnshielded) }}</p>
              <span class="metric-label">CHERT</span>
            </article>

            <article class="metric-card metric-card--green">
              <h2>Shielded Accounts</h2>
              <p class="metric-value">{{ privacyMetrics.activeShieldedAccounts }}</p>
              <span class="metric-label">addresses</span>
            </article>

            <article class="metric-card metric-card--purple">
              <h2>Pending</h2>
              <p class="metric-value">{{ privacyMetrics.pendingOperations }}</p>
              <span class="metric-label">operations</span>
            </article>
          </section>

          <section class="privacy__info" aria-label="Privacy features">
            <div class="info-grid">
              <article class="info-card">
                <div class="info-card__icon info-card__icon--shield">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                </div>
                <div class="info-card__content">
                  <h3>Shield</h3>
                  <p>Convert public tokens to shielded (private) tokens using zero-knowledge proofs.</p>
                </div>
              </article>

              <article class="info-card">
                <div class="info-card__icon info-card__icon--unshield">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </div>
                <div class="info-card__content">
                  <h3>Unshield</h3>
                  <p>Convert shielded tokens back to public tokens with proof of ownership.</p>
                </div>
              </article>

              <article class="info-card">
                <div class="info-card__icon info-card__icon--transfer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M16 8l-4 4-4-4"></path>
                    <path d="M8 16l4-4 4 4"></path>
                  </svg>
                </div>
                <div class="info-card__content">
                  <h3>Private Transfer</h3>
                  <p>Send shielded tokens to other shielded addresses without revealing amounts.</p>
                </div>
              </article>
            </div>
          </section>

          <section class="bridge__transactions" aria-label="Privacy operations">
            <div class="section-heading">
              <h3>Recent Privacy Operations</h3>
            </div>

            <div class="bridge-table">
              <div class="bridge-table__header">
                <span>Type</span>
                <span>From</span>
                <span>To</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Time</span>
              </div>

              <div *ngFor="let op of privacyOperations" class="bridge-row">
                <span>
                  <span class="tx-type" [attr.data-type]="op.type">
                    {{ op.type | titlecase }}
                  </span>
                </span>
                <span class="address">{{ formatAddress(op.sender) }}</span>
                <span class="address">{{ formatAddress(op.recipient) }}</span>
                <span class="amount">{{ formatCoins(op.amount) }} CHERT</span>
                <span>
                  <span class="status-badge" [attr.data-status]="op.status">
                    {{ op.status | titlecase }}
                  </span>
                </span>
                <span class="time">{{ op.timestamp }}</span>
              </div>

              <div *ngIf="privacyOperations.length === 0" class="empty-state">
                No privacy operations found
              </div>
            </div>
          </section>
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

      .bridge {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .bridge__header {
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

      .bridge__subtitle {
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

      .bridge__metrics {
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

      .bridge__chains {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.5rem;
      }

      .chains-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 1rem;
      }

      .chain-badge {
        padding: 0.5rem 1rem;
        background: rgba(14, 165, 233, 0.1);
        border: 1px solid rgba(14, 165, 233, 0.2);
        border-radius: 999px;
        font-size: 0.9rem;
        color: #0ea5e9;
      }

      .bridge-table {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        overflow: hidden;
      }

      .bridge-table__header,
      .bridge-row {
        display: grid;
        grid-template-columns: 100px 1.5fr 1.2fr 1.2fr 1fr 100px 1fr;
        gap: 0.75rem;
        padding: 0.9rem 1.25rem;
        align-items: center;
      }

      .bridge-table__header {
        font-size: 0.8rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--panel-border);
        background: rgba(14, 165, 233, 0.03);
      }

      .bridge-row {
        border-bottom: 1px solid rgba(14, 165, 233, 0.08);
      }

      .bridge-row:last-child {
        border-bottom: none;
      }

      .bridge-row:hover {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.05), rgba(20, 184, 166, 0.03));
      }

      .tx-type {
        display: inline-block;
        padding: 0.2rem 0.6rem;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 500;
      }

      .tx-type[data-type="deposit"] {
        background: rgba(14, 165, 233, 0.15);
        color: #0ea5e9;
      }

      .tx-type[data-type="withdraw"] {
        background: rgba(168, 85, 247, 0.15);
        color: #a855f7;
      }

      .tx-type[data-type="shield"] {
        background: rgba(14, 165, 233, 0.15);
        color: #0ea5e9;
      }

      .tx-type[data-type="unshield"] {
        background: rgba(20, 184, 166, 0.15);
        color: #14b8a6;
      }

      .tx-type[data-type="transfer"] {
        background: rgba(168, 85, 247, 0.15);
        color: #a855f7;
      }

      .route {
        font-size: 0.9rem;
        color: var(--text-secondary);
      }

      .address {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.85rem;
      }

      .amount {
        font-weight: 600;
        color: #22c55e;
      }

      .status-badge {
        display: inline-block;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .status-badge[data-status="completed"] {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }

      .status-badge[data-status="pending"] {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
      }

      .status-badge[data-status="failed"] {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      .time {
        font-size: 0.85rem;
        color: var(--text-secondary);
      }

      .empty-state {
        padding: 3rem;
        text-align: center;
        color: var(--text-secondary);
      }

      .bridge__section {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }

      .bridge__section + .bridge__section {
        padding-top: 2rem;
        border-top: 1px solid var(--panel-border);
      }

      .info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1rem;
      }

      .info-card {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.25rem;
        transition: all 0.3s ease;
      }

      .info-card:hover {
        border-color: rgba(14, 165, 233, 0.3);
        transform: translateY(-2px);
      }

      .info-card__icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }

      .info-card__icon svg {
        width: 24px;
        height: 24px;
      }

      .info-card__icon--shield {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(14, 165, 233, 0.1));
        color: #0ea5e9;
      }

      .info-card__icon--unshield {
        background: linear-gradient(135deg, rgba(20, 184, 166, 0.2), rgba(20, 184, 166, 0.1));
        color: #14b8a6;
      }

      .info-card__icon--transfer {
        background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(168, 85, 247, 0.1));
        color: #a855f7;
      }

      .info-card__content h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
      }

      .info-card__content p {
        margin: 0.5rem 0 0;
        font-size: 0.9rem;
        color: var(--text-secondary);
        line-height: 1.5;
      }

      @media (max-width: 960px) {
        .bridge-table__header,
        .bridge-row {
          grid-template-columns: 80px 1fr 1fr 80px;
        }

        .bridge-table__header span:nth-child(n + 5),
        .bridge-row span:nth-child(n + 5) {
          display: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BridgePageComponent implements OnInit {
  transactions: BridgeTx[] = [];
  stats: BridgeStats = {
    totalDeposits: 0,
    totalWithdraws: 0,
    activeTransfers: 0,
    supportedChains: []
  };
  privacyMetrics: PrivacyMetrics = {
    totalShielded: 0,
    totalUnshielded: 0,
    activeShieldedAccounts: 0,
    pendingOperations: 0
  };
  privacyOperations: PrivacyOperation[] = [];
  loading = true;
  error: string | null = null;

  constructor(private readonly data: ExplorerDataService) {}

  async ngOnInit(): Promise<void> {
    await this.loadBridgeData();
  }

  private async loadBridgeData(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const [transactions, stats, privacyInfo, privacyOps] = await Promise.all([
        this.data.fetchBridgeHistory(50),
        this.data.fetchBridgeStats(),
        this.data.fetchPrivacyInfo().catch(() => null),
        this.data.fetchPrivacyOperations(20).catch(() => [])
      ]);

      this.transactions = transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        sourceChain: tx.source_chain,
        destinationChain: tx.destination_chain,
        sender: tx.sender,
        recipient: tx.recipient,
        amount: parseFloat(tx.amount) / 1_000_000,
        status: tx.status,
        timestamp: tx.timestamp,
        txHash: tx.tx_hash
      }));

      this.stats = {
        totalDeposits: parseFloat(stats.total_deposits) / 1_000_000,
        totalWithdraws: parseFloat(stats.total_withdraws) / 1_000_000,
        activeTransfers: stats.active_transfers,
        supportedChains: stats.supported_chains
      };

      if (privacyInfo) {
        this.privacyMetrics = {
          totalShielded: parseFloat(privacyInfo.total_shielded) / 1_000_000,
          totalUnshielded: parseFloat(privacyInfo.total_unshielded) / 1_000_000,
          activeShieldedAccounts: privacyInfo.active_shielded_accounts,
          pendingOperations: privacyInfo.pending_operations
        };
      }

      this.privacyOperations = privacyOps.map(o => ({
        id: o.id,
        type: o.type,
        sender: o.sender,
        recipient: o.recipient,
        amount: parseFloat(o.amount) / 1_000_000,
        status: o.status,
        timestamp: o.timestamp
      }));

    } catch (err) {
      this.error = 'Failed to load bridge data';
      console.error('Bridge load error:', err);
    } finally {
      this.loading = false;
    }
  }

  formatAddress(address: string): string {
    if (!address) return '';
    return address.length > 16 ? `${address.slice(0, 10)}…${address.slice(-4)}` : address;
  }

  formatCoins(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
}
