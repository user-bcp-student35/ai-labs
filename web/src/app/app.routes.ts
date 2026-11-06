import { Routes } from '@angular/router';
import { activeWalletGuard } from './features/wallet/guards/active-wallet.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'onboarding' },
  {
    path: 'onboarding',
    loadChildren: () => import('./features/onboarding/onboarding.routes').then((module) => module.ONBOARDING_ROUTES),
  },
  {
    path: 'payments',
    canActivate: [activeWalletGuard],
    loadChildren: () => import('./features/wallet/wallet.routes').then((module) => module.WALLET_ROUTES),
  },
  {
    path: 'merchant',
    loadChildren: () => import('./features/merchant/merchant.routes').then((module) => module.MERCHANT_ROUTES),
  },
  { path: '**', redirectTo: 'onboarding' },
];
