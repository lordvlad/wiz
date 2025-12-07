import { createOpenApiSchema } from "../../openApiSchema/index";
type Type = {
id: number;
name: string;
isActive: boolean;
tags: string[];
metadata: {
createdAt: string;
updatedAt: string;
};
}
export const schema = createOpenApiSchema<Type>();