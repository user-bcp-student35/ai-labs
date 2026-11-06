import { Routes } from '@angular/router';
import { MerchantAttemptPage } from './pages/merchant-attempt-page/merchant-attempt-page';
import { MerchantHistoryPage } from './pages/merchant-history-page/merchant-history-page';
import { MerchantPaymentsPage } from './pages/merchant-payments-page/merchant-payments-page';
import { MERCHANT_COPY } from './merchant.copy';

/** `history` va antes que `:reference` para que no se interprete como una referencia. */
export const MERCHANT_ROUTES: Routes = [
  { path: '', title: MERCHANT_COPY.routeTitle, component: MerchantPaymentsPage },
  { path: 'history', title: MERCHANT_COPY.historyRouteTitle, component: MerchantHistoryPage },
  { path: ':reference', title: MERCHANT_COPY.detailRouteTitle, component: MerchantAttemptPage },
];
