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

/**
 * Deep compare two values, treating oneOf/anyOf arrays as unordered sets
 * Returns { matches: true } or { matches: false, path, actual, expected } for debugging
 */
export function schemaMatches(
    actual: any,
    expected: any,
    path: string = "",
): { matches: true } | { matches: false; path: string; actual: any; expected: any } {
    if (actual === expected) return { matches: true };
    if (actual === null || expected === null) {
        if (actual === expected) return { matches: true };
        return { matches: false, path, actual, expected };
    }
    if (typeof actual !== typeof expected) {
        return { matches: false, path, actual, expected };
    }

    if (Array.isArray(expected)) {
        if (!Array.isArray(actual)) {
            return { matches: false, path, actual, expected };
        }
        if (actual.length !== expected.length) {
            return { matches: false, path: `${path}.length`, actual: actual.length, expected: expected.length };
        }
        // For arrays, check that every expected element has a matching actual element
        const actualCopy = [...actual];
        for (let i = 0; i < expected.length; i++) {
            const exp = expected[i];
            const idx = actualCopy.findIndex((act) => schemaMatches(act, exp).matches);
            if (idx === -1) {
                return { matches: false, path: `${path}[${i}]`, actual: actual, expected: exp };
            }
            actualCopy.splice(idx, 1);
        }
        return { matches: true };
    }

    if (typeof expected === "object") {
        if (typeof actual !== "object") {
            return { matches: false, path, actual, expected };
        }
        // Check all expected keys exist in actual with matching values
        for (const key of Object.keys(expected)) {
            if (!(key in actual)) {
                return { matches: false, path: `${path}.${key}`, actual: undefined, expected: expected[key] };
            }
            const result = schemaMatches(actual[key], expected[key], `${path}.${key}`);
            if (!result.matches) return result;
        }
        return { matches: true };
    }

    return { matches: false, path, actual, expected };
}
