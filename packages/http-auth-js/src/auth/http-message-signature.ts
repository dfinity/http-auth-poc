import { BHttpEncoder } from '@dajiaji/bhttp';
import { Principal } from '@icp-sdk/core/principal';
import { concatBytes } from '@noble/hashes/utils';
import { base64Encode } from './base64';
import { generateNonce } from './crypto';
import { hashOfMap } from './representation-independent-hash';

const DEFAULT_EXPIRATION_TIME_MS = 5 * 60 * 1_000; // 5 minutes
const DEFAULT_SIG_NAME = 'sig';

const SIGNATURE_HEADER_NAME = 'signature';
const SIGNATURE_INPUT_HEADER_NAME = 'signature-input';
const SIGNATURE_KEY_HEADER_NAME = 'signature-key';
const IC_INCLUDE_HEADERS_NAME = 'x-ic-include-headers';

const NANOSECONDS_PER_MILLISECOND = BigInt(1_000_000);

const IC_REQUEST_DOMAIN_SEPARATOR = new TextEncoder().encode('\x0Aic-request');

export type HttpMessageSignatureRequestParams = {
  canisterId: string;
  keyPair: CryptoKeyPair;
  expirationTimeMs?: number;
  sigName?: string | null;
  nonce?: Uint8Array | null;
};

export async function addHttpMessageSignatureToRequest(
  req: Request,
  {
    canisterId,
    keyPair,
    expirationTimeMs = DEFAULT_EXPIRATION_TIME_MS,
    sigName = DEFAULT_SIG_NAME,
    nonce,
  }: HttpMessageSignatureRequestParams,
): Promise<void> {
  // Step 0: Add IC-Include-Headers to the request before encoding
  // This strengthens security by including it in the signed representation
  const headerNames: string[] = [IC_INCLUDE_HEADERS_NAME];
  req.headers.forEach((_value, key) => {
    headerNames.push(key);
  });
  const icIncludeHeaders = headerNames.join(';');
  req.headers.set(IC_INCLUDE_HEADERS_NAME, icIncludeHeaders);

  // Step 1: Encode the HTTP request to BHTTP binary format
  // NOTE: according to Mozilla docs, headers are accessed in lexicographical order when iterated over,
  // see https://developer.mozilla.org/en-US/docs/Web/API/Headers.
  // The same must be applied on the HTTP Gateway side when constructing the binary representation of the request,
  // to ensure the signature stays valid.
  const encoder = new BHttpEncoder();
  const clonedReq = req.clone();
  const arg = await encoder.encodeRequest(clonedReq);

  // Step 2: Create the map
  const canisterIdPrincipal = Principal.fromText(canisterId);

  // Get the sender principal from the public key
  const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyBytes = new Uint8Array(publicKeySpki);
  const senderPrincipal = Principal.selfAuthenticating(publicKeyBytes);
  console.log('sender principal:', senderPrincipal.toText());

  // Generate or use provided nonce
  const nonceBytes = nonce || generateNonce();

  // Calculate ingress expiry in nanoseconds
  const expiryDate = new Date(Date.now() + expirationTimeMs);
  const ingressExpiryNs = BigInt(expiryDate.getTime()) * NANOSECONDS_PER_MILLISECOND;

  const requestMap = {
    request_type: 'call',
    canister_id: canisterIdPrincipal,
    method_name: 'http_request_update',
    ingress_expiry: ingressExpiryNs,
    sender: senderPrincipal,
    nonce: nonceBytes,
    arg,
  };

  // Step 3: Hash the map
  const mapHash = hashOfMap(requestMap);

  // Step 4: Sign the hash
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    keyPair.privateKey,
    concatBytes(IC_REQUEST_DOMAIN_SEPARATOR, mapHash) as BufferSource,
  );

  // Step 5: Create the HTTP headers
  const encodedSignature = base64Encode(signature);
  const encodedPublicKey = base64Encode(publicKeyBytes);

  // Create Signature-Input header (all fields except 'arg')
  const signatureInput = Object.entries(requestMap)
    .filter(([key]) => key !== 'arg')
    .map(([key, value]) => {
      if (value instanceof Principal) {
        return `${key}=${value.toText()}`;
      }
      if (value instanceof Uint8Array) {
        return `${key}=${base64Encode(value)}`;
      }
      if (typeof value === 'bigint') {
        return `${key}=${value.toString()}`;
      }
      return `${key}=${value}`;
    })
    .join(';');

  // Create Signature-Key header (without delegation chain for now)
  const sigKeyHeader: SignatureKeyHeader = {
    pubKey: encodedPublicKey,
  };
  const encodedSigKeyHeader = base64Encode(JSON.stringify(sigKeyHeader));

  // Set the authentication headers on the request
  // Note: X-IC-Include-Headers was already set at the beginning
  req.headers.set(SIGNATURE_HEADER_NAME, `${sigName}=:${encodedSignature}:`);
  req.headers.set(SIGNATURE_INPUT_HEADER_NAME, `${sigName}=${signatureInput}`);
  req.headers.set(SIGNATURE_KEY_HEADER_NAME, `${sigName}=:${encodedSigKeyHeader}:`);
}

interface SignatureKeyHeader {
  pubKey: string;
}
