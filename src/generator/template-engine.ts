/**
 * Minimal template engine for string interpolation
 * Supports ${variable} syntax for variable replacement
 */

export interface TemplateContext {
    [key: string]: any;
}

/**
 * Simple template engine that replaces ${var} with values from context
 * Supports nested property access like ${obj.prop}
 */
export function render(template: string, context: TemplateContext): string {
    return template.replace(/\$\{([^}]+)\}/g, (match, expr) => {
        const value = evaluateExpression(expr.trim(), context);
        return value === undefined || value === null ? "" : String(value);
    });
}

/**
 * Evaluate a simple expression in the context
 * Supports: variable names, property access (obj.prop)
 */
function evaluateExpression(expr: string, context: TemplateContext): any {
    // Handle simple variable names
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(expr)) {
        return context[expr];
    }

    // Handle property access
    const parts = expr.split(".");
    let value: any = context;

    for (const part of parts) {
        if (value === undefined || value === null) {
            return undefined;
        }
        value = value[part];
    }

    return value;
}
