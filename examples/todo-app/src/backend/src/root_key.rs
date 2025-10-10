use std::cell::RefCell;

use ic_cdk::api;

thread_local! {
    static ROOT_KEY: RefCell<Option<Vec<u8>>> = const { RefCell::new(None) };
}

pub fn with_root_key<F, R>(f: F) -> R
where
    F: FnOnce(&[u8]) -> R,
{
    ROOT_KEY.with_borrow(|rk| {
        // Unwrap is safe because the root key is initialized in init_root_key
        // during canister initialization and upgrade
        let root_key = rk.as_ref().unwrap();
        f(root_key)
    })
}

pub fn init_root_key() {
    let root_key = api::root_key();
    ROOT_KEY.with_borrow_mut(|rk| {
        rk.replace(root_key);
    })
}
