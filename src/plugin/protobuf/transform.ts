import { Node, SyntaxKind, Type, type CallExpression, type SourceFile } from "ts-morph";

import type { WizPluginContext } from "..";
import { createProtobufModel, createProtobufSpec, rpcCall } from "../../protobuf";
import { createProtobufModel as codegen, protobufModelToString } from "./codegen";

const RPC_METHODS = new Set(["rpc"]);

// JSDoc metadata for RPC calls
interface JSDocRpcMetadata {
    hasRpcCallTag: boolean;
    serviceName?: string;
}

// Type for nodes that support JSDoc
interface JSDocableNode {
    getJsDocs?: () => any[];
}

// Type for compiler nodes with JSDoc
interface CompilerNodeWithJSDoc {
    jsDoc?: Array<{
        tags?: Array<{
            tagName?: { text?: string };
            comment?: string;
        }>;
    }>;
}

// Extract @rpcCall and @rpcService tags from JSDoc
function extractRpcFromJSDoc(node?: Node): JSDocRpcMetadata {
    const metadata: JSDocRpcMetadata = {
        hasRpcCallTag: false,
    };

    if (!node) return metadata;

    // First try the standard getJsDocs method
    const jsDocableNode = node as JSDocableNode;
    if (typeof jsDocableNode.getJsDocs === "function") {
        const jsDocs = jsDocableNode.getJsDocs();
        if (jsDocs && jsDocs.length > 0) {
            for (const jsDoc of jsDocs) {
                const tags = jsDoc.getTags?.() || [];
                for (const tag of tags) {
                    const tagName = tag.getTagName();
                    const comment = tag.getComment?.();
                    const commentText = typeof comment === "string" ? comment.trim() : "";

                    switch (tagName) {
                        case "rpcCall":
                            metadata.hasRpcCallTag = true;
                            break;

                        case "rpcService":
                            if (commentText) {
                                metadata.serviceName = commentText;
                            }
                            break;
                    }
                }
            }
            return metadata;
        }
    }

    // For property assignments, check the compiler node's jsDoc property
    const compilerNode = node.compilerNode as CompilerNodeWithJSDoc;
    if (compilerNode && compilerNode.jsDoc) {
        for (const jsDoc of compilerNode.jsDoc) {
            if (jsDoc.tags) {
                for (const tag of jsDoc.tags) {
                    const tagName = tag.tagName?.text;
                    const comment = tag.comment;

                    switch (tagName) {
                        case "rpcCall":
                            metadata.hasRpcCallTag = true;
                            break;

                        case "rpcService":
                            if (comment) {
                                metadata.serviceName = comment;
                            }
                            break;
                    }
                }
            }
        }
    }

    return metadata;
}

// Extract function parameter and return types
function extractFunctionTypes(funcNode: Node): { requestType?: Type; responseType?: Type } | undefined {
    if (
        Node.isArrowFunction(funcNode) ||
        Node.isFunctionExpression(funcNode) ||
        Node.isFunctionDeclaration(funcNode) ||
        Node.isMethodDeclaration(funcNode)
    ) {
        const params = funcNode.getParameters();
        if (params.length > 0) {
            const firstParam = params[0];
            if (firstParam) {
                const paramType = firstParam.getType();
                const returnType = funcNode.getReturnType();

                return {
                    requestType: paramType,
                    responseType: returnType,
                };
            }
        }
    }

    return undefined;
}

interface ParsedRpcMethod {
    name: string;
    serviceName?: string;
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

// Helper: Collect type declarations from tuple elements
function collectTypeDeclarations(tupleElements: Type[]): (Node | undefined)[] {
    return tupleElements.map((element) => {
        const aliasSymbol = element.getAliasSymbol();
        if (aliasSymbol) {
            const declarations = aliasSymbol.getDeclarations();
            return declarations[0];
        }
        const symbol = element.getSymbol();
        if (symbol) {
            const declarations = symbol.getDeclarations();
            return declarations[0];
        }
        return undefined;
    });
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

    // 1. Extract from rpcCall() function calls
    const calls = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter((call: CallExpression) => call.getExpression().getText() === rpcCall.name);

    for (const call of calls) {
        // Find the property assignment this call is part of
        let current = call.getParent();
        let methodName: string | undefined;
        let serviceName: string | undefined;

        while (current) {
            if (Node.isPropertyAssignment(current)) {
                const name = current.getName();
                if (name) {
                    methodName = name;

                    // Check for @rpcService on parent object literal's variable declaration
                    let parent: Node | undefined = current.getParent();
                    while (parent) {
                        if (Node.isVariableDeclaration(parent)) {
                            const metadata = extractRpcFromJSDoc(parent.getParent());
                            if (metadata.serviceName) {
                                serviceName = metadata.serviceName;
                            }
                            break;
                        }
                        parent = parent.getParent();
                    }
                    break;
                }
            }
            current = current.getParent();
        }

        if (!methodName) {
            continue;
        }

        // Extract type parameters from call site
        const typeArgs = call.getTypeArguments();
        const method: ParsedRpcMethod = {
            name: methodName,
            serviceName,
            typeParameters: {},
        };

        if (typeArgs.length >= 1) {
            method.typeParameters!.requestType = typeArgs[0]!.getType();
        }

        if (typeArgs.length >= 2) {
            method.typeParameters!.responseType = typeArgs[1]!.getType();
        }

        // If type parameters are not provided, try to extract from function argument
        if (typeArgs.length === 0) {
            const args = call.getArguments();
            if (args.length > 0) {
                const funcArg = args[0];
                if (funcArg) {
                    const funcTypes = extractFunctionTypes(funcArg);
                    if (funcTypes) {
                        method.typeParameters!.requestType = funcTypes.requestType;
                        method.typeParameters!.responseType = funcTypes.responseType;
                    }
                }
            }
        }

        methods.push(method);
    }

    // 2. Extract from @rpcCall JSDoc annotations on functions
    const functions = [
        ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
        ...sourceFile.getDescendantsOfKind(SyntaxKind.VariableStatement),
        ...sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration),
    ];

