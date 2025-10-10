use crate::{
    HttpAuthError, HttpAuthResult,
    base64::{base64_decode, deserialize_base64_string_to_bytes},
    delegation::{DelegationChain, validate_delegation_and_get_principal},
    parse_utils::{parse_http_sig, parse_http_sig_input, parse_http_sig_key},
};
use candid::Principal;
use ic_http_certification::{HeaderField, HttpRequest};
use p256::{
    PublicKey,
    ecdsa::{Signature, VerifyingKey, signature::Verifier},
    pkcs8::{DecodePublicKey, EncodePublicKey},
};
use serde::{Deserialize, Serialize};

const SIGNATURE_HEADER_NAME: &str = "signature";
const SIGNATURE_KEY_HEADER_NAME: &str = "signature-key";
const SIGNATURE_INPUT_HEADER_NAME: &str = "signature-input";

pub struct HttpSignatureValidationData {
    pub principal: Principal,
}

/// The `Signature-Key` header value.
#[derive(Debug, Serialize, Deserialize)]
pub struct SignatureKeyHeader {
    /// The DER-encoded public key.
    #[serde(
        rename = "pubKey",
        deserialize_with = "deserialize_base64_string_to_bytes"
    )]
    pub pub_key: Vec<u8>,
    #[serde(rename = "delegationChain")]
    pub delegation_chain: Option<DelegationChain>,
}

impl TryFrom<&[HeaderField]> for SignatureKeyHeader {
    type Error = HttpAuthError;

    fn try_from(headers: &[HeaderField]) -> HttpAuthResult<Self> {
        let sig_key_header_str = find_header(headers, SIGNATURE_KEY_HEADER_NAME)
            .ok_or(HttpAuthError::MissingSignatureKeyHeader)?;

        let (_, http_sig_key) = parse_http_sig_key(sig_key_header_str)?;

        let sig_key_bytes = base64_decode(http_sig_key)
            .map_err(|err| HttpAuthError::MalformedHttpSigKey(format!("{:?}", err)))?;
        let sig_key_header = serde_json::from_slice::<SignatureKeyHeader>(&sig_key_bytes)
            .map_err(|err| HttpAuthError::MalformedHttpSigKey(format!("{:?}", err)))?;

        Ok(sig_key_header)
    }
}

impl SignatureKeyHeader {
    fn signature_pub_key_der(&self) -> HttpAuthResult<Vec<u8>> {
        let public_key = PublicKey::from_public_key_der(&self.pub_key)
            .map_err(|_| HttpAuthError::MalformedEcdsaPublicKey)
            .unwrap();
        let public_key_der = public_key
            .to_public_key_der()
            .map_err(|_| HttpAuthError::MalformedEcdsaPublicKey)
            .unwrap()
            .to_vec();

        Ok(public_key_der)
    }
}

pub fn validate_http_signature_headers(
    req: &HttpRequest,
    ic_root_key_raw: &[u8],
) -> HttpAuthResult<HttpSignatureValidationData> {
    let validation_input = HttpSignatureValidationInput::try_from(req)?;

    verify_sig(
        &validation_input.payload,
        &validation_input.signature,
        validation_input.signature_pub_key(),
    )?;

    if let Some(delegation_chain) = validation_input.delegation_chain() {
        let principal = validate_delegation_and_get_principal(
            delegation_chain,
            "rdmx6-jaaaa-aaaaa-aaadq-cai",
            ic_root_key_raw,
        )
        .unwrap();

        return Ok(HttpSignatureValidationData { principal });
    }

    let public_key_der = validation_input.signature_pub_key_der()?;

    Ok(HttpSignatureValidationData {
        principal: Principal::self_authenticating(public_key_der),
    })
}

struct HttpSignatureValidationInput {
    /// The [SignatureKeyHeader] parsed from the `Signature-Key` header.
    signature_key_header: SignatureKeyHeader,
    /// The signature parsed from the `Signature` header.
    signature: Vec<u8>,
    /// The payload parsed from the `Signature-Input` header.
    payload: Vec<u8>,
}

impl TryFrom<&HttpRequest<'_>> for HttpSignatureValidationInput {
    type Error = HttpAuthError;

    fn try_from(req: &HttpRequest) -> HttpAuthResult<Self> {
        let headers = req.headers();

        let signature = get_http_sig_bytes(headers)?;
        let signature_key_header = SignatureKeyHeader::try_from(headers)?;
        let payload = get_http_sig_input_payload(req, headers)?;

        Ok(Self {
            signature_key_header,
            signature,
            payload,
        })
    }
}

impl HttpSignatureValidationInput {
    /// Returns the signature's public key parsed from the `Signature-Key` header value, as bytes.
    fn signature_pub_key(&self) -> &[u8] {
        self.signature_key_header.pub_key.as_slice()
    }

    /// Returns the signature's public key parsed from the `Signature-Key` header value, in DER format.
    fn signature_pub_key_der(&self) -> HttpAuthResult<Vec<u8>> {
        self.signature_key_header.signature_pub_key_der()
    }

