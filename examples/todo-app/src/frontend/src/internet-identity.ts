import { exportKey, generateKeyPair } from './crypto';

export async function login(identityProvider: string): Promise<LoginResponse> {
  const windowHandle = window.open(`${identityProvider}#authorize`);

  const keyPair = await generateKeyPair();
  const publicKey = await exportKey(keyPair.publicKey);

  return new Promise((resolve, reject) => {
    function onMessage(event: MessageEvent<InternetIdentityMessage>) {
      if (event.origin !== identityProvider) {
        return;
      }

      switch (event.data.kind) {
        case 'authorize-ready':
          windowHandle?.postMessage(
            {
              kind: 'authorize-client',
              sessionPublicKey: publicKey,
            } satisfies InternetIdentityAuthRequest,
            new URL(identityProvider).origin,
          );
          return;

        case 'authorize-client-success':
          windowHandle?.close();
          window.removeEventListener('message', onMessage);
          resolve({
            keyPair,
            delegationChain: {
              publicKey: event.data.userPublicKey,
              delegations: event.data.delegations.map(delegation => ({
                delegation: {
                  pubkey: delegation.delegation.pubkey,
                  expiration: delegation.delegation.expiration,
                },
                signature: delegation.signature,
              })),
            },
          });
          return;

        case 'authorize-client-failure':
          windowHandle?.close();
          window.removeEventListener('message', onMessage);
          reject(new Error(event.data.text));
          return;
      }
    }

    window.addEventListener('message', onMessage);
  });
}

export interface LoginResponse {
  keyPair: CryptoKeyPair;
  delegationChain?: {
    publicKey: Uint8Array;
    delegations: {
      delegation: {
        pubkey: Uint8Array;
        expiration: bigint;
      };
      signature: Uint8Array;
    }[];
  };
}

type InternetIdentityMessage =
  | InternetIdentityReady
  | InternetIdentityAuthSuccessResponse
  | InternetIdentityAuthFailureResponse;

interface InternetIdentityReady {
  kind: 'authorize-ready';
}

interface InternetIdentityAuthSuccessResponse {
  kind: 'authorize-client-success';
  delegations: [
    {
      delegation: {
        pubkey: Uint8Array;
        expiration: bigint;
      };
      signature: Uint8Array;
    },
  ];
  userPublicKey: Uint8Array;
  authnMethod: 'passkey';
}

interface InternetIdentityAuthFailureResponse {
  kind: 'authorize-client-failure';
  text: string;
}

interface InternetIdentityAuthRequest {
  kind: 'authorize-client';
  sessionPublicKey: Uint8Array;
  maxTimeToLive?: bigint;
  allowPinAuthentication?: boolean;
  derivationOrigin?: string;
  autoSelectionPrincipal?: string;
}
