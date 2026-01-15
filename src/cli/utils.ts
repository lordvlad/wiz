import { stat } from "fs/promises";
import { resolve, extname, dirname } from "path";

import { semaphore } from "./semaphore";

/**
 * Expands a list of file paths, directories, or glob patterns into a list of TypeScript files.
 * Directories are converted to globs that match all nested .ts/.tsx files.
 *
 * Uses concurrent file discovery with limited concurrency (max 8) to optimize performance:
 * - Converts async iterator from glob.scan to array for concurrent processing
 * - Uses semaphore to limit concurrent stat/filter operations
 * - Empirically, 8 concurrent operations provides optimal throughput without disk thrashing
 */
export async function expandFilePaths(paths: string[]): Promise<string[]> {
    const allFiles = new Set<string>();
    // Semaphore to limit concurrency - empirically 8 provides optimal performance
    const sem = semaphore(8);

    for (const path of paths) {
        const resolvedPath = resolve(path);

        try {
            const stats = await stat(resolvedPath);

            if (stats.isDirectory()) {
                // Convert directory to glob pattern - scan for TypeScript files
                const glob = new Bun.Glob("**/*.{ts,tsx}");

                // Collect all paths from the async iterator first to enable concurrent processing
                const discoveredPaths: string[] = [];
                for await (const file of glob.scan({ cwd: resolvedPath, absolute: true })) {
                    discoveredPaths.push(file);
                }

                // Process all discovered paths concurrently with limited concurrency
                await Promise.all(
                    discoveredPaths.map(async (file) => {
                        const release = await sem();
                        try {
                            // Files are already filtered by glob pattern, just add them
                            allFiles.add(file);
                        } finally {
                            release();
                        }
                    }),
                );
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

            // Collect all paths from the async iterator first to enable concurrent processing
            const discoveredPaths: string[] = [];
            for await (const file of glob.scan({ cwd: dirPart, absolute: true })) {
                discoveredPaths.push(file);
            }

            // Process all discovered paths concurrently with limited concurrency
            await Promise.all(
                discoveredPaths.map(async (file) => {
                    const release = await sem();
                    try {
                        const ext = extname(file);
                        if (ext === ".ts" || ext === ".tsx") {
                            allFiles.add(file);
                        }
                    } finally {
                        release();
                    }
                }),
            );
        }
    }

    return Array.from(allFiles).sort();
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
