import {
    Node,
    SyntaxKind,
    Type,
    type ArrowFunction,
    type CallExpression,
    type ObjectLiteralExpression,
    type PropertyAssignment,
    type SourceFile,
    type TypeNode,
} from "ts-morph";

import type { WizPluginContext } from "..";
import {
    createOpenApi,
    createOpenApiSpec,
    createOpenApiSchema,
    createOpenApiModel,
    typedPath,
    openApiPath,
} from "../../openApiSchema";
import {
    extractJSDocMetadata,
    extractOpenApiFromJSDoc,
    mergeJSDocIntoSchema,
    type JSDocOpenApiPathMetadata,
} from "./codegen";
import { createOpenApiSchemaViaIr as codegen } from "./codegen-ir";

// OpenAPI version constants
const OPENAPI_VERSION_3_0 = "3.0.3";
const OPENAPI_VERSION_3_1 = "3.1.0";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

// Type for individual schema in components.schemas
type SchemaValue = {
    type?: string;
    properties?: Record<string, unknown>;
    items?: unknown;
    enum?: unknown[];
    required?: string[];
    title?: string;
    [key: string]: unknown;
};

interface ParsedPathOperation {
    method: string;
    path: string;
    typeParameters?: {
        pathParams?: Type;
        queryParams?: Type;
        requestBody?: Type;
        responseBody?: Type;
    };
    jsDocMetadata?: JSDocOpenApiPathMetadata;
}

interface ConfigParseResult {
    config: Record<string, unknown>;
    pathOperations: ParsedPathOperation[];
}

// Helper: Extract OpenAPI version from type arguments
function extractOpenApiVersion(call: CallExpression, path: string): "3.0" | "3.1" {
    const typeArgs = call.getTypeArguments();
    let openApiVersion: "3.0" | "3.1" = "3.0"; // default

    if (typeArgs.length >= 2) {
        const versionTypeArg = typeArgs[1];
        if (!versionTypeArg) {
            throw new Error(`OpenAPI version type parameter is missing. Found at ${path}:${call.getStartLineNumber()}`);
        }
        const versionText = versionTypeArg.getText().replace(/['"]/g, "");
        if (versionText !== "3.0" && versionText !== "3.1") {
            throw new Error(
                `OpenAPI version type parameter must be "3.0" or "3.1". Got: ${versionText}. Found at ${path}:${call.getStartLineNumber()}`,
            );
        }
        openApiVersion = versionText as "3.0" | "3.1";
    }

    return openApiVersion;
}

// Helper: Check if a type is a special TypeScript type that should be filtered
function isSpecialType(element: Type): boolean {
    // Check for any, never, void, unknown types
    if (element.isAny() || element.isNever() || element.isUnknown()) {
        return true;
    }
    
    // Check for void using TypeFlags
    const flags = element.getFlags();
    if ((flags & (1 << 14)) !== 0) { // TypeFlags.Void = 1 << 14
        return true;
    }
    
    return false;
}

// Helper: Extract type name from tuple element
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
        throw new Error(`Unable to determine a valid type name for tuple element: ${element.getText()}`);
    }

    return typeName;
}

// Helper: Collect type names from tuple elements
function collectTypeNames(tupleElements: Type[]): Map<Type, string> {
    const typeNames = new Map<Type, string>();
    const usedNames = new Set<string>();

    for (const element of tupleElements) {
        // Skip special types (any, never, void, unknown)
        if (isSpecialType(element)) {
            continue;
        }
        
        const typeName = extractTypeName(element);

        if (usedNames.has(typeName)) {
            throw new Error(
                `Duplicate type name '${typeName}' detected in tuple. Each type in the tuple must have a unique name.`,
            );
        }

        usedNames.add(typeName);
        typeNames.set(element, typeName);
    }

    return typeNames;
}

