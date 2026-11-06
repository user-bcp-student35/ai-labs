import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { LiveAnnouncer } from '../../../../core/a11y/live-announcer';
import { APP_ROUTES } from '../../../../core/config/app-config';
import { MerchantIdentityStore } from '../../../../core/identity/merchant-identity.store';
import { formatCents } from '../../../wallet/rules/amount';
import { MerchantError } from '../../data/merchant-error';
import { MerchantApiService } from '../../data/merchant-api.service';
import { QrPayment, QrPaymentFilters } from '../../data/merchant.models';
import { MerchantIdentityForm } from '../../components/merchant-identity-form/merchant-identity-form';
import { MerchantNav } from '../../components/merchant-nav/merchant-nav';
import { QrSimulator } from '../../components/qr-simulator/qr-simulator';
import { StatusBadge } from '../../components/status-badge/status-badge';
import { COPIED_FEEDBACK_MS, MVP_STATUS_OPTIONS } from '../../merchant.config';
import { MERCHANT_COPY } from '../../merchant.copy';
import {
  EMPTY_FILTERS,
  detectStatusChanges,
  formatDateTime,
  isDateRangeValid,
  normalizeFilters,
  pollSeconds,
} from '../../rules/merchant-rules';

type Phase = 'idle' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-merchant-payments-page',
  imports: [ReactiveFormsModule, RouterLink, MerchantIdentityForm, MerchantNav, QrSimulator, StatusBadge],
  templateUrl: './merchant-payments-page.html',
  styleUrl: './merchant-payments-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantPaymentsPage {
  private readonly api = inject(MerchantApiService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly destroyRef = inject(DestroyRef);
  private inflight: Subscription | null = null;

  protected readonly copy = MERCHANT_COPY;
  protected readonly paymentsRoute = APP_ROUTES.payments;
  protected readonly formatCents = formatCents;
  protected readonly formatDateTime = formatDateTime;
  protected readonly merchantId = inject(MerchantIdentityStore).merchantId;

  protected readonly phase = signal<Phase>('idle');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly refreshFailed = signal(false);
  protected readonly items = signal<readonly QrPayment[]>([]);
  protected readonly total = signal(0);
  protected readonly noResultsMessage = signal<string | null>(null);
  protected readonly refreshSeconds = signal<number | null>(null);
  protected readonly dateError = signal<string | null>(null);
  protected readonly copiedReference = signal<string | null>(null);
  protected readonly applied = signal<QrPaymentFilters>(EMPTY_FILTERS);
  protected readonly statusOptions = MVP_STATUS_OPTIONS;
  protected readonly isFiltered = computed(() => {
    const { reference, dateFrom, dateTo, status } = this.applied();
    return reference !== '' || dateFrom !== '' || dateTo !== '' || status !== '';
  });

  protected readonly filters = new FormGroup({
    reference: new FormControl('', { nonNullable: true }),
    status: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly dateFromInput = viewChild<ElementRef<HTMLInputElement>>('dateFromInput');

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
    this.destroyRef.onDestroy(() => this.inflight?.unsubscribe());

    // Cambio de comercio (o carga inicial): reinicia filtros y consulta de nuevo.
    effect(() => {
      const id = this.merchantId();
      untracked(() => this.resetFor(id));
    });

    // Actualización periódica: usa el plazo de la API; el efecto limpia el temporizador al cambiar o salir de la vista.
    effect((onCleanup) => {
      const seconds = this.refreshSeconds();
      if (seconds === null) return;
      const handle = setInterval(() => untracked(() => this.refresh()), seconds * 1000);
      onCleanup(() => clearInterval(handle));
    });
  }

  protected attemptRoute(reference: string): string {
    return APP_ROUTES.merchantAttempt(reference);
  }

  protected apply(): void {
    const next = normalizeFilters(this.filters.getRawValue());
    if (!isDateRangeValid(next.dateFrom, next.dateTo)) {
      this.dateError.set(this.copy.dateRangeInvalid);
      this.announcer.announce(this.copy.dateRangeInvalid);
      this.dateFromInput()?.nativeElement.focus();
      return;
    }
    this.dateError.set(null);
    this.fetch(next, false);
  }

  protected clear(): void {
    this.filters.reset();
    this.dateError.set(null);
    this.fetch(EMPTY_FILTERS, false);
    this.announcer.announce(this.copy.filtersCleared);
  }

  protected retry(): void {
    this.fetch(this.applied(), false);
  }

  /** Lista el intento recién simulado respetando los filtros aplicados. */
  protected onSimulated(): void {
    this.fetch(this.applied(), true);
  }

  protected async copyReference(reference: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(reference);
    } catch {
      this.announcer.announce(this.copy.copyFailed);
      return;
    }
    this.copiedReference.set(reference);
    this.announcer.announce(this.copy.copyAnnounce(reference));
    setTimeout(() => {
      if (this.copiedReference() === reference) this.copiedReference.set(null);
    }, COPIED_FEEDBACK_MS);
  }

  private resetFor(id: string | null): void {
    this.inflight?.unsubscribe();
    this.filters.reset();
    this.applied.set(EMPTY_FILTERS);
    this.items.set([]);
    this.total.set(0);
    this.refreshSeconds.set(null);
    this.dateError.set(null);
    this.errorMessage.set(null);
    this.noResultsMessage.set(null);
    this.refreshFailed.set(false);
    if (id === null) {
      this.phase.set('idle');
      return;
    }
    this.fetch(EMPTY_FILTERS, false);
  }

  /** Actualización periódica silenciosa: no cambia fase, foco ni filtros en edición. */
  private refresh(): void {
    if (this.phase() !== 'ready' || this.inflight?.closed === false) return;
    this.fetch(this.applied(), true);
  }

  private fetch(filters: QrPaymentFilters, silent: boolean): void {
    this.inflight?.unsubscribe();
    if (!silent) this.phase.set('loading');
    this.inflight = this.api.list(filters).subscribe({
      next: (list) => {
        const changes = silent ? detectStatusChanges(this.items(), list.items) : [];
        this.applied.set(filters);
        this.items.set(list.items);
        this.total.set(list.total);
        this.noResultsMessage.set(list.has_results ? null : (list.message ?? this.copy.noResults));
        this.refreshSeconds.set(pollSeconds(list.reflect_deadline_seconds));
        this.refreshFailed.set(false);
        this.phase.set('ready');
        if (!silent) this.dateError.set(null);
        if (changes.length > 0) {
          // Una sola frase: varios anuncios seguidos se pisarían en la región aria-live.
          this.announcer.announce(changes.map((c) => this.copy.statusChanged(c.reference, c.label)).join(' '));
        }
        if (!silent) this.announceResults(list.has_results, list.total);
      },
      error: (error: MerchantError) => this.onError(error, silent),
    });
  }

  private announceResults(hasResults: boolean, total: number): void {
    this.announcer.announce(hasResults ? this.copy.showing(total, total) : this.copy.noResults);
  }

  private onError(error: MerchantError, silent: boolean): void {
    if (silent) {
      this.refreshFailed.set(true);
      return;
    }
    if (error.kind === 'invalid-date-range') {
      const message = error.serverMessage ?? this.copy.dateRangeInvalid;
      this.dateError.set(message);
      this.phase.set('ready');
      this.announcer.announce(message);
      return;
    }
    const message = error.kind === 'unauthorized' ? this.copy.unauthorized : this.copy.loadFailed;
    this.errorMessage.set(message);
    this.phase.set('error');
    this.announcer.announce(message);
  }
}
