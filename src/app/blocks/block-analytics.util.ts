import type { BlockSummary } from '@silica-protocol/explorer-models';
import type {
  BlockAnalyticsBlockSummary as ApiBlockAnalyticsBlockSummary,
  BlockAnalyticsResponse as ApiBlockAnalyticsResponse,
  BlockAnalyticsBucketResponse as ApiBlockAnalyticsBucketResponse,
  BlockAnalyticsNotableBlock as ApiBlockAnalyticsNotableBlock,
  BlockAnalyticsValidatorCount as ApiBlockAnalyticsValidatorCount,
} from '@silica-protocol/node-models';

const normalizedBlocksCache = new WeakMap<readonly BlockSummary[], readonly BlockSummary[]>();
const EMPTY_BLOCKS: readonly BlockSummary[] = [];
const bucketLabelFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});
const bucketShortLabelFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit'
});

export interface ValidatorCount {
  readonly validator: string;
  readonly blockCount: number;
}

export interface BlockAnalyticsBucket {
  readonly startMs: number;
  readonly endMs: number;
  readonly label: string;
  readonly shortLabel: string;
  readonly blockCount: number;
  readonly txCount: number;
  readonly nonEmptyBlockCount: number;
  readonly finalizedBlockCount: number;
  readonly pendingBlockCount: number;
  readonly avgTxPerBlock: number;
  readonly avgBlocksPerMinute: number;
  readonly topValidators: readonly ValidatorCount[];
  readonly blocks: readonly BlockSummary[];
}

export interface NotableBlock {
  readonly block: BlockSummary;
  readonly label: string;
  readonly detail: string;
  readonly tone: 'cyan' | 'teal' | 'green' | 'amber';
}

export interface BlockAnalyticsSnapshot {
  readonly rangeMs: number;
  readonly bucketMs: number;
  readonly requestedRangeLabel: string;
  readonly sampleLabel: string;
  readonly partial: boolean;
  readonly totalBlocks: number;
  readonly totalTransactions: number;
  readonly uniqueValidatorCount: number;
  readonly nonEmptyRatio: number;
  readonly avgBlocksPerMinute: number;
  readonly avgTransactionsPerMinute: number;
  readonly avgTransactionsPerBlock: number;
  readonly latestBlockAgeMs: number | null;
  readonly buckets: readonly BlockAnalyticsBucket[];
  readonly topValidators: readonly ValidatorCount[];
  readonly notableBlocks: readonly NotableBlock[];
}

export interface BlockAnalyticsOptions {
  readonly now?: number;
  readonly rangeMs: number;
  readonly bucketMs: number;
  readonly requestedRangeLabel: string;
}

interface ScoredBlock {
  readonly block: BlockSummary;
  readonly label: string;
  readonly detail: string;
  readonly tone: 'cyan' | 'teal' | 'green' | 'amber';
  readonly score: number;
}

