import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "fs/promises";
import { resolve } from "path";

import { bootstrapTemplates } from "../cli/bootstrap";

const tmpDir = resolve(import.meta.dir, ".tmp-bootstrap-test");

describe("CLI bootstrap command", () => {
    beforeEach(async () => {
        await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    it("should bootstrap openapi-client-templates", async () => {
        const outdir = resolve(tmpDir, "templates");

        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await bootstrapTemplates("openapi-client-templates", { outdir });

            // Check that directories were created
            const fetchDir = resolve(outdir, "fetch");
            const reactQueryDir = resolve(outdir, "react-query");

            // Check that files were created
            const fetchReadme = Bun.file(resolve(fetchDir, "README.md"));
            const fetchTemplate = Bun.file(resolve(fetchDir, "template.json"));
            const reactQueryReadme = Bun.file(resolve(reactQueryDir, "README.md"));
            const reactQueryTemplate = Bun.file(resolve(reactQueryDir, "template.json"));

            expect(await fetchReadme.exists()).toBe(true);
            expect(await fetchTemplate.exists()).toBe(true);
            expect(await reactQueryReadme.exists()).toBe(true);
            expect(await reactQueryTemplate.exists()).toBe(true);

            // Check content
            const fetchTemplateContent = await fetchTemplate.json();
            expect(fetchTemplateContent.name).toBe("fetch");
            expect(fetchTemplateContent.generator).toBe("built-in");

            const reactQueryTemplateContent = await reactQueryTemplate.json();
            expect(reactQueryTemplateContent.name).toBe("react-query");
            expect(reactQueryTemplateContent.generator).toBe("built-in");
            expect(reactQueryTemplateContent.dependencies).toContain("@tanstack/react-query");

            expect(output).toContain("✅ Templates bootstrapped");
            expect(output).toContain(outdir);
        } finally {
            console.log = originalLog;
        }
    });

    it("should reject unknown template types", async () => {
        const outdir = resolve(tmpDir, "templates");

        await expect(bootstrapTemplates("unknown-template", { outdir })).rejects.toThrow(
            "Unknown template type: unknown-template",
        );
    });
});
