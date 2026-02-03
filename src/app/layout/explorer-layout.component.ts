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
      :host {
        display: block;
        width: 100%;
      }

      .layout {
        position: relative;
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        width: 100%;
        background-color: var(--app-bg);
        overflow-x: hidden;
      }

      /* SVG Grid Background Pattern (like Silica site) */
      .layout::before {
        content: '';
        position: fixed;
        inset: 0;
        opacity: 0.15;
        background-image: 
          linear-gradient(rgba(14, 165, 233, 0.3) 1px, transparent 1px),
          linear-gradient(90deg, rgba(14, 165, 233, 0.3) 1px, transparent 1px);
        background-size: 50px 50px;
        pointer-events: none;
        z-index: 0;
      }

      /* Animated Gradient Orbs Background */
      .layout::after {
        content: '';
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        background: 
          radial-gradient(circle at 20% 30%, rgba(14, 165, 233, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 60%, rgba(20, 184, 166, 0.08) 0%, transparent 50%),
          radial-gradient(circle at 50% 80%, rgba(34, 197, 94, 0.06) 0%, transparent 50%);
        animation: float 10s ease-in-out infinite;
      }

      .layout__content {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: var(--container-width);
        flex: 1;
        margin-left: auto;
        margin-right: auto;
        padding: 1.5rem var(--container-padding-sm) 4rem;
        display: block;
      }

      @media (min-width: 640px) {
        .layout__content {
          padding-left: var(--container-padding-md);
          padding-right: var(--container-padding-md);
        }
      }

      @media (min-width: 1024px) {
        .layout__content {
          padding-left: var(--container-padding-lg);
          padding-right: var(--container-padding-lg);
        }
      }

      /* Glow effects for sections */
      @keyframes float {
        0%, 100% {
          transform: translateY(0) scale(1);
        }
        50% {
          transform: translateY(-20px) scale(1.05);
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExplorerLayoutComponent {}
