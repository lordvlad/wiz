import { rmdir } from "fs/promises";

import wizPlugin, { type WizPluginOptions } from "../plugin/index.ts";

const DEBUG = true;

export function dedent(str: string) {
    return str
        .split(/\r?\n\r?/)
        .map((line) => line.trim())
        .join("\n")
        .trim();
}

export async function compile(source: string, pluginOptions: WizPluginOptions = {}) {
    const src = `${import.meta.dir}/.tmp/src.ts`;
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

    if (!DEBUG) rmdir(`${import.meta.dir}/.tmp`, { recursive: true });

    return dedent(code);
}
