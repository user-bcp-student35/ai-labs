import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { MerchantError, toMerchantError } from './merchant-error';
import { MerchantApiService } from './merchant-api.service';

describe('MerchantApiService', () => {
  let service: MerchantApiService;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: { apiBaseUrl: '/wallet-api', testUserId: 'TEST-u' } },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(MerchantApiService);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('lista con solo el límite si no hay filtros', () => {
    service.list({ reference: '', dateFrom: '', dateTo: '', status: '' }).subscribe();
    const request = controller.expectOne((req) => req.url === '/wallet-api/merchant/qr-payments');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual(['limit']);
    request.flush({});
  });

  it('envía el filtro de estado', () => {
    service.list({ reference: '', dateFrom: '', dateTo: '', status: 'FAILED' }).subscribe();
    const request = controller.expectOne((req) => req.url === '/wallet-api/merchant/qr-payments');
    expect(request.request.params.get('status')).toBe('FAILED');
    request.flush({});
  });

  it('consulta el historial del comercio con filtros y paginación', () => {
    service.history({ reference: 'R1', dateFrom: '2026-01-01', dateTo: '2026-01-31' }, 50).subscribe();
    const request = controller.expectOne((req) => req.url === '/wallet-api/merchant/qr-payments/history');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('reference')).toBe('R1');
    expect(request.request.params.get('date_from')).toBe('2026-01-01');
    expect(request.request.params.get('date_to')).toBe('2026-01-31');
    expect(request.request.params.get('offset')).toBe('50');
    expect(request.request.params.get('limit')).toBe('50');
    request.flush({});
  });

  it('consulta el historial de un intento codificando la referencia', () => {
    service.attemptHistory('A/B').subscribe();
    const request = controller.expectOne('/wallet-api/merchant/qr-payments/A%2FB/history');
    expect(request.request.method).toBe('GET');
    request.flush({});
  });

  it('simula un evento con POST y el estado en el cuerpo', () => {
    service.simulateEvent('R1', 'SUCCEEDED').subscribe();
    const request = controller.expectOne('/wallet-api/merchant/qr-payments/R1/simulate-event');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ status: 'SUCCEEDED' });
    request.flush({});
  });

  it('traduce el 404 a not-found', () => {
    let error: MerchantError | undefined;
    service.attemptHistory('X').subscribe({ error: (e: MerchantError) => (error = e) });
    controller
      .expectOne('/wallet-api/merchant/qr-payments/X/history')
      .flush({ detail: { code: 'QR_PAYMENT_NOT_FOUND', message: 'm' } }, { status: 404, statusText: 'Not Found' });
    expect(error?.kind).toBe('not-found');
  });

  it('envía los filtros combinados con los nombres de la API', () => {
    service.list({ reference: 'R1', dateFrom: '2026-01-01', dateTo: '2026-01-31', status: '' }).subscribe();
    const request = controller.expectOne((req) => req.url === '/wallet-api/merchant/qr-payments');
    expect(request.request.params.get('reference')).toBe('R1');
    expect(request.request.params.get('date_from')).toBe('2026-01-01');
    expect(request.request.params.get('date_to')).toBe('2026-01-31');
    request.flush({});
  });

  it('crea el intento provisional con POST', () => {
    service.createQrPayment({ merchant_id: 'm', amount_cents: 1050 }).subscribe();
    const request = controller.expectOne('/wallet-api/merchant/qr-payments');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ merchant_id: 'm', amount_cents: 1050 });
    request.flush({});
  });

  it('traduce el 422 de rango de fechas', () => {
    let error: MerchantError | undefined;
    service.list({ reference: '', dateFrom: 'b', dateTo: 'a', status: '' }).subscribe({ error: (e: MerchantError) => (error = e) });
    controller
      .expectOne((req) => req.url === '/wallet-api/merchant/qr-payments')
      .flush(
        { detail: { code: 'INVALID_DATE_RANGE', message: 'La fecha inicial no puede ser posterior a la final.' } },
        { status: 422, statusText: 'Unprocessable' },
      );
    expect(error).toEqual({
      kind: 'invalid-date-range',
      status: 422,
      serverMessage: 'La fecha inicial no puede ser posterior a la final.',
    });
  });
});

describe('toMerchantError', () => {
  it('clasifica 401, red y otros', () => {
    expect(toMerchantError(new HttpErrorResponse({ status: 401 })).kind).toBe('unauthorized');
    expect(toMerchantError(new HttpErrorResponse({ status: 0 })).kind).toBe('network');
    expect(toMerchantError(new HttpErrorResponse({ status: 500, error: 'texto' })).kind).toBe('unknown');
    expect(toMerchantError(new HttpErrorResponse({ status: 422, error: { detail: 'x' } })).kind).toBe('unknown');
    expect(toMerchantError(new Error('x')).kind).toBe('unknown');
  });
});
