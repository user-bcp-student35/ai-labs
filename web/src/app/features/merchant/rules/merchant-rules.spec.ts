import { QrPayment } from '../data/merchant.models';
import { MERCHANT_COPY } from '../merchant.copy';
import {
  EMPTY_FILTERS,
  EMPTY_HISTORY_FILTERS,
  detectStatusChanges,
  formatDateTime,
  isDateRangeValid,
  normalizeFilters,
  pageRange,
  pollSeconds,
  simulateResultMessage,
} from './merchant-rules';

function payment(reference: string, status: string, label = status): QrPayment {
  return {
    reference,
    merchant_id: 'm',
    amount_cents: 100,
    status,
    status_label: label,
    created_at: '2026-01-01T10:00:00Z',
    status_updated_at: '2026-01-01T10:00:00Z',
  };
}

describe('merchant-rules', () => {
  it('valida el rango de fechas', () => {
    expect(isDateRangeValid('', '')).toBe(true);
    expect(isDateRangeValid('2026-01-02', '')).toBe(true);
    expect(isDateRangeValid('', '2026-01-02')).toBe(true);
    expect(isDateRangeValid('2026-01-02', '2026-01-02')).toBe(true);
    expect(isDateRangeValid('2026-01-03', '2026-01-02')).toBe(false);
  });

  it('normaliza la referencia', () => {
    expect(normalizeFilters({ reference: '  R1 ', dateFrom: 'a', dateTo: 'b' })).toEqual({
      reference: 'R1',
      dateFrom: 'a',
      dateTo: 'b',
    });
  });

  it('conserva el estado al normalizar y expone filtros vacíos', () => {
    expect(normalizeFilters({ ...EMPTY_FILTERS, reference: ' R ', status: 'FAILED' })).toEqual({
      reference: 'R',
      dateFrom: '',
      dateTo: '',
      status: 'FAILED',
    });
    expect(EMPTY_HISTORY_FILTERS).toEqual({ reference: '', dateFrom: '', dateTo: '' });
  });

  it('traduce el resultado de la simulación y tolera resultados desconocidos', () => {
    for (const result of ['APPLIED', 'DUPLICATE', 'OUT_OF_ORDER', 'ALREADY_TERMINAL', 'UNMAPPED_STATUS']) {
      expect(simulateResultMessage(result)).toBe(MERCHANT_COPY.demoResults[result]);
    }
    expect(simulateResultMessage('OTRO')).toBe(MERCHANT_COPY.demoResultUnknown);
  });

  it('calcula el rango de página', () => {
    expect(pageRange(0, 0, 0)).toEqual({ from: 0, to: 0, hasPrevious: false, hasNext: false });
    expect(pageRange(0, 50, 120)).toEqual({ from: 1, to: 50, hasPrevious: false, hasNext: true });
    expect(pageRange(100, 20, 120)).toEqual({ from: 101, to: 120, hasPrevious: true, hasNext: false });
  });

  it('aplica piso y respaldo al intervalo de actualización', () => {
    expect(pollSeconds(30)).toBe(30);
    expect(pollSeconds(1)).toBe(5);
    expect(pollSeconds(7.2)).toBe(8);
    expect(pollSeconds(0)).toBe(30);
    expect(pollSeconds(Number.NaN)).toBe(30);
  });

  it('formatea fechas y tolera valores inválidos', () => {
    expect(formatDateTime('2026-01-01T10:00:00Z')).not.toBe('2026-01-01T10:00:00Z');
    expect(formatDateTime('no-fecha')).toBe('no-fecha');
  });

  it('detecta solo cambios de estado en intentos existentes', () => {
    const before = [payment('A', 'PENDING'), payment('B', 'PENDING')];
    const after = [payment('A', 'SUCCEEDED', 'Pago exitoso'), payment('B', 'PENDING'), payment('C', 'PENDING')];
    expect(detectStatusChanges(before, after)).toEqual([{ reference: 'A', label: 'Pago exitoso' }]);
    expect(detectStatusChanges([], after)).toEqual([]);
  });
});
