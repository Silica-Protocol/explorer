export function formatBlockHeight(height: number): string {
  const h = Number(height);
  const epochSize = 32768; // 32^3
  const major = Math.floor(h / epochSize);
  const minor = h % epochSize;

  const base32Chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  const idx2 = minor % 32;
  const minor1 = Math.floor(minor / 32);
  const idx1 = minor1 % 32;
  const idx0 = Math.floor(minor1 / 32);

  const minorStr = base32Chars[idx0] + base32Chars[idx1] + base32Chars[idx2];

  const majorStr = major.toString().padStart(9, '0').replace(/(\d{3})(?=\d)/g, '$1-');

  return `${majorStr}.${minorStr}`;
}

export function formatHash(value: string, prefixLen: number = 12, suffixLen: number = 4): string {
  if (!value) return '';
  if (value.length <= prefixLen + suffixLen) return value;
  return `${value.slice(0, prefixLen)}…${value.slice(-suffixLen)}`;
}

export function formatTimestamp(timestamp: number | string): string {
  const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  return new Date(ts).toLocaleString();
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
