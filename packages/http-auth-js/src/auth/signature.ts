import { BHttpEncoder } from '@dajiaji/bhttp';
import { Principal } from '@icp-sdk/core/principal';
import { concatBytes } from '@noble/hashes/utils';
import { base64Encode } from './base64';
import { generateNonce } from './crypto';
import { hashOfMap } from './representation-independent-hash';
import { CallSignatureInput, type SignatureInput } from './signature-input';

const DEFAULT_EXPIRATION_TIME_MS = 5 * 60 * 1_000; // 5 minutes

const SIGNATURE_HEADER_NAME = 'signature';
const SIGNATURE_INPUT_HEADER_NAME = 'signature-input';
const SIGNATURE_KEY_HEADER_NAME = 'signature-key';
const IC_INCLUDE_HEADERS_NAME = 'x-ic-include-headers';

const IC_INCLUDE_HEADERS_SEPARATOR = ',';

const SIGNATURE_NAME_CALL = 'sig_call';
const SIGNATURE_NAME_READ_STATE = 'sig_read_state';
const SIGNATURE_NAME_QUERY = 'sig_query';

const NANOSECONDS_PER_MILLISECOND = BigInt(1_000_000);

const IC_REQUEST_DOMAIN_SEPARATOR = new TextEncoder().encode('\x0Aic-request');

export type SignatureToRequestParams = {
  canisterId: string;
  keyPair: CryptoKeyPair;
  expirationTimeMs?: number;
  sigName?: string;
  nonce?: Uint8Array;
};

/**
 * Adds the signature headers to the request.
 */
export async function addSignatureToRequest(
  req: Request,
  {
    canisterId,
    keyPair,
    expirationTimeMs = DEFAULT_EXPIRATION_TIME_MS,
    nonce,
  }: SignatureToRequestParams,
): Promise<void> {
  addIcIncludeHeadersToRequest(req);

  const arg = await encodeRequestToBHttp(req);
  const publicKeyBytes = await exportPublicKeyBytes(keyPair.publicKey);
  const nonceBytes = nonce || generateNonce();
  const ingressExpiry = calculateIngressExpiry(expirationTimeMs);

  const callSignatureInput = new CallSignatureInput(
    Principal.fromText(canisterId),
    Principal.selfAuthenticating(publicKeyBytes),
    nonceBytes,
    ingressExpiry,
    arg,
  );
  const callSignature = await signSignatureInput(callSignatureInput, keyPair.privateKey);

  setAuthenticationHeaders(req, {
    signatures: {
      call: {
        signature: callSignature,
        signatureInput: callSignatureInput.toSignatureInputHeaderValue(),
      },
    },
    publicKeyBytes,
  });
}

/**
 * Adds IC-Include-Headers to the request before encoding.
 * This strengthens security by including it in the signed representation.
 */
function addIcIncludeHeadersToRequest(req: Request): void {
  const headerNames: string[] = [IC_INCLUDE_HEADERS_NAME];
  req.headers.forEach((_value, key) => {
    headerNames.push(key);
  });
  const icIncludeHeaders = headerNames.join(IC_INCLUDE_HEADERS_SEPARATOR);
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
 * Signs the request map using the private key.
 * Returns the signature as an ArrayBuffer.
 */
async function signSignatureInput(
  input: SignatureInput,
  privateKey: CryptoKey,
): Promise<ArrayBuffer> {
  const map = input.toMap();
  const mapHash = hashOfMap(map);

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

type SetAuthenticationHeadersParams = {
  signatures:
    | {
        call: {
          signature: ArrayBuffer;
          signatureInput: string;
        };
        readState?: {
          signature: ArrayBuffer;
          signatureInput: string;
        };
      }
    | {
        query: {
          signature: ArrayBuffer;
          signatureInput: string;
        };
      };
  publicKeyBytes: Uint8Array;
};

type SignatureKeyHeader = {
  pubKey: string;
};

/**
 * Sets all authentication headers on the request.
 */
function setAuthenticationHeaders(
  req: Request,
  { signatures, publicKeyBytes }: SetAuthenticationHeadersParams,
): void {
  let signatureHeaderValue = '';
  let signatureInputHeaderValue = '';
  let signatureKeyHeaderValue = '';

  // Create Signature-Key header (without delegation chain for now)
  const encodedPublicKey = base64Encode(publicKeyBytes);
  const sigKeyHeader: SignatureKeyHeader = {
    pubKey: encodedPublicKey,
  };
  const encodedSigKeyHeader = base64Encode(JSON.stringify(sigKeyHeader));

  if ('call' in signatures) {
    signatureHeaderValue += `${SIGNATURE_NAME_CALL}=:${base64Encode(signatures.call.signature)}:`;
    signatureInputHeaderValue += `${SIGNATURE_NAME_CALL}=${signatures.call.signatureInput}`;
    signatureKeyHeaderValue += `${SIGNATURE_NAME_CALL}=:${encodedSigKeyHeader}:`;

    if (signatures.readState) {
      signatureHeaderValue += `${SIGNATURE_NAME_READ_STATE}=:${base64Encode(signatures.readState.signature)}:`;
      signatureInputHeaderValue += `${SIGNATURE_NAME_READ_STATE}=${signatures.readState.signatureInput}`;
      signatureKeyHeaderValue += `${SIGNATURE_NAME_READ_STATE}=:${encodedSigKeyHeader}:`;
    }
  } else if ('query' in signatures) {
    signatureHeaderValue += `${SIGNATURE_NAME_QUERY}=:${base64Encode(signatures.query.signature)}:`;
    signatureInputHeaderValue += `${SIGNATURE_NAME_QUERY}=${signatures.query.signatureInput}`;
    signatureKeyHeaderValue += `${SIGNATURE_NAME_QUERY}=:${encodedSigKeyHeader}:`;
  } else {
    throw new Error('Invalid signatures');
  }

  // Set all authentication headers
  req.headers.set(SIGNATURE_HEADER_NAME, signatureHeaderValue);
  req.headers.set(SIGNATURE_INPUT_HEADER_NAME, signatureInputHeaderValue);
  req.headers.set(SIGNATURE_KEY_HEADER_NAME, signatureKeyHeaderValue);
}
