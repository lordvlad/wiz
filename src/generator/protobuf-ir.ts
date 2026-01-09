/**
 * IR-based Protobuf to TypeScript generator wrapper
 *
 * This module provides a bridge for generating TypeScript from Protobuf using the IR layer.
 */
import { protoToIr, type ProtoFile } from "../ir/converters/proto-to-ir";
import { irToTypeScript } from "../ir/generators/ir-to-ts";

/**
 * Generate TypeScript models from Protobuf using IR layer
 */
export function generateModelsFromProtobufViaIr(protoFile: ProtoFile): Map<string, string> {
    // Convert Protobuf to IR
    const irSchema = protoToIr(protoFile);

    // Generate TypeScript from IR
    return irToTypeScript(irSchema);
}
