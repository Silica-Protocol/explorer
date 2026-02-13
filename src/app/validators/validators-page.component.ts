import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { combineLatest, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import type { NetworkStatistics, PositiveInteger, UnixMs, Hash, CommitteeId } from '@silica-protocol/explorer-models';
import type { BlockSummary, AccountAddress } from '@silica-protocol/explorer-models';
import { assert } from '@shared/util/assert';

interface ValidatorInfo {
  readonly id: string;
  readonly address: AccountAddress | CommitteeId;
  readonly blocksProduced: number;
  readonly lastBlockTime: UnixMs | null;
  readonly isActive: boolean;
  readonly stake: number;
}

interface ValidatorsViewModel {
  readonly stats: NetworkStatistics;
  readonly validators: readonly ValidatorInfo[];
  readonly totalStaked: number;
  readonly networkHealth: 'healthy' | 'degraded' | 'unhealthy';
  readonly avgBlockTime: number;
  readonly participation: number;
}

const MAX_VALIDATORS = 128;
const HEALTHY_TPS_THRESHOLD = 5;
const DEGRADED_TPS_THRESHOLD = 1;

@Component({
  selector: 'validators-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section class="validators" *ngIf="viewModel$ | async as vm" aria-labelledby="validators-heading">
      <header class="validators__header">
        <div>
          <h1 id="validators-heading">Network Health & Validators</h1>
          <p class="validators__subtitle">Real-time consensus health and validator performance.</p>
        </div>
        <div class="validators__health" [attr.data-status]="vm.networkHealth">
          <span class="validators__health-dot" aria-hidden="true"></span>
          <span>{{ vm.networkHealth | titlecase }}</span>
        </div>
      </header>

      <!-- Network Metrics Grid -->
      <section class="validators__metrics" aria-label="Network metrics">
        <article class="metric-card metric-card--cyan">
          <h2>Current Height</h2>
          <p class="metric-value">{{ toNumber(vm.stats.currentHeight) | number }}</p>
          <span class="metric-label">blocks</span>
        </article>

        <article class="metric-card metric-card--teal">
          <h2>Finalized Height</h2>
          <p class="metric-value">{{ toNumber(vm.stats.finalizedHeight) | number }}</p>
          <span class="metric-label">blocks</span>
        </article>

        <article class="metric-card metric-card--green">
          <h2>Active Validators</h2>
          <p class="metric-value">{{ vm.stats.activeValidators }}</p>
          <span class="metric-label">nodes</span>
        </article>

        <article class="metric-card metric-card--emerald">
          <h2>Average TPS</h2>
          <p class="metric-value">{{ vm.stats.averageTps | number:'1.1-2' }}</p>
          <span class="metric-label">tx/sec</span>
        </article>

        <article class="metric-card">
          <h2>Block Time</h2>
          <p class="metric-value">{{ vm.avgBlockTime | number:'1.1-2' }}</p>
          <span class="metric-label">seconds</span>
        </article>

        <article class="metric-card">
          <h2>Participation</h2>
          <p class="metric-value">{{ vm.participation | number:'1.0-1' }}%</p>
          <span class="metric-label">of committee</span>
        </article>
      </section>

      <!-- Consensus Health -->
      <section class="validators__consensus" aria-label="Consensus status">
        <div class="section-heading">
          <h2>Consensus Status</h2>
          <p class="muted">Bullshark aBFT consensus health indicators</p>
        </div>

        <div class="consensus-grid">
          <article class="consensus-card">
            <div class="consensus-card__icon consensus-card__icon--finality">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <div class="consensus-card__content">
              <h3>Finality Lag</h3>
              <p class="consensus-card__value">{{ toNumber(vm.stats.currentHeight) - toNumber(vm.stats.finalizedHeight) }} blocks</p>
              <span class="consensus-card__status" [attr.data-status]="toNumber(vm.stats.currentHeight) - toNumber(vm.stats.finalizedHeight) <= 3 ? 'healthy' : 'degraded'">
                {{ toNumber(vm.stats.currentHeight) - toNumber(vm.stats.finalizedHeight) <= 3 ? 'Normal' : 'Elevated' }}
              </span>
            </div>
          </article>

          <article class="consensus-card">
            <div class="consensus-card__icon consensus-card__icon--throughput">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
            </div>
            <div class="consensus-card__content">
              <h3>Throughput</h3>
              <p class="consensus-card__value">{{ vm.stats.averageTps | number:'1.0-1' }} TPS</p>
              <span class="consensus-card__status" [attr.data-status]="vm.stats.averageTps >= 5 ? 'healthy' : 'degraded'">
                {{ vm.stats.averageTps >= 5 ? 'Optimal' : 'Below target' }}
              </span>
            </div>
          </article>

          <article class="consensus-card">
            <div class="consensus-card__icon consensus-card__icon--committee">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div class="consensus-card__content">
              <h3>Committee Size</h3>
              <p class="consensus-card__value">{{ vm.stats.activeValidators }} validators</p>
              <span class="consensus-card__status" [attr.data-status]="vm.stats.activeValidators >= 4 ? 'healthy' : 'degraded'">
                {{ vm.stats.activeValidators >= 4 ? 'Quorum met' : 'Below quorum' }}
              </span>
            </div>
          </article>

          <article class="consensus-card">
            <div class="consensus-card__icon consensus-card__icon--election">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div class="consensus-card__content">
              <h3>Next Election</h3>
              <p class="consensus-card__value">{{ formatElectionEta(vm.stats.nextElectionEtaMs) }}</p>
              <span class="consensus-card__status" data-status="healthy">Scheduled</span>
            </div>
          </article>
        </div>
      </section>

      <!-- Validators List -->
      <section class="validators__list" aria-label="Validators list">
        <div class="section-heading">
          <h2>Active Validators</h2>
          <p class="muted">{{ vm.validators.length }} validators in current epoch</p>
        </div>

        <div class="validator-table" role="table">
          <div class="validator-table__header" role="row">
            <span role="columnheader">Validator</span>
            <span role="columnheader">Blocks Produced</span>
            <span role="columnheader">Last Block</span>
            <span role="columnheader">Status</span>
          </div>

          <ng-container *ngIf="vm.validators.length > 0; else noValidators">
            <div
              *ngFor="let validator of vm.validators; trackBy: trackByValidator"
              class="validator-row"
              role="row"
            >
              <span role="cell" class="validator-address">{{ formatAddress(validator.address) }}</span>
              <span role="cell">{{ validator.blocksProduced }}</span>
              <span role="cell">{{ validator.lastBlockTime ? formatTime(validator.lastBlockTime) : '—' }}</span>
              <span role="cell">
                <span class="status" [class.status--active]="validator.isActive">
                  {{ validator.isActive ? 'Active' : 'Inactive' }}
                </span>
              </span>
            </div>
          </ng-container>

          <ng-template #noValidators>
            <div class="validator-table__empty">
              <p>No validator data available yet. Waiting for blocks...</p>
            </div>
          </ng-template>
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

      .validators {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .validators__header {
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

      .validators__subtitle {
        margin: 0.25rem 0 0;
        color: var(--text-secondary);
      }

      .validators__health {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.6rem 1rem;
        border-radius: 999px;
        font-weight: 600;
        font-size: 0.9rem;
        text-transform: capitalize;
        transition: all 0.3s ease;
      }

      .validators__health[data-status="healthy"] {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.08));
        border: 1px solid rgba(34, 197, 94, 0.4);
        color: #22c55e;
      }

      .validators__health[data-status="degraded"] {
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.08));
        border: 1px solid rgba(245, 158, 11, 0.4);
        color: #f59e0b;
      }

      .validators__health[data-status="unhealthy"] {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.08));
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #ef4444;
      }

      .validators__health-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        animation: pulse-glow 2s ease-in-out infinite;
      }

      .validators__health[data-status="healthy"] .validators__health-dot {
        background: #22c55e;
        box-shadow: 0 0 10px rgba(34, 197, 94, 0.6);
      }

      .validators__health[data-status="degraded"] .validators__health-dot {
        background: #f59e0b;
        box-shadow: 0 0 10px rgba(245, 158, 11, 0.6);
      }

      .validators__health[data-status="unhealthy"] .validators__health-dot {
        background: #ef4444;
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.6);
      }

      @keyframes pulse-glow {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.6; transform: scale(1.15); }
      }

      /* Metrics Grid */
      .validators__metrics {
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
        letter-spacing: 0.04em;
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

      /* Consensus Section */
      .validators__consensus {
        display: flex;
        flex-direction: column;
        gap: 1rem;
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

      .consensus-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1rem;
      }

      .consensus-card {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.25rem;
        transition: all 0.3s ease;
      }

      .consensus-card:hover {
        border-color: rgba(14, 165, 233, 0.3);
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(14, 165, 233, 0.1);
      }

      .consensus-card__icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }

      .consensus-card__icon svg {
        width: 24px;
        height: 24px;
      }

      .consensus-card__icon--finality {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1));
        color: #22c55e;
      }

      .consensus-card__icon--throughput {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(14, 165, 233, 0.1));
        color: #0ea5e9;
      }

      .consensus-card__icon--committee {
        background: linear-gradient(135deg, rgba(20, 184, 166, 0.2), rgba(20, 184, 166, 0.1));
        color: #14b8a6;
      }

      .consensus-card__icon--election {
        background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(168, 85, 247, 0.1));
        color: #a855f7;
      }

      .consensus-card__content {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .consensus-card__content h3 {
        margin: 0;
        font-size: 0.9rem;
        color: var(--text-secondary);
        font-weight: 500;
      }

      .consensus-card__value {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
      }

      .consensus-card__status {
        font-size: 0.8rem;
        font-weight: 500;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        display: inline-flex;
        width: fit-content;
      }

      .consensus-card__status[data-status="healthy"] {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }

      .consensus-card__status[data-status="degraded"] {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
      }

      /* Validators Table */
      .validators__list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .validator-table {
        display: flex;
        flex-direction: column;
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        background: var(--panel-bg);
        overflow: hidden;
      }

      .validator-table__header,
      .validator-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 100px;
        gap: 0.75rem;
        padding: 0.9rem 1.25rem;
        align-items: center;
      }

      .validator-table__header {
        font-size: 0.8rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--panel-border);
        background: rgba(14, 165, 233, 0.03);
      }

      .validator-row {
        border-bottom: 1px solid rgba(14, 165, 233, 0.08);
        transition: all 0.2s ease;
      }

      .validator-row:last-child {
        border-bottom: none;
      }

      .validator-row:hover {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(20, 184, 166, 0.05));
        transform: translateX(4px);
        box-shadow: inset 4px 0 0 rgba(14, 165, 233, 0.6);
      }

      .validator-address {
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.9rem;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
        font-size: 0.78rem;
        text-transform: capitalize;
        color: var(--text-secondary);
      }

      .status--active {
        color: #22c55e;
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(34, 197, 94, 0.12));
        border: 1px solid rgba(34, 197, 94, 0.3);
      }

      .validator-table__empty {
        padding: 2rem;
        text-align: center;
        color: var(--text-secondary);
      }

      @media (max-width: 960px) {
        .validators__header {
          flex-direction: column;
          align-items: flex-start;
        }

        .validator-table__header,
        .validator-row {
          grid-template-columns: 1.5fr 1fr 1fr;
        }

        .validator-table__header span:nth-child(4),
        .validator-row span:nth-child(4) {
          display: none;
        }
      }

      @media (max-width: 640px) {
        h1 {
          font-size: 1.5rem;
        }

        .validator-table__header,
        .validator-row {
          grid-template-columns: 1fr 1fr;
        }

        .validator-table__header span:nth-child(3),
        .validator-row span:nth-child(3) {
          display: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ValidatorsPageComponent {
  readonly viewModel$: Observable<ValidatorsViewModel> = combineLatest([
    this.data.networkStats$,
    this.data.blocks$
  ]).pipe(
    map(([stats, blocks]) => this.buildViewModel(stats, blocks))
  );

  constructor(private readonly data: ExplorerDataService) {}

  toNumber(value: PositiveInteger): number {
    return value as number;
  }

  trackByValidator(_: number, validator: ValidatorInfo): string {
    return validator.id;
  }

  formatAddress(address: AccountAddress | CommitteeId): string {
    const value = address as string;
    return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value;
  }

  formatTime(timestamp: UnixMs): string {
    const diff = Date.now() - (timestamp as number);
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  formatElectionEta(ms: number): string {
    if (ms <= 0) return 'Imminent';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  private buildViewModel(stats: NetworkStatistics, blocks: readonly BlockSummary[]): ValidatorsViewModel {
    assert(stats !== undefined, 'Network stats must be defined');

    // Extract unique validators from block data
    const validatorMap = new Map<string, { blocksProduced: number; lastBlockTime: UnixMs | null }>();

    for (const block of blocks) {
      const miner = block.miner as string;
      const existing = validatorMap.get(miner);
      if (existing) {
        existing.blocksProduced += 1;
        if (!existing.lastBlockTime || (block.timestamp as number) > (existing.lastBlockTime as number)) {
          existing.lastBlockTime = block.timestamp;
        }
      } else {
        validatorMap.set(miner, {
          blocksProduced: 1,
          lastBlockTime: block.timestamp
        });
      }

      // Also track committee members if available
      if (block.delegateSet) {
        for (const member of block.delegateSet) {
          const memberStr = member as string;
          if (!validatorMap.has(memberStr)) {
            validatorMap.set(memberStr, { blocksProduced: 0, lastBlockTime: null });
          }
        }
      }
    }

    // Build validator info list
    const validators: ValidatorInfo[] = Array.from(validatorMap.entries())
      .map(([address, data], index) => ({
        id: `validator-${index}`,
        address: address as AccountAddress,
        blocksProduced: data.blocksProduced,
        lastBlockTime: data.lastBlockTime,
        isActive: data.blocksProduced > 0,
        stake: 0 // Stake info not available from block data
      }))
      .sort((a, b) => b.blocksProduced - a.blocksProduced)
      .slice(0, MAX_VALIDATORS);

    // Calculate average block time
    let avgBlockTime = 0;
    if (blocks.length >= 2) {
      const sortedBlocks = [...blocks].sort((a, b) => (a.timestamp as number) - (b.timestamp as number));
      const totalTime = (sortedBlocks[sortedBlocks.length - 1].timestamp as number) - (sortedBlocks[0].timestamp as number);
      avgBlockTime = totalTime / (sortedBlocks.length - 1) / 1000;
    }

    // Calculate participation (active validators / total known validators)
    const activeCount = validators.filter(v => v.isActive).length;
    const participation = validators.length > 0 ? (activeCount / Math.max(stats.activeValidators, validators.length)) * 100 : 0;

    // Determine network health
    let networkHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (stats.averageTps < DEGRADED_TPS_THRESHOLD) {
      networkHealth = 'unhealthy';
    } else if (stats.averageTps < HEALTHY_TPS_THRESHOLD) {
      networkHealth = 'degraded';
    }

    return {
      stats,
      validators,
      totalStaked: 0,
      networkHealth,
      avgBlockTime,
      participation
    };
  }
}
