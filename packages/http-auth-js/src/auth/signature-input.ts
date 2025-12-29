import type { Principal } from '@icp-sdk/core/principal';
import { utf8ToBytes } from '@noble/hashes/utils';
import { base64Encode } from './base64';
import { generateNonce } from './crypto';
import { toRequestId } from './request-id';

export type CommonRequestMap = {
  request_type: string;
  sender: Principal;
  nonce?: Uint8Array;
  ingress_expiry: bigint;
};

type CallRequestMap = CommonRequestMap & {
  canister_id: Principal;
  method_name: string;
  arg: Uint8Array;
};

type ReadStateRequestMap = CommonRequestMap & {
  paths: Uint8Array[][];
};

type QueryRequestMap = CommonRequestMap & {
  canister_id: Principal;
  method_name: string;
  arg: Uint8Array;
};

enum RequestType {
  Call = 'call',
  ReadState = 'read_state',
  Query = 'query',
}

enum MethodName {
  HttpRequest = 'http_request_v2',
  HttpRequestUpdate = 'http_request_update_v2',
}

abstract class SignatureInputIncludeHeaders {
  /**
   * The headers to include in the bHTTP representation of the request.
   */
  abstract include_headers: string[];
}

export abstract class SignatureInput<T extends CommonRequestMap> {
  public readonly request_type: RequestType;
  public readonly sender: Principal;
  public readonly nonce: Uint8Array;
  public readonly ingress_expiry: bigint;

  constructor(
    request_type: RequestType,
    sender: Principal,
    nonce: Uint8Array | undefined,
    ingress_expiry: bigint,
  ) {
    this.request_type = request_type;
    this.sender = sender;
    this.nonce = nonce || generateNonce();
    this.ingress_expiry = ingress_expiry;
  }

  abstract toSignatureInputComponents(): string[];

  /**
   * Creates an object representation of the current input.
   */
  abstract toMap(): T;

  /**
   * Creates a request id of the current input according to the IC Interface Specification: https://internetcomputer.org/docs/references/ic-interface-spec#http-request-id
   */
  toRequestId(): Uint8Array {
    return toRequestId(this.toMap());
  }

  signatureInputRequestType(): string {
    return this.signatureInputKeyValuePair('request_type', this.request_type);
  }

  signatureInputCanisterId(canister_id: Principal): string {
    return this.signatureInputKeyValuePair('canister_id', canister_id.toText());
  }

  signatureInputMethodName(method_name: MethodName): string {
    return this.signatureInputKeyValuePair('method_name', method_name);
  }

  signatureInputSender(): string {
    return this.signatureInputKeyValuePair('sender', this.sender.toText());
  }

  signatureInputNonce(): string {
    return this.signatureInputKeyValuePair('nonce', base64Encode(this.nonce));
  }

  signatureInputIngressExpiry(): string {
    return this.signatureInputKeyValuePair('ingress_expiry', this.ingress_expiry.toString());
  }

  signatureInputIncludeHeaders(include_headers: string[]): string {
    return this.signatureInputKeyValuePair('include_headers', include_headers.join(','));
  }

  signatureInputKeyValuePair(key: string, value: string): string {
    return `${key}=${value}`;
  }
}

/**
 * The map of a call request according to the IC Interface Specification: https://internetcomputer.org/docs/references/ic-interface-spec#http-call
 */
