import { pluginNotEnabled } from "../errors";
import type { JsonParser, JsonSerializer } from "./types";

/**
 * Serializes a value to a JSON string with optimized string building
 * @param value The value to serialize
 * @returns JSON string representation of the value
 */
export function jsonSerialize<T>(value: T): string;
/**
 * Serializes a value directly to a Buffer with optimized writing
 * @param value The value to serialize
 * @param buf The buffer to write to
 */
export function jsonSerialize<T>(value: T, buf: Buffer): void;
export function jsonSerialize<T>(value: T, buf?: Buffer): string | void {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

/**
 * Creates a reusable JSON serializer function for type T
 * @returns A serializer function with both string and buffer overloads
 */
export function createJsonSerializer<T>(): JsonSerializer<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

/**
 * Parses a JSON string and validates it against type T
 * @param src The JSON string or Buffer to parse
 * @returns The parsed and validated value of type T
 */
export function jsonParse<T>(src: string): T;
/**
 * Parses a JSON Buffer and validates it against type T
 * @param src The JSON string or Buffer to parse
 * @returns The parsed and validated value of type T
 */
export function jsonParse<T>(src: Buffer): T;
export function jsonParse<T>(src: string | Buffer): T {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

/**
 * Creates a reusable JSON parser function for type T
 * @returns A parser function with both string and buffer overloads
 */
export function createJsonParser<T>(): JsonParser<T> {
    // intentionally empty, will be replaced at build time
    throw pluginNotEnabled();
}

export type { JsonSerializer, JsonParser };
