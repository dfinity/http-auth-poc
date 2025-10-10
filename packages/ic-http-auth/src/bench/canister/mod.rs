//! A dummy canister that has a root key stored on the heap.

mod root_key;
pub use root_key::*;

use ic_cdk::init;

use root_key::set_root_key;

#[init]
fn init(root_key: Vec<u8>) {
    set_root_key(root_key);
}
