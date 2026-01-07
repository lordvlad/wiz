import type { OpenAPIV3 } from "openapi-types";

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

// Re-export OpenAPI specification types from openapi-types
export type OpenApiInfo = OpenAPIV3.InfoObject;
export type OpenApiServer = OpenAPIV3.ServerObject;
export type OpenApiSecurityScheme = OpenAPIV3.SecuritySchemeObject;
export type OpenApiTag = OpenAPIV3.TagObject;
export type OpenApiExternalDocs = OpenAPIV3.ExternalDocumentationObject;

// OpenAPI path operation types
export type PathOperation<PathParams = never, QueryParams = never, RequestBody = never, ResponseBody = unknown> = {
    method: "get" | "post" | "put" | "patch" | "delete" | "head" | "options" | "trace";
    path: string;
    pathParams?: PathParams;
    queryParams?: QueryParams;
    requestBody?: RequestBody;
    responseBody?: ResponseBody;
};

// Path builder interface for typed path definitions
export type PathBuilder = {
    get<PathParams = never, QueryParams = never, RequestBody = never, ResponseBody = any>(
        path: string,
    ): PathOperation<PathParams, QueryParams, RequestBody, ResponseBody>;

    post<PathParams = never, QueryParams = never, RequestBody = any, ResponseBody = any>(
        path: string,
    ): PathOperation<PathParams, QueryParams, RequestBody, ResponseBody>;

    put<PathParams = never, QueryParams = never, RequestBody = any, ResponseBody = any>(
        path: string,
    ): PathOperation<PathParams, QueryParams, RequestBody, ResponseBody>;

    patch<PathParams = never, QueryParams = never, RequestBody = any, ResponseBody = any>(
        path: string,
    ): PathOperation<PathParams, QueryParams, RequestBody, ResponseBody>;

    delete<PathParams = never, QueryParams = never, RequestBody = never, ResponseBody = any>(
        path: string,
    ): PathOperation<PathParams, QueryParams, RequestBody, ResponseBody>;

    head<PathParams = never, QueryParams = never, RequestBody = never, ResponseBody = never>(
        path: string,
    ): PathOperation<PathParams, QueryParams, RequestBody, ResponseBody>;

    options<PathParams = never, QueryParams = never, RequestBody = never, ResponseBody = any>(
        path: string,
    ): PathOperation<PathParams, QueryParams, RequestBody, ResponseBody>;

    trace<PathParams = never, QueryParams = never, RequestBody = never, ResponseBody = any>(
        path: string,
    ): PathOperation<PathParams, QueryParams, RequestBody, ResponseBody>;
};

// OpenAPI configuration options (excludes components and paths)
export type OpenApiConfig = {
    info?: OpenApiInfo;
    servers?: OpenApiServer[];
    security?: OpenAPIV3.SecurityRequirementObject[];
    tags?: OpenApiTag[];
    externalDocs?: OpenApiExternalDocs;
};

// OpenAPI configuration with paths support (for callback-based API)
export type OpenApiConfigWithPaths = OpenApiConfig & {
    paths?: PathOperation[];
};

// Full OpenAPI specification (based on OpenAPIV3.Document but with custom components type)
export type OpenApiSpec<T = unknown> = {
    openapi: string;
    info: OpenApiInfo;
    servers?: OpenApiServer[];
    paths?: Record<string, unknown>;
    components?: {
        schemas?: Record<string, ObjectSchema | PrimitiveSchema | ArraySchema | UnknownSchema>;
        securitySchemes?: Record<string, OpenApiSecurityScheme>;
    };
    security?: OpenAPIV3.SecurityRequirementObject[];
    tags?: OpenApiTag[];
    externalDocs?: OpenApiExternalDocs;
};
