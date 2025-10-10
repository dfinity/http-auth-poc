use std::sync::OnceLock;

use ic_cdk::api;

static ROOT_KEY: OnceLock<Vec<u8>> = OnceLock::new();

pub fn get_root_key() -> &'static [u8] {
    // Unwrap is safe because the root key is initialized in init_root_key
    // during canister initialization and upgrade
    ROOT_KEY.get().unwrap()
}

pub fn init_root_key() {
    let root_key = api::root_key();
    ROOT_KEY.set(root_key).unwrap();
}
