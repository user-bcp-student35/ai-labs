import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { APP_ROUTES } from '../../../../core/config/app-config';
import { LiveAnnouncer } from '../../../../core/a11y/live-announcer';
import { PaymentsApiService } from '../../data/payments-api.service';
import { MERCHANT_COPY } from '../../../merchant/merchant.copy';
import { RecipientId } from '../../data/payments.models';
import { parseAmountToCents } from '../../rules/amount';
import { PaymentFlowStore } from '../../state/payment-flow.store';
import { PAYMENT_CHANNEL, RECIPIENT_OPTIONS } from '../../wallet.config';
import { WALLET_COPY } from '../../wallet.copy';

type AmountFailure = Extract<ReturnType<typeof parseAmountToCents>, { ok: false }>['reason'];

const AMOUNT_MESSAGES: Readonly<Record<AmountFailure, string>> = {
  empty: WALLET_COPY.amountEmpty,
  format: WALLET_COPY.amountFormat,
  'not-positive': WALLET_COPY.amountNotPositive,
  'too-large': WALLET_COPY.amountTooLarge,
};

@Component({
  selector: 'app-payments-entry-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './payments-entry-page.html',
  styleUrl: './payments-entry-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsEntryPage {
  private readonly api = inject(PaymentsApiService);
  private readonly store = inject(PaymentFlowStore);
  private readonly router = inject(Router);
  private readonly announcer = inject(LiveAnnouncer);

  protected readonly copy = WALLET_COPY;
  protected readonly recipients = RECIPIENT_OPTIONS;
  protected readonly historyRoute = APP_ROUTES.paymentHistory;
  protected readonly merchantRoute = APP_ROUTES.merchant;
  protected readonly merchantCopy = MERCHANT_COPY;
  protected readonly submitted = signal(false);
  protected readonly busy = signal(false);
  protected readonly serviceError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    recipient: new FormControl<RecipientId | ''>('', { nonNullable: true }),
    amount: new FormControl('', { nonNullable: true }),
  });

  private readonly recipientInput = viewChild<ElementRef<HTMLSelectElement>>('recipientInput');
  private readonly amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput');

  protected recipientError(): string | null {
    const show = this.submitted() || this.form.controls.recipient.touched;
    return show && this.form.controls.recipient.value === '' ? this.copy.recipientRequired : null;
  }

  protected amountError(): string | null {
    const show = this.submitted() || this.form.controls.amount.touched;
    if (!show) return null;
    const parsed = parseAmountToCents(this.form.controls.amount.value);
    return parsed.ok ? null : AMOUNT_MESSAGES[parsed.reason];
  }

  protected submit(): void {
    if (this.busy()) return;
    this.submitted.set(true);
    this.serviceError.set(null);
    const recipient = this.form.controls.recipient.value;
    const amount = parseAmountToCents(this.form.controls.amount.value);
    if (recipient === '' || !amount.ok) {
      const message = recipient === '' ? this.copy.recipientRequired : this.amountError();
      this.announcer.announce(message ?? '');
      (recipient === '' ? this.recipientInput() : this.amountInput())?.nativeElement.focus();
      return;
    }
    this.busy.set(true);
    this.api.openConfirmation({ recipient, amount_cents: amount.cents, channel: PAYMENT_CHANNEL }).subscribe({
      next: (confirmation) => {
        this.store.open(confirmation);
        void this.router.navigateByUrl(APP_ROUTES.paymentConfirm);
      },
      error: () => {
        this.busy.set(false);
        this.serviceError.set(this.copy.openFailed);
        this.announcer.announce(this.copy.openFailed);
      },
    });
  }
}