// Helper: Generate schemas from tuple elements
function generateSchemas(
    tupleElements: Type[],
    typeNames: Map<Type, string>,
    openApiVersion: "3.0" | "3.1",
    opt: WizPluginContext["opt"],
): Record<string, SchemaValue> {
    const schemas: Record<string, SchemaValue> = {};
    const availableTypes = new Set(typeNames.values());

    for (const element of tupleElements) {
        const typeName = typeNames.get(element)!;
        const processingStack = new Set<string>();
        const aliasSymbol = element.getAliasSymbol();
        const typeAliasDeclaration = aliasSymbol?.getDeclarations()[0];

        const schema = codegen(element, {
            typeNode: undefined,
            settings: {
                coerceSymbolsToStrings: Boolean(opt?.coerceSymbolsToStrings),
                transformDate: opt?.transformDate,
                unionStyle: opt?.unionStyle,
                openApiVersion,
            },
            availableTypes,
            processingStack,
            typeAliasDeclaration,
        });

        const schemaObj = schema as SchemaValue;
        if (typeof schemaObj === "object" && schemaObj !== null && !("title" in schemaObj)) {
            schemaObj.title = typeName;
        }

        schemas[typeName] = schemaObj;
    }

    return schemas;
}

// Helper: Convert JS object notation to JSON
function jsObjectToJson(text: string): string {
    return text.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":').replace(/'/g, '"');
}

// Helper: Extract string value from path argument
function extractPathString(pathArg: Node): string {
    if (Node.isStringLiteral(pathArg) || Node.isNoSubstitutionTemplateLiteral(pathArg)) {
        return pathArg.getLiteralText();
    }
    // Fallback: strip quotes manually
    return pathArg.getText().replace(/^['"]|['"]$/g, "");
}

// Helper: Extract path operations from array literal
function extractPathOperations(arrayLiteral: Node): ParsedPathOperation[] {
    const operations: ParsedPathOperation[] = [];

    if (!Node.isArrayLiteralExpression(arrayLiteral)) {
        return operations;
    }

    const elements = arrayLiteral.getElements();
    for (const element of elements) {
        if (!Node.isCallExpression(element)) continue;
        const expression = element.getExpression();
        if (!Node.isPropertyAccessExpression(expression)) continue;

        const args = element.getArguments();
        const pathArg = args[0];
        if (!pathArg) continue;

        const pathValue = extractPathString(pathArg);
        const method = expression.getName();
        const typeArgs = element.getTypeArguments();
        const typeParameters = buildTypeParametersFromTypeArgs(typeArgs);

        operations.push({ method, path: pathValue, typeParameters });
    }

    return operations;
}

function buildTypeParametersFromTypeArgs(typeArgs: TypeNode[]): ParsedPathOperation["typeParameters"] | undefined {
    if (typeArgs.length === 0) {
        return undefined;
    }

    const resolvedTypes = typeArgs.map((arg) => arg.getType());
    const [pathParams, queryParams, requestBody, responseBody] = resolvedTypes;

    if (!pathParams && !queryParams && !requestBody && !responseBody) {
        return undefined;
    }

    return {
        pathParams,
        queryParams,
        requestBody,
        responseBody,
    };
}

function findParentPropertyAssignment(node: Node): PropertyAssignment | undefined {
    let current: Node | undefined = node.getParent();
    let child: Node = node;

    while (current) {
        if (Node.isPropertyAssignment(current) && current.getInitializer() === child) {
            return current;
        }

        child = current;
        current = current.getParent();
    }

    return undefined;
}

function getPropertyAssignmentName(prop: PropertyAssignment): string | undefined {
    const nameNode = prop.getNameNode();

    if (Node.isIdentifier(nameNode)) {
        return nameNode.getText();
    }

    if (Node.isStringLiteral(nameNode) || Node.isNoSubstitutionTemplateLiteral(nameNode)) {
        return nameNode.getLiteralText();
    }

    if (Node.isComputedPropertyName(nameNode)) {
        const expr = nameNode.getExpression();
        if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) {
            return expr.getLiteralText();
        }
    }

    return undefined;
}

function getPathFromPropertyAssignment(prop: PropertyAssignment): string | undefined {
    const nameNode = prop.getNameNode();

    if (Node.isStringLiteral(nameNode) || Node.isNoSubstitutionTemplateLiteral(nameNode)) {
        return nameNode.getLiteralText();
    }

    if (Node.isIdentifier(nameNode)) {
        return nameNode.getText();
    }

    if (Node.isComputedPropertyName(nameNode)) {
        const expr = nameNode.getExpression();
        if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) {
            return expr.getLiteralText();
        }
    }

    return undefined;
}

