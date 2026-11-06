import { HttpErrorResponse } from '@angular/common/http';
import { MonoTypeOperatorFunction, catchError, throwError } from 'rxjs';

export type MerchantErrorKind = 'invalid-date-range' | 'unauthorized' | 'not-found' | 'network' | 'unknown';

export interface MerchantError {
  readonly kind: MerchantErrorKind;
  readonly status: number;
  /** Mensaje del servidor, solo si es un error de negocio con texto seguro (422 INVALID_DATE_RANGE). */
  readonly serverMessage: string | null;
}

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;
const INVALID_DATE_RANGE_CODE = 'INVALID_DATE_RANGE';

function detailOf(error: HttpErrorResponse): { code: string | null; message: string | null } {
  const body: unknown = error.error;
  if (typeof body !== 'object' || body === null) return { code: null, message: null };
  const detail: unknown = (body as Readonly<Record<string, unknown>>)['detail'];
  if (typeof detail !== 'object' || detail === null) return { code: null, message: null };
  const record = detail as Readonly<Record<string, unknown>>;
  return {
    code: typeof record['code'] === 'string' ? record['code'] : null,
    message: typeof record['message'] === 'string' ? record['message'] : null,
  };
}

export function toMerchantError(error: unknown): MerchantError {
  if (!(error instanceof HttpErrorResponse)) return { kind: 'unknown', status: 0, serverMessage: null };
  const { code, message } = detailOf(error);
  if (error.status === HTTP_UNPROCESSABLE && code === INVALID_DATE_RANGE_CODE) {
    return { kind: 'invalid-date-range', status: error.status, serverMessage: message };
  }
  if (error.status === HTTP_UNAUTHORIZED) return { kind: 'unauthorized', status: error.status, serverMessage: null };
  if (error.status === HTTP_NOT_FOUND) return { kind: 'not-found', status: error.status, serverMessage: null };
  if (error.status === 0) return { kind: 'network', status: 0, serverMessage: null };
  return { kind: 'unknown', status: error.status, serverMessage: null };
}

export function mapMerchantError<T>(): MonoTypeOperatorFunction<T> {
  return catchError((error: unknown) => throwError(() => toMerchantError(error)));
}
