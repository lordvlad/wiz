import { Type, SyntaxKind, type SourceFile } from "ts-morph";

import type { WizPluginContext } from "..";
import { createOpenApiSchema } from "../../openApiSchema/index";
import { createOpenApiSchema as codegen } from "./codegen";

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
    const calls = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(
            (call) =>
                call.getExpression().getText() === createOpenApiSchema.name && call.getTypeArguments().length >= 1,
        );

    if (calls.length === 0) return;

    for (const call of calls) {
        log(`Transforming createOpenApiSchema call at ${path}:${call.getStartLineNumber()}:${call.getStartLinePos()}`);

        // Extract version from second type parameter (defaults to "3.0" if not provided)
        const typeArgs = call.getTypeArguments();
        let openApiVersion: "3.0" | "3.1" = "3.0"; // default

        if (typeArgs.length >= 2) {
            // Second type argument is the version
            const versionTypeArg = typeArgs[1]!;
            const versionText = versionTypeArg.getText().replace(/['"]/g, "");
            if (versionText !== "3.0" && versionText !== "3.1") {
                throw new Error(
                    `createOpenApiSchema version type parameter must be "3.0" or "3.1". Got: ${versionText}. Found at ${path}:${call.getStartLineNumber()}`,
                );
            }
            openApiVersion = versionText as "3.0" | "3.1";
        }

        // FIXME guard instead of using non-null assertion
        const typeArg = call.getTypeArguments()[0]!;
        const type = typeArg.getType();

        // Only tuple types are supported
        if (!type.isTuple()) {
            throw new Error(
                `createOpenApiSchema only accepts tuple types. Use createOpenApiSchema<[YourType]>() instead of createOpenApiSchema<YourType>(). Found at ${path}:${call.getStartLineNumber()}`,
            );
        }

        // Generate composite schema with components.schemas
        const tupleElements = type.getTupleElements();
        const schemas: Record<string, SchemaValue> = {};
        const usedNames = new Set<string>();

        // First pass: collect all type names
        const typeNames = new Map<Type, string>();
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
                if (!typeName || typeName === "__type") {
                    typeName = element.getText();
                    // Clean up the type name if it contains formatting or whitespace
                    typeName = typeName.replace(/\s+/g, "");
                }
            }

            // Validate type name is suitable for use as a schema key
            if (!typeName || typeName === "__type") {
                throw new Error(`Unable to determine a valid type name for tuple element: ${element.getText()}`);
            }

            // Check for duplicate type names
            if (usedNames.has(typeName)) {
                throw new Error(
                    `Duplicate type name '${typeName}' detected in tuple. Each type in the tuple must have a unique name.`,
                );
            }
            usedNames.add(typeName);
            typeNames.set(element, typeName);
        }

        // Second pass: generate schemas with $ref support
        const availableTypes = new Set(usedNames);
        for (const element of tupleElements) {
            const typeName = typeNames.get(element)!;

            // Start with an EMPTY processing stack at the root level
            // The codegen function will populate the stack as it processes nested types
            // This allows detection of root level (stack empty) vs nested (stack has entries)
            const processingStack = new Set<string>();

            // Get the type alias declaration to extract JSDoc metadata
            const aliasSymbol = element.getAliasSymbol();
            const typeAliasDeclaration = aliasSymbol?.getDeclarations()[0];

            // Pass undefined for typeNode to avoid duplicate title generation in codegen.
            // The codegen function adds a 'title' field when typeNode is provided,
            // but for composite schemas we want to control title placement ourselves.
            const schema = codegen(element, {
                typeNode: undefined,
                settings: {
                    coerceSymbolsToStrings: Boolean(opt?.coerceSymbolsToStrings),
                    transformDate: opt?.transformDate,
                    unionStyle: opt?.unionStyle,
                    openApiVersion,
                },
                availableTypes,
                processingStack,
                typeAliasDeclaration,
            });

            // Add title to the schema if not already present
            const schemaObj = schema as SchemaValue;
            if (typeof schemaObj === "object" && schemaObj !== null && !("title" in schemaObj)) {
                schemaObj.title = typeName;
            }

            schemas[typeName] = schemaObj;
        }

        const compositeSchema = {
            components: {
                schemas,
            },
        };

        call.replaceWithText(JSON.stringify(compositeSchema, null, 2));
    }
}
