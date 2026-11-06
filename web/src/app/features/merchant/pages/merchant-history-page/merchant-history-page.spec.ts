import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { LiveAnnouncer } from '../../../../core/a11y/live-announcer';
import { MerchantIdentityStore } from '../../../../core/identity/merchant-identity.store';
import { MerchantApiService } from '../../data/merchant-api.service';
import { MerchantError } from '../../data/merchant-error';
import { HistoryFilters, MerchantHistoryList, MerchantStatusChange } from '../../data/merchant.models';
import { MerchantHistoryPage } from './merchant-history-page';

function change(reference: string, from = 'PENDING', to = 'SUCCEEDED'): MerchantStatusChange {
  return {
    reference,
    previous_status: from,
    previous_status_label: from === '' ? '' : 'Pendiente',
    status: to,
    status_label: 'Pago exitoso',
    occurred_at: '2026-01-01T10:05:00Z',
    received_at: '2026-01-01T10:05:01Z',
  };
}

function historyOf(items: readonly MerchantStatusChange[], total = items.length, offset = 0): MerchantHistoryList {
  return {
    merchant_id: 'TEST-m1',
    items,
    total,
    limit: 50,
    offset,
    has_results: total > 0,
    message: total > 0 ? null : 'No hay resultados para los filtros aplicados.',
  };
}

