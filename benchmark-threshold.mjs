/**
 * BLAKE3 Threshold Analysis
 *
 * Find the optimal threshold where parallel becomes faster than single-threaded.
 * Tests granular ranges to identify crossover points and performance patterns.
 *
 * Run with: node benchmark-threshold.mjs
 */

import { createRequire } from 'module';
import { performance } from 'perf_hooks';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import os from 'os';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  BLAKE3 Threshold Analysis                                   ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`Platform: ${process.platform} ${process.arch}`);
console.log(`CPU: ${os.cpus()[0]?.model || 'Unknown'}`);
console.log(`Cores: ${os.cpus().length} logical`);
console.log('');

// Load WASM modules
console.log('Loading WASM modules...');

// Single-threaded SIMD
const singlePkgPath = resolve(__dirname, 'blake3-wasm-single/pkg');
const singleMod = require(singlePkgPath);

// Parallel WASM
const shimPath = resolve(__dirname, 'blake3-wasm-rayon/node-worker-shim.mjs');
await import(pathToFileURL(shimPath).href);

const parallelPkgPath = resolve(__dirname, 'blake3-wasm-rayon/pkg/blake3_wasm_rayon.js');
const parallelWasmPath = resolve(__dirname, 'blake3-wasm-rayon/pkg/blake3_wasm_rayon_bg.wasm');
const parallelMod = await import(pathToFileURL(parallelPkgPath).href);

const wasmBytes = readFileSync(parallelWasmPath);
const wasmModule = await WebAssembly.compile(wasmBytes);
await parallelMod.default({ module_or_path: wasmModule });

// Initialize with 4 threads
await parallelMod.initThreadPool(4);

console.log('  ✓ Single-threaded SIMD loaded');
console.log('  ✓ Parallel (4 threads) loaded');
console.log('');

// Benchmark function with adaptive iterations
function benchmark(hashFn, data, targetTimeMs = 200) {
  // Warmup
  for (let i = 0; i < 10; i++) hashFn(data);

  // Calibrate iterations to get ~targetTimeMs runtime
  let iterations = 10;
  let start = performance.now();
  for (let i = 0; i < iterations; i++) hashFn(data);
  let elapsed = performance.now() - start;

  // Scale iterations
  iterations = Math.max(10, Math.floor(iterations * targetTimeMs / elapsed));

  // Actual benchmark
  start = performance.now();
  for (let i = 0; i < iterations; i++) hashFn(data);
  elapsed = performance.now() - start;

  return Math.round((data.length * iterations / 1024 / 1024) / (elapsed / 1000));
}

// Test ranges
const ranges = [
  { name: '10KB-100KB', start: 10 * 1024, end: 100 * 1024, step: 1024 },
  { name: '64KB-256KB', start: 64 * 1024, end: 256 * 1024, step: 1024 },
];

const allResults = [];

for (const range of ranges) {
  console.log(`Testing range: ${range.name}`);
  console.log('='.repeat(60));
  console.log('Size (KB)    Single (MB/s)    Parallel (MB/s)    Winner');
  console.log('-'.repeat(60));

  const results = [];

  for (let size = range.start; size <= range.end; size += range.step) {
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) data[i] = i & 0xff;

    const singleSpeed = benchmark((d) => singleMod.hash(d), data);
    const parallelSpeed = benchmark((d) => parallelMod.hash(d), data);

    const winner = parallelSpeed > singleSpeed * 1.05 ? 'Parallel' :
                   singleSpeed > parallelSpeed * 1.05 ? 'Single' : 'Tie';

    const sizeKB = Math.round(size / 1024);
    console.log(
      `${sizeKB.toString().padStart(8)}    ` +
      `${singleSpeed.toString().padStart(12)}    ` +
      `${parallelSpeed.toString().padStart(14)}    ` +
      `${winner}`
    );

    results.push({
      sizeBytes: size,
      sizeKB,
      single: singleSpeed,
      parallel: parallelSpeed,
      winner,
      ratio: (parallelSpeed / singleSpeed).toFixed(2)
    });
  }

  allResults.push({ range: range.name, results });
  console.log('');
}

// Save CSV
let csv = 'Range,Size (KB),Size (Bytes),Single (MB/s),Parallel (MB/s),Winner,Ratio\n';
for (const rangeData of allResults) {
  for (const r of rangeData.results) {
    csv += `${rangeData.range},${r.sizeKB},${r.sizeBytes},${r.single},${r.parallel},${r.winner},${r.ratio}\n`;
  }
}

writeFileSync(resolve(__dirname, 'threshold-analysis.csv'), csv);
console.log('Results saved to: threshold-analysis.csv');