export function buildBlockAnalyticsSnapshot(
  blocks: readonly BlockSummary[],
  options: BlockAnalyticsOptions
): BlockAnalyticsSnapshot {
  const now = options.now ?? Date.now();
  const rangeStart = now - options.rangeMs;
  const normalizedBlocks = dedupeAndSortBlocks(blocks);
  const recentBlocks = normalizedBlocks.filter((block) => toTimestamp(block) >= rangeStart && toTimestamp(block) <= now);

  if (recentBlocks.length === 0) {
    return {
      rangeMs: options.rangeMs,
      bucketMs: options.bucketMs,
      requestedRangeLabel: options.requestedRangeLabel,
      sampleLabel: `Waiting for live blocks · ${options.requestedRangeLabel}`,
      partial: true,
      totalBlocks: 0,
      totalTransactions: 0,
      uniqueValidatorCount: 0,
      nonEmptyRatio: 0,
      avgBlocksPerMinute: 0,
      avgTransactionsPerMinute: 0,
      avgTransactionsPerBlock: 0,
      latestBlockAgeMs: null,
      buckets: [],
      topValidators: [],
      notableBlocks: []
    };
  }

  const earliestLoaded = toTimestamp(recentBlocks[0]);
  const latestLoaded = toTimestamp(recentBlocks[recentBlocks.length - 1]);
  const effectiveStart = floorToBucket(Math.max(rangeStart, earliestLoaded), options.bucketMs);
  const effectiveEnd = floorToBucket(latestLoaded, options.bucketMs);
  const partial = earliestLoaded > rangeStart;
  const buckets = buildBuckets(recentBlocks, effectiveStart, effectiveEnd, options.bucketMs);

  const totalBlocks = recentBlocks.length;
  const totalTransactions = recentBlocks.reduce((sum, block) => sum + toTransactionCount(block), 0);
  const nonEmptyBlockCount = recentBlocks.filter((block) => toTransactionCount(block) > 0).length;
  const coveredMinutes = Math.max(buckets.length * (options.bucketMs / 60_000), options.bucketMs / 60_000);
  const avgBlocksPerMinute = totalBlocks / coveredMinutes;
  const avgTransactionsPerMinute = totalTransactions / coveredMinutes;
  const avgTransactionsPerBlock = totalBlocks > 0 ? totalTransactions / totalBlocks : 0;
  const sampleMinutes = Math.round(coveredMinutes);
  const sampleLabel = partial
    ? `Live sample · ${sampleMinutes}m loaded from node data`
    : `Live sample · ${options.requestedRangeLabel} from node data`;

  return {
    rangeMs: options.rangeMs,
    bucketMs: options.bucketMs,
    requestedRangeLabel: options.requestedRangeLabel,
    sampleLabel,
    partial,
    totalBlocks,
    totalTransactions,
    uniqueValidatorCount: countUniqueValidators(recentBlocks),
    nonEmptyRatio: totalBlocks > 0 ? nonEmptyBlockCount / totalBlocks : 0,
    avgBlocksPerMinute,
    avgTransactionsPerMinute,
    avgTransactionsPerBlock,
    latestBlockAgeMs: Math.max(0, now - latestLoaded),
    buckets,
    topValidators: collectTopValidators(recentBlocks),
    notableBlocks: collectNotableBlocks(recentBlocks)
  };
}

export function normalizeApiBlockAnalyticsResponse(
  response: ApiBlockAnalyticsResponse
): BlockAnalyticsSnapshot {
  return {
    rangeMs: response.range_ms,
    bucketMs: response.bucket_ms,
    requestedRangeLabel: response.requested_range_label,
    sampleLabel: response.sample_label,
    partial: response.partial,
    totalBlocks: response.total_blocks,
    totalTransactions: response.total_transactions,
    uniqueValidatorCount: response.unique_validator_count,
    nonEmptyRatio: response.non_empty_ratio,
    avgBlocksPerMinute: response.avg_blocks_per_minute,
    avgTransactionsPerMinute: response.avg_transactions_per_minute,
    avgTransactionsPerBlock: response.avg_transactions_per_block,
    latestBlockAgeMs: response.latest_block_age_ms,
    buckets: response.buckets.map(normalizeApiBucket),
    topValidators: response.top_validators.map(normalizeApiValidatorCount),
    notableBlocks: response.notable_blocks.map(normalizeApiNotableBlock),
  };
}

