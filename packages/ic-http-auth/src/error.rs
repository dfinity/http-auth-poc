use ic_http_certification::HttpCertificationError;
use thiserror::Error;

pub type HttpAuthResult<T = ()> = Result<T, HttpAuthError>;

#[derive(Error, Debug, Clone)]
pub enum HttpAuthError {
    #[error(r#"The "Authorization" header is missing from the provided HTTP request."#)]
    MissingAuthorizationHeader,

    #[error(r#""#)]
    MissingSignatureHeader,

    #[error(r#""#)]
    MissingSignatureInputHeader,

    #[error(r#""#)]
    MissingSignatureKeyHeader,

    #[error(r#"HTTP message signature mismatch, expected "{expected}", but got "{actual}"."#)]
    HttpSignatureMismatch { expected: String, actual: String },

    #[error(r#"JWT signature verification failed: {0}."#)]
    JwtSignatureVerificationFailed(String),

    #[error(r#"Failed to parse the "http_sig" claim of the provided JWT: {0}."#)]
    MalformedHttpSig(String),


    #[error(r#"Failed to parse "http_sig_input" claim of the provided JWT: {0}."#)]
    MalformedHttpSigInput(String),

    #[error(r#"Failed to parse the "signature-key" header: {0}."#)]
    MalformedHttpSigKey(String),

    #[error(r#"The "{0}" header field was listed in the HTTP signature input, but was not found in the request."#)]
    MissingHeaderField(String),

    #[error(r#"The provided JWT is missing the required header component."#)]
    MissingJwtHeaderComponent,

    #[error(r#"The provided JWT's header component is not base64 encoded correctly."#)]
    MalformedJwtHeaderBase64Encoding,

    #[error(r#"The provided JWT's header component is not JSON encoded correctly: {0}."#)]
    MalformedJwtHeaderJsonEncoding(String),

    #[error(r#"The provided JWT is missing the required claims component."#)]
    MissingJwtClaimsComponent,

    #[error(r#"The provided JWT's claim component is not base64 encoded correctly."#)]
    MalformedJwtClaimsBase64Encoding,

    #[error(r#"The provided JWT's claim component is not JSON encoded correctly: {0}."#)]
    MalformedJwtClaimsJsonEncoding(String),

    #[error(r#"The provided JWT is missing the required signature component."#)]
    MissingJwtSignatureComponent,

    #[error(r#"The provided JWT's signature component is not base64 encoded correctly."#)]
    MalformedJwtSignatureBase64Encoding,

    #[error(r#"The provided JWT's JWK is not a valid ECDSA public key."#)]
    MalformedEcdsaPublicKey,

    #[error(r#"The provided JWT's signature is not a valid ECDSA signature."#)]
    MalformedEcdsaSignature,

    #[error(transparent)]
    HttpCertificationError(#[from] HttpCertificationError),
}
