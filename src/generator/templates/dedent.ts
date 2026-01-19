/**
 * Dedent utility for template literals
 * Removes leading indentation from multi-line strings
 */

/**
 * Remove common leading whitespace from template literal strings
 * @param strings - Template literal strings
 * @param values - Template literal values
 * @returns Dedented string
 */
export function dedent(strings: TemplateStringsArray, ...values: any[]): string {
    // Interleave strings and values
    let result = strings[0] || "";
    for (let i = 0; i < values.length; i++) {
        result += String(values[i]) + (strings[i + 1] || "");
    }

    // Split into lines
    const lines = result.split("\n");

    // Remove first line if it's empty
    if (lines.length > 0 && lines[0]?.trim() === "") {
        lines.shift();
    }

    // Remove last line if it's empty
    if (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
        lines.pop();
    }

    // Find minimum indentation (ignoring empty lines)
    let minIndent = Infinity;
    for (const line of lines) {
        if (line.trim() === "") continue;
        const match = line.match(/^(\s*)/);
        const indent = match?.[1]?.length ?? 0;
        minIndent = Math.min(minIndent, indent);
    }

    // Remove the common indentation
    if (minIndent !== Infinity && minIndent > 0) {
        return lines.map((line) => (line.trim() === "" ? "" : line.slice(minIndent))).join("\n");
    }

    return lines.join("\n");
}