function extractTypedPathOperations(sourceFile: SourceFile): ParsedPathOperation[] {
    const operations: ParsedPathOperation[] = [];
    const calls = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(
            (call) =>
                call.getExpression().getText() === typedPath.name ||
                call.getExpression().getText() === openApiPath.name,
        );

    for (const call of calls) {
        const methodAssignment = findParentPropertyAssignment(call);
        if (!methodAssignment) {
            continue;
        }

        const methodName = getPropertyAssignmentName(methodAssignment)?.toLowerCase();
        if (!methodName || !HTTP_METHODS.has(methodName)) {
            continue;
        }

        const methodObject = methodAssignment.getParentIfKind(SyntaxKind.ObjectLiteralExpression);
        if (!methodObject) {
            continue;
        }

        const pathAssignment = findParentPropertyAssignment(methodObject);
        if (!pathAssignment) {
            continue;
        }

        const pathValue = getPathFromPropertyAssignment(pathAssignment);
        if (!pathValue) {
            continue;
        }

        const typeParameters = buildTypeParametersFromTypeArgs(call.getTypeArguments());

        operations.push({
            method: methodName,
            path: pathValue,
            typeParameters,
        });
    }

    return operations;
}

// Helper: Extract path operations from JSDoc comments on functions
function extractJSDocPathOperations(
    sourceFile: SourceFile,
    log: (msg: string) => void,
    path: string,
): ParsedPathOperation[] {
    const operations: ParsedPathOperation[] = [];

    // Find all function declarations and function expressions
    const functionDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    const functionExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression);

    // For arrow functions, check variable statements since JSDoc is attached there
    const variableStatements = sourceFile.getDescendantsOfKind(SyntaxKind.VariableStatement);

    const allFunctions = [...functionDeclarations, ...functionExpressions, ...variableStatements];

    for (const func of allFunctions) {
        const metadata = extractOpenApiFromJSDoc(func);

        if (!metadata.hasOpenApiTag) {
            continue;
        }

        // @path is required
        if (!metadata.path) {
            log(`Warning: Function with @openApi tag at ${path}:${func.getStartLineNumber()} is missing @path tag`);
            continue;
        }

        // Default method to GET if not specified
        const method = metadata.method || "get";

        // Validate method
        if (!HTTP_METHODS.has(method)) {
            log(`Warning: Invalid HTTP method '${method}' at ${path}:${func.getStartLineNumber()}. Using GET instead.`);
        }

        // Create operation with JSDoc metadata
        const operation: ParsedPathOperation = {
            method: HTTP_METHODS.has(method) ? method : "get",
            path: metadata.path,
            jsDocMetadata: metadata,
        };

        operations.push(operation);
    }

    return operations;
}

// Helper: Get returned object from arrow function body
function getReturnedObject(body: Node): ObjectLiteralExpression | undefined {
    if (Node.isBlock(body)) {
        const returnStmt = body.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0];
        const expr = returnStmt?.getExpression();
        if (expr && Node.isObjectLiteralExpression(expr)) {
            return expr;
        }
    } else if (Node.isObjectLiteralExpression(body)) {
        return body;
    } else if (Node.isParenthesizedExpression(body)) {
        const inner = body.getExpression();
        if (inner && Node.isObjectLiteralExpression(inner)) {
            return inner;
        }
    }
    return undefined;
}

// Helper: Parse object literal properties
function parseObjectLiteralConfig(
    objLiteral: Node,
    log: (msg: string) => void,
    callPath: string,
    lineNum: number,
): ConfigParseResult {
    const config: Record<string, unknown> = {};
    const pathOperations: ParsedPathOperation[] = [];

    if (!Node.isObjectLiteralExpression(objLiteral)) {
        return { config, pathOperations };
    }

    const properties = objLiteral.getProperties();
    for (const prop of properties) {
        if (!Node.isPropertyAssignment(prop)) {
            continue;
        }
        const propName = prop.getName();
        const initializer = prop.getInitializer();

        if (!initializer) continue;

        if (propName === "paths") {
            pathOperations.push(...extractPathOperations(initializer));
        } else {
            try {
                const jsonText = jsObjectToJson(initializer.getText());
                config[propName] = JSON.parse(jsonText);
            } catch (e) {
                log(`Warning: Could not parse property ${propName} at ${callPath}:${lineNum}`);
            }
        }
    }

    return { config, pathOperations };
}

