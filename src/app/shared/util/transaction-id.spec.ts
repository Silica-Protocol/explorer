import {
  formatTransactionIdForDisplay,
  isGuidBasedTransactionId,
  isTransactionIdLookupTerm,
  parseTransactionIdInput,
  transactionIdSearchTokens,
} from './transaction-id';

describe('transaction-id util', () => {
  it('formats guid transaction ids into blockchain-style ids', () => {
    expect(formatTransactionIdForDisplay('123e4567-e89b-12d3-a456-426614174000')).toBe(
      '0x123e4567e89b12d3a456426614174000'
    );
  });

  it('parses blockchain-style ids back to guid form', () => {
    expect(parseTransactionIdInput('0x123e4567e89b12d3a456426614174000')).toBe(
      '123e4567-e89b-12d3-a456-426614174000'
    );
  });

  it('recognizes guid-based transaction ids in either form', () => {
    expect(isGuidBasedTransactionId('123e4567-e89b-12d3-a456-426614174000')).toBeTrue();
    expect(isGuidBasedTransactionId('0x123e4567e89b12d3a456426614174000')).toBeTrue();
  });

  it('accepts guid-display and 64-char hashes as lookup terms', () => {
    expect(isTransactionIdLookupTerm('0x123e4567e89b12d3a456426614174000')).toBeTrue();
    expect(
      isTransactionIdLookupTerm(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      )
    ).toBeTrue();
  });

  it('produces both canonical and blockchain-style search tokens', () => {
    expect(transactionIdSearchTokens('123e4567-e89b-12d3-a456-426614174000')).toEqual([
      '123e4567-e89b-12d3-a456-426614174000',
      '0x123e4567e89b12d3a456426614174000',
    ]);
  });
});