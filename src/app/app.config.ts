import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { APP_ROUTES } from '@app/app.routes';
import { provideExplorerDataConfig } from '@services/explorer-data.config';
import { provideExplorerBackendConfig } from '@services/explorer-backend.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimations(),
    provideHttpClient(withFetch()),
    provideRouter(APP_ROUTES, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'top' })),
    provideExplorerBackendConfig(),
    provideExplorerDataConfig()
  ]
};
