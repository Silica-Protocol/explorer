import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ExplorerDataService } from '@app/services/explorer-data.service';

interface EventLog {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
  timestamp: string;
}

@Component({
  selector: 'events-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <section class="events" aria-labelledby="events-heading">
      <header class="events__header">
        <div>
          <h1 id="events-heading">Event Logs</h1>
          <p class="events__subtitle">Search contract events by address or transaction</p>
        </div>
      </header>

      <section class="events__search" aria-label="Event search">
        <div class="search-form">
          <div class="search-field">
            <label for="address-input">Contract Address</label>
            <input
              id="address-input"
              type="text"
              [(ngModel)]="addressFilter"
              placeholder="0x..."
              class="search-input"
            />
          </div>
          <div class="search-field">
            <label for="tx-input">Transaction Hash</label>
            <input
              id="tx-input"
              type="text"
              [(ngModel)]="txFilter"
              placeholder="0x..."
              class="search-input"
            />
          </div>
          <div class="search-field">
            <label for="limit-input">Results</label>
            <select id="limit-input" [(ngModel)]="limit" class="search-select">
              <option [value]="25">25</option>
              <option [value]="50">50</option>
              <option [value]="100">100</option>
            </select>
          </div>
          <button class="btn btn--primary" (click)="searchEvents()">Search</button>
        </div>
      </section>

      <div *ngIf="loading" class="loading">Loading events...</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error">
        <section class="events__results" aria-label="Event results">
          <div class="section-heading">
            <h2>{{ events.length }} Events Found</h2>
          </div>

          <div class="events-list">
            <div *ngFor="let event of events" class="event-card">
              <div class="event-card__header">
                <span class="event-block">Block #{{ event.blockNumber | number }}</span>
                <span class="event-time">{{ event.timestamp }}</span>
              </div>

              <div class="event-card__address">
                <span class="label">Contract:</span>
                <a [routerLink]="['/contract', event.address]" class="address-link">{{ formatAddress(event.address) }}</a>
              </div>

              <div class="event-card__tx">
                <span class="label">Transaction:</span>
                <a [routerLink]="['/transaction', event.transactionHash]" class="tx-link">{{ formatAddress(event.transactionHash) }}</a>
              </div>

              <div class="event-card__topics">
                <span class="label">Topics:</span>
                <div class="topics-list">
                  <div *ngFor="let topic of event.topics; let i = index" class="topic-item">
                    <span class="topic-index">{{ i }}</span>
                    <span class="topic-value">{{ topic }}</span>
                  </div>
                </div>
              </div>

              <div class="event-card__data">
                <span class="label">Data:</span>
                <pre class="data-value">{{ event.data }}</pre>
              </div>
            </div>

            <div *ngIf="events.length === 0" class="empty-state">
              No events found. Try searching with different filters.
            </div>
          </div>
        </section>
      </ng-container>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .events {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .events__header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 1.5rem;
        align-items: center;
      }

      h1 {
        font-size: var(--h1-size);
        margin: 0;
        background: var(--gradient-h1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .events__subtitle {
        margin: 0.25rem 0 0;
        color: var(--text-secondary);
      }

      .events__search {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.5rem;
      }

      .search-form {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: flex-end;
      }

      .search-field {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        flex: 1;
        min-width: 200px;
      }

      .search-field label {
        font-size: 0.85rem;
        color: var(--text-secondary);
        font-weight: 500;
      }

      .search-input,
      .search-select {
        padding: 0.65rem 0.9rem;
        border: 1px solid var(--panel-border);
        border-radius: 8px;
        background: var(--panel-bg);
        color: inherit;
        font-size: 0.9rem;
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
      }

      .search-input:focus,
      .search-select:focus {
        outline: none;
        border-color: rgba(14, 165, 233, 0.5);
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
      }

      .btn {
        appearance: none;
        border: 1px solid rgba(14, 165, 233, 0.2);
        background: rgba(14, 165, 233, 0.05);
        color: inherit;
        border-radius: 8px;
        padding: 0.65rem 1.25rem;
        font-size: 0.9rem;
        line-height: 1;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .btn--primary {
        border-color: rgba(14, 165, 233, 0.4);
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(20, 184, 166, 0.1));
        color: #22d3ee;
        font-weight: 500;
      }

      .btn--primary:hover {
        box-shadow: 0 4px 20px rgba(14, 165, 233, 0.3);
        border-color: rgba(14, 165, 233, 0.6);
        transform: translateY(-2px);
      }

      .loading, .error {
        padding: 2rem;
        text-align: center;
        color: var(--text-secondary);
        background: var(--panel-bg);
        border-radius: 18px;
        border: 1px solid var(--panel-border);
      }

      .error {
        color: #ef4444;
      }

      .section-heading {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .section-heading h2 {
        font-size: var(--h2-size);
        margin: 0;
      }

      .events-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .event-card {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        transition: all 0.2s ease;
      }

      .event-card:hover {
        border-color: rgba(14, 165, 233, 0.3);
        transform: translateY(-2px);
      }

      .event-card__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .event-block {
        font-weight: 600;
        color: #0ea5e9;
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
      }

      .event-time {
        font-size: 0.85rem;
        color: var(--text-secondary);
      }

      .event-card__address,
      .event-card__tx,
      .event-card__topics,
      .event-card__data {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      .label {
        font-size: 0.8rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .address-link,
      .tx-link {
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.9rem;
        color: #0ea5e9;
        text-decoration: none;
      }

      .address-link:hover,
      .tx-link:hover {
        text-decoration: underline;
      }

      .topics-list {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .topic-item {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.8rem;
      }

      .topic-index {
        color: #a855f7;
        min-width: 20px;
      }

      .topic-value {
        color: var(--text-secondary);
        word-break: break-all;
      }

      .data-value {
        margin: 0;
        padding: 0.75rem;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 8px;
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.8rem;
        color: var(--text-secondary);
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }

      .empty-state {
        padding: 3rem;
        text-align: center;
        color: var(--text-secondary);
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventsPageComponent implements OnInit {
  addressFilter = '';
  txFilter = '';
  limit = 50;
  events: EventLog[] = [];
  loading = false;
  error: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly data: ExplorerDataService
  ) {}

  async ngOnInit(): Promise<void> {
    const address = this.route.snapshot.queryParamMap.get('address');
    const tx = this.route.snapshot.queryParamMap.get('tx');

    if (address) {
      this.addressFilter = address;
    }
    if (tx) {
      this.txFilter = tx;
    }

    await this.searchEvents();
  }

  async searchEvents(): Promise<void> {
    if (!this.addressFilter && !this.txFilter) {
      this.error = 'Please enter either a contract address or transaction hash';
      return;
    }

    this.loading = true;
    this.error = null;

    try {
      const params: any = {
        limit: this.limit
      };

      if (this.addressFilter) {
        params.address = this.addressFilter;
      }
      if (this.txFilter) {
        params.transactionHash = this.txFilter;
      }

      const events = await this.data.fetchEvents(params).catch(() => []);

      this.events = events.map(e => ({
        address: e.address,
        topics: e.topics,
        data: e.data,
        transactionHash: e.transactionHash,
        blockNumber: e.blockNumber,
        logIndex: e.logIndex,
        timestamp: e.timestamp
      }));

    } catch (err) {
      this.error = 'Failed to load events';
      console.error('Events load error:', err);
    } finally {
      this.loading = false;
    }
  }

  formatAddress(address: string): string {
    if (!address) return '';
    return address.length > 16 ? `${address.slice(0, 10)}…${address.slice(-4)}` : address;
  }
}
