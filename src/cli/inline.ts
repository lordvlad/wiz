#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve, relative } from "path";

import wizPlugin from "../plugin/index";

import { expandFilePaths } from "./utils";

interface InlineOptions {
    outdir?: string;
}

/**
 * Transform validator calls to inline validators.
 */
export async function inlineValidators(paths: string[], options: InlineOptions = {}): Promise<void> {
    if (paths.length === 0) {
        console.error("Error: No files or directories specified");
        process.exit(1);
    }

    const outdir = options.outdir ? resolve(process.cwd(), options.outdir) : undefined;

    if (!outdir) {
        console.error("Error: --outdir is required");
        process.exit(1);
    }

    const files = await expandFilePaths(paths);

    if (files.length === 0) {
        console.error("Error: No TypeScript files found");
        process.exit(1);
    }

    console.log(`Processing ${files.length} file(s)...`);

    let processed = 0;
    let errors = 0;

    for (const file of files) {
        try {
            await transformFile(file, outdir);
            processed++;
            console.log(`✓ ${relative(process.cwd(), file)}`);
        } catch (error) {
            errors++;
            console.error(`✗ ${relative(process.cwd(), file)}: ${error}`);
        }
    }

    console.log(`\nProcessed: ${processed} file(s)`);
    if (errors > 0) {
        console.log(`Errors: ${errors} file(s)`);
        process.exit(1);
    }
}

/**
 * Transform a single file and write to output directory.
 */
async function transformFile(filePath: string, outdir: string): Promise<void> {
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

        // Determine output file path (maintain relative structure)
        const cwd = process.cwd();
        const relPath = relative(cwd, filePath);
        const outPath = resolve(outdir, relPath);

        // Create output directory
        await mkdir(dirname(outPath), { recursive: true });

        // Write transformed file (change extension to .js)
        const outPathJs = outPath.replace(/\.tsx?$/, ".js");
        await writeFile(outPathJs, transformed);
    } finally {
        // Clean up tmp directory
        await Bun.$`rm -rf ${tmpDir}`.quiet();
    }
}

// CLI entry point
if (import.meta.main) {
    const args = process.argv.slice(2);
    const outdirIndex = args.indexOf("--outdir");
    let outdir: string | undefined;
    const paths: string[] = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--outdir") {
            outdir = args[i + 1];
            i++; // Skip the next arg
        } else if (!args[i].startsWith("-")) {
            paths.push(args[i]);
        }
    }

    if (paths.length === 0 || !outdir) {
        console.error("Usage: wiz inline [files|dirs|globs...] --outdir <directory>");
        console.error("");
        console.error("Examples:");
        console.error("  wiz inline src/ --outdir dist/");
        console.error("  wiz inline src/validators.ts --outdir dist/");
        console.error('  wiz inline "src/**/*.ts" --outdir dist/');
        process.exit(1);
    }

    await inlineValidators(paths, { outdir });
}
