import { Injectable, signal } from '@angular/core';
import { SAFE_ID_PATTERN, STORAGE_KEYS } from '../config/app-config';

/**
 * Comercio activo. PROVISIONAL: se indica a mano y se guarda en sessionStorage hasta que exista autenticación real
 * de comercio (mismo patrón provisional que la identidad del pagador, P-3).
 */
@Injectable({ providedIn: 'root' })
export class MerchantIdentityStore {
  private readonly current = signal<string | null>(this.read());
  readonly merchantId = this.current.asReadonly();

  static isValid(id: string): boolean {
    return SAFE_ID_PATTERN.test(id);
  }

  /** Devuelve false (sin cambiar nada) si el identificador no cumple el formato aceptado por la API. */
  set(id: string): boolean {
    const trimmed = id.trim();
    if (!MerchantIdentityStore.isValid(trimmed)) return false;
    this.current.set(trimmed);
    this.write(trimmed);
    return true;
  }

  clear(): void {
    this.current.set(null);
    this.write(null);
  }

  private read(): string | null {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEYS.merchantId);
      return stored !== null && MerchantIdentityStore.isValid(stored) ? stored : null;
    } catch {
      return null;
    }
  }

  private write(id: string | null): void {
    try {
      if (id === null) sessionStorage.removeItem(STORAGE_KEYS.merchantId);
      else sessionStorage.setItem(STORAGE_KEYS.merchantId, id);
    } catch {
      // Almacenamiento no disponible: la identidad queda solo en memoria.
    }
  }
}
