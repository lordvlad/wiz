# File Scanning Concurrency Benchmark Results

## Executive Summary

After implementing concurrent file scanning with semaphore-based concurrency control and running comprehensive benchmarks with three different approaches, **the results show that the sequential implementation remains optimal** for the current codebase architecture.

## What Was Tested

### Test 1: Path Expansion (`benchmark.ts`)

Tests `expandFilePaths()` - collecting file paths from glob patterns.

**Result:** Concurrent implementation is ~28% slower on average

- Small overhead for simple Set operations
- No actual I/O to benefit from concurrency

### Test 2: File Loading Approaches (`benchmark-scanfiles.ts`)

Tests three approaches to loading and parsing TypeScript files:

1. **Sequential (Baseline)**: `addSourceFileAtPath()` one by one
2. **Concurrent (Wrong)**: Wrapping sync `addSourceFileAtPath()` in async/Promise.all
3. **Concurrent Read (Proposed)**: `Bun.file().text()` concurrently + in-memory ts-morph parsing

#### Results:

| Files | Sequential | Concurrent (wrong) | Concurrent Read |
| ----- | ---------- | ------------------ | --------------- |
| 10    | 1.65ms     | 519.01ms           | 5.65ms          |
| 50    | 8.45ms     | 493.12ms           | 15.20ms         |
| 100   | 13.80ms    | 484.00ms           | 20.26ms         |
| 200   | 25.90ms    | 488.45ms           | 41.44ms         |

**Performance vs Sequential:**

- Concurrent (wrong): -10,561% (adds massive overhead)
- Concurrent Read: -107% (2x slower on average)

## Key Insights

### The Original Issue Pattern

The issue description mentioned:

```ts
for await (const path of glob.scan(...)) {
    const content = await Bun.file(path).content();
    // Parse TS
    // Collect data points
}
```

This pattern **would benefit from concurrency** because `Bun.file().content()` is async I/O.

### Current Codebase Reality

The current codebase uses ts-morph's `addSourceFileAtPath()` which handles file I/O internally and synchronously with optimizations.

### Why Concurrent Read Still Loses

Even though `Bun.file().text()` provides true concurrent I/O, it's still ~2x slower because:

1. **File reading is fast** - Modern SSDs and OS caching
2. **Parsing is slower** - TypeScript AST parsing is CPU-intensive
3. **Overhead adds up** - Promise coordination, in-memory file system, losing ts-morph optimizations
4. **Single-threaded execution** - Can't truly parallelize CPU-bound parsing

## Conclusion

**Sequential processing is optimal** for ts-morph file loading. The semaphore implementation remains valuable for future async I/O scenarios, but it's not applicable here.
