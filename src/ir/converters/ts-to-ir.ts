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
export function extractMetadata(node?: Node): IRMetadata | undefined {
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
                case "description":
                    // @description tag overrides any comment-based description
                    metadata.description = commentText || undefined;
                    break;
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
 * Check if type is a Wiz format type
 */
function isWizFormatType(type: Type): string | null {
    const alias = type.getAliasSymbol();
    if (alias) {
        const name = alias.getName();
        if (name === "NumFormat" || name === "StrFormat" || name === "BigIntFormat" || name === "DateFormat") {
            return name;
        }
    }

    const symbol = type.getSymbol();
    if (symbol) {
        const name = symbol.getName();
        if (name === "NumFormat" || name === "StrFormat" || name === "BigIntFormat" || name === "DateFormat") {
            return name;
        }
    }

    const text = type.getText();
    if (text.includes("NumFormat<")) return "NumFormat";
    if (text.includes("StrFormat<")) return "StrFormat";
    if (text.includes("BigIntFormat<")) return "BigIntFormat";
    if (text.includes("DateFormat<")) return "DateFormat";

    return null;
}

/**
 * Extract format literal from type arguments
 */
function getFormatLiteral(type: Type): string | undefined {
    // Try alias type arguments first
    const aliasArgs = type.getAliasTypeArguments?.();
    if (aliasArgs && aliasArgs.length > 0) {
        const firstArg = aliasArgs[0];
        if (firstArg && firstArg.isStringLiteral()) {
            return firstArg.getLiteralValue() as string;
        }
    }

    // Try regular type arguments
    const typeArgs = type.getTypeArguments?.();
    if (typeArgs && typeArgs.length > 0) {
        const firstArg = typeArgs[0];
        if (firstArg && firstArg.isStringLiteral()) {
            return firstArg.getLiteralValue() as string;
        }
    }

    // Try parsing from type text
    const text = type.getText();
    const match = text.match(/<\s*"([^"]+)"/);
    if (match && match[1]) {
        return match[1];
    }

    return undefined;
}

/**
 * Detect Wiz format from intersection type
 * Handles cases like: string & { __str_format: "email" }
 */
function detectWizFormatIntersection(type: Type): { formatType: string; formatValue: string } | null {
    if (!type.isIntersection()) return null;

    const intersectionTypes = type.getIntersectionTypes();
    if (intersectionTypes.length !== 2) return null;

    let formatType: string | null = null;
    let formatValue: string | null = null;

    for (const t of intersectionTypes) {
        if (t.isObject() && !t.isArray()) {
            const properties = t.getProperties();

            for (const prop of properties) {
                const propName = prop.getName();
                if (propName === "__str_format") {
                    formatType = "StrFormat";
                } else if (propName === "__num_format") {
                    formatType = "NumFormat";
                } else if (propName === "__bigint_format") {
                    formatType = "BigIntFormat";
                } else if (propName === "__date_format") {
                    formatType = "DateFormat";
                }

                if (formatType) {
                    const decl = prop.getValueDeclaration();
                    if (decl) {
                        const propType = prop.getTypeAtLocation(decl);
                        if (propType.isStringLiteral()) {
                            formatValue = propType.getLiteralValue() as string;
                        }
                    }
                }
            }
        }
    }

    if (formatType && formatValue) {
        return { formatType, formatValue };
    }

    return null;
}

/**
 * Convert Wiz format type to IR with appropriate primitive type and format
 */
