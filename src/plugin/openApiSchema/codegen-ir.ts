/**
 * IR-based OpenAPI schema codegen wrapper
 *
 * This module provides a bridge between the existing OpenAPI codegen and the new IR layer.
 * It converts TypeScript types to IR, then generates OpenAPI schemas from the IR.
 */
import { Node, type Type } from "ts-morph";

import { extractMetadata, namedTypeToIrDefinition, typeToIr, type TsToIrOptions } from "../../ir/converters/ts-to-ir";
import { irToOpenApiSchemas, irTypeToOpenApiSchema, type IrToOpenApiOptions } from "../../ir/generators/ir-to-openapi";
import type { IRSchema } from "../../ir/types";

type SchemaSettings = {
    coerceSymbolsToStrings?: boolean;
    transformDate?: (type: Type) => unknown;
    unionStyle?: "oneOf" | "anyOf";
    openApiVersion?: "3.0" | "3.1";
};

type SchemaContext = {
    nodeText?: string;
    settings?: SchemaSettings;
    declaration?: any;
    typeNode?: any;
    availableTypes?: Set<string>;
    processingStack?: Set<string>;
    typeAliasDeclaration?: any;
};

// Debug flag
const DEBUG = false;

/**
 * Generate OpenAPI schema from TypeScript type using IR layer
 *
 * This is a drop-in replacement for the existing createOpenApiSchema function
 * that uses the IR layer internally.
 */
export function createOpenApiSchemaViaIr(type: Type, context: SchemaContext = {}): unknown {
    const settings = context.settings ?? {};

    // Convert TypeScript options to IR options
    const tsToIrOptions: TsToIrOptions = {
        availableTypes: context.availableTypes,
        processingStack: context.processingStack,
        coerceSymbolsToStrings: settings.coerceSymbolsToStrings,
    };

    // Debug property types before conversion
    if (DEBUG && type.isObject()) {
        const props = type.getProperties();
        for (const prop of props) {
            const decl = prop.getValueDeclaration();
            const propType = prop.getTypeAtLocation(decl || prop.getDeclarations()[0]!);
            console.log(`[DEBUG] Property '${prop.getName()}':`);
            console.log(`  Text: ${propType.getText()}`);
            console.log(`  Alias Symbol: ${propType.getAliasSymbol()?.getName()}`);
            console.log(`  isIntersection: ${propType.isIntersection()}`);
            console.log(`  decl kind: ${decl?.getKindName()}`);
            if (decl && Node.isPropertySignature(decl)) {
                const typeNode = decl.getTypeNode();
                console.log(`  typeNode: ${typeNode?.getText()}`);
                if (typeNode) {
                    const declaredType = typeNode.getType();
                    console.log(`  declaredType Text: ${declaredType.getText()}`);
                    console.log(`  declaredType Alias Symbol: ${declaredType.getAliasSymbol()?.getName()}`);
                }
            }
            if (propType.isIntersection()) {
                for (const t of propType.getIntersectionTypes()) {
                    console.log(`    - ${t.getText()}`);
                    if (t.isObject()) {
                        const tprops = t.getProperties();
                        for (const tp of tprops) {
                            console.log(`      prop: ${tp.getName()}`);
                        }
                    }
                }
            }
        }
    }

    // Convert TS type to IR
    const irType = typeToIr(type, tsToIrOptions);

    if (DEBUG) {
        console.log("[DEBUG] Type text:", type.getText());
        console.log("[DEBUG] IR Type:", JSON.stringify(irType, null, 2));
    }

    // Extract metadata from type alias declaration if provided
    const typeMetadata = extractMetadata(context.typeAliasDeclaration);

    // Convert IR to OpenAPI
    const irToOpenApiOptions: IrToOpenApiOptions = {
        version: settings.openApiVersion || "3.0",
        unionStyle: settings.unionStyle || "oneOf",
        // Wrap transformDate to discard the ts-morph Type parameter (IR is type-agnostic)
        transformDate: settings.transformDate ? () => settings.transformDate!(undefined as any) : undefined,
    };

    const result = irTypeToOpenApiSchema(irType, {
        ...irToOpenApiOptions,
        availableTypes: context.availableTypes,
        metadata: typeMetadata,
    });

    if (DEBUG) {
        console.log("[DEBUG] OpenAPI Schema:", JSON.stringify(result, null, 2));
    }

    return result;
}

/**
 * Generate complete OpenAPI components.schemas from a list of named types
 */
export function createOpenApiSchemasViaIr(
    types: Array<{ name: string; type: Type }>,
    settings: SchemaSettings = {},
): Record<string, any> {
    // Build IR schema
    const availableTypes = new Set(types.map((t) => t.name));

    const irSchema: IRSchema = {
        types: types.map(({ name, type }) =>
            namedTypeToIrDefinition(name, type, {
                availableTypes,
                coerceSymbolsToStrings: settings.coerceSymbolsToStrings,
            }),
        ),
    };

    // Generate OpenAPI schemas from IR
    return irToOpenApiSchemas(irSchema, {
        version: settings.openApiVersion || "3.0",
        unionStyle: settings.unionStyle || "oneOf",
    });
}
