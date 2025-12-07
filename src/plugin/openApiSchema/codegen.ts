
import { TypeFlags, Node, Symbol, SymbolFlags, Type } from "ts-morph";
import type { BigIntFormatType, NumFormatType } from "../../tags";

type SchemaSettings = {
    coerceSymbolsToStrings?: boolean;
}

type SchemaContext = {
    nodeText?: string;
    settings?: SchemaSettings;
};

export function createOpenApiSchema(type: Type, context: SchemaContext = {}): unknown {
    const settings = context.settings ?? {};

    if (type.isUnion()) {
        const narrowed = type.getUnionTypes().filter(t => !isNullable(t));
        if (narrowed.length === 1)
            return createOpenApiSchema(narrowed[0]!, context);
        if (narrowed.length > 1 && narrowed.every(t => t.isBooleanLiteral()))
            return { type: "boolean" };
    }
    if (isBigIntFormat(type, context.nodeText))
        return createSchemaForBigInt(type, context.nodeText);

    if (isNumFormat(type, context.nodeText))
        return createSchemaForNumberFormat(type, context.nodeText);

    if (isSymbolType(type)) {
        if (settings.coerceSymbolsToStrings)
            return { type: "string" };
        throw new Error("Symbol types require 'coerceSymbolsToStrings' to be enabled.");
    }

    if (type.isString())
        return { type: "string" };

    if (type.isNumber())
        return { type: "number" };

    if (type.isBoolean())
        return { type: "boolean" };

    if (type.isArray())
        return {
            type: "array",
            items: createOpenApiSchema(type.getArrayElementTypeOrThrow(), context),
        };

    if (type.isObject() && !type.isArray() && !type.isInterface() && !type.isClass()) {
        const properties: Record<string, any> = {};
        const required: string[] = [];

        type.getProperties().forEach(prop => {
            const declaration = prop.getDeclarations()[0];
            if (!declaration) return;

            const propType = declaration.getType();
            const typeNode = (Node.isPropertySignature(declaration) || Node.isPropertyDeclaration(declaration))
                ? declaration.getTypeNode()
                : undefined;
            properties[prop.getName()] = createOpenApiSchema(propType, {
                ...context,
                nodeText: typeNode?.getText()
            });

            if (!isOptionalProperty(prop, declaration)) {
                required.push(prop.getName());
            }
        });

        const schema: Record<string, any> = { type: "object", properties };

        if (required.length > 0) schema.required = required;

        return schema;
    }
    throw new Error(`Unsupported type: ${type.getText()}`);
}

function isBigIntFormat(type: Type, nodeText?: string) {
    return hasFormatAlias(type, "BigIntFormat") || nodeText?.includes("BigIntFormat");
}

function isNumFormat(type: Type, nodeText?: string) {
    return hasFormatAlias(type, "NumFormat") || nodeText?.includes("NumFormat");
}

function hasFormatAlias(type: Type, name: string) {
    const alias = type.getAliasSymbol();
    if (alias && alias.getName() === name)
        return true;

    const symbol = type.getSymbol();
    if (symbol && symbol.getName() === name)
        return true;

    return type.getText().includes(name);
}

function createSchemaForBigInt(type: Type, nodeText?: string) {
    const formatValue = getFormatLiteral<BigIntFormatType>(type) ?? extractFormatFromText<BigIntFormatType>(nodeText, "BigIntFormat");

    if (formatValue === "int64")
        return { type: "integer", format: "int64" };

    if (formatValue === "string")
        return { type: "string" };

    throw new Error(`BigIntFormat requires a format. Received: ${type.getText()}`);
}

function createSchemaForNumberFormat(type: Type, nodeText?: string) {
    const formatValue = getFormatLiteral<NumFormatType>(type) ?? extractFormatFromText<NumFormatType>(nodeText, "NumFormat");

    if (!formatValue)
        return { type: "number" };

    if (formatValue === "string")
        return { type: "string" };

    if (formatValue === "int32" || formatValue === "int64")
        return { type: "integer", format: formatValue };

    if (formatValue === "float" || formatValue === "double")
        return { type: "number", format: formatValue };

    return { type: "number" };
}

function isOptionalProperty(symbol: Symbol, declaration: Node) {
    if (symbol.hasFlags(SymbolFlags.Optional))
        return true;

    if (Node.isPropertySignature(declaration) || Node.isPropertyDeclaration(declaration))
        if (declaration.hasQuestionToken())
            return true;

    return false;
}

function isNullable(type: Type) {
    if (type.isUndefined() || type.isNull())
        return true;

    return ["undefined", "null"].includes(type.getText())
}

function isSymbolType(type: Type) {
    const flags = type.getFlags();
    if ((flags & TypeFlags.ESSymbol) !== 0 || (flags & TypeFlags.UniqueESSymbol) !== 0)
        return true;

    return ["symbol", "unique symbol"].includes(type.getText());
}

function getFormatLiteral<T extends string>(type: Type): T | undefined {
    const aliasArgs = type.getAliasTypeArguments?.();
    if (aliasArgs && aliasArgs.length > 0) {
        const literal = aliasArgs[0]?.getLiteralValue?.();
        if (typeof literal === "string")
            return literal as T;
    }

    const typeArgs = type.getTypeArguments?.();
    if (typeArgs && typeArgs.length > 0) {
        const literal = typeArgs[0]?.getLiteralValue?.();
        if (typeof literal === "string")
            return literal as T;
    }

    return undefined;
}

function extractFormatFromText<T extends string>(text: string | undefined, alias: string): T | undefined {
    if (!text)
        return undefined;

    const pattern = new RegExp(`${alias}<\s*"([^"]+)"`, "i");
    const match = text.match(pattern);
    if (!match)
        return undefined;

    return match[1] as T;
}