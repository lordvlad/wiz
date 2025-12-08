import { SyntaxKind, type SourceFile } from "ts-morph";
import { createOpenApiSchema as codegen } from "./codegen";
import { createOpenApiSchema } from "../../openApiSchema/index";
import type { WizPluginContext } from "..";

// Type for individual schema in components.schemas
type SchemaValue = {
    type?: string;
    properties?: Record<string, unknown>;
    items?: unknown;
    enum?: unknown[];
    required?: string[];
    title?: string;
    [key: string]: unknown;
};

export function transformOpenApiSchema(sourceFile: SourceFile, { log, path, opt }: WizPluginContext) {

    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(call => (call.getExpression()).getText() === createOpenApiSchema.name && call.getTypeArguments().length === 1);

    if (calls.length === 0) return;

    for (const call of calls) {
        log(`Transforming createOpenApiSchema call at ${path}:${call.getStartLineNumber()}:${call.getStartLinePos()}`);
        // FIXME guard instead of using non-null assertion
        const typeArg = call.getTypeArguments()[0]!;
        const type = typeArg.getType();
        
        // Check if this is a tuple type (array of types)
        if (type.isTuple()) {
            // Generate composite schema with components.schemas
            const tupleElements = type.getTupleElements();
            const schemas: Record<string, SchemaValue> = {};
            
            for (const element of tupleElements) {
                // Get the alias symbol for the type name (User, Product, etc.)
                const aliasSymbol = element.getAliasSymbol();
                let typeName = aliasSymbol?.getName();
                
                // Fallback to element.getText() if no alias symbol exists
                if (!typeName) {
                    typeName = element.getText();
                    // Clean up the type name if it contains formatting or whitespace
                    typeName = typeName.replace(/\s+/g, '');
                }
                
                // Pass undefined for typeNode to avoid duplicate title generation in codegen.
                // The codegen function adds a 'title' field when typeNode is provided,
                // but for composite schemas we want to control title placement ourselves.
                const schema = codegen(element, {
                    typeNode: undefined,
                    settings: {
                        coerceSymbolsToStrings: Boolean(opt?.coerceSymbolsToStrings),
                        transformDate: opt?.transformDate
                    }
                });
                
                // Add title to the schema if not already present
                const schemaObj = schema as SchemaValue;
                if (typeof schemaObj === 'object' && schemaObj !== null && !('title' in schemaObj)) {
                    schemaObj.title = typeName;
                }
                
                schemas[typeName] = schemaObj;
            }
            
            const compositeSchema = {
                components: {
                    schemas
                }
            };
            
            call.replaceWithText(JSON.stringify(compositeSchema, null, 2));
        } else {
            // Single type - maintain backward compatibility
            const schema = codegen(type, {
                typeNode: typeArg,
                settings: {
                    coerceSymbolsToStrings: Boolean(opt?.coerceSymbolsToStrings),
                    transformDate: opt?.transformDate
                }
            });

            // Replace the call expression with a literal object representing the schema
            call.replaceWithText(JSON.stringify(schema, null, 2));
        }
    }
}