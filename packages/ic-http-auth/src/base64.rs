use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

pub(crate) fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    URL_SAFE_NO_PAD.decode(input).map_err(|e| e.to_string())
}
