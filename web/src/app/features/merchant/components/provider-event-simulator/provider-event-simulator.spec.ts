import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { LiveAnnouncer } from '../../../../core/a11y/live-announcer';
import { MerchantApiService } from '../../data/merchant-api.service';
import { MerchantError } from '../../data/merchant-error';
import { SimulateEventResult } from '../../data/merchant.models';
import { ProviderEventSimulator } from './provider-event-simulator';

const RESULT: SimulateEventResult = {
  result: 'APPLIED',
  payment: {
    reference: 'REF-1',
    merchant_id: 'm',
    amount_cents: 100,
    status: 'SUCCEEDED',
    status_label: 'Pago exitoso',
    created_at: '2026-01-01T10:00:00Z',
    status_updated_at: '2026-01-01T10:00:00Z',
  },
};

describe('ProviderEventSimulator', () => {
  const simulateEvent = vi.fn<(reference: string, status: string) => Observable<SimulateEventResult>>();

  function render() {
    TestBed.configureTestingModule({ providers: [{ provide: MerchantApiService, useValue: { simulateEvent } }] });
    const fixture = TestBed.createComponent(ProviderEventSimulator);
    fixture.componentRef.setInput('reference', 'REF-1');
    const emitted: SimulateEventResult[] = [];
    fixture.componentInstance.simulated.subscribe((r) => emitted.push(r));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, emitted, announcer: TestBed.inject(LiveAnnouncer) };
  }

  function submit(element: HTMLElement, status?: string): void {
    const select = element.querySelector<HTMLSelectElement>('#demo-status')!;
    if (status !== undefined) {
      select.value = status;
      select.dispatchEvent(new Event('change'));
    }
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  beforeEach(() => simulateEvent.mockReset());

  it('ofrece los 4 estados MVP con etiqueta asociada', () => {
    const { element } = render();
    expect(element.querySelector('label[for="demo-status"]')).not.toBeNull();
    expect(Array.from(element.querySelectorAll('option')).map((o) => o.value)).toEqual([
      'PENDING',
      'SUCCEEDED',
      'FAILED',
      'EXPIRED',
    ]);
    expect(element.textContent).toContain('Simular evento del proveedor (provisional)');
  });

  it('envía el estado elegido, muestra y anuncia el resultado y emite', () => {
    simulateEvent.mockReturnValue(of(RESULT));
    const { fixture, element, emitted, announcer } = render();
    submit(element, 'SUCCEEDED');
    fixture.detectChanges();
    expect(simulateEvent).toHaveBeenCalledWith('REF-1', 'SUCCEEDED');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Evento aplicado');
    expect(announcer.message()).toContain('Evento aplicado');
    expect(emitted).toEqual([RESULT]);
  });

  it('muestra un mensaje distinto por cada resultado', () => {
    const { fixture, element } = render();
    for (const [result, text] of [
      ['DUPLICATE', 'duplicado'],
      ['OUT_OF_ORDER', 'fuera de orden'],
      ['ALREADY_TERMINAL', 'estado final'],
      ['UNMAPPED_STATUS', 'no reconocido'],
    ]) {
      simulateEvent.mockReturnValueOnce(of({ ...RESULT, result }));
      submit(element);
      fixture.detectChanges();
      expect(element.querySelector('[role="status"]')?.textContent).toContain(text);
    }
  });

  it('deshabilita el botón mientras hay una solicitud y no envía dos veces', () => {
    const pending = new Subject<SimulateEventResult>();
    simulateEvent.mockReturnValue(pending);
    const { fixture, element } = render();
    submit(element);
    submit(element);
    fixture.detectChanges();
    expect(simulateEvent).toHaveBeenCalledTimes(1);
    expect(element.querySelector('button')?.disabled).toBe(true);
    expect(element.querySelector('button')?.textContent).toContain('Simulando');
  });

  it('un 404 indica que la simulación no está disponible y otros fallos un mensaje genérico', () => {
    const { fixture, element, emitted } = render();
    simulateEvent.mockReturnValueOnce(throwError(() => ({ kind: 'not-found', status: 404, serverMessage: null }) as MerchantError));
    submit(element);
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('no está disponible');
    simulateEvent.mockReturnValueOnce(throwError(() => ({ kind: 'network', status: 0, serverMessage: null }) as MerchantError));
    submit(element);
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No pudimos simular');
    expect(emitted).toEqual([]);
  });
});
