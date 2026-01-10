/**
 * TypeScript AST to IR converter
 *
 * Converts ts-morph Type objects to our common IR representation.
 */
import { Node, Symbol as MorphSymbol, Type, TypeFlags } from "ts-morph";

import type { IRConstraints, IREnum, IRFormat, IRMetadata, IRProperty, IRType, IRTypeDefinition } from "../types";
import {
    createArray,
    createEnum,
    createIntersection,
    createLiteral,
    createMap,
    createObject,
    createPrimitive,
    createReference,
    createTuple,
    createUnion,
    removeNullFromUnion,
    simplifyUnion,
    unionContainsNull,
} from "../utils";

/**
 * Options for TypeScript to IR conversion
 */
export interface TsToIrOptions {
    /** Types available for $ref generation */
    availableTypes?: Set<string>;
    /** Stack to track processing for circular reference detection */
    processingStack?: Set<string>;
    /** Coerce symbols to strings */
    coerceSymbolsToStrings?: boolean;
}

/**
 * Context for conversion
 */
interface ConversionContext extends TsToIrOptions {
    availableTypes: Set<string>;
    processingStack: Set<string>;
}

/**
 * Extract JSDoc metadata from a node
 */
function extractMetadata(node?: Node): IRMetadata | undefined {
    if (!node) return undefined;

    const jsDocs = (node as any).getJsDocs?.() ?? [];
    if (jsDocs.length === 0) return undefined;

    const metadata: IRMetadata = {};

    for (const jsDoc of jsDocs) {
        // Extract description from comment
        const comment = jsDoc.getComment?.();
        if (comment) {
            const commentText = typeof comment === "string" ? comment.trim() : "";
            if (commentText) {
                metadata.description = commentText;
            }
        }

        // Extract tags
        const tags = jsDoc.getTags?.() ?? [];
        for (const tag of tags) {
            const tagName = tag.getTagName();
            const tagComment = tag.getComment?.();
            const commentText = typeof tagComment === "string" ? tagComment.trim() : "";

            switch (tagName) {
                case "deprecated":
                    metadata.deprecated = commentText || true;
                    break;
                case "default":
                    try {
                        metadata.default = JSON.parse(commentText);
                    } catch {
                        metadata.default = commentText;
                    }
                    break;
                case "example":
                    if (!metadata.examples) metadata.examples = [];
                    try {
                        metadata.examples.push(JSON.parse(commentText));
                    } catch {
                        metadata.examples.push(commentText);
                    }
                    break;
            }
        }
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Extract constraints from JSDoc tags
 */
function extractConstraints(node?: Node): IRConstraints | undefined {
    if (!node) return undefined;

    const jsDocs = (node as any).getJsDocs?.() ?? [];
    if (jsDocs.length === 0) return undefined;

    const constraints: IRConstraints = {};

    for (const jsDoc of jsDocs) {
        const tags = jsDoc.getTags?.() ?? [];
        for (const tag of tags) {
            const tagName = tag.getTagName();
            const comment = tag.getComment?.();
            const commentText = typeof comment === "string" ? comment.trim() : "";

            switch (tagName) {
                case "minimum":
                case "min": {
                    const num = parseFloat(commentText);
                    if (!isNaN(num)) constraints.minimum = num;
                    break;
                }
                case "maximum":
                case "max": {
                    const num = parseFloat(commentText);
                    if (!isNaN(num)) constraints.maximum = num;
                    break;
                }
                case "exclusiveMinimum": {
                    const num = parseFloat(commentText);
                    if (!isNaN(num)) constraints.exclusiveMinimum = num;
                    break;
                }
                case "exclusiveMaximum": {
                    const num = parseFloat(commentText);
                    if (!isNaN(num)) constraints.exclusiveMaximum = num;
                    break;
                }
                case "multipleOf": {
                    const num = parseFloat(commentText);
                    if (!isNaN(num) && num > 0) constraints.multipleOf = num;
                    break;
                }
                case "minLength": {
                    const num = parseInt(commentText, 10);
                    if (!isNaN(num)) constraints.minLength = num;
                    break;
                }
                case "maxLength": {
                    const num = parseInt(commentText, 10);
                    if (!isNaN(num)) constraints.maxLength = num;
                    break;
                }
                case "pattern": {
                    constraints.pattern = commentText;
                    break;
                }
                case "minItems": {
                    const num = parseInt(commentText, 10);
                    if (!isNaN(num)) constraints.minItems = num;
                    break;
                }
                case "maxItems": {
                    const num = parseInt(commentText, 10);
                    if (!isNaN(num)) constraints.maxItems = num;
                    break;
                }
                case "uniqueItems": {
                    constraints.uniqueItems = true;
                    break;
                }
            }
        }
    }

    return Object.keys(constraints).length > 0 ? constraints : undefined;
}

/**
 * Extract format from JSDoc tags
 */
function extractFormat(node?: Node): IRFormat | undefined {
    if (!node) return undefined;

    const jsDocs = (node as any).getJsDocs?.() ?? [];
    if (jsDocs.length === 0) return undefined;

    for (const jsDoc of jsDocs) {
        const tags = jsDoc.getTags?.() ?? [];
        for (const tag of tags) {
            const tagName = tag.getTagName();
            if (tagName === "format") {
                const comment = tag.getComment?.();
                const format = typeof comment === "string" ? comment.trim() : "";
                if (format) {
                    return { format };
                }
            }
        }
    }

    return undefined;
}

/**
 * Check if a property should be filtered out
 */
function shouldFilterProperty(node?: Node): boolean {
    if (!node) return false;

    const jsDocs = (node as any).getJsDocs?.() ?? [];

    for (const jsDoc of jsDocs) {
        const tags = jsDoc.getTags?.() ?? [];
        for (const tag of tags) {
            const tagName = tag.getTagName();
            if (tagName === "private" || tagName === "ignore" || tagName === "package") {
                return true;
            }
        }
    }

    return false;
}

/**
 * Convert a ts-morph Type to IR
 */
export function typeToIr(type: Type, options: TsToIrOptions = {}): IRType {
    const context: ConversionContext = {
        availableTypes: options.availableTypes || new Set(),
        processingStack: options.processingStack || new Set(),
        coerceSymbolsToStrings: options.coerceSymbolsToStrings,
    };

    return convertType(type, context);
}

/**
 * Internal conversion function with context
 */
function convertType(type: Type, context: ConversionContext, node?: Node): IRType {
    const metadata = extractMetadata(node);
    const constraints = extractConstraints(node);
    const format = extractFormat(node);

    // Handle null
    if (type.isNull()) {
        return createPrimitive("null", metadata, constraints);
    }

    // Handle undefined
    if (type.isUndefined()) {
        return createPrimitive("void", metadata, constraints);
    }

    // Handle boolean
    if (type.isBoolean()) {
        return createPrimitive("boolean", metadata, constraints);
    }

    // Handle string
    if (type.isString()) {
        const result = createPrimitive("string", metadata, constraints);
        if (format) result.format = format;
        return result;
    }

    // Handle number
    if (type.isNumber()) {
        const result = createPrimitive("number", metadata, constraints);
        if (format) result.format = format;
        return result;
    }

    // Handle bigint
    if (type.getFlags() & TypeFlags.BigInt) {
        const result = createPrimitive("number", metadata, constraints);
        if (format) result.format = format;
        return result;
    }

    // Handle literal types
    if (type.isLiteral()) {
        const value = type.getLiteralValue();
        return createLiteral(value as any, metadata);
    }

    // Handle array
    if (type.isArray()) {
        const arrayType = type.getArrayElementType();
        if (arrayType) {
            const items = convertType(arrayType, context);
            const result = createArray(items, metadata, constraints);
            return result;
        }
    }

    // Handle tuple
    if (type.isTuple()) {
        const elements = type.getTupleElements();
        const items = elements.map((el) => convertType(el, context));
        return createTuple(items, metadata);
    }

    // Handle union
    if (type.isUnion()) {
        const types = type.getUnionTypes();
        const irTypes = types.map((t) => convertType(t, context));
        const simplified = simplifyUnion(irTypes);

        if (simplified.length === 1) {
            return simplified[0]!;
        }

        // Keep full union information including null
        // OpenAPI generator will handle nullable unions specially
        return createUnion(simplified, metadata);
    }

    // Handle intersection
    if (type.isIntersection()) {
        const types = type.getIntersectionTypes();
        const irTypes = types.map((t) => convertType(t, context));
        return createIntersection(irTypes, metadata);
    }

    // Handle enum
    if (type.isEnum()) {
        const symbol = type.getSymbol();
        if (symbol) {
            const enumDecl = symbol.getDeclarations()[0];
            if (enumDecl && Node.isEnumDeclaration(enumDecl)) {
                const members = enumDecl.getMembers().map((member) => ({
                    name: member.getName(),
                    value: member.getValue() as string | number,
                    metadata: extractMetadata(member),
                }));
                return createEnum(members, metadata);
            }
        }
    }

    // Handle object types
    if (type.isObject()) {
        // Check for reference to named type
        const symbol = type.getSymbol() || type.getAliasSymbol();
        if (symbol) {
            const typeName = symbol.getName();
            if (typeName && typeName !== "__type" && context.availableTypes.has(typeName)) {
                // Check for circular reference
                if (context.processingStack.has(typeName)) {
                    return createReference(typeName, undefined, metadata);
                }
                return createReference(typeName, undefined, metadata);
            }
        }

        // Check for Record<K, V> or index signature
        const indexInfos = type.getStringIndexType();
        if (indexInfos) {
            const valueType = convertType(indexInfos, context);
            return createMap(createPrimitive("string"), valueType, metadata);
        }

        // Regular object with properties
        const properties = type.getProperties();
        const irProperties: IRProperty[] = [];

        for (const prop of properties) {
            const propDecl = prop.getValueDeclaration();
            if (shouldFilterProperty(propDecl)) {
                continue;
            }

            const propType = prop.getTypeAtLocation(propDecl || prop.getDeclarations()[0]!);
            const propName = prop.getName();
            const isOptional = prop.isOptional();

            irProperties.push({
                name: propName,
                type: convertType(propType, context, propDecl),
                required: !isOptional,
                metadata: extractMetadata(propDecl),
                constraints: extractConstraints(propDecl),
            });
        }

        return createObject(irProperties, undefined, metadata);
    }

    // Handle any
    if (type.isAny()) {
        return createPrimitive("any", metadata, constraints);
    }

    // Handle unknown
    if (type.isUnknown()) {
        return createPrimitive("unknown", metadata, constraints);
    }

    // Handle never
    if (type.isNever()) {
        return createPrimitive("never", metadata, constraints);
    }

    // Default fallback
    return createPrimitive("any", metadata, constraints);
}

/**
 * Convert a named type to an IR type definition
 */
export function namedTypeToIrDefinition(name: string, type: Type, options: TsToIrOptions = {}): IRTypeDefinition {
    const context: ConversionContext = {
        availableTypes: options.availableTypes || new Set(),
        processingStack: new Set([name]),
        coerceSymbolsToStrings: options.coerceSymbolsToStrings,
    };

    // Get the declaration node for metadata
    const symbol = type.getSymbol() || type.getAliasSymbol();
    const node = symbol?.getDeclarations()[0];

    const irType = convertType(type, context, node);
    const metadata = extractMetadata(node);

    return {
        name,
        type: irType,
        metadata,
    };
}
