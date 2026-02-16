import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { take } from 'rxjs/operators';
import { ExplorerDataService } from '@app/services/explorer-data.service';

interface StakingMetrics {
  totalStaked: number;
  totalValidators: number;
  activeDelegators: number;
  avgApy: number;
  totalRewards: number;
}

interface ValidatorDelegation {
  validatorAddress: string;
  delegatorAddress: string;
  amount: number;
  rewards: number;
  lastClaimed: string;
}

@Component({
  selector: 'staking-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="staking" aria-labelledby="staking-heading">
      <header class="staking__header">
        <div>
          <h1 id="staking-heading">Staking Dashboard</h1>
          <p class="staking__subtitle">Delegate tokens and earn rewards.</p>
        </div>
        <div class="staking__actions">
          <a routerLink="/validators" class="btn btn--primary">Become a Validator</a>
        </div>
      </header>

      <div *ngIf="loading" class="loading">Loading staking data...</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error">
        <!-- Staking Metrics -->
        <section class="staking__metrics" aria-label="Staking metrics">
          <article class="metric-card metric-card--cyan">
            <h2>Total Staked</h2>
            <p class="metric-value">{{ formatCoins(metrics.totalStaked) }}</p>
            <span class="metric-label">CHERT</span>
          </article>

          <article class="metric-card metric-card--teal">
            <h2>Active Validators</h2>
            <p class="metric-value">{{ metrics.totalValidators }}</p>
            <span class="metric-label">nodes</span>
          </article>

          <article class="metric-card metric-card--green">
            <h2>Delegators</h2>
            <p class="metric-value">{{ metrics.activeDelegators }}</p>
            <span class="metric-label">addresses</span>
          </article>

          <article class="metric-card metric-card--emerald">
            <h2>Average APY</h2>
            <p class="metric-value">{{ metrics.avgApy | number:'1.1-1' }}%</p>
            <span class="metric-label">annual</span>
          </article>

          <article class="metric-card">
            <h2>Total Rewards</h2>
            <p class="metric-value">{{ formatCoins(metrics.totalRewards) }}</p>
            <span class="metric-label">CHERT distributed</span>
          </article>
        </section>

        <!-- Top Delegations -->
        <section class="staking__delegations" aria-label="Top delegations">
          <div class="section-heading">
            <h2>Top Delegations</h2>
            <p class="muted">Highest delegations across the network</p>
          </div>

          <div class="delegations-table" role="table">
            <div class="delegations-table__header" role="row">
              <span role="columnheader">Validator</span>
              <span role="columnheader">Delegator</span>
              <span role="columnheader">Amount</span>
              <span role="columnheader">Rewards</span>
              <span role="columnheader">Last Claimed</span>
            </div>

            <div
              *ngFor="let delegation of topDelegations; trackBy: trackByDelegation"
              class="delegation-row"
              role="row"
            >
              <span role="cell" class="address">{{ formatAddress(delegation.validatorAddress) }}</span>
              <span role="cell" class="address">{{ formatAddress(delegation.delegatorAddress) }}</span>
              <span role="cell">{{ formatCoins(delegation.amount) }} CHERT</span>
              <span role="cell" class="rewards">{{ formatCoins(delegation.rewards) }} CHERT</span>
              <span role="cell">{{ delegation.lastClaimed }}</span>
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

      .staking {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .staking__header {
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

      .staking__subtitle {
        margin: 0.25rem 0 0;
        color: var(--text-secondary);
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

      .btn--primary {
        border-color: rgba(14, 165, 233, 0.4);
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(20, 184, 166, 0.1));
        color: #22d3ee;
        font-weight: 500;
      }

      .btn--primary:hover {
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
        color: var(--danger);
        border-color: rgba(239, 68, 68, 0.3);
      }

      /* Metrics Grid */
      .staking__metrics {
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
      .metric-card--emerald::before { background: linear-gradient(180deg, #10b981, #059669); }

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

      /* Delegations Table */
      .staking__delegations,
      .staking__rewards {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .delegations-table {
        display: flex;
        flex-direction: column;
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        background: var(--panel-bg);
        overflow: hidden;
      }

      .delegations-table__header,
      .delegation-row {
        display: grid;
        grid-template-columns: 1.5fr 1.5fr 1fr 1fr 1fr;
        gap: 0.75rem;
        padding: 0.9rem 1.25rem;
        align-items: center;
      }

      .delegations-table__header {
        font-size: 0.8rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--panel-border);
        background: rgba(14, 165, 233, 0.03);
      }

      .delegation-row {
        border-bottom: 1px solid rgba(14, 165, 233, 0.08);
        transition: all 0.2s ease;
      }

      .delegation-row:last-child {
        border-bottom: none;
      }

      .delegation-row:hover {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(20, 184, 166, 0.05));
        transform: translateX(4px);
        box-shadow: inset 4px 0 0 rgba(14, 165, 233, 0.6);
      }

      .address {
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.9rem;
      }

      .rewards {
        color: var(--success);
      }

      /* Rewards Grid */
      .rewards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1rem;
      }

      .reward-card {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.25rem;
        transition: all 0.3s ease;
      }

      .reward-card:hover {
        border-color: rgba(14, 165, 233, 0.3);
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(14, 165, 233, 0.1);
      }

      .reward-card__icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        flex-shrink: 0;
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1));
        color: #22c55e;
      }

      .reward-card__icon svg {
        width: 24px;
        height: 24px;
      }

      .reward-card__content h3 {
        margin: 0;
        font-size: 0.9rem;
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
      }

      .reward-amount {
        margin: 0.25rem 0 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--success);
      }

      .reward-time {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      @media (max-width: 960px) {
        .delegations-table__header,
        .delegation-row {
          grid-template-columns: 1.5fr 1fr 1fr;
        }

        .delegations-table__header span:nth-child(n + 4),
        .delegation-row span:nth-child(n + 4) {
          display: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StakingPageComponent implements OnInit {
  metrics: StakingMetrics = {
    totalStaked: 0,
    totalValidators: 0,
    activeDelegators: 0,
    avgApy: 0,
    totalRewards: 0
  };
  
  topDelegations: ValidatorDelegation[] = [];
  
  recentRewards: Array<{ to: string; amount: number; timestamp: string }> = [];
  
  loading = true;
  error: string | null = null;

  constructor(
    private readonly data: ExplorerDataService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadStakingData();
    this.cdr.detectChanges();
  }

  private async loadStakingData(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      console.log('Loading staking data...');
      
      const stakingInfo = await this.data.fetchStakingInfo().catch(err => {
        console.warn('fetchStakingInfo failed:', err);
        return null;
      });
      console.log('stakingInfo:', stakingInfo);

      const delegations = await this.data.fetchStakingDelegations(10).catch(err => {
        console.warn('fetchStakingDelegations failed:', err);
        return [];
      });
      console.log('delegations:', delegations);

      const networkStats = await this.data.networkStats$.pipe(
        take(1)
      ).toPromise().catch(err => {
        console.warn('networkStats failed:', err);
        return null;
      });
      console.log('networkStats:', networkStats);

      if (stakingInfo) {
        this.metrics = {
          totalStaked: parseFloat(stakingInfo.total_staked) / 1_000_000,
          totalValidators: stakingInfo.total_validators,
          activeDelegators: stakingInfo.active_delegators,
          avgApy: stakingInfo.avg_apy,
          totalRewards: parseFloat(stakingInfo.total_rewards) / 1_000_000
        };
      }

      if (delegations && delegations.length > 0) {
        this.topDelegations = delegations.map(d => ({
          validatorAddress: d.validator_address,
          delegatorAddress: d.delegator_address,
          amount: parseFloat(d.amount) / 1_000_000,
          rewards: parseFloat(d.rewards) / 1_000_000,
          lastClaimed: d.last_claimed
        }));
      }

      if (networkStats && this.metrics.totalValidators === 0) {
        this.metrics.totalValidators = networkStats.activeValidators;
      }

      console.log('Staking data loaded, metrics:', this.metrics);

    } catch (err) {
      this.error = 'Failed to load staking data';
      console.error('Staking data load error:', err);
    } finally {
      this.loading = false;
      console.log('Loading set to false');
    }
  }

  trackByDelegation(_: number, d: ValidatorDelegation): string {
    return `${d.validatorAddress}-${d.delegatorAddress}`;
  }

  formatAddress(address: string): string {
    if (!address) return '';
    return address.length > 20 ? `${address.slice(0, 12)}…${address.slice(-6)}` : address;
  }

  formatCoins(value: number): string {
    if (!value && value !== 0) return '0';
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}
