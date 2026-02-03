import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ExplorerLayoutComponent } from '@app/layout/explorer-layout.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ExplorerLayoutComponent],
  template: `<explorer-layout></explorer-layout>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        min-height: 100vh;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {}
