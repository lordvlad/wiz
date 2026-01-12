/**
 * Common Intermediate Representation (IR) for Wiz
 *
 * This module defines a unified type system that sits between input formats
 * (TypeScript AST, OpenAPI, Protobuf) and output formats (schemas, validators, types).
 *
 * All transformations in Wiz go through this IR:
 * - Input parsers convert to IR
 * - IR is validated and normalized
 * - Output generators convert from IR
 */

/**
 * Base metadata that can be attached to any IR node
 */
export interface IRMetadata {
    /** Human-readable description */
    description?: string;
    /** JSDoc comment text */
    comment?: string;
    /** Deprecation notice */
    deprecated?: boolean | string;
    /** Examples of valid values */
    examples?: unknown[];
    /** Default value */
    default?: unknown;
    /** Additional custom metadata */
    extensions?: Record<string, unknown>;
}

/**
 * Primitive scalar types supported across all formats
 */
export type IRPrimitiveType =
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "null"
    | "any"
    | "unknown"
    | "never"
    | "void"
    | "symbol";

/**
 * Format hints for primitive types (e.g., email, date-time, uuid)
 */
export interface IRFormat {
    /** The format type (e.g., "email", "uuid", "date-time") */
    format: string;
    /** Category of format (helps determine how to serialize/validate) */
    category?: "string" | "number" | "date" | "bigint";
}

/**
 * Constraints that can be applied to types
 */
export interface IRConstraints {
    // Number constraints
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;

    // String constraints
    minLength?: number;
    maxLength?: number;
    pattern?: string;

    // Array constraints
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;

    // Object constraints
    minProperties?: number;
    maxProperties?: number;

    // Enum constraint
    enum?: unknown[];
}

/**
 * Base interface for all IR type nodes
 */
export interface IRTypeBase {
    kind: string;
    metadata?: IRMetadata;
    constraints?: IRConstraints;
    format?: IRFormat;
}

/**
 * Primitive type node
 */
export interface IRPrimitive extends IRTypeBase {
    kind: "primitive";
    primitiveType: IRPrimitiveType;
}

/**
 * Literal type node (e.g., "foo", 42, true)
 */
export interface IRLiteral extends IRTypeBase {
    kind: "literal";
    value: string | number | boolean | null;
}

/**
 * Array type node
 */
export interface IRArray extends IRTypeBase {
    kind: "array";
    items: IRType;
}

/**
 * Tuple type node (fixed-length array with specific types)
 */
export interface IRTuple extends IRTypeBase {
    kind: "tuple";
    items: IRType[];
}

/**
 * Property/field in an object
 */
export interface IRProperty {
    name: string;
    type: IRType;
    required: boolean;
    readonly?: boolean;
    metadata?: IRMetadata;
    constraints?: IRConstraints;
}

/**
 * Object type node
 */
export interface IRObject extends IRTypeBase {
    kind: "object";
    properties: IRProperty[];
    /** Additional properties type (for dynamic keys) */
    additionalProperties?: IRType | boolean;
    /** Index signature key type (usually string) */
    indexSignature?: {
        keyType: IRType;
        valueType: IRType;
    };
}

/**
 * Reference to a named type
 */
export interface IRReference extends IRTypeBase {
    kind: "reference";
    /** Name of the referenced type */
    name: string;
    /** Optional type arguments for generic types */
    typeArguments?: IRType[];
}

/**
 * Union type (A | B | C)
 */
export interface IRUnion extends IRTypeBase {
    kind: "union";
    types: IRType[];
    /** Discriminator property for tagged unions */
    discriminator?: {
        propertyName: string;
        mapping?: Record<string, string>;
    };
}

/**
 * Intersection type (A & B & C)
 */
export interface IRIntersection extends IRTypeBase {
    kind: "intersection";
    types: IRType[];
}

/**
 * Map type (Record<K, V> or protobuf map<K, V>)
 */
export interface IRMap extends IRTypeBase {
    kind: "map";
    keyType: IRType;
    valueType: IRType;
}

/**
 * Date type - represents JavaScript Date objects
 * Kept separate from primitives as it requires special handling
 */
export interface IRDate extends IRTypeBase {
    kind: "date";
}

/**
 * Enum type
 */
export interface IREnum extends IRTypeBase {
    kind: "enum";
    members: Array<{
        name: string;
        value: string | number;
        metadata?: IRMetadata;
    }>;
}

/**
 * Function/method signature
 */
export interface IRFunction extends IRTypeBase {
    kind: "function";
    parameters: Array<{
        name: string;
        type: IRType;
        optional?: boolean;
        metadata?: IRMetadata;
    }>;
    returnType: IRType;
}

/**
 * Union of all IR type nodes
 */
export type IRType =
    | IRPrimitive
    | IRLiteral
    | IRArray
    | IRTuple
    | IRObject
    | IRReference
    | IRUnion
    | IRIntersection
    | IRMap
    | IRDate
    | IREnum
    | IRFunction;

/**
 * Named type definition (top-level type declaration)
 */
export interface IRTypeDefinition {
    name: string;
    type: IRType;
    metadata?: IRMetadata;
    /** For protobuf: field numbering */
    fieldNumbers?: Map<string, number>;
}

/**
 * RPC method definition (for protobuf services, REST endpoints)
 */
export interface IRMethod {
    name: string;
    /** Request/input type */
    input: IRType;
    /** Response/output type */
    output: IRType;
    /** HTTP method (for REST) */
    httpMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE";
    /** Path template (for REST) */
    path?: string;
    /** Path parameters */
    pathParams?: IRType;
    /** Query parameters */
    queryParams?: IRType;
    /** Request headers */
    headers?: IRType;
    metadata?: IRMetadata;
}

/**
 * Service definition (collection of methods)
 */
export interface IRService {
    name: string;
    methods: IRMethod[];
    metadata?: IRMetadata;
}

/**
 * Complete schema/specification
 */
export interface IRSchema {
    /** Schema version/format identifier */
    version?: string;
    /** Package/namespace */
    package?: string;
    /** Named type definitions */
    types: IRTypeDefinition[];
    /** Service definitions (optional, for RPC/REST) */
    services?: IRService[];
    /** Global metadata */
    metadata?: IRMetadata;
}
