import { Project, SourceFile } from "ts-morph";
import ts from "typescript";

import { transformOpenApiSchema } from "./openApiSchema/transform";

export type WizPluginOptions = {
    log?: boolean
    coerceSymbolsToStrings?: boolean
}

export type WizPluginContext = {
    opt: WizPluginOptions;
    path: string;
    log: (...args: any[]) => void;
}

export type WizTransformer = (src: SourceFile, context: WizPluginContext) => void | Promise<void>;


const wizPlugin: (opt?: WizPluginOptions) => Bun.BunPlugin = (opt = {}) => {
    const log = opt.log ? (...args: any) => console.log("[wiz]", ...args) : () => { };

    return {
        name: "bun-generate-schema",
        setup(build) {
            log("Plugin initialized with options:", JSON.stringify(opt));
            build.onLoad({ filter: /\.tsx?$/ }, async (args) => {
                log(`Processing file: ${args.path}`);

                const source = await Bun.file(args.path).text();

                const project = new Project({
                    compilerOptions: {
                        target: ts.ScriptTarget.ESNext,
                        strict: true,
                        esModuleInterop: true,
                        allowJs: true,
                        skipLibCheck: true,
                    },
                    useInMemoryFileSystem: true,
                });

                const sourceFile = project.createSourceFile(args.path, source, { overwrite: true });

                transformOpenApiSchema(sourceFile, { log, opt,path:args.path });

                return {
                    contents: sourceFile.getFullText(),
                    loader: args.path.endsWith(".ts") ? "ts" : "js",
                };
            });
        },
    }
}

export default wizPlugin;

if (import.meta.main) Bun.plugin(wizPlugin());
