import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ExplorerDataService } from '@app/services/explorer-data.service';

interface BridgeMetrics {
  totalShielded: number;
  totalUnshielded: number;
  activeShieldedAccounts: number;
  pendingOperations: number;
}

interface BridgeOperation {
  id: string;
  type: 'shield' | 'unshield' | 'transfer';
  sender: string;
  recipient: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  timestamp: string;
  txHash: string;
}

@Component({
  selector: 'privacy-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="privacy" aria-labelledby="privacy-heading">
      <header class="privacy__header">
        <div>
          <h1 id="privacy-heading">Privacy & Bridge</h1>
          <p class="privacy__subtitle">Shielded transactions and cross-chain bridge operations.</p>
        </div>
      </header>

      <div *ngIf="loading" class="loading">Loading privacy data...</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error">
        <!-- Privacy Metrics -->
        <section class="privacy__metrics" aria-label="Privacy metrics">
          <article class="metric-card metric-card--cyan">
            <h2>Total Shielded</h2>
            <p class="metric-value">{{ formatCoins(metrics.totalShielded) }}</p>
            <span class="metric-label">CHERT</span>
          </article>

          <article class="metric-card metric-card--teal">
            <h2>Total Unshielded</h2>
            <p class="metric-value">{{ formatCoins(metrics.totalUnshielded) }}</p>
            <span class="metric-label">CHERT</span>
          </article>

          <article class="metric-card metric-card--green">
            <h2>Shielded Accounts</h2>
            <p class="metric-value">{{ metrics.activeShieldedAccounts }}</p>
            <span class="metric-label">addresses</span>
          </article>

          <article class="metric-card metric-card--purple">
            <h2>Pending</h2>
            <p class="metric-value">{{ metrics.pendingOperations }}</p>
            <span class="metric-label">operations</span>
          </article>
        </section>

        <!-- Shielded Transactions -->
        <section class="privacy__transactions" aria-label="Shielded transactions">
          <div class="section-heading">
            <h2>Recent Privacy Operations</h2>
            <p class="muted">Shield, unshield, and private transfers</p>
          </div>

          <div class="operations-table" role="table">
            <div class="operations-table__header" role="row">
              <span role="columnheader">Type</span>
              <span role="columnheader">From</span>
              <span role="columnheader">To</span>
              <span role="columnheader">Amount</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Time</span>
            </div>

            <div
              *ngFor="let op of operations; trackBy: trackByOperation"
              class="operation-row"
              role="row"
            >
              <span role="cell">
                <span class="operation-type" [attr.data-type]="op.type">
                  {{ op.type | titlecase }}
                </span>
              </span>
              <span role="cell" class="address">{{ formatAddress(op.sender) }}</span>
              <span role="cell" class="address">{{ formatAddress(op.recipient) }}</span>
              <span role="cell">{{ formatCoins(op.amount) }} CHERT</span>
              <span role="cell">
                <span class="status" [attr.data-status]="op.status">
                  {{ op.status | titlecase }}
                </span>
              </span>
              <span role="cell">{{ op.timestamp }}</span>
            </div>
          </div>
        </section>

        <!-- zkBridge Info -->
        <section class="privacy__bridge" aria-label="zkBridge information">
          <div class="section-heading">
            <h2>zkBridge Protocol</h2>
            <p class="muted">Zero-knowledge proof based bridge</p>
          </div>

          <div class="bridge-info">
            <article class="info-card">
              <div class="info-card__icon info-card__icon--shield">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              </div>
              <div class="info-card__content">
                <h3>Shielding</h3>
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
                <h3>Unshielding</h3>
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
                <h3>Private Transfers</h3>
                <p>Send shielded tokens to other shielded addresses without revealing amounts.</p>
              </div>
            </article>
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

      .privacy {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .privacy__header {
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

      .privacy__subtitle {
        margin: 0.25rem 0 0;
        color: var(--text-secondary);
      }

      /* Metrics Grid */
      .privacy__metrics {
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

      /* Section */
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

      /* Operations Table */
      .privacy__transactions,
      .privacy__bridge {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .operations-table {
        display: flex;
        flex-direction: column;
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        background: var(--panel-bg);
        overflow: hidden;
      }

      .operations-table__header,
      .operation-row {
        display: grid;
        grid-template-columns: 100px 1.2fr 1.2fr 1fr 100px 100px;
        gap: 0.75rem;
        padding: 0.9rem 1.25rem;
        align-items: center;
      }

      .operations-table__header {
        font-size: 0.8rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--panel-border);
        background: rgba(14, 165, 233, 0.03);
      }

      .operation-row {
        border-bottom: 1px solid rgba(14, 165, 233, 0.08);
        transition: all 0.2s ease;
      }

      .operation-row:last-child {
        border-bottom: none;
      }

      .operation-row:hover {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(20, 184, 166, 0.05));
      }

      .address {
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.9rem;
      }

      .operation-type {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 500;
      }

      .operation-type[data-type="shield"] {
        background: rgba(14, 165, 233, 0.15);
        color: #0ea5e9;
      }

      .operation-type[data-type="unshield"] {
        background: rgba(20, 184, 166, 0.15);
        color: #14b8a6;
      }

      .operation-type[data-type="transfer"] {
        background: rgba(168, 85, 247, 0.15);
        color: #a855f7;
      }

      .operation-type svg {
        width: 14px;
        height: 14px;
      }

      .status {
        display: inline-flex;
        align-items: center;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: capitalize;
      }

      .status[data-status="completed"] {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }

      .status[data-status="pending"] {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
      }

      .status[data-status="failed"] {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      /* Bridge Info */
      .bridge-info {
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
        box-shadow: 0 4px 16px rgba(14, 165, 233, 0.1);
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

      .loading, .error {
        padding: 2rem;
        text-align: center;
        color: var(--text-secondary);
        background: var(--panel-bg);
        border-radius: 18px;
        border: 1px solid var(--panel-border);
      }

      .error {
        color: var(--danger);
        border-color: rgba(239, 68, 68, 0.3);
      }

      @media (max-width: 960px) {
        .operations-table__header,
        .operation-row {
          grid-template-columns: 80px 1fr 1fr 80px;
        }

        .operations-table__header span:nth-child(n + 5),
        .operation-row span:nth-child(n + 5) {
          display: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrivacyPageComponent implements OnInit {
  metrics: BridgeMetrics = {
    totalShielded: 0,
    totalUnshielded: 0,
    activeShieldedAccounts: 0,
    pendingOperations: 0
  };
  
  operations: BridgeOperation[] = [];
  
  loading = true;
  error: string | null = null;

  constructor(
    private readonly data: ExplorerDataService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadPrivacyData();
    this.cdr.detectChanges();
  }

  private async loadPrivacyData(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const [privacyInfo, ops] = await Promise.all([
        this.data.fetchPrivacyInfo().catch(() => null),
        this.data.fetchPrivacyOperations(20).catch(() => [])
      ]);

      if (privacyInfo) {
        this.metrics = {
          totalShielded: parseFloat(privacyInfo.total_shielded) / 1_000_000,
          totalUnshielded: parseFloat(privacyInfo.total_unshielded) / 1_000_000,
          activeShieldedAccounts: privacyInfo.active_shielded_accounts,
          pendingOperations: privacyInfo.pending_operations
        };
      }

      if (ops && ops.length > 0) {
        this.operations = ops.map(o => ({
          id: o.id,
          type: o.type,
          sender: o.sender,
          recipient: o.recipient,
          amount: parseFloat(o.amount) / 1_000_000,
          status: o.status,
          timestamp: o.timestamp,
          txHash: o.tx_hash
        }));
      }

    } catch (err) {
      this.error = 'Failed to load privacy data';
      console.error('Privacy data load error:', err);
    } finally {
      this.loading = false;
    }
  }

  trackByOperation(_: number, op: BridgeOperation): string {
    return op.id;
  }

  formatAddress(address: string): string {
    if (!address) return '';
    return address.length > 16 ? `${address.slice(0, 10)}…${address.slice(-4)}` : address;
  }

  formatCoins(value: number): string {
    if (!value && value !== 0) return '0';
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}
