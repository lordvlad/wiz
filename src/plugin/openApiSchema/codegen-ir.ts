/**
 * IR-based OpenAPI schema codegen wrapper
 *
 * This module provides a bridge between the existing OpenAPI codegen and the new IR layer.
 * It converts TypeScript types to IR, then generates OpenAPI schemas from the IR.
 */
import type { Type } from "ts-morph";

import { namedTypeToIrDefinition, typeToIr, type TsToIrOptions } from "../../ir/converters/ts-to-ir";
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

    // Convert TS type to IR
    const irType = typeToIr(type, tsToIrOptions);

    // Convert IR to OpenAPI
    const irToOpenApiOptions: IrToOpenApiOptions = {
        version: settings.openApiVersion || "3.0",
        unionStyle: settings.unionStyle || "oneOf",
    };

    return irTypeToOpenApiSchema(irType, {
        ...irToOpenApiOptions,
        availableTypes: context.availableTypes,
    });
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
