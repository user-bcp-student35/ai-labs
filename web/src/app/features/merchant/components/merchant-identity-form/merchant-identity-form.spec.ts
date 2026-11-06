import { TestBed } from '@angular/core/testing';
import { LiveAnnouncer } from '../../../../core/a11y/live-announcer';
import { MerchantIdentityStore } from '../../../../core/identity/merchant-identity.store';
import { MerchantIdentityForm } from './merchant-identity-form';

describe('MerchantIdentityForm', () => {
  function render(initial: string | null = null) {
    sessionStorage.clear();
    const store = TestBed.inject(MerchantIdentityStore);
    if (initial !== null) store.set(initial);
    const fixture = TestBed.createComponent(MerchantIdentityForm);
    const element = fixture.nativeElement as HTMLElement;
    document.body.appendChild(element);
    fixture.detectChanges();
    return { fixture, element, store, announcer: TestBed.inject(LiveAnnouncer) };
  }

  function submit(element: HTMLElement, value: string): void {
    const input = element.querySelector<HTMLInputElement>('#merchant-id')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('está rotulado como provisional y tiene etiqueta asociada', () => {
    const { element } = render();
    expect(element.textContent).toContain('Provisional');
    expect(element.querySelector('label[for="merchant-id"]')).not.toBeNull();
  });

  it('guarda un id válido y muestra el comercio activo', () => {
    const { fixture, element, store, announcer } = render();
    submit(element, 'TEST-m1');
    fixture.detectChanges();
    expect(store.merchantId()).toBe('TEST-m1');
    expect(element.textContent).toContain('Comercio activo: TEST-m1');
    expect(announcer.message()).toContain('TEST-m1');
  });

  it('rechaza un id inválido con mensaje y foco', () => {
    const { fixture, element, store } = render();
    submit(element, 'no válido!');
    fixture.detectChanges();
    expect(store.merchantId()).toBeNull();
    expect(element.querySelector('#merchant-id-error')?.textContent).toContain('no es válido');
    expect(element.querySelector('#merchant-id')?.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(element.querySelector('#merchant-id'));
  });

  it('permite cambiar de comercio y enfoca el campo', async () => {
    const { fixture, element } = render('TEST-m1');
    (element.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const input = element.querySelector<HTMLInputElement>('#merchant-id')!;
    expect(input.value).toBe('TEST-m1');
    expect(document.activeElement).toBe(input);
  });
});
