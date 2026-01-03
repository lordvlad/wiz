import { Node, SyntaxKind, Type, type CallExpression, type SourceFile } from "ts-morph";

import type { WizPluginContext } from "..";
import { createProtobufModel, createProtobufSpec, rpcCall } from "../../protobuf";
import { createProtobufModel as codegen, protobufModelToString } from "./codegen";

const RPC_METHODS = new Set(["rpc"]);

interface ParsedRpcMethod {
    name: string;
    typeParameters?: {
        requestType?: Type;
        responseType?: Type;
    };
}

interface ProtobufConfigResult {
    packageName: string;
    serviceName?: string;
    rpcMethods: ParsedRpcMethod[];
}

// Helper: Extract type name from type
function extractTypeName(element: Type): string {
    const aliasSymbol = element.getAliasSymbol();
    let typeName: string | undefined = aliasSymbol?.getName();

    if (!typeName) {
        const symbol = element.getSymbol();
        typeName = symbol?.getName();

        if (!typeName || typeName === "__type") {
            typeName = element.getText().replace(/\s+/g, "");
        }
    }

    if (!typeName || typeName === "__type") {
        throw new Error(`Unable to determine a valid type name for element: ${element.getText()}`);
    }

    return typeName;
}

// Helper: Collect type names from tuple elements
function collectTypeNames(tupleElements: Type[]): string[] {
    return tupleElements.map((element) => extractTypeName(element));
}

// Helper: Parse protobuf config from call arguments
function parseProtobufConfig(call: CallExpression, log: (...args: any[]) => void, path: string): ProtobufConfigResult {
    const args = call.getArguments();
    let packageName = "api"; // default package name
    let serviceName: string | undefined;
    const rpcMethods: ParsedRpcMethod[] = [];

    if (args.length > 0) {
        const configArg = args[0];
        if (configArg && Node.isObjectLiteralExpression(configArg)) {
            // Extract package name
            const packageProp = configArg.getProperty("package");
            if (packageProp && Node.isPropertyAssignment(packageProp)) {
                const init = packageProp.getInitializer();
                if (init && Node.isStringLiteral(init)) {
                    packageName = init.getLiteralValue();
                }
            }

            // Extract service name
            const serviceNameProp = configArg.getProperty("serviceName");
            if (serviceNameProp && Node.isPropertyAssignment(serviceNameProp)) {
                const init = serviceNameProp.getInitializer();
                if (init && Node.isStringLiteral(init)) {
                    serviceName = init.getLiteralValue();
                }
            }
        }
    }

    return {
        packageName,
        serviceName,
        rpcMethods,
    };
}

// Extract RPC methods from rpcCall function calls
function extractRpcMethods(sourceFile: SourceFile): ParsedRpcMethod[] {
    const methods: ParsedRpcMethod[] = [];
    const calls = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter((call: CallExpression) => call.getExpression().getText() === rpcCall.name);

    for (const call of calls) {
        // Find the property assignment this call is part of
        let current = call.getParent();
        let methodName: string | undefined;

        while (current) {
            if (Node.isPropertyAssignment(current)) {
                const name = current.getName();
                if (name) {
                    methodName = name;
                    break;
                }
            }
            current = current.getParent();
        }

        if (!methodName) {
            continue;
        }

        // Extract type parameters
        const typeArgs = call.getTypeArguments();
        const method: ParsedRpcMethod = {
            name: methodName,
            typeParameters: {},
        };

        if (typeArgs.length >= 1) {
            method.typeParameters!.requestType = typeArgs[0]!.getType();
        }

        if (typeArgs.length >= 2) {
            method.typeParameters!.responseType = typeArgs[1]!.getType();
        }

        methods.push(method);
    }

    return methods;
}

// Transform createProtobufModel calls
export function transformProtobufModel(sourceFile: SourceFile, { log, path, opt }: WizPluginContext) {
    const calls = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(
            (call: CallExpression) =>
                call.getExpression().getText() === createProtobufModel.name && call.getTypeArguments().length >= 1,
        );

    for (const call of calls) {
        log(`Transforming createProtobufModel call at ${path}:${call.getStartLineNumber()}:${call.getStartLinePos()}`);

        const typeArg = call.getTypeArguments()[0]!;
        const type = typeArg.getType();

        // Only tuple types are supported
        if (!type.isTuple()) {
            throw new Error(
                `createProtobufModel only accepts tuple types. Use createProtobufModel<[YourType]>() instead of createProtobufModel<YourType>(). Found at ${path}:${call.getStartLineNumber()}`,
            );
        }

        // Extract package name from package.json or default
        const packageName = "api"; // TODO: Extract from nearest package.json

        // Generate protobuf model
        const tupleElements = type.getTupleElements();
        const typeNames = collectTypeNames(tupleElements);
        const model = codegen(tupleElements, typeNames, packageName, opt);

        call.replaceWithText(JSON.stringify(model, null, 2));
    }
}

// Transform createProtobufSpec calls
export function transformProtobufSpec(sourceFile: SourceFile, { log, path, opt }: WizPluginContext) {
    const calls = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(
            (call: CallExpression) =>
                call.getExpression().getText() === createProtobufSpec.name && call.getTypeArguments().length >= 1,
        );

    if (calls.length === 0) return;

    const rpcMethods = extractRpcMethods(sourceFile);

    for (const call of calls) {
        log(`Transforming createProtobufSpec call at ${path}:${call.getStartLineNumber()}:${call.getStartLinePos()}`);

        const typeArg = call.getTypeArguments()[0]!;
        const type = typeArg.getType();

        // Only tuple types are supported
        if (!type.isTuple()) {
            throw new Error(
                `createProtobufSpec only accepts tuple types. Use createProtobufSpec<[YourType]>() instead of createProtobufSpec<YourType>(). Found at ${path}:${call.getStartLineNumber()}`,
            );
        }

        // Parse config
        const config = parseProtobufConfig(call, log, path);

        // Generate protobuf model (messages)
        const tupleElements = type.getTupleElements();
        const typeNames = collectTypeNames(tupleElements);
        const model = codegen(tupleElements, typeNames, config.packageName, opt);

        // Add services if RPC methods are found
        if (rpcMethods.length > 0 && config.serviceName) {
            const serviceMethods = rpcMethods.map((method) => {
                const requestTypeName = method.typeParameters?.requestType
                    ? extractTypeName(method.typeParameters.requestType)
                    : "google.protobuf.Empty";
                const responseTypeName = method.typeParameters?.responseType
                    ? extractTypeName(method.typeParameters.responseType)
                    : "google.protobuf.Empty";

                return {
                    name: method.name,
                    requestType: requestTypeName,
                    responseType: responseTypeName,
                };
            });

            model.services = {
                [config.serviceName]: {
                    name: config.serviceName,
                    methods: serviceMethods,
                },
            };
        }

        call.replaceWithText(JSON.stringify(model, null, 2));
    }
}

// Main transformer function
export function transformProtobuf(sourceFile: SourceFile, context: WizPluginContext) {
    transformProtobufModel(sourceFile, context);
    transformProtobufSpec(sourceFile, context);
}