function convertWizFormatType(
    formatType: string,
    formatValue: string,
    metadata?: IRMetadata,
    constraints?: IRConstraints,
): IRType {
    // Merge extensions into metadata
    const mergedMetadata: IRMetadata = {
        ...metadata,
        extensions: {
            ...metadata?.extensions,
            "x-wiz-format": `${formatType}<"${formatValue}">`,
        },
    };

    if (formatType === "NumFormat") {
        // NumFormat maps to different types based on format value
        if (formatValue === "string") {
            return createPrimitive("string", mergedMetadata, constraints);
        }
        if (formatValue === "int32" || formatValue === "int64") {
            return {
                ...createPrimitive("integer", mergedMetadata, constraints),
                format: { format: formatValue },
            };
        }
        if (formatValue === "float" || formatValue === "double") {
            return {
                ...createPrimitive("number", mergedMetadata, constraints),
                format: { format: formatValue },
            };
        }
        return createPrimitive("number", mergedMetadata, constraints);
    }

    if (formatType === "StrFormat") {
        // All StrFormat types map to string with format
        return {
            ...createPrimitive("string", mergedMetadata, constraints),
            format: { format: formatValue },
        };
    }

    if (formatType === "BigIntFormat") {
        // BigIntFormat maps to different types based on format value
        if (formatValue === "int64") {
            return {
                ...createPrimitive("integer", mergedMetadata, constraints),
                format: { format: "int64" },
            };
        }
        if (formatValue === "string") {
            return createPrimitive("string", mergedMetadata, constraints);
        }
        // Default to integer int64
        return {
            ...createPrimitive("integer", mergedMetadata, constraints),
            format: { format: "int64" },
        };
    }

    if (formatType === "DateFormat") {
        // DateFormat maps to different types based on format value
        if (formatValue === "date-time" || formatValue === "date") {
            return {
                ...createPrimitive("string", mergedMetadata, constraints),
                format: { format: formatValue },
            };
        }
        if (formatValue === "unix-s" || formatValue === "unix-ms") {
            return {
                ...createPrimitive("integer", mergedMetadata, constraints),
                format: { format: "int64" },
            };
        }
        // Default to string date-time
        return {
            ...createPrimitive("string", mergedMetadata, constraints),
            format: { format: "date-time" },
        };
    }

    // Fallback to number for unknown format types
    return createPrimitive("number", mergedMetadata, constraints);
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
export function typeToIr(type: Type, options: TsToIrOptions = {}, node?: Node): IRType {
    const context: ConversionContext = {
        availableTypes: options.availableTypes || new Set(),
        processingStack: options.processingStack || new Set(),
        coerceSymbolsToStrings: options.coerceSymbolsToStrings,
    };

    return convertType(type, context, node);
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

    // Check for reference to named type alias early
    // This handles type aliases like `type Status = "a" | "b"` when used in properties
    // Only create references when not at root level (processingStack is not empty)
    if (context.processingStack.size > 0) {
        const aliasSymbol = type.getAliasSymbol();
        if (aliasSymbol) {
            const aliasName = aliasSymbol.getName();
            if (aliasName && context.availableTypes.has(aliasName)) {
                // Check for circular reference
                if (context.processingStack.has(aliasName)) {
                    return createReference(aliasName, undefined, metadata);
                }
                // Use reference for named type aliases when nested
                return createReference(aliasName, undefined, metadata);
            }
        }
    }

    // Check for Wiz format types (NumFormat, StrFormat, BigIntFormat, DateFormat)
    const wizFormatType = isWizFormatType(type);
    if (wizFormatType) {
        const formatValue = getFormatLiteral(type);
        if (formatValue) {
            return convertWizFormatType(wizFormatType, formatValue, metadata, constraints);
        }
    }

    // Check for intersection-based format types (e.g., string & { __str_format: "email" })
    const intersectionFormat = detectWizFormatIntersection(type);
    if (intersectionFormat) {
        return convertWizFormatType(
            intersectionFormat.formatType,
            intersectionFormat.formatValue,
            metadata,
            constraints,
        );
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
            // Create a context that indicates we're inside an array
            // This ensures named types in arrays get converted to references
            const arrayContext = {
                ...context,
                processingStack: context.processingStack.size === 0 ? new Set(["__array__"]) : context.processingStack,
            };
            const items = convertType(arrayType, arrayContext);
            const result = createArray(items, metadata, constraints);
            return result;
        }
    }

    // Handle tuple
    if (type.isTuple()) {
        const elements = type.getTupleElements();
        // Create a context that indicates we're inside a tuple
        const tupleContext = {
            ...context,
            processingStack: context.processingStack.size === 0 ? new Set(["__tuple__"]) : context.processingStack,
        };
        const items = elements.map((el) => convertType(el, tupleContext));
        return createTuple(items, metadata);
    }

    // Handle enum (must be before union, as enum types are also reported as unions)
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

    // Handle union
    if (type.isUnion()) {
        const types = type.getUnionTypes();

        // Helper to apply outer metadata/constraints/format to a simplified type
        // This is needed when a union like T | undefined simplifies to T,
        // but the JSDoc metadata is on the original union node
        const applyOuterAnnotations = (irType: IRType): IRType => {
            // Only apply if the type doesn't already have these annotations
            if (metadata && !irType.metadata) {
                irType.metadata = metadata;
            }
            if (constraints && !irType.constraints) {
                irType.constraints = constraints;
            }
            if (format && !irType.format) {
                irType.format = format;
            }
            return irType;
        };

        // Check if this union contains boolean literals
        const booleanLiterals = types.filter((t) => t.isBooleanLiteral());
        const nullTypes = types.filter((t) => t.isNull());
        const otherTypes = types.filter((t) => !t.isBooleanLiteral() && !t.isNull());

        // If we have both true and false literals, consolidate to boolean
        if (booleanLiterals.length === 2) {
            const booleanPrimitive = createPrimitive("boolean", undefined, undefined);

            if (nullTypes.length > 0 && otherTypes.length === 0) {
                // boolean | null -> create union of [boolean, null]
                // Convert null types to IR primitives
                const nullIrTypes = nullTypes.map(() => createPrimitive("null", undefined, undefined));
                const union = createUnion([booleanPrimitive, ...nullIrTypes], metadata);
                return union;
            } else if (otherTypes.length === 0 && nullTypes.length === 0) {
                // Just true | false -> boolean
                return booleanPrimitive;
            } else {
                // true | false | other types -> boolean | other types
                // Create a context for processing other types
                const unionContext = {
                    ...context,
                    processingStack:
                        context.processingStack.size === 0 ? new Set(["__union__"]) : context.processingStack,
                };

                // Convert other types and null types to IR
                const convertedNulls = nullTypes.map(() => createPrimitive("null", undefined, undefined));
                const convertedOthers = otherTypes.map((t) => convertType(t, unionContext));
                const allTypes = [booleanPrimitive, ...convertedNulls, ...convertedOthers];
                const simplified = simplifyUnion(allTypes);

                if (simplified.length === 1) {
                    return applyOuterAnnotations(simplified[0]!);
                }

                const discriminator = detectDiscriminator(types, context.availableTypes);
                const union = createUnion(simplified, metadata);
                if (discriminator) {
                    union.discriminator = discriminator;
                }
                return union;
            }
        }

        // Create a context that indicates we're inside a union
        // This ensures named types in the union get converted to references
        const unionContext = {
            ...context,
            processingStack: context.processingStack.size === 0 ? new Set(["__union__"]) : context.processingStack,
        };

        const irTypes = types.map((t) => convertType(t, unionContext));
        const simplified = simplifyUnion(irTypes);

        if (simplified.length === 1) {
            return applyOuterAnnotations(simplified[0]!);
        }

        // Check if all union members are string or number literals (consolidate to enum)
        // Support nullable enums: "a" | "b" | null -> enum with nullable
        const nullIrTypes = simplified.filter((t) => t.kind === "primitive" && (t as any).primitiveType === "null");
        const nonNullIrTypes = simplified.filter(
            (t) => !(t.kind === "primitive" && (t as any).primitiveType === "null"),
        );
        const allLiterals = nonNullIrTypes.every((t) => t.kind === "literal");

        if (allLiterals && nonNullIrTypes.length > 0) {
            const firstValue = (nonNullIrTypes[0] as any).value;
            const allSameType = nonNullIrTypes.every((t: any) => typeof t.value === typeof firstValue);

            if (allSameType && (typeof firstValue === "string" || typeof firstValue === "number")) {
                // Convert union of literals to enum
                const members = nonNullIrTypes.map((t: any, index) => ({
                    name: `value${index}`,
                    value: t.value,
                    metadata: t.metadata,
                }));
                const enumType = createEnum(members, metadata);

                // If there were null types, wrap in a union with null
                if (nullIrTypes.length > 0) {
                    return createUnion([enumType, ...nullIrTypes], metadata);
                }
                return enumType;
            }
        }

        // Detect discriminator for unions
        const discriminator = detectDiscriminator(types, context.availableTypes);

        // Keep full union information including null
        // OpenAPI generator will handle nullable unions specially
        const union = createUnion(simplified, metadata);
        if (discriminator) {
            union.discriminator = discriminator;
        }
        // Apply format and constraints from outer node
        if (format) union.format = format;
        if (constraints) union.constraints = constraints;
        return union;
    }

    // Handle intersection
    if (type.isIntersection()) {
        const types = type.getIntersectionTypes();
        // Create a context that indicates we're inside an intersection
        const intersectionContext = {
            ...context,
            processingStack:
                context.processingStack.size === 0 ? new Set(["__intersection__"]) : context.processingStack,
        };
        const irTypes = types.map((t) => convertType(t, intersectionContext));
        return createIntersection(irTypes, metadata);
    }

    // Handle Date type - preserve as IRDate
    if (type.isObject()) {
        const symbol = type.getSymbol();
        if (symbol && symbol.getName() === "Date") {
            // Check if this is the global Date type
            const declarations = symbol.getDeclarations();
            if (declarations && declarations.length > 0) {
                const sourceFile = declarations[0]?.getSourceFile();
                const fileName = sourceFile?.getFilePath() || "";
                // If it's from lib.*.d.ts, treat it as the built-in Date
                if (fileName.includes("/lib.") || fileName.includes("\\lib.")) {
                    return {
                        kind: "date" as const,
                        ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
                        ...(constraints && Object.keys(constraints).length > 0 ? { constraints } : {}),
                    };
                }
            }
        }
    }

    // Handle object types
    if (type.isObject()) {
        // Check for reference to named type
        // Prioritize alias symbol over regular symbol to properly detect type aliases like Dog, Cat, etc.
        const symbol = type.getAliasSymbol() || type.getSymbol();
        if (symbol) {
            const typeName = symbol.getName();
            if (typeName && typeName !== "__type" && context.availableTypes.has(typeName)) {
                // Check for circular reference - always use $ref
                if (context.processingStack.has(typeName)) {
                    return createReference(typeName, undefined, metadata);
                }
                // Use $ref for nested types (not at root level)
                // Root level is indicated by an empty processingStack
                if (context.processingStack.size > 0) {
                    return createReference(typeName, undefined, metadata);
                }
                // At root level, continue to inline the type definition
            }
        }

        // Check for Record<K, V> or index signature
        const indexInfos = type.getStringIndexType();
        const properties = type.getProperties();
        const hasExplicitProperties = properties.some((prop) => {
            const propDecl = prop.getValueDeclaration();
            return !shouldFilterProperty(propDecl);
        });

        if (indexInfos && !hasExplicitProperties) {
            // Pure map type - no explicit properties
            // Create a context that indicates we're inside a map
            // This ensures named types in map values get converted to references
            const mapContext = {
                ...context,
                processingStack: context.processingStack.size === 0 ? new Set(["__map__"]) : context.processingStack,
            };
            const valueType = convertType(indexInfos, mapContext);
            return createMap(createPrimitive("string"), valueType, metadata);
        }

        // Regular object with properties (may also have index signature)
        // Add current type to processing stack to prevent infinite recursion for circular references
        const currentTypeName = symbol?.getName();
        const newProcessingStack = new Set(context.processingStack);
        if (currentTypeName && currentTypeName !== "__type" && context.availableTypes.has(currentTypeName)) {
            newProcessingStack.add(currentTypeName);
        }
        const newContext = { ...context, processingStack: newProcessingStack };

        const irProperties: IRProperty[] = [];

        for (const prop of properties) {
            const propDecl = prop.getValueDeclaration();
            if (shouldFilterProperty(propDecl)) {
                continue;
            }

            // Get the property type - prefer declaration for accurate type resolution
            const propTypeLocation = propDecl || prop.getDeclarations()[0]!;
            let propType = prop.getTypeAtLocation(propTypeLocation);
            const propName = prop.getName();
            const isOptional = prop.isOptional();

            // DEBUG: Log type resolution
            const DEBUG_TYPE_RESOLUTION = false;
            if (DEBUG_TYPE_RESOLUTION) {
                console.log(`[DEBUG ts-to-ir] Property '${propName}':`);
                console.log(`  propType.getText(): ${propType.getText()}`);
                console.log(`  propType.isAny(): ${propType.isAny()}`);
                console.log(`  propDecl: ${propDecl?.getKindName()}`);
                if (propDecl && Node.isPropertySignature(propDecl)) {
                    const typeNode = propDecl.getTypeNode();
                    console.log(`  typeNode?.getText(): ${typeNode?.getText()}`);
                    console.log(`  typeNode?.getKind(): ${typeNode?.getKindName()}`);
                    if (typeNode) {
                        const declaredType = typeNode.getType();
                        console.log(`  declaredType.getText(): ${declaredType.getText()}`);
                        console.log(`  declaredType.isAny(): ${declaredType.isAny()}`);
                        console.log(`  declaredType.getAliasSymbol(): ${declaredType.getAliasSymbol()?.getName()}`);

                        // Check if it's a TypeReference
                        if (Node.isTypeReference(typeNode)) {
                            const typeName = typeNode.getTypeName();
                            console.log(`  TypeReference typeName: ${typeName.getText()}`);
                            const typeArgs = typeNode.getTypeArguments();
                            console.log(`  TypeReference typeArgs: ${typeArgs.map((a) => a.getText()).join(", ")}`);
                        }
                    }
                }
            }

            // If the type resolved to 'any' for an optional property, try to get the declared type directly
            // This handles cases where TypeScript resolves optional branded types (like NumFormat<"string">) as 'any'
            if (propType.isAny() && propDecl && Node.isPropertySignature(propDecl)) {
                const typeNode = propDecl.getTypeNode();
                if (typeNode) {
                    // Try to get the type from the type node - this preserves type aliases
                    const declaredType = typeNode.getType();
                    // Even if declaredType.isAny() returns true, check if we can identify the alias
                    // TypeScript sometimes marks types as 'any' when it can't fully resolve them,
                    // but still preserves the alias symbol which we can use for Wiz format detection
                    const aliasSymbol = declaredType.getAliasSymbol();
                    if (!declaredType.isAny() || aliasSymbol) {
                        propType = declaredType;
                        if (DEBUG_TYPE_RESOLUTION) {
                            console.log(
                                `  [FIXED] Using declaredType instead (aliasSymbol: ${aliasSymbol?.getName()})`,
                            );
                        }
                    }
                }
            }

            // Convert the property type using the new context with updated processing stack
            let irType = convertType(propType, newContext, propDecl);

            // Important: Optional properties (prop?: T) should not include undefined in their type
            // The optionality is captured by required: false
            // This is different from (prop: T | undefined) which is a required property with undefined as a valid value
            if (isOptional && irType.kind === "union") {
                const union = irType as any;
                // Preserve the union's format/metadata to apply to the unwrapped type
                const outerFormat = union.format;
                const outerMetadata = union.metadata;
                const outerConstraints = union.constraints;

                if (unionContainsNull(union.types)) {
                    // This is (prop?: T | null) - keep the union but remove undefined if present
                    const filtered = union.types.filter((t: any) => {
                        if (t.kind === "primitive") {
                            return t.primitiveType !== "void";
                        }
                        return true;
                    });
                    if (filtered.length === 1) {
                        irType = filtered[0];
                        // Apply outer annotations from the union
                        if (outerFormat && !irType.format) irType.format = outerFormat;
                        if (outerMetadata && !irType.metadata) irType.metadata = outerMetadata;
                        if (outerConstraints && !irType.constraints) irType.constraints = outerConstraints;
                    } else if (filtered.length > 0) {
                        irType = createUnion(filtered, union.metadata);
                    }
                } else {
                    // Check if union contains undefined (void in IR)
                    const filtered = union.types.filter((t: any) => {
                        if (t.kind === "primitive") {
                            return t.primitiveType !== "void";
                        }
                        return true;
                    });
                    if (filtered.length === 1) {
                        // Union was (T | undefined) - reduce to just T since optionality is captured by required: false
                        irType = filtered[0];
                        // Apply outer annotations from the union
                        if (outerFormat && !irType.format) irType.format = outerFormat;
                        if (outerMetadata && !irType.metadata) irType.metadata = outerMetadata;
                        if (outerConstraints && !irType.constraints) irType.constraints = outerConstraints;
                    } else if (filtered.length > 0 && filtered.length < union.types.length) {
                        // Had undefined plus other types - keep the others
                        irType = createUnion(filtered, union.metadata);
                    }
                }
            }

            irProperties.push({
                name: propName,
                type: irType,
                required: !isOptional,
                metadata: extractMetadata(propDecl),
                constraints: extractConstraints(propDecl),
            });
        }

        // Determine additionalProperties based on index signature
        let additionalProperties: IRType | boolean | undefined;
        if (indexInfos) {
            // Has index signature along with explicit properties
            // If the index type is 'any', use true for additionalProperties
            if (indexInfos.isAny()) {
                additionalProperties = true;
            } else {
                // Convert the index value type
                const mapContext = {
                    ...newContext,
                    processingStack:
                        newContext.processingStack.size === 0 ? new Set(["__map__"]) : newContext.processingStack,
                };
                additionalProperties = convertType(indexInfos, mapContext);
            }
        }

        return createObject(irProperties, additionalProperties, metadata);
    }

    // Handle symbol type
    const flags = type.getFlags();
    if (
        (flags & TypeFlags.ESSymbol) !== 0 ||
        (flags & TypeFlags.UniqueESSymbol) !== 0 ||
        ["symbol", "unique symbol"].includes(type.getText())
    ) {
        // Symbol type requires coerceSymbolsToStrings option
        if (context.coerceSymbolsToStrings) {
            return createPrimitive("string", metadata, constraints);
        }
        // For IR, we represent this as a special 'symbol' primitive type
        // The OpenAPI generator will need to handle this appropriately
        return createPrimitive("symbol", metadata, constraints);
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
        // Start with empty processing stack - root level types should be inlined, not referenced
        // The type name will be added to the stack when processing nested properties
        processingStack: new Set<string>(),
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

/**
 * Detects if a union has a discriminator property and returns discriminator metadata
 * A discriminator is detected when all union members:
 * 1. Are object types
 * 2. Share a common property with the same name
 * 3. That property has different literal string/number values in each member
 */
function detectDiscriminator(
    unionTypes: Type[],
    availableTypes: Set<string>,
): { propertyName: string; mapping?: Record<string, string> } | undefined {
    // Need at least 2 types for a discriminator
    if (unionTypes.length < 2) {
        return undefined;
    }

    // All types must be objects (not primitives, arrays, etc.)
    if (!unionTypes.every((t) => t.isObject() && !t.isArray())) {
        return undefined;
    }

    // Get properties for each type
    const typeProperties = unionTypes.map((t) => {
        const props = t.getProperties();
        return new Map(props.map((p) => [p.getName(), p]));
    });

    // Find common property names across all union members
    const firstProps = typeProperties[0];
    if (!firstProps) return undefined;

    const commonProps: string[] = [];
    for (const [propName] of firstProps) {
        if (typeProperties.every((props) => props.has(propName))) {
            commonProps.push(propName);
        }
    }

    // Check each common property to see if it's a valid discriminator
    for (const propName of commonProps) {
        const literalValues = new Map<Type, string | number>();
        let isValidDiscriminator = true;

        for (let i = 0; i < unionTypes.length; i++) {
            const unionType = unionTypes[i];
            const typeProps = typeProperties[i];

            // Skip if we don't have props for this type
            if (!unionType || !typeProps) {
                isValidDiscriminator = false;
                break;
            }

            const prop = typeProps.get(propName);
            if (!prop) {
                isValidDiscriminator = false;
                break;
            }

            const declaration = prop.getDeclarations()[0];
            if (!declaration) {
                isValidDiscriminator = false;
                break;
            }

            const propType = declaration.getType();

            // Property must be a string or number literal type
            if (propType.isStringLiteral()) {
                const value = propType.getLiteralValue();
                literalValues.set(unionType, value as string);
            } else if (propType.isNumberLiteral()) {
                const value = propType.getLiteralValue();
                literalValues.set(unionType, value as number);
            } else {
                // Property is not a literal type
                isValidDiscriminator = false;
                break;
            }
        }

        // If we found a valid discriminator property
        if (isValidDiscriminator && literalValues.size === unionTypes.length) {
            // Check if all literal values are unique
            const values = Array.from(literalValues.values());
            const uniqueValues = new Set(values);
            if (uniqueValues.size !== values.length) {
                // Duplicate literal values, not a valid discriminator
                continue;
            }

            // Build discriminator object
            const discriminator: { propertyName: string; mapping?: Record<string, string> } = {
                propertyName: propName,
            };

            // Try to build mapping if all types have names and are in availableTypes
            const mapping: Record<string, string> = {};
            let canBuildMapping = true;

            for (const [unionType, literalValue] of literalValues) {
                const aliasSymbol = unionType.getAliasSymbol();
                let typeName = aliasSymbol?.getName();

                if (!typeName) {
                    const symbol = unionType.getSymbol();
                    typeName = symbol?.getName();
                }

                if (typeName && typeName !== "__type" && availableTypes.has(typeName)) {
                    mapping[String(literalValue)] = `#/components/schemas/${typeName}`;
                } else {
                    canBuildMapping = false;
                    break;
                }
            }

            // Only include mapping if we could map all types to $ref
            if (canBuildMapping && Object.keys(mapping).length > 0) {
                discriminator.mapping = mapping;
            }

            return discriminator;
        }
    }

    return undefined;
}

/**
 * Extract HTTP method metadata from JSDoc tags
 */
export function extractHttpMethodFromJSDoc(node?: Node): {
    httpMethod?: string;
    path?: string;
    operationId?: string;
    tags?: string[];
} | undefined {
    if (!node) return undefined;

    const jsDocableNode = node as any;
    if (typeof jsDocableNode.getJsDocs !== "function") {
        return undefined;
    }

    const jsDocs = jsDocableNode.getJsDocs();
    if (!jsDocs || jsDocs.length === 0) return undefined;

    let hasOpenApiTag = false;
    let httpMethod: string | undefined;
    let path: string | undefined;
    let operationId: string | undefined;
    const tags: string[] = [];

    for (const jsDoc of jsDocs) {
        const docTags = jsDoc.getTags?.() || [];
        for (const tag of docTags) {
            const tagName = tag.getTagName();
            const comment = tag.getComment?.();
            const commentText = typeof comment === "string" ? comment.trim() : "";

            switch (tagName) {
                case "openApi":
                    hasOpenApiTag = true;
                    break;
                case "method":
                    if (commentText) {
                        httpMethod = commentText.toUpperCase();
                    }
                    break;
                case "route":
                case "path":
                    if (commentText) {
                        const pathMatch = commentText.match(/^(\S+)/);
                        if (pathMatch) {
                            path = pathMatch[1];
                        }
                    }
                    break;
                case "operationId":
                    if (commentText) {
                        operationId = commentText;
                    }
                    break;
                case "tag":
                    if (commentText) {
                        tags.push(commentText);
                    }
                    break;
            }
        }
    }

    if (!hasOpenApiTag || !httpMethod || !path) {
        return undefined;
    }

    return {
        httpMethod,
        path,
        operationId,
        tags: tags.length > 0 ? tags : undefined,
    };
}
