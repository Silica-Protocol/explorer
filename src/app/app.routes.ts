import { Routes } from '@angular/router';
import { OverviewPageComponent } from '@app/layout/overview-page.component';
import { BlockDetailComponent } from '@blocks/block-detail.component';
import { TransactionDetailComponent } from '@transactions/transaction-detail.component';
import { AccountDetailComponent } from '@accounts/account-detail.component';

export const APP_ROUTES: Routes = [
  {
    path: '',
    component: OverviewPageComponent
  },
  {
    path: 'block/:hash',
    component: BlockDetailComponent
  },
  {
    path: 'transaction/:hash',
    component: TransactionDetailComponent
  },
  {
    path: 'account/:address',
    component: AccountDetailComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
