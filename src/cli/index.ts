#!/usr/bin/env bun
import { parseArgs } from "util";

import { generateClient } from "./client";
import { generateModels } from "./generate";
import { inlineValidators } from "./inline";
import { generateOpenApi } from "./openapi";
import { generateProtobuf } from "./protobuf";

const HELP_TEXT = `
wiz - TypeScript schema generation toolkit

Usage:
  wiz <command> [options]

Commands:
  openapi [files...]     Generate OpenAPI specifications from TypeScript files
  protobuf [files...]    Generate Protobuf specifications from TypeScript files
  model <spec-file>      Generate TypeScript models from OpenAPI or Protobuf spec
  client <spec-file>     Generate TypeScript client from OpenAPI specification
  inline [files...]      Transform validator calls to inline validators

Global Options:
  --debug                Enable detailed debug logging to stderr

OpenAPI Options:
  --format <format>      Output format: json or yaml (default: yaml)

Protobuf Options:
  --format <format>      Output format: json or proto (default: proto)

Model Options:
  --outdir <directory>   Output directory for generated types (default: stdout)
  --tags                 Include tags from src/tags/index.ts in JSDoc
  --no-wiz-tags          Disable automatic wiz tag generation from x-wiz-* extensions

Client Options:
  --outdir <directory>   Output directory for generated client (default: stdout)
                         If provided, generates model.ts and api.ts files
  --wiz-validator        Enable wiz validation for path params, query params,
                         request body, and response body
  --react-query          Enable React Query integration with context, query/mutation
                         options methods, and custom hooks

Inline Options:
  --outdir <directory>   Output directory for transformed files
  --in-place             Transform files in place (mutually exclusive with --outdir)

Examples:
  # Generate OpenAPI spec from directory (YAML output)
  wiz openapi src/

  # Generate OpenAPI spec with JSON output
  wiz openapi src/types.ts --format json

  # Generate from multiple sources
  wiz openapi src/models/ src/api.ts

  # Generate Protobuf spec (proto format)
  wiz protobuf src/

  # Generate Protobuf spec with JSON output
  wiz protobuf src/types.ts --format json

  # Generate TypeScript models from OpenAPI spec (print to stdout)
  wiz model spec.yaml

  # Generate TypeScript models from OpenAPI spec (write to directory)
  wiz model spec.json --outdir src/models

  # Generate TypeScript models with tags
  wiz model spec.yaml --tags --outdir src/models

  # Generate TypeScript models without wiz tag types
  wiz model spec.yaml --no-wiz-tags --outdir src/models

  # Generate TypeScript models from Protobuf (auto-detected from .proto extension)
  wiz model api.proto --outdir src/models

  # Generate TypeScript client from OpenAPI spec (print to stdout)
  wiz client spec.yaml

  # Generate TypeScript client from OpenAPI spec (write to directory)
  wiz client spec.json --outdir src/client

  # Generate TypeScript client with wiz validation
  wiz client spec.json --outdir src/client --wiz-validator

  # Generate TypeScript client with React Query integration
  wiz client spec.json --outdir src/client --react-query

  # Transform validators to inline (output to different directory)
  wiz inline src/ --outdir dist/

  # Transform validators in place
  wiz inline src/ --in-place

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
                debug: {
                    type: "boolean",
                    default: false,
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
            console.error("Usage: wiz openapi [files|dirs|globs...] [--format json|yaml] [--debug]");
            process.exit(1);
        }

        await generateOpenApi(positionals, { format, debug: values.debug });
    } else if (command === "protobuf") {
        const { values, positionals } = parseArgs({
            args: rawArgs.slice(1),
            options: {
                format: {
                    type: "string",
                    default: "proto",
                },
                debug: {
                    type: "boolean",
                    default: false,
                },
            },
            allowPositionals: true,
        });

        const format = values.format as "json" | "proto";
        if (format !== "json" && format !== "proto") {
            console.error(`Error: Invalid format "${format}". Must be "json" or "proto".`);
            process.exit(1);
        }

        if (positionals.length === 0) {
            console.error("Error: No files or directories specified");
            console.error("Usage: wiz protobuf [files|dirs|globs...] [--format json|proto] [--debug]");
            process.exit(1);
        }

        await generateProtobuf(positionals, { format, debug: values.debug });
    } else if (command === "inline") {
        const { values, positionals } = parseArgs({
            args: rawArgs.slice(1),
            options: {
                outdir: {
                    type: "string",
                },
                "in-place": {
                    type: "boolean",
                },
                debug: {
                    type: "boolean",
                    default: false,
                },
            },
            allowPositionals: true,
        });

        const outdir = values.outdir;
        const inPlace = values["in-place"];

        // Validate mutually exclusive options
        if (outdir && inPlace) {
            console.error("Error: --outdir and --in-place are mutually exclusive");
            console.error("Usage: wiz inline [files|dirs|globs...] (--outdir <directory> | --in-place) [--debug]");
            process.exit(1);
        }

        if (!outdir && !inPlace) {
            console.error("Error: Either --outdir or --in-place is required");
            console.error("Usage: wiz inline [files|dirs|globs...] (--outdir <directory> | --in-place) [--debug]");
            process.exit(1);
        }

        if (positionals.length === 0) {
            console.error("Error: No files or directories specified");
            console.error("Usage: wiz inline [files|dirs|globs...] (--outdir <directory> | --in-place) [--debug]");
            process.exit(1);
        }

        await inlineValidators(positionals, { outdir, inPlace, debug: values.debug });
    } else if (command === "model") {
        // Handle model command
        const { values, positionals } = parseArgs({
            args: rawArgs.slice(1),
            options: {
                outdir: {
                    type: "string",
                },
                tags: {
                    type: "boolean",
                },
                "no-wiz-tags": {
                    type: "boolean",
                },
                debug: {
                    type: "boolean",
                    default: false,
                },
            },
            allowPositionals: true,
        });

        if (positionals.length === 0) {
            console.error("Error: No spec file specified");
            console.error("Usage: wiz model <spec-file> [--outdir <dir>] [--tags] [--no-wiz-tags] [--debug]");
            process.exit(1);
        }

        const specFile = positionals[0]!;
        const outdir = values.outdir;
        const tags = values.tags || false;
        const disableWizTags = values["no-wiz-tags"] || false;

        await generateModels(specFile, { outdir, tags, disableWizTags, debug: values.debug });
    } else if (command === "client") {
        // Handle client command
        const { values, positionals } = parseArgs({
            args: rawArgs.slice(1),
            options: {
                outdir: {
                    type: "string",
                },
                "wiz-validator": {
                    type: "boolean",
                },
                "react-query": {
                    type: "boolean",
                },
                debug: {
                    type: "boolean",
                    default: false,
                },
            },
            allowPositionals: true,
        });

        if (positionals.length === 0) {
            console.error("Error: No spec file specified");
            console.error("Usage: wiz client <spec-file> [--outdir <dir>] [--wiz-validator] [--react-query] [--debug]");
            process.exit(1);
        }

        const specFile = positionals[0]!;
        const outdir = values.outdir;
        const wizValidator = values["wiz-validator"] || false;
        const reactQuery = values["react-query"] || false;

        await generateClient(specFile, { outdir, wizValidator, reactQuery, debug: values.debug });
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
