const GUID_TRANSACTION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BLOCKCHAIN_GUID_TRANSACTION_ID_REGEX = /^0x([0-9a-f]{32})$/i;
const HEX_64_TRANSACTION_HASH_REGEX = /^(?:0x)?[0-9a-f]{64}$/i;

function normalizeTransactionIdInput(value: string): string {
  return value.trim();
}

export function isGuidBasedTransactionId(value: string): boolean {
  const normalized = normalizeTransactionIdInput(value);
  return (
    GUID_TRANSACTION_ID_REGEX.test(normalized) ||
    BLOCKCHAIN_GUID_TRANSACTION_ID_REGEX.test(normalized)
  );
}

export function isTransactionIdLookupTerm(value: string): boolean {
  const normalized = normalizeTransactionIdInput(value);
  return (
    isGuidBasedTransactionId(normalized) ||
    HEX_64_TRANSACTION_HASH_REGEX.test(normalized)
  );
}

export function formatTransactionIdForDisplay(value: string): string {
  const normalized = normalizeTransactionIdInput(value);
  const blockchainMatch = normalized.match(BLOCKCHAIN_GUID_TRANSACTION_ID_REGEX);
  if (blockchainMatch) {
    return `0x${blockchainMatch[1].toLowerCase()}`;
  }

  if (!GUID_TRANSACTION_ID_REGEX.test(normalized)) {
    return normalized;
  }

  return `0x${normalized.replace(/-/g, '').toLowerCase()}`;
}

export function parseTransactionIdInput(value: string): string {
  const normalized = normalizeTransactionIdInput(value);
  if (GUID_TRANSACTION_ID_REGEX.test(normalized)) {
    return normalized.toLowerCase();
  }

  const blockchainMatch = normalized.match(BLOCKCHAIN_GUID_TRANSACTION_ID_REGEX);
  if (!blockchainMatch) {
    return normalized;
  }

  const compact = blockchainMatch[1].toLowerCase();
  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20),
  ].join('-');
}

export function transactionIdSearchTokens(value: string): readonly string[] {
  const normalized = normalizeTransactionIdInput(value);
  const canonical = parseTransactionIdInput(normalized);
  const display = formatTransactionIdForDisplay(canonical);

  return Array.from(
    new Set([
      normalized.toLowerCase(),
      canonical.toLowerCase(),
      display.toLowerCase(),
    ])
  ).filter((candidate) => candidate.length > 0);
}

export function toTransactionRouteParam(value: string): string {
  return formatTransactionIdForDisplay(value);
}