use std::cell::RefCell;

const MAINNET_ROOT_KEY: &[u8; 133] = b"\x30\x81\x82\x30\x1d\x06\x0d\x2b\x06\x01\x04\x01\x82\xdc\x7c\x05\x03\x01\x02\x01\x06\x0c\x2b\x06\x01\x04\x01\x82\xdc\x7c\x05\x03\x02\x01\x03\x61\x00\x81\x4c\x0e\x6e\xc7\x1f\xab\x58\x3b\x08\xbd\x81\x37\x3c\x25\x5c\x3c\x37\x1b\x2e\x84\x86\x3c\x98\xa4\xf1\xe0\x8b\x74\x23\x5d\x14\xfb\x5d\x9c\x0c\xd5\x46\xd9\x68\x5f\x91\x3a\x0c\x0b\x2c\xc5\x34\x15\x83\xbf\x4b\x43\x92\xe4\x67\xdb\x96\xd6\x5b\x9b\xb4\xcb\x71\x71\x12\xf8\x47\x2e\x0d\x5a\x4d\x14\x50\x5f\xfd\x74\x84\xb0\x12\x91\x09\x1c\x5f\x87\xb9\x88\x83\x46\x3f\x98\x09\x1a\x0b\xaa\xae";
const IC_ROOT_PK_DER_PREFIX: &[u8; 37] = b"\x30\x81\x82\x30\x1d\x06\x0d\x2b\x06\x01\x04\x01\x82\xdc\x7c\x05\x03\x01\x02\x01\x06\x0c\x2b\x06\x01\x04\x01\x82\xdc\x7c\x05\x03\x02\x01\x03\x61\x00";
const IC_ROOT_PK_LENGTH: usize = 96;

thread_local! {
    static ROOT_KEY: RefCell<Vec<u8>> = RefCell::new(extract_raw_root_pk_from_der(MAINNET_ROOT_KEY).unwrap());
}

pub fn with_root_key<F, R>(f: F) -> R
where
    F: FnOnce(&[u8]) -> R,
{
    ROOT_KEY.with(|s| f(&s.borrow()))
}

pub fn set_root_key(root_key: Option<Vec<u8>>) {
    if let Some(root_key) = root_key {
        ROOT_KEY.with(|s| *s.borrow_mut() = extract_raw_root_pk_from_der(&root_key).unwrap());
    } else {
        ROOT_KEY
            .with(|s| *s.borrow_mut() = extract_raw_root_pk_from_der(MAINNET_ROOT_KEY).unwrap());
    }
}

fn extract_raw_root_pk_from_der(pk_der: &[u8]) -> Result<Vec<u8>, String> {
    let expected_length = IC_ROOT_PK_DER_PREFIX.len() + IC_ROOT_PK_LENGTH;
    if pk_der.len() != expected_length {
        return Err(String::from("invalid root pk length"));
    }

    let prefix = &pk_der[0..IC_ROOT_PK_DER_PREFIX.len()];
    if prefix[..] != IC_ROOT_PK_DER_PREFIX[..] {
        return Err(String::from("invalid OID"));
    }

    let key = &pk_der[IC_ROOT_PK_DER_PREFIX.len()..];
    Ok(key.to_vec())
}
