import { stat } from "fs/promises";
import { resolve, extname, dirname } from "path";

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
 * Checks if a string is a URL (supports http://, https://, file://, s3://)
 */
export function isUrl(path: string): boolean {
    return /^(https?|file|s3):\/\//i.test(path);
}

/**
 * Loads content from a URL or file path.
 * Bun's fetch supports http://, https://, file://, and s3:// protocols.
 */
export async function loadSpecContent(pathOrUrl: string): Promise<string> {
    if (isUrl(pathOrUrl)) {
        const response = await fetch(pathOrUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${pathOrUrl}: ${response.status} ${response.statusText}`);
        }
        return await response.text();
    } else {
        // Local file path
        const file = Bun.file(pathOrUrl);
        return await file.text();
    }
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
