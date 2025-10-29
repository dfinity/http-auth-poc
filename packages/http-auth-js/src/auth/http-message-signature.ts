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
  sigName?: string;
  nonce?: Uint8Array;
};

type RequestMap = {
  request_type: string;
  canister_id: Principal;
  method_name: string;
  ingress_expiry: bigint;
  sender: Principal;
  nonce: Uint8Array;
  arg: Uint8Array;
};

/**
 * Adds IC-Include-Headers to the request before encoding.
 * This strengthens security by including it in the signed representation.
 */
function addIcIncludeHeadersToRequest(req: Request): void {
  const headerNames: string[] = [IC_INCLUDE_HEADERS_NAME];
  req.headers.forEach((_value, key) => {
    headerNames.push(key);
  });
  const icIncludeHeaders = headerNames.join(';');
  req.headers.set(IC_INCLUDE_HEADERS_NAME, icIncludeHeaders);
}

/**
 * Encodes the HTTP request to BHTTP binary format.
 * NOTE: according to Mozilla docs, headers are accessed in lexicographical order when iterated over,
 * see https://developer.mozilla.org/en-US/docs/Web/API/Headers.
 * The same must be applied on the HTTP Gateway side when constructing the binary representation of the request,
 * to ensure the signature stays valid.
 */
async function encodeRequestToBHttp(req: Request): Promise<Uint8Array> {
  const encoder = new BHttpEncoder();
  const clonedReq = req.clone();
  return encoder.encodeRequest(clonedReq);
}

/**
 * Exports the public key as a byte array.
 */
async function exportPublicKeyBytes(publicKey: CryptoKey): Promise<Uint8Array> {
  const publicKeySpki = await crypto.subtle.exportKey('spki', publicKey);
  return new Uint8Array(publicKeySpki);
}

/**
 * Calculates the ingress expiry timestamp in nanoseconds.
 */
function calculateIngressExpiry(expirationTimeMs: number): bigint {
  const expiryTimestampMs = Date.now() + expirationTimeMs;
  return BigInt(expiryTimestampMs) * NANOSECONDS_PER_MILLISECOND;
}

/**
 * Builds the request map containing all fields needed for signing.
 */
function buildRequestMap(params: {
  canisterId: string;
  publicKeyBytes: Uint8Array;
  nonce: Uint8Array;
  ingressExpiry: bigint;
  arg: Uint8Array;
}): RequestMap {
  const canisterIdPrincipal = Principal.fromText(params.canisterId);
  const senderPrincipal = Principal.selfAuthenticating(params.publicKeyBytes);

  console.log('sender principal:', senderPrincipal.toText());

  return {
    request_type: 'call',
    canister_id: canisterIdPrincipal,
    method_name: 'http_request_update',
    ingress_expiry: params.ingressExpiry,
    sender: senderPrincipal,
    nonce: params.nonce,
    arg: params.arg,
  };
}

/**
 * Signs the request map using the private key.
 * Returns the signature as an ArrayBuffer.
 */
async function signRequestMap(requestMap: RequestMap, privateKey: CryptoKey): Promise<ArrayBuffer> {
  const mapHash = hashOfMap(requestMap);

  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    concatBytes(IC_REQUEST_DOMAIN_SEPARATOR, mapHash) as BufferSource,
  );

  return signature;
}

/**
 * Creates the Signature-Input header value from the request map.
 * Includes all fields except 'arg'.
 */
function createSignatureInput(requestMap: RequestMap): string {
  return Object.entries(requestMap)
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
}

type SetAuthenticationHeadersParams = {
  signature: ArrayBuffer;
  publicKeyBytes: Uint8Array;
  requestMap: RequestMap;
  signatureName: string;
};

type SignatureKeyHeader = {
  pubKey: string;
};

/**
 * Sets all authentication headers on the request.
 */
function setAuthenticationHeaders(
  req: Request,
  { signature, publicKeyBytes, requestMap, signatureName }: SetAuthenticationHeadersParams,
): void {
  const encodedSignature = base64Encode(signature);
  const encodedPublicKey = base64Encode(publicKeyBytes);

  const signatureInput = createSignatureInput(requestMap);

  // Create Signature-Key header (without delegation chain for now)
  const sigKeyHeader: SignatureKeyHeader = {
    pubKey: encodedPublicKey,
  };
  const encodedSigKeyHeader = base64Encode(JSON.stringify(sigKeyHeader));

  // Set all authentication headers
  req.headers.set(SIGNATURE_HEADER_NAME, `${signatureName}=:${encodedSignature}:`);
  req.headers.set(SIGNATURE_INPUT_HEADER_NAME, `${signatureName}=${signatureInput}`);
  req.headers.set(SIGNATURE_KEY_HEADER_NAME, `${signatureName}=:${encodedSigKeyHeader}:`);
}

/**
 * Main function that orchestrates the HTTP message signature process.
 * Adds authentication headers to the request by:
 * 1. Adding IC-Include-Headers
 * 2. Encoding the request to BHTTP
 * 3. Building and signing the request map
 * 4. Setting authentication headers
 */
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
  addIcIncludeHeadersToRequest(req);

  const arg = await encodeRequestToBHttp(req);
  const publicKeyBytes = await exportPublicKeyBytes(keyPair.publicKey);
  const nonceBytes = nonce || generateNonce();
  const ingressExpiry = calculateIngressExpiry(expirationTimeMs);

  const requestMap = buildRequestMap({
    canisterId,
    publicKeyBytes,
    nonce: nonceBytes,
    ingressExpiry,
    arg,
  });

  const signature = await signRequestMap(requestMap, keyPair.privateKey);

  setAuthenticationHeaders(req, {
    signature,
    publicKeyBytes,
    requestMap,
    signatureName: sigName,
  });
}
