#!/usr/bin/env bun
/**
 * Benchmark script to measure the performance impact of concurrent file scanning.
 *
 * This script creates a test directory with varying numbers of TypeScript files
 * and measures the time taken to scan them with both sequential and concurrent approaches.
 */
import { mkdir, rm, writeFile, stat } from "fs/promises";
import { resolve, extname } from "path";

import { expandFilePaths } from "./src/cli/utils";

/**
 * Sequential implementation (old approach) for comparison
 */
async function expandFilePathsSequential(paths: string[]): Promise<string[]> {
    const allFiles = new Set<string>();

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

    return Array.from(allFiles).sort();
}

const tmpDir = resolve(process.cwd(), ".tmp-benchmark");

async function createTestFiles(count: number): Promise<void> {
    await mkdir(tmpDir, { recursive: true });

    // Create nested directory structure for realistic test
    const dirs = ["src", "src/lib", "src/utils", "src/components", "src/api"];
    for (const dir of dirs) {
        await mkdir(resolve(tmpDir, dir), { recursive: true });
    }

    const promises: Promise<void>[] = [];
    for (let i = 0; i < count; i++) {
        const dir = dirs[i % dirs.length]!;
        const content = `
export type Type${i} = {
    id: number;
    name: string;
    value: string;
    nested: {
        field1: string;
        field2: number;
    };
};
`;
        promises.push(writeFile(resolve(tmpDir, dir, `file${i}.ts`), content));
    }

    await Promise.all(promises);
}

async function benchmark(
    fileCount: number,
    iterations: number = 5,
): Promise<{ concurrent: number[]; sequential: number[] }> {
    console.log(`\nBenchmarking with ${fileCount} files (${iterations} iterations)...`);

    await createTestFiles(fileCount);

    const concurrentTimes: number[] = [];
    const sequentialTimes: number[] = [];

    // Warm up both implementations
    await expandFilePaths([tmpDir]);
    await expandFilePathsSequential([tmpDir]);

    // Benchmark concurrent implementation
    console.log("  Concurrent:");
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await expandFilePaths([tmpDir]);
        const duration = performance.now() - start;
        concurrentTimes.push(duration);
        console.log(`    Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
    }

    // Benchmark sequential implementation
    console.log("  Sequential:");
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await expandFilePathsSequential([tmpDir]);
        const duration = performance.now() - start;
        sequentialTimes.push(duration);
        console.log(`    Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
    }

    await rm(tmpDir, { recursive: true, force: true });

    return { concurrent: concurrentTimes, sequential: sequentialTimes };
}

function stats(times: number[]): { avg: number; min: number; max: number; median: number } {
    const sorted = [...times].sort((a, b) => a - b);
    return {
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        min: sorted[0]!,
        max: sorted[sorted.length - 1]!,
        median: sorted[Math.floor(sorted.length / 2)]!,
    };
}

async function main() {
    console.log("=".repeat(70));
    console.log("File Scanning Performance Benchmark");
    console.log("=".repeat(70));
    console.log("\nComparing Sequential vs Concurrent Implementations");
    console.log("-".repeat(70));

    const testCases = [
        { files: 10, iterations: 10 },
        { files: 50, iterations: 10 },
        { files: 100, iterations: 5 },
        { files: 500, iterations: 3 },
        { files: 1000, iterations: 3 },
    ];

    const results: Array<{
        files: number;
        concurrent: ReturnType<typeof stats>;
        sequential: ReturnType<typeof stats>;
        improvement: number;
    }> = [];

    for (const { files, iterations } of testCases) {
        const { concurrent, sequential } = await benchmark(files, iterations);
        const cStats = stats(concurrent);
        const sStats = stats(sequential);
        const improvement = ((sStats.avg - cStats.avg) / sStats.avg) * 100;
        results.push({ files, concurrent: cStats, sequential: sStats, improvement });
    }

    console.log("\n" + "=".repeat(70));
    console.log("Summary - Concurrent Implementation");
    console.log("=".repeat(70));
    console.log("\nFiles | Avg (ms) | Min (ms) | Max (ms) | Median (ms)");
    console.log("-".repeat(70));

    for (const { files, concurrent: s } of results) {
        console.log(
            `${String(files).padStart(5)} | ${s.avg.toFixed(2).padStart(8)} | ${s.min.toFixed(2).padStart(8)} | ${s.max.toFixed(2).padStart(8)} | ${s.median.toFixed(2).padStart(11)}`,
        );
    }

    console.log("\n" + "=".repeat(70));
    console.log("Summary - Sequential Implementation (Old)");
    console.log("=".repeat(70));
    console.log("\nFiles | Avg (ms) | Min (ms) | Max (ms) | Median (ms)");
    console.log("-".repeat(70));

    for (const { files, sequential: s } of results) {
        console.log(
            `${String(files).padStart(5)} | ${s.avg.toFixed(2).padStart(8)} | ${s.min.toFixed(2).padStart(8)} | ${s.max.toFixed(2).padStart(8)} | ${s.median.toFixed(2).padStart(11)}`,
        );
    }

    console.log("\n" + "=".repeat(70));
    console.log("Performance Improvement");
    console.log("=".repeat(70));
    console.log("\nFiles | Sequential (ms) | Concurrent (ms) | Improvement");
    console.log("-".repeat(70));

    for (const { files, concurrent, sequential, improvement } of results) {
        const sign = improvement > 0 ? "+" : "";
        const color = improvement > 0 ? "" : "";
        console.log(
            `${String(files).padStart(5)} | ${sequential.avg.toFixed(2).padStart(15)} | ${concurrent.avg.toFixed(2).padStart(15)} | ${sign}${improvement.toFixed(1)}%`,
        );
    }

    const avgImprovement = results.reduce((sum, r) => sum + r.improvement, 0) / results.length;

    console.log("\n" + "=".repeat(70));
    console.log("Conclusions:");
    console.log(`- Average performance improvement: ${avgImprovement > 0 ? "+" : ""}${avgImprovement.toFixed(1)}%`);
    console.log("- Concurrent implementation uses semaphore with max 8 operations");
    console.log("- Files are collected from async iterator before concurrent processing");
    console.log("- Both implementations include path filtering and deduplication");
    console.log("- Performance improvement may vary based on disk speed and CPU");
    console.log("=".repeat(70));
}

main().catch(console.error);
