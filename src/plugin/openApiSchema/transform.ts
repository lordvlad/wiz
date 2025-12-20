import { Type, SyntaxKind, type SourceFile, type CallExpression, type Node } from "ts-morph";
import { createOpenApiSchema as codegen } from "./codegen";
import { createOpenApiSchema, createOpenApi } from "../../openApiSchema/index";
import type { WizPluginContext } from "..";
import { createOpenApiSchema } from "../../openApiSchema/index";
import { createOpenApiSchema as codegen } from "./codegen";

// OpenAPI version constants
const OPENAPI_VERSION_3_0 = "3.0.3";
const OPENAPI_VERSION_3_1 = "3.1.0";

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
        const versionText = versionTypeArg.getText().replace(/['"]/g, '');
        if (versionText !== "3.0" && versionText !== "3.1") {
            throw new Error(`OpenAPI version type parameter must be "3.0" or "3.1". Got: ${versionText}. Found at ${path}:${call.getStartLineNumber()}`);
        }
        openApiVersion = versionText as "3.0" | "3.1";
    }
    
    return openApiVersion;
}

// Helper: Extract type name from tuple element
function extractTypeName(element: Type): string {
    const aliasSymbol = element.getAliasSymbol();
    let typeName: string | undefined = aliasSymbol?.getName();
    
    if (!typeName) {
        const symbol = element.getSymbol();
        typeName = symbol?.getName();
        
        if (!typeName || typeName === '__type') {
            typeName = element.getText().replace(/\s+/g, '');
        }
    }
    
    if (!typeName || typeName === '__type') {
        throw new Error(`Unable to determine a valid type name for tuple element: ${element.getText()}`);
    }
    
    return typeName;
}

// Helper: Collect type names from tuple elements
function collectTypeNames(tupleElements: Type[]): Map<Type, string> {
    const typeNames = new Map<Type, string>();
    const usedNames = new Set<string>();
    
    for (const element of tupleElements) {
        const typeName = extractTypeName(element);
        
        if (usedNames.has(typeName)) {
            throw new Error(`Duplicate type name '${typeName}' detected in tuple. Each type in the tuple must have a unique name.`);
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
    opt: WizPluginContext["opt"]
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
                openApiVersion
            },
            availableTypes,
            processingStack,
            typeAliasDeclaration
        });
        
        const schemaObj = schema as SchemaValue;
        if (typeof schemaObj === 'object' && schemaObj !== null && !('title' in schemaObj)) {
            schemaObj.title = typeName;
        }
        
        schemas[typeName] = schemaObj;
    }
    
    return schemas;
}