    for (const node of functions) {
        let funcNode: Node | undefined;
        let methodName: string | undefined;
        let serviceName: string | undefined;

        if (Node.isFunctionDeclaration(node)) {
            const metadata = extractRpcFromJSDoc(node);
            if (metadata.hasRpcCallTag) {
                funcNode = node;
                methodName = node.getName();
                serviceName = metadata.serviceName;
            }
        } else if (Node.isVariableStatement(node)) {
            const declarations = node.getDeclarations();
            for (const decl of declarations) {
                // Check for object literal with methods
                const initializer = decl.getInitializer();
                if (initializer && Node.isObjectLiteralExpression(initializer)) {
                    const objectMetadata = extractRpcFromJSDoc(node);
                    const properties = initializer.getProperties();

                    // If object has @rpcService, treat all function members as RPC calls
                    const shouldTreatAllAsRpcCalls = !!objectMetadata.serviceName;

                    for (const prop of properties) {
                        if (Node.isPropertyAssignment(prop)) {
                            const propValue = prop.getInitializer();
                            if (
                                propValue &&
                                (Node.isArrowFunction(propValue) || Node.isFunctionExpression(propValue))
                            ) {
                                const propMetadata = extractRpcFromJSDoc(prop);
                                // Include if: has @rpcCall tag OR object has @rpcService
                                if (propMetadata.hasRpcCallTag || shouldTreatAllAsRpcCalls) {
                                    const method: ParsedRpcMethod = {
                                        name: prop.getName() || "",
                                        serviceName: propMetadata.serviceName || objectMetadata.serviceName,
                                        typeParameters: {},
                                    };

                                    const funcTypes = extractFunctionTypes(propValue);
                                    if (funcTypes) {
                                        method.typeParameters!.requestType = funcTypes.requestType;
                                        method.typeParameters!.responseType = funcTypes.responseType;
                                    }

                                    methods.push(method);
                                }
                            }
                        }
                    }
                } else if (
                    initializer &&
                    (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))
                ) {
                    // Check for single function with @rpcCall
                    const metadata = extractRpcFromJSDoc(node);
                    if (metadata.hasRpcCallTag) {
                        const method: ParsedRpcMethod = {
                            name: decl.getName(),
                            serviceName: metadata.serviceName,
                            typeParameters: {},
                        };

                        const funcTypes = extractFunctionTypes(initializer);
                        if (funcTypes) {
                            method.typeParameters!.requestType = funcTypes.requestType;
                            method.typeParameters!.responseType = funcTypes.responseType;
                        }

                        methods.push(method);
                    }
                }
            }
        } else if (Node.isMethodDeclaration(node)) {
            const metadata = extractRpcFromJSDoc(node);

            // Check for @rpcService on class
            const classDecl = node.getParent();
            const classMetadata =
                classDecl && Node.isClassDeclaration(classDecl) ? extractRpcFromJSDoc(classDecl) : undefined;

            // Include if: has @rpcCall tag OR class has @rpcService
            const shouldTreatAllAsRpcCalls = !!classMetadata?.serviceName;
            if (metadata.hasRpcCallTag || shouldTreatAllAsRpcCalls) {
                funcNode = node;
                methodName = node.getName();
                serviceName = metadata.serviceName || classMetadata?.serviceName;
            }
        }

        if (funcNode && methodName) {
            const method: ParsedRpcMethod = {
                name: methodName,
                serviceName,
                typeParameters: {},
            };

            const funcTypes = extractFunctionTypes(funcNode);
            if (funcTypes) {
                method.typeParameters!.requestType = funcTypes.requestType;
                method.typeParameters!.responseType = funcTypes.responseType;
            }

            methods.push(method);
        }
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
        const typeDeclarations = collectTypeDeclarations(tupleElements);
        const model = codegen(tupleElements, typeNames, packageName, opt, typeDeclarations);

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
        const typeDeclarations = collectTypeDeclarations(tupleElements);
        const model = codegen(tupleElements, typeNames, config.packageName, opt, typeDeclarations);

        // Group RPC methods by service name
        const serviceGroups = new Map<string, ParsedRpcMethod[]>();

        for (const method of rpcMethods) {
            // Determine the service name: from method, from config, or default
            const serviceName = method.serviceName || config.serviceName || "DefaultService";

            if (!serviceGroups.has(serviceName)) {
                serviceGroups.set(serviceName, []);
            }
            const serviceMethodList = serviceGroups.get(serviceName);
            if (serviceMethodList) {
                serviceMethodList.push(method);
            }
        }

        // Add services if RPC methods are found
        if (serviceGroups.size > 0) {
            model.services = {};

            for (const [serviceName, serviceMethods] of serviceGroups) {
                const methods = serviceMethods.map((method) => {
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

                model.services[serviceName] = {
                    name: serviceName,
                    methods,
                };
            }
        }

        call.replaceWithText(JSON.stringify(model, null, 2));
    }
}

// Main transformer function
export function transformProtobuf(sourceFile: SourceFile, context: WizPluginContext) {
    transformProtobufModel(sourceFile, context);
    transformProtobufSpec(sourceFile, context);
}
