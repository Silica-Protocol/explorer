import { Inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, Subscription, interval } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EXPLORER_DATA_CONFIG, ExplorerDataConfig } from '@app/services/explorer-data.config';
import { EXPLORER_BACKEND_CONFIG, ExplorerBackendConfig } from '@services/explorer-backend.config';
import { DeterministicRandom } from '@shared/util/deterministic-rng';
import { assert } from '@shared/util/assert';
import type {
  GetBlocksResult as NodeGetBlocksResult,
  Block as NodeBlock,
  Address as NodeAddress,
  GetTransactionResult as NodeGetTransactionResult,
  TransactionHistoryResult as NodeTransactionHistoryResult,
  TransactionHistoryEntry as NodeTransactionHistoryEntry,
  Transaction as NodeTransaction,
  JsonRpcRequest,
  JsonRpcResponse
} from '@silica-protocol/node-models';
import type {
  AccountActivitySnapshot,
  AccountAddress,
  AccountSummary,
  BlockDetails,
  BlockSummary,
  Hash,
  NetworkStatistics,
  TransactionDetails,
  TransactionSummary,
  AttoValue,
  PositiveInteger,
  UnixMs,
  CommitteeId
} from '@silica-protocol/explorer-models';

export interface ExtendedNetworkStatistics extends NetworkStatistics {
  readonly dagTipCommitIndex: number;
  readonly finalizedCommitIndex: number;
  readonly dagFinalityGap: number;
  readonly txQueueSize: number;
  readonly pendingFinalityCerts: number;
  readonly isSynced: boolean;
  readonly epoch: number;
  readonly epochDurationMs: number;
  readonly epochElapsedMs: number;
  readonly timeToNextEpochMs: number;
}

export interface HealthData {
  readonly status: string;
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly nodeType: string;
  readonly timestampSeconds: number;
  readonly consensus: {
    readonly isSynced: boolean;
    readonly currentHeight: number;
    readonly dagTipCommitIndex: number;
    readonly finalizedCommitIndex: number;
    readonly dagFinalityGap: number;
    readonly txQueueSize: number;
    readonly pendingFinalityCerts: number;
    readonly validatorCount: number;
    readonly committeeSize: number;
    readonly epoch: number;
    readonly epochDurationMs: number;
    readonly epochElapsedMs: number;
    readonly timeToNextEpochMs: number;
    readonly startupGateActive: boolean;
    readonly startupReadyPeers: number;
    readonly startupExpectedReadyPeers: number;
    readonly startupVrfReadyPeers: number;
    readonly startupExpectedVrfReadyPeers: number;
    readonly startupWaitMs: number;
    readonly startupPeerReadiness: readonly {
      readonly peerId: string;
      readonly status: string;
      readonly heartbeatAgeMs: number;
      readonly commitIndex: number;
      readonly blocker: string | null;
    }[];
  };
  readonly network: {
    readonly peerCount: number;
    readonly connectedPeerCount: number;
    readonly totalPeers: number;
    readonly connectedPeers: readonly string[];
    readonly bootstrapPeers: number;
    readonly messageSuccessRate: number;
    readonly averageLatencyMs: number;
    readonly connectionQuality: number;
  };
}

export type AlertSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

export interface AlertInfo {
  readonly alert_type: string;
  readonly severity: AlertSeverity;
  readonly message: string;
  readonly timestamp: number;
  readonly resolved: boolean;
}

export interface AlertEvent {
  readonly id: string;
  readonly alert_type: string;
  readonly severity: AlertSeverity;
  readonly message: string;
  readonly timestamp: number;
  readonly resolved_at: number | null;
}

export interface AlertsResponse {
  readonly active_alerts: Record<string, AlertInfo>;
  readonly alert_history: AlertEvent[];
}

interface MutableAccountState {
  readonly address: AccountAddress;
  balance: number;
  stakedBalance: number;
  nonce: number;
  reputation: number;
  lastSeen: number;
  outbound: TransactionSummary[];
  inbound: TransactionSummary[];
  recentBlocks: Hash[];
}

const COMMITTEE_SIZE = 8;
const RECENT_ACCOUNT_ACTIVITY_LIMIT = 32;
const RECENT_BLOCKS_PER_ACCOUNT = 10;
const LATEST_TRANSACTIONS_LIMIT = 256;
const AVERAGE_TPS_SAMPLE = 24;

