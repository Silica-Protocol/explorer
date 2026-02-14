import { Routes } from '@angular/router';
import { OverviewPageComponent } from '@app/layout/overview-page.component';
import { BlockDetailComponent } from '@blocks/block-detail.component';
import { TransactionDetailComponent } from '@transactions/transaction-detail.component';
import { TransactionSearchComponent } from '@transactions/transaction-search.component';
import { AccountDetailComponent } from '@accounts/account-detail.component';
import { AccountSearchComponent } from '@accounts/account-search.component';
import { ValidatorsPageComponent } from '@app/validators/validators-page.component';
import { StakingPageComponent } from '@app/staking/staking-page.component';
import { PrivacyPageComponent } from '@app/privacy/privacy-page.component';
import { GovernancePageComponent } from '@app/governance/governance-page.component';
import { TokensPageComponent } from '@app/tokens/tokens-page.component';
import { TokenDetailPageComponent } from '@app/tokens/token-detail.component';
import { ContractViewerPageComponent } from '@app/contracts/contract-viewer.component';
import { EventsPageComponent } from '@app/events/events-page.component';
import { AnalyticsPageComponent } from '@app/analytics/analytics-page.component';

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
    path: 'staking',
    component: StakingPageComponent
  },
  {
    path: 'privacy',
    component: PrivacyPageComponent
  },
  {
    path: 'governance',
    component: GovernancePageComponent
  },
  {
    path: 'tokens',
    component: TokensPageComponent
  },
  {
    path: 'token/:address',
    component: TokenDetailPageComponent
  },
  {
    path: 'contract/:address',
    component: ContractViewerPageComponent
  },
  {
    path: 'events',
    component: EventsPageComponent
  },
  {
    path: 'analytics',
    component: AnalyticsPageComponent
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
