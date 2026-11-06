import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { APP_ROUTES } from '../../../../core/config/app-config';
import { MERCHANT_COPY } from '../../merchant.copy';

/** Navegación entre las secciones del comercio; la sección actual se marca con `aria-current`. */
@Component({
  selector: 'app-merchant-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './merchant-nav.html',
  styleUrl: './merchant-nav.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantNav {
  protected readonly copy = MERCHANT_COPY;
  protected readonly paymentsRoute = APP_ROUTES.merchant;
  protected readonly historyRoute = APP_ROUTES.merchantHistory;
}
