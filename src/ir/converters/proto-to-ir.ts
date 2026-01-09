/**
 * Protobuf to IR converter
 */
import type { IRMetadata, IRProperty, IRSchema, IRType, IRTypeDefinition } from "../types";
import { createArray, createMap, createObject, createPrimitive, createReference } from "../utils";

export interface ProtoField {
    name: string;
    type: string;
    number: number;
    repeated?: boolean;
    optional?: boolean;
    map?: { keyType: string; valueType: string };
    comment?: string;
}

export interface ProtoMessage {
    name: string;
    fields: ProtoField[];
    nested?: ProtoMessage[];
}

export interface ProtoFile {
    syntax?: string;
    package?: string;
    messages: ProtoMessage[];
}

export function protoToIr(protoFile: ProtoFile): IRSchema {
    const types: IRTypeDefinition[] = [];
    const availableTypes = new Set(protoFile.messages.map((m) => m.name));

    for (const message of protoFile.messages) {
        types.push(protoMessageToIrDefinition(message, availableTypes));
    }

    return {
        types,
        package: protoFile.package,
        version: protoFile.syntax,
    };
}

function protoMessageToIrDefinition(message: ProtoMessage, availableTypes: Set<string>): IRTypeDefinition {
    const properties: IRProperty[] = [];
    const fieldNumbers = new Map<string, number>();

    for (const field of message.fields) {
        fieldNumbers.set(field.name, field.number);

        const metadata: IRMetadata = {};
        if (field.comment) metadata.description = field.comment;

        let fieldType: IRType;

        if (field.map) {
            const keyType = protoTypeToIr(field.map.keyType, availableTypes);
            const valueType = protoTypeToIr(field.map.valueType, availableTypes);
            fieldType = createMap(keyType, valueType, metadata);
        } else if (field.repeated) {
            const itemType = protoTypeToIr(field.type, availableTypes);
            fieldType = createArray(itemType, metadata);
        } else {
            fieldType = protoTypeToIr(field.type, availableTypes, metadata);
        }

        properties.push({
            name: field.name,
            type: fieldType,
            required: !field.optional,
            metadata,
        });
    }

    return {
        name: message.name,
        type: createObject(properties),
        fieldNumbers,
    };
}

function protoTypeToIr(protoType: string, availableTypes: Set<string>, metadata?: IRMetadata): IRType {
    switch (protoType) {
        case "string":
            return createPrimitive("string", metadata);
        case "int32":
        case "int64":
        case "uint32":
        case "uint64":
        case "sint32":
        case "sint64":
        case "fixed32":
        case "fixed64":
        case "sfixed32":
        case "sfixed64":
        case "float":
        case "double":
            return createPrimitive("number", metadata);
        case "bool":
            return createPrimitive("boolean", metadata);
        case "bytes":
            return createPrimitive("string", metadata);
        default:
            if (availableTypes.has(protoType)) {
                return createReference(protoType, undefined, metadata);
            }
            return createPrimitive("any", metadata);
    }
}
