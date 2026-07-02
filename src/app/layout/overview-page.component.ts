import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { combineLatest, from } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import { EXPLORER_BACKEND_CONFIG, type ExplorerBackendConfig } from '@services/explorer-backend.config';
import type { HealthData } from '@shared/models/network.model';
import { BlockSeriesChartComponent, type BlockChartBar } from '@blocks/block-series-chart.component';
import {
  buildBlockAnalyticsSnapshot,
  normalizeApiBlockAnalyticsResponse,
  type BlockAnalyticsBucket,
  type BlockAnalyticsSnapshot,
  type NotableBlock
} from '@blocks/block-analytics.util';
import { formatBlockHeight, formatHash } from '@shared/util/format';

interface OverviewViewModel {
  readonly health: HealthData | null;
  readonly snapshot: BlockAnalyticsSnapshot;
  readonly windows: readonly BlockAnalyticsBucket[];
  readonly blockBars: readonly BlockChartBar[];
  readonly transactionBars: readonly BlockChartBar[];
  readonly notables: readonly NotableBlock[];
  readonly currentHeight: string;
  readonly finalizedHeight: string;
  readonly dagTip: string;
  readonly finalityGap: string;
  readonly txQueue: string;
  readonly averageTps: string;
  readonly activeValidators: string;
  readonly isSynced: boolean;
}

interface OverviewAnalyticsViewModel {
  readonly snapshot: BlockAnalyticsSnapshot;
  readonly windows: readonly BlockAnalyticsBucket[];
  readonly blockBars: readonly BlockChartBar[];
  readonly transactionBars: readonly BlockChartBar[];
  readonly notables: readonly NotableBlock[];
}

