import { TestBed } from '@angular/core/testing';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  function render(status: string, label: string): HTMLElement {
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('status', status);
    fixture.componentRef.setInput('label', label);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra símbolo decorativo y texto', () => {
    const element = render('SUCCEEDED', 'Pago exitoso');
    expect(element.querySelector('.status--succeeded')?.textContent).toContain('Pago exitoso');
    expect(element.querySelector('[aria-hidden="true"]')?.textContent).toBe('✓');
  });

  it('un estado desconocido o sin etiqueta usa el respaldo', () => {
    const element = render('MISTERIO', '');
    expect(element.querySelector('.status--unknown')?.textContent).toContain('Estado en revisión');
  });
});
