import { rmdir } from "fs/promises";
import wizPlugin from '../plugin/index.ts';

const DEBUG = true

export function dedent(str: string) {
    return str.split(/\r?\n\r?/).map(line => line.trim()).join('\n').trim();
}

export async function compile(source: string) {
    const src = `${import.meta.dir}/.tmp/src.ts`
    await Bun.write(src, dedent(source));

    const build = await Bun.build({
        entrypoints: [src],
        outdir: `${import.meta.dir}/.tmp/out`,
        throw: true,
        minify: false,
        format: 'esm',
        root: `${import.meta.dir}/.tmp`,
        packages: 'external',
        sourcemap: 'none',
        plugins: [wizPlugin({ log: DEBUG })]

    });

    if (DEBUG)
        build.logs.forEach(l => console.log(l.level, l.name, l.message, l.position));

    const code = await Bun.file(`${import.meta.dir}/.tmp/out/src.js`).text();

    if (!DEBUG)
        rmdir(`${import.meta.dir}/.tmp`, { recursive: true });

    return dedent(code);
}