describe('MerchantHistoryPage', () => {
  const history = vi.fn<(filters: HistoryFilters, offset: number) => Observable<MerchantHistoryList>>();

  function render(merchantId: string | null = 'TEST-m1') {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MerchantApiService, useValue: { history } }],
    });
    if (merchantId !== null) TestBed.inject(MerchantIdentityStore).set(merchantId);
    const fixture = TestBed.createComponent(MerchantHistoryPage);
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
    Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!.click();
  }

  beforeEach(() => history.mockReset());

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('sin comercio activo pide indicarlo y no consulta', () => {
    const { element } = render(null);
    expect(element.textContent).toContain('Indica tu comercio');
    expect(history).not.toHaveBeenCalled();
  });

  it('muestra carga, luego una fila por cambio con de → a y fecha, y enfoca el encabezado', async () => {
    history.mockReturnValue(of(historyOf([change('REF-1'), change('REF-2', '', 'PENDING')])));
    const { fixture, element } = render();
    await fixture.whenStable();
    const rows = element.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('th a')?.getAttribute('href')).toBe('/merchant/REF-1');
    expect(rows[0].querySelectorAll('app-status-badge')).toHaveLength(2);
    expect(rows[0].querySelector('.status--pending')?.textContent).toContain('Pendiente');
    expect(rows[0].querySelector('.status--succeeded')?.textContent).toContain('Pago exitoso');
    expect(rows[1].textContent).toContain('Sin estado previo');
    expect(element.textContent).toContain('Mostrando 1 a 2 de 2 cambios.');
    expect(document.activeElement).toBe(element.querySelector('h1'));
  });

  it('muestra el estado de carga', () => {
    history.mockReturnValue(new Subject<MerchantHistoryList>());
    expect(render().element.querySelector('[role="status"]')?.textContent).toContain('Cargando historial');
  });

  it('estado vacío sin filtros', async () => {
    history.mockReturnValue(of(historyOf([])));
    const { fixture, element } = render();
    await fixture.whenStable();
    expect(element.textContent).toContain('Todavía no hay cambios de estado');
  });

  it('combina filtros, reinicia la página y muestra "sin resultados" con la acción siguiente', async () => {
    history.mockReturnValueOnce(of(historyOf([change('REF-1')])));
    const { fixture, element, announcer } = render();
    await fixture.whenStable();
    history.mockReturnValueOnce(of(historyOf([])));
    type(element, '#hist-reference', ' REF-9 ');
    type(element, '#hist-date-from', '2026-01-01');
    type(element, '#hist-date-to', '2026-01-31');
    click(element, 'Aplicar filtros');
    fixture.detectChanges();
    expect(history).toHaveBeenLastCalledWith({ reference: 'REF-9', dateFrom: '2026-01-01', dateTo: '2026-01-31' }, 0);
    expect(element.textContent).toContain('No hay resultados para los filtros aplicados.');
    expect(element.textContent).toContain('Prueba con otras fechas');
    expect(announcer.message()).toContain('No hay resultados');
  });

  it('valida localmente desde <= hasta sin llamar a la API y enfoca el campo', async () => {
    history.mockReturnValue(of(historyOf([change('REF-1')])));
    const { fixture, element } = render();
    await fixture.whenStable();
    history.mockClear();
    type(element, '#hist-date-from', '2026-02-01');
    type(element, '#hist-date-to', '2026-01-01');
    click(element, 'Aplicar filtros');
    fixture.detectChanges();
    expect(history).not.toHaveBeenCalled();
    expect(element.querySelector('#hist-date-error')?.textContent).toContain('no puede ser posterior');
    expect(element.querySelector('#hist-date-from')?.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(element.querySelector('#hist-date-from'));
  });

  it('muestra el 422 del servidor (con y sin mensaje) conservando la lista', async () => {
    history.mockReturnValueOnce(of(historyOf([change('REF-1')])));
    const { fixture, element } = render();
    await fixture.whenStable();
    history.mockReturnValueOnce(
      throwError(() => ({ kind: 'invalid-date-range', status: 422, serverMessage: 'Rango inválido.' }) as MerchantError),
    );
    click(element, 'Aplicar filtros');
    fixture.detectChanges();
    expect(element.querySelector('#hist-date-error')?.textContent).toContain('Rango inválido.');
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
    history.mockReturnValueOnce(
      throwError(() => ({ kind: 'invalid-date-range', status: 422, serverMessage: null }) as MerchantError),
    );
    click(element, 'Aplicar filtros');
    fixture.detectChanges();
    expect(element.querySelector('#hist-date-error')?.textContent).toContain('no puede ser posterior');
  });

  it('limpiar consulta sin filtros', async () => {
    history.mockReturnValue(of(historyOf([change('REF-1')])));
    const { fixture, element } = render();
    await fixture.whenStable();
    type(element, '#hist-reference', 'X');
    click(element, 'Limpiar filtros');
    fixture.detectChanges();
    expect(history).toHaveBeenLastCalledWith({ reference: '', dateFrom: '', dateTo: '' }, 0);
    expect(element.querySelector<HTMLInputElement>('#hist-reference')?.value).toBe('');
  });

  it('error: mensaje, reintento; 401 usa el mensaje de identidad', async () => {
    history.mockReturnValueOnce(throwError(() => ({ kind: 'network', status: 0, serverMessage: null }) as MerchantError));
    const { fixture, element } = render();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar el historial');
    history.mockReturnValueOnce(of(historyOf([change('REF-1')])));
    click(element, 'Reintentar');
    fixture.detectChanges();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
    history.mockReturnValueOnce(throwError(() => ({ kind: 'unauthorized', status: 401, serverMessage: null }) as MerchantError));
    click(element, 'Aplicar filtros');
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('identificar tu comercio');
  });

  it('pagina con anterior/siguiente usando limit/offset/total', async () => {
    history.mockReturnValueOnce(of(historyOf([change('REF-1')], 120, 0)));
    const { fixture, element } = render();
    await fixture.whenStable();
    const [previous, next] = Array.from(element.querySelectorAll<HTMLButtonElement>('.pagination button'));
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    history.mockReturnValueOnce(of(historyOf([change('REF-2')], 120, 50)));
    next.click();
    fixture.detectChanges();
    expect(history).toHaveBeenLastCalledWith({ reference: '', dateFrom: '', dateTo: '' }, 50);
    expect(element.textContent).toContain('Mostrando 51 a 51 de 120 cambios.');
    history.mockReturnValueOnce(of(historyOf([change('REF-1')], 120, 0)));
    click(element, 'Anterior');
    fixture.detectChanges();
    expect(history).toHaveBeenLastCalledWith({ reference: '', dateFrom: '', dateTo: '' }, 0);
  });

  describe('refresco periódico', () => {
    it('refresca en silencio, anuncia nuevos cambios y no pisa foco ni filtros en edición', () => {
      vi.useFakeTimers();
      history.mockReturnValueOnce(of(historyOf([change('REF-1')])));
      const { fixture, element, announcer } = render();
      fixture.detectChanges();
      type(element, '#hist-reference', 'borrador');
      element.querySelector<HTMLInputElement>('#hist-reference')!.focus();
      history.mockReturnValueOnce(of(historyOf([change('REF-1'), change('REF-1', 'SUCCEEDED', 'FAILED')])));
      vi.advanceTimersByTime(30_000);
      fixture.detectChanges();
      expect(history).toHaveBeenCalledTimes(2);
      expect(history).toHaveBeenLastCalledWith({ reference: '', dateFrom: '', dateTo: '' }, 0);
      expect(announcer.message()).toContain('nuevos cambios');
      expect(element.querySelectorAll('tbody tr')).toHaveLength(2);
      expect(element.querySelector<HTMLInputElement>('#hist-reference')?.value).toBe('borrador');
      expect(document.activeElement).toBe(element.querySelector('#hist-reference'));
    });

    it('si falla conserva la lista y avisa; se detiene al destruir', () => {
      vi.useFakeTimers();
      history.mockReturnValueOnce(of(historyOf([change('REF-1')])));
      const { fixture, element } = render();
      fixture.detectChanges();
      history.mockReturnValueOnce(throwError(() => ({ kind: 'network', status: 0, serverMessage: null }) as MerchantError));
      vi.advanceTimersByTime(30_000);
      fixture.detectChanges();
      expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
      expect(element.textContent).toContain('No pudimos actualizar el historial');
      fixture.destroy();
      vi.advanceTimersByTime(90_000);
      expect(history).toHaveBeenCalledTimes(2);
    });

    it('no solapa consultas en curso', () => {
      vi.useFakeTimers();
      history.mockReturnValueOnce(of(historyOf([change('REF-1')])));
      const { fixture } = render();
      fixture.detectChanges();
      history.mockReturnValue(new Subject<MerchantHistoryList>());
      vi.advanceTimersByTime(60_000);
      expect(history).toHaveBeenCalledTimes(2);
    });
  });

  it('cambiar de comercio reinicia y consulta de nuevo', async () => {
    history.mockReturnValue(of(historyOf([change('REF-1')])));
    const { fixture } = render();
    await fixture.whenStable();
    TestBed.inject(MerchantIdentityStore).set('TEST-m2');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(history).toHaveBeenCalledTimes(2);
    TestBed.inject(MerchantIdentityStore).clear();
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Indica tu comercio');
  });
});
