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