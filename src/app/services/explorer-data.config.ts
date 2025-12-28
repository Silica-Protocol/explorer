import { InjectionToken, Provider } from '@angular/core';

export interface ExplorerDataConfig {
  readonly seed: number;
  readonly initialBlockCount: number;
  readonly blockIntervalMs: number;
  readonly finalityLag: number;
  readonly autoStart: boolean;
  readonly maxBlocks: number;
  readonly accountCount: number;
  readonly txPerBlockMin: number;
  readonly txPerBlockMax: number;
}

export const EXPLORER_DATA_CONFIG = new InjectionToken<ExplorerDataConfig>('EXPLORER_DATA_CONFIG');

const DEFAULT_CONFIG: ExplorerDataConfig = {
  seed: 0x13579ce,
  initialBlockCount: 96,
  blockIntervalMs: 4000,
  finalityLag: 12,
  autoStart: true,
  maxBlocks: 1024,
  accountCount: 320,
  txPerBlockMin: 6,
  txPerBlockMax: 42
};

export function provideExplorerDataConfig(overrides?: Partial<ExplorerDataConfig>): Provider {
  const merged = { ...DEFAULT_CONFIG, ...overrides } as ExplorerDataConfig;
  return {
    provide: EXPLORER_DATA_CONFIG,
    useValue: merged
  };
}