// Helper: Parse arrow function config
function parseArrowFunctionConfig(
    arrowFunc: ArrowFunction,
    log: (msg: string) => void,
    callPath: string,
    lineNum: number,
): ConfigParseResult {
    try {
        const body = arrowFunc.getBody();
        const returnedObj = getReturnedObject(body);

        if (returnedObj) {
            return parseObjectLiteralConfig(returnedObj, log, callPath, lineNum);
        }
    } catch (e) {
        const error = e as Error;
        log(
            `Warning: Could not parse callback parameter at ${callPath}:${lineNum}: ${error.message}. Using empty config.`,
        );
    }

    return { config: {}, pathOperations: [] };
}

// Helper: Parse config parameter (object literal or arrow function)
function parseConfigParameter(
    configArg: Node,
    log: (msg: string) => void,
    callPath: string,
    lineNum: number,
): ConfigParseResult {
    const kind = configArg.getKind();

    if (Node.isArrowFunction(configArg)) {
        return parseArrowFunctionConfig(configArg, log, callPath, lineNum);
    } else if (Node.isObjectLiteralExpression(configArg)) {
        return parseObjectLiteralConfig(configArg, log, callPath, lineNum);
    } else {
        log(
            `Warning: Config parameter at ${callPath}:${lineNum} is not an object literal or arrow function. Using empty config.`,
        );
        return { config: {}, pathOperations: [] };
    }
}

// Helper: Check if type is 'never'
function isNeverType(type: Type | undefined): boolean {
    if (!type) return true;
    return type.isNever?.() || type.getText() === "never";
}

// Helper: Check if type should use $ref
function shouldUseRef(type: Type, availableSchemas: Set<string>): boolean {
    const typeName = type.getAliasSymbol()?.getName() || type.getSymbol()?.getName();
    return typeName ? availableSchemas.has(typeName) : false;
}

// Helper: Get type name for a type
// Used for $ref generation and x-type-name extension
function getTypeName(type: Type): string | undefined {
    return type.getAliasSymbol()?.getName() || type.getSymbol()?.getName();
}

// Helper: Build parameter schema from type
function buildParameterSchema(
    type: Type,
    openApiVersion: "3.0" | "3.1",
    opt: WizPluginContext["opt"],
    availableSchemas: Set<string>,
    declaration?: Node,
): unknown {
    if (shouldUseRef(type, availableSchemas)) {
        const typeName = getTypeName(type);
        return { $ref: `#/components/schemas/${typeName}` };
    }

    // Generate inline schema
    const schema = codegen(type, {
        typeNode: undefined,
        settings: {
            coerceSymbolsToStrings: Boolean(opt?.coerceSymbolsToStrings),
            transformDate: opt?.transformDate,
            unionStyle: opt?.unionStyle,
            openApiVersion,
        },
        availableTypes: availableSchemas,
        processingStack: new Set<string>(),
        typeAliasDeclaration: undefined,
    });

    if (declaration && typeof schema === "object" && schema !== null) {
        const metadata = extractJSDocMetadata(declaration);
        if (Object.keys(metadata).length > 0) {
            return mergeJSDocIntoSchema(schema as Record<string, unknown>, metadata);
        }
    }

    return schema;
}