export class CallSignatureInput
  extends SignatureInput<CallRequestMap>
  implements SignatureInputIncludeHeaders
{
  public readonly canister_id: Principal;
  public readonly method_name = MethodName.HttpRequestUpdate;
  public readonly arg: Uint8Array;
  public readonly include_headers: string[];

  constructor(
    canister_id: Principal,
    sender: Principal,
    nonce: Uint8Array | undefined,
    ingress_expiry: bigint,
    arg: Uint8Array,
    include_headers: string[],
  ) {
    super(RequestType.Call, sender, nonce, ingress_expiry);
    this.canister_id = canister_id;
    this.arg = arg;
    this.include_headers = include_headers;
  }

  toMap(): CallRequestMap {
    return {
      request_type: this.request_type,
      canister_id: this.canister_id,
      method_name: this.method_name,
      sender: this.sender,
      nonce: this.nonce,
      ingress_expiry: this.ingress_expiry,
      arg: this.arg,
    };
  }

  public toSignatureInputComponents() {
    const components: string[] = [
      this.signatureInputRequestType(),
      this.signatureInputCanisterId(this.canister_id),
      this.signatureInputMethodName(this.method_name),
      this.signatureInputSender(),
      this.signatureInputIngressExpiry(),
      this.signatureInputIncludeHeaders(this.include_headers),
      this.signatureInputNonce(),
    ];

    // The arg component will be reconstructed by the HTTP Gateway from the HTTP Request it will receive from us.
    // Therefore, we don't include it in the signature input header value.

    return components;
  }
}

/**
 * The map of a read_state request according to the IC Interface Specification: https://internetcomputer.org/docs/references/ic-interface-spec#http-read-state
 */
export class ReadStateSignatureInput extends SignatureInput<ReadStateRequestMap> {
  public readonly paths: Array<Array<Uint8Array>>;

  constructor(
    sender: Principal,
    nonce: Uint8Array | undefined,
    ingress_expiry: bigint,
    paths: Array<Array<string | Uint8Array>>,
  ) {
    super(RequestType.ReadState, sender, nonce, ingress_expiry);
    this.paths = pathsToBytes(paths);
  }

  toMap(): ReadStateRequestMap {
    return {
      request_type: this.request_type,
      sender: this.sender,
      nonce: this.nonce,
      ingress_expiry: this.ingress_expiry,
      paths: this.paths,
    };
  }

  public toSignatureInputComponents() {
    const components: string[] = [
      this.signatureInputRequestType(),
      this.signatureInputSender(),
      this.signatureInputIngressExpiry(),
      this.signatureInputKeyValuePair('paths', encodePaths(this.paths).join(',')),
      this.signatureInputNonce(),
    ];

    return components;
  }
}

/**
 * The map of a query request according to the IC Interface Specification: https://internetcomputer.org/docs/references/ic-interface-spec#http-query
 */
export class QuerySignatureInput
  extends SignatureInput<QueryRequestMap>
  implements SignatureInputIncludeHeaders
{
  public readonly canister_id: Principal;
  public readonly method_name = MethodName.HttpRequestUpdate;
  public readonly arg: Uint8Array;
  public readonly include_headers: string[];

  constructor(
    canister_id: Principal,
    sender: Principal,
    nonce: Uint8Array | undefined,
    ingress_expiry: bigint,
    arg: Uint8Array,
    include_headers: string[],
  ) {
    super(RequestType.Query, sender, nonce, ingress_expiry);
    this.canister_id = canister_id;
    this.arg = arg;
    this.include_headers = include_headers;
  }

  toMap(): QueryRequestMap {
    return {
      request_type: this.request_type,
      canister_id: this.canister_id,
      method_name: this.method_name,
      sender: this.sender,
      nonce: this.nonce,
      ingress_expiry: this.ingress_expiry,
      arg: this.arg,
    };
  }

  public toSignatureInputComponents() {
    const components: string[] = [
      this.signatureInputRequestType(),
      this.signatureInputCanisterId(this.canister_id),
      this.signatureInputMethodName(this.method_name),
      this.signatureInputSender(),
      this.signatureInputIngressExpiry(),
      this.signatureInputIncludeHeaders(this.include_headers),
      this.signatureInputNonce(),
    ];

    // The arg component will be reconstructed by the HTTP Gateway from the HTTP Request it will receive from us.
    // Therefore, we don't include it in the signature input header value.

    return components;
  }
}

function encodePaths(paths: Array<Array<Uint8Array>>): string[] {
  return paths.map((path) => path.map((p) => base64Encode(p)).join('/'));
}

function pathsToBytes(paths: Array<Array<string | Uint8Array>>): Uint8Array[][] {
  return paths.map((path) => path.map((p) => (typeof p === 'string' ? utf8ToBytes(p) : p)));
}
