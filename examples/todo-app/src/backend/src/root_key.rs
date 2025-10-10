use std::sync::OnceLock;

use ic_cdk::api;

static ROOT_KEY: OnceLock<Vec<u8>> = OnceLock::new();

pub fn with_root_key<F, R>(f: F) -> R
where
    F: FnOnce(&[u8]) -> R,
{
    // Unwrap is safe because the root key is initialized in init_root_key
    // during canister initialization and upgrade
    let root_key = ROOT_KEY.get().unwrap();
    f(root_key)
}

pub fn init_root_key() {
    let root_key = api::root_key();
    ROOT_KEY.set(root_key).unwrap();
}