// Find crossover points
console.log('');
console.log('═'.repeat(60));
console.log('CROSSOVER ANALYSIS');
console.log('═'.repeat(60));

for (const rangeData of allResults) {
  console.log(`\n${rangeData.range}:`);

  // Find where parallel first becomes faster
  let firstParallelWin = null;
  let lastSingleWin = null;

  for (let i = 0; i < rangeData.results.length; i++) {
    const r = rangeData.results[i];
    if (r.winner === 'Parallel' && !firstParallelWin) {
      firstParallelWin = r;
    }
    if (r.winner === 'Single') {
      lastSingleWin = r;
    }
  }

  if (firstParallelWin) {
    console.log(`  First parallel win: ${firstParallelWin.sizeKB} KB`);
  }
  if (lastSingleWin) {
    console.log(`  Last single win: ${lastSingleWin.sizeKB} KB`);
  }

  // Calculate average ratio above/below potential thresholds
  const threshold64 = rangeData.results.filter(r => r.sizeBytes === 64 * 1024)[0];
  const threshold128 = rangeData.results.filter(r => r.sizeBytes === 128 * 1024)[0];
  const threshold256 = rangeData.results.filter(r => r.sizeBytes === 256 * 1024)[0];

  if (threshold64) console.log(`  At 64KB: ratio = ${threshold64.ratio}x (${threshold64.winner})`);
  if (threshold128) console.log(`  At 128KB: ratio = ${threshold128.ratio}x (${threshold128.winner})`);
  if (threshold256) console.log(`  At 256KB: ratio = ${threshold256.ratio}x (${threshold256.winner})`);

  // Find optimal threshold (consistent parallel wins)
  let optimalThreshold = null;
  let consecutiveParallelWins = 0;
  for (const r of rangeData.results) {
    if (r.winner === 'Parallel') {
      consecutiveParallelWins++;
      if (consecutiveParallelWins >= 5 && !optimalThreshold) {
        optimalThreshold = rangeData.results[rangeData.results.indexOf(r) - 4];
      }
    } else {
      consecutiveParallelWins = 0;
    }
  }

  if (optimalThreshold) {
    console.log(`  Recommended threshold: ${optimalThreshold.sizeKB} KB (5+ consecutive parallel wins)`);
  }
}

// Generate HTML chart
const chartHtml = `<!DOCTYPE html>
<html>
<head>
  <title>BLAKE3 Threshold Analysis</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background: #0f172a;
      color: #e2e8f0;
    }
    h1 { text-align: center; color: #f8fafc; }
    .chart-container {
      background: #1e293b;
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
    }
    .legend {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin: 20px 0;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .legend-color {
      width: 20px;
      height: 20px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <h1>BLAKE3 Threshold Analysis: Single vs Parallel</h1>

  <div class="legend">
    <div class="legend-item">
      <div class="legend-color" style="background: #3b82f6"></div>
      <span>Single-threaded SIMD</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #22c55e"></div>
      <span>Parallel (4 threads)</span>
    </div>
  </div>

  ${allResults.map((rangeData, idx) => `
    <h2 style="text-align: center;">${rangeData.range}</h2>
    <div class="chart-container">
      <canvas id="chart${idx}"></canvas>
    </div>
  `).join('')}

  <script>
    const allData = ${JSON.stringify(allResults)};

    allData.forEach((rangeData, idx) => {
      const labels = rangeData.results.map(r => r.sizeKB);
      const singleData = rangeData.results.map(r => r.single);
      const parallelData = rangeData.results.map(r => r.parallel);

      new Chart(document.getElementById('chart' + idx), {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Single-threaded',
              data: singleData,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              fill: true,
              tension: 0.3
            },
            {
              label: 'Parallel (4 threads)',
              data: parallelData,
              borderColor: '#22c55e',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              fill: true,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#e2e8f0' } },
            title: { display: true, text: 'Throughput vs Input Size', color: '#f8fafc', font: { size: 16 } }
          },
          scales: {
            x: {
              title: { display: true, text: 'Input Size (KB)', color: '#94a3b8' },
              ticks: { color: '#94a3b8' },
              grid: { color: '#334155' }
            },
            y: {
              title: { display: true, text: 'Throughput (MB/s)', color: '#94a3b8' },
              ticks: { color: '#94a3b8' },
              grid: { color: '#334155' }
            }
          }
        }
      });
    });
  </script>
</body>
</html>`;

writeFileSync(resolve(__dirname, 'threshold-analysis.html'), chartHtml);
console.log('Chart saved to: threshold-analysis.html');

console.log('');
console.log('Open threshold-analysis.html in a browser to view the charts.');
