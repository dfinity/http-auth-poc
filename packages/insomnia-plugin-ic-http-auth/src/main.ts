import { getHttpMessageSignatureHeaders } from '@dfinity/http-auth';
import type { RequestHook, InsomniaContext } from './insomnia';
import {
  exportKeyPair,
  generateKeyPair,
  importKeyPair,
  importKeyPairFromPem,
} from './crypto';

const KEY_PAIR_STORE_KEY = 'ic-http-auth-key-pair';
const ENVIRONMENT_VARIABLE_NAME = 'identity';

const generateKeyPairAndStore = async (
  context: InsomniaContext,
): Promise<CryptoKeyPair> => {
  console.log('Generating and storing new key pair');
  const keyPair = await generateKeyPair();
  const jsonableKeyPair = await exportKeyPair(keyPair);
  await context.store.setItem(
    KEY_PAIR_STORE_KEY,
    JSON.stringify(jsonableKeyPair),
  );
  return keyPair;
};

const getOrCreateKeyPairInStorage = async (
  context: InsomniaContext,
): Promise<CryptoKeyPair> => {
  const rawKeyPair = await context.store.getItem(KEY_PAIR_STORE_KEY);
  let keyPair: CryptoKeyPair;
  if (!rawKeyPair) {
    console.log('Key pair not found in store');
    keyPair = await generateKeyPairAndStore(context);
  } else {
    console.log('Key pair found in store');
    try {
      keyPair = await importKeyPair(JSON.parse(rawKeyPair));
    } catch (error) {
      console.error('Error parsing key pair', error);
      await context.store.removeItem(KEY_PAIR_STORE_KEY);
      keyPair = await generateKeyPairAndStore(context);
    }
  }
  return keyPair;
};

const loadKeyPair = async (
  context: InsomniaContext,
): Promise<CryptoKeyPair> => {
  let keyPair: CryptoKeyPair;
  const envPrivateKeyPem = context.request.getEnvironmentVariable(
    ENVIRONMENT_VARIABLE_NAME,
  );
  if (envPrivateKeyPem) {
    keyPair = await importKeyPairFromPem(envPrivateKeyPem);
  } else {
    keyPair = await getOrCreateKeyPairInStorage(context);
  }
  return keyPair;
};

const requestHooks: RequestHook[] = [
  async context => {
    const keyPair = await loadKeyPair(context);
    const signatureHeaders = await getHttpMessageSignatureHeaders(
      { keyPair },
      {
        url: context.request.getUrl(),
        method: context.request.getMethod(),
        headers: new Headers(
          context.request.getHeaders().map(({ name, value }) => [name, value]),
        ),
        body: context.request.getBody().text || '',
        canisterId: 'bkyz2-fmaaa-aaaaa-qaaaq-cai',
      },
    );
    signatureHeaders.forEach(([headerName, headerValue]) => {
      context.request.setHeader(headerName, headerValue);
    });
  },
];

// module.exports is required for Insomnia
module.exports.requestHooks = requestHooks;
