import { addHttpMessageSignatureToRequest } from '@dfinity/http-auth';
import type { RequestHook, InsomniaContext } from './insomnia';
import { exportKeyPair, generateKeyPair, importKeyPair } from './crypto';

const KEY_PAIR_STORE_KEY = 'ic-http-auth-key-pair';

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

const getKeyPair = async (context: InsomniaContext): Promise<CryptoKeyPair> => {
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

const requestHooks: RequestHook[] = [
  async context => {
    const keyPair = await getKeyPair(context);
    const request = new Request(context.request.getUrl(), {
      method: context.request.getMethod(),
      headers: context.request
        .getHeaders()
        .map(({ name, value }) => [name, value]),
      body: context.request.getBody().text,
    });
    await addHttpMessageSignatureToRequest(
      request,
      keyPair,
      'bkyz2-fmaaa-aaaaa-qaaaq-cai',
    );
    context.request.setHeader(
      'Content-Digest',
      request.headers.get('Content-Digest')!,
    );
    context.request.setHeader('Signature', request.headers.get('Signature')!);
    context.request.setHeader(
      'Signature-Input',
      request.headers.get('Signature-Input')!,
    );
    context.request.setHeader(
      'Signature-Key',
      request.headers.get('Signature-Key')!,
    );
  },
];

// module.exports is required for Insomnia
module.exports.requestHooks = requestHooks;
