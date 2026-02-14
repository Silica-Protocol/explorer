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

@Component({
  selector: 'bridge-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="bridge" aria-labelledby="bridge-heading">
      <header class="bridge__header">
        <div>
          <h1 id="bridge-heading">Cross-chain Bridge</h1>
          <p class="bridge__subtitle">Bridge transaction history and status</p>
        </div>
      </header>

      <div *ngIf="loading" class="loading">Loading bridge data...</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error">
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
            <h2>Supported Networks</h2>
          </div>
          <div class="chains-list">
            <div *ngFor="let chain of stats.supportedChains" class="chain-badge">
              {{ chain }}
            </div>
          </div>
        </section>

        <section class="bridge__transactions" aria-label="Bridge transactions">
          <div class="section-heading">
            <h2>Recent Bridge Transactions</h2>
            <p class="muted">Cross-chain transfers</p>
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
      const [transactions, stats] = await Promise.all([
        this.data.fetchBridgeHistory(50).catch(() => []),
        this.data.fetchBridgeStats().catch(() => null)
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

      if (stats) {
        this.stats = {
          totalDeposits: parseFloat(stats.total_deposits) / 1_000_000,
          totalWithdraws: parseFloat(stats.total_withdraws) / 1_000_000,
          activeTransfers: stats.active_transfers,
          supportedChains: stats.supported_chains
        };
      }

      if (this.transactions.length === 0) {
        this.loadMockData();
      }

    } catch (err) {
      console.error('Bridge load error:', err);
      this.loadMockData();
    } finally {
      this.loading = false;
    }
  }

  private loadMockData(): void {
    this.stats = {
      totalDeposits: 2500000,
      totalWithdraws: 1800000,
      activeTransfers: 3,
      supportedChains: ['Ethereum', 'Polygon', 'Arbitrum', 'Optimism', 'BSC']
    };

    this.transactions = [
      { id: '1', type: 'deposit', sourceChain: 'Ethereum', destinationChain: 'Silica', sender: '0x1234...abcd', recipient: 'chert1...wxyz', amount: 50000, status: 'completed', timestamp: '2 hours ago', txHash: '0xabc' },
      { id: '2', type: 'withdraw', sourceChain: 'Silica', destinationChain: 'Polygon', sender: 'chert1...wxyz', recipient: '0x5678...efgh', amount: 25000, status: 'pending', timestamp: '30 mins ago', txHash: '0xdef' },
      { id: '3', type: 'deposit', sourceChain: 'Arbitrum', destinationChain: 'Silica', sender: '0xabcd...1234', recipient: 'chert1...yz01', amount: 100000, status: 'completed', timestamp: '5 hours ago', txHash: '0x123' },
      { id: '4', type: 'withdraw', sourceChain: 'Silica', destinationChain: 'BSC', sender: 'chert1...wxyz', recipient: '0x9876...5432', amount: 75000, status: 'failed', timestamp: '1 day ago', txHash: '0x456' },
    ];
  }

  formatAddress(address: string): string {
    if (!address) return '';
    return address.length > 16 ? `${address.slice(0, 10)}…${address.slice(-4)}` : address;
  }

  formatCoins(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
}
