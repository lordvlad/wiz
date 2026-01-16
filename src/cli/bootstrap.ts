#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";

import { DebugLogger } from "./utils";

interface BootstrapOptions {
    outdir: string;
    debug?: boolean;
}

/**
 * Bootstrap OpenAPI client templates to a directory
 */
export async function bootstrapTemplates(templateName: string, options: BootstrapOptions): Promise<void> {
    const debug = new DebugLogger(options.debug || false);

    debug.group("Command Arguments");
    debug.log("Command: bootstrap");
    debug.log("Template:", templateName);
    debug.log("Output directory:", options.outdir);
    debug.log("Debug enabled:", options.debug || false);

    if (templateName !== "openapi-client-templates") {
        throw new Error(
            `Unknown template type: ${templateName}. Currently only "openapi-client-templates" is supported.`,
        );
    }

    // Create output directory
    await mkdir(options.outdir, { recursive: true });

    debug.group("Bootstrapping Templates");
    debug.log("Creating template directories...");

    // Create subdirectories for each template
    const fetchDir = resolve(options.outdir, "fetch");
    const reactQueryDir = resolve(options.outdir, "react-query");

    await mkdir(fetchDir, { recursive: true });
    await mkdir(reactQueryDir, { recursive: true });

    // Write README for fetch template
    const fetchReadme = `# Fetch Template

This is the default fetch-based OpenAPI client template for Wiz.

## Structure

This template generates:
- \`model.ts\`: TypeScript type definitions from OpenAPI schemas
- \`api.ts\`: API client with fetch-based methods

## Customization

You can modify this template by editing the files in this directory.
To use your custom template:

\`\`\`bash
wiz client spec.yaml --template ./path/to/your/custom/fetch --outdir src/client
\`\`\`

## Template Variables

The generator provides the following context:
- Operations extracted from the OpenAPI spec
- Type information from schemas
- Configuration options (baseUrl, headers, etc.)

Note: This template uses the Wiz generator's built-in code generation logic.
Full template customization (with custom code generation) will be available in a future version.
`;

    await writeFile(resolve(fetchDir, "README.md"), fetchReadme);
    console.log(`✓ Created ${resolve(fetchDir, "README.md")}`);

    // Write README for react-query template
    const reactQueryReadme = `# React Query Template

This template generates an OpenAPI client with React Query integration.

## Structure

This template generates:
- \`model.ts\`: TypeScript type definitions from OpenAPI schemas
- \`api.ts\`: API client with fetch-based methods and React context
- \`queries.ts\`: React Query hooks for GET/HEAD/OPTIONS operations
- \`mutations.ts\`: React Query hooks for POST/PUT/PATCH/DELETE operations

## Features

- \`ApiContext\` and \`ApiProvider\` for configuration
- \`useApiConfig\` hook for accessing configuration
- Query options methods (\`get{MethodName}QueryOptions\`)
- Mutation options methods (\`get{MethodName}MutationOptions\`)
- Custom hooks (\`use{MethodName}\`) for each operation

## Customization

You can modify this template by editing the files in this directory.
To use your custom template:

\`\`\`bash
wiz client spec.yaml --template ./path/to/your/custom/react-query --outdir src/client
\`\`\`

## Template Variables

The generator provides the following context:
- Operations extracted from the OpenAPI spec
- Type information from schemas
- Configuration options (baseUrl, headers, etc.)
- React Query specific options

Note: This template uses the Wiz generator's built-in code generation logic.
Full template customization (with custom code generation) will be available in a future version.
`;

    await writeFile(resolve(reactQueryDir, "README.md"), reactQueryReadme);
    console.log(`✓ Created ${resolve(reactQueryDir, "README.md")}`);

    // Write template info files
    const fetchInfo = {
        name: "fetch",
        description: "Default fetch-based API client template",
        version: "1.0.0",
        generator: "built-in",
    };

    const reactQueryInfo = {
        name: "react-query",
        description: "React Query integration template",
        version: "1.0.0",
        generator: "built-in",
        dependencies: ["@tanstack/react-query", "react"],
    };

    await writeFile(resolve(fetchDir, "template.json"), JSON.stringify(fetchInfo, null, 2));
    console.log(`✓ Created ${resolve(fetchDir, "template.json")}`);

    await writeFile(resolve(reactQueryDir, "template.json"), JSON.stringify(reactQueryInfo, null, 2));
    console.log(`✓ Created ${resolve(reactQueryDir, "template.json")}`);

    console.log(`\n✅ Templates bootstrapped to ${options.outdir}`);
    console.log(`\nTo use these templates:`);
    console.log(`  wiz client spec.yaml --template fetch --outdir src/client`);
    console.log(`  wiz client spec.yaml --template react-query --outdir src/client`);
    console.log(`\nNote: Current version uses built-in generators. Full template customization coming soon.`);
}
