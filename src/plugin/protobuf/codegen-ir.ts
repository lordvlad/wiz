/**
 * IR-based Protobuf codegen wrapper
 *
 * This module provides a bridge between the existing Protobuf codegen and the new IR layer.
 */
import type { Type } from "ts-morph";

import { namedTypeToIrDefinition, typeToIr } from "../../ir/converters/ts-to-ir";
import { irToProtobuf } from "../../ir/generators/ir-to-proto";
import { irToProtobufSerialize, irToProtobufParse } from "../../ir/generators/ir-to-proto-serialize";
import type { IRSchema } from "../../ir/types";

/**
 * Generate Protobuf model from a list of TypeScript types using IR layer
 */
export function createProtobufModelViaIr(
    types: Array<{ name: string; type: Type }>,
    options: { package?: string } = {},
): any {
    // Build IR schema
    const availableTypes = new Set(types.map((t) => t.name));

    const irSchema: IRSchema = {
        types: types.map(({ name, type }) => namedTypeToIrDefinition(name, type, { availableTypes })),
        package: options.package || "api",
    };

    // Generate Protobuf from IR
    return irToProtobuf(irSchema);
}

/**
 * Generate Protobuf serializer code from TypeScript type using IR layer
 */
export function createProtobufSerializeViaIr(type: Type, options: { availableTypes?: Set<string> } = {}): string {
    // Convert TS type to IR
    const irType = typeToIr(type, {
        availableTypes: options.availableTypes,
    });

    // Generate Protobuf serializer from IR
    return irToProtobufSerialize(irType);
}

/**
 * Generate Protobuf parser code from TypeScript type using IR layer
 */
export function createProtobufParseViaIr(type: Type, options: { availableTypes?: Set<string> } = {}): string {
    // Convert TS type to IR
    const irType = typeToIr(type, {
        availableTypes: options.availableTypes,
    });

    // Generate Protobuf parser from IR
    return irToProtobufParse(irType);
}
