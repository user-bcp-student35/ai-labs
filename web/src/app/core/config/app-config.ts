import { InjectionToken } from '@angular/core';

export interface AppConfig {
  readonly apiBaseUrl: string;
  readonly testUserId: string;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  // El proxy de desarrollo (proxy.conf.json) reescribe este prefijo hacia la API.
  apiBaseUrl: '/wallet-api',
  // Identidad ficticia provisional hasta contar con auth/ (decisión P-3).
  testUserId: 'TEST-user-0001',
};

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export const PAYER_ID_HEADER = 'X-Payer-Id';

export const API_PATHS = {
  flow: '/onboarding/flow',
  onboarding: '/onboarding',
  currentOnboarding: '/onboarding/current',
  step: (onboardingId: string, stepId: string): string =>
    `/onboarding/${encodeURIComponent(onboardingId)}/steps/${encodeURIComponent(stepId)}`,
  close: (onboardingId: string): string => `/onboarding/${encodeURIComponent(onboardingId)}/close`,
  wallet: '/wallet',
  paymentsEntry: '/wallet/payments-entry',
  payments: '/payments',
  paymentConfirmations: '/payments/confirmations',
  paymentAbandon: (intentId: string): string => `/payments/confirmations/${encodeURIComponent(intentId)}/abandon`,
  payment: (paymentId: string): string => `/payments/${encodeURIComponent(paymentId)}`,
  paymentRetries: (paymentId: string): string => `/payments/${encodeURIComponent(paymentId)}/retries`,
  merchantQrPayments: '/merchant/qr-payments',
  merchantQrHistory: '/merchant/qr-payments/history',
  merchantQrAttemptHistory: (reference: string): string =>
    `/merchant/qr-payments/${encodeURIComponent(reference)}/history`,
  merchantQrSimulate: (reference: string): string =>
    `/merchant/qr-payments/${encodeURIComponent(reference)}/simulate-event`,
} as const;

/** Prefijo de las rutas de la API que usan identidad de comercio (X-Merchant-Id) y no la del pagador. */
export const MERCHANT_API_PREFIX = '/merchant';
export const MERCHANT_ID_HEADER = 'X-Merchant-Id';

/** Claves de almacenamiento del navegador (solo sessionStorage; nunca datos sensibles). */
export const STORAGE_KEYS = {
  merchantId: 'wallet.merchantId',
} as const;

/** Formato que acepta la API para identificadores (api/app/schemas_merchant.py: SAFE_ID_PATTERN, 64). */
export const SAFE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export const APP_ROUTES = {
  merchant: '/merchant',
  merchantHistory: '/merchant/history',
  merchantAttempt: (reference: string): string => `/merchant/${encodeURIComponent(reference)}`,
  onboarding: '/onboarding',
  payments: '/payments',
  paymentConfirm: '/payments/confirm',
  paymentHistory: '/payments/history',
  paymentResult: (paymentId: string): string => `/payments/result/${encodeURIComponent(paymentId)}`,
} as const;
