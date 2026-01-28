import { InjectionToken, Provider } from '@angular/core';

export type ExplorerBackendMode = 'mock' | 'node';

export interface ExplorerBackendConfig {
  /** Which backend the explorer uses as its data source. */
  readonly mode: ExplorerBackendMode;

  /** Base URL for a Silica node API server (e.g. http://localhost:8545). */
  readonly nodeBaseUrl: string;
}

export const EXPLORER_BACKEND_CONFIG = new InjectionToken<ExplorerBackendConfig>('EXPLORER_BACKEND_CONFIG');

const DEFAULT_BACKEND_CONFIG: ExplorerBackendConfig = {
  mode: 'node',
  nodeBaseUrl: 'https://rpc.testnet.silicaprotocol.network'
};

type ExplorerRuntimeConfig = Partial<ExplorerBackendConfig>;

function readRuntimeConfig(): ExplorerRuntimeConfig {
  const candidate = (globalThis as unknown as { __CHERT_EXPLORER__?: unknown }).__CHERT_EXPLORER__;
  if (typeof candidate !== 'object' || candidate === null) {
    return {};
  }

  const obj = candidate as Record<string, unknown>;
  const mode = obj['mode'];
  const nodeBaseUrl = obj['nodeBaseUrl'];

  return {
    mode: mode === 'node' || mode === 'mock' ? mode : undefined,
    nodeBaseUrl: typeof nodeBaseUrl === 'string' ? nodeBaseUrl : undefined
  };
}

export function provideExplorerBackendConfig(overrides?: Partial<ExplorerBackendConfig>): Provider {
  const runtime = readRuntimeConfig();
  const merged = { ...DEFAULT_BACKEND_CONFIG, ...runtime, ...overrides } as ExplorerBackendConfig;

  return {
    provide: EXPLORER_BACKEND_CONFIG,
    useValue: merged
  };
}
