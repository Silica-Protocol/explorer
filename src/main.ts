import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from '@app/app.component';
import { appConfig } from '@app/app.config';

document.addEventListener('DOMContentLoaded', () => {
  void bootstrapApplication(AppComponent, appConfig).catch((err) => {
    console.error('Failed to bootstrap Chert Explorer', err);
  });
});
