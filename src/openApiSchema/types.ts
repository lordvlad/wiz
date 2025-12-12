type PrimitiveSchema = { type: "string" | "number" | "boolean" };

type ArraySchema = { type: "array"; items: OpenApiSchema<any> };

type ObjectSchema = {
    type: "object";
    properties: Record<string, OpenApiSchema<any>>;
    required?: string[];
};

type UnknownSchema = Record<string, unknown>;

// Composite schema for multiple types using OpenAPI components structure
type CompositeSchema<T = unknown> = {
    components: {
        schemas: Record<string, ObjectSchema | PrimitiveSchema | ArraySchema | UnknownSchema>;
    };
};

export type OpenApiSchema<T> = PrimitiveSchema | ArraySchema | ObjectSchema | UnknownSchema | CompositeSchema<T>;

// OpenAPI specification types
export type OpenApiInfo = {
    title: string;
    description?: string;
    termsOfService?: string;
    contact?: {
        name?: string;
        url?: string;
        email?: string;
    };
    license?: {
        name: string;
        url?: string;
    };
    version: string;
};

export type OpenApiServer = {
    url: string;
    description?: string;
    variables?: Record<string, {
        default: string;
        enum?: string[];
        description?: string;
    }>;
};

export type OpenApiOAuthFlow = {
    authorizationUrl?: string;
    tokenUrl?: string;
    refreshUrl?: string;
    scopes: Record<string, string>;
};

export type OpenApiOAuthFlows = {
    implicit?: OpenApiOAuthFlow;
    password?: OpenApiOAuthFlow;
    clientCredentials?: OpenApiOAuthFlow;
    authorizationCode?: OpenApiOAuthFlow;
};

export type OpenApiSecurityScheme = {
    type: "apiKey" | "http" | "oauth2" | "openIdConnect";
    description?: string;
    name?: string;
    in?: "query" | "header" | "cookie";
    scheme?: string;
    bearerFormat?: string;
    flows?: OpenApiOAuthFlows;
    openIdConnectUrl?: string;
};

export type OpenApiTag = {
    name: string;
    description?: string;
    externalDocs?: {
        description?: string;
        url: string;
    };
};

export type OpenApiExternalDocs = {
    description?: string;
    url: string;
};

// OpenAPI configuration options (excludes components and paths)
export type OpenApiConfig = {
    info?: OpenApiInfo;
    servers?: OpenApiServer[];
    security?: Record<string, string[]>[];
    tags?: OpenApiTag[];
    externalDocs?: OpenApiExternalDocs;
};

// Full OpenAPI specification
export type OpenApiSpec<T = unknown> = {
    openapi: string;
    info: OpenApiInfo;
    servers?: OpenApiServer[];
    paths?: Record<string, unknown>;
    components?: {
        schemas?: Record<string, ObjectSchema | PrimitiveSchema | ArraySchema | UnknownSchema>;
        securitySchemes?: Record<string, OpenApiSecurityScheme>;
    };
    security?: Record<string, string[]>[];
    tags?: OpenApiTag[];
    externalDocs?: OpenApiExternalDocs;
};