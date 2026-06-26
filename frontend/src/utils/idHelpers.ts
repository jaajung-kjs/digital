/**
 * Centralized temp ID utilities.
 *
 * All unsaved entities share a single `temp-` prefix.
 * The entity type (asset, cable, log, photo) is determined
 * from context, not from the ID format.
 */

const TEMP_PREFIX = 'temp-';

// `crypto.randomUUID()` is only exposed in secure contexts (HTTPS, localhost,
// 127.0.0.1). On the air-gapped K-Cloud deployment users hit the app over
// plain HTTP at a regular IP — not a secure context — so randomUUID is
// undefined and any temp-id creation throws. Fall back to a manual UUID v4
// using `crypto.getRandomValues` (available in all contexts) when needed.
function uuidv4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

export function generateTempId(): string {
  return `${TEMP_PREFIX}${uuidv4()}`;
}

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}
