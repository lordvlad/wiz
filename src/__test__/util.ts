import { mkdir } from "fs/promises";
import { Project, type SourceFile, SyntaxKind } from "ts-morph";

import wizPlugin, { type WizPluginOptions } from "../plugin/index.ts";

const DEBUG = false;

export function dedent(str: string) {
    return str
        .split(/\r?\n\r?/)
        .map((line) => line.trim())
        .join("\n")
        .trim();
}

export async function compile(source: string, pluginOptions: WizPluginOptions = {}) {
    const src = `${import.meta.dir}/.tmp/src.ts`;
    await mkdir(`${import.meta.dir}/.tmp`, { recursive: true });
    await Bun.write(src, dedent(source));

    const build = await Bun.build({
        entrypoints: [src],
        outdir: `${import.meta.dir}/.tmp/out`,
        throw: false,
        minify: false,
        format: "esm",
        root: `${import.meta.dir}/.tmp`,
        packages: "external",
        sourcemap: "none",
        plugins: [wizPlugin({ log: DEBUG, ...pluginOptions })],
    });

    if (DEBUG) build.logs.forEach((l) => console.log(l.level, l.name, l.message, l.position));

    if (!build.success) {
        const message =
            build.logs
                .map((l) => l.message)
                .filter(Boolean)
                .join("\n") || "Bundle failed";
        throw new Error(message);
    }

    const code = await Bun.file(`${import.meta.dir}/.tmp/out/src.js`).text();

    return dedent(code);
}

/**
 * Parse compiled JavaScript code into a ts-morph SourceFile
 */
export function parseOutput(code: string): SourceFile {
    const project = new Project({ useInMemoryFileSystem: true });
    return project.createSourceFile("output.js", code);
}

/**
 * Find a variable declaration by name in a SourceFile
 */
export function findVariableDeclaration(sourceFile: SourceFile, name: string) {
    const declarations = sourceFile.getVariableDeclarations();
    const declaration = declarations.find((d) => d.getName() === name);
    if (!declaration) {
        throw new Error(`Variable declaration '${name}' not found`);
    }
    return declaration;
}

/**
 * Extract a literal value from an AST node
 * Handles object literals, arrays, strings, numbers, booleans, etc.
 */
export function extractValue(node: any): any {
    if (!node) return undefined;

    const kind = node.getKind();

    switch (kind) {
        case SyntaxKind.ObjectLiteralExpression: {
            const obj: Record<string, any> = {};
            for (const prop of node.getProperties()) {
                if (prop.getKind() === SyntaxKind.PropertyAssignment) {
                    const name = prop.getName();
                    const initializer = prop.getInitializer();
                    obj[name] = extractValue(initializer);
                } else if (prop.getKind() === SyntaxKind.ShorthandPropertyAssignment) {
                    const name = prop.getName();
                    obj[name] = name; // For shorthand, value is same as key
                }
            }
            return obj;
        }

        case SyntaxKind.ArrayLiteralExpression: {
            return node.getElements().map((element: any) => extractValue(element));
        }

        case SyntaxKind.StringLiteral:
            return node.getLiteralValue();

        case SyntaxKind.NumericLiteral:
            return node.getLiteralValue();

        case SyntaxKind.TrueKeyword:
            return true;

        case SyntaxKind.FalseKeyword:
            return false;

        case SyntaxKind.NullKeyword:
            return null;

        case SyntaxKind.Identifier:
            // For identifiers like 'undefined', return the text
            return node.getText();

        default:
            // For other cases, try to get literal text
            return node.getText();
    }
}
