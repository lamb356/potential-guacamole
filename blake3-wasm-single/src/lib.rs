use wasm_bindgen::prelude::*;

#[allow(deprecated)] // guts module deprecated in 1.8.0, but still functional
use blake3::guts::{self, ChunkState, CHUNK_LEN};

#[wasm_bindgen]
pub fn hash(input: &[u8]) -> Vec<u8> {
    let h = blake3::hash(input);
    h.as_bytes().to_vec()
}

/// Returns the BLAKE3 chunk length (1024 bytes).
#[wasm_bindgen]
pub fn chunk_len() -> u32 {
    CHUNK_LEN as u32
}

/// Hash individual chunks starting at `start_chunk` counter.
/// Returns concatenated 32-byte chaining values (one per chunk).
/// Each chunk is up to CHUNK_LEN (1024) bytes. The last chunk may be shorter.
#[wasm_bindgen]
pub fn hash_chunks(input: &[u8], start_chunk: u32) -> Vec<u8> {
    let mut result = Vec::with_capacity(((input.len() / CHUNK_LEN) + 1) * 32);
    for (i, chunk_data) in input.chunks(CHUNK_LEN).enumerate() {
        let mut state = ChunkState::new(start_chunk as u64 + i as u64);
        state.update(chunk_data);
        let cv = state.finalize(false);
        result.extend_from_slice(cv.as_bytes());
    }
    result
}

/// Compute a BLAKE3 parent chaining value from two child CVs.
/// `left_cv` and `right_cv` must each be exactly 32 bytes.
/// Set `is_root` to true only for the final (topmost) merge.
#[wasm_bindgen]
pub fn merge_cv_pair(left_cv: &[u8], right_cv: &[u8], is_root: bool) -> Vec<u8> {
    let left: [u8; 32] = left_cv.try_into().expect("left_cv must be 32 bytes");
    let right: [u8; 32] = right_cv.try_into().expect("right_cv must be 32 bytes");
    let parent = guts::parent_cv(
        &blake3::Hash::from_bytes(left),
        &blake3::Hash::from_bytes(right),
        is_root,
    );
    parent.as_bytes().to_vec()
}
