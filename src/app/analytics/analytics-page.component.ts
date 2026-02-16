import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExplorerDataService } from '@app/services/explorer-data.service';

interface TpsDataPoint {
  timestamp: string;
  tps: number;
}

interface GasDataPoint {
  timestamp: string;
  gasUsed: number;
}

interface VolumeDataPoint {
  timestamp: string;
  volume: number;
}

@Component({
  selector: 'analytics-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="analytics" aria-labelledby="analytics-heading">
      <header class="analytics__header">
        <div>
          <h1 id="analytics-heading">Analytics</h1>
          <p class="analytics__subtitle">Network performance and usage metrics</p>
        </div>
        <div class="time-range">
          <button
            *ngFor="let range of timeRanges"
            class="range-btn"
            [class.active]="selectedRange === range.value"
            (click)="selectRange(range.value)"
          >
            {{ range.label }}
          </button>
        </div>
      </header>

      <div *ngIf="loading" class="loading">Loading analytics data...</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error">
        <section class="analytics__metrics" aria-label="Key metrics">
          <article class="metric-card metric-card--cyan">
            <h2>Avg TPS</h2>
            <p class="metric-value">{{ avgTps | number:'1.1-1' }}</p>
            <span class="metric-label">transactions/sec</span>
          </article>

          <article class="metric-card metric-card--teal">
            <h2>Peak TPS</h2>
            <p class="metric-value">{{ peakTps | number:'1.1-1' }}</p>
            <span class="metric-label">transactions/sec</span>
          </article>

          <article class="metric-card metric-card--green">
            <h2>Total Gas Used</h2>
            <p class="metric-value">{{ formatNumber(totalGas) }}</p>
            <span class="metric-label">gas</span>
          </article>

          <article class="metric-card metric-card--emerald">
            <h2>Total Volume</h2>
            <p class="metric-value">{{ formatNumber(totalVolume) }}</p>
            <span class="metric-label">CHERT</span>
          </article>
        </section>

        <section class="analytics__charts" aria-label="Charts">
          <div class="chart-card">
            <div class="chart-header">
              <h2>Transactions Per Second</h2>
              <p class="muted">TPS over time</p>
            </div>
            <div class="chart-container">
              <div class="simple-chart">
                <div class="chart-bars">
                  <div
                    *ngFor="let point of tpsData"
                    class="chart-bar"
                    [style.height.%]="getBarHeight(point.tps, maxTps)"
                    [title]="point.timestamp + ': ' + point.tps.toFixed(2) + ' TPS'"
                  ></div>
                </div>
                <div class="chart-labels">
                  <span>{{ tpsData.length > 0 ? tpsData[0].timestamp : '-' }}</span>
                  <span>{{ tpsData.length > 0 ? tpsData[tpsData.length - 1].timestamp : '-' }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-header">
              <h2>Gas Usage</h2>
              <p class="muted">Gas consumed per block</p>
            </div>
            <div class="chart-container">
              <div class="simple-chart">
                <div class="chart-bars">
                  <div
                    *ngFor="let point of gasData"
                    class="chart-bar chart-bar--teal"
                    [style.height.%]="getBarHeight(point.gasUsed, maxGas)"
                    [title]="point.timestamp + ': ' + formatNumber(point.gasUsed) + ' gas'"
                  ></div>
                </div>
                <div class="chart-labels">
                  <span>{{ gasData.length > 0 ? gasData[0].timestamp : '-' }}</span>
                  <span>{{ gasData.length > 0 ? gasData[gasData.length - 1].timestamp : '-' }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="chart-card chart-card--wide">
            <div class="chart-header">
              <h2>Transaction Volume</h2>
              <p class="muted">CHERT transferred over time</p>
            </div>
            <div class="chart-container">
              <div class="simple-chart">
                <div class="chart-bars">
                  <div
                    *ngFor="let point of volumeData"
                    class="chart-bar chart-bar--green"
                    [style.height.%]="getBarHeight(point.volume, maxVolume)"
                    [title]="point.timestamp + ': ' + formatNumber(point.volume) + ' CHERT'"
                  ></div>
                </div>
                <div class="chart-labels">
                  <span>{{ volumeData.length > 0 ? volumeData[0].timestamp : '-' }}</span>
                  <span>{{ volumeData.length > 0 ? volumeData[volumeData.length - 1].timestamp : '-' }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="analytics__table" aria-label="Detailed data">
          <div class="section-heading">
            <h2>Historical Data</h2>
            <p class="muted">Recent performance metrics</p>
          </div>

          <div class="data-table">
            <div class="data-table__header">
              <span>Time</span>
              <span>TPS</span>
              <span>Gas Used</span>
              <span>Volume</span>
            </div>
            <div *ngFor="let i of getRange(tpsData.length)" class="data-row">
              <span>{{ tpsData[i]?.timestamp || '-' }}</span>
              <span class="tps">{{ tpsData[i]?.tps?.toFixed(2) || '-' }}</span>
              <span>{{ formatNumber(gasData[i]?.gasUsed || 0) }}</span>
              <span>{{ formatNumber(volumeData[i]?.volume || 0) }} CHERT</span>
            </div>
            <div *ngIf="tpsData.length === 0" class="empty-state">
              No data available
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

      .analytics {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .analytics__header {
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

      .analytics__subtitle {
        margin: 0.25rem 0 0;
        color: var(--text-secondary);
      }

      .time-range {
        display: flex;
        gap: 0.5rem;
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 999px;
        padding: 0.25rem;
      }

      .range-btn {
        appearance: none;
        border: none;
        background: transparent;
        color: var(--text-secondary);
        padding: 0.5rem 1rem;
        font-size: 0.85rem;
        border-radius: 999px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .range-btn.active {
        background: rgba(14, 165, 233, 0.2);
        color: #0ea5e9;
        font-weight: 500;
      }

      .range-btn:hover:not(.active) {
        color: inherit;
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

      .analytics__metrics {
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

      .analytics__charts {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
      }

      .chart-card {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.25rem;
      }

      .chart-card--wide {
        grid-column: span 2;
      }

      .chart-header {
        margin-bottom: 1rem;
      }

      .chart-header h2 {
        margin: 0;
        font-size: 1rem;
      }

      .chart-header .muted {
        font-size: 0.85rem;
        margin-top: 0.25rem;
      }

      .chart-container {
        height: 200px;
      }

      .simple-chart {
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      .chart-bars {
        flex: 1;
        display: flex;
        align-items: flex-end;
        gap: 2px;
      }

      .chart-bar {
        flex: 1;
        background: linear-gradient(180deg, #0ea5e9, #06b6d4);
        border-radius: 2px 2px 0 0;
        min-height: 2px;
        transition: height 0.3s ease;
        cursor: pointer;
      }

      .chart-bar:hover {
        opacity: 0.8;
      }

      .chart-bar--teal {
        background: linear-gradient(180deg, #14b8a6, #0d9488);
      }

      .chart-bar--green {
        background: linear-gradient(180deg, #22c55e, #16a34a);
      }

      .chart-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        color: var(--text-secondary);
        margin-top: 0.5rem;
      }

      .data-table {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        overflow: hidden;
      }

      .data-table__header,
      .data-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr;
        gap: 0.75rem;
        padding: 0.9rem 1.25rem;
        align-items: center;
      }

      .data-table__header {
        font-size: 0.8rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--panel-border);
        background: rgba(14, 165, 233, 0.03);
      }

      .data-row {
        border-bottom: 1px solid rgba(14, 165, 233, 0.08);
        font-size: 0.9rem;
      }

      .data-row:last-child {
        border-bottom: none;
      }

      .data-row:hover {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.05), rgba(20, 184, 166, 0.03));
      }

      .data-row .tps {
        color: #0ea5e9;
        font-weight: 600;
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
      }

      .empty-state {
        padding: 3rem;
        text-align: center;
        color: var(--text-secondary);
      }

      @media (max-width: 768px) {
        .analytics__charts {
          grid-template-columns: 1fr;
        }

        .chart-card--wide {
          grid-column: span 1;
        }

        .data-table__header,
        .data-row {
          grid-template-columns: 1fr 1fr;
        }

        .data-table__header span:nth-child(n + 3),
        .data-row span:nth-child(n + 3) {
          display: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnalyticsPageComponent implements OnInit {
  timeRanges = [
    { label: '1H', value: '1h' },
    { label: '24H', value: '24h' },
    { label: '7D', value: '7d' },
    { label: '30D', value: '30d' }
  ];
  selectedRange = '24h';

  tpsData: TpsDataPoint[] = [];
  gasData: GasDataPoint[] = [];
  volumeData: VolumeDataPoint[] = [];

  avgTps = 0;
  peakTps = 0;
  totalGas = 0;
  totalVolume = 0;
  maxTps = 1;
  maxGas = 1;
  maxVolume = 1;

  loading = true;
  error: string | null = null;

  constructor(private readonly data: ExplorerDataService) {}

  async ngOnInit(): Promise<void> {
    await this.loadAnalytics();
  }

  selectRange(range: string): void {
    this.selectedRange = range;
    this.loadAnalytics();
  }

  private async loadAnalytics(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const analytics = await this.data.fetchAnalytics();
      console.log('Analytics data:', analytics);

      this.tpsData = (analytics.tps_history || []).map(p => ({
        timestamp: this.formatTimestamp(p.timestamp),
        tps: p.tps
      }));

      this.gasData = (analytics.gas_usage || []).map(p => ({
        timestamp: this.formatTimestamp(p.timestamp),
        gasUsed: p.gas_used
      }));

      this.volumeData = (analytics.tx_volume || []).map(p => ({
        timestamp: this.formatTimestamp(p.timestamp),
        volume: p.volume / 1_000_000
      }));

      this.calculateMetrics();

    } catch (err) {
      this.error = 'Failed to load analytics data';
      console.error('Analytics load error:', err);
    } finally {
      this.loading = false;
    }
  }

  private calculateMetrics(): void {
    if (this.tpsData.length > 0) {
      this.avgTps = this.tpsData.reduce((sum, p) => sum + p.tps, 0) / this.tpsData.length;
      this.peakTps = Math.max(...this.tpsData.map(p => p.tps));
      this.maxTps = this.peakTps;
    }

    if (this.gasData.length > 0) {
      this.totalGas = this.gasData.reduce((sum, p) => sum + p.gasUsed, 0);
      this.maxGas = Math.max(...this.gasData.map(p => p.gasUsed));
    }

    if (this.volumeData.length > 0) {
      this.totalVolume = this.volumeData.reduce((sum, p) => sum + p.volume, 0);
      this.maxVolume = Math.max(...this.volumeData.map(p => p.volume));
    }
  }

  private formatTimestamp(ts: string): string {
    try {
      return new Date(ts).toISOString().slice(0, 16);
    } catch {
      return ts;
    }
  }

  getBarHeight(value: number, max: number): number {
    if (max === 0) return 0;
    return Math.max(2, (value / max) * 100);
  }

  formatNumber(value: number): string {
    if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B';
    if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
    return value.toFixed(0);
  }

  getRange(length: number): number[] {
    return Array.from({ length }, (_, i) => i);
  }
}
