import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExplorerDataService } from '@app/services/explorer-data.service';

interface ChainParams {
  chainId: number;
  blockTimeMs: number;
  maxBlockSize: number;
  maxTxPerBlock: number;
  gasPriceMin: number;
  gasPriceMax: number;
  validatorCount: number;
  committeeSize: number;
  epochDurationBlocks: number;
  minStake: number;
  rewardRate: number;
}

@Component({
  selector: 'params-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="params" aria-labelledby="params-heading">
      <header class="params__header">
        <div>
          <h1 id="params-heading">Chain Parameters</h1>
          <p class="params__subtitle">Current protocol configuration</p>
        </div>
      </header>

      <div *ngIf="loading" class="loading">Loading chain parameters...</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error">
        <section class="params__section" aria-label="Network parameters">
          <div class="section-heading">
            <h2>Network</h2>
          </div>
          <div class="params-grid">
            <div class="param-card">
              <div class="param-label">Chain ID</div>
              <div class="param-value">{{ params.chainId }}</div>
            </div>
            <div class="param-card">
              <div class="param-label">Block Time</div>
              <div class="param-value">{{ params.blockTimeMs }} ms</div>
            </div>
            <div class="param-card">
              <div class="param-label">Max Block Size</div>
              <div class="param-value">{{ params.maxBlockSize | number }} bytes</div>
            </div>
            <div class="param-card">
              <div class="param-label">Max Tx/Block</div>
              <div class="param-value">{{ params.maxTxPerBlock | number }}</div>
            </div>
          </div>
        </section>

        <section class="params__section" aria-label="Gas parameters">
          <div class="section-heading">
            <h2>Gas & Fees</h2>
          </div>
          <div class="params-grid">
            <div class="param-card">
              <div class="param-label">Min Gas Price</div>
              <div class="param-value">{{ params.gasPriceMin | number }} wei</div>
            </div>
            <div class="param-card">
              <div class="param-label">Max Gas Price</div>
              <div class="param-value">{{ params.gasPriceMax | number }} wei</div>
            </div>
          </div>
        </section>

        <section class="params__section" aria-label="Consensus parameters">
          <div class="section-heading">
            <h2>Consensus</h2>
          </div>
          <div class="params-grid">
            <div class="param-card">
              <div class="param-label">Validator Count</div>
              <div class="param-value">{{ params.validatorCount }}</div>
            </div>
            <div class="param-card">
              <div class="param-label">Committee Size</div>
              <div class="param-value">{{ params.committeeSize }}</div>
            </div>
            <div class="param-card">
              <div class="param-label">Epoch Duration</div>
              <div class="param-value">{{ params.epochDurationBlocks | number }} blocks</div>
            </div>
            <div class="param-card">
              <div class="param-label">Min Stake</div>
              <div class="param-value">{{ formatCoins(params.minStake) }} CHERT</div>
            </div>
            <div class="param-card">
              <div class="param-label">Reward Rate</div>
              <div class="param-value">{{ params.rewardRate }}%</div>
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

      .params {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .params__header {
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

      .params__subtitle {
        margin: 0.25rem 0 0;
        color: var(--text-secondary);
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

      .params__section {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.5rem;
      }

      .params-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
      }

      .param-card {
        background: rgba(14, 165, 233, 0.03);
        border: 1px solid rgba(14, 165, 233, 0.1);
        border-radius: 12px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .param-label {
        font-size: 0.85rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .param-value {
        font-size: 1.25rem;
        font-weight: 600;
        color: #0ea5e9;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ParamsPageComponent implements OnInit {
  params: ChainParams = {
    chainId: 0,
    blockTimeMs: 0,
    maxBlockSize: 0,
    maxTxPerBlock: 0,
    gasPriceMin: 0,
    gasPriceMax: 0,
    validatorCount: 0,
    committeeSize: 0,
    epochDurationBlocks: 0,
    minStake: 0,
    rewardRate: 0
  };

  loading = true;
  error: string | null = null;

  constructor(private readonly data: ExplorerDataService) {}

  async ngOnInit(): Promise<void> {
    await this.loadParams();
  }

  private async loadParams(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const params = await this.data.fetchChainParameters();

      this.params = {
        chainId: params.chain_id,
        blockTimeMs: params.block_time_ms,
        maxBlockSize: params.max_block_size,
        maxTxPerBlock: params.max_tx_per_block,
        gasPriceMin: parseFloat(params.gas_price_min),
        gasPriceMax: parseFloat(params.gas_price_max),
        validatorCount: params.validator_count,
        committeeSize: params.committee_size,
        epochDurationBlocks: params.epoch_duration_blocks,
        minStake: parseFloat(params.min_stake) / 1_000_000,
        rewardRate: parseFloat(params.reward_rate)
      };

    } catch (err) {
      this.error = 'Failed to load chain parameters';
      console.error('Chain params load error:', err);
    } finally {
      this.loading = false;
    }
  }

  formatCoins(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
}
