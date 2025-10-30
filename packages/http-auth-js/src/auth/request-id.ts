import { concatBytes } from '@noble/hashes/utils';
import { hashOfMap } from './representation-independent-hash';

const IC_REQUEST_DOMAIN_SEPARATOR = new TextEncoder().encode('\x0Aic-request');

/**
 * Creates a request id according to the IC Interface Specification: https://internetcomputer.org/docs/references/ic-interface-spec#request-id
 */
export function toRequestId<T extends Record<string, unknown>>(input: T): Uint8Array {
  const mapHash = hashOfMap(input);

  return concatBytes(IC_REQUEST_DOMAIN_SEPARATOR, mapHash);
}
