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

export async function exportKeyPair(keyPair: CryptoKeyPair): Promise<JsonableCryptoKeyPair> {
  return {
    publicKey: await crypto.subtle.exportKey(KEY_FORMAT, keyPair.publicKey),
    privateKey: await crypto.subtle.exportKey(KEY_FORMAT, keyPair.privateKey),
  };
}

export async function importKeyPair(keyPair: JsonableCryptoKeyPair): Promise<CryptoKeyPair> {
  return {
    publicKey: await crypto.subtle.importKey(
      KEY_FORMAT,
      keyPair.publicKey,
      EC_PARAMS,
      true,
      [], // Public keys typically have empty usage array or ['verify']
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

/**
 * Import a key pair from a PEM-encoded private key.
 *
 * The PEM-encoded private key is generated with:
 * ```bash
 * openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out private.pem
 * ```
 */
export async function importKeyPairFromPem(pem: string): Promise<CryptoKeyPair> {
  const pemContent = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  try {
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      Buffer.from(pemContent, 'base64'),
      EC_PARAMS,
      true,
      KEY_USAGES,
    );
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', privateKey);

    // Create a new JWK containing only the public key components
    const publicKeyJwk: JsonWebKey = {
      kty: privateKeyJwk.kty,
      crv: privateKeyJwk.crv,
      x: privateKeyJwk.x,
      y: privateKeyJwk.y,
      ext: true, // Mark the key as extractable if needed, align with private key import
    };
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      publicKeyJwk,
      EC_PARAMS,
      true, // Should match the 'ext' flag in JWK
      [], // Public keys typically have empty usage array or ['verify']
    );

    return {
      publicKey,
      privateKey,
    };
  } catch (error) {
    console.error('Error importing key pair from PEM', error);
    throw error;
  }
}