function buildBuckets(
  recentBlocks: readonly BlockSummary[],
  effectiveStart: number,
  effectiveEnd: number,
  bucketMs: number
): readonly BlockAnalyticsBucket[] {
  const byStart = new Map<number, BlockSummary[]>();

  for (const block of recentBlocks) {
    const bucketStart = floorToBucket(toTimestamp(block), bucketMs);
    const existing = byStart.get(bucketStart);
    if (existing) {
      existing.push(block);
      continue;
    }
    byStart.set(bucketStart, [block]);
  }

  const buckets: BlockAnalyticsBucket[] = [];
  for (let cursor = effectiveStart; cursor <= effectiveEnd; cursor += bucketMs) {
    const bucketBlocks = byStart.get(cursor) ?? EMPTY_BLOCKS;
    const txCount = bucketBlocks.reduce((sum, block) => sum + toTransactionCount(block), 0);
    const blockCount = bucketBlocks.length;
    const nonEmptyBlockCount = bucketBlocks.filter((block) => toTransactionCount(block) > 0).length;
    const finalizedBlockCount = bucketBlocks.filter((block) => block.status === 'finalized').length;
    const pendingBlockCount = blockCount - finalizedBlockCount;

    buckets.push({
      startMs: cursor,
      endMs: cursor + bucketMs,
      label: formatBucketLabel(cursor),
      shortLabel: formatBucketShortLabel(cursor),
      blockCount,
      txCount,
      nonEmptyBlockCount,
      finalizedBlockCount,
      pendingBlockCount,
      avgTxPerBlock: blockCount > 0 ? txCount / blockCount : 0,
      avgBlocksPerMinute: blockCount / (bucketMs / 60_000),
      topValidators: collectTopValidators(bucketBlocks),
      blocks: bucketBlocks
    });
  }

  return buckets;
}

function dedupeAndSortBlocks(blocks: readonly BlockSummary[]): readonly BlockSummary[] {
  const cached = normalizedBlocksCache.get(blocks);
  if (cached) {
    return cached;
  }

  const unique = new Map<string, BlockSummary>();
  for (const block of blocks) {
    unique.set(String(block.hash), block);
  }
  const normalized = [...unique.values()].sort((left, right) => toTimestamp(left) - toTimestamp(right));
  normalizedBlocksCache.set(blocks, normalized);
  return normalized;
}

