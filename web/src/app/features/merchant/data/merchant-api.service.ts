import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_PATHS, APP_CONFIG } from '../../../core/config/app-config';
import { PAGE_SIZE } from '../merchant.config';
import { mapMerchantError } from './merchant-error';
import {
  AttemptHistory,
  CreateQrPaymentRequest,
  HistoryFilters,
  MerchantHistoryList,
  QrPayment,
  QrPaymentFilters,
  QrPaymentList,
  SimulateEventResult,
} from './merchant.models';

function withDateFilters(params: HttpParams, filters: HistoryFilters): HttpParams {
  let next = params;
  if (filters.reference !== '') next = next.set('reference', filters.reference);
  if (filters.dateFrom !== '') next = next.set('date_from', filters.dateFrom);
  if (filters.dateTo !== '') next = next.set('date_to', filters.dateTo);
  return next;
}

/**
 * Cobros QR del comercio. X-Merchant-Id lo agrega `merchantIdentityInterceptor` (solo rutas /merchant) y
 * X-Payer-Id (necesario para la creación provisional) `userIdentityInterceptor`.
 */
@Injectable({ providedIn: 'root' })
export class MerchantApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(APP_CONFIG).apiBaseUrl;
  private readonly url = `${this.base}${API_PATHS.merchantQrPayments}`;

  list(filters: QrPaymentFilters): Observable<QrPaymentList> {
    let params = withDateFilters(new HttpParams().set('limit', PAGE_SIZE), filters);
    if (filters.status !== '') params = params.set('status', filters.status);
    return this.http.get<QrPaymentList>(this.url, { params }).pipe(mapMerchantError());
  }

  /** Historial de cambios de estado del comercio, del más reciente al más antiguo. */
  history(filters: HistoryFilters, offset: number): Observable<MerchantHistoryList> {
    const params = withDateFilters(new HttpParams().set('limit', PAGE_SIZE).set('offset', offset), filters);
    return this.http
      .get<MerchantHistoryList>(`${this.base}${API_PATHS.merchantQrHistory}`, { params })
      .pipe(mapMerchantError());
  }

  /** Historial cronológico de un intento (404 si no es del comercio). */
  attemptHistory(reference: string): Observable<AttemptHistory> {
    return this.http
      .get<AttemptHistory>(`${this.base}${API_PATHS.merchantQrAttemptHistory(reference)}`)
      .pipe(mapMerchantError());
  }

  /** Solo demostración provisional: la API responde 404 si la demo no está habilitada. */
  simulateEvent(reference: string, status: string): Observable<SimulateEventResult> {
    return this.http
      .post<SimulateEventResult>(`${this.base}${API_PATHS.merchantQrSimulate(reference)}`, { status })
      .pipe(mapMerchantError());
  }

  /** Provisional (OQ-08): solo para la pantalla de simulación. */
  createQrPayment(request: CreateQrPaymentRequest): Observable<QrPayment> {
    return this.http.post<QrPayment>(this.url, request).pipe(mapMerchantError());
  }
}
