#!/usr/bin/env bun
/**
 * Benchmark for the actual file loading bottleneck - ts-morph file parsing
 * This is where the real performance benefit should be seen.
 */
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";

import { scanFiles } from "./src/cli/file-scanner";
import { Project } from "ts-morph";

const tmpDir = resolve(process.cwd(), ".tmp-benchmark-scanfiles");

async function createTestFiles(count: number): Promise<string[]> {
    await mkdir(tmpDir, { recursive: true });

    const files: string[] = [];
    const promises: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
        const filePath = resolve(tmpDir, `file${i}.ts`);
        files.push(filePath);
        const content = `
// File ${i}
export type Type${i} = {
    id: number;
    name: string;
    value: string;
    nested: {
        field1: string;
        field2: number;
        field3: boolean;
    };
};

export type Related${i} = {
    typeId: number;
    data: Type${i};
    optional?: string;
};

export interface Interface${i} {
    method1(): void;
    method2(param: string): number;
    method3<T>(param: T): T;
}
`;
        promises.push(writeFile(filePath, content));
    }

    await Promise.all(promises);
    return files;
}

/**
 * Sequential file loading (old approach) - load files one by one
 */
async function scanFilesSequential(files: string[]): Promise<void> {
    const project = new Project({
        skipAddingFilesFromTsConfig: true,
    });

    // Sequential loading
    for (const f of files) {
        project.addSourceFileAtPath(f);
    }

    // Process files (similar to what scanFiles does)
    const sourceFiles = project.getSourceFiles();
    let typeCount = 0;
    for (const sourceFile of sourceFiles) {
        typeCount += sourceFile.getTypeAliases().length;
        typeCount += sourceFile.getInterfaces().length;
    }
}

async function benchmark(
    fileCount: number,
    iterations: number = 5,
): Promise<{ concurrent: number[]; sequential: number[] }> {
    console.log(`\nBenchmarking with ${fileCount} files (${iterations} iterations)...`);

    const files = await createTestFiles(fileCount);

    const concurrentTimes: number[] = [];
    const sequentialTimes: number[] = [];

    // Warm up both implementations
    await scanFiles(files);
    await scanFilesSequential(files);

    // Benchmark concurrent implementation (new)
    console.log("  Concurrent (with semaphore):");
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await scanFiles(files);
        const duration = performance.now() - start;
        concurrentTimes.push(duration);
        console.log(`    Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
    }

    // Benchmark sequential implementation (old)
    console.log("  Sequential:");
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await scanFilesSequential(files);
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
    console.log("File Loading (ts-morph) Performance Benchmark");
    console.log("=".repeat(70));
    console.log("\nComparing Sequential vs Concurrent File Loading");
    console.log("This tests the actual bottleneck: ts-morph addSourceFileAtPath()");
    console.log("-".repeat(70));

    const testCases = [
        { files: 10, iterations: 5 },
        { files: 50, iterations: 5 },
        { files: 100, iterations: 3 },
        { files: 200, iterations: 3 },
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
    console.log("Summary - Concurrent Implementation (with semaphore, max 8)");
    console.log("=".repeat(70));
    console.log("\nFiles | Avg (ms) | Min (ms) | Max (ms) | Median (ms)");
    console.log("-".repeat(70));

    for (const { files, concurrent: s } of results) {
        console.log(
            `${String(files).padStart(5)} | ${s.avg.toFixed(2).padStart(8)} | ${s.min.toFixed(2).padStart(8)} | ${s.max.toFixed(2).padStart(8)} | ${s.median.toFixed(2).padStart(11)}`,
        );
    }

    console.log("\n" + "=".repeat(70));
    console.log("Summary - Sequential Implementation (old)");
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
        console.log(
            `${String(files).padStart(5)} | ${sequential.avg.toFixed(2).padStart(15)} | ${concurrent.avg.toFixed(2).padStart(15)} | ${sign}${improvement.toFixed(1)}%`,
        );
    }

    const avgImprovement = results.reduce((sum, r) => sum + r.improvement, 0) / results.length;

    console.log("\n" + "=".repeat(70));
    console.log("Key Findings:");
    console.log(`- Average performance change: ${avgImprovement > 0 ? "+" : ""}${avgImprovement.toFixed(1)}%`);
    console.log("- This benchmark tests ts-morph's addSourceFileAtPath() with real files");
    console.log("- Concurrent implementation uses semaphore with max 8 operations");
    console.log("- Files include realistic TypeScript with types, interfaces, generics");
    if (avgImprovement > 0) {
        console.log("✅ Concurrent loading provides measurable performance improvement");
    } else {
        console.log("⚠️  For this workload, concurrent overhead exceeds benefits");
        console.log("   (ts-morph may have internal optimizations or I/O isn't the bottleneck)");
    }
    console.log("=".repeat(70));
}

main().catch(console.error);