// Helper: Convert JS object notation to JSON
function jsObjectToJson(text: string): string {
    return text
        .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
        .replace(/'/g, '"');
}

// Helper: Extract string value from path argument
function extractPathString(pathArg: Node): string {
    if (pathArg.getKind() === SyntaxKind.StringLiteral) {
        return pathArg.getLiteralText();
    }
    // Fallback: strip quotes manually
    return pathArg.getText().replace(/^['"]|['"]$/g, '');
}

// Helper: Extract path operations from array literal
function extractPathOperations(arrayLiteral: Node): ParsedPathOperation[] {
    const operations: ParsedPathOperation[] = [];
    
    if (arrayLiteral.getKind() !== SyntaxKind.ArrayLiteralExpression) {
        return operations;
    }
    
    const elements = arrayLiteral.getElements();
    for (const element of elements) {
        if (element.getKind() === SyntaxKind.CallExpression) {
            const callExpr = element;
            const expression = callExpr.getExpression();
            
            if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
                const propAccess = expression;
                const method = propAccess.getName();
                const args = callExpr.getArguments();
                
                if (args.length > 0) {
                    const pathValue = extractPathString(args[0]);
                    
                    // Extract type parameters if present
                    const typeArgs = callExpr.getTypeArguments();
                    const typeParameters = typeArgs.length >= 4 ? {
                        pathParams: typeArgs[0]?.getType(),
                        queryParams: typeArgs[1]?.getType(),
                        requestBody: typeArgs[2]?.getType(),
                        responseBody: typeArgs[3]?.getType()
                    } : undefined;
                    
                    operations.push({ method, path: pathValue, typeParameters });
                }
            }
        }
    }
    
    return operations;
}

// Helper: Get returned object from arrow function body
function getReturnedObject(body: Node): Node | undefined {
    if (body.getKind() === SyntaxKind.Block) {
        const returnStmt = body.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0];
        return returnStmt?.getExpression();
    } else if (body.getKind() === SyntaxKind.ObjectLiteralExpression) {
        return body;
    } else if (body.getKind() === SyntaxKind.ParenthesizedExpression) {
        const inner = body.getExpression();
        if (inner.getKind() === SyntaxKind.ObjectLiteralExpression) {
            return inner;
        }
    }
    return undefined;
}

// Helper: Parse object literal properties
function parseObjectLiteralConfig(objLiteral: Node, log: (msg: string) => void, callPath: string, lineNum: number): ConfigParseResult {
    const config: Record<string, unknown> = {};
    const pathOperations: ParsedPathOperation[] = [];
    
    if (objLiteral.getKind() !== SyntaxKind.ObjectLiteralExpression) {
        return { config, pathOperations };
    }
    
    const properties = objLiteral.getProperties();
    for (const prop of properties) {
        if (prop.getKind() === SyntaxKind.PropertyAssignment) {
            const propName = prop.getName();
            const initializer = prop.getInitializer();
            
            if (!initializer) continue;
            
            if (propName === 'paths') {
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
    }
    
    return { config, pathOperations };
}

// Helper: Parse arrow function config
function parseArrowFunctionConfig(arrowFunc: Node, log: (msg: string) => void, callPath: string, lineNum: number): ConfigParseResult {
    try {
        const body = arrowFunc.getBody();
        const returnedObj = getReturnedObject(body);
        
        if (returnedObj) {
            return parseObjectLiteralConfig(returnedObj, log, callPath, lineNum);
        }
    } catch (e) {
        const error = e as Error;
        log(`Warning: Could not parse callback parameter at ${callPath}:${lineNum}: ${error.message}. Using empty config.`);
    }
    
    return { config: {}, pathOperations: [] };
}

// Helper: Parse config parameter (object literal or arrow function)
function parseConfigParameter(configArg: Node, log: (msg: string) => void, callPath: string, lineNum: number): ConfigParseResult {
    const kind = configArg.getKind();
    
    if (kind === SyntaxKind.ArrowFunction) {
        return parseArrowFunctionConfig(configArg, log, callPath, lineNum);
    } else if (kind === SyntaxKind.ObjectLiteralExpression) {
        try {
            const jsonText = jsObjectToJson(configArg.getText());
            const config = JSON.parse(jsonText);
            return { config, pathOperations: [] };
        } catch (e) {
            const error = e as Error;
            log(`Warning: Could not parse config parameter at ${callPath}:${lineNum}: ${error.message}. Using empty config.`);
            return { config: {}, pathOperations: [] };
        }
    } else {
        log(`Warning: Config parameter at ${callPath}:${lineNum} is not an object literal or arrow function. Using empty config.`);
        return { config: {}, pathOperations: [] };
    }
}

// Helper: Check if type is 'never'
function isNeverType(type: Type | undefined): boolean {
    if (!type) return true;
    return type.isNever?.() || type.getText() === 'never';
}

// Helper: Check if type should use $ref
function shouldUseRef(type: Type, availableSchemas: Set<string>): boolean {
    const typeName = type.getAliasSymbol()?.getName() || type.getSymbol()?.getName();
    return typeName ? availableSchemas.has(typeName) : false;
}

// Helper: Get schema name for reference
function getSchemaName(type: Type): string | undefined {
    return type.getAliasSymbol()?.getName() || type.getSymbol()?.getName();
}

// Helper: Build parameter schema from type
function buildParameterSchema(type: Type, openApiVersion: "3.0" | "3.1", opt: WizPluginContext["opt"], availableSchemas: Set<string>): unknown {
    if (shouldUseRef(type, availableSchemas)) {
        const schemaName = getSchemaName(type);
        return { $ref: `#/components/schemas/${schemaName}` };
    }
    
    // Generate inline schema
    return codegen(type, {
        typeNode: undefined,
        settings: {
            coerceSymbolsToStrings: Boolean(opt?.coerceSymbolsToStrings),
            transformDate: opt?.transformDate,
            unionStyle: opt?.unionStyle,
            openApiVersion
        },
        availableTypes: availableSchemas,
        processingStack: new Set<string>(),
        typeAliasDeclaration: undefined
    });
}

// Helper: Extract parameters from path and query types
function extractParameters(
    pathParamsType: Type | undefined,
    queryParamsType: Type | undefined,
    pathString: string,
    openApiVersion: "3.0" | "3.1",
    opt: WizPluginContext["opt"],
    availableSchemas: Set<string>
): unknown[] | undefined {
    const parameters: unknown[] = [];
    
    // Extract path parameters
    if (pathParamsType && !isNeverType(pathParamsType)) {
        const properties = pathParamsType.getProperties();
        for (const prop of properties) {
            const propType = prop.getTypeAtLocation(prop.getDeclarations()[0]!);
            const schema = buildParameterSchema(propType, openApiVersion, opt, availableSchemas);
            
            parameters.push({
                name: prop.getName(),
                in: "path",
                required: true,
                schema
            });
        }
    }
    
    // Extract query parameters
    if (queryParamsType && !isNeverType(queryParamsType)) {
        const properties = queryParamsType.getProperties();
        for (const prop of properties) {
            const propType = prop.getTypeAtLocation(prop.getDeclarations()[0]!);
            const schema = buildParameterSchema(propType, openApiVersion, opt, availableSchemas);
            const isOptional = prop.isOptional?.() || false;
            
            parameters.push({
                name: prop.getName(),
                in: "query",
                required: !isOptional,
                schema
            });
        }
    }
    
    return parameters.length > 0 ? parameters : undefined;
}

// Helper: Build request body from type
function buildRequestBody(
    requestBodyType: Type | undefined,
    openApiVersion: "3.0" | "3.1",
    opt: WizPluginContext["opt"],
    availableSchemas: Set<string>
): unknown | undefined {
    if (!requestBodyType || isNeverType(requestBodyType)) {
        return undefined;
    }
    
    const schema = buildParameterSchema(requestBodyType, openApiVersion, opt, availableSchemas);
    
    return {
        required: true,
        content: {
            "application/json": {
                schema
            }
        }
    };
}

// Helper: Build responses from type
function buildResponses(
    responseBodyType: Type | undefined,
    openApiVersion: "3.0" | "3.1",
    opt: WizPluginContext["opt"],
    availableSchemas: Set<string>
): unknown {
    if (!responseBodyType || isNeverType(responseBodyType)) {
        return {
            "200": {
                description: "Successful response"
            }
        };
    }
    
    const schema = buildParameterSchema(responseBodyType, openApiVersion, opt, availableSchemas);
    
    return {
        "200": {
            description: "Successful response",
            content: {
                "application/json": {
                    schema
                }
            }
        }
    };
}

// Helper: Build OpenAPI paths from operations
function buildOpenApiPaths(
    pathOperations: ParsedPathOperation[],
    openApiVersion: "3.0" | "3.1",
    opt: WizPluginContext["opt"],
    availableSchemas: Set<string>
): Record<string, Record<string, unknown>> {
    const paths: Record<string, Record<string, unknown>> = {};
    
    for (const operation of pathOperations) {
        const pathKey = operation.path;
        const method = operation.method.toLowerCase();
        
        if (!paths[pathKey]) {
            paths[pathKey] = {};
        }
        
        const operationObj: Record<string, unknown> = {};
        
        // Add parameters if type parameters are provided
        if (operation.typeParameters) {
            const { pathParams, queryParams, requestBody, responseBody } = operation.typeParameters;
            
            const parameters = extractParameters(
                pathParams,
                queryParams,
                pathKey,
                openApiVersion,
                opt,
                availableSchemas
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
                    description: "Successful response"
                }
            };
        }
        
        paths[pathKey][method] = operationObj;
    }
    
    return paths;
}

// Helper: Build OpenAPI spec from config and schemas
function buildOpenApiSpec(
    openApiVersion: "3.0" | "3.1",
    config: Record<string, unknown>,
    schemas: Record<string, SchemaValue>,
    pathOperations: ParsedPathOperation[],
    opt: WizPluginContext["opt"]
): Record<string, unknown> {
    const spec: Record<string, unknown> = {
        openapi: openApiVersion === "3.1" ? OPENAPI_VERSION_3_1 : OPENAPI_VERSION_3_0,
        info: config.info || {
            title: "API",
            version: "1.0.0"
        },
        components: {
            schemas
        }
    };
    
    // Add optional fields from config
    if (config.servers) spec.servers = config.servers;
    if (config.security) spec.security = config.security;
    if (config.tags) spec.tags = config.tags;
    if (config.externalDocs) spec.externalDocs = config.externalDocs;
    
    // Add paths
    const availableSchemas = new Set(Object.keys(schemas));
    spec.paths = pathOperations.length > 0 
        ? buildOpenApiPaths(pathOperations, openApiVersion, opt, availableSchemas) 
        : {};
    
    return spec;
}

export function transformOpenApiSchema(sourceFile: SourceFile, { log, path, opt }: WizPluginContext) {
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(call => (call.getExpression()).getText() === createOpenApiSchema.name && call.getTypeArguments().length >= 1);

    if (calls.length === 0) {
        // Still check for createOpenApi calls even if no createOpenApiSchema calls
        transformCreateOpenApi(sourceFile, { log, path, opt });
        return;
    }

    for (const call of calls) {
        log(`Transforming createOpenApiSchema call at ${path}:${call.getStartLineNumber()}:${call.getStartLinePos()}`);
        
        const openApiVersion = extractOpenApiVersion(call, path);
        
        // FIXME guard instead of using non-null assertion
        const typeArg = call.getTypeArguments()[0]!;
        const type = typeArg.getType();
        
        // Only tuple types are supported
        if (!type.isTuple()) {
            throw new Error(`createOpenApiSchema only accepts tuple types. Use createOpenApiSchema<[YourType]>() instead of createOpenApiSchema<YourType>(). Found at ${path}:${call.getStartLineNumber()}`);
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
// Transform createOpenApi calls to generate full OpenAPI spec
export function transformCreateOpenApi(sourceFile: SourceFile, { log, path, opt }: WizPluginContext) {
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(call => (call.getExpression()).getText() === createOpenApi.name && call.getTypeArguments().length >= 1);

    if (calls.length === 0) return;

    for (const call of calls) {
        log(`Transforming createOpenApi call at ${path}:${call.getStartLineNumber()}:${call.getStartLinePos()}`);
        
        const openApiVersion = extractOpenApiVersion(call, path);
        
        // Parse config parameter
        const args = call.getArguments();
        let configObj: Record<string, unknown> = {};
        let pathOperations: ParsedPathOperation[] = [];
        
        if (args.length > 0) {
            const parseResult = parseConfigParameter(args[0], log, path, call.getStartLineNumber());
            configObj = parseResult.config;
            pathOperations = parseResult.pathOperations;
        }
        
        // Get the type argument and validate it's a tuple
        const typeArg = call.getTypeArguments()[0]!;
        const type = typeArg.getType();
        
        if (!type.isTuple()) {
            throw new Error(`createOpenApi only accepts tuple types. Use createOpenApi<[YourType]>() instead of createOpenApi<YourType>(). Found at ${path}:${call.getStartLineNumber()}`);
        }
        
        // Generate component schemas
        const tupleElements = type.getTupleElements();
        const typeNames = collectTypeNames(tupleElements);
        const schemas = generateSchemas(tupleElements, typeNames, openApiVersion, opt);
        
        // Build the full OpenAPI spec
        const openApiSpec = buildOpenApiSpec(openApiVersion, configObj, schemas, pathOperations, opt);
        
        call.replaceWithText(JSON.stringify(openApiSpec, null, 2));
    }
}
