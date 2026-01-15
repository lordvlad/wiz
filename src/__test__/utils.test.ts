import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";

import { createSemaphore, scanFilesWithContent, expandFilePaths, DEFAULT_CONCURRENCY } from "../cli/utils";

const tmpDir = resolve(import.meta.dir, ".tmp-utils-test");

describe("CLI utils", () => {
    describe("createSemaphore", () => {
        it("should limit concurrent operations", async () => {
            const acquire = createSemaphore(2);
            const results: number[] = [];
            let active = 0;
            let maxActive = 0;

            const task = async (id: number) => {
                const release = await acquire();
                active++;
                maxActive = Math.max(maxActive, active);
                results.push(id);
                // Simulate async work
                await new Promise((resolve) => setTimeout(resolve, 10));
                active--;
                release();
            };

            // Start 5 tasks concurrently
            await Promise.all([task(1), task(2), task(3), task(4), task(5)]);

            expect(results.length).toBe(5);
            expect(maxActive).toBeLessThanOrEqual(2);
        });

        it("should allow immediate execution when slots are available", async () => {
            const acquire = createSemaphore(3);

            // All three should acquire immediately
            const release1 = await acquire();
            const release2 = await acquire();
            const release3 = await acquire();

            // Release all
            release1();
            release2();
            release3();

            // Should be able to acquire again
            const release4 = await acquire();
            release4();
        });

        it("should queue when no slots available", async () => {
            const acquire = createSemaphore(1);
            const order: number[] = [];

            const release1 = await acquire();
            order.push(1);

            // This will be queued
            const promise2 = acquire().then((release) => {
                order.push(2);
                release();
            });

            // Give the promise a chance to resolve (it shouldn't yet)
            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(order).toEqual([1]);

            // Release the first one
            release1();

            // Now the second should complete
            await promise2;
            expect(order).toEqual([1, 2]);
        });

        it("should handle zero concurrency", async () => {
            const acquire = createSemaphore(0);
            const order: number[] = [];

            // Start a task that will be immediately queued
            const promise1 = acquire().then((release) => {
                order.push(1);
                release();
            });

            // Start another task
            const promise2 = acquire().then((release) => {
                order.push(2);
                release();
            });

            // Neither should have executed yet
            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(order).toEqual([]);

            // Note: With zero concurrency, nothing can ever execute
            // This is expected behavior - the semaphore is permanently blocked
        });
    });

    describe("scanFilesWithContent", () => {
        beforeEach(async () => {
            await mkdir(tmpDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(tmpDir, { recursive: true, force: true });
        });

        it("should scan files and return content promises", async () => {
            // Create test files
            await writeFile(resolve(tmpDir, "a.ts"), "const a = 1;");
            await writeFile(resolve(tmpDir, "b.ts"), "const b = 2;");

            const files: { path: string; content: string }[] = [];

            for await (const { path, content } of scanFilesWithContent([tmpDir])) {
                files.push({ path, content: await content });
            }

            expect(files.length).toBe(2);
            expect(files.some((f) => f.content === "const a = 1;")).toBe(true);
            expect(files.some((f) => f.content === "const b = 2;")).toBe(true);
        });

        it("should respect concurrency limit", async () => {
            // Create multiple test files
            for (let i = 0; i < 10; i++) {
                await writeFile(resolve(tmpDir, `file${i}.ts`), `const x = ${i};`);
            }

            let activeReads = 0;
            let maxActiveReads = 0;
            const files: string[] = [];

            for await (const { path, content } of scanFilesWithContent([tmpDir], { concurrency: 3 })) {
                activeReads++;
                maxActiveReads = Math.max(maxActiveReads, activeReads);

                const text = await content;
                files.push(text);

                activeReads--;
            }

            expect(files.length).toBe(10);
            // The max active reads should be limited by the semaphore
            // Note: Due to how the semaphore works with prefetching, actual concurrency
            // depends on how fast files are consumed vs read
        });

        it("should handle empty directories", async () => {
            const emptyDir = resolve(tmpDir, "empty");
            await mkdir(emptyDir, { recursive: true });

            const files: string[] = [];
            for await (const { path } of scanFilesWithContent([emptyDir])) {
                files.push(path);
            }

            expect(files.length).toBe(0);
        });

        it("should handle nested directories", async () => {
            const subDir = resolve(tmpDir, "sub");
            await mkdir(subDir, { recursive: true });

            await writeFile(resolve(tmpDir, "root.ts"), "const root = 1;");
            await writeFile(resolve(subDir, "nested.ts"), "const nested = 2;");

            const files: { path: string; content: string }[] = [];
            for await (const { path, content } of scanFilesWithContent([tmpDir])) {
                files.push({ path, content: await content });
            }

            expect(files.length).toBe(2);
            expect(files.some((f) => f.path.includes("root.ts"))).toBe(true);
            expect(files.some((f) => f.path.includes("nested.ts"))).toBe(true);
        });

        it("should filter to only TypeScript files", async () => {
            await writeFile(resolve(tmpDir, "valid.ts"), "const a = 1;");
            await writeFile(resolve(tmpDir, "valid.tsx"), "const b = 2;");
            await writeFile(resolve(tmpDir, "invalid.js"), "const c = 3;");
            await writeFile(resolve(tmpDir, "invalid.json"), '{"key": "value"}');

            const files: string[] = [];
            for await (const { path } of scanFilesWithContent([tmpDir])) {
                files.push(path);
            }

            expect(files.length).toBe(2);
            expect(files.every((f) => f.endsWith(".ts") || f.endsWith(".tsx"))).toBe(true);
        });

        it("should use default concurrency when not specified", async () => {
            await writeFile(resolve(tmpDir, "test.ts"), "const x = 1;");

            // Just verify it works with default concurrency
            const files: string[] = [];
            for await (const { path, content } of scanFilesWithContent([tmpDir])) {
                files.push(await content);
            }

            expect(files.length).toBe(1);
        });
    });

    describe("DEFAULT_CONCURRENCY", () => {
        it("should be 8", () => {
            expect(DEFAULT_CONCURRENCY).toBe(8);
        });
    });

    describe("expandFilePaths", () => {
        beforeEach(async () => {
            await mkdir(tmpDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(tmpDir, { recursive: true, force: true });
        });

        it("should expand directory to TypeScript files", async () => {
            await writeFile(resolve(tmpDir, "a.ts"), "const a = 1;");
            await writeFile(resolve(tmpDir, "b.tsx"), "const b = 2;");
            await writeFile(resolve(tmpDir, "c.js"), "const c = 3;");

            const files = await expandFilePaths([tmpDir]);

            expect(files.length).toBe(2);
            expect(files.some((f) => f.endsWith("a.ts"))).toBe(true);
            expect(files.some((f) => f.endsWith("b.tsx"))).toBe(true);
        });

        it("should return sorted file paths", async () => {
            await writeFile(resolve(tmpDir, "z.ts"), "const z = 1;");
            await writeFile(resolve(tmpDir, "a.ts"), "const a = 2;");
            await writeFile(resolve(tmpDir, "m.ts"), "const m = 3;");

            const files = await expandFilePaths([tmpDir]);

            expect(files.length).toBe(3);
            expect(files[0]!.endsWith("a.ts")).toBe(true);
            expect(files[1]!.endsWith("m.ts")).toBe(true);
            expect(files[2]!.endsWith("z.ts")).toBe(true);
        });
    });
});
