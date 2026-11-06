import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_CONFIG, MERCHANT_API_PREFIX, MERCHANT_ID_HEADER } from '../config/app-config';
import { MerchantIdentityStore } from '../identity/merchant-identity.store';

/** Agrega X-Merchant-Id solo a las rutas /merchant de la API; el resto del tráfico no se toca. */
export const merchantIdentityInterceptor: HttpInterceptorFn = (request, next) => {
  const { apiBaseUrl } = inject(APP_CONFIG);
  const merchantUrl = `${apiBaseUrl}${MERCHANT_API_PREFIX}`;
  const isMerchantRoute = request.url === merchantUrl || request.url.startsWith(`${merchantUrl}/`);
  const merchantId = inject(MerchantIdentityStore).merchantId();
  if (!isMerchantRoute || merchantId === null) {
    return next(request);
  }
  return next(request.clone({ setHeaders: { [MERCHANT_ID_HEADER]: merchantId } }));
};
