
import m from "ts-morph"

/**
 * 
 * @private
 * @param type 
 * @returns 
 */
export function createOpenApiSchema(type: m.Type) : unknown{
    if (type.isString()) {
        return { type: "string" };
    }
    if (type.isNumber()) {
        return { type: "number" };
    }
    if (type.isBoolean()) {
        return { type: "boolean" };
    }
    if (type.isArray()) {
        const elem = type.getArrayElementTypeOrThrow();
        return {
            type: "array",
            items: createOpenApiSchema(elem),
        };
    }
    if (type.isObject() && !type.isArray() && !type.isInterface() && !type.isClass()) {
        const props: Record<string, any> = {};
        type.getProperties().forEach(prop => {
            // FIXME guard instead of using non-null assertion
            const propType = prop.getDeclarations()[0]!.getType();
            props[prop.getName()] = createOpenApiSchema(propType);
        });
        return { type: "object", properties: props };
    }
    // fallback
    return {};
}