// Helper: Extract parameters from path and query types
function extractParameters(
    pathParamsType: Type | undefined,
    queryParamsType: Type | undefined,
    pathString: string,
    openApiVersion: "3.0" | "3.1",
    opt: WizPluginContext["opt"],
    availableSchemas: Set<string>,
): unknown[] | undefined {
    const parameters: unknown[] = [];

    // Extract path parameters
    if (pathParamsType && !isNeverType(pathParamsType)) {
        const properties = pathParamsType.getProperties();
        // Get the type name for the path parameters type
        const pathParamsTypeName = getTypeName(pathParamsType);

        for (const prop of properties) {
            const declaration = prop.getDeclarations()[0];
            if (!declaration) continue;
            const propType = prop.getTypeAtLocation(declaration);
            const schema = buildParameterSchema(propType, openApiVersion, opt, availableSchemas, declaration);

            // Add x-type-name extension if we have a named type (not anonymous __type)
            const paramWithTypeName: any = {
                name: prop.getName(),
                in: "path",
                required: true,
                schema,
            };

            if (pathParamsTypeName && pathParamsTypeName !== "__type") {
                paramWithTypeName["x-type-name"] = pathParamsTypeName;
            }

            parameters.push(paramWithTypeName);
        }
    }

    // Extract query parameters
    if (queryParamsType && !isNeverType(queryParamsType)) {
        const properties = queryParamsType.getProperties();
        // Get the type name for the query parameters type
        const queryParamsTypeName = getTypeName(queryParamsType);

        for (const prop of properties) {
            const declaration = prop.getDeclarations()[0];
            if (!declaration) continue;
            const propType = prop.getTypeAtLocation(declaration);
            const schema = buildParameterSchema(propType, openApiVersion, opt, availableSchemas, declaration);
            const isOptional = prop.isOptional?.() || false;

            // Add x-type-name extension if we have a named type (not anonymous __type)
            const paramWithTypeName: any = {
                name: prop.getName(),
                in: "query",
                required: !isOptional,
                schema,
            };

            if (queryParamsTypeName && queryParamsTypeName !== "__type") {
                paramWithTypeName["x-type-name"] = queryParamsTypeName;
            }

            parameters.push(paramWithTypeName);
        }
    }

    return parameters.length > 0 ? parameters : undefined;
}

// Helper: Build request body from type
function buildRequestBody(
    requestBodyType: Type | undefined,
    openApiVersion: "3.0" | "3.1",
    opt: WizPluginContext["opt"],
    availableSchemas: Set<string>,
): unknown | undefined {
    if (!requestBodyType || isNeverType(requestBodyType)) {
        return undefined;
    }

    const schema = buildParameterSchema(requestBodyType, openApiVersion, opt, availableSchemas);

    return {
        required: true,
        content: {
            "application/json": {
                schema,
            },
        },
    };
}

// Helper: Build responses from type
function buildResponses(
    responseBodyType: Type | undefined,
    openApiVersion: "3.0" | "3.1",
    opt: WizPluginContext["opt"],
    availableSchemas: Set<string>,
): unknown {
    if (!responseBodyType || isNeverType(responseBodyType)) {
        return {
            "200": {
                description: "Successful response",
            },
        };
    }

    const schema = buildParameterSchema(responseBodyType, openApiVersion, opt, availableSchemas);

    return {
        "200": {
            description: "Successful response",
            content: {
                "application/json": {
                    schema,
                },
            },
        },
    };
}

