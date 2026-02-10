/**
 * BLAKE3 Copy-Parallel Worker (PROTOTYPE)
 *
 * Each worker loads blake3-wasm-single independently and hashes
 * chunks assigned to it. Returns concatenated 32-byte chaining values.
 *
 * Communication:
 *   Main → Worker: { type: 'hash', data: ArrayBuffer, startChunk: number, workerId: number }
 *   Worker → Main: { type: 'result', cvs: ArrayBuffer, workerId: number }
 *   Worker → Main: { type: 'ready' }
 */

console.log('[Worker] Script starting, self.location:', self.location.href);

try {
  importScripts('./blake3-wasm-single/pkg/blake3_wasm_single_classic.js');
  console.log('[Worker] importScripts succeeded, typeof wasm_bindgen:', typeof wasm_bindgen);
} catch (err) {
  console.error('[Worker] importScripts FAILED:', err.message, err);
  self.postMessage({ type: 'error', message: 'importScripts failed: ' + err.message });
}

let isReady = false;

async function initialize() {
  console.log('[Worker] initialize() called');
  try {
    console.log('[Worker] Calling wasm_bindgen() to load WASM...');
    await wasm_bindgen('./blake3-wasm-single/pkg/blake3_wasm_single_bg.wasm');
    console.log('[Worker] WASM loaded successfully');
    isReady = true;
    self.postMessage({ type: 'ready' });
  } catch (err) {
    console.error('[Worker] WASM init FAILED:', err.message, err);
    self.postMessage({ type: 'error', message: err.message });
  }
}

self.onmessage = (e) => {
  if (!isReady) return;
  if (e.data.type === 'hash') {
    const { data, startChunk, workerId } = e.data;
    const input = new Uint8Array(data);
    const cvs = wasm_bindgen.hash_chunks(input, startChunk);
    // cvs is a Uint8Array of concatenated 32-byte CVs
    // Copy to a transferable buffer
    const buf = new ArrayBuffer(cvs.length);
    new Uint8Array(buf).set(cvs);
    self.postMessage({ type: 'result', cvs: buf, workerId }, [buf]);
  }
};

initialize();
