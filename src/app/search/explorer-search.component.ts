import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, shareReplay, startWith } from 'rxjs/operators';
import { ExplorerDataService } from '@app/services/explorer-data.service';
import type { BlockSummary } from '@shared/models/block.model';
import type { AccountSummary } from '@shared/models/account.model';
import type { TransactionSummary } from '@shared/models/transaction.model';
import type { SearchResultItem } from '@shared/models/search.model';
import { assert } from '@shared/util/assert';

interface SearchViewModel {
  readonly term: string;
  readonly results: readonly SearchResultItem[];
  readonly isOpen: boolean;
  readonly minTermMet: boolean;
}

const MAX_RESULTS = 8;
const MIN_TERM_LENGTH = 2;
const TERM_MAX_LENGTH = 64;
const SEARCH_DEBOUNCE_MS = 80;
const CLOSE_DELAY_MS = 120;

@Component({
  selector: 'explorer-search',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <div class="search" (keydown)="handleKeydown($event)" *ngIf="viewModel$ | async as vm">
      <form class="search__form" role="search" (submit)="onSubmit($event, vm)">
        <label class="visually-hidden" for="explorer-search-input">Search Chert ledger</label>
        <input
          #searchInput
          id="explorer-search-input"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search blocks, transactions, accounts"
          [formControl]="searchControl"
          (focus)="open()"
          (input)="open()"
          (blur)="scheduleClose()"
        />
      </form>

      <section
        *ngIf="vm.isOpen"
        class="search__panel"
        role="listbox"
        aria-label="Search results"
      >
        <ng-container [ngSwitch]="vm.minTermMet ? (vm.results.length > 0 ? 'results' : 'empty') : 'short'">
          <ng-container *ngSwitchCase="'results'">
            <a
              *ngFor="let result of vm.results; trackBy: trackByResult"
              class="search__item"
              [routerLink]="result.route"
              (mousedown)="retainFocus($event)"
              (click)="onResultClick(result)"
              role="option"
            >
              <div class="search__item-text">
                <span class="search__item-title">{{ result.title }}</span>
                <span class="search__item-subtitle">{{ result.subtitle }}</span>
              </div>
              <span class="search__item-badge">{{ result.type | titlecase }}</span>
            </a>
          </ng-container>

          <p *ngSwitchCase="'empty'" class="search__hint">No matching records in the active dataset.</p>
          <p *ngSwitchCase="'short'" class="search__hint">Type at least {{ minTermLength }} characters to search.</p>
        </ng-container>
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: min(420px, 100%);
      }

      .search {
        position: relative;
        width: 100%;
      }

      .search__form {
        position: relative;
      }

      .search__form input[type='search'] {
        width: 100%;
        padding: 0.75rem 1rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(255, 255, 255, 0.05);
        color: inherit;
        font-size: 0.95rem;
        transition: border-color 140ms ease, box-shadow 140ms ease;
      }

      .search__form input[type='search']:focus-visible {
        outline: none;
        border-color: rgba(102, 227, 255, 0.62);
        box-shadow: 0 0 0 3px rgba(102, 227, 255, 0.18);
      }

      .search__panel {
        position: absolute;
        z-index: 10;
        top: calc(100% + 0.5rem);
        left: 0;
        width: 100%;
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 18px;
        box-shadow: 0 16px 32px rgba(0, 0, 0, 0.35);
        padding: 0.75rem;
        display: grid;
        gap: 0.5rem;
        max-height: 420px;
        overflow-y: auto;
      }

      .search__item {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 0.75rem;
        align-items: center;
        padding: 0.65rem 0.75rem;
        border-radius: 14px;
        text-decoration: none;
        color: inherit;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        transition: background-color 120ms ease, border-color 120ms ease;
      }

      .search__item:hover,
      .search__item:focus-visible {
        background: rgba(102, 227, 255, 0.1);
        border-color: rgba(102, 227, 255, 0.35);
        outline: none;
      }

      .search__item-text {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        min-width: 0;
      }

      .search__item-title {
        font-weight: 600;
        letter-spacing: 0.01em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .search__item-subtitle {
        color: var(--text-secondary);
        font-size: 0.85rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: 'Roboto Mono', 'SFMono-Regular', Consolas, monospace;
      }

      .search__item-badge {
        font-size: 0.75rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: rgba(255, 255, 255, 0.07);
        border-radius: 999px;
        padding: 0.25rem 0.7rem;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .search__hint {
        margin: 0;
        padding: 0.6rem 0.8rem;
        color: var(--text-secondary);
        font-size: 0.9rem;
      }

      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExplorerSearchComponent implements OnDestroy {
  readonly minTermLength = MIN_TERM_LENGTH;

  readonly searchControl = new FormControl('', { nonNullable: true });

  private readonly openState = new BehaviorSubject<boolean>(false);
  private closeTimer: number | null = null;

  private readonly term$: Observable<string> = this.searchControl.valueChanges.pipe(
    startWith(this.searchControl.value),
    map((value: string) => value.trim().slice(0, TERM_MAX_LENGTH)),
    distinctUntilChanged(),
    debounceTime(SEARCH_DEBOUNCE_MS),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly results$: Observable<readonly SearchResultItem[]> = combineLatest([
    this.term$,
    this.data.blocks$,
    this.data.recentTransactions$,
    this.data.accounts$
  ]).pipe(
    map(([term, blocks, transactions, accounts]) =>
      this.computeSearchResults(term, blocks, transactions, accounts)
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  readonly viewModel$: Observable<SearchViewModel> = combineLatest([
    this.term$,
    this.results$,
    this.openState.asObservable()
  ]).pipe(
    map(([term, results, isOpen]) => {
      const hasQuery = term.length > 0;
      const minTermMet = term.length >= MIN_TERM_LENGTH;
      return {
        term,
        results,
        minTermMet,
        isOpen: isOpen && hasQuery
      } satisfies SearchViewModel;
    })
  );

  @ViewChild('searchInput', { static: false })
  private readonly searchInput?: ElementRef<HTMLInputElement>;

  constructor(private readonly data: ExplorerDataService, private readonly router: Router) {}

  ngOnDestroy(): void {
    this.clearCloseTimer();
    this.openState.complete();
  }

  open(): void {
    this.clearCloseTimer();
    this.openState.next(true);
  }

  scheduleClose(): void {
    this.clearCloseTimer();
    this.closeTimer = window.setTimeout(() => {
      this.openState.next(false);
      this.closeTimer = null;
    }, CLOSE_DELAY_MS);
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.searchControl.setValue('', { emitEvent: true });
      this.openState.next(false);
      this.focusInput();
    }
  }

  onSubmit(event: Event, viewModel: SearchViewModel): void {
    event.preventDefault();
    assert(viewModel !== undefined, 'Search view model must be defined');
    if (viewModel.results.length === 0) {
      return;
    }
    this.navigateToResult(viewModel.results[0]);
  }

  onResultClick(result: SearchResultItem): void {
    this.navigateToResult(result);
  }

  retainFocus(event: MouseEvent): void {
    // Prevent the input blur handler from closing the panel before navigation triggers.
    event.preventDefault();
  }

  trackByResult(_: number, result: SearchResultItem): string {
    assert(typeof result.type === 'string', 'Search result type must be a string');
    assert(typeof result.id === 'string', 'Search result id must be a string');
    return `${result.type}:${result.id}`;
  }

  private computeSearchResults(
    term: string,
    blocks: readonly BlockSummary[],
    transactions: readonly TransactionSummary[],
    accounts: readonly AccountSummary[]
  ): SearchResultItem[] {
    assert(Array.isArray(blocks), 'Blocks collection must be an array');
    assert(Array.isArray(transactions), 'Transactions collection must be an array');
    assert(Array.isArray(accounts), 'Accounts collection must be an array');

    const normalized = term.toLowerCase();
    assert(normalized.length <= TERM_MAX_LENGTH, 'Search term exceeds maximum length');

    if (normalized.length < MIN_TERM_LENGTH) {
      return [];
    }

    const numericQuery = /^\d+$/.test(normalized) ? Number.parseInt(normalized, 10) : null;

    const blockResults = blocks
      .map((block) => this.toBlockResult(block, normalized, numericQuery))
      .filter((item): item is SearchResultItem => item !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

    const transactionResults = transactions
      .map((tx) => this.toTransactionResult(tx, normalized))
      .filter((item): item is SearchResultItem => item !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

    const accountResults = accounts
      .map((account) => this.toAccountResult(account, normalized))
      .filter((item): item is SearchResultItem => item !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

    const combined = [...blockResults, ...transactionResults, ...accountResults]
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, MAX_RESULTS);

    assert(combined.length <= MAX_RESULTS, 'Search results exceeded static limit');
    return combined;
  }

  private toBlockResult(
    block: BlockSummary,
    normalized: string,
    numericQuery: number | null
  ): SearchResultItem | null {
    const hash = block.hash.toLowerCase();
    const height = Number(block.height);
    const matchesHeight = numericQuery !== null && height === numericQuery;
    const hashIncludes = hash.includes(normalized);

    if (!matchesHeight && !hashIncludes) {
      return null;
    }

    const score = (matchesHeight ? 6 : 0) + (hash.startsWith(normalized) ? 4 : 0) + (hashIncludes ? 2 : 0);
    assert(score > 0, 'Block result score must be positive when matched');

    return {
      type: 'block',
      id: block.hash,
      title: `Block #${height.toLocaleString()}`,
      subtitle: `${block.hash.slice(0, 20)}…`,
      score,
      route: ['/block', block.hash] as const,
      highlight: block.hash
    } satisfies SearchResultItem;
  }

  private toTransactionResult(
    tx: TransactionSummary,
    normalized: string
  ): SearchResultItem | null {
    const hash = tx.hash.toLowerCase();
    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();

    const matchesHash = hash.includes(normalized);
    const matchesFrom = from.includes(normalized);
    const matchesTo = to.includes(normalized);

    if (!matchesHash && !matchesFrom && !matchesTo) {
      return null;
    }

    const score = (hash.startsWith(normalized) ? 5 : 0) + (matchesHash ? 3 : 0) + ((matchesFrom || matchesTo) ? 2 : 0);
    assert(score > 0, 'Transaction result score must be positive when matched');

    return {
      type: 'transaction',
      id: tx.hash,
      title: `Transaction ${tx.hash.slice(0, 16)}…`,
      subtitle: `${tx.from.slice(0, 10)}… → ${tx.to.slice(0, 10)}…`,
      score,
      route: ['/transaction', tx.hash] as const,
      highlight: tx.hash
    } satisfies SearchResultItem;
  }

  private toAccountResult(account: AccountSummary, normalized: string): SearchResultItem | null {
    const address = account.address.toLowerCase();
    if (!address.includes(normalized)) {
      return null;
    }

    const score = address.startsWith(normalized) ? 5 : 2;
    assert(score > 0, 'Account result score must be positive when matched');

    return {
      type: 'account',
      id: account.address,
      title: `Account ${account.address.slice(0, 16)}…`,
      subtitle: `Balance ${this.formatCoins(account.balance)} CHRT`,
      score,
      route: ['/account', account.address] as const,
      highlight: account.address
    } satisfies SearchResultItem;
  }

  private navigateToResult(result: SearchResultItem): void {
    assert(result.route.length > 0, 'Search result must define a navigation route');
    void this.router.navigate(result.route);
    this.close();
  }

  private close(): void {
    this.clearCloseTimer();
    this.openState.next(false);
  }

  private focusInput(): void {
    if (this.searchInput?.nativeElement) {
      this.searchInput.nativeElement.focus();
    }
  }

  private clearCloseTimer(): void {
    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private formatCoins(value: AccountSummary['balance']): string {
    const normalized = Number(value) / 1_000_000;
    assert(Number.isFinite(normalized), 'Formatted value must be finite');
    assert(normalized >= 0, 'Formatted coin value cannot be negative');
    return normalized.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}
