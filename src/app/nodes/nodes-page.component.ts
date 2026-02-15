import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExplorerDataService } from '@app/services/explorer-data.service';

interface NodeInfo {
  nodeId: string;
  address: string;
  status: 'online' | 'offline' | 'syncing';
  height: number;
  latencyMs: number;
  lastBlockTime: string;
  version: string;
  uptimeSeconds: number;
}

@Component({
  selector: 'nodes-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="nodes" aria-labelledby="nodes-heading">
      <header class="nodes__header">
        <div>
          <h1 id="nodes-heading">Network Health</h1>
          <p class="nodes__subtitle">Node status and network connectivity</p>
        </div>
        <div class="network-status" [class.online]="networkOnline">
          <span class="status-dot"></span>
          {{ networkOnline ? 'Network Online' : 'Network Issues' }}
        </div>
      </header>

      <div *ngIf="loading" class="loading">Loading node data...</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error">
        <section class="nodes__metrics" aria-label="Network metrics">
          <article class="metric-card metric-card--cyan">
            <h2>Total Nodes</h2>
            <p class="metric-value">{{ nodes.length }}</p>
            <span class="metric-label">connected</span>
          </article>

          <article class="metric-card metric-card--green">
            <h2>Online</h2>
            <p class="metric-value">{{ onlineCount }}</p>
            <span class="metric-label">nodes</span>
          </article>

          <article class="metric-card metric-card--teal">
            <h2>Syncing</h2>
            <p class="metric-value">{{ syncingCount }}</p>
            <span class="metric-label">nodes</span>
          </article>

          <article class="metric-card metric-card--red">
            <h2>Offline</h2>
            <p class="metric-value">{{ offlineCount }}</p>
            <span class="metric-label">nodes</span>
          </article>
        </section>

        <section class="nodes__list" aria-label="Node list">
          <div class="section-heading">
            <h2>Network Nodes</h2>
            <p class="muted">Individual node status and performance</p>
          </div>

          <div class="nodes-table">
            <div class="nodes-table__header">
              <span>Node</span>
              <span>Status</span>
              <span>Height</span>
              <span>Latency</span>
              <span>Uptime</span>
              <span>Version</span>
            </div>

            <div *ngFor="let node of nodes" class="node-row">
              <span class="node-address">
                <span class="node-id">{{ formatAddress(node.nodeId) }}</span>
                <span class="node-ip">{{ node.address }}</span>
              </span>
              <span>
                <span class="status-badge" [attr.data-status]="node.status">
                  {{ node.status | titlecase }}
                </span>
              </span>
              <span class="height">{{ node.height | number }}</span>
              <span class="latency" [class.good]="node.latencyMs < 100" [class.warning]="node.latencyMs >= 100 && node.latencyMs < 500" [class.bad]="node.latencyMs >= 500">
                {{ node.latencyMs }} ms
              </span>
              <span class="uptime">{{ formatUptime(node.uptimeSeconds) }}</span>
              <span class="version">{{ node.version }}</span>
            </div>

            <div *ngIf="nodes.length === 0" class="empty-state">
              No nodes found
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

      .nodes {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .nodes__header {
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

      .nodes__subtitle {
        margin: 0.25rem 0 0;
        color: var(--text-secondary);
      }

      .network-status {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border-radius: 999px;
        font-size: 0.9rem;
        font-weight: 500;
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      .network-status.online {
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
      }

      .section-heading h2 {
        font-size: var(--h2-size);
        margin: 0;
      }

      .muted {
        color: var(--text-secondary);
        margin: 0;
      }

      .nodes__metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1rem;
      }

      .metric-card {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.05), rgba(20, 184, 166, 0.03));
        border: 1px solid rgba(14, 165, 233, 0.15);
        border-radius: 16px;
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
      }

      .metric-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        background: linear-gradient(180deg, #0ea5e9, #14b8a6);
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .metric-card:hover {
        transform: translateY(-4px);
        border-color: rgba(14, 165, 233, 0.4);
      }

      .metric-card:hover::before {
        opacity: 1;
      }

      .metric-card--cyan::before { background: linear-gradient(180deg, #0ea5e9, #06b6d4); }
      .metric-card--green::before { background: linear-gradient(180deg, #22c55e, #16a34a); }
      .metric-card--teal::before { background: linear-gradient(180deg, #14b8a6, #0d9488); }
      .metric-card--red::before { background: linear-gradient(180deg, #ef4444, #dc2626); }

      .metric-card h2 {
        font-size: var(--metric-label-size);
        color: var(--text-secondary);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0;
      }

      .metric-value {
        margin: 0;
        font-size: var(--metric-value-size);
        font-weight: 700;
        background: var(--gradient-h1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .metric-label {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .nodes-table {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        overflow: hidden;
      }

      .nodes-table__header,
      .node-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 1fr 0.8fr;
        gap: 0.75rem;
        padding: 0.9rem 1.25rem;
        align-items: center;
      }

      .nodes-table__header {
        font-size: 0.8rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--panel-border);
        background: rgba(14, 165, 233, 0.03);
      }

      .node-row {
        border-bottom: 1px solid rgba(14, 165, 233, 0.08);
      }

      .node-row:last-child {
        border-bottom: none;
      }

      .node-row:hover {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.05), rgba(20, 184, 166, 0.03));
      }

      .node-address {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }

      .node-id {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.9rem;
        font-weight: 500;
      }

      .node-ip {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .status-badge {
        display: inline-block;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .status-badge[data-status="online"] {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }

      .status-badge[data-status="offline"] {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      .status-badge[data-status="syncing"] {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
      }

      .height {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.9rem;
      }

      .latency {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.9rem;
      }

      .latency.good { color: #22c55e; }
      .latency.warning { color: #f59e0b; }
      .latency.bad { color: #ef4444; }

      .uptime {
        font-size: 0.9rem;
        color: var(--text-secondary);
      }

      .version {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.85rem;
        color: var(--text-secondary);
      }

      .empty-state {
        padding: 3rem;
        text-align: center;
        color: var(--text-secondary);
      }

      @media (max-width: 960px) {
        .nodes-table__header,
        .node-row {
          grid-template-columns: 1.5fr 1fr 1fr 1fr;
        }

        .nodes-table__header span:nth-child(n + 5),
        .node-row span:nth-child(n + 5) {
          display: none;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NodesPageComponent implements OnInit {
  nodes: NodeInfo[] = [];
  networkOnline = true;
  loading = true;
  error: string | null = null;

  get onlineCount(): number {
    return this.nodes.filter(n => n.status === 'online').length;
  }

  get syncingCount(): number {
    return this.nodes.filter(n => n.status === 'syncing').length;
  }

  get offlineCount(): number {
    return this.nodes.filter(n => n.status === 'offline').length;
  }

  constructor(private readonly data: ExplorerDataService) {}

  async ngOnInit(): Promise<void> {
    await this.loadNodes();
  }

  private async loadNodes(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const nodes = await this.data.fetchNodes();

      this.nodes = nodes.map(n => ({
        nodeId: n.node_id,
        address: n.address,
        status: n.status,
        height: n.height,
        latencyMs: n.latency_ms,
        lastBlockTime: n.last_block_time,
        version: n.version,
        uptimeSeconds: n.uptime_seconds
      }));

      this.networkOnline = this.onlineCount > 0;

    } catch (err) {
      this.error = 'Failed to load node data';
      console.error('Nodes load error:', err);
    } finally {
      this.loading = false;
    }
  }

  formatAddress(address: string): string {
    if (!address) return '';
    return address.length > 16 ? `${address.slice(0, 12)}…${address.slice(-4)}` : address;
  }

  formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
}
