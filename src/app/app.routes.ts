import { Routes } from '@angular/router';
import { OverviewPageComponent } from '@app/layout/overview-page.component';
import { BlockDetailComponent } from '@blocks/block-detail.component';
import { TransactionDetailComponent } from '@transactions/transaction-detail.component';
import { TransactionSearchComponent } from '@transactions/transaction-search.component';
import { AccountDetailComponent } from '@accounts/account-detail.component';
import { AccountSearchComponent } from '@accounts/account-search.component';
import { ValidatorsPageComponent } from '@app/validators/validators-page.component';

export const APP_ROUTES: Routes = [
  {
    path: '',
    component: OverviewPageComponent
  },
  {
    path: 'validators',
    component: ValidatorsPageComponent
  },
  {
    path: 'block/:hash',
    component: BlockDetailComponent
  },
  {
    path: 'transactions',
    component: TransactionSearchComponent
  },
  {
    path: 'transaction/:hash',
    component: TransactionDetailComponent
  },
  {
    path: 'accounts',
    component: AccountSearchComponent
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
