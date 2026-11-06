import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { LiveAnnouncer } from '../../../../core/a11y/live-announcer';
import { MerchantIdentityStore } from '../../../../core/identity/merchant-identity.store';
import { MerchantApiService } from '../../data/merchant-api.service';
import { MerchantError } from '../../data/merchant-error';
import { QrPayment, QrPaymentFilters, QrPaymentList } from '../../data/merchant.models';
import { MerchantPaymentsPage } from './merchant-payments-page';

function payment(reference: string, status = 'PENDING', label = 'Pendiente'): QrPayment {
  return {
    reference,
    merchant_id: 'TEST-m1',
    amount_cents: 1050,
    status,
    status_label: label,
    created_at: '2026-01-01T10:00:00Z',
    status_updated_at: '2026-01-01T10:05:00Z',
  };
}

function listOf(items: readonly QrPayment[], deadline = 30): QrPaymentList {
  return {
    merchant_id: 'TEST-m1',
    items,
    total: items.length,
    limit: 50,
    offset: 0,
    has_results: items.length > 0,
    message: items.length > 0 ? null : 'No hay resultados para los filtros aplicados.',
    reflect_deadline_seconds: deadline,
    demo_enabled: false,
  };
}

describe('MerchantPaymentsPage', () => {
  const list = vi.fn<(filters: QrPaymentFilters) => Observable<QrPaymentList>>();
  const createQrPayment = vi.fn();

  function render(merchantId: string | null = 'TEST-m1') {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MerchantApiService, useValue: { list, createQrPayment } }],
    });
    if (merchantId !== null) TestBed.inject(MerchantIdentityStore).set(merchantId);
    const fixture = TestBed.createComponent(MerchantPaymentsPage);
    const element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    fixture.detectChanges();
    return { fixture, element, announcer: TestBed.inject(LiveAnnouncer) };
  }

  function type(element: HTMLElement, selector: string, value: string): void {
    const input = element.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function click(element: HTMLElement, text: string): void {
    const button = Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
    button.click();
  }

  beforeEach(() => {
    list.mockReset();
    createQrPayment.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('sin comercio activo pide indicarlo y no consulta', () => {
    const { element } = render(null);
    expect(element.textContent).toContain('Indica tu comercio');
    expect(list).not.toHaveBeenCalled();
    expect(element.querySelector('table')).toBeNull();
  });

  it('muestra el estado de carga', () => {
    list.mockReturnValue(new Subject<QrPaymentList>());
    expect(render().element.querySelector('[role="status"]')?.textContent).toContain('Cargando');
  });

  it('muestra una tabla semántica con referencia, monto, estado con símbolo y fechas', async () => {
    list.mockReturnValue(of(listOf([payment('REF-1'), payment('REF-2', 'SUCCEEDED', 'Pago exitoso')])));
    const { fixture, element } = render();
    await fixture.whenStable();
    expect(element.querySelectorAll('thead th[scope="col"]')).toHaveLength(6);
    const rows = element.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('th[scope="row"] code')?.textContent).toBe('REF-1');
    expect(rows[0].textContent).toContain('S/ 10.50');
    expect(rows[0].textContent).toContain('Pendiente');
    expect(rows[1].querySelector('.status--succeeded')?.textContent).toContain('Pago exitoso');
    expect(rows[1].querySelector('[aria-hidden="true"]')?.textContent).toBe('✓');
    expect(element.textContent).toContain('Se actualiza automáticamente cada 30 segundos');
    expect(document.activeElement).toBe(element.querySelector('h1'));
  });

  it('un estado desconocido usa el indicador genérico y no queda vacío', async () => {
    list.mockReturnValue(of(listOf([payment('REF-1', 'MISTERIO', '')])));
    const { fixture, element } = render();
    await fixture.whenStable();
    expect(element.querySelector('.status--unknown')?.textContent).toContain('Estado en revisión');
  });

  it('muestra el estado vacío sin filtros', async () => {
    list.mockReturnValue(of(listOf([])));
    const { fixture, element } = render();
    await fixture.whenStable();
    expect(element.textContent).toContain('Todavía no hay intentos');
  });

  it('muestra "sin resultados" con filtros y los envía combinados', async () => {
    list.mockReturnValueOnce(of(listOf([payment('REF-1')])));
    const { fixture, element, announcer } = render();
    await fixture.whenStable();
    list.mockReturnValueOnce(of(listOf([])));
    type(element, '#filter-reference', ' REF-9 ');
    type(element, '#filter-date-from', '2026-01-01');
    type(element, '#filter-date-to', '2026-01-31');
    click(element, 'Aplicar filtros');
    fixture.detectChanges();
    expect(list).toHaveBeenLastCalledWith({ reference: 'REF-9', dateFrom: '2026-01-01', dateTo: '2026-01-31', status: '' });
    expect(element.textContent).toContain('No hay resultados para los filtros aplicados.');
    expect(element.textContent).toContain('Prueba con otros filtros');
    expect(announcer.message()).toContain('No hay resultados');
  });

  it('valida localmente fecha inicial <= final sin llamar a la API', async () => {
    list.mockReturnValue(of(listOf([payment('REF-1')])));
    const { fixture, element } = render();
    await fixture.whenStable();
    list.mockClear();
    type(element, '#filter-date-from', '2026-02-01');
    type(element, '#filter-date-to', '2026-01-01');
    click(element, 'Aplicar filtros');
    fixture.detectChanges();
    expect(list).not.toHaveBeenCalled();
    expect(element.querySelector('#date-error')?.textContent).toContain('no puede ser posterior');
    expect(element.querySelector('#filter-date-from')?.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(element.querySelector('#filter-date-from'));
  });

  it('muestra el 422 del servidor conservando la lista', async () => {
    list.mockReturnValueOnce(of(listOf([payment('REF-1')])));
    const { fixture, element } = render();
    await fixture.whenStable();
    const error: MerchantError = { kind: 'invalid-date-range', status: 422, serverMessage: 'Rango inválido del servidor.' };
    list.mockReturnValueOnce(throwError(() => error));
    click(element, 'Aplicar filtros');
    fixture.detectChanges();
    expect(element.querySelector('#date-error')?.textContent).toContain('Rango inválido del servidor.');
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('el 422 sin mensaje usa el texto local', async () => {
    list.mockReturnValueOnce(of(listOf([payment('REF-1')])));
    const { fixture, element } = render();
    await fixture.whenStable();
    list.mockReturnValueOnce(throwError(() => ({ kind: 'invalid-date-range', status: 422, serverMessage: null })));
    click(element, 'Aplicar filtros');
    fixture.detectChanges();
    expect(element.querySelector('#date-error')?.textContent).toContain('no puede ser posterior');
  });

  it('filtra por estado y ofrece el acceso "Ver historial" por fila', async () => {
    list.mockReturnValueOnce(of(listOf([payment('REF-1')])));
    const { fixture, element } = render();
    await fixture.whenStable();
    const options = Array.from(element.querySelectorAll<HTMLOptionElement>('#filter-status option')).map((o) => o.value);
    expect(options).toEqual(['', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED']);
    const link = element.querySelector<HTMLAnchorElement>('tbody a.row-link')!;
    expect(link.getAttribute('href')).toBe('/merchant/REF-1');
    expect(link.getAttribute('aria-label')).toContain('REF-1');
    list.mockReturnValueOnce(of(listOf([])));
    const select = element.querySelector<HTMLSelectElement>('#filter-status')!;
    select.value = 'FAILED';
    select.dispatchEvent(new Event('change'));
    click(element, 'Aplicar filtros');
    fixture.detectChanges();
    expect(list).toHaveBeenLastCalledWith({ reference: '', dateFrom: '', dateTo: '', status: 'FAILED' });
    expect(element.textContent).toContain('Prueba con otros filtros');
  });

  it('limpiar vuelve a consultar sin filtros', async () => {
    list.mockReturnValue(of(listOf([payment('REF-1')])));
    const { fixture, element } = render();
    await fixture.whenStable();
    type(element, '#filter-reference', 'X');
    click(element, 'Limpiar filtros');
    fixture.detectChanges();
    expect(list).toHaveBeenLastCalledWith({ reference: '', dateFrom: '', dateTo: '', status: '' });
    expect(element.querySelector<HTMLInputElement>('#filter-reference')?.value).toBe('');
  });

  it('error: muestra mensaje y reintenta', async () => {
    list.mockReturnValueOnce(throwError(() => ({ kind: 'network', status: 0, serverMessage: null })));
    const { fixture, element } = render();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar');
    list.mockReturnValueOnce(of(listOf([payment('REF-1')])));
    click(element, 'Reintentar');
    fixture.detectChanges();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('401 muestra el mensaje de identidad', () => {
    list.mockReturnValue(throwError(() => ({ kind: 'unauthorized', status: 401, serverMessage: null })));
    expect(render().element.querySelector('[role="alert"]')?.textContent).toContain('identificar tu comercio');
  });

  describe('actualización periódica', () => {
    it('consulta cada reflect_deadline_seconds, anuncia cambios y conserva los filtros en edición', async () => {
      vi.useFakeTimers();
      list.mockReturnValueOnce(of(listOf([payment('REF-1')], 10)));
      const { fixture, element, announcer } = render();
      fixture.detectChanges();
      type(element, '#filter-reference', 'borrador');
      (element.querySelector('#filter-reference') as HTMLInputElement).focus();
      list.mockReturnValueOnce(of(listOf([payment('REF-1', 'SUCCEEDED', 'Pago exitoso')], 10)));
      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(list).toHaveBeenCalledTimes(2);
      expect(announcer.message()).toBe('El cobro REF-1 cambió a: Pago exitoso.');
      expect(element.querySelector('.status--succeeded')).not.toBeNull();
      expect(element.querySelector<HTMLInputElement>('#filter-reference')?.value).toBe('borrador');
      expect(document.activeElement).toBe(element.querySelector('#filter-reference'));
      // Los filtros aplicados siguen siendo los últimos aplicados, no los que se están escribiendo.
      expect(list).toHaveBeenLastCalledWith({ reference: '', dateFrom: '', dateTo: '', status: '' });
    });

    it('aplica el piso mínimo al intervalo', async () => {
      vi.useFakeTimers();
      list.mockReturnValue(of(listOf([payment('REF-1')], 1)));
      const { fixture } = render();
      fixture.detectChanges();
      vi.advanceTimersByTime(4_000);
      expect(list).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1_000);
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('si falla la actualización conserva la lista y avisa', async () => {
      vi.useFakeTimers();
      list.mockReturnValueOnce(of(listOf([payment('REF-1')], 10)));
      const { fixture, element } = render();
      fixture.detectChanges();
      list.mockReturnValueOnce(throwError(() => ({ kind: 'network', status: 0, serverMessage: null })));
      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
      expect(element.textContent).toContain('No pudimos actualizar la lista');
    });

    it('se detiene al destruir la vista', async () => {
      vi.useFakeTimers();
      list.mockReturnValue(of(listOf([payment('REF-1')], 10)));
      const { fixture } = render();
      fixture.detectChanges();
      fixture.destroy();
      vi.advanceTimersByTime(60_000);
      expect(list).toHaveBeenCalledTimes(1);
    });

    it('no solapa consultas mientras hay una en curso', async () => {
      vi.useFakeTimers();
      list.mockReturnValueOnce(of(listOf([payment('REF-1')], 10)));
      const { fixture } = render();
      fixture.detectChanges();
      list.mockReturnValue(new Subject<QrPaymentList>());
      vi.advanceTimersByTime(10_000);
      vi.advanceTimersByTime(10_000);
      expect(list).toHaveBeenCalledTimes(2);
    });
  });

  it('cambiar de comercio reinicia y consulta de nuevo', async () => {
    list.mockReturnValue(of(listOf([payment('REF-1')])));
    const { fixture } = render();
    await fixture.whenStable();
    TestBed.inject(MerchantIdentityStore).set('TEST-m2');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(list).toHaveBeenCalledTimes(2);
    TestBed.inject(MerchantIdentityStore).clear();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Indica tu comercio');
  });

  describe('copiar referencia', () => {
    it('copia y anuncia', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      list.mockReturnValue(of(listOf([payment('REF-1')])));
      const { fixture, element, announcer } = render();
      await fixture.whenStable();
      (element.querySelector('button.copy') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(writeText).toHaveBeenCalledWith('REF-1');
      expect(announcer.message()).toBe('Referencia REF-1 copiada.');
      expect(element.querySelector('button.copy')?.textContent).toContain('Copiado');
    });

    it('avisa si no se puede copiar', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
        configurable: true,
      });
      list.mockReturnValue(of(listOf([payment('REF-1')])));
      const { fixture, element, announcer } = render();
      await fixture.whenStable();
      (element.querySelector('button.copy') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(announcer.message()).toContain('No se pudo copiar');
    });
  });

  it('un cobro simulado refresca la lista', async () => {
    list.mockReturnValueOnce(of(listOf([])));
    const { fixture, element } = render();
    await fixture.whenStable();
    createQrPayment.mockReturnValue(of(payment('REF-NEW')));
    list.mockReturnValueOnce(of(listOf([payment('REF-NEW')])));
    type(element, '#sim-amount', '10.50');
    click(element, 'Crear cobro simulado');
    fixture.detectChanges();
    expect(createQrPayment).toHaveBeenCalledWith({ merchant_id: 'TEST-m1', amount_cents: 1050 });
    expect(element.querySelector('tbody code')?.textContent).toBe('REF-NEW');
  });
});
