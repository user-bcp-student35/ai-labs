import { DATE_LOCALE, FALLBACK_POLL_SECONDS, MIN_POLL_SECONDS } from '../merchant.config';
import { HistoryFilters, QrPayment, QrPaymentFilters } from '../data/merchant.models';
import { MERCHANT_COPY } from '../merchant.copy';

export const EMPTY_HISTORY_FILTERS: HistoryFilters = { reference: '', dateFrom: '', dateTo: '' };
export const EMPTY_FILTERS: QrPaymentFilters = { ...EMPTY_HISTORY_FILTERS, status: '' };

/** Las fechas YYYY-MM-DD se comparan como texto (orden lexicográfico = cronológico). */
export function isDateRangeValid(dateFrom: string, dateTo: string): boolean {
  return dateFrom === '' || dateTo === '' || dateFrom <= dateTo;
}

export function normalizeFilters<T extends HistoryFilters>(raw: T): T {
  return { ...raw, reference: raw.reference.trim() };
}

/** Mensaje comprensible del resultado de un evento simulado (resultado desconocido: texto genérico). */
export function simulateResultMessage(result: string): string {
  return MERCHANT_COPY.demoResults[result] ?? MERCHANT_COPY.demoResultUnknown;
}

export interface PageRange {
  readonly from: number;
  readonly to: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
}

/** Rango 1-based mostrado y disponibilidad de páginas vecinas, a partir de limit/offset/total de la API. */
export function pageRange(offset: number, count: number, total: number): PageRange {
  return {
    from: count === 0 ? 0 : offset + 1,
    to: offset + count,
    hasPrevious: offset > 0,
    hasNext: offset + count < total,
  };
}

/** Segundos entre actualizaciones: el plazo de la API con un piso razonable. */
export function pollSeconds(reflectDeadlineSeconds: number): number {
  if (!Number.isFinite(reflectDeadlineSeconds) || reflectDeadlineSeconds <= 0) return FALLBACK_POLL_SECONDS;
  return Math.max(MIN_POLL_SECONDS, Math.ceil(reflectDeadlineSeconds));
}

const dateTimeFormat = new Intl.DateTimeFormat(DATE_LOCALE, { dateStyle: 'short', timeStyle: 'short' });

/** Fecha y hora local del navegador (zona horaria definitiva: OQ-27). Si no se puede interpretar, devuelve el texto original. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormat.format(date);
}

export interface ChangedPayment {
  readonly reference: string;
  readonly label: string;
}

/** Intentos presentes en ambas listas cuyo estado cambió. Los nuevos o ausentes no cuentan como cambio. */
export function detectStatusChanges(previous: readonly QrPayment[], next: readonly QrPayment[]): readonly ChangedPayment[] {
  const before = new Map(previous.map((item) => [item.reference, item.status]));
  return next
    .filter((item) => before.has(item.reference) && before.get(item.reference) !== item.status)
    .map((item) => ({ reference: item.reference, label: item.status_label }));
}
