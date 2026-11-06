import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { LiveAnnouncer } from '../../../../core/a11y/live-announcer';
import { MerchantIdentityStore } from '../../../../core/identity/merchant-identity.store';
import { MerchantApiService } from '../../data/merchant-api.service';
import { MerchantError } from '../../data/merchant-error';
import {
  AttemptHistory,
  QrPayment,
  QrPaymentFilters,
  QrPaymentList,
  SimulateEventResult,
} from '../../data/merchant.models';
import { MerchantAttemptPage } from './merchant-attempt-page';

function payment(status = 'PENDING', label = 'Pendiente'): QrPayment {
  return {
    reference: 'REF-1',
    merchant_id: 'TEST-m1',
    amount_cents: 1050,
    status,
    status_label: label,
    created_at: '2026-01-01T10:00:00Z',
    status_updated_at: '2026-01-01T10:05:00Z',
  };
}

function listOf(item: QrPayment | null, demo: boolean, deadline = 30): QrPaymentList {
  return {
    merchant_id: 'TEST-m1',
    items: item === null ? [] : [item],
    total: item === null ? 0 : 1,
    limit: 50,
    offset: 0,
    has_results: item !== null,
    message: null,
    reflect_deadline_seconds: deadline,
    demo_enabled: demo,
  };
}

function historyOf(count: number): AttemptHistory {
  return {
    reference: 'REF-1',
    merchant_id: 'TEST-m1',
    items: Array.from({ length: count }, (_, i) => ({
      previous_status: i === 0 ? 'PENDING' : 'SUCCEEDED',
      previous_status_label: i === 0 ? 'Pendiente' : 'Pago exitoso',
      status: i === 0 ? 'SUCCEEDED' : 'FAILED',
      status_label: i === 0 ? 'Pago exitoso' : 'Pago fallido',
      occurred_at: '2026-01-01T10:05:00Z',
      received_at: '2026-01-01T10:05:01Z',
    })),
  };
}

