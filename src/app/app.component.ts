import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ExplorerLayoutComponent } from '@app/layout/explorer-layout.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ExplorerLayoutComponent],
  template: `<explorer-layout></explorer-layout>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {}
