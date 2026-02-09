/* tslint:disable */
/* eslint-disable */

/**
 * Returns the BLAKE3 chunk length (1024 bytes).
 */
export function chunk_len(): number;

export function hash(input: Uint8Array): Uint8Array;

/**
 * Hash individual chunks starting at `start_chunk` counter.
 * Returns concatenated 32-byte chaining values (one per chunk).
 * Each chunk is up to CHUNK_LEN (1024) bytes. The last chunk may be shorter.
 */
export function hash_chunks(input: Uint8Array, start_chunk: number): Uint8Array;

/**
 * Compute a BLAKE3 parent chaining value from two child CVs.
 * `left_cv` and `right_cv` must each be exactly 32 bytes.
 * Set `is_root` to true only for the final (topmost) merge.
 */
export function merge_cv_pair(left_cv: Uint8Array, right_cv: Uint8Array, is_root: boolean): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly chunk_len: () => number;
    readonly hash: (a: number, b: number) => [number, number];
    readonly hash_chunks: (a: number, b: number, c: number) => [number, number];
    readonly merge_cv_pair: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
