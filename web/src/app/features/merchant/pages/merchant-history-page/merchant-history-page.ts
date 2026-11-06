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
import { MerchantApiService } from '../../data/merchant-api.service';
import { MerchantError } from '../../data/merchant-error';
import { HistoryFilters, MerchantStatusChange } from '../../data/merchant.models';
import { MerchantIdentityForm } from '../../components/merchant-identity-form/merchant-identity-form';
import { MerchantNav } from '../../components/merchant-nav/merchant-nav';
import { StatusBadge } from '../../components/status-badge/status-badge';
import { FALLBACK_POLL_SECONDS, PAGE_SIZE } from '../../merchant.config';
import { MERCHANT_COPY } from '../../merchant.copy';
import {
  EMPTY_HISTORY_FILTERS,
  formatDateTime,
  isDateRangeValid,
  normalizeFilters,
  pageRange,
} from '../../rules/merchant-rules';

type Phase = 'idle' | 'loading' | 'ready' | 'error';

/** Una fila por cambio de estado del comercio, con filtros por referencia y fecha del evento y paginación simple. */
@Component({
  selector: 'app-merchant-history-page',
  imports: [ReactiveFormsModule, RouterLink, MerchantIdentityForm, MerchantNav, StatusBadge],
  templateUrl: './merchant-history-page.html',
  styleUrl: './merchant-history-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantHistoryPage {
  private readonly api = inject(MerchantApiService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly destroyRef = inject(DestroyRef);
  private inflight: Subscription | null = null;

  protected readonly copy = MERCHANT_COPY;
  protected readonly formatDateTime = formatDateTime;
  protected readonly merchantId = inject(MerchantIdentityStore).merchantId;

  protected readonly phase = signal<Phase>('idle');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly refreshFailed = signal(false);
  protected readonly items = signal<readonly MerchantStatusChange[]>([]);
  protected readonly total = signal(0);
  protected readonly offset = signal(0);
  protected readonly noResultsMessage = signal<string | null>(null);
  protected readonly dateError = signal<string | null>(null);
  protected readonly applied = signal<HistoryFilters>(EMPTY_HISTORY_FILTERS);
  protected readonly pollSeconds = FALLBACK_POLL_SECONDS;
  private readonly polling = computed(() => this.phase() !== 'idle');
  protected readonly range = computed(() => pageRange(this.offset(), this.items().length, this.total()));
  protected readonly isFiltered = computed(() => {
    const { reference, dateFrom, dateTo } = this.applied();
    return reference !== '' || dateFrom !== '' || dateTo !== '';
  });

  protected readonly filters = new FormGroup({
    reference: new FormControl('', { nonNullable: true }),
    dateFrom: new FormControl('', { nonNullable: true }),
    dateTo: new FormControl('', { nonNullable: true }),
  });

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly dateFromInput = viewChild<ElementRef<HTMLInputElement>>('dateFromInput');

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
    this.destroyRef.onDestroy(() => this.inflight?.unsubscribe());

    effect(() => {
      const id = this.merchantId();
      untracked(() => this.resetFor(id));
    });

    // Refresco periódico silencioso; la API de historial no entrega plazo propio (OQ-28): se usa el valor por defecto.
    effect((onCleanup) => {
      if (!this.polling()) return;
      const handle = setInterval(() => untracked(() => this.refresh()), this.pollSeconds * 1000);
      onCleanup(() => clearInterval(handle));
    });
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
    this.fetch(next, 0, false);
  }

  protected clear(): void {
    this.filters.reset();
    this.dateError.set(null);
    this.fetch(EMPTY_HISTORY_FILTERS, 0, false);
    this.announcer.announce(this.copy.filtersCleared);
  }

  protected retry(): void {
    this.fetch(this.applied(), this.offset(), false);
  }

  protected previous(): void {
    this.fetch(this.applied(), Math.max(0, this.offset() - PAGE_SIZE), false);
  }

  protected next(): void {
    this.fetch(this.applied(), this.offset() + PAGE_SIZE, false);
  }

  protected attemptRoute(reference: string): string {
    return APP_ROUTES.merchantAttempt(reference);
  }

  private resetFor(id: string | null): void {
    this.inflight?.unsubscribe();
    this.filters.reset();
    this.applied.set(EMPTY_HISTORY_FILTERS);
    this.items.set([]);
    this.total.set(0);
    this.offset.set(0);
    this.dateError.set(null);
    this.errorMessage.set(null);
    this.noResultsMessage.set(null);
    this.refreshFailed.set(false);
    if (id === null) {
      this.phase.set('idle');
      return;
    }
    this.fetch(EMPTY_HISTORY_FILTERS, 0, false);
  }

  /** No cambia fase, foco ni filtros en edición; conserva filtros aplicados y página. */
  private refresh(): void {
    if (this.phase() !== 'ready' || this.inflight?.closed === false) return;
    this.fetch(this.applied(), this.offset(), true);
  }

  private fetch(filters: HistoryFilters, offset: number, silent: boolean): void {
    this.inflight?.unsubscribe();
    if (!silent) this.phase.set('loading');
    this.inflight = this.api.history(filters, offset).subscribe({
      next: (list) => {
        const grew = silent && list.total > this.total();
        this.applied.set(filters);
        this.offset.set(list.offset);
        this.items.set(list.items);
        this.total.set(list.total);
        this.noResultsMessage.set(list.has_results ? null : (list.message ?? this.copy.noResults));
        this.refreshFailed.set(false);
        this.phase.set('ready');
        if (grew) this.announcer.announce(this.copy.historyNewChanges);
        if (silent) return;
        this.dateError.set(null);
        const range = this.range();
        this.announcer.announce(
          list.has_results ? this.copy.historyPageAnnounce(range.from, range.to, list.total) : this.copy.noResults,
        );
      },
      error: (error: MerchantError) => this.onError(error, silent),
    });
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
    const message = error.kind === 'unauthorized' ? this.copy.unauthorized : this.copy.historyLoadFailed;
    this.errorMessage.set(message);
    this.phase.set('error');
    this.announcer.announce(message);
  }
}
