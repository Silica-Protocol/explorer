import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ExplorerHeaderComponent } from '@app/layout/explorer-header.component';

@Component({
  selector: 'explorer-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ExplorerHeaderComponent],
  template: `
    <div class="layout">
      <explorer-header></explorer-header>
      <main class="layout__content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [
    `
      .layout {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: radial-gradient(circle at top left, rgba(102, 227, 255, 0.08), transparent 42%), var(--app-bg);
      }

      .layout__content {
        width: min(1200px, 94vw);
        flex: 1;
        margin: 0 auto;
        padding: 1.5rem 0 4rem;
        display: flex;
      }

      @media (max-width: 960px) {
        .layout__content {
          width: 100%;
          padding: 1rem;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExplorerLayoutComponent {}
