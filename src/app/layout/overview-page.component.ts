import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { map } from 'rxjs/operators';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import { BlockListComponent } from '@blocks/block-list.component';
import type { NetworkStatistics, PositiveInteger } from '@silica-protocol/explorer-models';

@Component({
  selector: 'overview-page',
  standalone: true,
  imports: [CommonModule, BlockListComponent],
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
        font-size: 2rem;
        margin: 0;
      }

      .overview__subtitle {
        margin: 0.25rem 0 0;
        color: var(--text-secondary);
      }

      .overview__metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1rem;
        min-width: min(520px, 100%);
      }

      .metric-card {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-height: 100px;
      }

      .metric-card h2 {
        margin: 0;
        font-size: 0.95rem;
        color: var(--text-secondary);
        font-weight: 500;
      }

      .metric-card p {
        margin: 0;
        font-size: 1.75rem;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      .section-heading {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }

      .section-heading h2 {
        margin: 0;
        font-size: 1.25rem;
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
          min-width: 0;
          width: 100%;
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