// Helper: Build OpenAPI paths from operations
function buildOpenApiPaths(
    pathOperations: ParsedPathOperation[],
    openApiVersion: "3.0" | "3.1",
    opt: WizPluginContext["opt"],
    availableSchemas: Set<string>,
): Record<string, Record<string, unknown>> {
    const paths: Record<string, Record<string, unknown>> = {};

    for (const operation of pathOperations) {
        const pathKey = operation.path;
        const method = operation.method.toLowerCase();

        if (!paths[pathKey]) {
            paths[pathKey] = {};
        }

        const operationObj: Record<string, unknown> = {};

        // Check if this operation has JSDoc metadata
        if (operation.jsDocMetadata) {
            const metadata = operation.jsDocMetadata;

            // Add summary and description
            if (metadata.summary) {
                operationObj.summary = metadata.summary;
            }
            if (metadata.description) {
                operationObj.description = metadata.description;
            }

            // Add operationId
            if (metadata.operationId) {
                operationObj.operationId = metadata.operationId;
            }

            // Add tags
            if (metadata.tags && metadata.tags.length > 0) {
                operationObj.tags = metadata.tags;
            }

            // Add deprecated flag
            if (metadata.deprecated) {
                operationObj.deprecated = true;
            }

            // Build parameters from JSDoc
            const parameters: unknown[] = [];

            // Add path parameters
            if (metadata.pathParams) {
                for (const [name, param] of Object.entries(metadata.pathParams)) {
                    parameters.push({
                        name,
                        in: "path",
                        required: true,
                        schema: buildSchemaFromType(param.type),
                        ...(param.description ? { description: param.description } : {}),
                    });
                }
            }

            // Add query parameters
            if (metadata.queryParams) {
                for (const [name, param] of Object.entries(metadata.queryParams)) {
                    parameters.push({
                        name,
                        in: "query",
                        required: param.required !== false,
                        schema: buildSchemaFromType(param.type),
                        ...(param.description ? { description: param.description } : {}),
                    });
                }
            }

            // Add header parameters
            if (metadata.headers) {
                for (const [name, param] of Object.entries(metadata.headers)) {
                    parameters.push({
                        name,
                        in: "header",
                        required: param.required !== false,
                        schema: buildSchemaFromType(param.type),
                        ...(param.description ? { description: param.description } : {}),
                    });
                }
            }

            if (parameters.length > 0) {
                operationObj.parameters = parameters;
            }

            // Add request body
            if (metadata.requestBody) {
                const contentType = metadata.requestBody.contentType || "application/json";
                const schema = availableSchemas.has(metadata.requestBody.type)
                    ? { $ref: `#/components/schemas/${metadata.requestBody.type}` }
                    : buildSchemaFromType(metadata.requestBody.type);

                operationObj.requestBody = {
                    required: true,
                    content: {
                        [contentType]: {
                            schema,
                        },
                    },
                    ...(metadata.requestBody.description ? { description: metadata.requestBody.description } : {}),
                };
            }

            // Add responses
            if (metadata.responses && metadata.responses.length > 0) {
                const responses: Record<string, unknown> = {};
                for (const response of metadata.responses) {
                    const responseObj: Record<string, unknown> = {
                        description: response.description || "Response",
                    };

                    if (response.type) {
                        const contentType = response.contentType || "application/json";
                        const schema = availableSchemas.has(response.type)
                            ? { $ref: `#/components/schemas/${response.type}` }
                            : buildSchemaFromType(response.type);

                        responseObj.content = {
                            [contentType]: {
                                schema,
                            },
                        };
                    }

                    responses[String(response.status)] = responseObj;
                }
                operationObj.responses = responses;
            } else {
                // Default response
                operationObj.responses = {
                    "200": {
                        description: "Successful response",
                    },
                };
            }
        }
        // Handle type parameters (existing logic)
        else if (operation.typeParameters) {
            const { pathParams, queryParams, requestBody, responseBody } = operation.typeParameters;

            const parameters = extractParameters(
                pathParams,
                queryParams,
                pathKey,
                openApiVersion,
                opt,
                availableSchemas,
            );

            if (parameters) {
                operationObj.parameters = parameters;
            }

            const requestBodyObj = buildRequestBody(requestBody, openApiVersion, opt, availableSchemas);
            if (requestBodyObj) {
                operationObj.requestBody = requestBodyObj;
            }

            operationObj.responses = buildResponses(responseBody, openApiVersion, opt, availableSchemas);
        } else {
            // Default response when no type parameters
            operationObj.responses = {
                "200": {
                    description: "Successful response",
                },
            };
        }

        paths[pathKey][method] = operationObj;
    }

    return paths;
}

// Helper: Build a simple schema object from a type string (for JSDoc-based parameters)
function buildSchemaFromType(typeStr: string): Record<string, unknown> {
    const normalized = typeStr.trim().toLowerCase();

    switch (normalized) {
        case "string":
            return { type: "string" };
        case "number":
            return { type: "number" };
        case "integer":
        case "int":
            return { type: "integer" };
        case "boolean":
        case "bool":
            return { type: "boolean" };
        case "array":
            return { type: "array", items: {} };
        case "object":
            return { type: "object" };
        default:
            // If it's not a primitive, treat it as a custom type
            // Return as-is, might be a reference to a type
            return { type: "object" };
    }
}

// Helper: Build OpenAPI spec from config and schemas
function buildOpenApiSpec(
    openApiVersion: "3.0" | "3.1",
    config: Record<string, unknown>,
    schemas: Record<string, SchemaValue>,
    pathOperations: ParsedPathOperation[],
    opt: WizPluginContext["opt"],
): Record<string, unknown> {
    const spec: Record<string, unknown> = {
        openapi: openApiVersion === "3.1" ? OPENAPI_VERSION_3_1 : OPENAPI_VERSION_3_0,
        info: config.info || {
            title: "API",
            version: "1.0.0",
        },
        components: {
            schemas,
        },
    };

    // Add optional fields from config
    if (config.servers) spec.servers = config.servers;
    if (config.security) spec.security = config.security;
    if (config.tags) spec.tags = config.tags;
    if (config.externalDocs) spec.externalDocs = config.externalDocs;

    // Add paths
    const availableSchemas = new Set(Object.keys(schemas));
    spec.paths =
        pathOperations.length > 0 ? buildOpenApiPaths(pathOperations, openApiVersion, opt, availableSchemas) : {};

    return spec;
}

