import { base64Encode } from './base64';

export function generateNonce(): Uint8Array {
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  return nonce;
}

export function generateNonceBase64(): string {
  const nonce = generateNonce();
  return base64Encode(nonce);
}

export async function sha256(data: string | BufferSource): Promise<ArrayBuffer> {
  if (typeof data === 'string') {
    data = new TextEncoder().encode(data);
  }

  return await sha256Buffer(data);
}

async function sha256Buffer(data: BufferSource): Promise<ArrayBuffer> {
  return await crypto.subtle.digest('SHA-256', data);
}