describe('MerchantAttemptPage', () => {
  const attemptHistory = vi.fn<(reference: string) => Observable<AttemptHistory>>();
  const list = vi.fn<(filters: QrPaymentFilters) => Observable<QrPaymentList>>();
  const simulateEvent = vi.fn<(reference: string, status: string) => Observable<SimulateEventResult>>();

  function render(merchantId: string | null = 'TEST-m1') {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MerchantApiService, useValue: { attemptHistory, list, simulateEvent } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ reference: 'REF-1' }) } } },
      ],
    });
    if (merchantId !== null) TestBed.inject(MerchantIdentityStore).set(merchantId);
    const fixture = TestBed.createComponent(MerchantAttemptPage);
    const element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    fixture.detectChanges();
    return { fixture, element, announcer: TestBed.inject(LiveAnnouncer) };
  }

  beforeEach(() => {
    attemptHistory.mockReset();
    list.mockReset();
    simulateEvent.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('sin comercio activo pide indicarlo y no consulta', () => {
    const { element } = render(null);
    expect(element.textContent).toContain('Indica tu comercio');
    expect(attemptHistory).not.toHaveBeenCalled();
  });

  it('muestra carga y luego referencia, estado actual, monto y línea de tiempo', async () => {
    attemptHistory.mockReturnValue(new Subject<AttemptHistory>());
    list.mockReturnValue(of(listOf(payment(), false)));
    expect(render().element.querySelector('[role="status"]')?.textContent).toContain('Cargando historial del cobro');

    TestBed.resetTestingModule();
    attemptHistory.mockReturnValue(of(historyOf(2)));
    const { fixture, element } = render();
    await fixture.whenStable();
    expect(element.querySelector('h1')?.textContent).toContain('Historial del cobro');
    expect(element.querySelector('code')?.textContent).toBe('REF-1');
    expect(list).toHaveBeenCalledWith({ reference: 'REF-1', dateFrom: '', dateTo: '', status: '' });
    expect(element.textContent).toContain('S/ 10.50');
    const items = element.querySelectorAll('ol.timeline li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Ocurrió');
    expect(items[0].textContent).toContain('Recibido');
    expect(items[0].querySelectorAll('app-status-badge')).toHaveLength(2);
    expect(document.activeElement).toBe(element.querySelector('h1'));
    expect(element.querySelector('app-provider-event-simulator')).toBeNull();
  });

  it('estado vacío si no hubo cambios', async () => {
    attemptHistory.mockReturnValue(of(historyOf(0)));
    list.mockReturnValue(of(listOf(payment(), false)));
    const { fixture, element } = render();
    await fixture.whenStable();
    expect(element.textContent).toContain('todavía no tuvo cambios de estado');
    expect(element.querySelector('ol')).toBeNull();
  });

  it('404 muestra un mensaje amistoso con la acción de volver', async () => {
    attemptHistory.mockReturnValue(throwError(() => ({ kind: 'not-found', status: 404, serverMessage: null }) as MerchantError));
    list.mockReturnValue(of(listOf(null, false)));
    const { fixture, element, announcer } = render();
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No encontramos ese cobro');
    expect(announcer.message()).toContain('No encontramos ese cobro');
    expect(Array.from(element.querySelectorAll('a')).some((a) => a.textContent?.includes('Volver a Cobros'))).toBe(true);
    expect(element.textContent).not.toContain('QR_PAYMENT_NOT_FOUND');
  });

  it('error genérico y 401 muestran mensaje y permiten reintentar', async () => {
    attemptHistory.mockReturnValueOnce(throwError(() => ({ kind: 'network', status: 0, serverMessage: null }) as MerchantError));
    list.mockReturnValue(of(listOf(payment(), false)));
    const { fixture, element } = render();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar el historial del cobro');
    attemptHistory.mockReturnValueOnce(throwError(() => ({ kind: 'unauthorized', status: 401, serverMessage: null }) as MerchantError));
    Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Reintentar')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('identificar tu comercio');
    attemptHistory.mockReturnValueOnce(of(historyOf(1)));
    Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Reintentar')!.click();
    fixture.detectChanges();
    expect(element.querySelectorAll('ol.timeline li')).toHaveLength(1);
  });

  it('si la lista falla igual muestra el historial, sin estado actual ni demo', async () => {
    attemptHistory.mockReturnValue(of(historyOf(1)));
    list.mockReturnValue(throwError(() => ({ kind: 'network', status: 0, serverMessage: null }) as MerchantError));
    const { fixture, element } = render();
    await fixture.whenStable();
    expect(element.querySelectorAll('ol.timeline li')).toHaveLength(1);
    expect(element.querySelector('dl')).toBeNull();
    expect(element.querySelector('app-provider-event-simulator')).toBeNull();
  });

  describe('demostración', () => {
    it('muestra los controles solo con demo_enabled y recarga tras simular', async () => {
      attemptHistory.mockReturnValueOnce(of(historyOf(0)));
      list.mockReturnValueOnce(of(listOf(payment(), true)));
      const { fixture, element, announcer } = render();
      await fixture.whenStable();
      expect(element.querySelector('app-provider-event-simulator')).not.toBeNull();

      simulateEvent.mockReturnValue(of({ result: 'APPLIED', payment: payment('SUCCEEDED', 'Pago exitoso') }));
      attemptHistory.mockReturnValueOnce(of(historyOf(1)));
      list.mockReturnValueOnce(of(listOf(payment('SUCCEEDED', 'Pago exitoso'), true)));
      const select = element.querySelector<HTMLSelectElement>('#demo-status')!;
      select.value = 'SUCCEEDED';
      select.dispatchEvent(new Event('change'));
      element.querySelector('app-provider-event-simulator form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      expect(simulateEvent).toHaveBeenCalledWith('REF-1', 'SUCCEEDED');
      expect(element.querySelectorAll('ol.timeline li')).toHaveLength(1);
      expect(element.querySelector('dl .status--succeeded')).not.toBeNull();
      expect(announcer.message()).toContain('Evento aplicado');
      expect(element.querySelector('app-provider-event-simulator [role="status"]')?.textContent).toContain('Evento aplicado');
    });
  });

  describe('refresco periódico', () => {
    it('recarga según reflect_deadline_seconds y anuncia nuevos cambios', () => {
      vi.useFakeTimers();
      attemptHistory.mockReturnValueOnce(of(historyOf(0)));
      list.mockReturnValueOnce(of(listOf(payment(), false, 10)));
      const { fixture, element, announcer } = render();
      fixture.detectChanges();
      attemptHistory.mockReturnValueOnce(of(historyOf(1)));
      list.mockReturnValueOnce(of(listOf(payment('SUCCEEDED', 'Pago exitoso'), false, 10)));
      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(attemptHistory).toHaveBeenCalledTimes(2);
      expect(element.querySelectorAll('ol.timeline li')).toHaveLength(1);
      expect(announcer.message()).toContain('nuevos cambios');
    });

    it('si falla conserva lo mostrado y avisa; se detiene al destruir', () => {
      vi.useFakeTimers();
      attemptHistory.mockReturnValueOnce(of(historyOf(1)));
      list.mockReturnValueOnce(of(listOf(payment(), false, 10)));
      const { fixture, element } = render();
      fixture.detectChanges();
      attemptHistory.mockReturnValueOnce(throwError(() => ({ kind: 'network', status: 0, serverMessage: null }) as MerchantError));
      list.mockReturnValue(of(listOf(payment(), false, 10)));
      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(element.querySelectorAll('ol.timeline li')).toHaveLength(1);
      expect(element.textContent).toContain('No pudimos actualizar el cobro');
      fixture.destroy();
      vi.advanceTimersByTime(60_000);
      expect(attemptHistory).toHaveBeenCalledTimes(2);
    });

    it('usa el plazo de respaldo si la lista no está disponible y no solapa consultas', () => {
      vi.useFakeTimers();
      attemptHistory.mockReturnValueOnce(of(historyOf(1)));
      list.mockReturnValueOnce(throwError(() => ({ kind: 'network', status: 0, serverMessage: null }) as MerchantError));
      const { fixture } = render();
      fixture.detectChanges();
      attemptHistory.mockReturnValue(new Subject<AttemptHistory>());
      list.mockReturnValue(of(listOf(payment(), false)));
      vi.advanceTimersByTime(29_000);
      expect(attemptHistory).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(61_000);
      expect(attemptHistory).toHaveBeenCalledTimes(2);
    });
  });
});
