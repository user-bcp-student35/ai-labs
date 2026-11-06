import { TestBed } from '@angular/core/testing';
import { STORAGE_KEYS } from '../config/app-config';
import { MerchantIdentityStore } from './merchant-identity.store';

describe('MerchantIdentityStore', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('guarda un id válido en sessionStorage', () => {
    const store = TestBed.inject(MerchantIdentityStore);
    expect(store.merchantId()).toBeNull();
    expect(store.set('  TEST-m1 ')).toBe(true);
    expect(store.merchantId()).toBe('TEST-m1');
    expect(sessionStorage.getItem(STORAGE_KEYS.merchantId)).toBe('TEST-m1');
  });

  it('rechaza ids que la API no aceptaría', () => {
    const store = TestBed.inject(MerchantIdentityStore);
    expect(store.set('')).toBe(false);
    expect(store.set('con espacio')).toBe(false);
    expect(store.set('a'.repeat(65))).toBe(false);
    expect(store.merchantId()).toBeNull();
  });

  it('restaura el id guardado y descarta valores inválidos', () => {
    sessionStorage.setItem(STORAGE_KEYS.merchantId, 'TEST-m2');
    expect(TestBed.inject(MerchantIdentityStore).merchantId()).toBe('TEST-m2');
    TestBed.resetTestingModule();
    sessionStorage.setItem(STORAGE_KEYS.merchantId, '<mal>');
    expect(TestBed.inject(MerchantIdentityStore).merchantId()).toBeNull();
  });

  it('clear borra el id', () => {
    const store = TestBed.inject(MerchantIdentityStore);
    store.set('TEST-m1');
    store.clear();
    expect(store.merchantId()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.merchantId)).toBeNull();
  });

  it('funciona en memoria si el almacenamiento falla', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const store = TestBed.inject(MerchantIdentityStore);
    expect(store.merchantId()).toBeNull();
    expect(store.set('TEST-m1')).toBe(true);
    expect(store.merchantId()).toBe('TEST-m1');
    store.clear();
    expect(store.merchantId()).toBeNull();
  });
});
