import { Type, SyntaxKind, type SourceFile } from "ts-morph";
import { createOpenApiSchema as codegen } from "./codegen";
import { createOpenApiSchema, createOpenApi } from "../../openApiSchema/index";
import type { WizPluginContext } from "..";

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
        
        // Extract version from second type parameter (defaults to "3.0" if not provided)
        const typeArgs = call.getTypeArguments();
        let openApiVersion: "3.0" | "3.1" = "3.0"; // default
        
        if (typeArgs.length >= 2) {
            // Second type argument is the version
            const versionTypeArg = typeArgs[1];
            const versionText = versionTypeArg.getText().replace(/['"]/g, '');
            if (versionText !== "3.0" && versionText !== "3.1") {
                throw new Error(`createOpenApiSchema version type parameter must be "3.0" or "3.1". Got: ${versionText}. Found at ${path}:${call.getStartLineNumber()}`);
            }
            openApiVersion = versionText as "3.0" | "3.1";
        }
        
        // FIXME guard instead of using non-null assertion
        const typeArg = call.getTypeArguments()[0]!;
        const type = typeArg.getType();
        
        // Only tuple types are supported
        if (!type.isTuple()) {
            throw new Error(`createOpenApiSchema only accepts tuple types. Use createOpenApiSchema<[YourType]>() instead of createOpenApiSchema<YourType>(). Found at ${path}:${call.getStartLineNumber()}`);
        }
        
        // Generate composite schema with components.schemas
        const tupleElements = type.getTupleElements();
        const schemas: Record<string, SchemaValue> = {};
        const usedNames = new Set<string>();
        
        // First pass: collect all type names
        const typeNames = new Map<Type, string>();
        for (const element of tupleElements) {
            // Get the alias symbol for the type name (User, Product, etc.)
            const aliasSymbol = element.getAliasSymbol();
            let typeName: string | undefined = aliasSymbol?.getName();
            
            // Fallback chain if no alias symbol exists
            if (!typeName) {
                // Try getting the regular symbol name
                const symbol = element.getSymbol();
                typeName = symbol?.getName();
                
                // Last resort: use getText() and clean it up
                if (!typeName || typeName === '__type') {
                    typeName = element.getText();
                    // Clean up the type name if it contains formatting or whitespace
                    typeName = typeName.replace(/\s+/g, '');
                }
            }
            
            // Validate type name is suitable for use as a schema key
            if (!typeName || typeName === '__type') {
                throw new Error(`Unable to determine a valid type name for tuple element: ${element.getText()}`);
            }
            
            // Check for duplicate type names
            if (usedNames.has(typeName)) {
                throw new Error(`Duplicate type name '${typeName}' detected in tuple. Each type in the tuple must have a unique name.`);
            }
            usedNames.add(typeName);
            typeNames.set(element, typeName);
        }
        
        // Second pass: generate schemas with $ref support
        const availableTypes = new Set(usedNames);
        for (const element of tupleElements) {
            const typeName = typeNames.get(element)!;
            
            // Start with an EMPTY processing stack at the root level
            // The codegen function will populate the stack as it processes nested types
            // This allows detection of root level (stack empty) vs nested (stack has entries)
            const processingStack = new Set<string>();
            
            // Get the type alias declaration to extract JSDoc metadata
            const aliasSymbol = element.getAliasSymbol();
            const typeAliasDeclaration = aliasSymbol?.getDeclarations()[0];
            
            // Pass undefined for typeNode to avoid duplicate title generation in codegen.
            // The codegen function adds a 'title' field when typeNode is provided,
            // but for composite schemas we want to control title placement ourselves.
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
            
            // Add title to the schema if not already present
            const schemaObj = schema as SchemaValue;
            if (typeof schemaObj === 'object' && schemaObj !== null && !('title' in schemaObj)) {
                schemaObj.title = typeName;
            }
            
            schemas[typeName] = schemaObj;
        }
        
        const compositeSchema = {
            components: {
                schemas
            }
        };
        
        call.replaceWithText(JSON.stringify(compositeSchema, null, 2));
    }
    
    // Also transform createOpenApi calls
    transformCreateOpenApi(sourceFile, { log, path, opt });
}

