/**
 * BLAKE3 Copy-Based Parallel Hashing (PROTOTYPE)
 *
 * For iOS and browsers without SharedArrayBuffer.
 * Uses Web Workers with postMessage() transferable ArrayBuffers
 * instead of shared memory.
 *
 * Architecture:
 *   1. Main thread splits input at 1024-byte chunk boundaries
 *   2. Each worker gets a slice via postMessage (zero-copy transfer)
 *   3. Workers hash their chunks using blake3-wasm-single, return CVs
 *   4. Main thread merges the BLAKE3 Merkle tree
 *
 * Produces the EXACT same hash as single-threaded blake3::hash().
 */

const NUM_WORKERS = 4;
const CHUNK_LEN = 1024;
const CV_LEN = 32;

/**
 * Largest power of 2 less than n.
 * Used for BLAKE3's left-complete binary tree splitting.
 */
function largestPow2LessThan(n) {
  let p = 1;
  while (p * 2 < n) p *= 2;
  return p;
}

/**
 * Build the BLAKE3 Merkle tree from chunk chaining values.
 *
 * BLAKE3 uses a left-complete binary tree:
 *   - For N chunks, split at largest power of 2 < N
 *   - Left subtree gets that many chunks, right gets the rest
 *   - Recurse until 1 or 2 CVs remain
 *   - Only the topmost merge uses is_root=true
 *
 * @param {Uint8Array[]} cvs - Array of 32-byte chaining values
 * @param {boolean} isRoot - True only for the topmost merge
 * @param {function} mergeFn - (left: Uint8Array, right: Uint8Array, isRoot: boolean) => Uint8Array
 * @returns {Uint8Array} 32-byte hash
 */
function mergeTree(cvs, isRoot, mergeFn) {
  if (cvs.length === 1) return cvs[0];
  if (cvs.length === 2) return mergeFn(cvs[0], cvs[1], isRoot);

  const split = largestPow2LessThan(cvs.length);
  const left = mergeTree(cvs.slice(0, split), false, mergeFn);
  const right = mergeTree(cvs.slice(split), false, mergeFn);
  return mergeFn(left, right, isRoot);
}

export class CopyParallelHasher {
  constructor() {
    this.workers = [];
    this.readyCount = 0;
    this._mergeFn = null; // merge_cv_pair from WASM
    this._hashFn = null;  // hash() for small inputs
  }

  /**
   * Initialize: load WASM on main thread (for merge) and spawn workers.
   * @returns {Promise<void>} Resolves when all workers are ready.
   */
  async init() {
    // Load blake3-wasm-single on the main thread for merge_cv_pair
    const module = await import('./blake3-wasm-single/pkg/blake3_wasm_single.js');
    const wasmResponse = await fetch('./blake3-wasm-single/pkg/blake3_wasm_single_bg.wasm');
    const wasmBytes = await wasmResponse.arrayBuffer();
    const wasmModule = await WebAssembly.compile(wasmBytes);
    await module.default(wasmModule);

    this._mergeFn = (left, right, isRoot) => module.merge_cv_pair(left, right, isRoot);
    this._hashFn = (data) => module.hash(data);

    // Spawn workers and wait for all to be ready
    return new Promise((resolve, reject) => {
      let readyCount = 0;
      const timeout = setTimeout(() => reject(new Error('Workers timed out')), 30000);

      for (let i = 0; i < NUM_WORKERS; i++) {
        const worker = new Worker('./blake3-copy-worker.js');
        worker.addEventListener('message', (e) => {
          if (e.data.type === 'ready') {
            readyCount++;
            if (readyCount === NUM_WORKERS) {
              clearTimeout(timeout);
              resolve();
            }
          } else if (e.data.type === 'error') {
            clearTimeout(timeout);
            reject(new Error(`Worker ${i} failed: ${e.data.message}`));
          }
        });
        this.workers.push(worker);
      }
    });
  }

  /**
   * Hash data using copy-based parallelism.
   *
   * @param {Uint8Array} data - Input bytes
   * @returns {Promise<Uint8Array>} 32-byte BLAKE3 hash
   */
  async hash(data) {
    const totalChunks = Math.ceil(data.length / CHUNK_LEN) || 1;

    // For small inputs (≤1 chunk), use single-threaded hash directly.
    // This is needed because single-chunk inputs require is_root=true
    // on the chunk itself, which hash_chunks doesn't do.
    if (data.length <= CHUNK_LEN) {
      return this._hashFn(data);
    }

    // Distribute chunks among workers
    const chunksPerWorker = Math.ceil(totalChunks / NUM_WORKERS);
    const promises = [];

    for (let i = 0; i < NUM_WORKERS; i++) {
      const startChunk = i * chunksPerWorker;
      if (startChunk >= totalChunks) break; // No more data for this worker

      const endChunk = Math.min(startChunk + chunksPerWorker, totalChunks);
      const startByte = startChunk * CHUNK_LEN;
      const endByte = Math.min(endChunk * CHUNK_LEN, data.length);

      // Slice creates a copy — the copy is then transferred (zero-copy send)
      const slice = data.slice(startByte, endByte);

      promises.push(new Promise((resolve) => {
        const handler = (e) => {
          if (e.data.type === 'result' && e.data.workerId === i) {
            this.workers[i].removeEventListener('message', handler);
            resolve(new Uint8Array(e.data.cvs));
          }
        };
        this.workers[i].addEventListener('message', handler);
        this.workers[i].postMessage(
          { type: 'hash', data: slice.buffer, startChunk, workerId: i },
          [slice.buffer] // Transfer ownership (zero-copy send to worker)
        );
      }));
    }

    const cvArrays = await Promise.all(promises);

    // Collect all CVs in order
    const allCvs = [];
    for (const cvArray of cvArrays) {
      for (let offset = 0; offset < cvArray.length; offset += CV_LEN) {
        allCvs.push(cvArray.slice(offset, offset + CV_LEN));
      }
    }

    // Merge the BLAKE3 Merkle tree
    return mergeTree(allCvs, true, this._mergeFn);
  }

  /**
   * Clean up workers.
   */
  terminate() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }
}
