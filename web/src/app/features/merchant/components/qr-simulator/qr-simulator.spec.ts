import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { LiveAnnouncer } from '../../../../core/a11y/live-announcer';
import { MerchantIdentityStore } from '../../../../core/identity/merchant-identity.store';
import { MerchantApiService } from '../../data/merchant-api.service';
import { CreateQrPaymentRequest, QrPayment } from '../../data/merchant.models';
import { QrSimulator } from './qr-simulator';

const CREATED: QrPayment = {
  reference: 'REF-1',
  merchant_id: 'TEST-m1',
  amount_cents: 1050,
  status: 'PENDING',
  status_label: 'Pendiente',
  created_at: '2026-01-01T10:00:00Z',
  status_updated_at: '2026-01-01T10:00:00Z',
};

describe('QrSimulator', () => {
  const createQrPayment = vi.fn<(request: CreateQrPaymentRequest) => Observable<QrPayment>>();

  function render(merchantId: string | null = 'TEST-m1') {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: MerchantApiService, useValue: { createQrPayment } }] });
    if (merchantId !== null) TestBed.inject(MerchantIdentityStore).set(merchantId);
    const fixture = TestBed.createComponent(QrSimulator);
    const element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    fixture.detectChanges();
    const created = vi.fn();
    fixture.componentInstance.created.subscribe(created);
    return { fixture, element, created, announcer: TestBed.inject(LiveAnnouncer) };
  }

  function submit(element: HTMLElement, amount: string): void {
    const input = element.querySelector<HTMLInputElement>('#sim-amount')!;
    input.value = amount;
    input.dispatchEvent(new Event('input'));
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  beforeEach(() => createQrPayment.mockReset());
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('está rotulado como provisional', () => {
    expect(render().element.querySelector('h2')?.textContent).toContain('provisional');
  });

  it('sin comercio activo no ofrece el formulario', () => {
    const { element } = render(null);
    expect(element.querySelector('form')).toBeNull();
    expect(element.textContent).toContain('Indica primero el comercio activo');
  });

  it('valida el monto con mensaje, foco y aria-invalid', () => {
    const { fixture, element } = render();
    submit(element, 'abc');
    fixture.detectChanges();
    expect(createQrPayment).not.toHaveBeenCalled();
    expect(element.querySelector('#sim-amount-error')?.textContent).toContain('solo números');
    expect(element.querySelector('#sim-amount')?.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(element.querySelector('#sim-amount'));
  });

  it('crea el intento con el comercio activo y emite', () => {
    createQrPayment.mockReturnValue(of(CREATED));
    const { fixture, element, created, announcer } = render();
    submit(element, '10,50');
    fixture.detectChanges();
    expect(createQrPayment).toHaveBeenCalledWith({ merchant_id: 'TEST-m1', amount_cents: 1050 });
    expect(created).toHaveBeenCalledWith(CREATED);
    expect(announcer.message()).toContain('REF-1');
    expect(element.querySelector<HTMLInputElement>('#sim-amount')?.value).toBe('');
  });

  it('deshabilita el botón mientras envía y evita doble envío', () => {
    createQrPayment.mockReturnValue(new Subject<QrPayment>());
    const { fixture, element } = render();
    submit(element, '5');
    fixture.detectChanges();
    expect(element.querySelector('button')?.disabled).toBe(true);
    submit(element, '5');
    expect(createQrPayment).toHaveBeenCalledTimes(1);
  });

  it('ante error muestra mensaje y permite reintentar', () => {
    createQrPayment.mockReturnValue(throwError(() => ({ kind: 'unknown', status: 500, serverMessage: null })));
    const { fixture, element } = render();
    submit(element, '5');
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No pudimos crear');
    expect(element.querySelector('button')?.disabled).toBe(false);
  });
});
