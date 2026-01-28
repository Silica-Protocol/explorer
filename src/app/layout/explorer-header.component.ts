import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Location } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ExplorerSearchComponent } from '@search/explorer-search.component';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Component({
  selector: 'explorer-header',
  standalone: true,
  imports: [CommonModule, RouterModule, ExplorerSearchComponent],
  template: `
    <header class="header">
      <div class="header__inner">
        <div class="header__brand" aria-label="Chert Explorer">
          <div class="header__brand-glyph" aria-hidden="true">◇</div>
          <div class="header__brand-text">
            <span class="header__brand-title">Chert Explorer</span>
            <span class="header__brand-subtitle">Consensus telemetry &amp; block insights</span>
          </div>
        </div>

        <nav class="header__nav" aria-label="Primary">
          <a routerLink="/" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }">Blocks</a>
          <a routerLink="/transactions" routerLinkActive="is-active">Transactions</a>
          <a routerLink="/accounts" routerLinkActive="is-active">Accounts</a>
        </nav>

        <div class="header__tools">
          <div class="header__actions">
            <button class="btn btn--ghost" type="button" (click)="goBack()">Back</button>
            <button
              class="btn btn--primary"
              type="button"
              (click)="refresh()"
              [disabled]="(refreshInFlight$ | async) === true"
            >
              Refresh
            </button>
          </div>

          <div class="header__status" *ngIf="lastRefreshedLabel$ | async as label">
            <span class="header__status-dot" aria-hidden="true"></span>
            <span>{{ label }}</span>
          </div>

          <explorer-search></explorer-search>
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      .header {
        position: sticky;
        top: 0;
        z-index: 20;
        width: 100%;
        background: rgba(12, 16, 26, 0.72);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }

      .header__inner {
        width: min(1200px, 94vw);
        margin: 0 auto;
        padding: 1.25rem 0;
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
        justify-content: space-between;
      }

      .header__brand {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .header__brand-glyph {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: linear-gradient(135deg, rgba(27, 220, 242, 0.28), rgba(102, 227, 255, 0.12));
        border: 1px solid rgba(102, 227, 255, 0.24);
        display: grid;
        place-items: center;
        font-size: 1.4rem;
        color: var(--accent-strong);
      }

      .header__brand-text {
        display: flex;
        flex-direction: column;
      }

      .header__brand-title {
        font-size: 1.45rem;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      .header__brand-subtitle {
        color: var(--text-secondary);
        font-size: 0.9rem;
      }

      .header__tools {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1rem;
        align-items: center;
        justify-content: flex-end;
      }

      .header__nav {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        padding: 0.3rem 0.6rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.03);
      }

      .header__nav a {
        color: var(--text-secondary);
        text-decoration: none;
        font-size: 0.9rem;
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        transition: background 120ms ease, color 120ms ease;
      }

      .header__nav a.is-active {
        color: var(--accent);
        background: rgba(102, 227, 255, 0.12);
      }

      .header__actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .btn {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.04);
        color: inherit;
        border-radius: 999px;
        padding: 0.55rem 0.9rem;
        font-size: 0.9rem;
        line-height: 1;
        cursor: pointer;
        transition: transform 120ms ease, border-color 120ms ease, background-color 120ms ease;
      }

      .btn:hover {
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(102, 227, 255, 0.35);
      }

      .btn:active {
        transform: translateY(1px);
      }

      .btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .btn--primary {
        border-color: rgba(27, 220, 242, 0.45);
        background: rgba(27, 220, 242, 0.12);
      }

      .btn--ghost {
        background: rgba(255, 255, 255, 0.02);
      }

      .header__status {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--text-secondary);
        font-size: 0.85rem;
      }

      .header__status-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: rgba(91, 197, 135, 0.9);
        box-shadow: 0 0 0 3px rgba(91, 197, 135, 0.15);
      }

      @media (max-width: 720px) {
        .header__inner {
          flex-direction: column;
          align-items: stretch;
        }

        .header__brand {
          justify-content: center;
        }

        .header__tools {
          justify-content: center;
        }

        .header__nav {
          justify-content: center;
          width: 100%;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExplorerHeaderComponent {
  readonly refreshInFlight$ = this.data.refreshInFlight$;

  readonly lastRefreshedLabel$: Observable<string> = this.data.lastRefreshedAt$.pipe(
    map((value) => {
      if (!value) {
        return 'Not refreshed yet';
      }
      const secondsAgo = Math.max(0, Math.floor((Date.now() - value) / 1000));
      if (secondsAgo < 5) {
        return 'Refreshed just now';
      }
      if (secondsAgo < 120) {
        return `Refreshed ${secondsAgo}s ago`;
      }
      const minutesAgo = Math.floor(secondsAgo / 60);
      return `Refreshed ${minutesAgo}m ago`;
    })
  );

  constructor(private readonly data: ExplorerDataService, private readonly location: Location) {}

  goBack(): void {
    this.location.back();
  }

  refresh(): void {
    this.data.refreshNow();
  }
}

