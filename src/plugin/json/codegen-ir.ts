/**
 * IR-based JSON serializer/parser codegen wrapper
 *
 * This module provides a bridge between the existing JSON codegen and the new IR layer.
 */
import type { Type } from "ts-morph";

import { typeToIr } from "../../ir/converters/ts-to-ir";
import { irToJsonStringify, irToJsonParse, type JsonGeneratorOptions } from "../../ir/generators/ir-to-json";

/**
 * Generate JSON stringify code from TypeScript type using IR layer
 */
export function createJsonStringifyViaIr(
    type: Type,
    options: JsonGeneratorOptions & { availableTypes?: Set<string> } = {},
): string {
    // Convert TS type to IR
    const irType = typeToIr(type, {
        availableTypes: options.availableTypes,
    });

    // Generate JSON stringify from IR
    return irToJsonStringify(irType, options);
}

/**
 * Generate JSON parse code from TypeScript type using IR layer
 */
export function createJsonParseViaIr(
    type: Type,
    options: JsonGeneratorOptions & { availableTypes?: Set<string> } = {},
): string {
    // Convert TS type to IR
    const irType = typeToIr(type, {
        availableTypes: options.availableTypes,
    });

    // Generate JSON parse from IR
    return irToJsonParse(irType, options);
}