// Transform createOpenApi calls to generate full OpenAPI spec
export function transformCreateOpenApi(sourceFile: SourceFile, { log, path, opt }: WizPluginContext) {
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(call => (call.getExpression()).getText() === createOpenApi.name && call.getTypeArguments().length >= 1);

    if (calls.length === 0) return;

    for (const call of calls) {
        log(`Transforming createOpenApi call at ${path}:${call.getStartLineNumber()}:${call.getStartLinePos()}`);
        
        // Extract version from second type parameter (defaults to "3.0" if not provided)
        const typeArgs = call.getTypeArguments();
        let openApiVersion: "3.0" | "3.1" = "3.0"; // default
        
        if (typeArgs.length >= 2) {
            const versionTypeArg = typeArgs[1];
            const versionText = versionTypeArg.getText().replace(/['"]/g, '');
            if (versionText !== "3.0" && versionText !== "3.1") {
                throw new Error(`createOpenApi version type parameter must be "3.0" or "3.1". Got: ${versionText}. Found at ${path}:${call.getStartLineNumber()}`);
            }
            openApiVersion = versionText as "3.0" | "3.1";
        }
        
        // Extract the config parameter if provided
        const args = call.getArguments();
        let configObj: Record<string, unknown> = {};
        let pathOperations: any[] = [];
        
        if (args.length > 0) {
            const configArg = args[0];
            
            // Check if it's an arrow function (callback-based API)
            if (configArg.getKind() === SyntaxKind.ArrowFunction) {
                try {
                    // For arrow function, we need to extract the returned object
                    const arrowFunc = configArg;
                    const body = arrowFunc.getBody();
                    
                    // Handle both block body and expression body
                    let returnedObj: any = null;
                    if (body.getKind() === SyntaxKind.Block) {
                        // Find return statement
                        const returnStmt = body.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0];
                        if (returnStmt) {
                            returnedObj = returnStmt.getExpression();
                        }
                    } else if (body.getKind() === SyntaxKind.ObjectLiteralExpression) {
                        // Direct object return
                        returnedObj = body;
                    } else if (body.getKind() === SyntaxKind.ParenthesizedExpression) {
                        // Parenthesized expression (e.g., (path) => ({ ... }))
                        const inner = body.getExpression();
                        if (inner.getKind() === SyntaxKind.ObjectLiteralExpression) {
                            returnedObj = inner;
                        }
                    }
                    
                    if (returnedObj && returnedObj.getKind() === SyntaxKind.ObjectLiteralExpression) {
                        // Parse properties from the object literal
                        const properties = returnedObj.getProperties();
                        
                        for (const prop of properties) {
                            if (prop.getKind() === SyntaxKind.PropertyAssignment) {
                                const propName = prop.getName();
                                
                                if (propName === 'paths') {
                                    // Extract path operations from the paths array
                                    const initializer = prop.getInitializer();
                                    if (initializer && initializer.getKind() === SyntaxKind.ArrayLiteralExpression) {
                                        const elements = initializer.getElements();
                                        
                                        for (const element of elements) {
                                            // Each element should be a call expression like path.get("/users")
                                            if (element.getKind() === SyntaxKind.CallExpression) {
                                                const callExpr = element;
                                                const expression = callExpr.getExpression();
                                                
                                                // Extract method (get, post, etc.) and path argument
                                                if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
                                                    const propAccess = expression;
                                                    const method = propAccess.getName();
                                                    const args = callExpr.getArguments();
                                                    
                                                    if (args.length > 0) {
                                                        const pathArg = args[0];
                                                        let pathValue = pathArg.getText().replace(/['"]/g, '');
                                                        
                                                        pathOperations.push({
                                                            method,
                                                            path: pathValue
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    // Parse other properties as JSON
                                    const initializer = prop.getInitializer();
                                    if (initializer) {
                                        const propText = initializer.getText();
                                        try {
                                            const jsonText = propText
                                                .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
                                                .replace(/'/g, '"');
                                            configObj[propName] = JSON.parse(jsonText);
                                        } catch (e) {
                                            log(`Warning: Could not parse property ${propName} at ${path}:${call.getStartLineNumber()}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    const error = e as Error;
                    log(`Warning: Could not parse callback parameter at ${path}:${call.getStartLineNumber()}: ${error.message}. Using empty config.`);
                }
            }
            // Check if it's an object literal expression using ts-morph
            else if (configArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
                try {
                    // Parse the object literal safely using JSON
                    const configText = configArg.getText();
                    // Convert JavaScript object notation to JSON by wrapping property names in quotes
                    // This is still a simple approach but safer than Function constructor
                    const jsonText = configText
                        .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
                        .replace(/'/g, '"');
                    configObj = JSON.parse(jsonText);
                } catch (e) {
                    const error = e as Error;
                    log(`Warning: Could not parse config parameter at ${path}:${call.getStartLineNumber()}: ${error.message}. Using empty config.`);
                }
            } else {
                log(`Warning: Config parameter at ${path}:${call.getStartLineNumber()} is not an object literal or arrow function. Using empty config.`);
            }
        }
        
        // Get the type argument
        const typeArg = call.getTypeArguments()[0]!;
        const type = typeArg.getType();
        
        // Only tuple types are supported
        if (!type.isTuple()) {
            throw new Error(`createOpenApi only accepts tuple types. Use createOpenApi<[YourType]>() instead of createOpenApi<YourType>(). Found at ${path}:${call.getStartLineNumber()}`);
        }
        
        // Generate component schemas (same as createOpenApiSchema)
        const tupleElements = type.getTupleElements();
        const schemas: Record<string, SchemaValue> = {};
        const usedNames = new Set<string>();
        
        // First pass: collect all type names
        const typeNames = new Map<Type, string>();
        for (const element of tupleElements) {
            const aliasSymbol = element.getAliasSymbol();
            let typeName: string | undefined = aliasSymbol?.getName();
            
            if (!typeName) {
                const symbol = element.getSymbol();
                typeName = symbol?.getName();
                
                if (!typeName || typeName === '__type') {
                    typeName = element.getText();
                    typeName = typeName.replace(/\s+/g, '');
                }
            }
            
            if (!typeName || typeName === '__type') {
                throw new Error(`Unable to determine a valid type name for tuple element: ${element.getText()}`);
            }
            
            if (usedNames.has(typeName)) {
                throw new Error(`Duplicate type name '${typeName}' detected in tuple. Each type in the tuple must have a unique name.`);
            }
            usedNames.add(typeName);
            typeNames.set(element, typeName);
        }
        
        // Second pass: generate schemas
        const availableTypes = new Set(usedNames);
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
        
        // Build the full OpenAPI spec
        const openApiSpec: Record<string, unknown> = {
            openapi: openApiVersion === "3.1" ? OPENAPI_VERSION_3_1 : OPENAPI_VERSION_3_0,
            info: configObj.info || {
                title: "API",
                version: "1.0.0"
            },
            components: {
                schemas
            }
        };
        
        // Add optional fields from config if they exist
        if (configObj.servers) openApiSpec.servers = configObj.servers;
        if (configObj.security) openApiSpec.security = configObj.security;
        if (configObj.tags) openApiSpec.tags = configObj.tags;
        if (configObj.externalDocs) openApiSpec.externalDocs = configObj.externalDocs;
        
        // Generate paths from path operations if provided
        if (pathOperations.length > 0) {
            const paths: Record<string, any> = {};
            
            for (const operation of pathOperations) {
                const pathKey = operation.path;
                const method = operation.method.toLowerCase();
                
                if (!paths[pathKey]) {
                    paths[pathKey] = {};
                }
                
                // Build operation object
                const operationObj: Record<string, any> = {
                    responses: {
                        "200": {
                            description: "Successful response"
                        }
                    }
                };
                
                // Add parameters if path or query params exist
                // Note: This is a simplified implementation
                // Full implementation would need to parse the types and generate proper parameter schemas
                
                paths[pathKey][method] = operationObj;
            }
            
            openApiSpec.paths = paths;
        } else {
            // Add paths as empty object if no operations provided
            openApiSpec.paths = {};
        }
        
        call.replaceWithText(JSON.stringify(openApiSpec, null, 2));
    }
}