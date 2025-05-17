use std::cell::RefCell;

const IC_ROOT_PK_DER_PREFIX: &[u8; 37] = b"\x30\x81\x82\x30\x1d\x06\x0d\x2b\x06\x01\x04\x01\x82\xdc\x7c\x05\x03\x01\x02\x01\x06\x0c\x2b\x06\x01\x04\x01\x82\xdc\x7c\x05\x03\x02\x01\x03\x61\x00";
const IC_ROOT_PK_LENGTH: usize = 96;

thread_local! {
    static ROOT_KEY: RefCell<Vec<u8>> = RefCell::new(vec![]);
}

pub fn with_root_key<F, R>(f: F) -> R
where
    F: FnOnce(&[u8]) -> R,
{
    ROOT_KEY.with(|s| f(&s.borrow()))
}

pub fn set_root_key(root_key: Vec<u8>) {
    ROOT_KEY.with(|s| *s.borrow_mut() = extract_raw_root_pk_from_der(&root_key).unwrap());
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
