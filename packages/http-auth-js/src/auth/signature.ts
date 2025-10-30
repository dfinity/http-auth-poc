import { BHttpEncoder } from '@dajiaji/bhttp';
import { Principal } from '@icp-sdk/core/principal';
import { base64Encode } from './base64';
import { generateNonce } from './crypto';
import { CallSignatureInput, ReadStateSignatureInput } from './signature-input';

const DEFAULT_EXPIRATION_TIME_MS = 5 * 60 * 1_000; // 5 minutes

const SIGNATURE_HEADER_NAME = 'signature';
const SIGNATURE_INPUT_HEADER_NAME = 'signature-input';
const SIGNATURE_KEY_HEADER_NAME = 'signature-key';
const IC_INCLUDE_HEADERS_NAME = 'x-ic-include-headers';

const SIGNATURES_SEPARATOR = ',';
const IC_INCLUDE_HEADERS_SEPARATOR = ',';

const NANOSECONDS_PER_MILLISECOND = BigInt(1_000_000);

enum SignatureName {
  Call = 'sig_call',
  ReadState = 'sig_read_state',
  Query = 'sig_query',
}

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

  const canisterIdPrincipal = Principal.fromText(canisterId);
  const publicKeyBytes = await exportPublicKeyBytes(keyPair.publicKey);
  const senderPrincipal = Principal.selfAuthenticating(publicKeyBytes);
  const nonceBytes = nonce || generateNonce();
  const ingressExpiry = calculateIngressExpiry(expirationTimeMs);
  const arg = await encodeRequestToBHttp(req);

  const callSignatureInput = new CallSignatureInput(
    canisterIdPrincipal,
    senderPrincipal,
    nonceBytes,
    ingressExpiry,
    arg,
  );
  const callRequestId = callSignatureInput.toRequestId();
  const callSignature = await signSignatureInput(callRequestId, keyPair.privateKey);

  const readStateSignatureInput = new ReadStateSignatureInput(
    senderPrincipal,
    nonceBytes,
    ingressExpiry,
    [['request_status', callRequestId]],
  );
  const readStateSignature = await signSignatureInput(
    readStateSignatureInput.toRequestId(),
    keyPair.privateKey,
  );

  setAuthenticationHeaders(req, {
    signatures: {
      call: {
        signature: callSignature,
        signatureInput: callSignatureInput.toSignatureInputHeaderValue(),
      },
      readState: {
        signature: readStateSignature,
        signatureInput: readStateSignatureInput.toSignatureInputHeaderValue(),
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
  requestId: Uint8Array,
  privateKey: CryptoKey,
): Promise<ArrayBuffer> {
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    requestId as BufferSource,
  );

  return signature;
}

type SignatureParams = {
  signature: ArrayBuffer;
  signatureInput: string;
};

type SetAuthenticationHeadersParams = {
  signatures:
    | {
        call: SignatureParams;
        readState?: SignatureParams;
      }
    | {
        query: SignatureParams;
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
  const sigKeyHeader: SignatureKeyHeader = {
    pubKey: base64Encode(publicKeyBytes),
  };

  if ('call' in signatures) {
    signatureHeaderValue = setSignatureHeaderValue(SignatureName.Call, signatures.call.signature);
    signatureInputHeaderValue = setSignatureInputHeaderValue(
      SignatureName.Call,
      signatures.call.signatureInput,
    );
    signatureKeyHeaderValue = setSignatureKeyHeaderValue(SignatureName.Call, sigKeyHeader);

    if (signatures.readState) {
      signatureHeaderValue = appendToSignatureHeaderValue(
        signatureHeaderValue,
        SignatureName.ReadState,
        signatures.readState.signature,
      );
      signatureInputHeaderValue = appendToSignatureInputHeaderValue(
        signatureInputHeaderValue,
        SignatureName.ReadState,
        signatures.readState.signatureInput,
      );
      signatureKeyHeaderValue = appendToSignatureKeyHeaderValue(
        signatureKeyHeaderValue,
        SignatureName.ReadState,
        sigKeyHeader,
      );
    }
  } else if ('query' in signatures) {
    signatureHeaderValue = setSignatureHeaderValue(SignatureName.Query, signatures.query.signature);
    signatureInputHeaderValue = setSignatureInputHeaderValue(
      SignatureName.Query,
      signatures.query.signatureInput,
    );
    signatureKeyHeaderValue = setSignatureKeyHeaderValue(SignatureName.Query, sigKeyHeader);
  } else {
    throw new Error('Invalid signatures');
  }

  // Set all authentication headers
  req.headers.set(SIGNATURE_HEADER_NAME, signatureHeaderValue);
  req.headers.set(SIGNATURE_INPUT_HEADER_NAME, signatureInputHeaderValue);
  req.headers.set(SIGNATURE_KEY_HEADER_NAME, signatureKeyHeaderValue);
}

function setSignatureHeaderValue(signatureName: SignatureName, signature: ArrayBuffer): string {
  return `${signatureName}=:${base64Encode(signature)}:`;
}

function appendToSignatureHeaderValue(
  previousSignatureHeaderValue: string,
  signatureName: SignatureName,
  signature: ArrayBuffer,
): string {
  const signatureValue = setSignatureHeaderValue(signatureName, signature);
  return [previousSignatureHeaderValue, signatureValue].join(SIGNATURES_SEPARATOR);
}

function setSignatureInputHeaderValue(
  signatureName: SignatureName,
  signatureInput: string,
): string {
  return `${signatureName}=${signatureInput}`;
}

function appendToSignatureInputHeaderValue(
  previousSignatureInputHeaderValue: string,
  signatureName: SignatureName,
  signatureInput: string,
): string {
  const signatureInputValue = setSignatureInputHeaderValue(signatureName, signatureInput);
  return [previousSignatureInputHeaderValue, signatureInputValue].join(SIGNATURES_SEPARATOR);
}

function setSignatureKeyHeaderValue(
  signatureName: SignatureName,
  signatureKey: SignatureKeyHeader,
): string {
  const encodedSignatureKey = base64Encode(JSON.stringify(signatureKey));
  return `${signatureName}=:${encodedSignatureKey}:`;
}

function appendToSignatureKeyHeaderValue(
  previousSignatureKeyHeaderValue: string,
  signatureName: SignatureName,
  signatureKey: SignatureKeyHeader,
): string {
  const signatureKeyValue = setSignatureKeyHeaderValue(signatureName, signatureKey);
  return [previousSignatureKeyHeaderValue, signatureKeyValue].join(SIGNATURES_SEPARATOR);
}
