import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { LiveAnnouncer } from '../../../../core/a11y/live-announcer';
import { MerchantIdentityStore } from '../../../../core/identity/merchant-identity.store';
import { MERCHANT_COPY } from '../../merchant.copy';

/** Selector provisional del comercio activo (hasta contar con autenticación de comercio). */
@Component({
  selector: 'app-merchant-identity-form',
  imports: [ReactiveFormsModule],
  templateUrl: './merchant-identity-form.html',
  styleUrl: './merchant-identity-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantIdentityForm {
  private readonly identity = inject(MerchantIdentityStore);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);

  protected readonly copy = MERCHANT_COPY;
  protected readonly merchantId = this.identity.merchantId;
  protected readonly editing = signal(false);
  protected readonly invalid = signal(false);
  protected readonly control = new FormControl(this.identity.merchantId() ?? '', { nonNullable: true });

  private readonly input = viewChild<ElementRef<HTMLInputElement>>('idInput');

  protected save(event: Event): void {
    event.preventDefault();
    if (!this.identity.set(this.control.value)) {
      this.invalid.set(true);
      this.announcer.announce(this.copy.identityInvalid);
      this.input()?.nativeElement.focus();
      return;
    }
    this.invalid.set(false);
    this.editing.set(false);
    this.announcer.announce(this.copy.identitySaved(this.identity.merchantId() ?? ''));
  }

  protected change(): void {
    this.control.setValue(this.identity.merchantId() ?? '');
    this.editing.set(true);
    afterNextRender(() => this.input()?.nativeElement.focus(), { injector: this.injector });
  }
}
