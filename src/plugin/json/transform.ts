import { CallExpression, SourceFile, SyntaxKind } from "ts-morph";

import type { WizPluginContext } from "../index";
import { generateSerializerCode, generateParserCode } from "./codegen";

const JSON_FUNCTIONS = ["jsonSerialize", "createJsonSerializer", "jsonParse", "createJsonParser"] as const;

export function transformJson(src: SourceFile, context: WizPluginContext): void {
    const { log } = context;

    // Find all call expressions
    src.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((callExpr: CallExpression) => {
        const expr = callExpr.getExpression();

        // Check if this is one of our JSON functions
        const functionName = expr.getText();
        if (!JSON_FUNCTIONS.includes(functionName as any)) {
            return;
        }

        log(
            `Transforming ${functionName} call at ${src.getFilePath()}:${callExpr.getStartLineNumber()}:${callExpr.getStartLinePos()}`,
        );

        try {
            // Get type argument
            const typeArgs = callExpr.getTypeArguments();
            if (typeArgs.length === 0) {
                throw new Error(`${functionName} requires a type argument`);
            }

            const typeArg = typeArgs[0]!;
            const type = typeArg.getType();

            let replacementCode: string;

            switch (functionName) {
                case "createJsonSerializer": {
                    // createJsonSerializer<T>() - return serializer function
                    replacementCode = generateSerializerCode(type);
                    break;
                }

                case "jsonSerialize": {
                    // jsonSerialize<T>(value) or jsonSerialize<T>(value, buf)
                    const args = callExpr.getArguments();
                    if (args.length === 0) {
                        throw new Error("jsonSerialize requires at least one argument (value)");
                    }

                    const valueCode = args[0]!.getText();
                    const bufCode = args.length > 1 ? args[1]!.getText() : undefined;

                    const serializerFunc = generateSerializerCode(type);
                    if (bufCode) {
                        replacementCode = `${serializerFunc}(${valueCode}, ${bufCode})`;
                    } else {
                        replacementCode = `${serializerFunc}(${valueCode})`;
                    }
                    break;
                }

                case "createJsonParser": {
                    // createJsonParser<T>() - return parser function
                    replacementCode = generateParserCode(type);
                    break;
                }

                case "jsonParse": {
                    // jsonParse<T>(src)
                    const args = callExpr.getArguments();
                    if (args.length === 0) {
                        throw new Error("jsonParse requires one argument (src)");
                    }

                    const srcCode = args[0]!.getText();
                    const parserFunc = generateParserCode(type);
                    replacementCode = `${parserFunc}(${srcCode})`;
                    break;
                }

                default:
                    throw new Error(`Unknown JSON function: ${functionName}`);
            }

            callExpr.replaceWithText(replacementCode);
        } catch (error: any) {
            const message = `Failed to transform ${functionName}: ${error.message}`;
            log(`Error: ${message}`);
            throw new Error(message);
        }
    });
}