@Component({
  selector: 'overview-page',
  standalone: true,
  imports: [CommonModule, RouterModule, BlockSeriesChartComponent],
  template: `
    <section class="overview" *ngIf="viewModel$ | async as vm" aria-labelledby="overview-heading">
      <header class="overview__hero">
        <div class="hero-copy">
          <span class="hero-copy__kicker">Live network status</span>
          <h1 id="overview-heading">Network Overview</h1>
          <p class="overview__subtitle">
            A graphical view of network health, finality, and recent activity built from live node data.
          </p>

          <div class="hero-actions">
            <a routerLink="/blocks" class="hero-action hero-action--primary">Open Blocks</a>
            <span class="hero-action hero-action--ghost">{{ vm.snapshot.sampleLabel }}</span>
          </div>
        </div>

        <aside class="hero-panel">
          <div class="hero-panel__row">
            <span>Sync status</span>
            <strong [class.ok]="vm.isSynced" [class.warn]="!vm.isSynced">
              {{ vm.isSynced ? 'Synced' : 'Syncing' }}
            </strong>
          </div>
          <div class="hero-panel__row">
            <span>Connected peers</span>
            <strong>{{ vm.health?.network?.connectedPeerCount ?? vm.health?.network?.peerCount ?? 0 }}</strong>
          </div>
          <div class="hero-panel__row">
            <span>Message success</span>
            <strong>{{ ((vm.health?.network?.messageSuccessRate ?? 0) * 100) | number:'1.0-1' }}%</strong>
          </div>
          <div class="hero-panel__row">
            <span>Node version</span>
            <strong>{{ vm.health?.version ?? 'unknown' }}</strong>
          </div>
          <div class="hero-panel__row">
            <span>Latest block age</span>
            <strong>{{ formatAge(vm.snapshot.latestBlockAgeMs) }}</strong>
          </div>
        </aside>
      </header>

      <section class="overview__metrics" role="list" aria-label="Network overview metrics">
        <article role="listitem" class="metric-card">
          <h2>Current Height</h2>
          <p>{{ vm.currentHeight }}</p>
          <span>canonical chain height</span>
        </article>
        <article role="listitem" class="metric-card">
          <h2>Finalized Height</h2>
          <p>{{ vm.finalizedHeight }}</p>
          <span>finalized chain height</span>
        </article>
        <article role="listitem" class="metric-card">
          <h2>DAG Tip</h2>
          <p>{{ vm.dagTip }}</p>
          <span>latest commit index</span>
        </article>
        <article role="listitem" class="metric-card">
          <h2>Finality Gap</h2>
          <p>{{ vm.finalityGap }}</p>
          <span>commit gap</span>
        </article>
        <article role="listitem" class="metric-card">
          <h2>Tx Queue</h2>
          <p>{{ vm.txQueue }}</p>
          <span>live pending work</span>
        </article>
        <article role="listitem" class="metric-card">
          <h2>Average TPS</h2>
          <p>{{ vm.averageTps }}</p>
          <span>node-reported average</span>
        </article>
        <article role="listitem" class="metric-card">
          <h2>Active Validators</h2>
          <p>{{ vm.activeValidators }}</p>
          <span>network-reported active set</span>
        </article>
        <article role="listitem" class="metric-card">
          <h2>Non-empty Ratio</h2>
          <p>{{ vm.snapshot.nonEmptyRatio * 100 | number:'1.0-0' }}%</p>
          <span>loaded blocks with txs</span>
        </article>
      </section>

      <section class="overview__charts" aria-labelledby="pulse-heading">
        <div class="section-heading">
          <h2 id="pulse-heading">Network pulse</h2>
          <p class="section-subtitle">
            Charts below are derived only from currently loaded live block data; they do not backfill missing history.
          </p>
        </div>

        <div class="chart-grid">
          <block-series-chart
            title="Blocks per minute"
            subtitle="Recent block production over the loaded 1h sample"
            [bars]="vm.blockBars"
            [headline]="vm.snapshot.totalBlocks > 0 ? ((vm.snapshot.avgBlocksPerMinute | number:'1.1-1') + ' / min') : '—'"
            [sampleLabel]="vm.snapshot.sampleLabel"
            accent="cyan"
            emptyMessage="Waiting for enough loaded blocks to chart block production"
          ></block-series-chart>

          <block-series-chart
            title="Transactions per minute"
            subtitle="Recent transaction flow over the loaded 1h sample"
            [bars]="vm.transactionBars"
            [headline]="vm.snapshot.totalBlocks > 0 ? ((vm.snapshot.avgTransactionsPerMinute | number:'1.0-0') + ' / min') : '—'"
            [sampleLabel]="vm.snapshot.sampleLabel"
            accent="teal"
            emptyMessage="Waiting for enough loaded blocks to chart transaction flow"
          ></block-series-chart>
        </div>
      </section>

      <section class="overview__details" aria-labelledby="windows-heading">
        <div class="section-heading">
          <h2 id="windows-heading">Recent windows</h2>
          <p class="section-subtitle">Five-minute windows derived from the current live sample.</p>
        </div>

        <div class="window-grid">
          <article class="window-card" *ngFor="let bucket of vm.windows">
            <span class="window-card__label">{{ bucket.label }}</span>
            <strong>{{ bucket.blockCount }} blocks</strong>
            <span>{{ bucket.txCount | number }} txs</span>
            <span>{{ bucket.finalizedBlockCount }} finalized / {{ bucket.pendingBlockCount }} pending</span>
            <span>Top validator: {{ formatValidator(bucket.topValidators[0]?.validator) }}</span>
          </article>
        </div>
      </section>

      <section class="overview__notables" aria-labelledby="notables-heading">
        <div class="section-heading">
          <h2 id="notables-heading">Notable blocks</h2>
          <p class="section-subtitle">Picked only from the active live sample. No synthetic ranking.</p>
        </div>

        <div class="notables-grid">
          <a
            *ngFor="let notable of vm.notables"
            class="notable-card"
            [routerLink]="['/block', notable.block.hash]"
            [attr.data-tone]="notable.tone"
          >
            <span class="notable-card__label">{{ notable.label }}</span>
            <strong>{{ formatBlockHeight(notable.block.height) }}</strong>
            <span class="notable-card__hash">{{ formatHash(notable.block.hash) }}</span>
            <p>{{ notable.detail }}</p>
          </a>
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

      .overview {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        width: 100%;
      }

      .overview__hero {
        display: grid;
        grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
        gap: 1rem;
      }

      .hero-copy,
      .hero-panel {
        border-radius: 24px;
        border: 1px solid var(--panel-border);
        padding: 1.5rem;
        background:
          radial-gradient(circle at top right, rgba(34, 211, 238, 0.12), transparent 35%),
          radial-gradient(circle at bottom left, rgba(20, 184, 166, 0.1), transparent 30%),
          var(--panel-bg);
      }

      .hero-copy__kicker {
        display: inline-flex;
        margin-bottom: 0.9rem;
        padding: 0.35rem 0.7rem;
        border-radius: 999px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.74rem;
        color: var(--accent-light);
        background: rgba(34, 211, 238, 0.08);
        border: 1px solid rgba(34, 211, 238, 0.2);
      }

      .overview__subtitle {
        margin: 0.6rem 0 0;
        color: var(--text-secondary);
        max-width: 70ch;
        font-size: 1rem;
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        margin-top: 1rem;
      }

      .hero-action {
        display: inline-flex;
        align-items: center;
        padding: 0.6rem 0.9rem;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.18);
        text-decoration: none;
      }

      .hero-action:hover {
        text-decoration: none;
      }

      .hero-action--primary {
        color: white;
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.8), rgba(20, 184, 166, 0.7));
        border-color: rgba(34, 211, 238, 0.35);
      }

      .hero-action--ghost {
        color: var(--text-secondary);
        background: rgba(15, 23, 42, 0.45);
      }

      .hero-panel {
        display: grid;
        gap: 0.75rem;
      }

      .hero-panel__row {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      }

      .hero-panel__row:last-child {
        padding-bottom: 0;
        border-bottom: none;
      }

      .hero-panel__row span {
        color: var(--text-secondary);
      }

      .hero-panel__row strong {
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
      }

      .hero-panel__row strong.ok {
        color: var(--success);
      }

      .hero-panel__row strong.warn {
        color: #fbbf24;
      }

      .overview__metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1rem;
      }

      .metric-card {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.05), rgba(20, 184, 166, 0.03));
        border: 1px solid rgba(14, 165, 233, 0.15);
        border-radius: 16px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-height: 100px;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
      }

      .metric-card::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.1), transparent);
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .metric-card:hover {
        transform: translateY(-4px);
        border-color: rgba(14, 165, 233, 0.4);
        box-shadow: 0 8px 24px rgba(14, 165, 233, 0.15), 0 0 20px rgba(14, 165, 233, 0.1);
      }

      .metric-card:hover::before {
        opacity: 1;
      }

      .metric-card h2 {
        margin: 0;
        font-size: 0.85rem;
        color: var(--text-secondary);
        font-weight: 500;
        position: relative;
        z-index: 1;
      }

      .metric-card p {
        margin: 0;
        font-size: var(--metric-value-size);
        font-weight: 600;
        letter-spacing: 0.01em;
        background: var(--gradient-h1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        position: relative;
        z-index: 1;
      }

      .metric-card span {
        color: var(--text-secondary);
        font-size: 0.82rem;
      }

      .overview__charts,
      .overview__details,
      .overview__notables {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .chart-grid,
      .window-grid,
      .notables-grid {
        display: grid;
        gap: 1rem;
      }

      .chart-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .section-subtitle {
        margin: 0;
        color: var(--text-secondary);
      }

      .window-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }

      .window-card {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 1rem;
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        background: var(--panel-bg);
      }

      .window-card__label {
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 0.74rem;
      }

      .notables-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }

      .notable-card {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        padding: 1rem;
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        background: var(--panel-bg);
        color: inherit;
        text-decoration: none;
        transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
      }

      .notable-card:hover {
        text-decoration: none;
        transform: translateY(-2px);
        border-color: rgba(34, 211, 238, 0.3);
        box-shadow: 0 8px 24px rgba(14, 165, 233, 0.12);
      }

      .notable-card[data-tone='cyan'] {
        background: linear-gradient(135deg, rgba(34, 211, 238, 0.06), rgba(14, 165, 233, 0.04));
      }

      .notable-card[data-tone='teal'] {
        background: linear-gradient(135deg, rgba(45, 212, 191, 0.06), rgba(20, 184, 166, 0.04));
      }

      .notable-card[data-tone='green'] {
        background: linear-gradient(135deg, rgba(74, 222, 128, 0.06), rgba(34, 197, 94, 0.04));
      }

      .notable-card[data-tone='amber'] {
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(245, 158, 11, 0.04));
      }

      .notable-card__label {
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 0.74rem;
      }

      .notable-card__hash {
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.88rem;
        color: var(--text-secondary);
      }

      .notable-card p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.88rem;
      }

      @media (max-width: 960px) {
        .overview__hero,
        .chart-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 480px) {
        .metric-card p {
          font-size: 1.35rem;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OverviewPageComponent {
  private readonly fallbackAnalyticsView$ = this.data.blocks$.pipe(
    map((blocks): OverviewAnalyticsViewModel => {
      const minuteSnapshot = buildBlockAnalyticsSnapshot(blocks, {
        rangeMs: 60 * 60_000,
        bucketMs: 60_000,
        requestedRangeLabel: '1h'
      });
      const windowSnapshot = buildBlockAnalyticsSnapshot(blocks, {
        rangeMs: 60 * 60_000,
        bucketMs: 5 * 60_000,
        requestedRangeLabel: '1h'
      });

      return {
        snapshot: minuteSnapshot,
        windows: [...windowSnapshot.buckets].reverse().slice(0, 6),
        blockBars: minuteSnapshot.buckets.map((bucket) => ({
          label: bucket.label,
          shortLabel: bucket.shortLabel,
          value: bucket.blockCount,
          detail: `${bucket.label}: ${bucket.blockCount} blocks from live node data`
        })),
        transactionBars: minuteSnapshot.buckets.map((bucket) => ({
          label: bucket.label,
          shortLabel: bucket.shortLabel,
          value: bucket.txCount,
          detail: `${bucket.label}: ${bucket.txCount} transactions from live node data`
        })),
        notables: minuteSnapshot.notableBlocks
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly apiAnalyticsView$ = this.data.lastRefreshedAt$.pipe(
    startWith(null),
    switchMap(() => from(this.data.fetchBlockAnalytics({
      range_ms: 60 * 60_000,
      bucket_ms: 60_000,
      requested_range_label: '1h'
    })).pipe(
      map((response): OverviewAnalyticsViewModel => {
        const snapshot = normalizeApiBlockAnalyticsResponse(response);
        return {
          snapshot,
          windows: [...snapshot.buckets].reverse().slice(0, 6),
          blockBars: snapshot.buckets.map((bucket) => ({
            label: bucket.label,
            shortLabel: bucket.shortLabel,
            value: bucket.blockCount,
            detail: `${bucket.label}: ${bucket.blockCount} blocks from indexed API data`
          })),
          transactionBars: snapshot.buckets.map((bucket) => ({
            label: bucket.label,
            shortLabel: bucket.shortLabel,
            value: bucket.txCount,
            detail: `${bucket.label}: ${bucket.txCount} transactions from indexed API data`
          })),
          notables: snapshot.notableBlocks
        };
      }),
      catchError((error) => {
        console.warn('Failed to fetch overview block analytics from API, falling back to live block sample', error);
        return this.fallbackAnalyticsView$;
      })
    )),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly analyticsView$ = this.backend.mode === 'api'
    ? this.apiAnalyticsView$
    : this.fallbackAnalyticsView$;

  readonly viewModel$ = combineLatest([
    this.data.networkStats$,
    this.data.health$,
    this.analyticsView$
  ]).pipe(
    map(([stats, health, analytics]): OverviewViewModel => {
      return {
        health,
        snapshot: analytics.snapshot,
        windows: analytics.windows,
        blockBars: analytics.blockBars,
        transactionBars: analytics.transactionBars,
        notables: analytics.notables,
        currentHeight: this.formatNumber(stats.currentHeight),
        finalizedHeight: this.formatNumber(stats.finalizedHeight),
        dagTip: this.formatNumber(stats.dagTipCommitIndex),
        finalityGap: stats.dagFinalityGap.toString(),
        txQueue: stats.txQueueSize.toString(),
        averageTps: stats.averageTps.toFixed(2),
        activeValidators: stats.activeValidators.toString(),
        isSynced: stats.isSynced
      };
    })
  );

  constructor(
    private readonly data: ExplorerDataService,
    @Inject(EXPLORER_BACKEND_CONFIG) private readonly backend: ExplorerBackendConfig
  ) {}

  formatAge(ageMs: number | null): string {
    if (ageMs === null) {
      return '—';
    }
    const seconds = Math.floor(ageMs / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  formatValidator(validator?: string): string {
    if (!validator) {
      return '—';
    }
    return validator.length > 18 ? `${validator.slice(0, 10)}…${validator.slice(-6)}` : validator;
  }

  private formatNumber(value: number): string {
    const num = typeof value === 'number' ? value : Number(value);
    return num.toLocaleString();
  }

  protected readonly formatBlockHeight = formatBlockHeight;
  protected readonly formatHash = formatHash;
}
