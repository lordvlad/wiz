import { stat } from "fs/promises";
import { resolve, extname } from "path";

/**
 * Default maximum number of concurrent file operations.
 * Empirically, more than 8 concurrent reads often degrades performance
 * due to file descriptor limits, disk I/O contention, and memory pressure.
 */
export const DEFAULT_CONCURRENCY = 8;

/**
 * Creates a semaphore to limit concurrent async operations.
 *
 * Trade-offs:
 * - Higher concurrency (>8) may exhaust file descriptors and increase memory pressure
 * - Lower concurrency may underutilize available I/O bandwidth
 * - The default of 8 balances throughput vs resource usage for typical file operations
 *
 * Implementation notes:
 * - When a slot is available (n > 0), acquire() returns immediately with a release function
 * - When all slots are taken (n <= 0), acquire() queues a resolver and waits
 * - release() either increments the counter or dequeues and resolves a waiting acquirer
 *
 * @param n Maximum number of concurrent operations allowed
 * @returns An acquire function that returns a Promise resolving to a release function
 *
 * @example
 * ```ts
 * const acquire = createSemaphore(8);
 * const release = await acquire();
 * try {
 *   await someAsyncOperation();
 * } finally {
 *   release();
 * }
 * ```
 */
export function createSemaphore(n: number): () => Promise<() => void> {
    const queue: Array<(release: () => void) => void> = [];

    const release = (): void => {
        const next = queue.shift();
        if (next) {
            // Pass release to the next waiter
            next(release);
        } else {
            // No waiters, increment available slots
            n++;
        }
    };

    return (): Promise<() => void> => {
        if (n > 0) {
            n--;
            return Promise.resolve(release);
        }
        return new Promise((resolve) => queue.push(resolve));
    };
}

/**
 * Expands a list of file paths, directories, or glob patterns into a list of TypeScript files.
 * Directories are converted to globs that match all nested .ts/.tsx files.
 */
export async function expandFilePaths(paths: string[]): Promise<string[]> {
    const allFiles = new Set<string>();

    for (const path of paths) {
        const resolvedPath = resolve(path);

        try {
            const stats = await stat(resolvedPath);

            if (stats.isDirectory()) {
                // Convert directory to glob pattern - scan for TypeScript files
                const glob = new Bun.Glob("**/*.{ts,tsx}");
                for await (const file of glob.scan({ cwd: resolvedPath, absolute: true })) {
                    allFiles.add(file);
                }
            } else if (stats.isFile()) {
                const ext = extname(resolvedPath);
                if (ext === ".ts" || ext === ".tsx") {
                    allFiles.add(resolvedPath);
                }
            }
        } catch {
            // If stat fails, treat as a glob pattern
            // Normalize backslashes to forward slashes for cross-platform compatibility
            const normalizedPath = path.replace(/\\/g, "/");
            const dirPart = normalizedPath.includes("/")
                ? normalizedPath.substring(0, normalizedPath.lastIndexOf("/"))
                : ".";
            const patternPart = normalizedPath.includes("/")
                ? normalizedPath.substring(normalizedPath.lastIndexOf("/") + 1)
                : normalizedPath;

            const glob = new Bun.Glob(patternPart);
            for await (const file of glob.scan({ cwd: dirPart, absolute: true })) {
                const ext = extname(file);
                if (ext === ".ts" || ext === ".tsx") {
                    allFiles.add(file);
                }
            }
        }
    }

    return Array.from(allFiles).sort();
}

/**
 * Result type for file scanning with content prefetching.
 */
export interface FileWithContent {
    /** Absolute path to the file */
    path: string;
    /** Promise that resolves to the file content as text */
    content: Promise<string>;
}

/**
 * Options for scanning files with content prefetching.
 */
export interface ScanFilesWithContentOptions {
    /**
     * Maximum number of concurrent file reads.
     * Default: 8 (empirically optimal for most systems)
     */
    concurrency?: number;
}

