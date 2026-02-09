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

import init, { hash_chunks } from './blake3-wasm-single/pkg/blake3_wasm_single.js';

let isReady = false;

async function initialize() {
  try {
    const wasmResponse = await fetch('./blake3-wasm-single/pkg/blake3_wasm_single_bg.wasm');
    const wasmBytes = await wasmResponse.arrayBuffer();
    const wasmModule = await WebAssembly.compile(wasmBytes);
    await init(wasmModule);
    isReady = true;
    self.postMessage({ type: 'ready' });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
}

self.onmessage = (e) => {
  if (!isReady) return;
  if (e.data.type === 'hash') {
    const { data, startChunk, workerId } = e.data;
    const input = new Uint8Array(data);
    const cvs = hash_chunks(input, startChunk);
    // cvs is a Uint8Array of concatenated 32-byte CVs
    // Copy to a transferable buffer
    const buf = new ArrayBuffer(cvs.length);
    new Uint8Array(buf).set(cvs);
    self.postMessage({ type: 'result', cvs: buf, workerId }, [buf]);
  }
};

initialize();
