# File Scanning Concurrency Benchmark Results

## Executive Summary

After implementing concurrent file scanning with semaphore-based concurrency control and running comprehensive benchmarks, **the results show that the concurrent implementation degrades performance** for the current codebase architecture.

## What Was Tested

### Test 1: Path Expansion (`benchmark.ts`)
Tests `expandFilePaths()` - collecting file paths from glob patterns.

**Result:** Concurrent implementation is ~28% slower on average
- Small overhead for simple Set operations
- No actual I/O to benefit from concurrency

### Test 2: File Loading with ts-morph (`benchmark-scanfiles.ts`)  
Tests `scanFiles()` - the actual bottleneck with ts-morph parsing TypeScript files.

**Result:** Concurrent implementation is dramatically slower (90x-250x slower!)

| Files | Sequential | Concurrent | Performance |
|-------|-----------|------------|-------------|
| 10    | 2.29ms    | 587.95ms   | -25,573% |
| 50    | 8.82ms    | 514.63ms   | -5,738%  |
| 100   | 15.24ms   | 525.38ms   | -3,347%  |
| 200   | 31.59ms   | 520.97ms   | -1,549%  |

## Root Cause Analysis

### Why Concurrency Doesn't Help

1. **ts-morph's `addSourceFileAtPath()` is synchronous**
   - It's a CPU-bound operation (parsing TypeScript AST)
   - Wrapping sync operations in async/Promise.all adds overhead without benefits
   - No actual concurrent I/O happening

2. **ts-morph has internal optimizations**
   - Likely caches file system operations
   - May batch or optimize file reads internally
   - Our concurrent wrapper interferes with these optimizations

3. **The bottleneck is CPU, not I/O**
   - Parsing TypeScript is computationally expensive
   - Even if we read files concurrently, parsing must happen serially on single thread
   - JavaScript's single-threaded nature limits concurrency benefits

## Alternative Approaches Considered

### Option 1: Worker Threads (Not Implemented)
Could use Bun's worker threads to truly parallelize parsing across CPU cores.
- **Pros:** True parallel processing
- **Cons:** Complex implementation, serialization overhead, ts-morph Project state management

### Option 2: Streaming with Async File Reads (Theoretical)
If the pattern was:
```ts
for await (const path of glob.scan(...)) {
  const content = await Bun.file(path).text();  // Async I/O
  // Parse in memory
}
```
Then concurrent reads would help. But ts-morph handles file I/O internally and synchronously.

## Recommendation

**Revert concurrent file loading changes to `scanFiles()`**. Keep the semaphore utility for potential future use cases where true async I/O is the bottleneck.

### What to Keep:
✅ **Semaphore utility** (`src/cli/semaphore.ts`) - well-tested, documented, useful primitive
✅ **Test coverage** - validates semaphore behavior
✅ **Benchmark tools** - useful for future optimizations

### What to Revert:
❌ **Concurrent file loading in `scanFiles()`** - proven to hurt performance
❌ **Related documentation claiming performance benefits**

## Performance Characteristics

The benchmarks reveal that:
- File scanning performance scales linearly with file count (good!)
- Sequential: ~0.15ms per file average
- The current implementation is already quite efficient
- Real-world bottleneck is TypeScript parsing, not file I/O

## Conclusion

The original issue description mentioned a pattern with `Bun.file(path).content()` followed by parsing. That pattern would benefit from concurrency. However, the current codebase uses ts-morph which handles file I/O internally and synchronously. Attempting to add concurrency around synchronous operations causes significant performance degradation.

**The semaphore implementation is solid and well-tested**, but applying it to `scanFiles()` was the wrong optimization target. The codebase would need architectural changes (like explicit async file reading before ts-morph processing) for concurrency to provide benefits.
