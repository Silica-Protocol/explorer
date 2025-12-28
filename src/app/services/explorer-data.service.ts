import { Inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EXPLORER_DATA_CONFIG, ExplorerDataConfig } from '@app/services/explorer-data.config';
import { DeterministicRandom } from '@shared/util/deterministic-rng';
import { assert } from '@shared/util/assert';
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
} from '@chert/ts-models';

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

  constructor(
    @Inject(EXPLORER_DATA_CONFIG) private readonly config: ExplorerDataConfig,
    private readonly zone: NgZone
  ) {
    assert(config.maxBlocks > 0, 'maxBlocks must be positive');
    assert(config.initialBlockCount > 0, 'initialBlockCount must be positive');
    assert(config.txPerBlockMin > 0, 'txPerBlockMin must be positive');
    assert(config.txPerBlockMax >= config.txPerBlockMin, 'txPerBlockMax must be >= min');

    this.rng = new DeterministicRandom(config.seed);
    this.accountPool = this.createAccountPool(config.accountCount);
    this.committeePool = this.createCommitteePool(Math.max(COMMITTEE_SIZE * 4, COMMITTEE_SIZE));
    this.currentCommittee = this.committeePool.slice(0, COMMITTEE_SIZE);
    this.nextElectionTimestamp = Date.now() + config.blockIntervalMs * 32;

    this.accountPool.forEach((address) => {
      this.ensureAccount(address);
    });
    this.publishAccountSnapshots();

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

  start(): void {
    if (this.running) {
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

  private publishAccountSnapshots(): void {
    const summaries = Array.from(this.accounts.values()).map((state) => this.toAccountSummary(state));
    this.accountsSubject.next(summaries);
  }

  private determineStatus(_: PositiveInteger): BlockSummary['status'] {
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
      state = {
        address,
        balance: this.rng.nextInt(50_000_000, 200_000_000),
        stakedBalance: this.rng.nextInt(5_000_000, 50_000_000),
        nonce: 0,
        reputation: Number((0.4 + this.rng.next() * 0.6).toFixed(2)),
        lastSeen: Date.now(),
        outbound: [],
        inbound: [],
        recentBlocks: []
      };
      this.accounts.set(address, state);
    }
    return state;
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
