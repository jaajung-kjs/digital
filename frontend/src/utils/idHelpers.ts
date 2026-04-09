/**
 * Centralized temp ID utilities.
 *
 * All unsaved entities share a single `temp-` prefix.
 * The entity type (equipment, cable, log, photo) is determined
 * from context, not from the ID format.
 */

const TEMP_PREFIX = 'temp-';

export function generateTempId(): string {
  return `${TEMP_PREFIX}${crypto.randomUUID()}`;
}

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}
