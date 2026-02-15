import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Location } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ExplorerSearchComponent } from '@search/explorer-search.component';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

interface NavGroup {
  label: string;
  items: { label: string; route: string }[];
}

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

        <nav class="header__groups" aria-label="Main navigation">
          <div *ngFor="let group of navGroups" class="nav-group">
            <button 
              class="nav-group__trigger"
              [class.is-active]="isGroupActive(group)"
              (click)="toggleGroup(group)"
            >
              {{ group.label }}
              <span class="nav-group__arrow">▾</span>
            </button>
            <div class="nav-group__dropdown" *ngIf="openGroup === group">
              <a 
                *ngFor="let item of group.items" 
                [routerLink]="item.route"
                routerLinkActive="is-active"
                [routerLinkActiveOptions]="{ exact: item.route === '/' }"
                (click)="closeGroup()"
              >
                {{ item.label }}
              </a>
            </div>
          </div>
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
      :host {
        display: block;
        width: 100%;
      }

      .header {
        position: sticky;
        top: 0;
        z-index: 20;
        width: 100%;
        background: rgba(10, 22, 40, 0.85);
        backdrop-filter: blur(16px);
        border-bottom: 1px solid rgba(14, 165, 233, 0.15);
        box-shadow: 0 4px 20px rgba(14, 165, 233, 0.08);
        transition: all 0.3s ease;
      }

      .header__inner {
        width: 100%;
        max-width: var(--container-width);
        margin-left: auto;
        margin-right: auto;
        padding: 1rem var(--container-padding-sm);
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
        justify-content: space-between;
      }

      @media (min-width: 640px) {
        .header__inner {
          padding-left: var(--container-padding-md);
          padding-right: var(--container-padding-md);
        }
      }

      @media (min-width: 1024px) {
        .header__inner {
          padding-left: var(--container-padding-lg);
          padding-right: var(--container-padding-lg);
        }
      }

      .header__brand {
        display: flex;
        align-items: center;
        gap: 1rem;
        cursor: pointer;
        transition: transform 0.3s ease;
        flex: 0 0 auto;
      }

      .header__brand:hover {
        transform: translateY(-2px);
      }

      .header__brand-glyph {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.3), rgba(20, 184, 166, 0.2));
        border: 1px solid rgba(14, 165, 233, 0.3);
        display: grid;
        place-items: center;
        font-size: 1.4rem;
        color: var(--accent);
        box-shadow: 0 0 20px rgba(14, 165, 233, 0.2);
        transition: all 0.3s ease;
        position: relative;
      }

      .header__brand-glyph::before {
        content: '';
        position: absolute;
        inset: -2px;
        background: linear-gradient(135deg, #0ea5e9, #14b8a6, #22c55e);
        border-radius: 12px;
        opacity: 0;
        filter: blur(8px);
        transition: opacity 0.3s ease;
        z-index: -1;
      }

      .header__brand:hover .header__brand-glyph::before {
        opacity: 0.5;
      }

      .header__brand:hover .header__brand-glyph {
        box-shadow: 0 0 30px rgba(14, 165, 233, 0.4);
        border-color: rgba(14, 165, 233, 0.5);
      }

      .header__brand-text {
        display: flex;
        flex-direction: column;
      }

      .header__brand-title {
        font-size: 1.45rem;
        font-weight: 600;
        letter-spacing: 0.01em;
        background: linear-gradient(135deg, #0ea5e9, #14b8a6, #22c55e);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .header__brand-subtitle {
        color: var(--text-secondary);
        font-size: 0.9rem;
      }

      .header__groups {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex: 0 0 auto;
      }

      .nav-group {
        position: relative;
      }

      .nav-group__trigger {
        appearance: none;
        background: rgba(14, 165, 233, 0.05);
        border: 1px solid rgba(14, 165, 233, 0.15);
        color: var(--text-secondary);
        padding: 0.5rem 1rem;
        border-radius: 8px;
        font-size: 0.9rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        transition: all 0.2s ease;
      }

      .nav-group__trigger:hover {
        background: rgba(14, 165, 233, 0.1);
        border-color: rgba(14, 165, 233, 0.3);
        color: var(--accent);
      }

      .nav-group__trigger.is-active {
        background: rgba(14, 165, 233, 0.15);
        border-color: rgba(14, 165, 233, 0.4);
        color: var(--accent);
      }

      .nav-group__arrow {
        font-size: 0.7rem;
        transition: transform 0.2s ease;
      }

      .nav-group__trigger.is-active .nav-group__arrow {
        transform: rotate(180deg);
      }

      .nav-group__dropdown {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        min-width: 180px;
        background: rgba(10, 22, 40, 0.95);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(14, 165, 233, 0.2);
        border-radius: 12px;
        padding: 0.5rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        z-index: 100;
        animation: dropdown-appear 0.2s ease;
      }

      @keyframes dropdown-appear {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .nav-group__dropdown a {
        display: block;
        padding: 0.6rem 1rem;
        color: var(--text-secondary);
        text-decoration: none;
        border-radius: 8px;
        font-size: 0.9rem;
        transition: all 0.15s ease;
      }

      .nav-group__dropdown a:hover {
        background: rgba(14, 165, 233, 0.1);
        color: var(--accent);
      }

      .nav-group__dropdown a.is-active {
        background: rgba(14, 165, 233, 0.15);
        color: var(--accent);
      }

      .header__tools {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1rem;
        align-items: center;
        justify-content: flex-end;
        flex: 1 1 520px;
        margin-left: auto;
      }

      explorer-search {
        flex: 1 1 320px;
        max-width: 360px;
        min-width: 220px;
      }

      .header__actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex: 0 0 auto;
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
        position: relative;
        overflow: hidden;
      }

      .btn::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.1), rgba(20, 184, 166, 0.05));
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .btn:hover::before {
        opacity: 1;
      }

      .btn:hover {
        background: rgba(14, 165, 233, 0.1);
        border-color: rgba(14, 165, 233, 0.4);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(14, 165, 233, 0.2);
      }

      .btn:active {
        transform: translateY(0);
      }

      .btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        transform: none;
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
      }

      .btn--ghost {
        background: rgba(255, 255, 255, 0.02);
        border-color: rgba(255, 255, 255, 0.1);
      }

      .btn--ghost:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(14, 165, 233, 0.3);
      }

      .header__status {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--text-secondary);
        font-size: 0.85rem;
        padding: 0.5rem 0.75rem;
        background: rgba(34, 197, 94, 0.05);
        border-radius: 999px;
        border: 1px solid rgba(34, 197, 94, 0.15);
        flex: 0 0 auto;
      }

      .header__status-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: rgba(34, 197, 94, 0.9);
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2), 0 0 10px rgba(34, 197, 94, 0.4);
        animation: pulse-glow 2s ease-in-out infinite;
      }

      @keyframes pulse-glow {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.7;
          transform: scale(1.1);
        }
      }

      @media (max-width: 900px) {
        .header__groups {
          display: none;
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

  navGroups: NavGroup[] = [
    {
      label: 'Core',
      items: [
        { label: 'Blocks', route: '/' },
        { label: 'Transactions', route: '/transactions' },
        { label: 'Accounts', route: '/accounts' },
        { label: 'Staking', route: '/staking' },
      ]
    },
    {
      label: 'Network',
      items: [
        { label: 'Overview', route: '/network' },
        { label: 'Analytics', route: '/analytics' },
        { label: 'Chain Params', route: '/chain-params' },
        { label: 'Governance', route: '/governance' },
      ]
    },
    {
      label: 'Tokens',
      items: [
        { label: 'Tokens', route: '/tokens' },
        { label: 'Contracts', route: '/contract/0' },
        { label: 'Events', route: '/events' },
      ]
    },
    {
      label: 'Bridge',
      items: [
        { label: 'Bridge', route: '/bridge' },
      ]
    }
  ];

  openGroup: NavGroup | null = null;

  constructor(private readonly data: ExplorerDataService, private readonly location: Location) {}

  toggleGroup(group: NavGroup): void {
    this.openGroup = this.openGroup === group ? null : group;
  }

  closeGroup(): void {
    this.openGroup = null;
  }

  isGroupActive(group: NavGroup): boolean {
    return group.items.some(item => {
      const path = window.location.pathname;
      if (item.route === '/') return path === '/';
      return path.startsWith(item.route);
    });
  }

  goBack(): void {
    this.location.back();
  }

  refresh(): void {
    this.data.refreshNow();
  }
}
