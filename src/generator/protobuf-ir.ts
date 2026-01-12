/**
 * IR-based Protobuf to TypeScript generator wrapper
 *
 * This module provides a bridge for generating TypeScript from Protobuf using the IR layer.
 */
import { protoToIr } from "../ir/converters/proto-to-ir";
import { irToTypeScript } from "../ir/generators/ir-to-ts";

// Re-export types from the original protobuf module for backward compatibility
export type { ProtoField, ProtoMessage, ProtoFile, GeneratorOptions } from "./protobuf";
export { parseProtoFile } from "./protobuf";

/**
 * Generate TypeScript models from Protobuf using IR layer
 *
 * This function provides a complete implementation using the IR layer,
 * supporting all features including JSDoc comments, wiz tags, and format hints.
 */
export function generateModelsFromProtobuf(
    protoFile: import("./protobuf").ProtoFile,
    options: import("./protobuf").GeneratorOptions = {},
): Map<string, string> {
    // Convert Protobuf to IR
    const irSchema = protoToIr(protoFile);

    // Generate TypeScript from IR
    // The IR layer preserves all metadata including JSDoc, tags, and format hints
    return irToTypeScript(irSchema, {
        includeJSDoc: options.includeTags,
        customTags: options.tags,
    });
}

/**
 * Legacy function name for backward compatibility
 * @deprecated Use generateModelsFromProtobuf instead
 */
export function generateModelsFromProtobufViaIr(protoFile: import("./protobuf").ProtoFile): Map<string, string> {
    return generateModelsFromProtobuf(protoFile);
}