function collectTopValidators(blocks: readonly BlockSummary[], limit: number = 3): readonly ValidatorCount[] {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    const validator = block.miner || 'unknown';
    counts.set(validator, (counts.get(validator) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([validator, blockCount]) => ({ validator, blockCount }))
    .sort((left, right) => right.blockCount - left.blockCount || left.validator.localeCompare(right.validator))
    .slice(0, limit);
}

function countUniqueValidators(blocks: readonly BlockSummary[]): number {
  return new Set(blocks.map((block) => block.miner || 'unknown')).size;
}

function collectNotableBlocks(blocks: readonly BlockSummary[]): readonly NotableBlock[] {
  if (blocks.length === 0) {
    return [];
  }

  const candidates: ScoredBlock[] = [];
  let highestThroughput: BlockSummary | null = null;
  let highestValue: BlockSummary | null = null;
  let newestPending: BlockSummary | null = null;
  let newestFinalized: BlockSummary | null = null;

  for (const block of blocks) {
    if (highestThroughput === null || toTransactionCount(block) > toTransactionCount(highestThroughput)) {
      highestThroughput = block;
    }
    if (highestValue === null || toTotalValue(block) > toTotalValue(highestValue)) {
      highestValue = block;
    }
    if (block.status === 'finalized') {
      if (newestFinalized === null || toTimestamp(block) > toTimestamp(newestFinalized)) {
        newestFinalized = block;
      }
      continue;
    }
    if (newestPending === null || toTimestamp(block) > toTimestamp(newestPending)) {
      newestPending = block;
    }
  }

  if (highestThroughput !== null && toTransactionCount(highestThroughput) > 0) {
    candidates.push({
      block: highestThroughput,
      label: 'Highest throughput',
      detail: `${toTransactionCount(highestThroughput)} txs in the loaded live sample`,
      tone: 'cyan',
      score: toTransactionCount(highestThroughput)
    });
  }

  if (highestValue !== null && toTotalValue(highestValue) > 0) {
    candidates.push({
      block: highestValue,
      label: 'Largest transferred value',
      detail: `${formatCompactValue(toTotalValue(highestValue))} CHERT across the block`,
      tone: 'green',
      score: toTotalValue(highestValue)
    });
  }

  if (newestPending !== null) {
    candidates.push({
      block: newestPending,
      label: 'Most recent pending block',
      detail: `${toTransactionCount(newestPending)} txs awaiting deeper finality`,
      tone: 'amber',
      score: toTimestamp(newestPending)
    });
  }

  if (newestFinalized !== null) {
    candidates.push({
      block: newestFinalized,
      label: 'Latest finalized block',
      detail: `${toTransactionCount(newestFinalized)} txs already finalized`,
      tone: 'teal',
      score: toTimestamp(newestFinalized)
    });
  }

  const seen = new Set<string>();
  const notables: NotableBlock[] = [];
  for (const candidate of candidates.sort((left, right) => right.score - left.score)) {
    const hash = String(candidate.block.hash);
    if (seen.has(hash)) {
      continue;
    }
    seen.add(hash);
    notables.push({
      block: candidate.block,
      label: candidate.label,
      detail: candidate.detail,
      tone: candidate.tone
    });
    if (notables.length === 4) {
      break;
    }
  }

  return notables;
}

function normalizeApiBucket(bucket: ApiBlockAnalyticsBucketResponse): BlockAnalyticsBucket {
  return {
    startMs: bucket.start_ms,
    endMs: bucket.end_ms,
    label: bucket.label,
    shortLabel: bucket.short_label,
    blockCount: bucket.block_count,
    txCount: bucket.tx_count,
    nonEmptyBlockCount: bucket.non_empty_block_count,
    finalizedBlockCount: bucket.finalized_block_count,
    pendingBlockCount: bucket.pending_block_count,
    avgTxPerBlock: bucket.avg_tx_per_block,
    avgBlocksPerMinute: bucket.avg_blocks_per_minute,
    topValidators: bucket.top_validators.map(normalizeApiValidatorCount),
    blocks: bucket.blocks.map(normalizeApiBlockSummary),
  };
}

function normalizeApiValidatorCount(
  count: ApiBlockAnalyticsValidatorCount
): ValidatorCount {
  return {
    validator: count.validator,
    blockCount: count.block_count,
  };
}

function normalizeApiNotableBlock(
  notable: ApiBlockAnalyticsNotableBlock
): NotableBlock {
  return {
    block: normalizeApiBlockSummary(notable.block),
    label: notable.label,
    detail: notable.detail,
    tone: notable.tone,
  };
}

function normalizeApiBlockSummary(
  block: ApiBlockAnalyticsBlockSummary
): BlockSummary {
  return {
    height: block.height as unknown as BlockSummary['height'],
    hash: block.hash as unknown as BlockSummary['hash'],
    parentHash: block.parent_hash as unknown as BlockSummary['parentHash'],
    timestamp: block.timestamp as unknown as BlockSummary['timestamp'],
    transactionCount: block.transaction_count,
    totalValue: block.total_value as unknown as BlockSummary['totalValue'],
    status: block.status,
    confirmationScore: block.confirmation_score,
    miner: block.miner as unknown as BlockSummary['miner'],
    delegateSet: [],
  };
}

function floorToBucket(timestamp: number, bucketMs: number): number {
  return Math.floor(timestamp / bucketMs) * bucketMs;
}

function toTimestamp(block: BlockSummary): number {
  return Number(block.timestamp) || 0;
}

function toTransactionCount(block: BlockSummary): number {
  return Number(block.transactionCount) || 0;
}

function toTotalValue(block: BlockSummary): number {
  return Number(block.totalValue) || 0;
}

function formatBucketLabel(timestamp: number): string {
  return bucketLabelFormatter.format(timestamp);
}

function formatBucketShortLabel(timestamp: number): string {
  return bucketShortLabelFormatter.format(timestamp);
}

function formatCompactValue(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}
