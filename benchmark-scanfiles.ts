#!/usr/bin/env bun
/**
 * Benchmark for the actual file loading bottleneck - ts-morph file parsing
 * This is where the real performance benefit should be seen.
 */
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";
import { Project } from "ts-morph";

import { scanFiles } from "./src/cli/file-scanner";
import { semaphore } from "./src/cli/semaphore";

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

/**
 * Concurrent file reading with Bun.file().text() + in-memory ts-morph parsing
 * This is the proposed optimization: read files concurrently, then parse in memory
 */
async function scanFilesConcurrentRead(files: string[]): Promise<void> {
    const project = new Project({
        skipAddingFilesFromTsConfig: true,
        useInMemoryFileSystem: true,
    });

    // Read all files concurrently with semaphore
    const sem = semaphore(8);
    const fileContents = await Promise.all(
        files.map(async (filePath) => {
            const release = await sem();
            try {
                const content = await Bun.file(filePath).text();
                return { filePath, content };
            } finally {
                release();
            }
        }),
    );

    // Add files to ts-morph from memory
    for (const { filePath, content } of fileContents) {
        project.createSourceFile(filePath, content);
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
): Promise<{ concurrent: number[]; sequential: number[]; concurrentRead: number[] }> {
    console.log(`\nBenchmarking with ${fileCount} files (${iterations} iterations)...`);

    const files = await createTestFiles(fileCount);

    const concurrentTimes: number[] = [];
    const sequentialTimes: number[] = [];
    const concurrentReadTimes: number[] = [];

    // Warm up all implementations
    await scanFiles(files);
    await scanFilesSequential(files);
    await scanFilesConcurrentRead(files);

    // Benchmark concurrent implementation (wrapping sync operations)
    console.log("  Concurrent (wrapping sync addSourceFileAtPath):");
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await scanFiles(files);
        const duration = performance.now() - start;
        concurrentTimes.push(duration);
        console.log(`    Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
    }

    // Benchmark sequential implementation (baseline)
    console.log("  Sequential (baseline):");
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await scanFilesSequential(files);
        const duration = performance.now() - start;
        sequentialTimes.push(duration);
        console.log(`    Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
    }

    // Benchmark concurrent read + in-memory parse (proposed optimization)
    console.log("  Concurrent Read + In-Memory Parse:");
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await scanFilesConcurrentRead(files);
        const duration = performance.now() - start;
        concurrentReadTimes.push(duration);
        console.log(`    Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
    }

    await rm(tmpDir, { recursive: true, force: true });

    return { concurrent: concurrentTimes, sequential: sequentialTimes, concurrentRead: concurrentReadTimes };
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
    console.log("=".repeat(80));
    console.log("File Loading (ts-morph) Performance Benchmark");
    console.log("=".repeat(80));
    console.log("\nComparing Three Approaches:");
    console.log("1. Sequential: addSourceFileAtPath() one by one (baseline)");
    console.log("2. Concurrent (wrong): wrapping sync addSourceFileAtPath() in async");
    console.log("3. Concurrent Read: Bun.file().text() concurrently + in-memory parse");
    console.log("-".repeat(80));

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
        concurrentRead: ReturnType<typeof stats>;
        improvementConcurrent: number;
        improvementConcurrentRead: number;
    }> = [];

    for (const { files, iterations } of testCases) {
        const { concurrent, sequential, concurrentRead } = await benchmark(files, iterations);
        const cStats = stats(concurrent);
        const sStats = stats(sequential);
        const crStats = stats(concurrentRead);
        const improvementConcurrent = ((sStats.avg - cStats.avg) / sStats.avg) * 100;
        const improvementConcurrentRead = ((sStats.avg - crStats.avg) / sStats.avg) * 100;
        results.push({
            files,
            concurrent: cStats,
            sequential: sStats,
            concurrentRead: crStats,
            improvementConcurrent,
            improvementConcurrentRead,
        });
    }

    console.log("\n" + "=".repeat(80));
    console.log("Summary - Sequential (Baseline)");
    console.log("=".repeat(80));
    console.log("\nFiles | Avg (ms) | Min (ms) | Max (ms) | Median (ms)");
    console.log("-".repeat(80));

    for (const { files, sequential: s } of results) {
        console.log(
            `${String(files).padStart(5)} | ${s.avg.toFixed(2).padStart(8)} | ${s.min.toFixed(2).padStart(8)} | ${s.max.toFixed(2).padStart(8)} | ${s.median.toFixed(2).padStart(11)}`,
        );
    }

    console.log("\n" + "=".repeat(80));
    console.log("Summary - Concurrent (wrapping sync operations) - WRONG APPROACH");
    console.log("=".repeat(80));
    console.log("\nFiles | Avg (ms) | Min (ms) | Max (ms) | Median (ms)");
    console.log("-".repeat(80));

    for (const { files, concurrent: s } of results) {
        console.log(
            `${String(files).padStart(5)} | ${s.avg.toFixed(2).padStart(8)} | ${s.min.toFixed(2).padStart(8)} | ${s.max.toFixed(2).padStart(8)} | ${s.median.toFixed(2).padStart(11)}`,
        );
    }

    console.log("\n" + "=".repeat(80));
    console.log("Summary - Concurrent Read + In-Memory Parse - PROPOSED OPTIMIZATION");
    console.log("=".repeat(80));
    console.log("\nFiles | Avg (ms) | Min (ms) | Max (ms) | Median (ms)");
    console.log("-".repeat(80));

    for (const { files, concurrentRead: s } of results) {
        console.log(
            `${String(files).padStart(5)} | ${s.avg.toFixed(2).padStart(8)} | ${s.min.toFixed(2).padStart(8)} | ${s.max.toFixed(2).padStart(8)} | ${s.median.toFixed(2).padStart(11)}`,
        );
    }

    console.log("\n" + "=".repeat(80));
    console.log("Performance Comparison");
    console.log("=".repeat(80));
    console.log("\nFiles | Sequential | Concurrent (wrong) | Change | Concurrent Read | Change");
    console.log("-".repeat(80));

    for (const {
        files,
        sequential,
        concurrent,
        concurrentRead,
        improvementConcurrent,
        improvementConcurrentRead,
    } of results) {
        const sign1 = improvementConcurrent > 0 ? "+" : "";
        const sign2 = improvementConcurrentRead > 0 ? "+" : "";
        console.log(
            `${String(files).padStart(5)} | ${sequential.avg.toFixed(2).padStart(10)} | ${concurrent.avg.toFixed(2).padStart(18)} | ${sign1}${improvementConcurrent.toFixed(1).padStart(5)}% | ${concurrentRead.avg.toFixed(2).padStart(15)} | ${sign2}${improvementConcurrentRead.toFixed(1).padStart(5)}%`,
        );
    }

    const avgImprovementConcurrent = results.reduce((sum, r) => sum + r.improvementConcurrent, 0) / results.length;
    const avgImprovementConcurrentRead =
        results.reduce((sum, r) => sum + r.improvementConcurrentRead, 0) / results.length;

    console.log("\n" + "=".repeat(80));
    console.log("Key Findings:");
    console.log(
        `- Wrapping sync operations: ${avgImprovementConcurrent > 0 ? "+" : ""}${avgImprovementConcurrent.toFixed(1)}% (adds overhead, no benefit)`,
    );
    console.log(
        `- Concurrent read + in-memory: ${avgImprovementConcurrentRead > 0 ? "+" : ""}${avgImprovementConcurrentRead.toFixed(1)}%`,
    );
    console.log("\nApproach Analysis:");
    console.log("1. Sequential: Simple, efficient for ts-morph's internal optimizations");
    console.log("2. Concurrent (wrong): Massive overhead from wrapping sync operations");
    console.log("3. Concurrent Read: Actually does concurrent I/O with Bun.file().text()");
    if (avgImprovementConcurrentRead > 5) {
        console.log("\n✅ Concurrent read + in-memory parse provides measurable improvement!");
        console.log("   This is the correct approach for concurrent file loading.");
    } else if (avgImprovementConcurrentRead > -5) {
        console.log("\n⚖️  Concurrent read + in-memory parse is comparable to sequential");
        console.log("   Benefits depend on I/O vs CPU bottleneck characteristics.");
    } else {
        console.log("\n⚠️  Concurrent read adds overhead that exceeds I/O benefits");
        console.log("   Sequential approach remains optimal for this workload.");
    }
    console.log("=".repeat(80));
}

main().catch(console.error);
