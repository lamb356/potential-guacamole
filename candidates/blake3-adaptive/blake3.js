/**
 * Adaptive BLAKE3 - Uses single-threaded SIMD for all practical sizes
 *
 * Based on benchmark data from high-core-count machines (EPYC 9754):
 * Single-threaded SIMD is faster than parallel at all practical sizes.
 * Thread coordination overhead outweighs parallelism benefits.
 *
 * Threshold set to 16MB to effectively always use single-threaded SIMD.
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import os from 'os';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Threshold: set very high so single-threaded SIMD is always used at practical sizes
const PARALLEL_THRESHOLD = 16777216; // 16MB - effectively always single-threaded

// === Load single-threaded SIMD implementation ===
const singlePkgPath = resolve(__dirname, '../../blake3-wasm-single/pkg');
const singleMod = require(singlePkgPath);

// === Load parallel SIMD implementation ===
// Import worker shim FIRST
const shimPath = resolve(__dirname, '../../blake3-wasm-rayon/node-worker-shim.mjs');
await import(pathToFileURL(shimPath).href);

const parallelPkgPath = resolve(__dirname, '../../blake3-wasm-rayon/pkg/blake3_wasm_rayon.js');
const parallelWasmPath = resolve(__dirname, '../../blake3-wasm-rayon/pkg/blake3_wasm_rayon_bg.wasm');

const parallelMod = await import(pathToFileURL(parallelPkgPath).href);

// Initialize parallel WASM
const wasmBytes = readFileSync(parallelWasmPath);
const wasmModule = await WebAssembly.compile(wasmBytes);
await parallelMod.default({ module_or_path: wasmModule });

// Initialize thread pool with physical cores, capped at 8 to avoid overhead on high-core machines
const physicalCores = Math.max(1, Math.floor(os.cpus().length / 2));
const threadCount = Math.min(physicalCores, 8);
await parallelMod.initThreadPool(threadCount);

// Warmup both implementations
const warmupData = new Uint8Array(1024);
for (let i = 0; i < 50; i++) {
  singleMod.hash(warmupData);
  parallelMod.hash(warmupData);
}

/**
 * Hash data using single-threaded SIMD (fastest for all practical sizes).
 *
 * @param {Uint8Array} inputU8 - Data to hash
 * @returns {Uint8Array} - 32-byte BLAKE3 hash
 */
export function hash(inputU8) {
  if (inputU8.length < PARALLEL_THRESHOLD) {
    return singleMod.hash(inputU8);
  } else {
    return parallelMod.hash(inputU8);
  }
}

// Export the threshold for transparency
export const THRESHOLD = PARALLEL_THRESHOLD;
