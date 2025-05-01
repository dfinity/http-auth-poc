import { epoch, isNil, isNotNil } from './util';
import { base64Encode } from './base64';
import { generateNonce, sha256 } from './crypto';
import { DelegationChain } from '@dfinity/identity';

// [TODO] - make expiration time configurable
const EXPIRATION_TIME = 5 * 60 * 1_000; // 5 minutes

export async function addHttpMessageSignatureToRequest(
  req: Request,
  keyPair: CryptoKeyPair,
  canisterId: string,
  delegationChain?: DelegationChain,
  sigName?: string | null,
  tag?: string | null,
): Promise<void> {
  // [TODO] - only do this if the header is not already present
  await addContentDigestHeader(req);

  const nonce = generateNonce();

  const createdDate = new Date();
  const expirationDate = new Date(createdDate.getTime() + EXPIRATION_TIME);
  const created = epoch(createdDate);
  const expires = epoch(expirationDate);

  await addHttpMessageSignatureHeaders(
    req,
    keyPair,
    nonce,
    created,
    expires,
    canisterId,
    delegationChain,
    sigName,
    tag,
  );
}

async function addContentDigestHeader(req: Request) {
  const hash = await sha256(await req.clone().arrayBuffer());
  const hashBase64 = base64Encode(new Uint8Array(hash));

  req.headers.set('Content-Digest', `SHA-256=${hashBase64}`);
}

async function addHttpMessageSignatureHeaders(
  req: Request,
  keyPair: CryptoKeyPair,
  nonce: string,
  created: number,
  expires: number,
  // [TODO] - use this
  _canisterId: string,
  delegationChain?: DelegationChain | null,
  sigName?: string | null,
  tag?: string | null,
): Promise<void> {
  const url = new URL(req.url);
  sigName = sigName ?? 'sig';

  let sigInput = '(';
  let sigBase = '';

  // [TODO] - add a component that represents the target canister

  sigInput += `"@method"`;
  sigBase += `"@method": ${req.method.toUpperCase()}\n`;

  sigInput += ` "@path"`;
  sigBase += `"@path": ${url.pathname}\n`;

  sigInput += ` "@query"`;
  sigBase += `"@query": ${url.search}\n`;

  sigInput += ` "content-digest"`;
  sigBase += addMessageSignatureHeader(req, 'content-digest');

  sigInput += ')';
  sigInput += `;keyid="header:signature-key"`;
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

  let sigKeyHeader: SignatureKeyHeader = {
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

  let encodedSigKeyHeader = base64Encode(JSON.stringify(sigKeyHeader));

  req.headers.set('Signature', `${sigName}=:${encodedSig}:`);
  req.headers.set('Signature-Input', `${sigName}=${sigInput}`);
  req.headers.set('Signature-Key', `${sigName}=:${encodedSigKeyHeader}:`);
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

function addMessageSignatureHeader(req: Request, headerName: string): string {
  headerName = headerName.toLowerCase();

  const headerValue = req.headers.get(headerName);
  if (isNil(headerValue)) {
    throw new Error(`Required ${headerName} header is missing from request.`);
  }

  return `"${headerName}": ${headerValue}\n`;
}
