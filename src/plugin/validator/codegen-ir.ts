/**
 * IR-based Validator codegen wrapper
 *
 * This module provides a bridge between the existing validator codegen and the new IR layer.
 */
import type { Type } from "ts-morph";

import { typeToIr } from "../../ir/converters/ts-to-ir";
import { irToValidator, type ValidatorOptions } from "../../ir/generators/ir-to-validator";

/**
 * Generate validator code from TypeScript type using IR layer
 */
export function createValidatorViaIr(
    type: Type,
    options: ValidatorOptions & { availableTypes?: Set<string> } = {},
): string {
    // Convert TS type to IR
    const irType = typeToIr(type, {
        availableTypes: options.availableTypes,
    });

    // Generate validator from IR
    return irToValidator(irType, options);
}
