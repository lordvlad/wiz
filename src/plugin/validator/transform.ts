import { CallExpression, SourceFile, SyntaxKind } from "ts-morph";
import type { WizPluginContext } from "../index";
import { generateValidatorCode, generateIsCode, generateAssertCode, generateValidateCode } from "./codegen";

const VALIDATOR_FUNCTIONS = [
    "createValidator",
    "validate", 
    "assert",
    "createAssert",
    "createIs",
    "is"
] as const;

export function transformValidator(src: SourceFile, context: WizPluginContext): void {
    const { log } = context;
    
    // Find all call expressions
    src.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((callExpr: CallExpression) => {
        const expr = callExpr.getExpression();
        
        // Check if this is one of our validator functions
        const functionName = expr.getText();
        if (!VALIDATOR_FUNCTIONS.includes(functionName as any)) {
            return;
        }
        
        log(`Transforming ${functionName} call at ${src.getFilePath()}:${callExpr.getStartLineNumber()}:${callExpr.getStartLinePos()}`);
        
        try {
            // Get type argument
            const typeArgs = callExpr.getTypeArguments();
            if (typeArgs.length === 0) {
                throw new Error(`${functionName} requires a type argument`);
            }
            
            const typeArg = typeArgs[0];
            const type = typeArg.getType();
            
            let replacementCode: string;
            
            switch (functionName) {
                case "createValidator":
                    replacementCode = generateValidatorCode(type);
                    break;
                    
                case "validate":
                    // validate<T>(value) - needs to wrap with immediate invocation
                    const validateArg = callExpr.getArguments()[0];
                    if (!validateArg) {
                        throw new Error("validate requires a value argument");
                    }
                    const validateValueCode = validateArg.getText();
                    replacementCode = `${generateValidateCode(type)}(${validateValueCode})`;
                    break;
                    
                case "assert":
                    // assert<T>(value) - needs to wrap with immediate invocation
                    const assertArg = callExpr.getArguments()[0];
                    if (!assertArg) {
                        throw new Error("assert requires a value argument");
                    }
                    const assertValueCode = assertArg.getText();
                    replacementCode = `${generateAssertCode(type, false)}(${assertValueCode})`;
                    break;
                    
                case "createAssert":
                    // createAssert<T>(errorFactory?)
                    const errorFactoryArg = callExpr.getArguments()[0];
                    if (errorFactoryArg) {
                        const errorFactoryCode = errorFactoryArg.getText();
                        replacementCode = `${generateAssertCode(type, true)}(${errorFactoryCode})`;
                    } else {
                        // No error factory - return a function that uses default error
                        replacementCode = generateAssertCode(type, false);
                    }
                    break;
                    
                case "createIs":
                    replacementCode = generateIsCode(type);
                    break;
                    
                case "is":
                    // is<T>(value) - needs to wrap with immediate invocation
                    const isArg = callExpr.getArguments()[0];
                    if (!isArg) {
                        throw new Error("is requires a value argument");
                    }
                    const isValueCode = isArg.getText();
                    replacementCode = `${generateIsCode(type)}(${isValueCode})`;
                    break;
                    
                default:
                    throw new Error(`Unknown validator function: ${functionName}`);
            }
            
            callExpr.replaceWithText(replacementCode);
            
        } catch (error: any) {
            const message = `Failed to transform ${functionName}: ${error.message}`;
            log(`Error: ${message}`);
            throw new Error(message);
        }
    });
}
