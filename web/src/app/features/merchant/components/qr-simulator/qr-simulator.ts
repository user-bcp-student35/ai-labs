import { ChangeDetectionStrategy, Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { LiveAnnouncer } from '../../../../core/a11y/live-announcer';
import { MerchantIdentityStore } from '../../../../core/identity/merchant-identity.store';
import { parseAmountToCents } from '../../../wallet/rules/amount';
import { MerchantApiService } from '../../data/merchant-api.service';
import { QrPayment } from '../../data/merchant.models';
import { MERCHANT_COPY } from '../../merchant.copy';

type AmountFailure = Extract<ReturnType<typeof parseAmountToCents>, { ok: false }>['reason'];

const AMOUNT_MESSAGES: Readonly<Record<AmountFailure, string>> = {
  empty: MERCHANT_COPY.simulatorAmountEmpty,
  format: MERCHANT_COPY.simulatorAmountFormat,
  'not-positive': MERCHANT_COPY.simulatorAmountNotPositive,
  'too-large': MERCHANT_COPY.simulatorAmountTooLarge,
};

/** Herramienta de demostración provisional (OQ-08): crea un intento QR hacia el comercio activo. */
@Component({
  selector: 'app-qr-simulator',
  imports: [ReactiveFormsModule],
  templateUrl: './qr-simulator.html',
  styleUrl: './qr-simulator.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrSimulator {
  private readonly api = inject(MerchantApiService);
  private readonly announcer = inject(LiveAnnouncer);

  protected readonly copy = MERCHANT_COPY;
  protected readonly merchantId = inject(MerchantIdentityStore).merchantId;
  protected readonly amount = new FormControl('', { nonNullable: true });
  protected readonly amountError = signal<string | null>(null);
  protected readonly serviceError = signal<string | null>(null);
  protected readonly busy = signal(false);

  readonly created = output<QrPayment>();

  private readonly amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput');

  protected submit(event: Event): void {
    event.preventDefault();
    const merchantId = this.merchantId();
    if (this.busy() || merchantId === null) return;
    this.serviceError.set(null);
    const parsed = parseAmountToCents(this.amount.value);
    if (!parsed.ok) {
      const message = AMOUNT_MESSAGES[parsed.reason];
      this.amountError.set(message);
      this.announcer.announce(message);
      this.amountInput()?.nativeElement.focus();
      return;
    }
    this.amountError.set(null);
    this.busy.set(true);
    this.api.createQrPayment({ merchant_id: merchantId, amount_cents: parsed.cents }).subscribe({
      next: (payment) => {
        this.busy.set(false);
        this.amount.reset('');
        this.announcer.announce(this.copy.simulatorCreated(payment.reference));
        this.created.emit(payment);
      },
      error: () => {
        this.busy.set(false);
        this.serviceError.set(this.copy.simulatorFailed);
        this.announcer.announce(this.copy.simulatorFailed);
      },
    });
  }
}
