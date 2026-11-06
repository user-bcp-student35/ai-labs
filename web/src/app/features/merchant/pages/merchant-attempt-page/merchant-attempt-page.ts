import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { LiveAnnouncer } from '../../../../core/a11y/live-announcer';
import { APP_ROUTES } from '../../../../core/config/app-config';
import { MerchantIdentityStore } from '../../../../core/identity/merchant-identity.store';
import { formatCents } from '../../../wallet/rules/amount';
import { MerchantApiService } from '../../data/merchant-api.service';
import { MerchantError } from '../../data/merchant-error';
import { QrPayment, StatusChange } from '../../data/merchant.models';
import { MerchantIdentityForm } from '../../components/merchant-identity-form/merchant-identity-form';
import { MerchantNav } from '../../components/merchant-nav/merchant-nav';
import { ProviderEventSimulator } from '../../components/provider-event-simulator/provider-event-simulator';
import { StatusBadge } from '../../components/status-badge/status-badge';
import { MERCHANT_COPY } from '../../merchant.copy';
import { EMPTY_FILTERS, formatDateTime, pollSeconds } from '../../rules/merchant-rules';
import { FALLBACK_POLL_SECONDS } from '../../merchant.config';

type Phase = 'idle' | 'loading' | 'ready' | 'not-found' | 'error';

/** Detalle de un intento: estado actual y línea de tiempo de cambios (de → a, ocurrencia y recepción). */
@Component({
  selector: 'app-merchant-attempt-page',
  imports: [RouterLink, MerchantIdentityForm, MerchantNav, ProviderEventSimulator, StatusBadge],
  templateUrl: './merchant-attempt-page.html',
  styleUrl: './merchant-attempt-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantAttemptPage {
  private readonly api = inject(MerchantApiService);
  private readonly announcer = inject(LiveAnnouncer);
  private inflight: Subscription | null = null;

  protected readonly copy = MERCHANT_COPY;
  protected readonly formatCents = formatCents;
  protected readonly formatDateTime = formatDateTime;
  protected readonly listRoute = APP_ROUTES.merchant;
  protected readonly historyRoute = APP_ROUTES.merchantHistory;
  protected readonly merchantId = inject(MerchantIdentityStore).merchantId;
  protected readonly reference = inject(ActivatedRoute).snapshot.paramMap.get('reference') ?? '';

  protected readonly phase = signal<Phase>('idle');
  protected readonly changes = signal<readonly StatusChange[]>([]);
  protected readonly payment = signal<QrPayment | null>(null);
  protected readonly demoEnabled = signal(false);
  protected readonly refreshSeconds = signal<number | null>(null);
  protected readonly refreshFailed = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
    inject(DestroyRef).onDestroy(() => this.inflight?.unsubscribe());

    effect(() => {
      const id = this.merchantId();
      untracked(() => this.resetFor(id));
    });

    effect((onCleanup) => {
      const seconds = this.refreshSeconds();
      if (seconds === null) return;
      const handle = setInterval(() => untracked(() => this.refresh()), seconds * 1000);
      onCleanup(() => clearInterval(handle));
    });
  }

  protected retry(): void {
    this.load(false);
  }

  /** Tras simular un evento: recarga en silencio (sin parpadeo ni perder el foco). */
  protected onSimulated(): void {
    this.load(true, false);
  }

  private resetFor(id: string | null): void {
    this.inflight?.unsubscribe();
    this.changes.set([]);
    this.payment.set(null);
    this.demoEnabled.set(false);
    this.refreshSeconds.set(null);
    this.refreshFailed.set(false);
    this.errorMessage.set(null);
    if (id === null) {
      this.phase.set('idle');
      return;
    }
    this.load(false);
  }

  private refresh(): void {
    if (this.phase() !== 'ready' || this.inflight?.closed === false) return;
    this.load(true);
  }

  private load(silent: boolean, announceGrowth = true): void {
    this.inflight?.unsubscribe();
    if (!silent) this.phase.set('loading');
    // El estado actual y `demo_enabled` vienen de la lista filtrada por referencia; si falla, el historial sigue siendo útil.
    const current = this.api
      .list({ ...EMPTY_FILTERS, reference: this.reference })
      .pipe(catchError(() => of(null)));
    this.inflight = forkJoin([this.api.attemptHistory(this.reference), current]).subscribe({
      next: ([history, list]) => {
        const grew = silent && history.items.length > this.changes().length;
        this.changes.set(history.items);
        this.payment.set(list?.items.find((item) => item.reference === this.reference) ?? null);
        this.demoEnabled.set(list?.demo_enabled === true);
        this.refreshSeconds.set(list === null ? FALLBACK_POLL_SECONDS : pollSeconds(list.reflect_deadline_seconds));
        this.refreshFailed.set(false);
        this.phase.set('ready');
        if (grew && announceGrowth) this.announcer.announce(this.copy.historyNewChanges);
      },
      error: (error: MerchantError) => this.onError(error, silent),
    });
  }

  private onError(error: MerchantError, silent: boolean): void {
    if (silent) {
      this.refreshFailed.set(true);
      return;
    }
    this.refreshSeconds.set(null);
    if (error.kind === 'not-found') {
      this.phase.set('not-found');
      this.announcer.announce(this.copy.detailNotFound);
      return;
    }
    const message = error.kind === 'unauthorized' ? this.copy.unauthorized : this.copy.detailLoadFailed;
    this.errorMessage.set(message);
    this.phase.set('error');
    this.announcer.announce(message);
  }
}
