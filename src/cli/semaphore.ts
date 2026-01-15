/**
 * Semaphore for limiting concurrency
 *
 * This utility provides a simple way to limit the number of concurrent operations.
 * It's particularly useful for file I/O operations where too much concurrency can
 * degrade performance due to disk contention and OS scheduler overhead.
 *
 * Trade-offs:
 * - Too few concurrent operations: underutilizes system resources
 * - Too many concurrent operations: causes disk thrashing and context switching overhead
 * - Empirically, 8 concurrent file reads provides optimal throughput on most systems
 *
 * Usage:
 * ```ts
 * const sem = semaphore(8);
 * const results = await Promise.all(
 *   items.map(async item => {
 *     const release = await sem();
 *     try {
 *       return await processItem(item);
 *     } finally {
 *       release();
 *     }
 *   })
 * );
 * ```
 */
export function semaphore(n: number): () => Promise<() => void> {
    // Queue of pending resolve functions waiting for a slot
    const queue: (() => void)[] = [];

    // Release function that returns a slot to the pool
    const release = () => {
        // If there are pending operations, wake up the next one
        const resolve = queue.shift();
        if (resolve) {
            resolve();
        } else {
            // Otherwise, increment the available slot count
            n++;
        }
    };

    // Acquire function that returns a promise for a release function
    return () => {
        // If slots are available, return immediately
        if (n > 0) {
            n--;
            return Promise.resolve(release);
        }

        // Otherwise, queue up and wait for a slot
        return new Promise<() => void>((resolve) => {
            queue.push(() => {
                resolve(release);
            });
        });
    };
}
