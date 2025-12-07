import { SyntaxKind, type SourceFile } from "ts-morph";
import { createOpenApiSchema as codegen } from "./codegen";
import { createOpenApiSchema } from "../../openApiSchema/index";
import type { WizPluginContext } from "..";


export function transformOpenApiSchema(sourceFile: SourceFile, { log, path, opt }: WizPluginContext) {

    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(call => (call.getExpression()).getText() === createOpenApiSchema.name && call.getTypeArguments().length === 1);

    if (calls.length === 0) return;

    for (const call of calls) {
        log(`Transforming createOpenApiSchema call at ${path}:${call.getStartLineNumber()}:${call.getStartLinePos()}`);
        // FIXME guard instead of using non-null assertion
        const typeArg = call.getTypeArguments()[0]!;
        const type = typeArg.getType();
        const schema = codegen(type, {
            settings: {
                coerceSymbolsToStrings: Boolean(opt?.coerceSymbolsToStrings)
            }
        });

        // Replace the call expression with a literal object representing the schema
        call.replaceWithText(JSON.stringify(schema, null, 2));
    }
}