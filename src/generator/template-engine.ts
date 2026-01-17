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
 * Use $$ to output a literal $ character
 */
export function render(template: string, context: TemplateContext): string {
    // First, replace $$ with a placeholder
    const placeholder = "\x00DOLLAR\x00";
    const withPlaceholder = template.replace(/\$\$/g, placeholder);

    // Then perform variable substitution
    const result = withPlaceholder.replace(/\$\{([^}]+)\}/g, (match, expr) => {
        const value = evaluateExpression(expr.trim(), context);
        return value === undefined || value === null ? "" : String(value);
    });

    // Finally, restore the literal $ characters
    return result.replace(new RegExp(placeholder, "g"), "$");
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
