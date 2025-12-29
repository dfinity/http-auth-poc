import { hashOfMap, IC_REQUEST_DOMAIN_SEPARATOR } from '@icp-sdk/core/agent';
import { concatBytes } from '@noble/hashes/utils';

/**
 * Creates a request id according to the IC Interface Specification: https://internetcomputer.org/docs/references/ic-interface-spec#request-id
 */
export function toRequestId<T extends Record<string, unknown>>(input: T): Uint8Array {
  const mapHash = hashOfMap(input);

  return concatBytes(IC_REQUEST_DOMAIN_SEPARATOR, mapHash);
}
