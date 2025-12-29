#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve, relative } from "path";

import wizPlugin from "../plugin/index";
import { expandFilePaths } from "./utils";

interface InlineOptions {
    outdir?: string;
    inPlace?: boolean;
}

/**
 * Transform validator calls to inline validators.
 */
export async function inlineValidators(paths: string[], options: InlineOptions = {}): Promise<void> {
    if (paths.length === 0) {
        console.error("Error: No files or directories specified");
        process.exit(1);
    }

    const { outdir, inPlace } = options;

    // Validate options
    if (!outdir && !inPlace) {
        console.error("Error: Either --outdir or --in-place is required");
        process.exit(1);
    }

    if (outdir && inPlace) {
        console.error("Error: --outdir and --in-place are mutually exclusive");
        process.exit(1);
    }

    const resolvedOutdir = outdir ? resolve(process.cwd(), outdir) : undefined;

    const files = await expandFilePaths(paths);

    if (files.length === 0) {
        console.error("Error: No TypeScript files found");
        process.exit(1);
    }

    console.log(`Processing ${files.length} file(s)...`);

    // Transform files in parallel
    const results = await Promise.allSettled(
        files.map(async (file) => {
            await transformFile(file, resolvedOutdir, inPlace);
            return { file, success: true };
        }),
    );

    let processed = 0;
    let errors = 0;

    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const file = files[i];
        if (result.status === "fulfilled") {
            processed++;
            console.log(`✓ ${relative(process.cwd(), file)}`);
        } else {
            errors++;
            console.error(`✗ ${relative(process.cwd(), file)}: ${result.reason}`);
        }
    }

    console.log(`\nProcessed: ${processed} file(s)`);
    if (errors > 0) {
        console.log(`Errors: ${errors} file(s)`);
        process.exit(1);
    }
}

/**
 * Transform a single file and write to output directory or in-place.
 */
async function transformFile(filePath: string, outdir: string | undefined, inPlace?: boolean): Promise<void> {
    // Read source file
    const source = await Bun.file(filePath).text();

    // Create temporary directory for building
    const tmpDir = resolve(process.cwd(), ".tmp", "cli-inline-" + Date.now());
    await mkdir(tmpDir, { recursive: true });

    try {
        const tmpFile = resolve(tmpDir, "source.ts");
        await writeFile(tmpFile, source);

        // Build with wiz plugin
        const tmpOutDir = resolve(tmpDir, "out");
        const build = await Bun.build({
            entrypoints: [tmpFile],
            outdir: tmpOutDir,
            throw: false,
            minify: false,
            format: "esm",
            root: tmpDir,
            packages: "external",
            sourcemap: "none",
            plugins: [wizPlugin({ log: false })],
        });

        if (!build.success) {
            const message =
                build.logs
                    .map((l) => l.message)
                    .filter(Boolean)
                    .join("\n") || "Bundle failed";
            throw new Error(message);
        }

        // Read transformed output
        const outFile = resolve(tmpOutDir, "source.js");
        const transformed = await Bun.file(outFile).text();

        if (inPlace) {
            // Write back to the original file
            await writeFile(filePath, transformed);
        } else {
            // Determine output file path (maintain relative structure)
            const cwd = process.cwd();
            const relPath = relative(cwd, filePath);
            const outPath = resolve(outdir!, relPath);

            // Create output directory
            await mkdir(dirname(outPath), { recursive: true });

            // Write transformed file (keep original extension)
            await writeFile(outPath, transformed);
        }
    } finally {
        // Clean up tmp directory
        await Bun.$`rm -rf ${tmpDir}`.quiet();
    }
}
