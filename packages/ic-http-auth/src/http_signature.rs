use crate::{
    base64::base64_decode,
    delegation::{validate_delegation_and_get_principal, DelegationChain},
    parse_utils::{drop_separators, until_terminated},
    HttpAuthError, HttpAuthResult,
};
use candid::Principal;
use ic_http_certification::HttpRequest;
use nom::{bytes::complete::take_until, combinator::eof, multi::many0, IResult, Parser};
use p256::{
    ecdsa::{signature::Verifier, Signature, VerifyingKey},
    pkcs8::{DecodePublicKey, EncodePublicKey},
    PublicKey,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub struct HttpSignatureValidationData {
    pub principal: Principal,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SignatureKeyHeader {
    #[serde(rename = "pubKey")]
    pub pub_key: String,
    #[serde(rename = "delegationChain")]
    pub delegation_chain: Option<DelegationChain>,
}

pub fn validate_http_signature_headers(
    req: &HttpRequest,
    ic_root_key_raw: &[u8],
) -> HttpAuthResult<HttpSignatureValidationData> {
    let req_headers: HashMap<_, _> = req
        .headers()
        .iter()
        .map(|(k, v)| (k.to_lowercase(), v.clone()))
        .collect();

    let sig_header = req_headers
        .get("signature")
        .ok_or_else(|| HttpAuthError::MissingSignatureHeader)?;
    let sig_input_header = req_headers
        .get("signature-input")
        .ok_or_else(|| HttpAuthError::MissingSignatureInputHeader)?;
    let sig_key_header_str = req_headers
        .get("signature-key")
        .ok_or_else(|| HttpAuthError::MissingSignatureKeyHeader)?;

    let (_, http_sig_key) = parse_http_sig_key(sig_key_header_str)?;

    let sig_key_bytes = base64_decode(&http_sig_key).unwrap();
    let sig_key_header = serde_json::from_slice::<SignatureKeyHeader>(&sig_key_bytes).unwrap();

    let http_sig_key = base64_decode(&sig_key_header.pub_key)
        .map_err(|_| HttpAuthError::MalformedEcdsaPublicKey)
        .unwrap();
    let public_key = PublicKey::from_public_key_der(&http_sig_key)
        .map_err(|_| HttpAuthError::MalformedEcdsaPublicKey)
        .unwrap();
    let public_key_der = public_key
        .to_public_key_der()
        .map_err(|_| HttpAuthError::MalformedEcdsaPublicKey)
        .unwrap()
        .to_vec();
    let verifying_key = VerifyingKey::from(public_key);

    validate_http_sig(
        req,
        &req_headers,
        sig_header,
        sig_input_header,
        verifying_key,
    )?;

    if let Some(delegation_chain) = &sig_key_header.delegation_chain {
        let principal = validate_delegation_and_get_principal(
            delegation_chain,
            "rdmx6-jaaaa-aaaaa-aaadq-cai",
            ic_root_key_raw,
        )
        .unwrap();

        return Ok(HttpSignatureValidationData { principal });
    }

    Ok(HttpSignatureValidationData {
        principal: Principal::self_authenticating(public_key_der),
    })
}

fn validate_http_sig(
    req: &HttpRequest,
    req_headers: &HashMap<String, String>,
    http_sig: &str,
    http_sig_input: &str,
    verifying_key: VerifyingKey,
) -> HttpAuthResult {
    let (_, http_sig) = parse_http_sig(http_sig)?;
    let http_sig = base64_decode(http_sig).unwrap();
    let http_sig =
        Signature::from_slice(&http_sig).map_err(|_| HttpAuthError::MalformedEcdsaSignature)?;

    let (_, http_sig_input, http_sig_input_elems) = parse_http_sig_input(http_sig_input)?;
    let payload = calculate_http_sig(req, req_headers, http_sig_input, http_sig_input_elems)?;

    verifying_key
        .verify(&payload, &http_sig)
        .map_err(|e| HttpAuthError::JwtSignatureVerificationFailed(e.to_string()))?;

    Ok(())
}

fn parse_http_sig(header_field: &str) -> HttpAuthResult<(&str, &str)> {
    fn extract(i: &str) -> IResult<&str, (&str, &str)> {
        let (i, sig_name) = until_terminated("=").parse(i)?;
        let (i, sig) = drop_separators(':', ':', take_until(":")).parse(i)?;

        eof(i)?;

        Ok((i, (sig_name, sig)))
    }

    extract(header_field)
        .map(|(_, e)| e)
        .map_err(|e| HttpAuthError::MalformedHttpSig(e.to_string()))
}

fn parse_http_sig_input(http_sig_input: &str) -> HttpAuthResult<(&str, &str, Vec<&str>)> {
    fn extract(i: &str) -> IResult<&str, (&str, &str, Vec<&str>)> {
        let (sig_params, sig_name) = until_terminated("=").parse(i)?;
        let (i, parsed_sig_params) =
            drop_separators('(', ')', many0(drop_separators('"', '"', take_until("\""))))
                .parse(sig_params)?;

        // [TODO] - continue parsing the signature inputs: keyid, alg, created, expires, nonce, etc.
        // eof(i)?;

        Ok((i, (sig_name, sig_params, parsed_sig_params)))
    }

    extract(http_sig_input)
        .map(|(_, e)| e)
        .map_err(|e| HttpAuthError::MalformedHttpSigInput(e.to_string()))
}

fn parse_http_sig_key(http_sig_key: &str) -> HttpAuthResult<(&str, &str)> {
    fn extract(i: &str) -> IResult<&str, (&str, &str)> {
        let (i, sig_name) = until_terminated("=").parse(i)?;
        let (i, sig) = drop_separators(':', ':', take_until(":")).parse(i)?;

        eof(i)?;

        Ok((i, (sig_name, sig)))
    }

    extract(http_sig_key)
        .map(|(_, e)| e)
        .map_err(|e| HttpAuthError::MalformedHttpSigKey(e.to_string()))
}

fn calculate_http_sig(
    req: &HttpRequest,
    req_headers: &HashMap<String, String>,
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
            _ => req_headers
                .get(elem)
                .cloned()
                .ok_or_else(|| HttpAuthError::MissingHeaderField(elem.to_string()))?,
        };

        calculated_http_sig.push('"');
        calculated_http_sig.push_str(elem);
        calculated_http_sig.push_str("\": ");
        calculated_http_sig.push_str(&value);
        calculated_http_sig.push_str("\n");
    }

    calculated_http_sig.push_str("\"@signature-params\": ");
    calculated_http_sig.push_str(&http_sig_input);
    calculated_http_sig.push_str("\n");

    Ok(calculated_http_sig.as_bytes().to_vec())
}
