import { epoch, isNil, isNotNil } from './util';
import { base64Encode } from './base64';
import { generateNonce, sha256 } from './crypto';
import { DelegationChain } from '@dfinity/identity';

const DEFAULT_EXPIRATION_TIME_MS = 5 * 60 * 1_000; // 5 minutes
const DEFAULT_SIG_NAME = 'sig';

const SIGNATURE_HEADER_NAME = 'signature';
const SIGNATURE_INPUT_HEADER_NAME = 'signature-input';
const SIGNATURE_KEY_HEADER_NAME = 'signature-key';
const CONTENT_DIGEST_HEADER_NAME = 'content-digest';

export function signatureTimestamps(
  expirationTimeMs = DEFAULT_EXPIRATION_TIME_MS,
): {
  created: number;
  expires: number;
} {
  const createdDate = new Date();
  const expirationDate = new Date(createdDate.getTime() + expirationTimeMs);
  return {
    created: epoch(createdDate),
    expires: epoch(expirationDate),
  };
}

export type HttpMessageSignatureRequestParams = {
  canisterId: string;
  keyPair: CryptoKeyPair;
  delegationChain?: DelegationChain;
  sigName?: string | null;
  tag?: string | null;
};

export async function addHttpMessageSignatureToRequest(
  req: Request,
  {
    keyPair,
    delegationChain,
    canisterId,
    sigName,
    tag,
  }: HttpMessageSignatureRequestParams,
): Promise<void> {
  const nonce = generateNonce();
  const { created, expires } = signatureTimestamps();

  const signatureHeaders = await getHttpMessageSignatureHeaders(
    {
      keyPair,
      delegationChain,
    },
    {
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: await req.clone().arrayBuffer(),
      created,
      expires,
      canisterId,
      nonce,
      sigName,
      tag,
    },
  );

  signatureHeaders.forEach(([headerName, headerValue]) => {
    req.headers.set(headerName, headerValue);
  });
}

async function contentDigestHeader(
  body: ArrayBuffer | ArrayBufferView | string,
): Promise<[string, string]> {
  const hash = await sha256(body);
  const hashBase64 = base64Encode(new Uint8Array(hash));

  return [CONTENT_DIGEST_HEADER_NAME, `SHA-256=${hashBase64}`];
}

async function addContentDigestHeader(
  headers: Headers,
  body: ArrayBuffer | ArrayBufferView | string,
): Promise<string> {
  const existingHeaderValue = headers.get(CONTENT_DIGEST_HEADER_NAME);
  // no need to add the content-digest header if it's already present
  if (existingHeaderValue) {
    return existingHeaderValue;
  }

  const [headerName, headerValue] = await contentDigestHeader(body);
  headers.set(headerName, headerValue);
  return headerValue;
}

interface SignatureKeyHeader {
  pubKey: string;
  delegationChain?: SignatureKeyHeaderDelegationChain | null;
}

interface SignatureKeyHeaderDelegationChain {
  pubKey: string;
  delegations: SignatureKeyHeaderDelegation[];
}

interface SignatureKeyHeaderDelegation {
  delegation: {
    pubKey: string;
    expiration: string;
    targets?: string[] | null;
  };
  sig: string;
}

function addMessageSignatureHeader(
  headers: Headers,
  headerName: string,
): string {
  headerName = headerName.toLowerCase();

  const headerValue = headers.get(headerName);
  if (isNil(headerValue)) {
    throw new Error(`Required ${headerName} header is missing from request.`);
  }

  return `"${headerName}": ${headerValue}\n`;
}

export type HttpMessageSignatureIdentity = {
  keyPair: CryptoKeyPair;
  delegationChain?: DelegationChain;
};

export type HttpMessageSignatureParams = {
  url: string | URL;
  method: string;
  headers: Headers;
  body: ArrayBuffer | ArrayBufferView | string;
  created: number;
  expires: number;
  nonce: string;
  tag?: string | null;
  sigName?: string | null;
  canisterId: string;
};

export async function getHttpMessageSignatureHeaders(
  { keyPair, delegationChain }: HttpMessageSignatureIdentity,
  {
    url: urlParam,
    method,
    headers,
    body,
    created,
    expires,
    nonce,
    tag,
    sigName = DEFAULT_SIG_NAME,
    // [TODO] - add a component that represents the target canister
    canisterId: _canisterId,
  }: HttpMessageSignatureParams,
): Promise<[string, string][]> {
  const url = new URL(urlParam);

  const contentDigestHeaderValue = await addContentDigestHeader(headers, body);

  let sigInput = '(';
  let sigBase = '';

  sigInput += `"@method"`;
  sigBase += `"@method": ${method.toUpperCase()}\n`;

  sigInput += ` "@path"`;
  sigBase += `"@path": ${url.pathname}\n`;

  sigInput += ` "@query"`;
  sigBase += `"@query": ${url.search}\n`;

  sigInput += ` "${CONTENT_DIGEST_HEADER_NAME}"`;
  sigBase += addMessageSignatureHeader(headers, CONTENT_DIGEST_HEADER_NAME);

  sigInput += ')';
  sigInput += `;keyid="header:${SIGNATURE_KEY_HEADER_NAME}"`;
  sigInput += `;alg="ecdsa-p256-sha256"`;
  sigInput += `;created=${created}`;
  sigInput += `;expires=${expires}`;
  sigInput += `;nonce="${nonce}"`;

  if (isNotNil(tag)) {
    sigInput += `;tag="${tag}"`;
  }

  sigBase += `"@signature-params": ${sigInput}\n`;

  const sig = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: {
        name: 'SHA-256',
      },
    },
    keyPair.privateKey,
    new TextEncoder().encode(sigBase),
  );

  const encodedSig = base64Encode(sig);
  const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const encodedPublicKey = base64Encode(publicKey);

  const sigKeyHeader: SignatureKeyHeader = {
    pubKey: encodedPublicKey,
  };
  if (isNotNil(delegationChain)) {
    sigKeyHeader.delegationChain = {
      pubKey: base64Encode(delegationChain.publicKey),
      delegations: delegationChain.delegations.map(
        ({ delegation, signature }) => ({
          delegation: {
            pubKey: base64Encode(delegation.pubkey),
            expiration: delegation.expiration.toString(),
          },
          sig: base64Encode(signature),
        }),
      ),
    };
  }

  const encodedSigKeyHeader = base64Encode(JSON.stringify(sigKeyHeader));

  return [
    [SIGNATURE_HEADER_NAME, `${sigName}=:${encodedSig}:`],
    [SIGNATURE_INPUT_HEADER_NAME, `${sigName}=${sigInput}`],
    [SIGNATURE_KEY_HEADER_NAME, `${sigName}=:${encodedSigKeyHeader}:`],
    [CONTENT_DIGEST_HEADER_NAME, contentDigestHeaderValue],
  ];
}
