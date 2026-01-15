import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";

import { expandFilePaths } from "../cli/utils";

const tmpDir = resolve(import.meta.dir, ".tmp-file-scanner-test");

describe("Concurrent file scanning", () => {
    beforeEach(async () => {
        await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it("should expand directory paths to TypeScript files", async () => {
        // Create test files
        await writeFile(resolve(tmpDir, "file1.ts"), "export type A = string;");
        await writeFile(resolve(tmpDir, "file2.ts"), "export type B = number;");
        await writeFile(resolve(tmpDir, "file3.tsx"), "export type C = boolean;");
        await writeFile(resolve(tmpDir, "file4.js"), "// not typescript");

        const files = await expandFilePaths([tmpDir]);

        expect(files).toHaveLength(3);
        expect(files).toContain(resolve(tmpDir, "file1.ts"));
        expect(files).toContain(resolve(tmpDir, "file2.ts"));
        expect(files).toContain(resolve(tmpDir, "file3.tsx"));
        expect(files).not.toContain(resolve(tmpDir, "file4.js"));
    });

    it("should expand nested directory paths", async () => {
        // Create nested structure
        await mkdir(resolve(tmpDir, "src"), { recursive: true });
        await mkdir(resolve(tmpDir, "src/lib"), { recursive: true });
        await writeFile(resolve(tmpDir, "src/file1.ts"), "export type A = string;");
        await writeFile(resolve(tmpDir, "src/lib/file2.ts"), "export type B = number;");

        const files = await expandFilePaths([tmpDir]);

        expect(files).toHaveLength(2);
        expect(files).toContain(resolve(tmpDir, "src/file1.ts"));
        expect(files).toContain(resolve(tmpDir, "src/lib/file2.ts"));
    });

    it("should handle individual file paths", async () => {
        await writeFile(resolve(tmpDir, "file1.ts"), "export type A = string;");
        await writeFile(resolve(tmpDir, "file2.ts"), "export type B = number;");

        const files = await expandFilePaths([resolve(tmpDir, "file1.ts")]);

        expect(files).toHaveLength(1);
        expect(files).toContain(resolve(tmpDir, "file1.ts"));
    });

    it("should handle glob patterns", async () => {
        await mkdir(resolve(tmpDir, "src"), { recursive: true });
        await writeFile(resolve(tmpDir, "src/file1.ts"), "export type A = string;");
        await writeFile(resolve(tmpDir, "src/file2.tsx"), "export type B = number;");
        await writeFile(resolve(tmpDir, "src/file3.js"), "// not typescript");

        const files = await expandFilePaths([resolve(tmpDir, "src/*.ts")]);

        expect(files).toHaveLength(1);
        expect(files).toContain(resolve(tmpDir, "src/file1.ts"));
    });

    it("should handle multiple paths", async () => {
        await mkdir(resolve(tmpDir, "dir1"), { recursive: true });
        await mkdir(resolve(tmpDir, "dir2"), { recursive: true });
        await writeFile(resolve(tmpDir, "dir1/file1.ts"), "export type A = string;");
        await writeFile(resolve(tmpDir, "dir2/file2.ts"), "export type B = number;");

        const files = await expandFilePaths([resolve(tmpDir, "dir1"), resolve(tmpDir, "dir2")]);

        expect(files).toHaveLength(2);
        expect(files).toContain(resolve(tmpDir, "dir1/file1.ts"));
        expect(files).toContain(resolve(tmpDir, "dir2/file2.ts"));
    });

    it("should deduplicate files from overlapping paths", async () => {
        await writeFile(resolve(tmpDir, "file1.ts"), "export type A = string;");

        const files = await expandFilePaths([resolve(tmpDir, "file1.ts"), resolve(tmpDir, "file1.ts")]);

        expect(files).toHaveLength(1);
        expect(files).toContain(resolve(tmpDir, "file1.ts"));
    });

    it("should handle many files concurrently", async () => {
        // Create 50 test files to ensure concurrent processing is tested
        const fileCount = 50;
        const promises = [];
        for (let i = 0; i < fileCount; i++) {
            promises.push(writeFile(resolve(tmpDir, `file${i}.ts`), `export type Type${i} = string;`));
        }
        await Promise.all(promises);

        const startTime = Date.now();
        const files = await expandFilePaths([tmpDir]);
        const duration = Date.now() - startTime;

        expect(files).toHaveLength(fileCount);
        // Concurrent processing should complete relatively quickly (under 1 second for 50 files)
        expect(duration).toBeLessThan(1000);
    });

    it("should return sorted file paths", async () => {
        await writeFile(resolve(tmpDir, "file3.ts"), "export type C = string;");
        await writeFile(resolve(tmpDir, "file1.ts"), "export type A = string;");
        await writeFile(resolve(tmpDir, "file2.ts"), "export type B = string;");

        const files = await expandFilePaths([tmpDir]);

        expect(files).toHaveLength(3);
        // Check that files are sorted
        expect(files[0]).toContain("file1.ts");
        expect(files[1]).toContain("file2.ts");
        expect(files[2]).toContain("file3.ts");
    });
});
