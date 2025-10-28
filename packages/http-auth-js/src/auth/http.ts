/**
 * Write request line and headers (but not body) of this HTTP 1.1 request
 * May add 'Host:' header automatically
 * Returns an object with the buffer and number of bytes written
 *
 * If the request URL contains username and password (basic auth),
 * an 'Authorization: Basic' HTTP header is automatically added
 *
 * @param request - The HTTP request (or request parameters)
 * @param options - Optional configuration
 * @returns Object containing the buffer and byte length
 */
export interface WriteRequestHeaderOptions {
  /**
   * Whether to include basic auth header if credentials are in URL
   * @default true
   */
  includeBasicAuth?: boolean;
}

export interface HttpRequest {
  method: string;
  url: string | URL;
  headers: Headers | Record<string, string>;
}

export function writeRequestHeader(
  request: HttpRequest | Request,
  options: WriteRequestHeaderOptions = {},
): { buffer: Uint8Array; length: number } {
  const { includeBasicAuth = true } = options;

  const chunks: Uint8Array[] = [];
  const textEncoder = new TextEncoder();

  // Helper function to write bytes
  const write = (data: string | Uint8Array): void => {
    const bytes = typeof data === 'string' ? textEncoder.encode(data) : data;
    chunks.push(bytes);
  };

  // Parse the URL
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // Build path and query
  let pathAndQuery = url.pathname;
  if (url.search) {
    pathAndQuery += url.search;
  }
  if (!pathAndQuery) {
    pathAndQuery = '/';
  }

  // Get headers as a Map-like structure
  const headers =
    request.headers instanceof Headers ? request.headers : new Headers(request.headers);

  // Check if we need to insert Host header
  const needToInsertHost = url.host && !headers.has('host');

  // Write request line: METHOD path_and_query HTTP/1.1\r\n
  write(method);
  write(' ');
  write(pathAndQuery);
  write(' HTTP/1.1\r\n');

  // Add Host header if needed
  if (needToInsertHost) {
    write('Host: ');
    write(url.host);
    write('\r\n');
  }

  // Handle Basic Auth if credentials are in URL
  if (includeBasicAuth && url.username && !headers.has('authorization')) {
    write('Authorization: Basic ');

    // Decode percent-encoded username and password
    const username = decodeURIComponent(url.username);
    const password = url.password ? decodeURIComponent(url.password) : '';
    const credentials = `${username}:${password}`;

    // Base64 encode the credentials
    const credentialsBase64 = btoa(credentials);
    write(credentialsBase64);
    write('\r\n');
  }

  // Write all headers
  headers.forEach((value, name) => {
    write(name);
    write(': ');
    write(value);
    write('\r\n');
  });

  // Final CRLF to end headers section
  write('\r\n');

  // Concatenate all chunks into a single buffer
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const resultBuffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    resultBuffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    buffer: resultBuffer,
    length: totalLength,
  };
}

/**
 * Converts an HTTP request to a string representation (headers only, no body)
 * @param request - The HTTP request
 * @param options - Optional configuration
 * @returns String representation of the request headers
 */
export function requestHeaderToString(
  request: HttpRequest | Request,
  options: WriteRequestHeaderOptions = {},
): string {
  const { buffer } = writeRequestHeader(request, options);
  return new TextDecoder().decode(buffer);
}
