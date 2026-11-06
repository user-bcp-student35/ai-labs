import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MerchantNav } from './merchant-nav';

describe('MerchantNav', () => {
  it('enlaza Cobros e Historial y marca la sección actual con aria-current', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'merchant', children: [{ path: '', component: MerchantNav }, { path: 'history', component: MerchantNav }] },
        ]),
      ],
    });
    const fixture = TestBed.createComponent(MerchantNav);
    const element = fixture.nativeElement as HTMLElement;
    await TestBed.inject(Router).navigateByUrl('/merchant/history');
    await fixture.whenStable();
    fixture.detectChanges();
    const links = Array.from(element.querySelectorAll('a'));
    expect(element.querySelector('nav')?.getAttribute('aria-label')).toBeTruthy();
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/merchant', '/merchant/history']);
    expect(links[0].getAttribute('aria-current')).toBeNull();
    expect(links[1].getAttribute('aria-current')).toBe('page');
  });
});
