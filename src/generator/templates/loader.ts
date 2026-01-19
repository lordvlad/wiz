/**
 * Template loader utility
 *
 * Provides dynamic template loading functionality
 */
import { resolve } from "path";

import type { WizTemplate } from "./types";

/**
 * Built-in templates available in wiz
 */
const BUILTIN_TEMPLATES = ["fetch", "react-query"] as const;
type BuiltinTemplate = (typeof BUILTIN_TEMPLATES)[number];

/**
 * Load a template by name or path
 *
 * @param template - Template name (e.g., "fetch", "react-query") or path (relative or absolute)
 * @returns The loaded template function
 *
 * @example
 * // Load built-in template by name
 * const template = await loadTemplate("fetch");
 *
 * @example
 * // Load custom template from relative path (relative to cwd)
 * const template = await loadTemplate("./my-templates/custom.ts");
 *
 * @example
 * // Load custom template from absolute path
 * const template = await loadTemplate("/path/to/template.ts");
 */
export async function loadTemplate(template: string): Promise<WizTemplate> {
    // Check if it's a built-in template (single keyword)
    if (isBuiltinTemplate(template)) {
        return loadBuiltinTemplate(template);
    }

    // Otherwise, treat it as a file path (relative to cwd or absolute)
    return loadCustomTemplate(template);
}

/**
 * Check if the template name is a built-in template
 */
function isBuiltinTemplate(name: string): name is BuiltinTemplate {
    return BUILTIN_TEMPLATES.includes(name as BuiltinTemplate);
}

/**
 * Load a built-in template from wiz/src/generator/templates
 */
async function loadBuiltinTemplate(name: BuiltinTemplate): Promise<WizTemplate> {
    try {
        const templatePath = resolve(__dirname, `./${name}.ts`);
        const module = await import(templatePath);
        return module.default as WizTemplate;
    } catch (error) {
        throw new Error(`Failed to load built-in template "${name}": ${error}`);
    }
}

/**
 * Load a custom template from a file path
 * Path can be relative (to cwd) or absolute
 */
async function loadCustomTemplate(path: string): Promise<WizTemplate> {
    try {
        // Resolve path relative to current working directory
        const templatePath = resolve(process.cwd(), path);
        const module = await import(templatePath);

        if (!module.default || typeof module.default !== "function") {
            throw new Error("Template must export a default function");
        }

        return module.default as WizTemplate;
    } catch (error) {
        throw new Error(`Failed to load custom template from "${path}": ${error}`);
    }
}

/**
 * List available built-in templates
 */
export function listBuiltinTemplates(): readonly string[] {
    return BUILTIN_TEMPLATES;
}
