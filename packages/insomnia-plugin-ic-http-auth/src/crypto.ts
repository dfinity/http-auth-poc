const ALGORITHM_NAME = 'ECDSA';
const CURVE_NAME = 'P-256';
const EC_PARAMS: EcKeyAlgorithm = {
  name: ALGORITHM_NAME,
  namedCurve: CURVE_NAME,
};
const KEY_USAGES: KeyUsage[] = ['sign'];
const KEY_FORMAT: Extract<KeyFormat, 'jwk'> = 'jwk';

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(EC_PARAMS, true, KEY_USAGES);
}

type JsonableCryptoKeyPair = {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
};

export async function exportKeyPair(
  keyPair: CryptoKeyPair,
): Promise<JsonableCryptoKeyPair> {
  return {
    publicKey: await crypto.subtle.exportKey(KEY_FORMAT, keyPair.publicKey),
    privateKey: await crypto.subtle.exportKey(KEY_FORMAT, keyPair.privateKey),
  };
}

export async function importKeyPair(
  keyPair: JsonableCryptoKeyPair,
): Promise<CryptoKeyPair> {
  return {
    publicKey: await crypto.subtle.importKey(
      KEY_FORMAT,
      keyPair.publicKey,
      EC_PARAMS,
      true,
      [],
    ),
    privateKey: await crypto.subtle.importKey(
      KEY_FORMAT,
      keyPair.privateKey,
      EC_PARAMS,
      true,
      KEY_USAGES,
    ),
  };
}
