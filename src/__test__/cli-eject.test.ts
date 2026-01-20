import { describe, expect, it } from "bun:test";

import { ejectTemplate } from "../cli/eject";

describe("CLI eject command", () => {
    it("should eject default (fetch) template", async () => {
        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await ejectTemplate();
            expect(output).toContain("Fetch client template");
            expect(output).toContain("export default function template");
            expect(output).toContain("templateModel");
            expect(output).toContain("templateAPI");
        } finally {
            console.log = originalLog;
        }
    });

    it("should eject fetch template explicitly", async () => {
        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await ejectTemplate({ template: "fetch" });
            expect(output).toContain("Fetch client template");
            expect(output).toContain("export default function template");
        } finally {
            console.log = originalLog;
        }
    });

    it("should eject fetch-wiz-validators template", async () => {
        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await ejectTemplate({ template: "fetch-wiz-validators" });
            expect(output).toContain("Fetch client template with Wiz validator support");
            expect(output).toContain("export default function template");
        } finally {
            console.log = originalLog;
        }
    });

    it("should eject react-query template", async () => {
        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await ejectTemplate({ template: "react-query" });
            expect(output).toContain("React Query client template");
            expect(output).toContain("export default function template");
        } finally {
            console.log = originalLog;
        }
    });

    it("should eject react-query-wiz-validators template", async () => {
        // Capture console output
        let output = "";
        const originalLog = console.log;
        console.log = (...args: any[]) => {
            output += args.join(" ") + "\n";
        };

        try {
            await ejectTemplate({ template: "react-query-wiz-validators" });
            expect(output).toContain("React Query client template with Wiz validator support");
            expect(output).toContain("export default function template");
        } finally {
            console.log = originalLog;
        }
    });

    it("should throw error for invalid template", async () => {
        expect(async () => {
            await ejectTemplate({ template: "invalid" });
        }).toThrow("Invalid template");
    });

    it("should list available templates in error message", async () => {
        try {
            await ejectTemplate({ template: "nonexistent" });
            expect(false).toBe(true); // Should not reach here
        } catch (error: any) {
            expect(error.message).toContain("fetch");
            expect(error.message).toContain("fetch-wiz-validators");
            expect(error.message).toContain("react-query");
            expect(error.message).toContain("react-query-wiz-validators");
        }
    });
});
