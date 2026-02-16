import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { ExplorerDataService } from '@app/services/explorer-data.service';

interface ContractFunction {
  name: string;
  type: 'function' | 'constructor' | 'event';
  inputs: Array<{ name: string; type: string }>;
  outputs?: Array<{ name: string; type: string }>;
  stateMutability?: 'pure' | 'view' | 'nonpayable' | 'payable';
}

@Component({
  selector: 'contract-viewer-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <section class="contract" aria-labelledby="contract-heading">
      <header class="contract__header">
        <div class="contract-title">
          <div class="contract-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          </div>
          <div>
            <h1 id="contract-heading">Contract Viewer</h1>
            <p class="contract-address" *ngIf="address">{{ address }}</p>
          </div>
        </div>
        <div class="contract-actions" *ngIf="address">
          <a [routerLink]="['/account', address]" class="btn btn--secondary">View Account</a>
        </div>
      </header>

      <!-- Address Search Form -->
      <div *ngIf="!address && !loading" class="search-form">
        <p class="search-instruction">Enter a contract address to view its bytecode, source code, and ABI.</p>
        <div class="search-input-group">
          <input 
            type="text" 
            [(ngModel)]="searchAddress" 
            placeholder="Enter contract address (0x...)"
            class="search-input"
            (keyup.enter)="searchContract()"
          />
          <button class="btn btn--primary" (click)="searchContract()" [disabled]="!searchAddress">
            View Contract
          </button>
        </div>
      </div>

      <div *ngIf="loading" class="loading">Loading contract data...</div>
      <div *ngIf="error && address" class="error">{{ error }}</div>

      <ng-container *ngIf="!loading && !error">
        <section class="contract__status" aria-label="Contract status">
          <div class="status-badge" [class.verified]="isVerified">
            <svg *ngIf="isVerified" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <svg *ngIf="!isVerified" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {{ isVerified ? 'Verified' : 'Unverified' }}
          </div>
        </section>

        <section class="contract__code" aria-label="Contract code">
          <div class="section-heading">
            <h2>Contract Bytecode</h2>
          </div>
          <div class="code-block">
            <pre>{{ bytecode || 'No bytecode available' }}</pre>
          </div>
        </section>

        <section class="contract__source" aria-label="Contract source">
          <div class="section-heading">
            <h2>Contract Source Code</h2>
          </div>
          <div class="code-block">
            <pre>{{ sourceCode || 'Source code not available' }}</pre>
          </div>
        </section>

        <section class="contract__abi" aria-label="Contract ABI">
          <div class="section-heading">
            <h2>Contract ABI</h2>
            <p class="muted">{{ functions.length }} functions, {{ events.length }} events</p>
          </div>

          <div class="abi-sections">
            <div class="abi-section">
              <h3>Functions</h3>
              <div class="abi-list">
                <div *ngFor="let fn of functions" class="abi-item">
                  <div class="abi-item__header">
                    <span class="abi-item__name">{{ fn.name }}</span>
                    <span class="abi-item__type" [attr.data-mutability]="fn.stateMutability">{{ fn.type }}</span>
                  </div>
                  <div class="abi-item__params">
                    <span *ngFor="let input of fn.inputs; let i = index">
                      {{ input.name ? input.name : 'param' + i }}: {{ input.type }}
                    </span>
                  </div>
                  <div *ngIf="fn.outputs && fn.outputs.length > 0" class="abi-item__returns">
                    <span>returns: </span>
                    <span *ngFor="let output of fn.outputs">
                      {{ output.name ? output.name + ': ' : '' }}{{ output.type }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="abi-section">
              <h3>Events</h3>
              <div class="abi-list">
                <div *ngFor="let event of events" class="abi-item">
                  <div class="abi-item__header">
                    <span class="abi-item__name">{{ event.name }}</span>
                    <span class="abi-item__type">event</span>
                  </div>
                  <div class="abi-item__params">
                    <span *ngFor="let input of event.inputs; let i = index">
                      {{ input.name ? input.name : 'param' + i }}: {{ input.type }}
                      <span *ngIf="input.name === ''">(indexed)</span>
                    </span>
                  </div>
                </div>
              </div>
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

      .contract {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        width: 100%;
      }

      .contract__header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 1.5rem;
        align-items: center;
      }

      .contract-title {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .contract-icon {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(168, 85, 247, 0.1));
        color: #a855f7;
      }

      .contract-icon svg {
        width: 28px;
        height: 28px;
      }

      h1 {
        font-size: var(--h1-size);
        margin: 0;
        background: var(--gradient-h1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .contract-address {
        margin: 0.25rem 0 0;
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.85rem;
        color: var(--text-secondary);
        word-break: break-all;
      }

      .btn {
        appearance: none;
        border: 1px solid rgba(14, 165, 233, 0.2);
        background: rgba(14, 165, 233, 0.05);
        color: inherit;
        border-radius: 999px;
        padding: 0.55rem 0.9rem;
        font-size: 0.9rem;
        line-height: 1;
        cursor: pointer;
        transition: all 0.2s ease;
        text-decoration: none;
      }

      .btn--secondary {
        border-color: rgba(168, 85, 247, 0.3);
        color: #a855f7;
      }

      .btn--secondary:hover {
        box-shadow: 0 4px 20px rgba(168, 85, 247, 0.3);
        border-color: rgba(168, 85, 247, 0.6);
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

      .contract__status {
        display: flex;
        gap: 1rem;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border-radius: 999px;
        font-size: 0.9rem;
        font-weight: 500;
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      .status-badge.verified {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }

      .status-badge svg {
        width: 18px;
        height: 18px;
      }

      .code-block {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.25rem;
        overflow-x: auto;
      }

      .code-block pre {
        margin: 0;
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.85rem;
        line-height: 1.5;
        color: var(--text-secondary);
        white-space: pre-wrap;
        word-break: break-all;
      }

      .abi-sections {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 1.5rem;
      }

      .abi-section {
        background: var(--panel-bg);
        border: 1px solid var(--panel-border);
        border-radius: 16px;
        padding: 1.25rem;
      }

      .abi-section h3 {
        margin: 0 0 1rem;
        font-size: 1rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .abi-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .abi-item {
        padding: 0.75rem;
        background: rgba(14, 165, 233, 0.03);
        border: 1px solid rgba(14, 165, 233, 0.1);
        border-radius: 8px;
      }

      .abi-item__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
      }

      .abi-item__name {
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-weight: 600;
        font-size: 0.95rem;
      }

      .abi-item__type {
        font-size: 0.75rem;
        padding: 0.15rem 0.5rem;
        border-radius: 4px;
        background: rgba(14, 165, 233, 0.15);
        color: #0ea5e9;
      }

      .abi-item__type[data-mutability="view"] {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }

      .abi-item__type[data-mutability="pure"] {
        background: rgba(168, 85, 247, 0.15);
        color: #a855f7;
      }

      .abi-item__type[data-mutability="payable"] {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
      }

      .abi-item__params,
      .abi-item__returns {
        margin-top: 0.5rem;
        font-size: 0.85rem;
        color: var(--text-secondary);
      }

      .abi-item__params span,
      .abi-item__returns span {
        display: inline-block;
        margin-right: 0.75rem;
      }

      @media (max-width: 768px) {
        .abi-sections {
          grid-template-columns: 1fr;
        }
      }

      .search-form {
        padding: 2rem;
        background: rgba(14, 165, 233, 0.03);
        border: 1px solid rgba(14, 165, 233, 0.1);
        border-radius: 12px;
        text-align: center;
      }

      .search-instruction {
        margin: 0 0 1.5rem;
        color: var(--text-secondary);
      }

      .search-input-group {
        display: flex;
        gap: 0.5rem;
        max-width: 600px;
        margin: 0 auto;
      }

      .search-input {
        flex: 1;
        padding: 0.75rem 1rem;
        font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
        font-size: 0.9rem;
        border: 1px solid rgba(14, 165, 233, 0.2);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.2);
        color: inherit;
      }

      .search-input:focus {
        outline: none;
        border-color: #0ea5e9;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContractViewerPageComponent implements OnInit {
  address = '';
  searchAddress = '';
  bytecode = '';
  sourceCode = '';
  isVerified = false;
  functions: ContractFunction[] = [];
  events: ContractFunction[] = [];

  loading = true;
  error: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly data: ExplorerDataService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    const address = this.route.snapshot.paramMap.get('address');
    if (address) {
      this.address = address;
      this.searchAddress = address;
      await this.loadContract(address);
    }
    this.cdr.detectChanges();
  }

  searchContract(): void {
    const addr = this.searchAddress.trim();
    if (addr) {
      this.router.navigate(['/contract', addr]);
    }
  }

  private async loadContract(address: string): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const [codeData, abiData] = await Promise.all([
        this.data.fetchContractCode(address).catch(() => null),
        this.data.fetchContractAbi(address).catch(() => null)
      ]);

      if (codeData) {
        this.bytecode = codeData.bytecode || codeData.code || '';
        this.isVerified = codeData.is_verified;
      }

      if (abiData && abiData.abi) {
        try {
          const abi = JSON.parse(abiData.abi);
          this.functions = (abi.filter((f: ContractFunction) => f.type === 'function' || f.type === 'constructor') as ContractFunction[]);
          this.events = (abi.filter((f: ContractFunction) => f.type === 'event') as ContractFunction[]);
          this.sourceCode = this.isVerified ? '// Source code verified\npragma solidity ^0.8.0;\n\n// Contract source code would be displayed here' : '';
        } catch {
          this.sourceCode = '// ABI is not valid JSON';
        }
      }

      if (!codeData && !abiData) {
        this.error = 'Contract not found';
      }

    } catch (err) {
      this.error = 'Failed to load contract data';
      console.error('Contract load error:', err);
    } finally {
      this.loading = false;
    }
  }
}
