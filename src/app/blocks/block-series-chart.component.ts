import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface BlockChartBar {
  readonly label: string;
  readonly shortLabel: string;
  readonly value: number;
  readonly detail: string;
}

@Component({
  selector: 'block-series-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="series-card" [attr.data-accent]="accent">
      <header class="series-card__header">
        <div>
          <h3>{{ title }}</h3>
          <p class="series-card__subtitle">{{ subtitle }}</p>
        </div>
        <div class="series-card__meta">
          <span class="series-card__pill">{{ sampleLabel }}</span>
          <span class="series-card__value">{{ headline }}</span>
        </div>
      </header>

      <ng-container *ngIf="bars.length > 0; else emptyState">
        <div class="series-card__chart" role="img" [attr.aria-label]="title + ' chart'">
          <div class="series-card__bars">
            <div class="series-card__bar-shell" *ngFor="let bar of bars; trackBy: trackByLabel">
              <span
                class="series-card__bar"
                [style.height.%]="getHeight(bar.value)"
                [title]="bar.detail"
              ></span>
            </div>
          </div>
          <div class="series-card__axis">
            <span>{{ bars[0].shortLabel }}</span>
            <span>{{ bars[bars.length - 1].shortLabel }}</span>
          </div>
        </div>
      </ng-container>

      <ng-template #emptyState>
        <div class="series-card__empty">{{ emptyMessage }}</div>
      </ng-template>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .series-card {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-height: 100%;
        padding: 1.25rem;
        border-radius: 20px;
        border: 1px solid var(--panel-border);
        background:
          radial-gradient(circle at top right, rgba(34, 211, 238, 0.08), transparent 35%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01)),
          var(--panel-bg);
        overflow: hidden;
      }

      .series-card__header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 0.75rem;
        align-items: flex-start;
      }

      .series-card__header h3 {
        margin: 0;
        font-size: 1rem;
      }

      .series-card__subtitle {
        margin: 0.3rem 0 0;
        color: var(--text-secondary);
        font-size: 0.88rem;
      }

      .series-card__meta {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.45rem;
      }

      .series-card__pill {
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        font-size: 0.75rem;
        color: var(--text-secondary);
        border: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(15, 23, 42, 0.45);
      }

      .series-card__value {
        font-size: 1.25rem;
        font-weight: 700;
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        color: var(--text-primary);
      }

      .series-card[data-accent='cyan'] .series-card__value {
        color: #22d3ee;
      }

      .series-card[data-accent='cyan'] .series-card__bar {
        background: linear-gradient(180deg, #22d3ee, #0ea5e9);
      }

      .series-card[data-accent='teal'] .series-card__value {
        color: #2dd4bf;
      }

      .series-card[data-accent='teal'] .series-card__bar {
        background: linear-gradient(180deg, #2dd4bf, #14b8a6);
      }

      .series-card[data-accent='green'] .series-card__value {
        color: #4ade80;
      }

      .series-card[data-accent='green'] .series-card__bar {
        background: linear-gradient(180deg, #4ade80, #22c55e);
      }

      .series-card__chart {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        min-height: 220px;
      }

      .series-card__bars {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(6px, 1fr);
        gap: 0.25rem;
        align-items: end;
        min-height: 180px;
        height: 100%;
        padding: 1rem 0.35rem 0.35rem;
        border-radius: 16px;
        background:
          linear-gradient(180deg, rgba(148, 163, 184, 0.05), rgba(148, 163, 184, 0)),
          repeating-linear-gradient(
            to top,
            rgba(148, 163, 184, 0.05) 0,
            rgba(148, 163, 184, 0.05) 1px,
            transparent 1px,
            transparent 25%
          );
      }

      .series-card__bar-shell {
        display: flex;
        align-items: end;
        height: 100%;
      }

      .series-card__bar {
        display: block;
        width: 100%;
        min-height: 2px;
        border-radius: 999px 999px 0 0;
        box-shadow: 0 0 20px rgba(14, 165, 233, 0.15);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .series-card__bar:hover {
        opacity: 0.85;
        transform: translateY(-1px);
      }

      .series-card__axis {
        display: flex;
        justify-content: space-between;
        color: var(--text-secondary);
        font-size: 0.75rem;
        padding: 0 0.2rem;
      }

      .series-card__empty {
        min-height: 220px;
        border-radius: 16px;
        border: 1px dashed rgba(148, 163, 184, 0.18);
        display: grid;
        place-items: center;
        color: var(--text-secondary);
        font-size: 0.9rem;
        background: rgba(15, 23, 42, 0.25);
      }

      @media (max-width: 768px) {
        .series-card__meta {
          align-items: flex-start;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlockSeriesChartComponent {
  @Input({ required: true }) title = '';
  @Input({ required: true }) subtitle = '';
  @Input() headline = '—';
  @Input() sampleLabel = 'Live sample';
  @Input() emptyMessage = 'Waiting for live node data';
  @Input() accent: 'cyan' | 'teal' | 'green' = 'cyan';

  private maxBarValue = 0;
  private barsValue: readonly BlockChartBar[] = [];

  @Input({ required: true })
  set bars(value: readonly BlockChartBar[]) {
    this.barsValue = value;
    this.maxBarValue = value.reduce((max, bar) => Math.max(max, bar.value), 0);
  }

  get bars(): readonly BlockChartBar[] {
    return this.barsValue;
  }

  getHeight(value: number): number {
    if (this.maxBarValue <= 0) {
      return 0;
    }
    return Math.max(2, (value / this.maxBarValue) * 100);
  }

  trackByLabel(_: number, bar: BlockChartBar): string {
    return bar.label;
  }
}
