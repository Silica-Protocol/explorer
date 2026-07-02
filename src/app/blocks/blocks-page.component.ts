import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, combineLatest, from } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';
import { BlockListComponent } from '@blocks/block-list.component';
import { BlockSeriesChartComponent, type BlockChartBar } from '@blocks/block-series-chart.component';
import {
  buildBlockAnalyticsSnapshot,
  normalizeApiBlockAnalyticsResponse,
  type BlockAnalyticsBucket,
  type BlockAnalyticsSnapshot,
  type NotableBlock
} from '@blocks/block-analytics.util';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import { EXPLORER_BACKEND_CONFIG, type ExplorerBackendConfig } from '@services/explorer-backend.config';
import type { ExtendedNetworkStatistics, HealthData } from '@shared/models/network.model';
import { formatBlockHeight, formatHash } from '@shared/util/format';

interface RangePreset {
  readonly id: '15m' | '1h' | '3h';
  readonly label: string;
  readonly rangeMs: number;
  readonly bucketMs: number;
  readonly requestedRangeLabel: string;
  readonly barLabel: string;
}

interface BlocksPageViewModel {
  readonly stats: ExtendedNetworkStatistics;
  readonly health: HealthData | null;
  readonly snapshot: BlockAnalyticsSnapshot;
  readonly blockBars: readonly BlockChartBar[];
  readonly transactionBars: readonly BlockChartBar[];
  readonly windows: readonly BlockAnalyticsBucket[];
  readonly notables: readonly NotableBlock[];
}

interface BlocksPageAnalyticsViewModel {
  readonly snapshot: BlockAnalyticsSnapshot;
  readonly blockBars: readonly BlockChartBar[];
  readonly transactionBars: readonly BlockChartBar[];
  readonly windows: readonly BlockAnalyticsBucket[];
  readonly notables: readonly NotableBlock[];
}

const RANGE_PRESETS: readonly RangePreset[] = [
  {
    id: '15m',
    label: '15M',
    rangeMs: 15 * 60_000,
    bucketMs: 60_000,
    requestedRangeLabel: '15m',
    barLabel: 'per minute'
  },
  {
    id: '1h',
    label: '1H',
    rangeMs: 60 * 60_000,
    bucketMs: 60_000,
    requestedRangeLabel: '1h',
    barLabel: 'per minute'
  },
  {
    id: '3h',
    label: '3H',
    rangeMs: 3 * 60 * 60_000,
    bucketMs: 5 * 60_000,
    requestedRangeLabel: '3h',
    barLabel: 'per 5 minutes'
  }
];

