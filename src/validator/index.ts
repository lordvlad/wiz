import { pluginNotEnabled } from "../errors";
import type { Validator, Asserter, TypeGuard, ValidationError } from "./types";

/**
 * Creates a validator function for type T that returns validation errors
 * @returns A validator function that checks if a value conforms to type T
 */
export function createValidator<T>(): Validator<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

/**
 * Validates a value against type T and returns validation errors
 * @param value The value to validate
 * @returns An array of validation errors (empty if valid)
 */
export function validate<T>(value: unknown): ValidationError[] {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

/**
 * Creates an assertion function for type T
 * @param errorFactory Optional factory to create custom error from validation errors
 * @returns An asserter function that throws if value doesn't conform to type T
 */
export function createAssert<T>(errorFactory?: (errors: ValidationError[]) => Error): Asserter<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

/**
 * Asserts that a value conforms to type T, throwing TypeError if not
 * @param value The value to assert
 * @throws TypeError with validation errors if value doesn't conform to type T
 */
export function assert<T>(value: unknown): asserts value is T {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

/**
 * Creates a type guard function for type T
 * @returns A type guard function that narrows the type if it returns true
 */
export function createIs<T>(): TypeGuard<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

export type { ValidationError, Validator, Asserter, TypeGuard };
