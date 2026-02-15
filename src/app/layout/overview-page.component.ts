import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { map } from 'rxjs/operators';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import { BlockListComponent } from '@blocks/block-list.component';
import { BlockVisualizerComponent } from '@app/visualizer/block-visualizer.component';
import type { NetworkStatistics, PositiveInteger } from '@silica-protocol/explorer-models';

@Component({
  selector: 'overview-page',
  standalone: true,
  imports: [CommonModule, BlockListComponent, BlockVisualizerComponent],
  template: `
    <section class="overview" aria-labelledby="overview-heading">
      <header class="overview__header">
        <div>
          <h1 id="overview-heading">Network Overview</h1>
          <p class="overview__subtitle">Live view of consensus health and recent activity.</p>
        </div>
        <div class="overview__metrics" role="list">
          <article role="listitem" class="metric-card">
            <h2>Current Height</h2>
            <p>{{ currentHeight$ | async }}</p>
          </article>
          <article role="listitem" class="metric-card">
            <h2>Finalized Height</h2>
            <p>{{ finalizedHeight$ | async }}</p>
          </article>
          <article role="listitem" class="metric-card">
            <h2>Average TPS</h2>
            <p>{{ averageTps$ | async }}</p>
          </article>
          <article role="listitem" class="metric-card">
            <h2>Active Validators</h2>
            <p>{{ activeValidators$ | async }}</p>
          </article>
        </div>
      </header>

      <block-visualizer></block-visualizer>

      <section aria-labelledby="blocks-heading">
        <div class="section-heading">
          <h2 id="blocks-heading">Recent Blocks</h2>
          <p class="section-subtitle">Most recent {{ blockCount$ | async }} blocks across the DAG.</p>
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

      .overview {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .overview__header {
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

      .overview__subtitle {
        margin: 0.25rem 0 0;
        color: var(--text-secondary);
      }

      .overview__metrics {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.75rem;
        flex: 1;
        max-width: 600px;
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
        font-size: 0.95rem;
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

      .section-heading {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }

      .section-heading h2 {
        font-size: var(--h2-size);
        margin: 0;
      }

      .section-subtitle {
        margin: 0;
        color: var(--text-secondary);
      }

      @media (max-width: 960px) {
        .overview__header {
          flex-direction: column;
          align-items: flex-start;
        }

        .overview__metrics {
          grid-template-columns: repeat(2, 1fr);
          min-width: 0;
          width: 100%;
        }
      }

      @media (max-width: 480px) {
        .overview__metrics {
          grid-template-columns: 1fr;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OverviewPageComponent {
  private readonly stats$ = this.data.networkStats$;

  readonly currentHeight$ = this.stats$.pipe(map((stats) => this.toNumber(stats.currentHeight)));
  readonly finalizedHeight$ = this.stats$.pipe(map((stats) => this.toNumber(stats.finalizedHeight)));
  readonly averageTps$ = this.stats$.pipe(map((stats) => stats.averageTps.toFixed(2)));
  readonly activeValidators$ = this.stats$.pipe(map((stats) => stats.activeValidators));
  readonly blockCount$ = this.data.blocks$.pipe(map((blocks) => blocks.length));

  constructor(private readonly data: ExplorerDataService) {}

  private toNumber(value: PositiveInteger): number {
    return value as number;
  }
}
