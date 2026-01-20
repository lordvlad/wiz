#!/usr/bin/env bun
import { readFile } from "fs/promises";
import { resolve } from "path";

import { listBuiltinTemplates } from "../generator/templates/loader";

interface EjectOptions {
    template?: string;
}

/**
 * Eject (dump) a raw template file to stdout for customization
 */
export async function ejectTemplate(options: EjectOptions = {}): Promise<void> {
    const availableTemplates = listBuiltinTemplates();
    const templateName = options.template || "fetch";

    // Validate template name
    if (!availableTemplates.includes(templateName)) {
        throw new Error(`Invalid template "${templateName}". Must be one of: ${availableTemplates.join(", ")}`);
    }

    // Read the template file from src/generator/templates
    const templatePath = resolve(__dirname, `../generator/templates/${templateName}.ts`);

    try {
        const templateContent = await readFile(templatePath, "utf-8");
        console.log(templateContent);
    } catch (error) {
        throw new Error(
            `Failed to read template file "${templateName}". Valid templates: ${availableTemplates.join(", ")}`,
        );
    }
}
