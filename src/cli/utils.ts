import { stat } from "fs/promises";
import { glob } from "glob";
import { resolve, extname } from "path";

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
                // Convert directory to glob pattern
                const pattern = `${resolvedPath}/**/*.{ts,tsx}`;
                const files = await glob(pattern, { nodir: true, absolute: true });
                files.forEach((f) => allFiles.add(f));
            } else if (stats.isFile()) {
                const ext = extname(resolvedPath);
                if (ext === ".ts" || ext === ".tsx") {
                    allFiles.add(resolvedPath);
                }
            }
        } catch {
            // If stat fails, treat as a glob pattern
            const files = await glob(path, { nodir: true, absolute: true });
            files
                .filter((f) => {
                    const ext = extname(f);
                    return ext === ".ts" || ext === ".tsx";
                })
                .forEach((f) => allFiles.add(f));
        }
    }

    return Array.from(allFiles).sort();
}

/**
 * Finds the nearest package.json file by walking up the directory tree.
 */
export async function findNearestPackageJson(startPath: string): Promise<string | null> {
    let currentPath = resolve(startPath);

    while (currentPath !== "/") {
        const packageJsonPath = resolve(currentPath, "package.json");
        try {
            await stat(packageJsonPath);
            return packageJsonPath;
        } catch {
            // Move up one directory
            const parentPath = resolve(currentPath, "..");
            if (parentPath === currentPath) break;
            currentPath = parentPath;
        }
    }

    return null;
}

/**
 * Reads and parses a package.json file.
 */
export async function readPackageJson(path: string): Promise<any> {
    const file = Bun.file(path);
    const text = await file.text();
    return JSON.parse(text);
}
