/** Contratos de GET/POST /merchant/qr-payments (api/app/schemas_merchant.py). */
export type QrPaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';

export interface QrPayment {
  readonly reference: string;
  readonly merchant_id: string;
  readonly amount_cents: number;
  /** Puede llegar un valor fuera del conjunto conocido (OQ-24): se trata como `string`. */
  readonly status: string;
  readonly status_label: string;
  readonly created_at: string;
  readonly status_updated_at: string;
}

/** Filtros del historial de estados (fecha UTC del evento, inclusiva). */
export interface HistoryFilters {
  readonly reference: string;
  readonly dateFrom: string;
  readonly dateTo: string;
}

/** Filtros de la lista de cobros: además, estado actual (`''` = todos). */
export interface QrPaymentFilters extends HistoryFilters {
  readonly status: string;
}

/** Un cambio de estado (GET .../{reference}/history). */
export interface StatusChange {
  readonly previous_status: string;
  readonly previous_status_label: string;
  readonly status: string;
  readonly status_label: string;
  readonly occurred_at: string;
  readonly received_at: string;
}

export interface AttemptHistory {
  readonly reference: string;
  readonly merchant_id: string;
  readonly items: readonly StatusChange[];
}

export interface MerchantStatusChange extends StatusChange {
  readonly reference: string;
}

export interface MerchantHistoryList {
  readonly merchant_id: string;
  readonly items: readonly MerchantStatusChange[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly has_results: boolean;
  readonly message: string | null;
}

export type SimulateOutcome = 'APPLIED' | 'DUPLICATE' | 'OUT_OF_ORDER' | 'ALREADY_TERMINAL' | 'UNMAPPED_STATUS';

export interface SimulateEventResult {
  /** Puede llegar un valor fuera de `SimulateOutcome`: se trata como `string`. */
  readonly result: string;
  readonly payment: QrPayment;
}

export interface QrPaymentList {
  readonly merchant_id: string;
  readonly items: readonly QrPayment[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly has_results: boolean;
  readonly message: string | null;
  readonly reflect_deadline_seconds: number;
  /** Provisional: los controles de simulación solo se muestran si es `true`. */
  readonly demo_enabled: boolean;
}

export interface CreateQrPaymentRequest {
  readonly merchant_id: string;
  readonly amount_cents: number;
}
