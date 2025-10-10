export function base64Encode(data: string | Uint8Array | ArrayBuffer): string {
  if (data instanceof ArrayBuffer) {
    return base64EncodeUint8Array(new Uint8Array(data));
  }

  if (typeof data === 'string') {
    return base64EncodeUint8Array(new TextEncoder().encode(data));
  }

  return base64EncodeUint8Array(data);
}

function base64EncodeUint8Array(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
