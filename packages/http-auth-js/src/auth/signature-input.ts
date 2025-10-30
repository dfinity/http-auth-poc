import type { Principal } from '@icp-sdk/core/principal';
import { utf8ToBytes } from '@noble/hashes/utils';
import { base64Encode } from './base64';

const SIGNATURE_INPUT_SEPARATOR = ';';
const SIGNATURE_INPUT_KEY_VALUE_SEPARATOR = '=';

type CommonRequestMap = {
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
  HttpRequest = 'http_request',
  HttpRequestUpdate = 'http_request_update',
}

export abstract class SignatureInput<T = CommonRequestMap> {
  public readonly request_type: RequestType;
  public readonly sender: Principal;
  public readonly nonce: Uint8Array | undefined;
  public readonly ingress_expiry: bigint;

  constructor(
    request_type: RequestType,
    sender: Principal,
    nonce: Uint8Array | undefined,
    ingress_expiry: bigint,
  ) {
    this.request_type = request_type;
    this.sender = sender;
    this.nonce = nonce;
    this.ingress_expiry = ingress_expiry;
  }

  abstract toSignatureInputHeaderValue(): string;
  abstract toMap(): T;
}

/**
 * The map of a call request according to the IC Interface Specification: https://internetcomputer.org/docs/references/ic-interface-spec#http-call
 */
export class CallSignatureInput extends SignatureInput<CallRequestMap> {
  public readonly canister_id: Principal;
  public readonly method_name = MethodName.HttpRequestUpdate;
  public readonly arg: Uint8Array;

  constructor(
    canister_id: Principal,
    sender: Principal,
    nonce: Uint8Array | undefined,
    ingress_expiry: bigint,
    arg: Uint8Array,
  ) {
    super(RequestType.Call, sender, nonce, ingress_expiry);
    this.canister_id = canister_id;
    this.arg = arg;
  }

  public toMap(): CallRequestMap {
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

  public toSignatureInputHeaderValue(): string {
    const components: string[] = [];

    components.push(signatureInputRequestType(this.request_type));
    components.push(signatureInputPrincipal('canister_id', this.canister_id));
    components.push(signatureInputKeyValuePair('method_name', this.method_name));
    components.push(signatureInputSender(this.sender));
    if (this.nonce) {
      components.push(signatureInputNonce(this.nonce));
    }
    components.push(signatureInputIngressExpiry(this.ingress_expiry));

    // The arg component will be reconstructed by the HTTP Gateway from the HTTP Request it will receive from us.
    // Therefore, we don't include it in the signature input header value.

    return components.join(SIGNATURE_INPUT_SEPARATOR);
  }
}

/**
 * The map of a read_state request according to the IC Interface Specification: https://internetcomputer.org/docs/references/ic-interface-spec#http-read-state
 */
export class ReadStateSignatureInput extends SignatureInput<ReadStateRequestMap> {
  public readonly paths: string[][];

  constructor(
    sender: Principal,
    nonce: Uint8Array | undefined,
    ingress_expiry: bigint,
    paths: string[][],
  ) {
    super(RequestType.ReadState, sender, nonce, ingress_expiry);
    this.paths = paths;
  }

  public toMap(): ReadStateRequestMap {
    return {
      request_type: this.request_type,
      sender: this.sender,
      nonce: this.nonce,
      ingress_expiry: this.ingress_expiry,
      paths: this.paths.map((path) => path.map((p) => utf8ToBytes(p))),
    };
  }

  public toSignatureInputHeaderValue(): string {
    const components: string[] = [];

    components.push(signatureInputRequestType(this.request_type));
    components.push(signatureInputSender(this.sender));
    if (this.nonce) {
      components.push(signatureInputNonce(this.nonce));
    }
    components.push(signatureInputIngressExpiry(this.ingress_expiry));
    components.push(
      signatureInputKeyValuePair('paths', this.paths.map((path) => path.join('/')).join(',')),
    );

    return components.join(SIGNATURE_INPUT_SEPARATOR);
  }
}

/**
 * The map of a query request according to the IC Interface Specification: https://internetcomputer.org/docs/references/ic-interface-spec#http-query
 */
export class QuerySignatureInput extends SignatureInput<QueryRequestMap> {
  public readonly canister_id: Principal;
  public readonly method_name = MethodName.HttpRequestUpdate;
  public readonly arg: Uint8Array;

  constructor(
    canister_id: Principal,
    sender: Principal,
    nonce: Uint8Array | undefined,
    ingress_expiry: bigint,
    arg: Uint8Array,
  ) {
    super(RequestType.Query, sender, nonce, ingress_expiry);
    this.canister_id = canister_id;
    this.arg = arg;
  }

  public toMap(): QueryRequestMap {
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

  public toSignatureInputHeaderValue(): string {
    const components: string[] = [];

    components.push(signatureInputRequestType(this.request_type));
    components.push(signatureInputPrincipal('canister_id', this.canister_id));
    components.push(signatureInputKeyValuePair('method_name', this.method_name));
    components.push(signatureInputSender(this.sender));
    if (this.nonce) {
      components.push(signatureInputNonce(this.nonce));
    }
    components.push(signatureInputIngressExpiry(this.ingress_expiry));

    // The arg component will be reconstructed by the HTTP Gateway from the HTTP Request it will receive from us.
    // Therefore, we don't include it in the signature input header value.

    return components.join(SIGNATURE_INPUT_SEPARATOR);
  }
}

function signatureInputRequestType(request_type: RequestType): string {
  return signatureInputKeyValuePair('request_type', request_type);
}

function signatureInputSender(sender: Principal): string {
  return signatureInputPrincipal('sender', sender);
}

function signatureInputNonce(nonce: Uint8Array): string {
  return signatureInputKeyValuePair('nonce', base64Encode(nonce));
}

function signatureInputIngressExpiry(ingress_expiry: bigint): string {
  return signatureInputKeyValuePair('ingress_expiry', ingress_expiry.toString());
}

function signatureInputPrincipal(key: string, principal: Principal): string {
  return signatureInputKeyValuePair(key, principal.toText());
}

function signatureInputKeyValuePair(key: string, value: string): string {
  return `${key}${SIGNATURE_INPUT_KEY_VALUE_SEPARATOR}${value}`;
}
