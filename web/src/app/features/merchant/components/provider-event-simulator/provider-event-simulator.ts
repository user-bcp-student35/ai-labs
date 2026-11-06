import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { LiveAnnouncer } from '../../../../core/a11y/live-announcer';
import { MerchantApiService } from '../../data/merchant-api.service';
import { MerchantError } from '../../data/merchant-error';
import { SimulateEventResult } from '../../data/merchant.models';
import { MVP_STATUS_OPTIONS } from '../../merchant.config';
import { MERCHANT_COPY } from '../../merchant.copy';
import { simulateResultMessage } from '../../rules/merchant-rules';

/** Demostración provisional: aplica un evento de estado a un cobro. El padre solo lo muestra si `demo_enabled`. */
@Component({
  selector: 'app-provider-event-simulator',
  imports: [ReactiveFormsModule],
  templateUrl: './provider-event-simulator.html',
  styleUrl: './provider-event-simulator.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProviderEventSimulator {
  private readonly api = inject(MerchantApiService);
  private readonly announcer = inject(LiveAnnouncer);

  readonly reference = input.required<string>();
  readonly simulated = output<SimulateEventResult>();

  protected readonly copy = MERCHANT_COPY;
  protected readonly options = MVP_STATUS_OPTIONS;
  protected readonly status = new FormControl(MVP_STATUS_OPTIONS[0].value, { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly outcome = signal<string | null>(null);
  protected readonly failed = signal(false);

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    this.api.simulateEvent(this.reference(), this.status.value).subscribe({
      next: (result) => {
        const message = simulateResultMessage(result.result);
        this.busy.set(false);
        this.outcome.set(message);
        this.announcer.announce(message);
        this.simulated.emit(result);
      },
      error: (error: MerchantError) => {
        const message = error.kind === 'not-found' ? this.copy.demoUnavailable : this.copy.demoFailed;
        this.busy.set(false);
        this.outcome.set(message);
        this.failed.set(true);
        this.announcer.announce(message);
      },
    });
  }
}
