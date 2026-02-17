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
  private readonly networkSubject = new BehaviorSubject<NetworkStatistics>(this.emptyNetworkStats());
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

  get networkStats$(): Observable<NetworkStatistics> {
    return this.networkSubject.asObservable();
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
    const trimmed = address.trim();
    assert(trimmed.length > 0, 'Address must not be empty');
    assert(Number.isFinite(limit) && limit > 0, 'History limit must be positive');
    const params: Record<string, unknown> = { address: trimmed, limit };
    if (cursor) {
      params['cursor'] = cursor;
    }
    return await this.jsonRpcCall<NodeTransactionHistoryResult>('get_transaction_history', params);
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
    const blocks = [...this.blocksSubject.getValue(), block];

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

    const stats: NetworkStatistics = {
      currentHeight,
      finalizedHeight,
      averageTps,
      activeValidators: this.currentCommittee.length,
      nextElectionEtaMs: Math.max(0, this.nextElectionTimestamp - Date.now()),
      timestamp: this.toUnixMs(Date.now())
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
    const ms = Date.parse(timestamp);
    assert(Number.isFinite(ms), 'Invalid RFC3339 timestamp');
    return this.toUnixMs(ms);
  }

  private nodeAddressToAccountAddress(address: NodeAddress, label: string): AccountAddress {
    // Node-models uses Address branding, explorer-models uses AccountAddress branding.
    // Both are backed by strings but intentionally incompatible at the type level.
    const raw = address as unknown as string;
    assert(typeof raw === 'string', `${label} must be a string`);
    assert(raw.trim().length > 0, `${label} must not be empty`);

    // Current testnet uses hex 0x-addresses; keep validation permissive but helpful.
    // If we ever support other address formats, relax/extend this.
    assert(/^0x[0-9a-fA-F]{40}$/.test(raw), `${label} must be a 0x-prefixed 20-byte hex address`);

    return raw as unknown as AccountAddress;
  }

  private nodeToExplorerTx(block: NodeBlock, tx: NodeTransaction): TransactionDetails {
    const blockHash = block.block_hash as Hash;
    const height = this.toPositiveInteger(block.block_number);
    const timestamp = this.toUnixMsFromRfc3339(tx.timestamp);

    const confirmations = Math.max(0, this.nodeLatestHeight - block.block_number);

    return {
      hash: tx.tx_id as Hash,
      blockHash,
      blockHeight: height,
      from: this.nodeAddressToAccountAddress(tx.sender, 'tx.sender'),
      to: this.nodeAddressToAccountAddress(tx.recipient, 'tx.recipient'),
      value: this.toAttoValue(tx.amount),
      fee: this.toAttoValue(tx.fee),
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

    const txDetails = block.transactions.map((tx: NodeTransaction) => this.nodeToExplorerTx(block, tx));
    const txSummaries = txDetails.map((tx: TransactionDetails) => tx as TransactionSummary);
    const totalValue = this.computeTotalValue(txSummaries as TransactionSummary[]);

    const confirmations = Math.max(0, this.nodeLatestHeight - block.block_number);
    const confirmationScore = this.config.finalityLag > 0 ? Math.min(1, confirmations / this.config.finalityLag) : 0;
    const status: BlockSummary['status'] = confirmations >= this.config.finalityLag ? 'finalized' : 'pending';

    return {
      height,
      hash,
      parentHash,
      timestamp,
      transactionCount: txSummaries.length,
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
          limit: this.config.blockPageSize
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

      // Reset caches and replace blocks for fresh load
      this.blockDetails.clear();
      this.transactionDetails.clear();

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
      this.blocksSubject.next(summaries);
      this.hasMoreBlocksSubject.next(this.nodeBlocksCursor !== undefined);

      // Recent transactions sorted by timestamp desc.
      transactions.sort((a, b) => (b.timestamp as number) - (a.timestamp as number));
      this.transactionsSubject.next(transactions.slice(0, LATEST_TRANSACTIONS_LIMIT));

      this.publishAccountSnapshots();

      // Network stats (UI-level approximation)
      const now = Date.now();
      const finalizedHeight = this.toPositiveInteger(Math.max(0, latest - this.config.finalityLag));
      const currentHeight = this.toPositiveInteger(latest);

      let averageTps = 0;
      if (blocks.length >= 2) {
        const firstTs = Date.parse(blocks[0].timestamp);
        const lastTs = Date.parse(blocks[blocks.length - 1].timestamp);
        const seconds = Math.max(1, Math.floor((lastTs - firstTs) / 1000));
        const txCount = transactions.length;
        averageTps = txCount / seconds;
      }

      const uniqueValidators = new Set(blocks.map((b) => b.validator_address));

      // Prefer consensus-reported validator count when available.
      // The block stream may be too small early on (e.g., only 1 produced block => 1 unique producer).
      let consensusValidatorCount: number | undefined;
      if (typeof health === 'object' && health !== null) {
        const h = health as Record<string, unknown>;
        const consensus = h['consensus_status'];
        if (typeof consensus === 'object' && consensus !== null) {
          const cs = consensus as Record<string, unknown>;
          const vc = cs['validator_count'];
          if (typeof vc === 'number' && Number.isFinite(vc) && vc > 0) {
            consensusValidatorCount = vc;
          }
        }
      }
      
      // If consensus reports a validator count, use that; otherwise count unique validators from blocks
      const activeValidators = this.toPositiveInteger(
        consensusValidatorCount ?? uniqueValidators.size
      );

      this.networkSubject.next({
        currentHeight,
        finalizedHeight,
        averageTps,
        activeValidators,
        nextElectionEtaMs: 0,
        timestamp: this.toUnixMs(now)
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
        limit: this.config.blockPageSize
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
      this.blocksSubject.next([...currentBlocks, ...summaries]);

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

  private emptyNetworkStats(): NetworkStatistics {
    const zero = this.toPositiveInteger(0);
    const timestamp = this.toUnixMs(Date.now());
    return {
      currentHeight: zero,
      finalizedHeight: zero,
      averageTps: 0,
      activeValidators: 0,
      nextElectionEtaMs: 0,
      timestamp
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
}
