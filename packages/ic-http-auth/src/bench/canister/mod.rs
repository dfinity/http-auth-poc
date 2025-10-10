//! A dummy canister that has a root key stored on the heap.

mod root_key;
pub use root_key::*;

use std::cell::RefCell;

use ic_cdk::init;

use root_key::set_root_key;

thread_local! {
    static ROOT_KEY: RefCell<Vec<u8>> = const { RefCell::new(vec![]) };
}

#[init]
fn init(root_key: Vec<u8>) {
    set_root_key(root_key);
}