    /// Returns the delegation chain parsed from the `Signature-Key` header value, if it exists.
    fn delegation_chain(&self) -> Option<&DelegationChain> {
        self.signature_key_header.delegation_chain.as_ref()
    }
}

fn calculate_http_sig(
    req: &HttpRequest,
    req_headers: &[HeaderField],
    http_sig_input: &str,
    http_sig_input_elems: Vec<&str>,
) -> HttpAuthResult<Vec<u8>> {
    let mut calculated_http_sig = String::from("");

    for elem in http_sig_input_elems {
        let value = match elem {
            "@method" => req.method().to_string().to_uppercase(),
            "@path" => req.get_path()?,
            "@query" => req
                .get_query()?
                .map(|query| {
                    let mut q = String::from("?");
                    q.push_str(&query);
                    q
                })
                .unwrap_or_default(),
            _ => find_header(req_headers, elem)
                .ok_or_else(|| HttpAuthError::MissingHeaderField(elem.to_string()))?
                .to_string(),
        };

        calculated_http_sig.push('"');
        calculated_http_sig.push_str(elem);
        calculated_http_sig.push_str("\": ");
        calculated_http_sig.push_str(&value);
        calculated_http_sig.push('\n');
    }

    calculated_http_sig.push_str("\"@signature-params\": ");
    calculated_http_sig.push_str(http_sig_input);
    calculated_http_sig.push('\n');

    Ok(calculated_http_sig.as_bytes().to_vec())
}

fn verify_sig(payload: &[u8], sig: &[u8], public_key: &[u8]) -> HttpAuthResult {
    let sig = Signature::from_slice(sig).map_err(|_| HttpAuthError::MalformedEcdsaSignature)?;

    let public_key = PublicKey::from_public_key_der(public_key)
        .map_err(|_| HttpAuthError::MalformedEcdsaPublicKey)
        .unwrap();
    let verifying_key = VerifyingKey::from(public_key);

    verifying_key
        .verify(payload, &sig)
        .map_err(|e| HttpAuthError::JwtSignatureVerificationFailed(e.to_string()))
}

fn get_http_sig_bytes(req_headers: &[HeaderField]) -> HttpAuthResult<Vec<u8>> {
    let sig_header_str = find_header(req_headers, SIGNATURE_HEADER_NAME)
        .ok_or(HttpAuthError::MissingSignatureHeader)?;

    let (_, http_sig) = parse_http_sig(sig_header_str)?;
    let http_sig_bytes = base64_decode(http_sig)
        .map_err(|err| HttpAuthError::MalformedHttpSig(format!("{:?}", err)))?;

    Ok(http_sig_bytes)
}

fn get_http_sig_input_payload(
    req: &HttpRequest,
    req_headers: &[HeaderField],
) -> HttpAuthResult<Vec<u8>> {
    let sig_input_header = find_header(req_headers, SIGNATURE_INPUT_HEADER_NAME)
        .ok_or(HttpAuthError::MissingSignatureInputHeader)?;

    let (_, http_sig_input, http_sig_input_elems) = parse_http_sig_input(sig_input_header)?;
    let payload = calculate_http_sig(req, req_headers, http_sig_input, http_sig_input_elems)?;

    Ok(payload)
}

fn find_header<'a>(headers: &'a [HeaderField], key: &'_ str) -> Option<&'a str> {
    headers
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, value)| value.as_str())
}

#[cfg(feature = "canbench-rs")]
mod benches {
    use std::hint::black_box;

    use super::*;
    use crate::bench::{
        canister,
        golden::{HTTP_REQUEST_GET, HTTP_REQUEST_POST, parse_request, user_principal},
    };

    use canbench_rs::bench;
    use ic_http_certification::{HttpRequest, Method};

    fn assert_valid_request(request: &HttpRequest, root_key: &[u8], expected_method: Method) {
        assert_eq!(request.method(), expected_method);
        let validation_res = validate_http_signature_headers(request, root_key).unwrap();
        assert_eq!(validation_res.principal, user_principal());
    }

    /// Same as [validate_http_signature_headers], but it skips the delegation chain validation.
    ///
    /// TODO: remove this once we have a way to create HTTP requests manually for each test.
    fn validate_http_signature_headers_no_delegation(
        req: &HttpRequest,
        _root_key: &[u8],
    ) -> HttpAuthResult<HttpSignatureValidationData> {
        let validation_input = HttpSignatureValidationInput::try_from(req)?;

        verify_sig(
            &validation_input.payload,
            &validation_input.signature,
            validation_input.signature_pub_key(),
        )?;

        // artificially skip the delegation chain validation

        let public_key_der = validation_input.signature_pub_key_der().unwrap();

        Ok(HttpSignatureValidationData {
            principal: Principal::self_authenticating(public_key_der),
        })
    }

    #[bench(raw)]
    fn validate_http_signature_headers_http_get_with_delegation() -> canbench_rs::BenchResult {
        let request = parse_request(HTTP_REQUEST_GET);

        canister::with_root_key(|root_key| {
            let bench_result = canbench_rs::bench_fn(|| {
                black_box(validate_http_signature_headers(
                    black_box(&request),
                    black_box(root_key),
                ))
                .unwrap();
            });

            assert_valid_request(&request, root_key, Method::GET);

            bench_result
        })
    }

