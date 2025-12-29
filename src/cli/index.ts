#!/usr/bin/env bun
import { parseArgs } from "util";

import { inlineValidators } from "./inline";
import { generateOpenApi } from "./openapi";

const HELP_TEXT = `
wiz - TypeScript schema generation toolkit

Usage:
  wiz <command> [options]

Commands:
  openapi [files...]     Generate OpenAPI specifications from TypeScript files
  inline [files...]      Transform validator calls to inline validators

OpenAPI Options:
  --format <format>      Output format: json or yaml (default: yaml)

Inline Options:
  --outdir <directory>   Output directory for transformed files (required)

Examples:
  # Generate OpenAPI spec from directory (YAML output)
  wiz openapi src/

  # Generate OpenAPI spec with JSON output
  wiz openapi src/types.ts --format json

  # Generate from multiple sources
  wiz openapi src/models/ src/api.ts

  # Transform validators to inline
  wiz inline src/ --outdir dist/

  # Transform specific files
  wiz inline src/validators.ts --outdir dist/

For more information, visit: https://github.com/lordvlad/wiz
`;

async function main() {
    const rawArgs = process.argv.slice(2);

    if (rawArgs.length === 0 || rawArgs[0] === "--help" || rawArgs[0] === "-h") {
        console.log(HELP_TEXT);
        process.exit(0);
    }

    const command = rawArgs[0];

    // Parse arguments based on command
    if (command === "openapi") {
        const { values, positionals } = parseArgs({
            args: rawArgs.slice(1),
            options: {
                format: {
                    type: "string",
                    default: "yaml",
                },
            },
            allowPositionals: true,
        });

        const format = values.format as "json" | "yaml";
        if (format !== "json" && format !== "yaml") {
            console.error(`Error: Invalid format "${format}". Must be "json" or "yaml".`);
            process.exit(1);
        }

        if (positionals.length === 0) {
            console.error("Error: No files or directories specified");
            console.error("Usage: wiz openapi [files|dirs|globs...] [--format json|yaml]");
            process.exit(1);
        }

        await generateOpenApi(positionals, { format });
    } else if (command === "inline") {
        const { values, positionals } = parseArgs({
            args: rawArgs.slice(1),
            options: {
                outdir: {
                    type: "string",
                },
            },
            allowPositionals: true,
        });

        const outdir = values.outdir;
        if (!outdir) {
            console.error("Error: --outdir is required");
            console.error("Usage: wiz inline [files|dirs|globs...] --outdir <directory>");
            process.exit(1);
        }

        if (positionals.length === 0) {
            console.error("Error: No files or directories specified");
            console.error("Usage: wiz inline [files|dirs|globs...] --outdir <directory>");
            process.exit(1);
        }

        await inlineValidators(positionals, { outdir });
    } else if (command === "help" || command === "--help" || command === "-h") {
        console.log(HELP_TEXT);
    } else {
        console.error(`Error: Unknown command "${command}"`);
        console.error("");
        console.log(HELP_TEXT);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Error:", error.message || error);
    process.exit(1);
});
