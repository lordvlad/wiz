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
            const usedNames = new Set<string>();
            
            for (const element of tupleElements) {
                // Get the alias symbol for the type name (User, Product, etc.)
                const aliasSymbol = element.getAliasSymbol();
                let typeName: string | undefined = aliasSymbol?.getName();
                
                // Fallback chain if no alias symbol exists
                if (!typeName) {
                    // Try getting the regular symbol name
                    const symbol = element.getSymbol();
                    typeName = symbol?.getName();
                    
                    // Last resort: use getText() and clean it up
                    if (!typeName || typeName === '__type') {
                        typeName = element.getText();
                        // Clean up the type name if it contains formatting or whitespace
                        typeName = typeName.replace(/\s+/g, '');
                    }
                }
                
                // Validate type name is suitable for use as a schema key
                if (!typeName || typeName === '__type') {
                    throw new Error(`Unable to determine a valid type name for tuple element: ${element.getText()}`);
                }
                
                // Check for duplicate type names
                if (usedNames.has(typeName)) {
                    throw new Error(`Duplicate type name '${typeName}' detected in tuple. Each type in the tuple must have a unique name.`);
                }
                usedNames.add(typeName);
                
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