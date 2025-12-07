type PrimitiveSchema = { type: "string" | "number" | "boolean" };

type ArraySchema = { type: "array"; items: OpenApiSchema<any> };

type ObjectSchema = {
    type: "object";
    properties: Record<string, OpenApiSchema<any>>;
    required?: string[];
};

type UnknownSchema = Record<string, unknown>;

export type OpenApiSchema<T> = PrimitiveSchema | ArraySchema | ObjectSchema | UnknownSchema;