export function transformOpenApiSchema(sourceFile: SourceFile, { log, path, opt }: WizPluginContext) {
    const calls = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(
            (call) =>
                (call.getExpression().getText() === createOpenApiSchema.name ||
                    call.getExpression().getText() === createOpenApiModel.name) &&
                call.getTypeArguments().length >= 1,
        );

    if (calls.length === 0) {
        // Still check for createOpenApi calls even if no createOpenApiSchema/Model calls
        transformCreateOpenApi(sourceFile, { log, path, opt });
        return;
    }

    for (const call of calls) {
        const functionName = call.getExpression().getText();
        log(`Transforming ${functionName} call at ${path}:${call.getStartLineNumber()}:${call.getStartLinePos()}`);

        const openApiVersion = extractOpenApiVersion(call, path);

        // FIXME guard instead of using non-null assertion
        const typeArg = call.getTypeArguments()[0]!;
        const type = typeArg.getType();

        // Only tuple types are supported
        if (!type.isTuple()) {
            throw new Error(
                `${functionName} only accepts tuple types. Use ${functionName}<[YourType]>() instead of ${functionName}<YourType>(). Found at ${path}:${call.getStartLineNumber()}`,
            );
        }

        // Generate composite schema with components.schemas
        const tupleElements = type.getTupleElements();
        const typeNames = collectTypeNames(tupleElements);
        const schemas = generateSchemas(tupleElements, typeNames, openApiVersion, opt);

        const compositeSchema = {
            components: {
                schemas,
            },
        };

        call.replaceWithText(JSON.stringify(compositeSchema, null, 2));
    }

    // Also transform createOpenApi calls
    transformCreateOpenApi(sourceFile, { log, path, opt });
}

// Transform createOpenApi calls to generate full OpenAPI spec
export function transformCreateOpenApi(sourceFile: SourceFile, { log, path, opt }: WizPluginContext) {
    const calls = sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(
            (call) =>
                (call.getExpression().getText() === createOpenApi.name ||
                    call.getExpression().getText() === createOpenApiSpec.name) &&
                call.getTypeArguments().length >= 1,
        );

    if (calls.length === 0) return;

    const typedPathOperations = extractTypedPathOperations(sourceFile);
    const jsDocPathOperations = extractJSDocPathOperations(sourceFile, log, path);

    for (const call of calls) {
        const functionName = call.getExpression().getText();
        log(`Transforming ${functionName} call at ${path}:${call.getStartLineNumber()}:${call.getStartLinePos()}`);

        const openApiVersion = extractOpenApiVersion(call, path);

        // Parse config parameter
        const args = call.getArguments();
        let configObj: Record<string, unknown> = {};
        let pathOperations: ParsedPathOperation[] = [];

        const configArg = args[0];
        if (configArg) {
            const parseResult = parseConfigParameter(configArg, log, path, call.getStartLineNumber());
            configObj = parseResult.config;
            pathOperations = parseResult.pathOperations;
        }

        // Get the type argument and validate it's a tuple
        const typeArg = call.getTypeArguments()[0]!;
        const type = typeArg.getType();

        if (!type.isTuple()) {
            throw new Error(
                `${functionName} only accepts tuple types. Use ${functionName}<[YourType]>() instead of ${functionName}<YourType>(). Found at ${path}:${call.getStartLineNumber()}`,
            );
        }

        // Generate component schemas
        const tupleElements = type.getTupleElements();
        const typeNames = collectTypeNames(tupleElements);
        const schemas = generateSchemas(tupleElements, typeNames, openApiVersion, opt);

        // Merge path operations collected from config, typedPath calls, and JSDoc comments
        const mergedPathOperations = [...pathOperations, ...typedPathOperations, ...jsDocPathOperations];

        // Build the full OpenAPI spec
        const openApiSpec = buildOpenApiSpec(openApiVersion, configObj, schemas, mergedPathOperations, opt);

        call.replaceWithText(JSON.stringify(openApiSpec, null, 2));
    }
}