@Component({
  selector: 'blocks-page',
  standalone: true,
  imports: [CommonModule, RouterModule, BlockListComponent, BlockSeriesChartComponent],
  template: `
    <section class="blocks-page" *ngIf="viewModel$ | async as vm" aria-labelledby="blocks-heading">
      <header class="blocks-page__hero">
        <div class="hero-copy">
          <span class="hero-kicker">Block activity</span>
          <h1 id="blocks-heading">Blocks</h1>
          <p class="hero-subtitle">
            Explore recent block production, transaction flow, and standout blocks from the current live sample.
          </p>
          <div class="hero-badges">
            <span class="badge badge--info">{{ vm.snapshot.sampleLabel }}</span>
            <span class="badge" [class.badge--warn]="vm.snapshot.partial">
              {{ vm.snapshot.partial ? 'Live sample only' : 'Selected range loaded' }}
            </span>
          </div>
        </div>

        <aside class="hero-status">
          <div class="hero-status__row">
            <span>Sync</span>
            <strong [class.ok]="vm.stats.isSynced" [class.warn]="!vm.stats.isSynced">
              {{ vm.stats.isSynced ? 'Synced' : 'Syncing' }}
            </strong>
          </div>
          <div class="hero-status__row">
            <span>Finality gap</span>
            <strong>{{ vm.stats.dagFinalityGap }}</strong>
          </div>
          <div class="hero-status__row">
            <span>Tx queue</span>
            <strong>{{ vm.stats.txQueueSize }}</strong>
          </div>
          <div class="hero-status__row">
            <span>Validators</span>
            <strong>{{ vm.snapshot.uniqueValidatorCount }}</strong>
          </div>
        </aside>
      </header>

      <section class="range-selector" aria-label="Chart range selection">
        <button
          *ngFor="let preset of rangePresets"
          type="button"
          class="range-selector__button"
          [class.is-active]="selectedRangeId === preset.id"
          (click)="selectRange(preset.id)"
        >
          {{ preset.label }}
        </button>
      </section>

      <section class="metrics-grid" aria-label="Blocks page summary metrics">
        <article class="metric-card">
          <h2>Loaded blocks</h2>
          <p>{{ vm.snapshot.totalBlocks | number }}</p>
          <span>within active live sample</span>
        </article>
        <article class="metric-card">
          <h2>Transactions</h2>
          <p>{{ vm.snapshot.totalTransactions | number }}</p>
          <span>derived from loaded blocks</span>
        </article>
        <article class="metric-card">
          <h2>Avg blocks/min</h2>
          <p>{{ vm.snapshot.avgBlocksPerMinute | number:'1.1-1' }}</p>
          <span>{{ activeRange?.requestedRangeLabel }} sample</span>
        </article>
        <article class="metric-card">
          <h2>Avg tx/block</h2>
          <p>{{ vm.snapshot.avgTransactionsPerBlock | number:'1.1-1' }}</p>
          <span>from recent live data</span>
        </article>
        <article class="metric-card">
          <h2>Non-empty ratio</h2>
          <p>{{ vm.snapshot.nonEmptyRatio * 100 | number:'1.0-0' }}%</p>
          <span>blocks with transactions</span>
        </article>
        <article class="metric-card">
          <h2>Validators in sample</h2>
          <p>{{ vm.snapshot.uniqueValidatorCount | number }}</p>
          <span>producers seen in live sample</span>
        </article>
        <article class="metric-card">
          <h2>Latest block age</h2>
          <p>{{ formatAge(vm.snapshot.latestBlockAgeMs) }}</p>
          <span>from latest loaded block</span>
        </article>
      </section>

      <section class="chart-grid" aria-label="Live block charts">
        <block-series-chart
          title="Blocks"
          [subtitle]="'Block production ' + (activeRange?.barLabel ?? '')"
          [bars]="vm.blockBars"
          [headline]="vm.snapshot.totalBlocks > 0 ? ((vm.snapshot.avgBlocksPerMinute | number:'1.1-1') + ' / min') : '—'"
          [sampleLabel]="vm.snapshot.sampleLabel"
          accent="cyan"
          emptyMessage="Waiting for enough loaded blocks to chart production"
        ></block-series-chart>

        <block-series-chart
          title="Transactions"
          [subtitle]="'Transaction flow ' + (activeRange?.barLabel ?? '')"
          [bars]="vm.transactionBars"
          [headline]="vm.snapshot.totalBlocks > 0 ? ((vm.snapshot.avgTransactionsPerMinute | number:'1.0-0') + ' / min') : '—'"
          [sampleLabel]="vm.snapshot.sampleLabel"
          accent="teal"
          emptyMessage="Waiting for enough loaded blocks to chart transaction flow"
        ></block-series-chart>
      </section>

      <section class="windows-section" aria-labelledby="blocks-windows-heading">
        <div class="section-heading">
          <h2 id="blocks-windows-heading">Recent windows</h2>
          <p class="muted">Most recent {{ vm.windows.length }} derived windows from the active live sample.</p>
        </div>

        <div class="windows-table" role="table">
          <div class="windows-table__header" role="row">
            <span role="columnheader">Window</span>
            <span role="columnheader">Blocks</span>
            <span role="columnheader">Txs</span>
            <span role="columnheader">Non-empty</span>
            <span role="columnheader">Top validator</span>
            <span role="columnheader">Status mix</span>
          </div>

          <div class="windows-table__row" role="row" *ngFor="let bucket of vm.windows">
            <span role="cell">{{ bucket.label }}</span>
            <span role="cell">{{ bucket.blockCount | number }}</span>
            <span role="cell">{{ bucket.txCount | number }}</span>
            <span role="cell">{{ bucket.nonEmptyBlockCount | number }}</span>
            <span role="cell">{{ formatValidator(bucket.topValidators[0]?.validator) }}</span>
            <span role="cell">{{ bucket.finalizedBlockCount }} F / {{ bucket.pendingBlockCount }} P</span>
          </div>
        </div>
      </section>

      <section class="notables-section" aria-labelledby="blocks-notables-heading">
        <div class="section-heading">
          <h2 id="blocks-notables-heading">Notable blocks</h2>
          <p class="muted">Selected from the active live sample only.</p>
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

      <section class="list-section" aria-labelledby="blocks-results-heading">
        <div class="section-heading">
          <h2 id="blocks-results-heading">Block results</h2>
          <p class="muted">
            Full interactive block list with search, hide-empty filtering, and progressive loading.
          </p>
        </div>
        <block-list></block-list>
      </section>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .blocks-page {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }

      .blocks-page__hero {
        display: grid;
        grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
        gap: 1rem;
        align-items: stretch;
      }

      .hero-copy,
      .hero-status {
        border: 1px solid var(--panel-border);
        border-radius: 24px;
        padding: 1.5rem;
        background:
          radial-gradient(circle at top right, rgba(34, 211, 238, 0.12), transparent 35%),
          radial-gradient(circle at bottom left, rgba(20, 184, 166, 0.1), transparent 30%),
          var(--panel-bg);
      }

      .hero-kicker {
        display: inline-flex;
        padding: 0.35rem 0.7rem;
        border-radius: 999px;
        margin-bottom: 0.9rem;
        border: 1px solid rgba(34, 211, 238, 0.25);
        color: var(--accent-light);
        background: rgba(34, 211, 238, 0.08);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.74rem;
      }

      .hero-subtitle {
        margin: 0.6rem 0 0;
        color: var(--text-secondary);
        max-width: 70ch;
        font-size: 1rem;
      }

      .hero-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        margin-top: 1rem;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        padding: 0.45rem 0.85rem;
        border-radius: 999px;
        font-size: 0.8rem;
        border: 1px solid rgba(148, 163, 184, 0.18);
        background: rgba(15, 23, 42, 0.45);
      }

      .badge--info {
        color: var(--accent-light);
        border-color: rgba(34, 211, 238, 0.25);
      }

      .badge--warn {
        color: #fbbf24;
        border-color: rgba(251, 191, 36, 0.35);
      }

      .hero-status {
        display: grid;
        gap: 0.75rem;
        align-content: center;
      }

      .hero-status__row {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        padding-bottom: 0.7rem;
        border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      }

      .hero-status__row:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }

      .hero-status__row span {
        color: var(--text-secondary);
      }

      .hero-status__row strong {
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
      }

      .hero-status__row strong.ok {
        color: var(--success);
      }

      .hero-status__row strong.warn {
        color: #fbbf24;
      }

      .range-selector {
        display: inline-flex;
        width: fit-content;
        gap: 0.35rem;
        padding: 0.35rem;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid var(--panel-border);
      }

      .range-selector__button {
        appearance: none;
        border: none;
        background: transparent;
        color: var(--text-secondary);
        border-radius: 999px;
        padding: 0.55rem 0.95rem;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .range-selector__button.is-active {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(20, 184, 166, 0.14));
        color: var(--text-primary);
      }

      .metrics-grid,
      .chart-grid,
      .notables-grid {
        display: grid;
        gap: 1rem;
      }

      .metrics-grid {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }

      .metric-card {
        padding: 1.15rem;
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.06), rgba(20, 184, 166, 0.04));
      }

      .metric-card h2 {
        margin: 0;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-secondary);
      }

      .metric-card p {
        margin: 0.4rem 0 0.3rem;
        font-size: 1.75rem;
        font-weight: 700;
        background: var(--gradient-h1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .metric-card span {
        color: var(--text-secondary);
        font-size: 0.82rem;
      }

      .chart-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .muted {
        margin: 0;
        color: var(--text-secondary);
      }

      .windows-section,
      .notables-section,
      .list-section {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .windows-table {
        display: flex;
        flex-direction: column;
        border-radius: 18px;
        border: 1px solid var(--panel-border);
        background: var(--panel-bg);
        overflow: hidden;
      }

      .windows-table__header,
      .windows-table__row {
        display: grid;
        grid-template-columns: 1.4fr 0.8fr 0.8fr 0.8fr 1fr 1fr;
        gap: 0.75rem;
        padding: 0.95rem 1.2rem;
        align-items: center;
      }

      .windows-table__header {
        background: rgba(14, 165, 233, 0.04);
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 0.78rem;
        border-bottom: 1px solid var(--panel-border);
      }

      .windows-table__row {
        border-bottom: 1px solid rgba(148, 163, 184, 0.08);
      }

      .windows-table__row:last-child {
        border-bottom: none;
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

      @media (max-width: 1100px) {
        .blocks-page__hero,
        .chart-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 900px) {
        .windows-table__header,
        .windows-table__row {
          grid-template-columns: 1.4fr 0.8fr 0.8fr 1fr;
        }

        .windows-table__header span:nth-child(4),
        .windows-table__row span:nth-child(4),
        .windows-table__header span:nth-child(6),
        .windows-table__row span:nth-child(6) {
          display: none;
        }
      }

      @media (max-width: 640px) {
        .hero-status {
          padding: 1.1rem;
        }

        .metric-card p {
          font-size: 1.35rem;
        }

        .windows-table__header,
        .windows-table__row {
          grid-template-columns: 1.2fr 0.8fr 0.8fr;
        }

        .windows-table__header span:nth-child(5),
        .windows-table__row span:nth-child(5) {
          display: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlocksPageComponent {
  readonly rangePresets = RANGE_PRESETS;
  selectedRangeId: RangePreset['id'] = '1h';

  private readonly selectedRangeSubject = new BehaviorSubject<RangePreset>(RANGE_PRESETS[1]);

  private readonly fallbackAnalyticsView$ = combineLatest([
    this.data.blocks$,
    this.selectedRangeSubject.asObservable()
  ]).pipe(
    map(([blocks, range]): BlocksPageAnalyticsViewModel => {
      const snapshot = buildBlockAnalyticsSnapshot(blocks, {
        rangeMs: range.rangeMs,
        bucketMs: range.bucketMs,
        requestedRangeLabel: range.requestedRangeLabel
      });

      return {
        snapshot,
        blockBars: snapshot.buckets.map((bucket) => ({
          label: bucket.label,
          shortLabel: bucket.shortLabel,
          value: bucket.blockCount,
          detail: `${bucket.label}: ${bucket.blockCount} blocks from live node data`
        })),
        transactionBars: snapshot.buckets.map((bucket) => ({
          label: bucket.label,
          shortLabel: bucket.shortLabel,
          value: bucket.txCount,
          detail: `${bucket.label}: ${bucket.txCount} transactions from live node data`
        })),
        windows: [...snapshot.buckets].reverse().slice(0, 8),
        notables: snapshot.notableBlocks
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly apiAnalyticsView$ = combineLatest([
    this.selectedRangeSubject.asObservable(),
    this.data.lastRefreshedAt$.pipe(startWith(null))
  ]).pipe(
    switchMap(([range]) => from(this.data.fetchBlockAnalytics({
      range_ms: range.rangeMs,
      bucket_ms: range.bucketMs,
      requested_range_label: range.requestedRangeLabel
    })).pipe(
      map((response): BlocksPageAnalyticsViewModel => {
        const snapshot = normalizeApiBlockAnalyticsResponse(response);
        return {
          snapshot,
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
          windows: [...snapshot.buckets].reverse().slice(0, 8),
          notables: snapshot.notableBlocks
        };
      }),
      catchError((error) => {
        console.warn('Failed to fetch blocks analytics from API, falling back to live block sample', error);
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
    map(([stats, health, analytics]): BlocksPageViewModel => {
      return {
        stats,
        health,
        snapshot: analytics.snapshot,
        blockBars: analytics.blockBars,
        transactionBars: analytics.transactionBars,
        windows: analytics.windows,
        notables: analytics.notables
      };
    })
  );

  constructor(
    private readonly data: ExplorerDataService,
    @Inject(EXPLORER_BACKEND_CONFIG) private readonly backend: ExplorerBackendConfig
  ) {}

  get activeRange(): RangePreset | undefined {
    return this.rangePresets.find((preset) => preset.id === this.selectedRangeId);
  }

  selectRange(rangeId: RangePreset['id']): void {
    const preset = this.rangePresets.find((candidate) => candidate.id === rangeId);
    if (!preset) {
      return;
    }
    this.selectedRangeId = preset.id;
    this.selectedRangeSubject.next(preset);
  }

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

  protected readonly formatBlockHeight = formatBlockHeight;
  protected readonly formatHash = formatHash;
}
