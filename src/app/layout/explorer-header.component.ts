import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExplorerSearchComponent } from '@search/explorer-search.component';

@Component({
  selector: 'explorer-header',
  standalone: true,
  imports: [CommonModule, ExplorerSearchComponent],
  template: `
    <header class="header">
      <div class="header__brand" aria-label="Chert Explorer">
        <div class="header__brand-glyph" aria-hidden="true">◇</div>
        <div class="header__brand-text">
          <span class="header__brand-title">Chert Explorer</span>
          <span class="header__brand-subtitle">Consensus telemetry &amp; block insights</span>
        </div>
      </div>
      <explorer-search></explorer-search>
    </header>
  `,
  styles: [
    `
      .header {
        width: min(1200px, 94vw);
        margin: 0 auto;
        padding: 2rem 0 1.5rem;
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem;
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

      @media (max-width: 720px) {
        .header {
          flex-direction: column;
          align-items: stretch;
        }

        .header__brand {
          justify-content: center;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExplorerHeaderComponent {}
