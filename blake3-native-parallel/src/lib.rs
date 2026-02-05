use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn hash(data: Buffer) -> Buffer {
    let mut hasher = blake3::Hasher::new();
    hasher.update_rayon(&data);
    Buffer::from(hasher.finalize().as_bytes().to_vec())
}
