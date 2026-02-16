import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ExplorerDataService } from '@app/services/explorer-data.service';

interface GovernanceMetrics {
  activeProposals: number;
  totalProposals: number;
  daoTreasury: number;
  voterParticipation: number;
}

interface Proposal {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'passed' | 'rejected' | 'executed';
  votesFor: number;
  votesAgainst: number;
  quorum: number;
  endTime: string;
  proposer: string;
}

@Component({
  selector: 'governance-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="governance" aria-labelledby="governance-heading">
      <header class="governance__header">
        <div>
          <h1 id="governance-heading">Governance</h1>
          <p class="governance__subtitle">DAO proposals and voting.</p>
        </div>
        <div class="governance__actions">
          <button class="btn btn--primary">Submit Proposal</button>
        </div>
      </header>

      <div *ngIf="loading" class="loading">Loading governance data...</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error">

      <!-- Governance Metrics -->
      <section class="governance__metrics" aria-label="Governance metrics">
        <article class="metric-card metric-card--cyan">
          <h2>Active Proposals</h2>
          <p class="metric-value">{{ metrics.activeProposals }}</p>
          <span class="metric-label">voting</span>
        </article>

        <article class="metric-card metric-card--teal">
          <h2>Total Proposals</h2>
          <p class="metric-value">{{ metrics.totalProposals }}</p>
          <span class="metric-label">all time</span>
        </article>

        <article class="metric-card metric-card--green">
          <h2>DAO Treasury</h2>
          <p class="metric-value">{{ formatCoins(metrics.daoTreasury) }}</p>
          <span class="metric-label">CHERT</span>
        </article>

        <article class="metric-card metric-card--emerald">
          <h2>Voter Participation</h2>
          <p class="metric-value">{{ metrics.voterParticipation | number:'1.0-0' }}%</p>
          <span class="metric-label">of eligible</span>
        </article>
      </section>

      <!-- Active Proposals -->
      <section class="governance__proposals" aria-label="Proposals">
        <div class="section-heading">
          <h2>Proposals</h2>
          <p class="muted">Community governance proposals</p>
        </div>

        <div class="proposals-list">
          <article *ngFor="let proposal of proposals" class="proposal-card" [attr.data-status]="proposal.status">
            <div class="proposal-card__header">
              <div class="proposal-card__id">#{{ proposal.id }}</div>
              <span class="proposal-status" [attr.data-status]="proposal.status">
                {{ proposal.status | titlecase }}
              </span>
            </div>

            <h3 class="proposal-card__title">{{ proposal.title }}</h3>
            <p class="proposal-card__description">{{ proposal.description }}</p>

            <div class="proposal-card__votes">
              <div class="vote-bar">
                <div class="vote-bar__for" [style.width.%]="getVotePercent(proposal, 'for')"></div>
                <div class="vote-bar__against" [style.width.%]="getVotePercent(proposal, 'against')"></div>
              </div>
              <div class="vote-stats">
                <span class="vote-for">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  {{ formatCoins(proposal.votesFor) }} ({{ getVotePercent(proposal, 'for') | number:'1.0-0' }}%)
                </span>
                <span class="vote-against">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                  {{ formatCoins(proposal.votesAgainst) }} ({{ getVotePercent(proposal, 'against') | number:'1.0-0' }}%)
                </span>
                <span class="quorum">
                  Quorum: {{ proposal.quorum }}%
                </span>
              </div>
            </div>

            <div class="proposal-card__footer">
              <span class="proposer">by {{ formatAddress(proposal.proposer) }}</span>
              <span class="end-time">Ends {{ proposal.endTime }}</span>
            </div>
          </article>
        </div>
      </section>

      <!-- Treasury -->
      <section class="governance__treasury" aria-label="Treasury">
        <div class="section-heading">
          <h2>DAO Treasury</h2>
          <p class="muted">Community controlled funds</p>
        </div>

        <div class="treasury-grid">
          <article class="treasury-card">
            <div class="treasury-card__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v12"></path>
                <path d="M6 12h12"></path>
              </svg>
            </div>
            <div class="treasury-card__content">
              <h3>Total Balance</h3>
              <p class="treasury-value">{{ formatCoins(treasury.totalBalance) }} CHERT</p>
            </div>
          </article>

          <article class="treasury-card">
            <div class="treasury-card__icon treasury-card__icon--outgoing">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            </div>
            <div class="treasury-card__content">
              <h3>Last Month</h3>
              <p class="treasury-value">-{{ formatCoins(treasury.lastMonthOut) }} CHERT</p>
            </div>
          </article>

          <article class="treasury-card">
            <div class="treasury-card__icon treasury-card__icon--incoming">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="19 12 12 19 5 12"></polyline>
              </svg>
            </div>
            <div class="treasury-card__content">
              <h3>Last Month</h3>
              <p class="treasury-value">+{{ formatCoins(treasury.lastMonthIn) }} CHERT</p>
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

      .governance {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .loading, .error {
        padding: 2rem;
        text-align: center;
        color: var(--text-secondary);
      }

      .error {
        color: #ef4444;
      }

      .governance__header {
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

      .governance__subtitle {
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

      /* Metrics Grid */
      .governance__metrics {
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

      /* Proposals */
      .governance__proposals,
      .governance__treasury {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .proposals-list {
        display: grid;
        gap: 1rem;
      }

      .proposal-card {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        transition: all 0.3s ease;
      }

      .proposal-card:hover {
        border-color: rgba(14, 165, 233, 0.3);
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(14, 165, 233, 0.1);
      }

      .proposal-card[data-status="active"] {
        border-left: 4px solid #22c55e;
      }

      .proposal-card[data-status="passed"] {
        border-left: 4px solid #0ea5e9;
      }

      .proposal-card[data-status="rejected"] {
        border-left: 4px solid #ef4444;
      }

      .proposal-card[data-status="executed"] {
        border-left: 4px solid #a855f7;
      }

      .proposal-card__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .proposal-card__id {
        font-size: 0.85rem;
        color: var(--text-secondary);
      }

      .proposal-status {
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .proposal-status[data-status="active"] {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }

      .proposal-status[data-status="passed"] {
        background: rgba(14, 165, 233, 0.15);
        color: #0ea5e9;
      }

      .proposal-status[data-status="rejected"] {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      .proposal-status[data-status="executed"] {
        background: rgba(168, 85, 247, 0.15);
        color: #a855f7;
      }

      .proposal-card__title {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 600;
      }

      .proposal-card__description {
        margin: 0;
        font-size: 0.9rem;
        color: var(--text-secondary);
        line-height: 1.5;
      }

      .vote-bar {
        height: 8px;
        background: rgba(239, 68, 68, 0.3);
        border-radius: 4px;
        display: flex;
        overflow: hidden;
      }

      .vote-bar__for {
        background: #22c55e;
        height: 100%;
      }

      .vote-bar__against {
        background: #ef4444;
        height: 100%;
      }

      .vote-stats {
        display: flex;
        gap: 1rem;
        font-size: 0.85rem;
        margin-top: 0.5rem;
      }

      .vote-for {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        color: #22c55e;
      }

      .vote-for svg {
        width: 14px;
        height: 14px;
      }

      .vote-against {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        color: #ef4444;
      }

      .vote-against svg {
        width: 14px;
        height: 14px;
      }

      .quorum {
        color: var(--text-secondary);
      }

      .proposal-card__footer {
        display: flex;
        justify-content: space-between;
        font-size: 0.8rem;
        color: var(--text-secondary);
        padding-top: 0.5rem;
        border-top: 1px solid rgba(14, 165, 233, 0.1);
      }

      /* Treasury */
      .treasury-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
      }

      .treasury-card {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.25rem;
        transition: all 0.3s ease;
      }

      .treasury-card:hover {
        border-color: rgba(14, 165, 233, 0.3);
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(14, 165, 233, 0.1);
      }

      .treasury-card__icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        flex-shrink: 0;
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(14, 165, 233, 0.1));
        color: #0ea5e9;
      }

      .treasury-card__icon--outgoing {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1));
        color: #ef4444;
      }

      .treasury-card__icon--incoming {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1));
        color: #22c55e;
      }

      .treasury-card__icon svg {
        width: 24px;
        height: 24px;
      }

      .treasury-card__content h3 {
        margin: 0;
        font-size: 0.9rem;
        color: var(--text-secondary);
        font-weight: 500;
      }

      .treasury-value {
        margin: 0.25rem 0 0;
        font-size: 1.25rem;
        font-weight: 600;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GovernancePageComponent implements OnInit {
  metrics: GovernanceMetrics = {
    activeProposals: 0,
    totalProposals: 0,
    daoTreasury: 0,
    voterParticipation: 0
  };

  proposals: Proposal[] = [];

  treasury = {
    totalBalance: 0,
    lastMonthIn: 0,
    lastMonthOut: 0
  };

  loading = true;
  error: string | null = null;

  constructor(
    private readonly data: ExplorerDataService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadGovernanceData();
    this.cdr.detectChanges();
  }

  private async loadGovernanceData(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const [governanceInfo, proposals, treasury] = await Promise.all([
        this.data.fetchGovernanceInfo().catch(() => null),
        this.data.fetchProposals(undefined, 20).catch(() => []),
        this.data.fetchTreasury().catch(() => null)
      ]);

      if (governanceInfo) {
        this.metrics = {
          activeProposals: governanceInfo.active_proposals,
          totalProposals: governanceInfo.total_proposals,
          daoTreasury: parseFloat(governanceInfo.dao_treasury) / 1_000_000,
          voterParticipation: governanceInfo.voter_participation
        };
      }

      if (proposals && proposals.length > 0) {
        this.proposals = proposals.map(p => ({
          id: p.id,
          title: p.title,
          description: p.description,
          status: p.status,
          votesFor: parseFloat(p.votes_for) / 1_000_000,
          votesAgainst: parseFloat(p.votes_against) / 1_000_000,
          quorum: p.quorum,
          endTime: p.end_time,
          proposer: p.proposer
        }));
      }

      if (treasury) {
        this.treasury = {
          totalBalance: parseFloat(treasury.total_balance) / 1_000_000,
          lastMonthIn: parseFloat(treasury.last_month_in) / 1_000_000,
          lastMonthOut: parseFloat(treasury.last_month_out) / 1_000_000
        };
      }

    } catch (err) {
      this.error = 'Failed to load governance data';
      console.error('Governance data load error:', err);
    } finally {
      this.loading = false;
    }
  }

  formatAddress(address: string): string {
    return address.length > 16 ? `${address.slice(0, 10)}…${address.slice(-4)}` : address;
  }

  formatCoins(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  getVotePercent(proposal: Proposal, type: 'for' | 'against'): number {
    const total = proposal.votesFor + proposal.votesAgainst;
    if (total === 0) return 0;
    return type === 'for'
      ? (proposal.votesFor / total) * 100
      : (proposal.votesAgainst / total) * 100;
  }
}
