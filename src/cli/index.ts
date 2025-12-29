#!/usr/bin/env bun
import { generateOpenApi } from "./openapi";
import { inlineValidators } from "./inline";

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
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
        console.log(HELP_TEXT);
        process.exit(0);
    }

    const command = args[0];
    const commandArgs = args.slice(1);

    switch (command) {
        case "openapi": {
            const formatIndex = commandArgs.indexOf("--format");
            let format: "json" | "yaml" = "yaml";
            const paths: string[] = [];

            for (let i = 0; i < commandArgs.length; i++) {
                if (commandArgs[i] === "--format") {
                    const formatValue = commandArgs[i + 1];
                    if (formatValue === "json" || formatValue === "yaml") {
                        format = formatValue;
                    } else {
                        console.error(`Error: Invalid format "${formatValue}". Must be "json" or "yaml".`);
                        process.exit(1);
                    }
                    i++; // Skip the next arg
                } else if (!commandArgs[i].startsWith("-")) {
                    paths.push(commandArgs[i]);
                }
            }

            if (paths.length === 0) {
                console.error("Error: No files or directories specified");
                console.error("Usage: wiz openapi [files|dirs|globs...] [--format json|yaml]");
                process.exit(1);
            }

            await generateOpenApi(paths, { format });
            break;
        }

        case "inline": {
            const outdirIndex = commandArgs.indexOf("--outdir");
            let outdir: string | undefined;
            const paths: string[] = [];

            for (let i = 0; i < commandArgs.length; i++) {
                if (commandArgs[i] === "--outdir") {
                    outdir = commandArgs[i + 1];
                    i++; // Skip the next arg
                } else if (!commandArgs[i].startsWith("-")) {
                    paths.push(commandArgs[i]);
                }
            }

            if (paths.length === 0 || !outdir) {
                console.error("Error: Missing required arguments");
                console.error("Usage: wiz inline [files|dirs|globs...] --outdir <directory>");
                process.exit(1);
            }

            await inlineValidators(paths, { outdir });
            break;
        }

        case "help":
        case "--help":
        case "-h":
            console.log(HELP_TEXT);
            break;

        default:
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
