use serde::{Deserialize, Serialize};

pub fn json_decode<T>(value: &[u8]) -> T
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_slice(value).expect("Failed to deserialize value")
}

pub fn json_encode<T>(value: &T) -> Vec<u8>
where
    T: Serialize,
{
    serde_json::to_vec(value).expect("Failed to serialize value")
}
