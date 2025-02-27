import { base64Encode } from './base64';

export function generateNonce(): string {
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  return base64Encode(nonce);
}

export async function sha256(
  data: string | ArrayBuffer | ArrayBufferView,
): Promise<ArrayBuffer> {
  if (typeof data === 'string') {
    return await sha256Buffer(new TextEncoder().encode(data));
  }

  return await sha256Buffer(data);
}

async function sha256Buffer(
  data: ArrayBuffer | ArrayBufferView,
): Promise<ArrayBuffer> {
  return await crypto.subtle.digest('SHA-256', data);
}
