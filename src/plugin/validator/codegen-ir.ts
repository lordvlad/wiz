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
 * Returns an IIFE that validates and returns an errors array
 */
export function generateValidatorCodeViaIr(type: Type): string {
    const irType = typeToIr(type, {});
    return irToValidator(irType, { outputStyle: "errors" });
}

/**
 * Generate 'is' type guard code from TypeScript type using IR layer
 * Returns an IIFE that returns boolean
 */
export function generateIsCodeViaIr(type: Type): string {
    const validatorCode = generateValidatorCodeViaIr(type);
    return `
(function(value) {
    const validator = ${validatorCode};
    return validator(value).length === 0;
})
    `.trim();
}

/**
 * Generate 'assert' code from TypeScript type using IR layer
 * Returns an IIFE that throws on validation failure
 */
export function generateAssertCodeViaIr(type: Type, hasErrorFactory: boolean): string {
    const irType = typeToIr(type, {});

    if (hasErrorFactory) {
        // Return a function that takes error factory and returns the assertion function
        const validatorCode = irToValidator(irType, { outputStyle: "errors" });
        return `
(function(errorFactory) {
    return function(value) {
        const validator = ${validatorCode};
        const errors = validator(value);
        if (errors.length > 0) {
            throw errorFactory(errors);
        }
        return value;
    };
})
        `.trim();
    } else {
        // Return the assertion function directly using the IIFE style
        return irToValidator(irType, { outputStyle: "iife", throwOnError: true });
    }
}

/**
 * Generate 'validate' code from TypeScript type using IR layer
 * Returns an IIFE that returns errors array
 */
export function generateValidateCodeViaIr(type: Type): string {
    const validatorCode = generateValidatorCodeViaIr(type);
    return `
(function(value) {
    const validator = ${validatorCode};
    return validator(value);
})
    `.trim();
}
