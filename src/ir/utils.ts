/**
 * Utility functions for working with IR types
 */
import type {
    IRArray,
    IRConstraints,
    IREnum,
    IRFunction,
    IRIntersection,
    IRLiteral,
    IRMap,
    IRMetadata,
    IRObject,
    IRPrimitive,
    IRPrimitiveType,
    IRProperty,
    IRReference,
    IRTuple,
    IRType,
    IRUnion,
} from "./types";

/**
 * Create a primitive IR type
 */
export function createPrimitive(
    primitiveType: IRPrimitiveType,
    metadata?: IRMetadata,
    constraints?: IRConstraints,
): IRPrimitive {
    return {
        kind: "primitive",
        primitiveType,
        metadata,
        constraints,
    };
}

/**
 * Create a literal IR type
 */
export function createLiteral(value: string | number | boolean | null, metadata?: IRMetadata): IRLiteral {
    return {
        kind: "literal",
        value,
        metadata,
    };
}

/**
 * Create an array IR type
 */
export function createArray(items: IRType, metadata?: IRMetadata, constraints?: IRConstraints): IRArray {
    return {
        kind: "array",
        items,
        metadata,
        constraints,
    };
}

/**
 * Create a tuple IR type
 */
export function createTuple(items: IRType[], metadata?: IRMetadata): IRTuple {
    return {
        kind: "tuple",
        items,
        metadata,
    };
}

/**
 * Create an object IR type
 */
export function createObject(
    properties: IRProperty[],
    additionalProperties?: IRType | boolean,
    metadata?: IRMetadata,
): IRObject {
    return {
        kind: "object",
        properties,
        additionalProperties,
        metadata,
    };
}

/**
 * Create a reference IR type
 */
export function createReference(name: string, typeArguments?: IRType[], metadata?: IRMetadata): IRReference {
    return {
        kind: "reference",
        name,
        typeArguments,
        metadata,
    };
}

/**
 * Create a union IR type
 */
export function createUnion(types: IRType[], metadata?: IRMetadata): IRUnion {
    return {
        kind: "union",
        types,
        metadata,
    };
}

/**
 * Create an intersection IR type
 */
export function createIntersection(types: IRType[], metadata?: IRMetadata): IRIntersection {
    return {
        kind: "intersection",
        types,
        metadata,
    };
}

/**
 * Create a map IR type
 */
export function createMap(keyType: IRType, valueType: IRType, metadata?: IRMetadata): IRMap {
    return {
        kind: "map",
        keyType,
        valueType,
        metadata,
    };
}

/**
 * Create an enum IR type
 */
export function createEnum(
    members: Array<{
        name: string;
        value: string | number;
        metadata?: IRMetadata;
    }>,
    metadata?: IRMetadata,
): IREnum {
    return {
        kind: "enum",
        members,
        metadata,
    };
}

/**
 * Create a function IR type
 */
export function createFunction(
    parameters: Array<{
        name: string;
        type: IRType;
        optional?: boolean;
        metadata?: IRMetadata;
    }>,
    returnType: IRType,
    metadata?: IRMetadata,
): IRFunction {
    return {
        kind: "function",
        parameters,
        returnType,
        metadata,
    };
}

/**
 * Check if a type is a primitive
 */
export function isPrimitive(type: IRType): type is IRPrimitive {
    return type.kind === "primitive";
}

/**
 * Check if a type is a literal
 */
export function isLiteral(type: IRType): type is IRLiteral {
    return type.kind === "literal";
}

/**
 * Check if a type is an array
 */
export function isArray(type: IRType): type is IRArray {
    return type.kind === "array";
}

/**
 * Check if a type is a tuple
 */
export function isTuple(type: IRType): type is IRTuple {
    return type.kind === "tuple";
}

/**
 * Check if a type is an object
 */
export function isObject(type: IRType): type is IRObject {
    return type.kind === "object";
}

/**
 * Check if a type is a reference
 */
export function isReference(type: IRType): type is IRReference {
    return type.kind === "reference";
}

/**
 * Check if a type is a union
 */
export function isUnion(type: IRType): type is IRUnion {
    return type.kind === "union";
}

/**
 * Check if a type is an intersection
 */
export function isIntersection(type: IRType): type is IRIntersection {
    return type.kind === "intersection";
}

/**
 * Check if a type is a map
 */
export function isMap(type: IRType): type is IRMap {
    return type.kind === "map";
}

/**
 * Check if a type is an enum
 */
export function isEnum(type: IRType): type is IREnum {
    return type.kind === "enum";
}

/**
 * Check if a type is a function
 */
export function isFunction(type: IRType): type is IRFunction {
    return type.kind === "function";
}

/**
 * Merge metadata objects, with later values taking precedence
 */
export function mergeMetadata(...metadatas: (IRMetadata | undefined)[]): IRMetadata | undefined {
    const filtered = metadatas.filter((m): m is IRMetadata => m !== undefined);
    if (filtered.length === 0) return undefined;
    if (filtered.length === 1) return filtered[0];

    const result: IRMetadata = {};
    for (const meta of filtered) {
        if (meta.description) result.description = meta.description;
        if (meta.comment) result.comment = meta.comment;
        if (meta.deprecated !== undefined) result.deprecated = meta.deprecated;
        if (meta.examples) result.examples = [...(result.examples || []), ...meta.examples];
        if (meta.default !== undefined) result.default = meta.default;
        if (meta.extensions) {
            result.extensions = { ...result.extensions, ...meta.extensions };
        }
    }
    return result;
}

/**
 * Merge constraints objects, with later values taking precedence
 */
export function mergeConstraints(...constraints: (IRConstraints | undefined)[]): IRConstraints | undefined {
    const filtered = constraints.filter((c): c is IRConstraints => c !== undefined);
    if (filtered.length === 0) return undefined;
    if (filtered.length === 1) return filtered[0];

    const result: IRConstraints = {};
    for (const constraint of filtered) {
        Object.assign(result, constraint);
    }
    return result;
}

/**
 * Simplify a union type by removing duplicates and flattening nested unions
 */
export function simplifyUnion(types: IRType[]): IRType[] {
    const flattened: IRType[] = [];

    for (const type of types) {
        if (isUnion(type)) {
            flattened.push(...type.types);
        } else {
            flattened.push(type);
        }
    }

    // Remove duplicates based on type structure
    const unique: IRType[] = [];
    const seen = new Set<string>();

    for (const type of flattened) {
        const key = JSON.stringify(type);
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(type);
        }
    }

    return unique;
}

/**
 * Check if a union contains null
 */
export function unionContainsNull(types: IRType[]): boolean {
    return types.some((t) => isPrimitive(t) && t.primitiveType === "null");
}

/**
 * Remove null from a union type
 */
export function removeNullFromUnion(types: IRType[]): IRType[] {
    return types.filter((t) => !(isPrimitive(t) && t.primitiveType === "null"));
}
