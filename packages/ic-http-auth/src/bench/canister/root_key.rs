use std::cell::RefCell;

thread_local! {
    static ROOT_KEY: RefCell<Vec<u8>> = const { RefCell::new(vec![]) };
}

pub fn with_root_key<F, R>(f: F) -> R
where
    F: FnOnce(&[u8]) -> R,
{
    ROOT_KEY.with_borrow(|s| f(s))
}

pub fn set_root_key(root_key: Vec<u8>) {
    ROOT_KEY.with_borrow_mut(|s| *s = root_key);
}
