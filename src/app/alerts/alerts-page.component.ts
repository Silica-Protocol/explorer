import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExplorerDataService, AlertInfo, AlertEvent, AlertSeverity } from '@app/services/explorer-data.service';

@Component({
  selector: 'alerts-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="alerts" aria-labelledby="alerts-heading">
      <header class="alerts__header">
        <div>
          <h1 id="alerts-heading">Network Alerts</h1>
          <p class="alerts__subtitle">Active alerts and event history from monitoring server</p>
        </div>
        <div class="alerts__status" [class.has-alerts]="activeAlertCount > 0" [class.clear]="activeAlertCount === 0">
          <span class="status-dot"></span>
          {{ activeAlertCount > 0 ? activeAlertCount + ' Active' : 'All Clear' }}
        </div>
      </header>

      <div *ngIf="loading" class="loading">Loading alerts...</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error">
        <!-- Active Alerts -->
        <section class="alerts__active" aria-label="Active alerts">
          <div class="section-heading">
            <h2>Active Alerts</h2>
            <p class="muted">Current issues requiring attention</p>
          </div>

          <div class="alerts-list" *ngIf="activeAlertsArray.length > 0; else noActiveAlerts">
            <article *ngFor="let alert of activeAlertsArray" class="alert-card" [attr.data-severity]="alert.severity">
              <div class="alert-card__header">
                <span class="alert-severity" [attr.data-severity]="alert.severity">
                  {{ alert.severity }}
                </span>
                <span class="alert-type">{{ formatAlertType(alert.alert_type) }}</span>
                <span class="alert-time">{{ formatTimestamp(alert.timestamp) }}</span>
              </div>
              <p class="alert-card__message">{{ alert.message }}</p>
            </article>
          </div>

          <ng-template #noActiveAlerts>
            <div class="empty-state empty-state--success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <p>No active alerts. Network is healthy.</p>
            </div>
          </ng-template>
        </section>

        <!-- Alert History -->
        <section class="alerts__history" aria-label="Alert history">
          <div class="section-heading">
            <h2>Alert History</h2>
            <p class="muted">Recent alerts and their resolution status</p>
          </div>

          <div class="history-table" *ngIf="alertHistory.length > 0; else noHistory">
            <div class="history-table__header">
              <span>Severity</span>
              <span>Type</span>
              <span>Message</span>
              <span>Time</span>
              <span>Status</span>
            </div>

            <div *ngFor="let event of alertHistory" class="history-row">
              <span>
                <span class="alert-severity" [attr.data-severity]="event.severity">
                  {{ event.severity }}
                </span>
              </span>
              <span class="alert-type">{{ formatAlertType(event.alert_type) }}</span>
              <span class="alert-message">{{ truncateMessage(event.message) }}</span>
              <span class="alert-time">{{ formatTimestamp(event.timestamp) }}</span>
              <span>
                <span class="status-badge" [class.resolved]="event.resolved_at !== null" [class.active]="event.resolved_at === null">
                  {{ event.resolved_at !== null ? 'Resolved' : 'Active' }}
                </span>
              </span>
            </div>
          </div>

          <ng-template #noHistory>
            <div class="empty-state">
              <p>No alert history available.</p>
            </div>
          </ng-template>
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

      .alerts {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .alerts__header {
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

      .alerts__subtitle {
        margin: 0.25rem 0 0;
        color: var(--text-secondary);
      }

      .alerts__status {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border-radius: 999px;
        font-size: 0.9rem;
        font-weight: 500;
      }

      .alerts__status.has-alerts {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      .alerts__status.clear {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
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
        margin-bottom: 1rem;
      }

      .section-heading h2 {
        font-size: var(--h2-size);
        margin: 0;
      }

      .muted {
        color: var(--text-secondary);
        margin: 0;
      }

      .alerts-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .alert-card {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.25rem;
        border-left: 4px solid;
        transition: all 0.2s ease;
      }

      .alert-card[data-severity="Critical"] {
        border-left-color: #ef4444;
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.05), transparent);
      }

      .alert-card[data-severity="High"] {
        border-left-color: #f97316;
        background: linear-gradient(135deg, rgba(249, 115, 22, 0.05), transparent);
      }

      .alert-card[data-severity="Medium"] {
        border-left-color: #f59e0b;
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.05), transparent);
      }

      .alert-card[data-severity="Low"] {
        border-left-color: #3b82f6;
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), transparent);
      }

      .alert-card:hover {
        transform: translateX(4px);
      }

      .alert-card__header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
        flex-wrap: wrap;
      }

      .alert-severity {
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
      }

      .alert-severity[data-severity="Critical"] {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
      }

      .alert-severity[data-severity="High"] {
        background: rgba(249, 115, 22, 0.2);
        color: #f97316;
      }

      .alert-severity[data-severity="Medium"] {
        background: rgba(245, 158, 11, 0.2);
        color: #f59e0b;
      }

      .alert-severity[data-severity="Low"] {
        background: rgba(59, 130, 246, 0.2);
        color: #3b82f6;
      }

      .alert-type {
        font-weight: 500;
        color: var(--text-secondary);
        font-size: 0.9rem;
      }

      .alert-time {
        margin-left: auto;
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .alert-card__message {
        margin: 0;
        line-height: 1.5;
      }

      .empty-state {
        padding: 3rem;
        text-align: center;
        color: var(--text-secondary);
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
      }

      .empty-state--success {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.05), transparent);
        border-color: rgba(34, 197, 94, 0.2);
      }

      .empty-state--success svg {
        width: 48px;
        height: 48px;
        color: #22c55e;
        margin-bottom: 1rem;
      }

      .empty-state--success p {
        margin: 0;
        color: #22c55e;
        font-weight: 500;
      }

      .history-table {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        overflow: hidden;
      }

      .history-table__header,
      .history-row {
        display: grid;
        grid-template-columns: 100px 1.5fr 2fr 120px 100px;
        gap: 0.75rem;
        padding: 0.9rem 1.25rem;
        align-items: center;
      }

      .history-table__header {
        font-size: 0.8rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--panel-border);
        background: rgba(14, 165, 233, 0.03);
      }

      .history-row {
        border-bottom: 1px solid rgba(14, 165, 233, 0.08);
      }

      .history-row:last-child {
        border-bottom: none;
      }

      .history-row:hover {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.05), rgba(20, 184, 166, 0.03));
      }

      .alert-message {
        font-size: 0.85rem;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .status-badge {
        display: inline-block;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .status-badge.resolved {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }

      .status-badge.active {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      @media (max-width: 960px) {
        .history-table__header,
        .history-row {
          grid-template-columns: 100px 1fr 100px;
        }

        .history-table__header span:nth-child(3),
        .history-row span:nth-child(3) {
          display: none;
        }
      }

      @media (max-width: 640px) {
        .history-table__header,
        .history-row {
          grid-template-columns: 80px 1fr 80px;
        }

        .history-table__header span:nth-child(4),
        .history-row span:nth-child(4) {
          display: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlertsPageComponent implements OnInit {
  activeAlerts: Record<string, AlertInfo> = {};
  alertHistory: AlertEvent[] = [];
  loading = true;
  error: string | null = null;

  get activeAlertsArray(): AlertInfo[] {
    return Object.values(this.activeAlerts);
  }

  get activeAlertCount(): number {
    return this.activeAlertsArray.length;
  }

  constructor(
    private readonly data: ExplorerDataService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadAlerts();
    this.cdr.detectChanges();
  }

  private async loadAlerts(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const response = await this.data.fetchAlerts();
      this.activeAlerts = response.active_alerts || {};
      this.alertHistory = (response.alert_history || []).sort((a, b) => b.timestamp - a.timestamp);
    } catch (err) {
      this.error = 'Failed to load alerts';
      console.error('Alerts load error:', err);
    } finally {
      this.loading = false;
    }
  }

  formatAlertType(alertType: string): string {
    return alertType.split('::').pop() || alertType;
  }

  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  truncateMessage(message: string): string {
    if (message.length <= 60) return message;
    return message.substring(0, 57) + '...';
  }
}
