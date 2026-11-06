import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STATUS_INDICATORS, UNKNOWN_INDICATOR } from '../../merchant.config';
import { MERCHANT_COPY } from '../../merchant.copy';

/** Estado con símbolo y texto (nunca solo color). */
@Component({
  selector: 'app-status-badge',
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadge {
  readonly status = input.required<string>();
  readonly label = input.required<string>();

  protected readonly indicator = computed(() => STATUS_INDICATORS[this.status()] ?? UNKNOWN_INDICATOR);
  protected readonly text = computed(() => (this.label() === '' ? MERCHANT_COPY.unknownStatusFallback : this.label()));
}
