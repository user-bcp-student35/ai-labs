import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { MerchantIdentityStore } from '../identity/merchant-identity.store';
import { merchantIdentityInterceptor } from './merchant-identity.interceptor';
import { userIdentityInterceptor } from './user-identity.interceptor';

const TEST_CONFIG: AppConfig = { apiBaseUrl: '/wallet-api', testUserId: 'TEST-user-spec' };

describe('merchantIdentityInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let store: MerchantIdentityStore;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: TEST_CONFIG },
        provideHttpClient(withInterceptors([userIdentityInterceptor, merchantIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    store = TestBed.inject(MerchantIdentityStore);
  });

  afterEach(() => controller.verify());

  it('agrega X-Merchant-Id a las rutas /merchant y conserva X-Payer-Id', () => {
    store.set('TEST-merchant-1');
    http.get('/wallet-api/merchant/qr-payments').subscribe();
    const request = controller.expectOne('/wallet-api/merchant/qr-payments');
    expect(request.request.headers.get('X-Merchant-Id')).toBe('TEST-merchant-1');
    expect(request.request.headers.get('X-Payer-Id')).toBe('TEST-user-spec');
    request.flush({});
  });

  it('no agrega X-Merchant-Id a las rutas del pagador', () => {
    store.set('TEST-merchant-1');
    http.get('/wallet-api/payments').subscribe();
    const request = controller.expectOne('/wallet-api/payments');
    expect(request.request.headers.has('X-Merchant-Id')).toBe(false);
    expect(request.request.headers.get('X-Payer-Id')).toBe('TEST-user-spec');
    request.flush({});
  });

  it('no confunde rutas con prefijo parecido', () => {
    store.set('TEST-merchant-1');
    http.get('/wallet-api/merchants-other').subscribe();
    const request = controller.expectOne('/wallet-api/merchants-other');
    expect(request.request.headers.has('X-Merchant-Id')).toBe(false);
    request.flush({});
  });

  it('sin comercio activo no envía el encabezado', () => {
    http.get('/wallet-api/merchant/qr-payments').subscribe();
    const request = controller.expectOne('/wallet-api/merchant/qr-payments');
    expect(request.request.headers.has('X-Merchant-Id')).toBe(false);
    request.flush({});
  });
});
