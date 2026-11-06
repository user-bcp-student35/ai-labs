/** Configuración provisional de la vista de cobros QR del comercio. */

/** Tamaño de página pedido a la API (1-200, por defecto 50). */
export const PAGE_SIZE = 50;

/** Piso de la actualización periódica: protege a la API si `reflect_deadline_seconds` llega muy bajo (OQ-28). */
export const MIN_POLL_SECONDS = 5;

/** Se usa si la API no entrega un plazo utilizable. */
export const FALLBACK_POLL_SECONDS = 30;

export interface StatusIndicator {
  /** Símbolo decorativo (aria-hidden): el significado siempre va también en texto. */
  readonly symbol: string;
  readonly cssClass: string;
}

/** Indicador por estado (OQ-24: el conjunto de estados MVP sigue abierto). Los desconocidos usan `UNKNOWN_INDICATOR`. */
export const STATUS_INDICATORS: Readonly<Record<string, StatusIndicator>> = {
  PENDING: { symbol: '…', cssClass: 'status--pending' },
  SUCCEEDED: { symbol: '✓', cssClass: 'status--succeeded' },
  FAILED: { symbol: '✕', cssClass: 'status--failed' },
  EXPIRED: { symbol: '⌛', cssClass: 'status--expired' },
};

export const UNKNOWN_INDICATOR: StatusIndicator = { symbol: '?', cssClass: 'status--unknown' };

export interface StatusOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Conjunto de estados MVP para el filtro y la simulación: ÚNICO lugar donde se define (OQ-24 abierta, provisional).
 * Las etiquetas son provisionales; las que muestra la lista siguen viniendo de la API.
 */
export const MVP_STATUS_OPTIONS: readonly StatusOption[] = [
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'SUCCEEDED', label: 'Pago exitoso' },
  { value: 'FAILED', label: 'Pago fallido' },
  { value: 'EXPIRED', label: 'Expirado' },
];

/** Pausa antes de volver a aceptar "Copiar referencia" como confirmación visual. */
export const COPIED_FEEDBACK_MS = 2000;

export const DATE_LOCALE = 'es-PE';