@Injectable({ providedIn: 'root' })
export class ExplorerDataService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly rng: DeterministicRandom;
  private readonly blocksSubject = new BehaviorSubject<readonly BlockSummary[]>([]);
  private readonly transactionsSubject = new BehaviorSubject<readonly TransactionSummary[]>([]);
  private readonly networkSubject = new BehaviorSubject<ExtendedNetworkStatistics>(this.emptyNetworkStats());
  private readonly healthSubject = new BehaviorSubject<HealthData | null>(null);
  private readonly alertsSubject = new BehaviorSubject<AlertsResponse>({ active_alerts: {}, alert_history: [] });
  private readonly accountsSubject = new BehaviorSubject<readonly AccountSummary[]>([]);
  private readonly lastRefreshedAtSubject = new BehaviorSubject<number | null>(null);
  private readonly refreshInFlightSubject = new BehaviorSubject<boolean>(false);
  private readonly hasMoreBlocksSubject = new BehaviorSubject<boolean>(false);
  private readonly loadingMoreBlocksSubject = new BehaviorSubject<boolean>(false);

  private readonly accounts = new Map<AccountAddress, MutableAccountState>();
  private readonly blockDetails = new Map<Hash, BlockDetails>();
  private readonly transactionDetails = new Map<Hash, TransactionDetails>();
  private readonly latestTransactions: TransactionSummary[] = [];
  private readonly accountPool: AccountAddress[] = [];
  private readonly committeePool: CommitteeId[] = [];

  private currentCommittee: readonly CommitteeId[] = [];
  private nextElectionTimestamp = Date.now();
  private blockHeightCounter = 0;
  private latestBlockHash: Hash | null = null;
  private initialized = false;
  private running = false;
  private tickSub: Subscription | null = null;

  private nodePollInFlight = false;
  private nodeLatestHeight = 0;
  private nodeBlocksCursor: number | undefined = undefined;
  private nodeBlocksLoadingMore = false;

  constructor(
    @Inject(EXPLORER_DATA_CONFIG) private readonly config: ExplorerDataConfig,
    @Inject(EXPLORER_BACKEND_CONFIG) private readonly backend: ExplorerBackendConfig,
    private readonly zone: NgZone,
    private readonly http: HttpClient
  ) {
    assert(config.maxBlocks > 0, 'maxBlocks must be positive');
    assert(config.initialBlockCount > 0, 'initialBlockCount must be positive');
    assert(config.txPerBlockMin > 0, 'txPerBlockMin must be positive');
    assert(config.txPerBlockMax >= config.txPerBlockMin, 'txPerBlockMax must be >= min');

    this.rng = new DeterministicRandom(config.seed);
    if (this.backend.mode === 'mock') {
      this.accountPool = this.createAccountPool(config.accountCount);
      this.committeePool = this.createCommitteePool(Math.max(COMMITTEE_SIZE * 4, COMMITTEE_SIZE));
      this.currentCommittee = this.committeePool.slice(0, COMMITTEE_SIZE);
      this.nextElectionTimestamp = Date.now() + config.blockIntervalMs * 32;

      this.accountPool.forEach((address) => {
        this.ensureAccount(address);
      });
      this.publishAccountSnapshots();
    } else {
      // Node backend starts empty and is populated from live chain data.
      this.accountPool = [];
      this.committeePool = [];
      this.currentCommittee = [];
      this.nextElectionTimestamp = Date.now();
      this.publishAccountSnapshots();
    }

    if (config.autoStart) {
      this.start();
    }
  }

  get blocks$(): Observable<readonly BlockSummary[]> {
    return this.blocksSubject.asObservable();
  }

  get recentTransactions$(): Observable<readonly TransactionSummary[]> {
    return this.transactionsSubject.asObservable();
  }

  get networkStats$(): Observable<ExtendedNetworkStatistics> {
    return this.networkSubject.asObservable();
  }

  get health$(): Observable<HealthData | null> {
    return this.healthSubject.asObservable();
  }

  get alerts$(): Observable<AlertsResponse> {
    return this.alertsSubject.asObservable();
  }

  get accounts$(): Observable<readonly AccountSummary[]> {
    return this.accountsSubject.asObservable();
  }

  /** Last successful refresh timestamp (ms since epoch), or null if not yet refreshed. */
  get lastRefreshedAt$(): Observable<number | null> {
    return this.lastRefreshedAtSubject.asObservable();
  }

  /** True while a refresh is in-flight (node mode only). */
  get refreshInFlight$(): Observable<boolean> {
    return this.refreshInFlightSubject.asObservable();
  }

  /** Manual refresh action for the UI. */
  refreshNow(): void {
    if (this.backend.mode === 'node') {
      void this.refreshFromNode();
      return;
    }

    // In mock mode, "refresh" means advancing the simulated chain by one block.
    if (!this.initialized) {
      this.seedInitialState();
      this.initialized = true;
    }
    this.generateNextBlock(Date.now());
    this.lastRefreshedAtSubject.next(Date.now());
  }

  async fetchTransactionByHash(txId: string): Promise<NodeGetTransactionResult> {
    const trimmed = txId.trim();
    assert(trimmed.length > 0, 'Transaction hash must not be empty');
    return await this.jsonRpcCall<NodeGetTransactionResult>('get_transaction', { tx_id: trimmed });
  }

  async fetchTransactionHistory(
    address: string,
    limit: number = 50,
    cursor: string | null = null
  ): Promise<NodeTransactionHistoryResult> {
    const params: Record<string, unknown> = { limit };
    if (address) {
      params['address'] = address.trim();
    }
    if (cursor) {
      params['cursor'] = cursor;
    }
    return await this.jsonRpcCall<NodeTransactionHistoryResult>('get_transaction_history', params);
  }

  async fetchTransactionByHashFromNode(txHash: string): Promise<TransactionDetails | null> {
    const trimmed = txHash.trim();
    if (trimmed.length === 0) {
      return null;
    }

    try {
      console.log('Fetching tx:', trimmed);
      
      const txResult = await this.fetchTransactionByHash(trimmed);
      console.log('Got tx result:', txResult);
      
      if (txResult && txResult.status !== 'not_found') {
        const extended = txResult as unknown as Record<string, unknown>;
        return {
          hash: txResult.tx_id as Hash,
          blockHash: (extended['block_hash'] as Hash) || ('' as Hash),
          blockHeight: this.toPositiveInteger((extended['block_number'] as number) || 0),
          from: txResult.sender as unknown as AccountAddress,
          to: txResult.recipient as unknown as AccountAddress,
          value: this.toAttoValue(txResult.amount ?? 0),
          fee: this.toAttoValue(txResult.fee ?? 0),
          timestamp: txResult.timestamp as unknown as UnixMs,
          status: txResult.status as unknown as import('@silica-protocol/explorer-models').TransactionStatus,
          inputs: [],
          outputs: [],
          confirmations: 0
        };
      }

      console.log('Tx not found');
      return null;
    } catch (e) {
      console.error('Error fetching tx:', e);
      return null;
    }
  }

  async searchBlocks(query: string, limit: number = 10): Promise<readonly BlockSummary[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }

    const numericQuery = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;

    try {
      if (numericQuery !== null) {
        const result = await this.jsonRpcCall<unknown>('eth_getBlockByNumber', { block_number: numericQuery, include_txs: true });
        const blocks = this.extractBlocksFromLookupResult(result);
        if (blocks.length > 0) {
          return this.convertBlocksToSummaries(blocks.slice(0, limit));
        }
        return [];
      }

      const result = await this.jsonRpcCall<unknown>('get_block_by_hash', { block_hash: trimmed, include_txs: true });
      const blocks = this.extractBlocksFromLookupResult(result);
      if (blocks.length > 0) {
        return this.convertBlocksToSummaries(blocks.slice(0, limit));
      }

      return [];
    } catch {
      return [];
    }
  }

  async searchTransactions(query: string, limit: number = 10): Promise<readonly TransactionDetails[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }

    try {
      const result = await this.fetchTransactionByHash(trimmed);
      if (result && result.status !== 'not_found') {
        const extended = result as unknown as Record<string, unknown>;
        const tx: TransactionDetails = {
          hash: result.tx_id as Hash,
          blockHash: (extended['block_hash'] as Hash) || ('' as Hash),
          blockHeight: this.toPositiveInteger((extended['block_number'] as number) || 0),
          from: result.sender as unknown as AccountAddress,
          to: result.recipient as unknown as AccountAddress,
          value: this.toAttoValue(result.amount ?? 0),
          fee: this.toAttoValue(result.fee ?? 0),
          timestamp: result.timestamp as unknown as UnixMs,
          status: result.status as unknown as import('@silica-protocol/explorer-models').TransactionStatus,
          inputs: [],
          outputs: [],
          confirmations: 0
        };
        return [tx];
      }
      return [];
    } catch {
      return [];
    }
  }

  async fetchBlockByHash(blockHash: string): Promise<BlockDetails | null> {
    const trimmed = blockHash.trim();
    if (trimmed.length === 0) {
      return null;
    }

    try {
      const result = await this.jsonRpcCall<unknown>('get_block_by_hash', { block_hash: trimmed, include_txs: true });
      const blocks = this.extractBlocksFromLookupResult(result);
      if (blocks.length > 0) {
        const details = this.nodeToExplorerBlock(blocks[0]);
        this.blockDetails.set(details.hash, details);
        for (const tx of details.transactions) {
          this.transactionDetails.set(tx.hash, tx as TransactionDetails);
        }
        return details;
      }
      return null;
    } catch (e) {
      console.error('Error fetching block:', e);
      return null;
    }
  }

  async fetchBlockByNumber(blockNumber: number): Promise<BlockDetails | null> {
    try {
      const result = await this.jsonRpcCall<unknown>('eth_getBlockByNumber', { block_number: blockNumber, include_txs: true });
      const blocks = this.extractBlocksFromLookupResult(result);
      if (blocks.length > 0) {
        const details = this.nodeToExplorerBlock(blocks[0]);
        this.blockDetails.set(details.hash, details);
        for (const tx of details.transactions) {
          this.transactionDetails.set(tx.hash, tx as TransactionDetails);
        }
        return details;
      }
      return null;
    } catch (e) {
      console.error('Error fetching block:', e);
      return null;
    }
  }

  private convertBlocksToSummaries(blocks: readonly NodeBlock[]): BlockSummary[] {
    return blocks.map(block => {
      const height = this.toPositiveInteger(block.block_number);
      const transactions = this.getNodeBlockTransactions(block);
      const transactionCount = this.getNodeBlockTransactionCount(block, transactions);
      const totalValue = this.toAttoValue(
        transactions.reduce((sum: number, tx: NodeTransaction) => sum + (Number(tx.amount) || 0), 0)
      );
      return {
        height,
        hash: block.block_hash as Hash,
        parentHash: block.previous_block_hash as Hash | null,
        timestamp: this.toUnixMsFromRfc3339(block.timestamp),
        transactionCount,
        totalValue,
        status: 'pending' as const,
        confirmationScore: 0,
        miner: this.nodeAddressToAccountAddress(block.validator_address, 'validator'),
        delegateSet: []
      };
    });
  }

  private convertTxToDetails(tx: NodeTransactionHistoryEntry): TransactionDetails {
    return {
      hash: tx.tx_id as Hash,
      blockHash: tx.block_hash as Hash,
      blockHeight: this.toPositiveInteger(tx.block_number),
      from: tx.sender as unknown as import('@silica-protocol/explorer-models').AccountAddress,
      to: tx.recipient as unknown as import('@silica-protocol/explorer-models').AccountAddress,
      value: this.toAttoValue(tx.amount),
      fee: this.toAttoValue(tx.fee),
      timestamp: tx.timestamp as unknown as import('@silica-protocol/explorer-models').UnixMs,
      status: tx.status as unknown as import('@silica-protocol/explorer-models').TransactionStatus,
      inputs: [],
      outputs: [],
      confirmations: 0
    };
  }

  async fetchBalance(address: string): Promise<{ address: string; balance: string; nonce: number }> {
    const trimmed = address.trim();
    assert(trimmed.length > 0, 'Address must not be empty');
    const result = await this.jsonRpcCall<{ address: string; balance: string; nonce: number }>(
      'get_balance',
      { address: trimmed }
    );
    assert(typeof result.balance === 'string', 'Balance must be a string');
    assert(Number.isFinite(result.nonce), 'Nonce must be a number');
    return result;
  }

  async fetchStakingInfo(): Promise<{
    total_staked: string;
    total_validators: number;
    active_delegators: number;
    avg_apy: number;
    total_rewards: string;
  }> {
    return await this.jsonRpcCall<{
      total_staked: string;
      total_validators: number;
      active_delegators: number;
      avg_apy: number;
      total_rewards: string;
    }>('get_staking_info', {});
  }

  async fetchStakingDelegations(limit: number = 50): Promise<Array<{
    validator_address: string;
    delegator_address: string;
    amount: string;
    rewards: string;
    last_claimed: string;
  }>> {
    return await this.jsonRpcCall<Array<{
      validator_address: string;
      delegator_address: string;
      amount: string;
      rewards: string;
      last_claimed: string;
    }>>('get_staking_delegations', { limit });
  }

  async fetchPrivacyInfo(): Promise<{
    total_shielded: string;
    total_unshielded: string;
    active_shielded_accounts: number;
    pending_operations: number;
  }> {
    return await this.jsonRpcCall<{
      total_shielded: string;
      total_unshielded: string;
      active_shielded_accounts: number;
      pending_operations: number;
    }>('get_privacy_info', {});
  }

  async fetchPrivacyOperations(limit: number = 50): Promise<Array<{
    id: string;
    type: 'shield' | 'unshield' | 'transfer';
    sender: string;
    recipient: string;
    amount: string;
    status: 'pending' | 'completed' | 'failed';
    timestamp: string;
    tx_hash: string;
  }>> {
    return await this.jsonRpcCall<Array<{
      id: string;
      type: 'shield' | 'unshield' | 'transfer';
      sender: string;
      recipient: string;
      amount: string;
      status: 'pending' | 'completed' | 'failed';
      timestamp: string;
      tx_hash: string;
    }>>('get_privacy_operations', { limit });
  }

  async fetchGovernanceInfo(): Promise<{
    active_proposals: number;
    total_proposals: number;
    dao_treasury: string;
    voter_participation: number;
  }> {
    return await this.jsonRpcCall<{
      active_proposals: number;
      total_proposals: number;
      dao_treasury: string;
      voter_participation: number;
    }>('get_governance_info', {});
  }

  async fetchProposals(status?: string, limit: number = 20): Promise<Array<{
    id: string;
    title: string;
    description: string;
    status: 'active' | 'passed' | 'rejected' | 'executed';
    votes_for: string;
    votes_against: string;
    quorum: number;
    end_time: string;
    proposer: string;
  }>> {
    return await this.jsonRpcCall<Array<{
      id: string;
      title: string;
      description: string;
      status: 'active' | 'passed' | 'rejected' | 'executed';
      votes_for: string;
      votes_against: string;
      quorum: number;
      end_time: string;
      proposer: string;
    }>>('get_proposals', { status, limit });
  }

  async fetchTreasury(): Promise<{
    total_balance: string;
    last_month_in: string;
    last_month_out: string;
  }> {
    return await this.jsonRpcCall<{
      total_balance: string;
      last_month_in: string;
      last_month_out: string;
    }>('get_treasury', {});
  }

  async fetchTokens(limit: number = 50): Promise<Array<{
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    total_supply: string;
    holder_count: number;
    transfer_count: number;
  }>> {
    return await this.jsonRpcCall<Array<{
      address: string;
      name: string;
      symbol: string;
      decimals: number;
      total_supply: string;
      holder_count: number;
      transfer_count: number;
    }>>('get_tokens', { limit });
  }

  async fetchToken(tokenAddress: string): Promise<{
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    total_supply: string;
    holder_count: number;
    transfer_count: number;
    creator: string;
    deploy_block: number;
  }> {
    return await this.jsonRpcCall<{
      address: string;
      name: string;
      symbol: string;
      decimals: number;
      total_supply: string;
      holder_count: number;
      transfer_count: number;
      creator: string;
      deploy_block: number;
    }>('get_token', { address: tokenAddress });
  }

  async fetchTokenHolders(tokenAddress: string, limit: number = 50): Promise<Array<{
    address: string;
    balance: string;
    percentage: number;
  }>> {
    return await this.jsonRpcCall<Array<{
      address: string;
      balance: string;
      percentage: number;
    }>>('get_token_holders', { address: tokenAddress, limit });
  }

  async fetchTokenTransfers(tokenAddress: string, limit: number = 50): Promise<Array<{
    hash: string;
    from: string;
    to: string;
    value: string;
    timestamp: string;
  }>> {
    return await this.jsonRpcCall<Array<{
      hash: string;
      from: string;
      to: string;
      value: string;
      timestamp: string;
    }>>('get_token_transfers', { address: tokenAddress, limit });
  }

  async fetchContractCode(contractAddress: string): Promise<{
    code: string;
    bytecode: string;
    is_verified: boolean;
  }> {
    return await this.jsonRpcCall<{
      code: string;
      bytecode: string;
      is_verified: boolean;
    }>('get_contract_code', { address: contractAddress });
  }

  async fetchContractAbi(contractAddress: string): Promise<{
    abi: string;
    is_verified: boolean;
  }> {
    return await this.jsonRpcCall<{
      abi: string;
      is_verified: boolean;
    }>('get_contract_abi', { address: contractAddress });
  }

  async fetchEvents(params: {
    address?: string;
    transactionHash?: string;
    fromBlock?: number;
    toBlock?: number;
    limit?: number;
  }): Promise<Array<{
    address: string;
    topics: string[];
    data: string;
    transactionHash: string;
    blockNumber: number;
    logIndex: number;
    timestamp: string;
  }>> {
    return await this.jsonRpcCall<Array<{
      address: string;
      topics: string[];
      data: string;
      transactionHash: string;
      blockNumber: number;
      logIndex: number;
      timestamp: string;
    }>>('get_events', params);
  }

  async fetchAnalytics(): Promise<{
    tps_history: Array<{ timestamp: string; tps: number }>;
    gas_usage: Array<{ timestamp: string; gas_used: number }>;
    tx_volume: Array<{ timestamp: string; volume: number }>;
  }> {
    return await this.jsonRpcCall<{
      tps_history: Array<{ timestamp: string; tps: number }>;
      gas_usage: Array<{ timestamp: string; gas_used: number }>;
      tx_volume: Array<{ timestamp: string; volume: number }>;
    }>('get_analytics', {});
  }

  async fetchChainParameters(): Promise<{
    chain_id: number;
    block_time_ms: number;
    max_block_size: number;
    max_tx_per_block: number;
    gas_price_min: string;
    gas_price_max: string;
    validator_count: number;
    committee_size: number;
    epoch_duration_blocks: number;
    min_stake: string;
    reward_rate: string;
  }> {
    return await this.jsonRpcCall<{
      chain_id: number;
      block_time_ms: number;
      max_block_size: number;
      max_tx_per_block: number;
      gas_price_min: string;
      gas_price_max: string;
      validator_count: number;
      committee_size: number;
      epoch_duration_blocks: number;
      min_stake: string;
      reward_rate: string;
    }>('get_chain_parameters', {});
  }

  async fetchNodes(): Promise<Array<{
    node_id: string;
    address: string;
    status: 'online' | 'offline' | 'syncing';
    height: number;
    latency_ms: number;
    last_block_time: string;
    version: string;
    uptime_seconds: number;
  }>> {
    const response = await this.jsonRpcCall<{nodes: Array<{
      node_id: string;
      address: string;
      status: 'online' | 'offline' | 'syncing';
      height: number;
      latency_ms: number;
      last_block_time: string;
      version: string;
      uptime_seconds: number;
    }>}>('get_nodes', {});
    return response.nodes;
  }

  async fetchBridgeHistory(limit: number = 50): Promise<Array<{
    id: string;
    type: 'deposit' | 'withdraw';
    source_chain: string;
    destination_chain: string;
    sender: string;
    recipient: string;
    amount: string;
    status: 'pending' | 'completed' | 'failed';
    timestamp: string;
    tx_hash: string;
  }>> {
    return await this.jsonRpcCall<Array<{
      id: string;
      type: 'deposit' | 'withdraw';
      source_chain: string;
      destination_chain: string;
      sender: string;
      recipient: string;
      amount: string;
      status: 'pending' | 'completed' | 'failed';
      timestamp: string;
      tx_hash: string;
    }>>('get_bridge_history', { limit });
  }

  async fetchBridgeStats(): Promise<{
    total_deposits: string;
    total_withdraws: string;
    active_transfers: number;
    supported_chains: string[];
  }> {
    return await this.jsonRpcCall<{
      total_deposits: string;
      total_withdraws: string;
      active_transfers: number;
      supported_chains: string[];
    }>('get_bridge_stats', {});
  }

  start(): void {
    if (this.running) {
      return;
    }

    if (this.backend.mode === 'node') {
      this.running = true;

      // Poll immediately, then on an interval.
      void this.refreshFromNode();

      this.zone.runOutsideAngular(() => {
        this.tickSub = interval(this.config.blockIntervalMs)
          .pipe(takeUntil(this.destroy$))
          .subscribe(() => void this.refreshFromNode());
      });
      return;
    }

    if (!this.initialized) {
      this.seedInitialState();
      this.initialized = true;
    }

    this.running = true;
    this.zone.runOutsideAngular(() => {
      this.tickSub = interval(this.config.blockIntervalMs)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.generateNextBlock(Date.now()));
    });
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    if (this.tickSub) {
      this.tickSub.unsubscribe();
      this.tickSub = null;
    }
  }

  ngOnDestroy(): void {
    this.stop();
    this.destroy$.next();
    this.destroy$.complete();
    this.blocksSubject.complete();
    this.transactionsSubject.complete();
    this.networkSubject.complete();
    this.healthSubject.complete();
    this.alertsSubject.complete();
    this.accountsSubject.complete();
    this.lastRefreshedAtSubject.complete();
    this.refreshInFlightSubject.complete();
  }

  getBlockDetails(hash: Hash): BlockDetails | undefined {
    return this.blockDetails.get(hash);
  }

  getTransactionDetails(hash: Hash): TransactionDetails | undefined {
    return this.transactionDetails.get(hash);
  }

  getAccountSnapshot(address: AccountAddress): AccountActivitySnapshot | undefined {
    const state = this.accounts.get(address);
    if (!state) {
      return undefined;
    }

    const recentBlocks: BlockSummary[] = state.recentBlocks
      .map((hash) => this.blockDetails.get(hash))
      .filter((block): block is BlockDetails => block !== undefined)
      .map((block) => this.toSummary(block));

    return {
      account: this.toAccountSummary(state),
      outbound: [...state.outbound],
      inbound: [...state.inbound],
      recentBlocks
    };
  }

  private seedInitialState(): void {
    const now = Date.now();
    const startTimestamp = now - this.config.blockIntervalMs * this.config.initialBlockCount;

    for (let i = 0; i < this.config.initialBlockCount; i += 1) {
      const timestamp = startTimestamp + i * this.config.blockIntervalMs;
      this.generateNextBlock(timestamp);
    }
  }

  private generateNextBlock(timestamp: number): void {
    assert(Number.isFinite(timestamp), 'Timestamp must be finite');
    this.blockHeightCounter += 1;
    const height = this.toPositiveInteger(this.blockHeightCounter);
    const parentHash = this.latestBlockHash;
    const blockHash = this.randomHash();
    const transactionCount = this.rng.nextInt(this.config.txPerBlockMin, this.config.txPerBlockMax);
    assert(transactionCount > 0, 'Block must contain transactions');

    const miner = this.pickMiner();
    const transactions = this.createTransactions(transactionCount, blockHash, height, timestamp, miner);
    const totalValue = this.computeTotalValue(transactions);
    const status = this.determineStatus(height);
    const confirmationScore = this.rng.nextInt(2, 8);
    const delegateSet = this.currentCommittee.slice();

    const summary: BlockSummary = {
      height,
      hash: blockHash,
      parentHash,
      timestamp: this.toUnixMs(timestamp),
      transactionCount,
      totalValue,
      status,
      confirmationScore,
      miner,
      delegateSet
    };

    const details: BlockDetails = {
      ...summary,
      transactions
    };

    this.blockDetails.set(blockHash, details);
    this.latestBlockHash = blockHash;
    this.pushBlock(summary);
    this.updateFinality(summary.height);
    this.maybeRotateCommittee(summary.height, timestamp);
    this.updateNetworkStats(summary.height);
    this.transactionsSubject.next([...this.latestTransactions]);
  }

  private pushBlock(block: BlockSummary): void {
    const blocks = [block, ...this.blocksSubject.getValue()];

    if (blocks.length > this.config.maxBlocks) {
      const excess = blocks.length - this.config.maxBlocks;
      for (let i = 0; i < excess; i += 1) {
        const removed = blocks.shift();
        if (removed) {
          const details = this.blockDetails.get(removed.hash);
          if (details) {
            details.transactions.forEach((tx: TransactionSummary) => {
              this.transactionDetails.delete(tx.hash);
            });
            this.blockDetails.delete(removed.hash);
            this.removeTransactionsFromLatest(details.transactions);
          }
          this.trimAccountsForRemovedBlock(removed.hash);
        }
      }
    }

    this.blocksSubject.next(blocks);
  }

  private updateFinality(currentHeight: PositiveInteger): void {
    const finalizedThreshold = Math.max(0, (currentHeight as number) - this.config.finalityLag);
    this.applyFinality(finalizedThreshold);
  }

  private updateFinalityFromHeight(finalizedThreshold: PositiveInteger): void {
    this.applyFinality(finalizedThreshold as number);
  }

  private applyFinality(finalizedThreshold: number): void {
    const updated = this.blocksSubject.getValue().map((block: BlockSummary) => {
      let nextStatus = block.status;
      if ((block.height as number) <= finalizedThreshold) {
        nextStatus = 'finalized';
      } else {
        nextStatus = 'pending';
      }

      if (nextStatus !== block.status) {
        const details = this.blockDetails.get(block.hash);
        if (details) {
          this.blockDetails.set(block.hash, { ...details, status: nextStatus });
        }
        return { ...block, status: nextStatus };
      }

      return block;
    });

    this.blocksSubject.next(updated);
  }

  private maybeRotateCommittee(height: PositiveInteger, timestamp: number): void {
    if ((height as number) % 32 === 0) {
      this.currentCommittee = this.pickCommittee(COMMITTEE_SIZE);
      this.nextElectionTimestamp = timestamp + this.config.blockIntervalMs * 32;
    }
  }

  private updateNetworkStats(currentHeight: PositiveInteger): void {
    const blocks = this.blocksSubject.getValue();
    const sample = blocks.slice(-AVERAGE_TPS_SAMPLE);
    const totalTransactions = sample.reduce(
      (sum: number, block: BlockSummary) => sum + block.transactionCount,
      0
    );
    const totalSeconds = (sample.length * this.config.blockIntervalMs) / 1000;
    const averageTps = totalSeconds > 0 ? Number((totalTransactions / totalSeconds).toFixed(2)) : 0;

    const finalizedHeightNumber = Math.max(0, (currentHeight as number) - this.config.finalityLag);
    const finalizedHeight = this.toPositiveInteger(finalizedHeightNumber);

    const stats: ExtendedNetworkStatistics = {
      currentHeight,
      finalizedHeight,
      averageTps,
      activeValidators: this.currentCommittee.length,
      nextElectionEtaMs: Math.max(0, this.nextElectionTimestamp - Date.now()),
      timestamp: this.toUnixMs(Date.now()),
      dagTipCommitIndex: 0,
      finalizedCommitIndex: 0,
      dagFinalityGap: 0,
      txQueueSize: 0,
      pendingFinalityCerts: 0,
      isSynced: true,
      epoch: 0,
      epochDurationMs: 0,
      epochElapsedMs: 0,
      timeToNextEpochMs: 0
    };

    this.networkSubject.next(stats);
  }

  private createTransactions(
    count: number,
    blockHash: Hash,
    height: PositiveInteger,
    timestamp: number,
    miner: AccountAddress
  ): TransactionSummary[] {
    const transactions: TransactionSummary[] = [];

    for (let i = 0; i < count; i += 1) {
      const from = this.pickAccount();
      let to = this.pickAccount();
      if (to === from) {
        to = this.pickAccount(from);
      }

      const value = this.randomValue();
      const fee = this.randomFee();
      const txHash = this.randomHash();
      const transaction: TransactionSummary = {
        hash: txHash,
        blockHash,
        blockHeight: height,
        from,
        to,
        value,
        fee,
        timestamp: this.toUnixMs(timestamp),
        status: 'confirmed',
        memo: this.maybeMemo()
      };

      transactions.push(transaction);
      this.applyTransaction(transaction, timestamp, blockHash, miner);
      this.storeTransactionDetails(transaction);
      this.trackLatestTransaction(transaction);
    }

    return transactions;
  }

  private applyTransaction(
    transaction: TransactionSummary,
    timestamp: number,
    blockHash: Hash,
    miner: AccountAddress
  ): void {
    const minerState = this.ensureAccount(miner);
    const sender = this.ensureAccount(transaction.from);
    const recipient = this.ensureAccount(transaction.to);
    const value = transaction.value as number;
    const fee = transaction.fee as number;

    sender.balance = Math.max(0, sender.balance - value - fee);
    sender.nonce += 1;
    sender.lastSeen = timestamp;
    sender.outbound.unshift(transaction);
    sender.recentBlocks = this.pushUniqueBlock(sender.recentBlocks, blockHash);
    sender.outbound.splice(RECENT_ACCOUNT_ACTIVITY_LIMIT);

    recipient.balance += value;
    recipient.lastSeen = timestamp;
    recipient.inbound.unshift(transaction);
    recipient.recentBlocks = this.pushUniqueBlock(recipient.recentBlocks, blockHash);
    recipient.inbound.splice(RECENT_ACCOUNT_ACTIVITY_LIMIT);

    minerState.balance += fee;
    minerState.lastSeen = timestamp;
    minerState.recentBlocks = this.pushUniqueBlock(minerState.recentBlocks, blockHash);

    this.publishAccountSnapshots();
  }

  private storeTransactionDetails(transaction: TransactionSummary): void {
    const inputs = this.randomHashList(2, 5);
    const outputs = this.randomHashList(1, 4);
    const confirmations = this.rng.nextInt(1, 20);
    const details: TransactionDetails = {
      ...transaction,
      inputs,
      outputs,
      confirmations
    };

    this.transactionDetails.set(transaction.hash, details);
  }

  private trackLatestTransaction(transaction: TransactionSummary): void {
    this.latestTransactions.unshift(transaction);
    if (this.latestTransactions.length > LATEST_TRANSACTIONS_LIMIT) {
      this.latestTransactions.length = LATEST_TRANSACTIONS_LIMIT;
    }
  }

  private removeTransactionsFromLatest(transactions: readonly TransactionSummary[]): void {
    if (transactions.length === 0 || this.latestTransactions.length === 0) {
      return;
    }
    const hashesToRemove = new Set(transactions.map((tx) => tx.hash));
    if (hashesToRemove.size === 0) {
      return;
    }
    for (let i = this.latestTransactions.length - 1; i >= 0; i -= 1) {
      if (hashesToRemove.has(this.latestTransactions[i].hash)) {
        this.latestTransactions.splice(i, 1);
      }
    }
  }

  private pushUniqueBlock(list: Hash[], hash: Hash): Hash[] {
    const next = [hash, ...list.filter((value) => value !== hash)];
    if (next.length > RECENT_BLOCKS_PER_ACCOUNT) {
      next.length = RECENT_BLOCKS_PER_ACCOUNT;
    }
    return next;
  }

  private pushUniqueTx(list: TransactionSummary[], tx: TransactionSummary): TransactionSummary[] {
    const next = [tx, ...list.filter((value) => value.hash !== tx.hash)];
    if (next.length > RECENT_ACCOUNT_ACTIVITY_LIMIT) {
      next.length = RECENT_ACCOUNT_ACTIVITY_LIMIT;
    }
    return next;
  }

  private publishAccountSnapshots(): void {
    const summaries = Array.from(this.accounts.values()).map((state) => this.toAccountSummary(state));
    this.accountsSubject.next(summaries);
  }

  private determineStatus(_: PositiveInteger): BlockSummary['status'] {
    // In mock mode we treat everything as pending.
    if (this.backend.mode === 'mock') {
      return 'pending';
    }

    // For node-backed data, we approximate finality using a configurable finality lag.
    // NOTE: This is a UI-level heuristic until the node exposes explicit finality.
    return 'pending';
  }

  private computeTotalValue(transactions: TransactionSummary[]): AttoValue {
    const total = transactions.reduce((sum, tx) => sum + (tx.value as number), 0);
    return this.toAttoValue(total);
  }

  private pickMiner(): AccountAddress {
    return this.accountPool[this.rng.nextInt(0, this.accountPool.length - 1)];
  }

  private pickAccount(exclude?: AccountAddress): AccountAddress {
    assert(this.accountPool.length > 0, 'Account pool must not be empty');
    let candidate = this.accountPool[this.rng.nextInt(0, this.accountPool.length - 1)];
    if (exclude && candidate === exclude) {
      candidate = this.accountPool[(this.accountPool.indexOf(candidate) + 1) % this.accountPool.length];
    }
    return candidate;
  }

  private pickCommittee(size: number): readonly CommitteeId[] {
    assert(size > 0, 'Committee size must be positive');
    const shuffled = [...this.committeePool];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = this.rng.nextInt(0, i);
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }
    return shuffled.slice(0, size);
  }

  private randomHash(): Hash {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = this.rng.nextInt(0, 255);
    }
    let result = '';
    for (let i = 0; i < bytes.length; i += 1) {
      result += bytes[i].toString(16).padStart(2, '0');
    }
    return result as Hash;
  }

  private randomHashList(min: number, max: number): Hash[] {
    const length = this.rng.nextInt(min, max);
    const list: Hash[] = [];
    for (let i = 0; i < length; i += 1) {
      list.push(this.randomHash());
    }
    return list;
  }

  private randomValue(): AttoValue {
    const value = this.rng.nextInt(50_000, 5_000_000);
    return this.toAttoValue(value);
  }

  private randomFee(): AttoValue {
    const value = this.rng.nextInt(500, 5_000);
    return this.toAttoValue(value);
  }

  private maybeMemo(): string | undefined {
    if (this.rng.nextInt(0, 4) === 0) {
      const phrases = ['NUW credit', 'Research reward', 'Validator payout', 'Bridge event'];
      return phrases[this.rng.nextInt(0, phrases.length - 1)];
    }
    return undefined;
  }

  private ensureAccount(address: AccountAddress): MutableAccountState {
    let state = this.accounts.get(address);
    if (!state) {
      const now = Date.now();

      if (this.backend.mode === 'node') {
        state = {
          address,
          balance: 0,
          stakedBalance: 0,
          nonce: 0,
          reputation: 0,
          lastSeen: now,
          outbound: [],
          inbound: [],
          recentBlocks: []
        };
        this.accounts.set(address, state);
        return state;
      }

      state = {
        address,
        balance: this.rng.nextInt(50_000_000, 200_000_000),
        stakedBalance: this.rng.nextInt(5_000_000, 50_000_000),
        nonce: 0,
        reputation: Number((0.4 + this.rng.next() * 0.6).toFixed(2)),
        lastSeen: now,
        outbound: [],
        inbound: [],
        recentBlocks: []
      };
      this.accounts.set(address, state);
    }
    return state;
  }

  private nodeEndpoint(path: string): string {
    const base = (this.backend.nodeBaseUrl || 'https://rpc.testnet.silicaprotocol.network').trim();
    assert(base.length > 0, 'nodeBaseUrl must not be empty');
    const url = new URL(base.endsWith('/') ? base : `${base}/`);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    return url.toString();
  }

  async fetchAlerts(): Promise<AlertsResponse> {
    try {
      const response = await firstValueFrom(
        this.http.get<AlertsResponse>(this.nodeEndpoint('alerts'))
      );
      this.alertsSubject.next(response);
      return response;
    } catch (err) {
      console.warn('Failed to fetch alerts', err);
      return { active_alerts: {}, alert_history: [] };
    }
  }

  private async jsonRpcCall<TResult>(method: string, params?: unknown): Promise<TResult> {
    assert(method.length > 0, 'JSON-RPC method must not be empty');
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: 1
    };
    const response = await firstValueFrom(
      this.http.post<JsonRpcResponse<TResult>>(this.nodeEndpoint('jsonrpc'), request)
    );

    if (response.error) {
      throw new Error(`JSON-RPC error ${response.error.code}: ${response.error.message}`);
    }
    if (response.result === undefined) {
      throw new Error('JSON-RPC response missing result');
    }
    return response.result;
  }

  private toUnixMsFromRfc3339(timestamp: string): UnixMs {
    let ms = Date.parse(timestamp);
    if (!Number.isFinite(ms)) {
      const normalized = timestamp.replace(/\.(\d{3})\d+Z$/, '.$1Z');
      ms = Date.parse(normalized);
    }
    assert(Number.isFinite(ms), 'Invalid RFC3339 timestamp');
    return this.toUnixMs(ms);
  }

  private nodeAddressToAccountAddress(address: NodeAddress, label: string): AccountAddress {
    // Node-models uses Address branding, explorer-models uses AccountAddress branding.
    // Both are backed by strings but intentionally incompatible at the type level.
    const raw = address as unknown as string;
    assert(typeof raw === 'string', `${label} must be a string`);
    assert(raw.trim().length > 0, `${label} must not be empty`);

    // Address format depends on network; keep this validation permissive.

    return raw as unknown as AccountAddress;
  }

  private nodeToExplorerTx(block: NodeBlock, tx: NodeTransaction): TransactionDetails {
    const raw = tx as unknown as Record<string, unknown>;
    const blockHash = block.block_hash as Hash;
    const height = this.toPositiveInteger(block.block_number);
    const timestampStr = typeof raw['timestamp'] === 'string' ? raw['timestamp'] : block.timestamp;
    const timestamp = this.toUnixMsFromRfc3339(timestampStr);

    const senderRaw = typeof raw['sender'] === 'string' ? raw['sender'] : '';
    const outputs = Array.isArray(raw['outputs']) ? raw['outputs'] as Array<Record<string, unknown>> : [];
    const firstOutput = outputs[0];
    const recipientRaw = typeof raw['recipient'] === 'string'
      ? raw['recipient']
      : (typeof firstOutput?.['recipient'] === 'string' ? firstOutput['recipient'] as string : senderRaw);

    const amountFromField = typeof raw['amount'] === 'number' ? raw['amount'] : undefined;
    const amountFromOutputs = outputs.reduce((sum: number, output: Record<string, unknown>) => {
      const value = output['amount'];
      return sum + (typeof value === 'number' ? value : 0);
    }, 0);
    const amount = amountFromField ?? amountFromOutputs;

    const fee = typeof raw['fee'] === 'number' ? raw['fee'] : 0;
    const txId = typeof raw['tx_id'] === 'string' ? raw['tx_id'] : '';

    const confirmations = Math.max(0, this.nodeLatestHeight - block.block_number);

    return {
      hash: txId as Hash,
      blockHash,
      blockHeight: height,
      from: this.nodeAddressToAccountAddress(senderRaw as NodeAddress, 'tx.sender'),
      to: this.nodeAddressToAccountAddress(recipientRaw as NodeAddress, 'tx.recipient'),
      value: this.toAttoValue(amount),
      fee: this.toAttoValue(fee),
      timestamp,
      status: 'confirmed',
      inputs: [],
      outputs: [],
      confirmations
    };
  }

  private nodeToExplorerBlock(block: NodeBlock): BlockDetails {
    const height = this.toPositiveInteger(block.block_number);
    const hash = block.block_hash as Hash;
    const parentHash = (block.previous_block_hash || null) as Hash | null;
    const timestamp = this.toUnixMsFromRfc3339(block.timestamp);

    const blockTransactions = this.getNodeBlockTransactions(block);
    const txDetails = blockTransactions.map((tx: NodeTransaction) => this.nodeToExplorerTx(block, tx));
    const txSummaries = txDetails.map((tx: TransactionDetails) => tx as TransactionSummary);
    const totalValue = this.computeTotalValue(txSummaries as TransactionSummary[]);
    const transactionCount = this.getNodeBlockTransactionCount(block, blockTransactions);

    const confirmations = Math.max(0, this.nodeLatestHeight - block.block_number);
    const confirmationScore = this.config.finalityLag > 0 ? Math.min(1, confirmations / this.config.finalityLag) : 0;
    const status: BlockSummary['status'] = confirmations >= this.config.finalityLag ? 'finalized' : 'pending';

    return {
      height,
      hash,
      parentHash,
      timestamp,
      transactionCount,
      totalValue,
      status,
      confirmationScore,
      miner: this.nodeAddressToAccountAddress(block.validator_address, 'block.validator_address'),
      // Node does not currently expose committee membership; keep empty until available.
      delegateSet: [],
      transactions: txSummaries
    };
  }

  private updateAccountsFromTransaction(tx: TransactionDetails): void {
    const now = Date.now();
    const from = this.ensureAccount(tx.from);
    const to = this.ensureAccount(tx.to);

    from.lastSeen = Math.max(from.lastSeen, now);
    to.lastSeen = Math.max(to.lastSeen, now);

    from.outbound = this.pushUniqueTx(from.outbound, tx as TransactionSummary);
    to.inbound = this.pushUniqueTx(to.inbound, tx as TransactionSummary);
  }

  private async refreshFromNode(): Promise<void> {
    if (this.nodePollInFlight) {
      return;
    }
    this.nodePollInFlight = true;
    this.refreshInFlightSubject.next(true);

    try {
      const [result, health] = await Promise.all([
        this.jsonRpcCall<NodeGetBlocksResult>('get_blocks', {
          limit: this.config.blockPageSize,
          include_txs: true
        }),
        // Best-effort health fetch for network-wide metadata (validator counts, peers, etc).
        // Keep this optional so explorer still works against older nodes/proxies.
        (async () => {
          try {
            return await firstValueFrom(this.http.get<unknown>(this.nodeEndpoint('health')));
          } catch {
            return undefined;
          }
        })()
      ]);

      const blocks = [...(result.blocks ?? [])].sort((a, b) => a.block_number - b.block_number);
      const latest = blocks.at(-1)?.block_number ?? 0;
      this.nodeLatestHeight = latest;
      this.nodeBlocksCursor = result.next_cursor;

      // If this is a refresh (not initial load), merge new blocks with existing ones
      // to preserve any previously loaded older blocks from "load more"
      const existingBlocks = this.blocksSubject.getValue();
      const existingHeights = new Set(existingBlocks.map(b => b.height));

      const newBlockDetails: BlockDetails[] = [];
      const transactions: TransactionDetails[] = [];

      for (const block of blocks) {
        const blockHeight = this.toPositiveInteger(block.block_number);
        // Skip blocks we already have (from previous loads)
        if (existingHeights.has(blockHeight)) {
          continue;
        }
        const details = this.nodeToExplorerBlock(block);
        this.blockDetails.set(details.hash, details);
        newBlockDetails.push(details);

        for (const tx of details.transactions) {
          const txDetail = tx as TransactionDetails;
          this.transactionDetails.set(txDetail.hash, txDetail);
          transactions.push(txDetail);
          this.updateAccountsFromTransaction(txDetail);
        }
      }

      // Combine: new blocks (prepended) + existing blocks
      const newSummaries = newBlockDetails.map(b => this.toSummary(b));
      const mergedBlocks = [...newSummaries, ...existingBlocks].sort((a, b) => (b.height as number) - (a.height as number));

      this.setNodeBlocks(mergedBlocks);
      this.hasMoreBlocksSubject.next(this.nodeBlocksCursor !== undefined);

      // Update finality status for all blocks
      const finalizedHeight = this.toPositiveInteger(Math.max(0, latest - this.config.finalityLag));
      this.updateFinalityFromHeight(finalizedHeight);

      // Recent transactions sorted by timestamp desc.
      transactions.sort((a, b) => (b.timestamp as number) - (a.timestamp as number));
      this.transactionsSubject.next(transactions.slice(0, LATEST_TRANSACTIONS_LIMIT));

      this.publishAccountSnapshots();

      // Network stats (UI-level approximation)
      const now = Date.now();
      let currentHeightNumber = latest;

      let averageTps = 0;
      if (blocks.length >= 2) {
        const firstTs = Date.parse(blocks[0].timestamp);
        const lastTs = Date.parse(blocks[blocks.length - 1].timestamp);
        const seconds = Math.max(1, Math.floor((lastTs - firstTs) / 1000));
        const txCount = transactions.length;
        averageTps = txCount / seconds;
      }

      const uniqueValidators = new Set(blocks.map((b) => b.validator_address));

      let healthData: HealthData | null = null;
      let dagTipCommitIndex = 0;
      let finalizedCommitIndex = 0;
      let dagFinalityGap = 0;
      let txQueueSize = 0;
      let pendingFinalityCerts = 0;
      let consensusValidatorCount: number | undefined;
      let isSynced = false;
      let epoch = 0;
      let epochDurationMs = 0;
      let epochElapsedMs = 0;
      let timeToNextEpochMs = 0;
      let peerCount = 0;
      let connectedPeerCount = 0;
      let totalPeers = 0;
      let connectedPeers: readonly string[] = [];
      let bootstrapPeers = 0;
      let messageSuccessRate = 0;
      let averageLatencyMs = 0;
      let connectionQuality = 1.0;
      let committeeSize = 0;
        let startupGateActive = false;
        let startupReadyPeers = 0;
        let startupExpectedReadyPeers = 0;
        let startupVrfReadyPeers = 0;
        let startupExpectedVrfReadyPeers = 0;
        let startupWaitMs = 0;
        let startupPeerReadiness: HealthData['consensus']['startupPeerReadiness'] = [];
      let consensusCurrentHeight = latest;
      let nodeType = 'unknown';
      let timestampSeconds = 0;

      if (typeof health === 'object' && health !== null) {
        const h = health as Record<string, unknown>;
        
        const status = typeof h['status'] === 'string' ? h['status'] : 'unknown';
        const version = typeof h['version'] === 'string' ? h['version'] : 'unknown';
        const uptimeSeconds = typeof h['uptime_seconds'] === 'number' ? h['uptime_seconds'] : 0;
        nodeType = typeof h['node_type'] === 'string' ? h['node_type'] : 'unknown';
        timestampSeconds = typeof h['timestamp'] === 'number' ? h['timestamp'] : 0;

        const consensus = h['consensus_status'];
        if (typeof consensus === 'object' && consensus !== null) {
          const cs = consensus as Record<string, unknown>;
          isSynced = cs['is_synced'] === true;
          consensusCurrentHeight = typeof cs['current_height'] === 'number' ? cs['current_height'] as number : latest;
          currentHeightNumber = consensusCurrentHeight;
          dagTipCommitIndex = typeof cs['dag_tip_commit_index'] === 'number' ? cs['dag_tip_commit_index'] as number : 0;
          finalizedCommitIndex = typeof cs['finalized_commit_index'] === 'number' ? cs['finalized_commit_index'] as number : 0;
          dagFinalityGap = typeof cs['dag_finality_gap'] === 'number' ? cs['dag_finality_gap'] as number : 0;
          txQueueSize = typeof cs['tx_queue_size'] === 'number' ? cs['tx_queue_size'] as number : 0;
          pendingFinalityCerts = typeof cs['pending_finality_certs'] === 'number' ? cs['pending_finality_certs'] as number : 0;
          committeeSize = typeof cs['committee_size'] === 'number' ? cs['committee_size'] as number : 0;
          epoch = typeof cs['epoch'] === 'number' ? cs['epoch'] as number : 0;
          epochDurationMs = typeof cs['epoch_duration_ms'] === 'number' ? cs['epoch_duration_ms'] as number : 0;
          epochElapsedMs = typeof cs['epoch_elapsed_ms'] === 'number' ? cs['epoch_elapsed_ms'] as number : 0;
          timeToNextEpochMs = typeof cs['time_to_next_epoch_ms'] === 'number' ? cs['time_to_next_epoch_ms'] as number : 0;
          startupGateActive = cs['startup_gate_active'] === true;
          startupReadyPeers = typeof cs['startup_ready_peers'] === 'number' ? cs['startup_ready_peers'] as number : 0;
          startupExpectedReadyPeers = typeof cs['startup_expected_ready_peers'] === 'number'
            ? cs['startup_expected_ready_peers'] as number
            : 0;
          startupVrfReadyPeers = typeof cs['startup_vrf_ready_peers'] === 'number' ? cs['startup_vrf_ready_peers'] as number : 0;
          startupExpectedVrfReadyPeers = typeof cs['startup_expected_vrf_ready_peers'] === 'number'
            ? cs['startup_expected_vrf_ready_peers'] as number
            : 0;
          startupWaitMs = typeof cs['startup_wait_ms'] === 'number' ? cs['startup_wait_ms'] as number : 0;

          const readinessRaw = cs['startup_peer_readiness'];
          if (Array.isArray(readinessRaw)) {
            startupPeerReadiness = readinessRaw
              .map((entry) => {
                if (typeof entry !== 'object' || entry === null) {
                  return null;
                }
                const e = entry as Record<string, unknown>;
                const peerId = typeof e['peer_id'] === 'string' ? e['peer_id'] : '';
                const status = typeof e['status'] === 'string' ? e['status'] : 'unknown';
                const heartbeatAgeMs = typeof e['heartbeat_age_ms'] === 'number' ? e['heartbeat_age_ms'] : 0;
                const commitIndex = typeof e['commit_index'] === 'number' ? e['commit_index'] : 0;
                const blocker = typeof e['blocker'] === 'string' ? e['blocker'] : null;
                if (peerId.length === 0) {
                  return null;
                }
                return {
                  peerId,
                  status,
                  heartbeatAgeMs,
                  commitIndex,
                  blocker
                };
              })
              .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
          }
          
          const vc = cs['validator_count'];
          if (typeof vc === 'number' && Number.isFinite(vc) && vc > 0) {
            consensusValidatorCount = vc;
          }
        }

        const network = h['network_status'];
        if (typeof network === 'object' && network !== null) {
          const ns = network as Record<string, unknown>;
          peerCount = typeof ns['peer_count'] === 'number' ? ns['peer_count'] as number : 0;
          connectedPeerCount = typeof ns['connected_peer_count'] === 'number' ? ns['connected_peer_count'] as number : 0;
          totalPeers = typeof ns['total_peers'] === 'number' ? ns['total_peers'] as number : 0;
          bootstrapPeers = typeof ns['bootstrap_peers'] === 'number' ? ns['bootstrap_peers'] as number : 0;
          messageSuccessRate = typeof ns['message_success_rate'] === 'number' ? ns['message_success_rate'] as number : 0;
          if (Array.isArray(ns['connected_peers'])) {
            connectedPeers = ns['connected_peers'] as string[];
          }
          averageLatencyMs = typeof ns['average_latency_ms'] === 'number' ? ns['average_latency_ms'] as number : 0;
          connectionQuality = typeof ns['connection_quality'] === 'number' ? ns['connection_quality'] as number : 1.0;
        }

        healthData = {
          status,
          version,
          uptimeSeconds,
          nodeType,
          timestampSeconds,
          consensus: {
            isSynced,
            currentHeight: consensusCurrentHeight,
            dagTipCommitIndex,
            finalizedCommitIndex,
            dagFinalityGap,
            txQueueSize,
            pendingFinalityCerts,
            validatorCount: consensusValidatorCount ?? 0,
            committeeSize,
            epoch,
            epochDurationMs,
            epochElapsedMs,
            timeToNextEpochMs,
            startupGateActive,
            startupReadyPeers,
            startupExpectedReadyPeers,
            startupVrfReadyPeers,
            startupExpectedVrfReadyPeers,
            startupWaitMs,
            startupPeerReadiness
          },
          network: {
            peerCount,
            connectedPeerCount,
            totalPeers,
            connectedPeers,
            bootstrapPeers,
            messageSuccessRate,
            averageLatencyMs,
            connectionQuality
          }
        };
        this.healthSubject.next(healthData);
      }
      
      const activeValidators = this.toPositiveInteger(
        consensusValidatorCount ?? uniqueValidators.size
      );
      const currentHeight = this.toPositiveInteger(Math.max(0, currentHeightNumber));

      this.networkSubject.next({
        currentHeight,
        finalizedHeight,
        averageTps,
        activeValidators,
        nextElectionEtaMs: timeToNextEpochMs,
        timestamp: this.toUnixMs(now),
        dagTipCommitIndex,
        finalizedCommitIndex,
        dagFinalityGap,
        txQueueSize,
        pendingFinalityCerts,
        isSynced,
        epoch,
        epochDurationMs,
        epochElapsedMs,
        timeToNextEpochMs
      });

      this.lastRefreshedAtSubject.next(Date.now());
    } catch (err) {
      console.warn('Failed to refresh explorer data from node', err);
    } finally {
      this.nodePollInFlight = false;
      this.refreshInFlightSubject.next(false);
    }
  }

  async loadMoreBlocks(): Promise<boolean> {
    if (this.nodeBlocksLoadingMore || this.nodeBlocksCursor === undefined) {
      return false;
    }
    if (this.backend.mode !== 'node') {
      return false;
    }

    this.nodeBlocksLoadingMore = true;
    this.loadingMoreBlocksSubject.next(true);
    try {
      const result = await this.jsonRpcCall<NodeGetBlocksResult>('get_blocks', {
        from_height: this.nodeBlocksCursor,
        limit: this.config.blockPageSize,
        include_txs: true
      });

      if (!result.blocks || result.blocks.length === 0) {
        this.nodeBlocksCursor = undefined;
        this.hasMoreBlocksSubject.next(false);
        return false;
      }

      const blocks = [...result.blocks].sort((a, b) => a.block_number - b.block_number);
      this.nodeBlocksCursor = result.next_cursor;

      const blockDetails: BlockDetails[] = [];
      const transactions: TransactionDetails[] = [];

      for (const block of blocks) {
        const details = this.nodeToExplorerBlock(block);
        this.blockDetails.set(details.hash, details);
        blockDetails.push(details);

        for (const tx of details.transactions) {
          const txDetail = tx as TransactionDetails;
          this.transactionDetails.set(txDetail.hash, txDetail);
          transactions.push(txDetail);
          this.updateAccountsFromTransaction(txDetail);
        }
      }

      const summaries = blockDetails.map((b) => this.toSummary(b));
      const currentBlocks = this.blocksSubject.getValue();
      const mergedBlocks = [...currentBlocks, ...summaries].sort((a, b) => (b.height as number) - (a.height as number));
      this.setNodeBlocks(mergedBlocks);

      if (!result.next_cursor) {
        this.nodeBlocksCursor = undefined;
      }
      
      this.hasMoreBlocksSubject.next(this.nodeBlocksCursor !== undefined);
      return true;
    } catch (err) {
      console.warn('Failed to load more blocks', err);
      return false;
    } finally {
      this.nodeBlocksLoadingMore = false;
      this.loadingMoreBlocksSubject.next(false);
    }
  }

  get hasMoreBlocks$(): Observable<boolean> {
    return this.hasMoreBlocksSubject.asObservable();
  }

  get loadingMoreBlocks$(): Observable<boolean> {
    return this.loadingMoreBlocksSubject.asObservable();
  }

  private setNodeBlocks(blocks: readonly BlockSummary[]): void {
    const retained = this.retainNodeBlocks(blocks);
    const retainedHashes = new Set(retained.map((block) => block.hash));
    const current = this.blocksSubject.getValue();

    for (const block of current) {
      if (!retainedHashes.has(block.hash)) {
        this.evictBlockData(block.hash);
      }
    }

    this.blocksSubject.next(retained);
  }

  private retainNodeBlocks(blocks: readonly BlockSummary[]): readonly BlockSummary[] {
    const deduped: BlockSummary[] = [];
    const seen = new Set<Hash>();

    for (const block of blocks) {
      if (seen.has(block.hash)) {
        continue;
      }
      seen.add(block.hash);
      deduped.push(block);
    }

    if (deduped.length <= this.config.maxBlocks) {
      return deduped;
    }

    const blocksWithTransactions: BlockSummary[] = [];
    const emptyBlocks: BlockSummary[] = [];

    for (const block of deduped) {
      if (Number(block.transactionCount) > 0) {
        blocksWithTransactions.push(block);
      } else {
        emptyBlocks.push(block);
      }
    }

    if (blocksWithTransactions.length >= this.config.maxBlocks) {
      return blocksWithTransactions.slice(0, this.config.maxBlocks);
    }

    const keepEmptyCount = this.config.maxBlocks - blocksWithTransactions.length;
    return [...blocksWithTransactions, ...emptyBlocks.slice(0, keepEmptyCount)];
  }

  private evictBlockData(blockHash: Hash): void {
    const details = this.blockDetails.get(blockHash);
    if (details) {
      details.transactions.forEach((tx: TransactionSummary) => {
        this.transactionDetails.delete(tx.hash);
      });
      this.removeTransactionsFromLatest(details.transactions);
    }
    this.blockDetails.delete(blockHash);
    this.trimAccountsForRemovedBlock(blockHash);
  }

  private trimAccountsForRemovedBlock(hash: Hash): void {
    this.accounts.forEach((state) => {
      state.recentBlocks = state.recentBlocks.filter((value) => value !== hash);
    });
  }

  private toAccountSummary(state: MutableAccountState): AccountSummary {
    return {
      address: state.address,
      balance: this.toAttoValue(Math.max(0, Math.trunc(state.balance))),
      stakedBalance: this.toAttoValue(Math.max(0, Math.trunc(state.stakedBalance))),
      nonce: this.toPositiveInteger(state.nonce),
      reputation: Number(state.reputation.toFixed(2)),
      lastSeen: this.toUnixMs(state.lastSeen)
    };
  }

  private toSummary(block: BlockDetails): BlockSummary {
    const { transactions: _ignored, ...summary } = block;
    return summary;
  }

  private emptyNetworkStats(): ExtendedNetworkStatistics {
    const zero = this.toPositiveInteger(0);
    const timestamp = this.toUnixMs(Date.now());
    return {
      currentHeight: zero,
      finalizedHeight: zero,
      averageTps: 0,
      activeValidators: 0,
      nextElectionEtaMs: 0,
      timestamp,
      dagTipCommitIndex: 0,
      finalizedCommitIndex: 0,
      dagFinalityGap: 0,
      txQueueSize: 0,
      pendingFinalityCerts: 0,
      isSynced: false,
      epoch: 0,
      epochDurationMs: 0,
      epochElapsedMs: 0,
      timeToNextEpochMs: 0
    };
  }

  private createAccountPool(count: number): AccountAddress[] {
    const addresses: AccountAddress[] = [];
    for (let i = 0; i < count; i += 1) {
      addresses.push(this.randomAddress());
    }
    return addresses;
  }

  private createCommitteePool(count: number): CommitteeId[] {
    const committees: CommitteeId[] = [];
    for (let i = 0; i < count; i += 1) {
      committees.push(this.randomCommitteeId());
    }
    return committees;
  }

  private randomAddress(): AccountAddress {
    const prefix = 'chert';
    const body = this.randomHash().slice(0, 36);
    return `${prefix}_${body}` as AccountAddress;
  }

  private randomCommitteeId(): CommitteeId {
    const base = this.randomHash().slice(0, 24);
    return `committee_${base}` as CommitteeId;
  }

  private toAttoValue(value: number): AttoValue {
    assert(Number.isFinite(value), 'Value must be finite');
    assert(value >= 0, 'Value must be non-negative');
    return Math.trunc(value) as AttoValue;
  }

  private toPositiveInteger(value: number): PositiveInteger {
    assert(Number.isInteger(value), 'PositiveInteger must be an integer');
    assert(value >= 0, 'PositiveInteger must be non-negative');
    return value as PositiveInteger;
  }

  private toUnixMs(value: number): UnixMs {
    assert(Number.isFinite(value), 'UnixMs must be finite');
    assert(value >= 0, 'UnixMs must be non-negative');
    return Math.trunc(value) as UnixMs;
  }

  private getNodeBlockTransactions(block: NodeBlock): readonly NodeTransaction[] {
    const maybeTransactions = (block as unknown as { transactions?: unknown }).transactions;
    if (Array.isArray(maybeTransactions)) {
      return maybeTransactions as readonly NodeTransaction[];
    }
    return [];
  }

  private getNodeBlockTransactionCount(block: NodeBlock, transactions: readonly NodeTransaction[]): number {
    const maybeCount = (block as unknown as { transaction_count?: unknown; tx_count?: unknown }).transaction_count
      ?? (block as unknown as { tx_count?: unknown }).tx_count;

    if (typeof maybeCount === 'number' && Number.isFinite(maybeCount) && maybeCount >= 0) {
      return Math.trunc(maybeCount);
    }
    return transactions.length;
  }

  private extractBlocksFromLookupResult(result: unknown): readonly NodeBlock[] {
    if (result && typeof result === 'object') {
      const maybeBlock = result as Partial<NodeBlock>;
      if (typeof maybeBlock.block_hash === 'string' && typeof maybeBlock.block_number === 'number') {
        return [maybeBlock as NodeBlock];
      }

      const maybeEnvelope = result as { blocks?: unknown; block?: unknown };
      if (Array.isArray(maybeEnvelope.blocks)) {
        return maybeEnvelope.blocks as readonly NodeBlock[];
      }
      if (maybeEnvelope.block && typeof maybeEnvelope.block === 'object') {
        return [maybeEnvelope.block as NodeBlock];
      }
    }

    return [];
  }
}