/**
 * Async generator that scans files and prefetches their content with limited concurrency.
 *
 * This function improves performance by:
 * 1. Starting to read the next file(s) while the current one is being processed
 * 2. Limiting concurrent reads to avoid overwhelming the file system
 *
 * Trade-offs:
 * - Memory usage: Prefetched content is held in memory until consumed
 * - Throughput vs latency: Higher concurrency improves throughput but may increase latency
 * - File descriptors: Limited concurrency prevents exhausting system limits
 *
 * @param paths Array of file paths, directories, or glob patterns
 * @param options Configuration options including concurrency limit
 * @yields Objects containing file path and a Promise for the file content
 *
 * @example
 * ```ts
 * for await (const { path, content } of scanFilesWithContent(['src/'])) {
 *   const text = await content;
 *   // Process the file content
 * }
 * ```
 */
export async function* scanFilesWithContent(
    paths: string[],
    options: ScanFilesWithContentOptions = {},
): AsyncGenerator<FileWithContent> {
    const { concurrency = DEFAULT_CONCURRENCY } = options;
    const acquire = createSemaphore(concurrency);
    const allFiles = new Set<string>();

    // First collect all file paths
    for (const path of paths) {
        const resolvedPath = resolve(path);

        try {
            const stats = await stat(resolvedPath);

            if (stats.isDirectory()) {
                const glob = new Bun.Glob("**/*.{ts,tsx}");
                for await (const file of glob.scan({ cwd: resolvedPath, absolute: true })) {
                    allFiles.add(file);
                }
            } else if (stats.isFile()) {
                const ext = extname(resolvedPath);
                if (ext === ".ts" || ext === ".tsx") {
                    allFiles.add(resolvedPath);
                }
            }
        } catch {
            const normalizedPath = path.replace(/\\/g, "/");
            const dirPart = normalizedPath.includes("/")
                ? normalizedPath.substring(0, normalizedPath.lastIndexOf("/"))
                : ".";
            const patternPart = normalizedPath.includes("/")
                ? normalizedPath.substring(normalizedPath.lastIndexOf("/") + 1)
                : normalizedPath;

            const glob = new Bun.Glob(patternPart);
            for await (const file of glob.scan({ cwd: dirPart, absolute: true })) {
                const ext = extname(file);
                if (ext === ".ts" || ext === ".tsx") {
                    allFiles.add(file);
                }
            }
        }
    }

    const sortedFiles = Array.from(allFiles).sort();

    // Yield files with prefetched content using semaphore-controlled concurrency
    for (const filePath of sortedFiles) {
        const release = await acquire();

        // Start reading content, then release semaphore after read completes
        const content = Bun.file(filePath)
            .text()
            .finally(() => release());

        yield { path: filePath, content };
    }
}

/**
 * Finds the nearest package.json file by walking up the directory tree.
 */
export async function findNearestPackageJson(startPath: string): Promise<string | null> {
    let currentPath = resolve(startPath);
    const root = resolve(currentPath, "/");

    while (true) {
        const packageJsonPath = resolve(currentPath, "package.json");
        try {
            await stat(packageJsonPath);
            return packageJsonPath;
        } catch {
            // Move up one directory
            const parentPath = resolve(currentPath, "..");
            if (parentPath === currentPath || currentPath === root) break;
            currentPath = parentPath;
        }
    }

    return null;
}

/**
 * Reads and parses a package.json file.
 */
export async function readPackageJson(path: string): Promise<any> {
    return await Bun.file(path).json();
}

/**
 * Debug logger that outputs to stderr when enabled.
 */
export class DebugLogger {
    constructor(private enabled: boolean) {}

    log(message: string, data?: any): void {
        if (!this.enabled) return;
        console.error(`[wiz:debug] ${message}`);
        if (data !== undefined) {
            console.error(JSON.stringify(data, null, 2));
        }
    }

    group(title: string): void {
        if (!this.enabled) return;
        console.error(`\n[wiz:debug] === ${title} ===`);
    }
}
