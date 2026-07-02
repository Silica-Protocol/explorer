import type { BlockSummary } from '@silica-protocol/explorer-models';
import { buildBlockAnalyticsSnapshot } from '@blocks/block-analytics.util';

function makeBlock(overrides: Partial<BlockSummary>): BlockSummary {
  return {
    height: 1 as BlockSummary['height'],
    hash: 'a'.repeat(64) as BlockSummary['hash'],
    parentHash: null,
    timestamp: 0 as BlockSummary['timestamp'],
    transactionCount: 0,
    totalValue: 0 as BlockSummary['totalValue'],
    status: 'pending',
    confirmationScore: 0,
    miner: 'validator_a' as BlockSummary['miner'],
    delegateSet: [],
    ...overrides
  };
}

describe('buildBlockAnalyticsSnapshot', () => {
  it('computes live bucket metrics from loaded blocks only', () => {
    const now = Date.UTC(2026, 3, 24, 12, 0, 0);
    const blocks: readonly BlockSummary[] = [
      makeBlock({
        height: 101 as BlockSummary['height'],
        hash: '1'.repeat(64) as BlockSummary['hash'],
        timestamp: (now - 3 * 60_000) as BlockSummary['timestamp'],
        transactionCount: 12,
        totalValue: 1200 as BlockSummary['totalValue'],
        status: 'finalized',
        miner: 'validator_a' as BlockSummary['miner']
      }),
      makeBlock({
        height: 102 as BlockSummary['height'],
        hash: '2'.repeat(64) as BlockSummary['hash'],
        timestamp: (now - 2 * 60_000) as BlockSummary['timestamp'],
        transactionCount: 6,
        totalValue: 600 as BlockSummary['totalValue'],
        status: 'pending',
        miner: 'validator_b' as BlockSummary['miner']
      }),
      makeBlock({
        height: 103 as BlockSummary['height'],
        hash: '3'.repeat(64) as BlockSummary['hash'],
        timestamp: (now - 2 * 60_000 + 15_000) as BlockSummary['timestamp'],
        transactionCount: 0,
        totalValue: 0 as BlockSummary['totalValue'],
        status: 'pending',
        miner: 'validator_b' as BlockSummary['miner']
      })
    ];

    const snapshot = buildBlockAnalyticsSnapshot(blocks, {
      now,
      rangeMs: 5 * 60_000,
      bucketMs: 60_000,
      requestedRangeLabel: '5m'
    });

    expect(snapshot.totalBlocks).toBe(3);
    expect(snapshot.totalTransactions).toBe(18);
    expect(snapshot.uniqueValidatorCount).toBe(2);
    expect(snapshot.partial).toBeTrue();
    expect(snapshot.buckets.length).toBeGreaterThan(0);
    expect(snapshot.notableBlocks.length).toBeGreaterThan(0);
  });

  it('returns an honest empty snapshot when no blocks are loaded', () => {
    const snapshot = buildBlockAnalyticsSnapshot([], {
      now: Date.UTC(2026, 3, 24, 12, 0, 0),
      rangeMs: 15 * 60_000,
      bucketMs: 60_000,
      requestedRangeLabel: '15m'
    });

    expect(snapshot.totalBlocks).toBe(0);
    expect(snapshot.totalTransactions).toBe(0);
    expect(snapshot.uniqueValidatorCount).toBe(0);
    expect(snapshot.partial).toBeTrue();
    expect(snapshot.sampleLabel).toContain('Waiting for live blocks');
  });
});
