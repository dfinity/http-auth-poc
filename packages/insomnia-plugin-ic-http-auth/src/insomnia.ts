// types from https://docs.insomnia.rest/insomnia/context-object-reference

import { Readable } from 'node:stream';

interface RequestContext {
  getId(): string;
  getName(): string;
  getUrl(): string;
  setUrl(url: string): void;
  getMethod(): string;
  setMethod(method: string): void;
  getHeaders(): Array<{ name: string; value: string }>;
  getHeader(name: string): string | null;
  hasHeader(name: string): boolean;
  removeHeader(name: string): void;
  setHeader(name: string, value: string): void;
  addHeader(name: string, value: string): void;
  getParameter(name: string): string | null;
  getParameters(): Array<{ name: string; value: string }>;
  setParameter(name: string, value: string): void;
  hasParameter(name: string): boolean;
  addParameter(name: string, value: string): void;
  removeParameter(name: string): void;
  getBody(): RequestBody;
  setBody(body: RequestBody): void;
  getEnvironmentVariable(name: string): any;
  getEnvironment(): Object;
  setAuthenticationParameter(name: string, value: string): void;
  getAuthentication(): Object;
  setCookie(name: string, value: string): void;
  settingSendCookies(enabled: boolean): void;
  settingStoreCookies(enabled: boolean): void;
  settingEncodeUrl(enabled: boolean): void;
  settingDisableRenderRequestBody(enabled: boolean): void;
  settingFollowRedirects(enabled: boolean): void;
}

interface ResponseContext {
  getRequestId(): string;
  getStatusCode(): number;
  getStatusMessage(): string;
  getBytesRead(): number;
  getTime(): number;
  getBody(): Buffer | null;
  getBodyStream(): Readable;
  setBody(body: Buffer): void;
  getHeader(name: string): string | Array<string> | null;
  getHeaders(): Array<{ name: string; value: string }> | undefined;
  hasHeader(name: string): boolean;
}

interface StoreContext {
  hasItem(key: string): Promise<boolean>;
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  all(): Promise<Array<{ key: string; value: string }>>;
}

interface RequestBody {
  mimeType?: string;
  text?: string;
  fileName?: string;
  params?: RequestBodyParameter[];
}

interface RequestBodyParameter {
  name: string;
  value: string;
  description?: string;
  disabled?: boolean;
  multiline?: string;
  id?: string;
  fileName?: string;
  type?: string;
}

export type InsomniaContext = {
  request: RequestContext;
  response: ResponseContext;
  store: StoreContext;
};

export type RequestHook = (context: InsomniaContext) => Promise<void> | void;