    #[bench(raw)]
    fn validate_http_signature_headers_http_post_with_delegation() -> canbench_rs::BenchResult {
        let request = parse_request(HTTP_REQUEST_POST);

        canister::with_root_key(|root_key| {
            let bench_result = canbench_rs::bench_fn(|| {
                black_box(validate_http_signature_headers(
                    black_box(&request),
                    black_box(root_key),
                ))
                .unwrap();
            });

            assert_valid_request(&request, root_key, Method::POST);

            bench_result
        })
    }

    #[bench(raw)]
    fn validate_http_signature_headers_http_get_no_delegation() -> canbench_rs::BenchResult {
        let request = parse_request(HTTP_REQUEST_GET);

        canister::with_root_key(|root_key| {
            let bench_result = canbench_rs::bench_fn(|| {
                black_box(validate_http_signature_headers_no_delegation(
                    black_box(&request),
                    black_box(root_key),
                ))
                .unwrap();
            });

            assert_valid_request(&request, root_key, Method::GET);

            bench_result
        })
    }

    #[bench(raw)]
    fn validate_http_signature_headers_http_post_no_delegation() -> canbench_rs::BenchResult {
        let request = parse_request(HTTP_REQUEST_POST);

        canister::with_root_key(|root_key| {
            let bench_result = canbench_rs::bench_fn(|| {
                black_box(validate_http_signature_headers_no_delegation(
                    black_box(&request),
                    black_box(root_key),
                ))
                .unwrap();
            });

            assert_valid_request(&request, root_key, Method::POST);

            bench_result
        })
    }

    #[bench(raw)]
    fn verify_sig_http_get() -> canbench_rs::BenchResult {
        let request = parse_request(HTTP_REQUEST_GET);

        let validation_input = HttpSignatureValidationInput::try_from(&request).unwrap();
        let signature_pub_key = validation_input.signature_pub_key();

        canbench_rs::bench_fn(|| {
            black_box(verify_sig(
                black_box(&validation_input.payload),
                black_box(&validation_input.signature),
                black_box(signature_pub_key),
            ))
            .unwrap();
        })
    }

    #[bench(raw)]
    fn verify_sig_http_post() -> canbench_rs::BenchResult {
        let request = parse_request(HTTP_REQUEST_POST);

        let validation_input = HttpSignatureValidationInput::try_from(&request).unwrap();
        let signature_pub_key = validation_input.signature_pub_key();

        canbench_rs::bench_fn(|| {
            black_box(verify_sig(
                black_box(&validation_input.payload),
                black_box(&validation_input.signature),
                black_box(signature_pub_key),
            ))
            .unwrap();
        })
    }

    #[bench(raw)]
    fn validate_delegation_and_get_principal_http_get() -> canbench_rs::BenchResult {
        let request = parse_request(HTTP_REQUEST_GET);

        let validation_input = HttpSignatureValidationInput::try_from(&request).unwrap();
        let delegation_chain = validation_input.delegation_chain().unwrap();

        canister::with_root_key(|root_key| {
            let bench_result = canbench_rs::bench_fn(|| {
                black_box(validate_delegation_and_get_principal(
                    black_box(delegation_chain),
                    black_box("rdmx6-jaaaa-aaaaa-aaadq-cai"),
                    black_box(root_key),
                ))
                .unwrap();
            });

            assert_valid_request(&request, root_key, Method::GET);

            bench_result
        })
    }

    #[bench(raw)]
    fn validate_delegation_and_get_principal_http_post() -> canbench_rs::BenchResult {
        let request = parse_request(HTTP_REQUEST_POST);

        let validation_input = HttpSignatureValidationInput::try_from(&request).unwrap();
        let delegation_chain = validation_input.delegation_chain().unwrap();

        canister::with_root_key(|root_key| {
            let bench_result = canbench_rs::bench_fn(|| {
                black_box(validate_delegation_and_get_principal(
                    black_box(delegation_chain),
                    black_box("rdmx6-jaaaa-aaaaa-aaadq-cai"),
                    black_box(root_key),
                ))
                .unwrap();
            });

            assert_valid_request(&request, root_key, Method::POST);

            bench_result
        })
    }

    #[bench(raw)]
    fn parse_http_signature_headers_http_get() -> canbench_rs::BenchResult {
        let request = parse_request(HTTP_REQUEST_GET);

        canbench_rs::bench_fn(|| {
            black_box(HttpSignatureValidationInput::try_from(black_box(&request))).unwrap();
        })
    }

    #[bench(raw)]
    fn parse_http_signature_headers_http_post() -> canbench_rs::BenchResult {
        let request = parse_request(HTTP_REQUEST_POST);

        canbench_rs::bench_fn(|| {
            black_box(HttpSignatureValidationInput::try_from(black_box(&request))).unwrap();
        })
    }
}
